import { teamName } from "./i18n";
import { matchWinnerSide, validRealScores } from "./matchLogic";

/** Fields needed from `matches` rows for W/L resolution. */
export type MatchForBracket = {
  number: number;
  team1Id: number | null;
  team2Id: number | null;
  team1Label?: string | null;
  team2Label?: string | null;
  team1Score: number | null;
  team2Score: number | null;
  team1PenScore?: number | null;
  team2PenScore?: number | null;
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
  teamCodeToId: Map<string, number>;
  /** Group letter → team codes in table order (best first). */
  groupTeamOrder: Map<string, string[]>;
  /**
   * Groups that still have at least one group-stage match not closed or without final scores.
   * While a group is pending, 1X/2X display shows "TeamName (1X)" so users know the slot is provisional.
   */
  groupsWithPendingMatches: Set<string>;
  /** True while any group-stage match is still open — keeps `3X` wildcards in predictions. */
  groupStagePending: boolean;
  /** When Annex C is resolved: group-winner letter (A–L) → third-place team code for that R32 slot. */
  thirdPlaceTeamByWinnerGroup: Map<string, string> | null;
  /** Parallel map: winner group letter → third-place group letter (for `3D` suffix). */
  thirdPlaceGroupByWinnerGroup: Map<string, string> | null;
};

/** Team id for a slot: DB id, or resolve seed label (1F, W74, …) when R32 rows have null ids. */
function teamIdForSide(
  m: MatchForBracket,
  side: "team1" | "team2",
  ctx: BracketLabelContext
): number | null {
  const direct = side === "team1" ? m.team1Id : m.team2Id;
  if (direct != null) return direct;
  const label = side === "team1" ? m.team1Label : m.team2Label;
  const code = resolveBracketTeamCode(label, ctx);
  if (!code) return null;
  return ctx.teamCodeToId.get(code) ?? null;
}

function winnerTeamId(m: MatchForBracket, ctx: BracketLabelContext): number | null {
  const side = matchWinnerSide(m);
  if (!side) return null;
  return teamIdForSide(m, side, ctx);
}

function loserTeamId(m: MatchForBracket, ctx: BracketLabelContext): number | null {
  if (!validRealScores(m.team1Score, m.team2Score)) return null;
  const side = matchWinnerSide(m);
  if (!side) return null;
  return teamIdForSide(m, side === "team1" ? "team2" : "team1", ctx);
}

function winnerGroupFromLabel(label: string | null | undefined): string | null {
  const m = label?.trim().match(/^1([A-L])$/i);
  return m ? m[1]!.toUpperCase() : null;
}

function resolveThirdPoolTeamCode(
  poolLabel: string | null | undefined,
  otherLabel: string | null | undefined,
  ctx: BracketLabelContext
): string | null {
  if (!poolLabel || !ctx.thirdPlaceTeamByWinnerGroup?.size) return null;
  const winner = winnerGroupFromLabel(otherLabel);
  if (!winner) return null;
  return ctx.thirdPlaceTeamByWinnerGroup.get(winner) ?? null;
}

/** Provisional third-place label for match rows, e.g. `United States (3D)`. */
export function formatThirdPlacePreview(
  thirdGroup: string,
  teamCode: string,
  ctx: BracketLabelContext
): string {
  if (!ctx.groupStagePending) return teamName(teamCode);
  return formatThirdPlaceSlotDisplay(thirdGroup, teamCode);
}

/** Annex C / best-thirds: always show FIFA slot wildcards — ranking among thirds can still change. */
export function formatGroupWinnerSlotDisplay(groupLetter: string, ctx: BracketLabelContext): string {
  const g = groupLetter.toUpperCase();
  const code = ctx.groupTeamOrder.get(g)?.[0];
  if (!code) return `1${g}`;
  return `${teamName(code)} (1${g})`;
}

export function formatThirdPlaceSlotDisplay(thirdGroup: string, teamCode: string): string {
  return `${teamName(teamCode)} (3${thirdGroup.toUpperCase()})`;
}

export function formatAnnexMatchupPreview(
  thirdGroup: string,
  teamCode: string,
  winnerGroup: string,
  ctx: BracketLabelContext
): string {
  const third = formatThirdPlaceSlotDisplay(thirdGroup, teamCode);
  const rival = formatGroupWinnerSlotDisplay(winnerGroup, ctx);
  return `${rival} vs ${third}`;
}

export function groupWinnerTeamCode(groupLetter: string, ctx: BracketLabelContext): string | null {
  return ctx.groupTeamOrder.get(groupLetter.toUpperCase())?.[0] ?? null;
}

function resolveThirdPoolDisplay(
  poolLabel: string | null | undefined,
  otherLabel: string | null | undefined,
  ctx: BracketLabelContext
): string | null {
  const winner = winnerGroupFromLabel(otherLabel);
  const code =
    winner && ctx.thirdPlaceTeamByWinnerGroup?.size
      ? ctx.thirdPlaceTeamByWinnerGroup.get(winner)
      : undefined;
  if (code) {
    const thirdGroup = winner ? ctx.thirdPlaceGroupByWinnerGroup?.get(winner) : undefined;
    if (thirdGroup && ctx.groupStagePending) {
      return formatThirdPlacePreview(thirdGroup, code, ctx);
    }
    return teamName(code);
  }
  const trimmed = poolLabel?.trim();
  if (!trimmed) return null;
  const thirdPool = trimmed.match(/^3([A-L]+)$/i);
  if (thirdPool) return thirdPlacePoolDescription(thirdPool[1]);
  return null;
}
/**
 * Resolve knockout seed labels (W74, L101, 1A, 2B, 3ABCDF) to a display string when possible.
 * Pass `otherSideLabel` when resolving a `3…` pool (the `1X` on the opposite side).
 */
export function resolveBracketLabel(
  label: string | null | undefined,
  ctx: BracketLabelContext,
  otherSideLabel?: string | null
): string | null {
  if (label == null || label === "") return null;
  const trimmed = label.trim();

  const w = trimmed.match(/^W(\d+)$/i);
  if (w) {
    const num = Number(w[1]);
    const m = ctx.matchByNumber.get(num);
    if (!m) return null;
    const wid = winnerTeamId(m, ctx);
    if (wid == null) return null;
    const t = ctx.teamById.get(wid);
    return t ? teamName(t.code) : null;
  }

  const l = trimmed.match(/^L(\d+)$/i);
  if (l) {
    const num = Number(l[1]);
    const m = ctx.matchByNumber.get(num);
    if (!m) return null;
    const lid = loserTeamId(m, ctx);
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
    return resolveThirdPoolDisplay(trimmed, otherSideLabel, ctx);
  }

  return null;
}

/**
 * Same rules as {@link resolveBracketLabel}, but returns the team `code` for flags
 * (e.g. from W74 / 1A / 2B). Third-place pools (`3…`) need `otherSideLabel` (`1X`).
 */
export function resolveBracketTeamCode(
  label: string | null | undefined,
  ctx: BracketLabelContext,
  otherSideLabel?: string | null
): string | null {
  if (label == null || label === "") return null;
  const trimmed = label.trim();

  const w = trimmed.match(/^W(\d+)$/i);
  if (w) {
    const num = Number(w[1]);
    const m = ctx.matchByNumber.get(num);
    if (!m) return null;
    const wid = winnerTeamId(m, ctx);
    if (wid == null) return null;
    return ctx.teamById.get(wid)?.code ?? null;
  }

  const l = trimmed.match(/^L(\d+)$/i);
  if (l) {
    const num = Number(l[1]);
    const m = ctx.matchByNumber.get(num);
    if (!m) return null;
    const lid = loserTeamId(m, ctx);
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
  if (thirdPool) {
    return resolveThirdPoolTeamCode(trimmed, otherSideLabel, ctx);
  }

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
    team1FlagCode: t1c ?? resolveBracketTeamCode(m.team1Label, ctx, m.team2Label),
    team2FlagCode: t2c ?? resolveBracketTeamCode(m.team2Label, ctx, m.team1Label),
  };
}

export type BuildBracketLabelContextOpts = {
  groupsWithPendingMatches?: Set<string>;
  groupStagePending?: boolean;
  thirdPlaceTeamByWinnerGroup?: Map<string, string> | null;
  thirdPlaceGroupByWinnerGroup?: Map<string, string> | null;
};

export function buildBracketLabelContext(
  matches: MatchForBracket[],
  teams: TeamForBracket[],
  groupStandings: GroupStandingsRow[],
  opts?: BuildBracketLabelContextOpts
): BracketLabelContext {
  const matchByNumber = new Map(matches.map((m) => [m.number, m]));
  const teamById = new Map(teams.map((t) => [t.id, { code: t.code }]));
  const teamCodeToId = new Map(teams.map((t) => [t.code, t.id]));
  const groupTeamOrder = new Map(groupStandings.map((g) => [g.code, g.teams.map((r) => r.code)]));
  const groupsWithPendingMatches = opts?.groupsWithPendingMatches ?? new Set<string>();
  const groupStagePending = opts?.groupStagePending ?? groupsWithPendingMatches.size > 0;
  const thirdPlaceTeamByWinnerGroup = opts?.thirdPlaceTeamByWinnerGroup ?? null;
  const thirdPlaceGroupByWinnerGroup = opts?.thirdPlaceGroupByWinnerGroup ?? null;
  return {
    matchByNumber,
    teamById,
    teamCodeToId,
    groupTeamOrder,
    groupsWithPendingMatches,
    groupStagePending,
    thirdPlaceTeamByWinnerGroup,
    thirdPlaceGroupByWinnerGroup,
  };
}
