import { Hono } from "hono";
import type { Context } from "hono";
import { eq, and, asc, inArray, count } from "drizzle-orm";
import { Google, generateCodeVerifier, generateState } from "arctic";
import { getDb } from "./db/drizzle";
import * as schema from "./db/schema";
import type { HonoEnv, UserRow } from "./types";
import {
  clearSessionCookie,
  createSession,
  deleteSession,
  getUserFromSessionCookie,
  setSessionCookie,
} from "./session";
import {
  ensurePredictionSet,
  getTournamentIdByCode,
  processMatchPoints,
  buildStatsByMatchNumber,
  positionBoard,
  groupStandings,
  gatherBracketLabelPack,
  fetchPlayerPredictionSet,
} from "./services/domain";
import {
  matchClosed,
  tie,
  validateMatchScoresInput,
  validPredictionScores,
  validRealScores,
} from "./lib/matchLogic";
import { teamName, phaseName, tournamentName } from "./lib/i18n";
import { resolveBracketLabel, matchTeamFlagCodes } from "./lib/bracketLabels";
import { defaultWc26ThirdTeam2Label } from "./lib/wc26ThirdSlotDefaults";
import { rankBestThirdPlaceTeams } from "./lib/bestThirdPlace";
import { buildThirdPlaceTeamByWinner } from "./lib/thirdPlaceAnnexC";

const CA = "WC26";

function tournamentNotFound(c: Context<HonoEnv>, code: string) {
  return c.json(
    {
      error: "Tournament not found",
      code,
      hint:
        "Run D1 migrations (npm run db:migrate:local). If the DB was seeded with CA24 before WC26, migration 0003_wc26_reseed.sql clears tournament id=1 and reloads the fixture.",
    },
    404
  );
}

function googleClient(c: { req: { url: string } }, env: HonoEnv["Bindings"]) {
  const origin = new URL(c.req.url).origin;
  return new Google(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, `${origin}/api/auth/google/callback`);
}

function adminEmails(env: HonoEnv["Bindings"]): Set<string> {
  const s = env.ADMIN_EMAILS ?? "";
  return new Set(
    s
      .split(",")
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean)
  );
}

const app = new Hono<HonoEnv>();

function isSecureCookies(c: Context<HonoEnv>) {
  const h = new URL(c.req.url).hostname;
  return h !== "localhost" && h !== "127.0.0.1";
}

app.use("*", async (c, next) => {
  const db = getDb(c.env.DB);
  c.set("db", db);
  const user = await getUserFromSessionCookie(db, c.req.header("Cookie"));
  c.set("user", user);
  await next();
});

app.get("/api/health", (c) => c.json({ ok: true }));

/** --- Google OAuth --- */
app.get("/api/auth/google", async (c) => {
  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const url = googleClient(c, c.env).createAuthorizationURL(state, codeVerifier, [
    "openid",
    "email",
    "profile",
  ]);
  const maxAge = 600;
  const sec = isSecureCookies(c) ? "Secure; " : "";
  const ck = [
    `oauth_state=${encodeURIComponent(state)}; Path=/api/auth; HttpOnly; ${sec}SameSite=Lax; Max-Age=${maxAge}`,
    `oauth_verifier=${encodeURIComponent(codeVerifier)}; Path=/api/auth; HttpOnly; ${sec}SameSite=Lax; Max-Age=${maxAge}`,
  ];
  for (const line of ck) {
    c.header("Set-Cookie", line, { append: true });
  }
  return c.redirect(url.toString(), 302);
});

app.get("/api/auth/google/callback", async (c) => {
  const db = c.var.db;
  const code = c.req.query("code");
  const state = c.req.query("state");
  const err = c.req.query("error");
  if (err) return c.redirect(`/?error=${encodeURIComponent(err)}`, 302);
  if (!code || !state) return c.redirect("/?error=oauth", 302);

  const cookies = parseCookies(c.req.header("Cookie"));
  if (state !== cookies.oauth_state || !cookies.oauth_verifier) {
    return c.redirect("/?error=state", 302);
  }

  let tokens;
  try {
    tokens = await googleClient(c, c.env).validateAuthorizationCode(code, cookies.oauth_verifier);
  } catch {
    return c.redirect("/?error=token", 302);
  }

  const access = tokens.accessToken();
  const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${access}` },
  });
  if (!res.ok) return c.redirect("/?error=userinfo", 302);
  const info = (await res.json()) as {
    sub: string;
    email: string;
    name?: string;
    picture?: string;
  };

  const now = new Date().toISOString();
  const admins = adminEmails(c.env);
  const isAdmin = admins.has(info.email.toLowerCase());

  const existing = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, info.email))
    .limit(1);
  let user: UserRow;
  if (existing[0]) {
    if (!existing[0].active) return c.redirect("/?error=inactive", 302);
    await db
      .update(schema.users)
      .set({
        provider: "google",
        uid: info.sub,
        name: info.name ?? existing[0].name,
        picture: info.picture ?? existing[0].picture,
        image: info.picture ?? existing[0].image,
        admin: isAdmin || existing[0].admin,
        updatedAt: now,
      })
      .where(eq(schema.users.id, existing[0].id));
    const u2 = await db.select().from(schema.users).where(eq(schema.users.id, existing[0].id)).limit(1);
    user = u2[0]!;
  } else {
    await db.insert(schema.users).values({
      email: info.email,
      provider: "google",
      uid: info.sub,
      name: info.name ?? null,
      picture: info.picture ?? null,
      image: info.picture ?? null,
      active: true,
      admin: isAdmin,
      createdAt: now,
      updatedAt: now,
    });
    const u2 = await db.select().from(schema.users).where(eq(schema.users.email, info.email)).limit(1);
    user = u2[0]!;
  }

  const tid = await getTournamentIdByCode(db, CA);
  if (tid) await ensurePredictionSet(db, user.id, tid);

  const sid = await createSession(db, user.id);
  const sec = isSecureCookies(c) ? "Secure; " : "";
  const clearOauth = [
    `oauth_state=; Path=/api/auth; HttpOnly; ${sec}SameSite=Lax; Max-Age=0`,
    `oauth_verifier=; Path=/api/auth; HttpOnly; ${sec}SameSite=Lax; Max-Age=0`,
  ];
  for (const line of clearOauth) {
    c.header("Set-Cookie", line, { append: true });
  }
  c.header("Set-Cookie", setSessionCookie(sid, isSecureCookies(c)), { append: true });
  return c.redirect("/predictions", 302);
});

app.post("/api/auth/logout", async (c) => {
  const db = c.var.db;
  const cookies = parseCookies(c.req.header("Cookie"));
  const sid = cookies.quiniela_session;
  if (sid) await deleteSession(db, decodeURIComponent(sid));
  c.header("Set-Cookie", clearSessionCookie(isSecureCookies(c)));
  return c.json({ ok: true });
});

function parseCookies(h: string | undefined): Record<string, string> {
  const o: Record<string, string> = {};
  if (!h) return o;
  for (const part of h.split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    o[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return o;
}

/** --- Me & bootstrap --- */
app.get("/api/me", (c) => {
  const u = c.var.user;
  if (!u) return c.json({ user: null });
  return c.json({
    user: {
      id: u.id,
      email: u.email,
      name: u.name,
      picture: u.picture ?? u.image,
      admin: u.admin,
    },
  });
});

app.get("/api/tournaments/:code/bootstrap", async (c) => {
  const code = c.req.param("code");
  const db = c.var.db;
  const pack = await gatherBracketLabelPack(db, code);
  if (!pack) return tournamentNotFound(c, code);

  const { phases, teams, matchRows, phaseById, bracketCtx, teamById } = pack;

  const matches = matchRows
    .map((m) => {
      const t1 = m.team1Id ? teamById.get(m.team1Id) : undefined;
      const t2 = m.team2Id ? teamById.get(m.team2Id) : undefined;
      const ph = phaseById.get(m.phaseId);
      const fc = matchTeamFlagCodes(m, teamById, bracketCtx);
      return {
        id: m.id,
        number: m.number,
        date: m.date,
        phaseId: m.phaseId,
        phaseCode: ph?.code,
        phaseName: ph ? phaseName(ph.code) : "",
        team1Id: m.team1Id,
        team2Id: m.team2Id,
        team1Code: t1?.code ?? null,
        team2Code: t2?.code ?? null,
        team1FlagCode: fc.team1FlagCode,
        team2FlagCode: fc.team2FlagCode,
        team1Name: t1 ? teamName(t1.code) : resolveBracketLabel(m.team1Label, bracketCtx, m.team2Label) ?? m.team1Label,
        team2Name: t2 ? teamName(t2.code) : resolveBracketLabel(m.team2Label, bracketCtx, m.team1Label) ?? m.team2Label,
        team1Label: m.team1Label,
        team2Label: m.team2Label,
        team1Score: m.team1Score,
        team2Score: m.team2Score,
        team1PenScore: m.team1PenScore,
        team2PenScore: m.team2PenScore,
        phaseLevel: ph?.level ?? 1,
        isClosed: m.isClosed,
        closed: matchClosed(m),
        ready: m.ready,
      };
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return c.json({
    data: {
      tournament: { code, name: tournamentName },
      phases: phases.map((p) => ({
        id: p.id,
        code: p.code,
        name: phaseName(p.code),
        level: p.level,
        smallPoints: p.smallPoints,
        bigPoints: p.bigPoints,
        active: p.active,
      })),
      teams: teams.map((t) => ({
        id: t.id,
        code: t.code,
        name: teamName(t.code),
        group: t.group,
      })),
      matches,
    },
  });
});

/** --- Predictions (auth) --- */
app.get("/api/predictions", async (c) => {
  const u = c.var.user;
  if (!u?.active) return c.json({ error: "Unauthorized" }, 401);
  const db = c.var.db;
  const tid = await getTournamentIdByCode(db, CA);
  if (!tid) return tournamentNotFound(c, CA);
  await ensurePredictionSet(db, u.id, tid);

  const setRows = await db
    .select()
    .from(schema.predictionSets)
    .where(and(eq(schema.predictionSets.userId, u.id), eq(schema.predictionSets.tournamentId, tid)))
    .limit(1);
  const set = setRows[0];
  if (!set) return c.json({ error: "No prediction set" }, 500);

  const preds = await db
    .select({
      id: schema.predictions.id,
      matchId: schema.predictions.matchId,
      score1: schema.predictions.score1,
      score2: schema.predictions.score2,
      points: schema.predictions.points,
    })
    .from(schema.predictions)
    .where(eq(schema.predictions.predictionSetId, set.id));

  const stats = await buildStatsByMatchNumber(db);
  return c.json({
    data: {
      predictionSet: { id: set.id, points: set.points },
      predictions: preds,
      statsByMatchNumber: stats,
    },
  });
});

app.get("/api/predictions/:id", async (c) => {
  const u = c.var.user;
  if (!u?.active) return c.json({ error: "Unauthorized" }, 401);
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ error: "Not found" }, 404);

  const data = await fetchPlayerPredictionSet(c.var.db, id, CA);
  if (!data) return c.json({ error: "Not found" }, 404);
  return c.json({ data });
});

app.put("/api/predictions", async (c) => {
  const u = c.var.user;
  if (!u?.active) return c.json({ error: "Unauthorized" }, 401);
  const body = await c.req.json<{ items?: { predictionId: number; score1: number; score2: number }[] }>();
  const items = body.items ?? [];
  const db = c.var.db;
  const tid = await getTournamentIdByCode(db, CA);
  if (!tid) return tournamentNotFound(c, CA);

  const setRows = await db
    .select()
    .from(schema.predictionSets)
    .where(and(eq(schema.predictionSets.userId, u.id), eq(schema.predictionSets.tournamentId, tid)))
    .limit(1);
  const set = setRows[0];
  if (!set) return c.json({ error: "No prediction set" }, 404);

  const now = new Date().toISOString();
  for (const it of items) {
    const prow = await db
      .select()
      .from(schema.predictions)
      .where(and(eq(schema.predictions.id, it.predictionId), eq(schema.predictions.predictionSetId, set.id)))
      .limit(1);
    const p = prow[0];
    if (!p) continue;
    const mrows = await db.select().from(schema.matches).where(eq(schema.matches.id, p.matchId)).limit(1);
    const m = mrows[0];
    if (!m) continue;
    if (matchClosed(m)) continue;
    if (it.score1 < 0 || it.score1 > 99 || it.score2 < 0 || it.score2 > 99) continue;
    await db
      .update(schema.predictions)
      .set({ score1: it.score1, score2: it.score2, updatedAt: now })
      .where(eq(schema.predictions.id, p.id));
  }
  return c.json({ ok: true });
});

/** --- Stats one match --- */
app.get("/api/matches/:id/stats", async (c) => {
  const u = c.var.user;
  if (!u?.active) return c.json({ error: "Unauthorized" }, 401);
  const id = Number(c.req.param("id"));
  const db = c.var.db;
  const mrows = await db.select().from(schema.matches).where(eq(schema.matches.id, id)).limit(1);
  const m = mrows[0];
  if (!m) return c.json({ error: "Not found" }, 404);
  const preds = await db
    .select({ score1: schema.predictions.score1, score2: schema.predictions.score2 })
    .from(schema.predictions)
    .where(eq(schema.predictions.matchId, id));
  const valid = preds.filter((p) => validPredictionScores(p.score1, p.score2));
  if (!valid.length) {
    return c.json({ data: { team1: 0, team2: 0, tie: 0 } });
  }
  let w1 = 0,
    w2 = 0,
    t = 0;
  for (const p of valid) {
    if (p.score1! > p.score2!) w1++;
    else if (p.score2! > p.score1!) w2++;
    else t++;
  }
  const n = valid.length;
  return c.json({
    data: {
      team1: (w1 / n) * 100,
      team2: (w2 / n) * 100,
      tie: (t / n) * 100,
    },
  });
});

/** --- Groups --- */
app.get("/api/groups/standings", async (c) => {
  const u = c.var.user;
  if (!u?.active) return c.json({ error: "Unauthorized" }, 401);
  const data = await groupStandings(c.var.db, CA);
  return c.json({
    data: data.map((g) => ({
      code: g.code,
      teams: g.teams.map((t) => ({
        ...t,
        name: teamName(t.code),
      })),
    })),
  });
});

app.get("/api/groups/best-thirds", async (c) => {
  const u = c.var.user;
  if (!u?.active) return c.json({ error: "Unauthorized" }, 401);
  const groups = await groupStandings(c.var.db, CA);
  const ranked = rankBestThirdPlaceTeams(groups);
  const qualified = ranked.filter((r) => r.qualified);
  const annexBuilt =
    qualified.length === 8 ? buildThirdPlaceTeamByWinner(groups, qualified.map((q) => q.groupCode)) : null;

  return c.json({
    data: ranked.map((t) => ({
      ...t,
      name: teamName(t.code),
      r32Opponent: annexBuilt
        ? (() => {
            for (const [winner, thirdGroup] of Object.entries(annexBuilt.byWinner)) {
              if (thirdGroup === t.groupCode) return `1${winner}`;
            }
            return null;
          })()
        : null,
    })),
    annex: annexBuilt
      ? {
          combinationKey: annexBuilt.annex.combinationKey,
          slots: annexBuilt.annex.slots.map((s) => {
            const stand = groups.find((g) => g.code === s.thirdGroup);
            const third = stand?.teams[2];
            return {
              matchNumber: s.matchNumber,
              winnerGroup: s.winnerGroup,
              thirdGroup: s.thirdGroup,
              opponentLabel: `1${s.winnerGroup}`,
              thirdTeamCode: third?.code ?? null,
              thirdTeamName: third ? teamName(third.code) : null,
            };
          }),
        }
      : null,
  });
});

/** --- Leaderboards --- */
app.get("/api/leaderboards", async (c) => {
  const u = c.var.user;
  if (!u?.active) return c.json({ error: "Unauthorized" }, 401);
  const db = c.var.db;
  const general = await positionBoard(db, {});
  const mine = await db
    .select({ id: schema.leaderboards.id, name: schema.leaderboards.name, code: schema.leaderboards.code })
    .from(schema.leaderboards)
    .innerJoin(
      schema.leaderboardsUsers,
      eq(schema.leaderboards.id, schema.leaderboardsUsers.leaderboardId)
    )
    .where(eq(schema.leaderboardsUsers.userId, u.id));

  const boards = await Promise.all(
    mine.map(async (lb) => ({
      ...lb,
      positions: await positionBoard(db, { leaderboardId: lb.id }),
    }))
  );

  return c.json({ data: { general, boards } });
});

app.post("/api/leaderboards", async (c) => {
  const u = c.var.user;
  if (!u?.active) return c.json({ error: "Unauthorized" }, 401);
  const body = await c.req.json<{ name?: string; private?: boolean }>();
  const name = (body.name ?? "").trim();
  if (name.length < 3 || name.length > 40) return c.json({ error: "Name must be 3-40 characters" }, 400);
  const db = c.var.db;
  const dup = await db.select().from(schema.leaderboards).where(eq(schema.leaderboards.name, name)).limit(1);
  if (dup[0]) return c.json({ error: "Name taken" }, 400);
  const now = new Date().toISOString();
  const code = crypto.randomUUID();
  await db.insert(schema.leaderboards).values({
    name,
    code,
    ownerId: u.id,
    active: true,
    private: body.private !== false,
    createdAt: now,
    updatedAt: now,
  });
  const row = await db.select().from(schema.leaderboards).where(eq(schema.leaderboards.name, name)).limit(1);
  const lb = row[0]!;
  await db.insert(schema.leaderboardsUsers).values({ leaderboardId: lb.id, userId: u.id });
  return c.json({ data: lb });
});

app.put("/api/leaderboards/:id", async (c) => {
  const u = c.var.user;
  if (!u?.active) return c.json({ error: "Unauthorized" }, 401);
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ name?: string; private?: boolean }>();
  const db = c.var.db;
  const lb = await db.select().from(schema.leaderboards).where(eq(schema.leaderboards.id, id)).limit(1);
  if (!lb[0]) return c.json({ error: "Not found" }, 404);
  if (lb[0].ownerId !== u.id) return c.json({ error: "Forbidden" }, 403);
  const now = new Date().toISOString();
  await db
    .update(schema.leaderboards)
    .set({
      name: body.name?.trim() ?? lb[0].name,
      private: body.private ?? lb[0].private,
      updatedAt: now,
    })
    .where(eq(schema.leaderboards.id, id));
  return c.json({ ok: true });
});

app.post("/api/leaderboards/:id/leave", async (c) => {
  const u = c.var.user;
  if (!u?.active) return c.json({ error: "Unauthorized" }, 401);
  const id = Number(c.req.param("id"));
  const db = c.var.db;
  const lb = await db.select().from(schema.leaderboards).where(eq(schema.leaderboards.id, id)).limit(1);
  if (!lb[0]) return c.json({ error: "Not found" }, 404);
  if (lb[0].ownerId === u.id) {
    return c.json({ error: "Owners cannot leave their own league" }, 400);
  }
  await db
    .delete(schema.leaderboardsUsers)
    .where(and(eq(schema.leaderboardsUsers.leaderboardId, id), eq(schema.leaderboardsUsers.userId, u.id)));
  return c.json({ ok: true });
});

app.post("/api/leaderboards/:id/members/remove", async (c) => {
  const u = c.var.user;
  if (!u?.active) return c.json({ error: "Unauthorized" }, 401);
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ userIds?: number[] }>();
  const db = c.var.db;
  const lb = await db.select().from(schema.leaderboards).where(eq(schema.leaderboards.id, id)).limit(1);
  if (!lb[0] || lb[0].ownerId !== u.id) return c.json({ error: "Forbidden" }, 403);
  const ids = (body.userIds ?? []).filter((uid) => uid !== u.id);
  for (const uid of ids) {
    await db
      .delete(schema.leaderboardsUsers)
      .where(and(eq(schema.leaderboardsUsers.leaderboardId, id), eq(schema.leaderboardsUsers.userId, uid)));
  }
  return c.json({ ok: true });
});

app.get("/api/leaderboards/manage", async (c) => {
  const u = c.var.user;
  if (!u?.active) return c.json({ error: "Unauthorized" }, 401);
  const db = c.var.db;
  const owned = await db.select().from(schema.leaderboards).where(eq(schema.leaderboards.ownerId, u.id));
  const lbIds = owned.map((o) => o.id);
  let countByLb = new Map<number, number>();
  if (lbIds.length) {
    const rows = await db
      .select({
        leaderboardId: schema.leaderboardsUsers.leaderboardId,
        n: count(),
      })
      .from(schema.leaderboardsUsers)
      .where(inArray(schema.leaderboardsUsers.leaderboardId, lbIds))
      .groupBy(schema.leaderboardsUsers.leaderboardId);
    countByLb = new Map(rows.map((r) => [r.leaderboardId, r.n]));
  }
  const invs = await db
    .select({
      id: schema.invitations.id,
      leaderboardId: schema.invitations.leaderboardId,
      leaderboardName: schema.leaderboards.name,
    })
    .from(schema.invitations)
    .innerJoin(schema.leaderboards, eq(schema.invitations.leaderboardId, schema.leaderboards.id))
    .where(eq(schema.invitations.userId, u.id));

  const memberRows = await db
    .select({ leaderboardId: schema.leaderboardsUsers.leaderboardId })
    .from(schema.leaderboardsUsers)
    .where(eq(schema.leaderboardsUsers.userId, u.id));
  const ownedIds = new Set(owned.map((o) => o.id));
  const memberOnlyIds = [...new Set(memberRows.map((r) => r.leaderboardId))].filter((id) => !ownedIds.has(id));
  let memberOf: { id: number; name: string }[] = [];
  if (memberOnlyIds.length) {
    const boards = await db
      .select({ id: schema.leaderboards.id, name: schema.leaderboards.name })
      .from(schema.leaderboards)
      .where(inArray(schema.leaderboards.id, memberOnlyIds));
    memberOf = boards.map((b) => ({ id: b.id, name: b.name }));
  }

  return c.json({
    data: {
      owned: owned.map((o) => ({
        id: o.id,
        name: o.name,
        code: o.code,
        private: o.private,
        memberCount: countByLb.get(o.id) ?? 0,
      })),
      memberOf,
      invitations: invs,
    },
  });
});

app.get("/api/leaderboards/:id/members", async (c) => {
  const u = c.var.user;
  if (!u?.active) return c.json({ error: "Unauthorized" }, 401);
  const id = Number(c.req.param("id"));
  const db = c.var.db;
  const lb = await db.select().from(schema.leaderboards).where(eq(schema.leaderboards.id, id)).limit(1);
  if (!lb[0] || lb[0].ownerId !== u.id) return c.json({ error: "Forbidden" }, 403);
  const ownerId = lb[0].ownerId;
  const mids = await db
    .select({ userId: schema.leaderboardsUsers.userId })
    .from(schema.leaderboardsUsers)
    .where(eq(schema.leaderboardsUsers.leaderboardId, id));
  let memberUserIds = mids.map((m) => m.userId);
  if (!memberUserIds.includes(ownerId)) {
    await db.insert(schema.leaderboardsUsers).values({ leaderboardId: id, userId: ownerId });
    memberUserIds = [...memberUserIds, ownerId];
  }
  if (!memberUserIds.length) return c.json({ data: [], ownerId });
  const users = await db
    .select({ id: schema.users.id, name: schema.users.name, email: schema.users.email })
    .from(schema.users)
    .where(inArray(schema.users.id, memberUserIds));
  users.sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email));
  return c.json({ data: users, ownerId });
});

app.get("/api/leaderboards/:id/invite-candidates", async (c) => {
  const u = c.var.user;
  if (!u?.active) return c.json({ error: "Unauthorized" }, 401);
  const id = Number(c.req.param("id"));
  const db = c.var.db;
  const lb = await db.select().from(schema.leaderboards).where(eq(schema.leaderboards.id, id)).limit(1);
  if (!lb[0] || lb[0].ownerId !== u.id) return c.json({ error: "Forbidden" }, 403);

  const members = await db
    .select({ userId: schema.leaderboardsUsers.userId })
    .from(schema.leaderboardsUsers)
    .where(eq(schema.leaderboardsUsers.leaderboardId, id));
  const memberIds = new Set(members.map((m) => m.userId));

  const pending = await db
    .select({ userId: schema.invitations.userId })
    .from(schema.invitations)
    .where(eq(schema.invitations.leaderboardId, id));
  const pendingIds = new Set(pending.map((p) => p.userId));

  const all = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.active, true))
    .orderBy(asc(schema.users.name), asc(schema.users.email));

  const candidates = all
    .filter((x) => !memberIds.has(x.id) && !pendingIds.has(x.id) && x.id !== u.id)
    .map((x) => ({ id: x.id, name: x.name, email: x.email }));
  return c.json({ data: candidates });
});

/** Pending invites for this leaderboard (owner only): people invited but not yet accepted. */
app.get("/api/leaderboards/:id/sent-invitations", async (c) => {
  const u = c.var.user;
  if (!u?.active) return c.json({ error: "Unauthorized" }, 401);
  const id = Number(c.req.param("id"));
  const db = c.var.db;
  const lb = await db.select().from(schema.leaderboards).where(eq(schema.leaderboards.id, id)).limit(1);
  if (!lb[0] || lb[0].ownerId !== u.id) return c.json({ error: "Forbidden" }, 403);
  const invs = await db
    .select({
      id: schema.invitations.id,
      userId: schema.invitations.userId,
      createdAt: schema.invitations.createdAt,
    })
    .from(schema.invitations)
    .where(eq(schema.invitations.leaderboardId, id));
  if (!invs.length) return c.json({ data: [] });
  const userIds = [...new Set(invs.map((i) => i.userId))];
  const users = await db
    .select({ id: schema.users.id, name: schema.users.name, email: schema.users.email })
    .from(schema.users)
    .where(inArray(schema.users.id, userIds));
  const byUser = new Map(users.map((row) => [row.id, row]));
  return c.json({
    data: invs.map((inv) => ({
      id: inv.id,
      createdAt: inv.createdAt,
      user: byUser.get(inv.userId) ?? { id: inv.userId, name: null, email: "?" },
    })),
  });
});

app.post("/api/leaderboards/:id/invitations", async (c) => {
  const u = c.var.user;
  if (!u?.active) return c.json({ error: "Unauthorized" }, 401);
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ userId?: number }>();
  const targetId = body.userId;
  if (targetId == null) return c.json({ error: "userId required" }, 400);
  const db = c.var.db;
  const lb = await db.select().from(schema.leaderboards).where(eq(schema.leaderboards.id, id)).limit(1);
  if (!lb[0] || lb[0].ownerId !== u.id) return c.json({ error: "Forbidden" }, 403);
  const dup = await db
    .select()
    .from(schema.invitations)
    .where(and(eq(schema.invitations.leaderboardId, id), eq(schema.invitations.userId, targetId)))
    .limit(1);
  if (dup[0]) return c.json({ error: "Already invited" }, 400);
  const now = new Date().toISOString();
  await db.insert(schema.invitations).values({
    leaderboardId: id,
    userId: targetId,
    createdAt: now,
    updatedAt: now,
  });
  return c.json({ ok: true });
});

app.post("/api/invitations/:id/accept", async (c) => {
  const u = c.var.user;
  if (!u?.active) return c.json({ error: "Unauthorized" }, 401);
  const id = Number(c.req.param("id"));
  const db = c.var.db;
  const inv = await db.select().from(schema.invitations).where(eq(schema.invitations.id, id)).limit(1);
  if (!inv[0] || inv[0].userId !== u.id) return c.json({ error: "Not found" }, 404);
  await db.insert(schema.leaderboardsUsers).values({
    leaderboardId: inv[0].leaderboardId,
    userId: u.id,
  });
  await db.delete(schema.invitations).where(eq(schema.invitations.id, id));
  return c.json({ ok: true });
});

app.post("/api/invitations/:id/reject", async (c) => {
  const u = c.var.user;
  if (!u?.active) return c.json({ error: "Unauthorized" }, 401);
  const id = Number(c.req.param("id"));
  const db = c.var.db;
  const inv = await db.select().from(schema.invitations).where(eq(schema.invitations.id, id)).limit(1);
  if (!inv[0] || inv[0].userId !== u.id) return c.json({ error: "Not found" }, 404);
  await db.delete(schema.invitations).where(eq(schema.invitations.id, id));
  return c.json({ ok: true });
});

/** --- Admin --- */
async function requireAdmin(c: Context<HonoEnv>) {
  const u = c.var.user;
  if (!u?.active) return c.json({ error: "Unauthorized" }, 401);
  if (!u.admin) return c.json({ error: "Forbidden" }, 403);
  return null;
}

app.get("/api/admin/matches", async (c) => {
  const err = await requireAdmin(c);
  if (err) return err;
  const db = c.var.db;
  const pack = await gatherBracketLabelPack(db, CA);
  if (!pack) return tournamentNotFound(c, CA);
  const { matchRows, teamById, bracketCtx, phaseById } = pack;
  return c.json({
    data: matchRows.map((m) => {
      const ph = phaseById.get(m.phaseId);
      return {
        ...m,
        phaseLevel: ph?.level ?? 1,
        team1Code: m.team1Id ? teamById.get(m.team1Id)?.code : null,
        team2Code: m.team2Id ? teamById.get(m.team2Id)?.code : null,
        ...matchTeamFlagCodes(m, teamById, bracketCtx),
        defaultThirdTeam2Label: defaultWc26ThirdTeam2Label(m.number),
        closed: matchClosed(m),
      };
    }),
  });
});

app.put("/api/admin/matches/:id", async (c) => {
  const err = await requireAdmin(c);
  if (err) return err;
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{
    team1Score?: number | null;
    team2Score?: number | null;
    team1PenScore?: number | null;
    team2PenScore?: number | null;
    team1Id?: number | null;
    team2Id?: number | null;
    team1Label?: string | null;
    team2Label?: string | null;
    ready?: boolean;
  }>();
  const db = c.var.db;
  const mrows = await db.select().from(schema.matches).where(eq(schema.matches.id, id)).limit(1);
  if (!mrows[0]) return c.json({ error: "Not found" }, 404);
  const mrow = mrows[0];
  const phRows = await db
    .select({ level: schema.phases.level })
    .from(schema.phases)
    .where(eq(schema.phases.id, mrow.phaseId))
    .limit(1);
  const phaseLevel = phRows[0]?.level ?? 1;

  let team1Score = body.team1Score !== undefined ? body.team1Score : mrow.team1Score;
  let team2Score = body.team2Score !== undefined ? body.team2Score : mrow.team2Score;
  let team1PenScore = body.team1PenScore !== undefined ? body.team1PenScore : mrow.team1PenScore;
  let team2PenScore = body.team2PenScore !== undefined ? body.team2PenScore : mrow.team2PenScore;

  const scoreFieldsTouched =
    body.team1Score !== undefined ||
    body.team2Score !== undefined ||
    body.team1PenScore !== undefined ||
    body.team2PenScore !== undefined;

  if (scoreFieldsTouched) {
    if (team1Score == null || team2Score == null) {
      team1PenScore = null;
      team2PenScore = null;
    } else if (!tie(team1Score, team2Score)) {
      team1PenScore = null;
      team2PenScore = null;
    }
    const errMsg = validateMatchScoresInput({
      team1Score,
      team2Score,
      team1PenScore,
      team2PenScore,
      phaseLevel,
    });
    if (errMsg) return c.json({ error: errMsg }, 400);
  }

  const now = new Date().toISOString();
  await db
    .update(schema.matches)
    .set({
      team1Score,
      team2Score,
      team1PenScore,
      team2PenScore,
      team1Id: body.team1Id !== undefined ? body.team1Id : mrow.team1Id,
      team2Id: body.team2Id !== undefined ? body.team2Id : mrow.team2Id,
      team1Label: body.team1Label !== undefined ? body.team1Label : mrow.team1Label,
      team2Label: body.team2Label !== undefined ? body.team2Label : mrow.team2Label,
      ready: body.ready ?? mrow.ready,
      updatedAt: now,
    })
    .where(eq(schema.matches.id, id));
  return c.json({ ok: true });
});

app.post("/api/admin/matches/:id/recalculate-points", async (c) => {
  const err = await requireAdmin(c);
  if (err) return err;
  const id = Number(c.req.param("id"));
  await processMatchPoints(c.var.db, id);
  return c.json({ ok: true });
});

app.post("/api/admin/matches/:id/toggle-lock", async (c) => {
  const err = await requireAdmin(c);
  if (err) return err;
  const id = Number(c.req.param("id"));
  const db = c.var.db;
  const mrows = await db.select().from(schema.matches).where(eq(schema.matches.id, id)).limit(1);
  if (!mrows[0]) return c.json({ error: "Not found" }, 404);
  const now = new Date().toISOString();
  await db
    .update(schema.matches)
    .set({ isClosed: !mrows[0].isClosed, updatedAt: now })
    .where(eq(schema.matches.id, id));
  return c.json({ ok: true });
});

app.get("/api/admin/users", async (c) => {
  const err = await requireAdmin(c);
  if (err) return err;
  const rows = await c.var.db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      active: schema.users.active,
      admin: schema.users.admin,
    })
    .from(schema.users)
    .orderBy(asc(schema.users.name), asc(schema.users.email));
  return c.json({ data: rows });
});

app.put("/api/admin/users/:id", async (c) => {
  const err = await requireAdmin(c);
  if (err) return err;
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ admin?: boolean; active?: boolean; name?: string }>();
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { updatedAt: now };
  if (body.admin !== undefined) patch.admin = body.admin;
  if (body.active !== undefined) patch.active = body.active;
  if (body.name !== undefined) patch.name = body.name;
  await c.var.db.update(schema.users).set(patch as typeof schema.users.$inferInsert).where(eq(schema.users.id, id));
  return c.json({ ok: true });
});

app.get("/api/admin/leaderboards", async (c) => {
  const err = await requireAdmin(c);
  if (err) return err;
  const rows = await c.var.db.select().from(schema.leaderboards).orderBy(asc(schema.leaderboards.name));
  return c.json({ data: rows });
});

app.put("/api/admin/leaderboards/:id", async (c) => {
  const err = await requireAdmin(c);
  if (err) return err;
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ active?: boolean; private?: boolean }>();
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { updatedAt: now };
  if (body.active !== undefined) patch.active = body.active;
  if (body.private !== undefined) patch.private = body.private;
  await c.var.db
    .update(schema.leaderboards)
    .set(patch as typeof schema.leaderboards.$inferInsert)
    .where(eq(schema.leaderboards.id, id));
  return c.json({ ok: true });
});

app.delete("/api/admin/leaderboards/:id", async (c) => {
  const err = await requireAdmin(c);
  if (err) return err;
  const id = Number(c.req.param("id"));
  await c.var.db.delete(schema.leaderboards).where(eq(schema.leaderboards.id, id));
  return c.json({ ok: true });
});

/** Unknown /api/* — return JSON 404 (non-API routes are handled by assets + SPA, see wrangler `run_worker_first`). */
app.notFound((c) => c.json({ error: "Not found" }, 404));

export default app;
