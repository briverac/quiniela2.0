import { teamName } from "./i18n";
import { validRealScores, team1Win, team2Win } from "./matchLogic";

/** Fields needed from `matches` rows for W/L resolution. */
export type MatchForBracket = {
  number: number;
  team1Id: number | null;
  team2Id: number | null;
  team1Score: number | null;
  team2Score: number | null;
};

export type TeamForBracket = { id: number; code: string };

export type GroupStandingsRow = { code: string; teams: { code: string }[] };

/** Human-readable label for FIFA "3ABCDF" third-place pool slots (exact team needs the official combination table). */
export function thirdPlacePoolDescription(letters: string): string {
  const chars = [...letters.toUpperCase()].filter((c) => c >= "A" && c <= "L");
  const uniq = [...new Set(chars)].sort();
  if (!uniq.length) return letters;
  if (uniq.length === 1) return `3rd place — Group ${uniq[0]}`;
  const listed = uniq.join(", ");
  return `3rd-place qualifier (${listed})`;
}

export type BracketLabelContext = {
  matchByNumber: Map<number, MatchForBracket>;
  teamById: Map<number, { code: string }>;
  /** Group letter → team codes in table order (best first). */
  groupTeamOrder: Map<string, string[]>;
  /**
   * Groups that still have at least one group-stage match not closed or without final scores.
   * While a group is pending, 1X/2X display shows "TeamName (1X)" so users know the slot is provisional.
   */
  groupsWithPendingMatches: Set<string>;
};

function winnerTeamId(m: MatchForBracket): number | null {
  if (!validRealScores(m.team1Score, m.team2Score)) return null;
  const s1 = m.team1Score!;
  const s2 = m.team2Score!;
  if (team1Win(s1, s2)) return m.team1Id;
  if (team2Win(s1, s2)) return m.team2Id;
  return null;
}

function loserTeamId(m: MatchForBracket): number | null {
  if (!validRealScores(m.team1Score, m.team2Score)) return null;
  const s1 = m.team1Score!;
  const s2 = m.team2Score!;
  if (team1Win(s1, s2)) return m.team2Id;
  if (team2Win(s1, s2)) return m.team1Id;
  return null;
}

/**
 * Resolve knockout seed labels (W74, L101, 1A, 2B, 3ABCDF) to a display string when possible.
 * Returns null to keep the raw DB label (e.g. W90 before match 90 has a result).
 */
export function resolveBracketLabel(label: string | null | undefined, ctx: BracketLabelContext): string | null {
  if (label == null || label === "") return null;
  const trimmed = label.trim();

  const w = trimmed.match(/^W(\d+)$/i);
  if (w) {
    const num = Number(w[1]);
    const m = ctx.matchByNumber.get(num);
    if (!m) return null;
    const wid = winnerTeamId(m);
    if (wid == null) return null;
    const t = ctx.teamById.get(wid);
    return t ? teamName(t.code) : null;
  }

  const l = trimmed.match(/^L(\d+)$/i);
  if (l) {
    const num = Number(l[1]);
    const m = ctx.matchByNumber.get(num);
    if (!m) return null;
    const lid = loserTeamId(m);
    if (lid == null) return null;
    const t = ctx.teamById.get(lid);
    return t ? teamName(t.code) : null;
  }

  const first = trimmed.match(/^1([A-L])$/i);
  if (first) {
    const g = first[1].toUpperCase();
    const order = ctx.groupTeamOrder.get(g);
    const code = order?.[0];
    if (!code) return null;
    const name = teamName(code);
    if (ctx.groupsWithPendingMatches.has(g)) return `${name} (${trimmed})`;
    return name;
  }

  const second = trimmed.match(/^2([A-L])$/i);
  if (second) {
    const g = second[1].toUpperCase();
    const order = ctx.groupTeamOrder.get(g);
    const code = order?.[1];
    if (!code) return null;
    const name = teamName(code);
    if (ctx.groupsWithPendingMatches.has(g)) return `${name} (${trimmed})`;
    return name;
  }

  const thirdPool = trimmed.match(/^3([A-L]+)$/i);
  if (thirdPool) {
    return thirdPlacePoolDescription(thirdPool[1]);
  }

  return null;
}

/**
 * Same rules as {@link resolveBracketLabel}, but returns the team `code` for flags
 * (e.g. from W74 / 1A / 2B). Third-place pools (`3…`) have no single team → null.
 */
export function resolveBracketTeamCode(label: string | null | undefined, ctx: BracketLabelContext): string | null {
  if (label == null || label === "") return null;
  const trimmed = label.trim();

  const w = trimmed.match(/^W(\d+)$/i);
  if (w) {
    const num = Number(w[1]);
    const m = ctx.matchByNumber.get(num);
    if (!m) return null;
    const wid = winnerTeamId(m);
    if (wid == null) return null;
    return ctx.teamById.get(wid)?.code ?? null;
  }

  const l = trimmed.match(/^L(\d+)$/i);
  if (l) {
    const num = Number(l[1]);
    const m = ctx.matchByNumber.get(num);
    if (!m) return null;
    const lid = loserTeamId(m);
    if (lid == null) return null;
    return ctx.teamById.get(lid)?.code ?? null;
  }

  const first = trimmed.match(/^1([A-L])$/i);
  if (first) {
    const g = first[1].toUpperCase();
    const order = ctx.groupTeamOrder.get(g);
    return order?.[0] ?? null;
  }

  const second = trimmed.match(/^2([A-L])$/i);
  if (second) {
    const g = second[1].toUpperCase();
    const order = ctx.groupTeamOrder.get(g);
    return order?.[1] ?? null;
  }

  const thirdPool = trimmed.match(/^3([A-L]+)$/i);
  if (thirdPool) return null;

  return null;
}

export function matchTeamFlagCodes(
  m: {
    team1Id: number | null;
    team2Id: number | null;
    team1Label: string | null;
    team2Label: string | null;
  },
  teamById: Map<number, { code: string }>,
  ctx: BracketLabelContext
): { team1FlagCode: string | null; team2FlagCode: string | null } {
  const t1c = m.team1Id ? (teamById.get(m.team1Id)?.code ?? null) : null;
  const t2c = m.team2Id ? (teamById.get(m.team2Id)?.code ?? null) : null;
  return {
    team1FlagCode: t1c ?? resolveBracketTeamCode(m.team1Label, ctx),
    team2FlagCode: t2c ?? resolveBracketTeamCode(m.team2Label, ctx),
  };
}

export type BuildBracketLabelContextOpts = {
  groupsWithPendingMatches?: Set<string>;
};

export function buildBracketLabelContext(
  matches: MatchForBracket[],
  teams: TeamForBracket[],
  groupStandings: GroupStandingsRow[],
  opts?: BuildBracketLabelContextOpts
): BracketLabelContext {
  const matchByNumber = new Map(matches.map((m) => [m.number, m]));
  const teamById = new Map(teams.map((t) => [t.id, { code: t.code }]));
  const groupTeamOrder = new Map(groupStandings.map((g) => [g.code, g.teams.map((r) => r.code)]));
  const groupsWithPendingMatches = opts?.groupsWithPendingMatches ?? new Set<string>();
  return { matchByNumber, teamById, groupTeamOrder, groupsWithPendingMatches };
}
