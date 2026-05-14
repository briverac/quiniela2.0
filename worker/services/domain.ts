import { eq, and, inArray } from "drizzle-orm";
import type { Db } from "../db/drizzle";
import * as schema from "../db/schema";
import { calculatePredictionPoints, sumPredictionPoints } from "../lib/points";
import { matchClosed, validRealScores } from "../lib/matchLogic";

const TOURNAMENT_CODE = "WC26";

export async function getTournamentIdByCode(db: Db, code: string): Promise<number | null> {
  const row = await db
    .select({ id: schema.tournaments.id })
    .from(schema.tournaments)
    .where(eq(schema.tournaments.code, code))
    .limit(1);
  return row[0]?.id ?? null;
}

export async function ensurePredictionSet(db: Db, userId: number, tournamentId: number) {
  const now = new Date().toISOString();
  let rows = await db
    .select()
    .from(schema.predictionSets)
    .where(
      and(
        eq(schema.predictionSets.userId, userId),
        eq(schema.predictionSets.tournamentId, tournamentId)
      )
    )
    .limit(1);
  let set = rows[0];
  if (!set) {
    await db.insert(schema.predictionSets).values({
      userId,
      tournamentId,
      points: 0,
      createdAt: now,
      updatedAt: now,
    });
    rows = await db
      .select()
      .from(schema.predictionSets)
      .where(
        and(
          eq(schema.predictionSets.userId, userId),
          eq(schema.predictionSets.tournamentId, tournamentId)
        )
      )
      .limit(1);
    set = rows[0];
  }
  if (!set) throw new Error("prediction set");
  const allMatches = await db
    .select({ id: schema.matches.id })
    .from(schema.matches)
    .where(eq(schema.matches.tournamentId, tournamentId));
  const existing = await db
    .select({ matchId: schema.predictions.matchId })
    .from(schema.predictions)
    .where(eq(schema.predictions.predictionSetId, set.id));
  const have = new Set(existing.map((e) => e.matchId));
  for (const m of allMatches) {
    if (have.has(m.id)) continue;
    await db.insert(schema.predictions).values({
      predictionSetId: set.id,
      matchId: m.id,
      score1: null,
      score2: null,
      points: null,
      createdAt: now,
      updatedAt: now,
    });
  }
  return set;
}

export async function processMatchPoints(db: Db, matchId: number) {
  const mrows = await db
    .select()
    .from(schema.matches)
    .where(eq(schema.matches.id, matchId))
    .limit(1);
  const matchRow = mrows[0];
  if (!matchRow) return;
  const ph = await db
    .select()
    .from(schema.phases)
    .where(eq(schema.phases.id, matchRow.phaseId))
    .limit(1);
  const phaseRow = ph[0];
  if (!phaseRow) return;
  if (!validRealScores(matchRow.team1Score, matchRow.team2Score)) return;

  const preds = await db
    .select()
    .from(schema.predictions)
    .where(eq(schema.predictions.matchId, matchId));

  const phase = {
    smallPoints: phaseRow.smallPoints,
    bigPoints: phaseRow.bigPoints,
  };

  const now = new Date().toISOString();
  for (const p of preds) {
    const pts = calculatePredictionPoints(
      { id: p.id, score1: p.score1, score2: p.score2 },
      {
        id: matchRow.id,
        team1Score: matchRow.team1Score,
        team2Score: matchRow.team2Score,
        isClosed: matchRow.isClosed,
        date: matchRow.date,
      },
      phase
    );
    await db
      .update(schema.predictions)
      .set({ points: pts, updatedAt: now })
      .where(eq(schema.predictions.id, p.id));
  }

  const tid = await getTournamentIdByCode(db, TOURNAMENT_CODE);
  if (!tid) return;

  const sets = await db
    .select()
    .from(schema.predictionSets)
    .where(eq(schema.predictionSets.tournamentId, tid));

  for (const s of sets) {
    const pr = await db
      .select()
      .from(schema.predictions)
      .where(eq(schema.predictions.predictionSetId, s.id));
    const total = sumPredictionPoints(pr.map((x) => ({ points: x.points })));
    await db
      .update(schema.predictionSets)
      .set({ points: total, updatedAt: now })
      .where(eq(schema.predictionSets.id, s.id));
  }

  await db
    .update(schema.matches)
    .set({ ready: true, updatedAt: now })
    .where(eq(schema.matches.id, matchId));
}

export async function buildStatsByMatchNumber(db: Db): Promise<
  Record<
    number,
    {
      team1: number;
      team2: number;
      tie: number;
    }
  >
> {
  const tid = await getTournamentIdByCode(db, TOURNAMENT_CODE);
  if (!tid) return {};
  const rows = await db
    .select({
      number: schema.matches.number,
      score1: schema.predictions.score1,
      score2: schema.predictions.score2,
    })
    .from(schema.predictions)
    .innerJoin(schema.matches, eq(schema.predictions.matchId, schema.matches.id))
    .where(eq(schema.matches.tournamentId, tid));

  const byNumber = new Map<number, { w1: number; w2: number; tie: number; n: number }>();
  for (const r of rows) {
    if (r.score1 == null || r.score2 == null) continue;
    let b = byNumber.get(r.number);
    if (!b) {
      b = { w1: 0, w2: 0, tie: 0, n: 0 };
      byNumber.set(r.number, b);
    }
    b.n++;
    if (r.score1 > r.score2) b.w1++;
    else if (r.score2 > r.score1) b.w2++;
    else b.tie++;
  }
  const out: Record<number, { team1: number; team2: number; tie: number }> = {};
  for (const [num, b] of byNumber) {
    if (b.n === 0) {
      out[num] = { team1: 0, team2: 0, tie: 0 };
    } else {
      out[num] = {
        team1: (b.w1 / b.n) * 100,
        team2: (b.w2 / b.n) * 100,
        tie: (b.tie / b.n) * 100,
      };
    }
  }
  return out;
}

export async function positionBoard(
  db: Db,
  opts: { leaderboardId?: number } = {}
): Promise<
  {
    name: string | null;
    picture: string | null;
    points: number;
    index: number;
  }[]
> {
  const tid = await getTournamentIdByCode(db, TOURNAMENT_CODE);
  if (!tid) return [];

  let userIds: number[] = [];
  if (opts.leaderboardId != null) {
    const members = await db
      .select({ userId: schema.leaderboardsUsers.userId })
      .from(schema.leaderboardsUsers)
      .where(eq(schema.leaderboardsUsers.leaderboardId, opts.leaderboardId));
    const mids = members.map((m) => m.userId);
    if (!mids.length) return [];
    const users = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(and(inArray(schema.users.id, mids), eq(schema.users.active, true)));
    userIds = users.map((u) => u.id);
  } else {
    const users = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.active, true));
    userIds = users.map((u) => u.id);
  }

  if (!userIds.length) return [];

  const sets = await db
    .select()
    .from(schema.predictionSets)
    .where(and(eq(schema.predictionSets.tournamentId, tid), inArray(schema.predictionSets.userId, userIds)));

  const validSets: (typeof schema.predictionSets.$inferSelect & { preds: typeof schema.predictions.$inferSelect[] })[] =
    [];
  for (const s of sets) {
    const preds = await db
      .select()
      .from(schema.predictions)
      .where(eq(schema.predictions.predictionSetId, s.id));
    if (preds.some((p) => p.score1 != null && p.score2 != null)) {
      validSets.push({ ...s, preds });
    }
  }

  const orderPoints = [...new Set(validSets.map((s) => s.points))].sort((a, b) => b - a);

  const withUsers = await Promise.all(
    validSets.map(async (s) => {
      const urows = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, s.userId))
        .limit(1);
      const u = urows[0];
      return {
        name: u?.name ?? u?.email ?? "",
        picture: u?.picture ?? u?.image ?? null,
        points: s.points,
        index: orderPoints.indexOf(s.points) + 1,
      };
    })
  );

  return withUsers.sort((a, b) => {
    if (a.index !== b.index) return a.index - b.index;
    return (a.name ?? "").toLowerCase().localeCompare((b.name ?? "").toLowerCase());
  });
}

/** Group standings — ported from Rails Groups/Group (phase level 1 only) */
export async function groupStandings(db: Db, tournamentCode: string = TOURNAMENT_CODE) {
  const tid = await getTournamentIdByCode(db, tournamentCode);
  if (!tid) return [];

  const phaseRows = await db
    .select({ id: schema.phases.id })
    .from(schema.phases)
    .where(and(eq(schema.phases.tournamentId, tid), eq(schema.phases.level, 1)));

  const phaseIds = phaseRows.map((p) => p.id);
  if (!phaseIds.length) return [];

  const teams = await db
    .select()
    .from(schema.teams)
    .where(eq(schema.teams.tournamentId, tid));

  const allMatches = await db
    .select()
    .from(schema.matches)
    .where(and(eq(schema.matches.tournamentId, tid), inArray(schema.matches.phaseId, phaseIds)));

  const groupCodes = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];
  const result: {
    code: string;
    teams: ReturnType<typeof sortGroupTeams>;
  }[] = [];

  for (const code of groupCodes) {
    const groupTeams = teams.filter((t) => t.group === code);
    const rows = groupTeams.map((team) => {
      let mp = 0,
        gf = 0,
        ga = 0,
        pts = 0,
        w = 0,
        d = 0,
        l = 0;
      for (const home of allMatches) {
        if (home.team1Id !== team.id) continue;
        if (!matchClosed(home)) continue;
        if (!validRealScores(home.team1Score, home.team2Score)) continue;
        const ms1 = home.team1Score!;
        const ms2 = home.team2Score!;
        mp++;
        gf += ms1;
        ga += ms2;
        if (ms1 === ms2) {
          pts += 1;
          d++;
        } else if (ms1 > ms2) {
          pts += 3;
          w++;
        } else {
          l++;
        }
      }
      for (const visit of allMatches) {
        if (visit.team2Id !== team.id) continue;
        if (!matchClosed(visit)) continue;
        if (!validRealScores(visit.team1Score, visit.team2Score)) continue;
        const ms1 = visit.team1Score!;
        const ms2 = visit.team2Score!;
        mp++;
        ga += ms1;
        gf += ms2;
        if (ms1 === ms2) {
          pts += 1;
          d++;
        } else if (ms2 > ms1) {
          pts += 3;
          w++;
        } else {
          l++;
        }
      }
      return {
        code: team.code,
        matchesPlayed: mp,
        win: w,
        draw: d,
        lost: l,
        goalInFavor: gf,
        goalAgainst: ga,
        goalDifference: gf - ga,
        points: pts,
      };
    });
    result.push({ code, teams: sortGroupTeams(rows) });
  }
  return result;
}

function sortGroupTeams(
  rows: {
    code: string;
    matchesPlayed: number;
    win: number;
    draw: number;
    lost: number;
    goalInFavor: number;
    goalAgainst: number;
    goalDifference: number;
    points: number;
  }[]
) {
  return [...rows].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
    return b.goalInFavor - a.goalInFavor;
  });
}
