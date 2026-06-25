import type { GroupStandingRow } from "./groupStandingsSort";

/** FIFA WC26: eight best third-placed teams (cross-group, all group matches). */
export type ThirdPlaceCandidate = {
  groupCode: string;
  code: string;
  points: number;
  goalDifference: number;
  goalInFavor: number;
  goalAgainst: number;
  matchesPlayed: number;
  win: number;
  draw: number;
  lost: number;
};

export function compareBestThirdPlace(a: ThirdPlaceCandidate, b: ThirdPlaceCandidate): number {
  if (a.points !== b.points) return b.points - a.points;
  if (a.goalDifference !== b.goalDifference) return b.goalDifference - a.goalDifference;
  if (a.goalInFavor !== b.goalInFavor) return b.goalInFavor - a.goalInFavor;
  return a.code.localeCompare(b.code);
}

export function extractThirdPlaceCandidates(
  groups: { code: string; teams: GroupStandingRow[] }[]
): ThirdPlaceCandidate[] {
  const out: ThirdPlaceCandidate[] = [];
  for (const g of groups) {
    if (g.teams.length < 3) continue;
    const t = g.teams[2]!;
    out.push({
      groupCode: g.code,
      code: t.code,
      points: t.points,
      goalDifference: t.goalDifference,
      goalInFavor: t.goalInFavor,
      goalAgainst: t.goalAgainst,
      matchesPlayed: t.matchesPlayed,
      win: t.win,
      draw: t.draw,
      lost: t.lost,
    });
  }
  return out;
}

export type RankedThirdPlace = ThirdPlaceCandidate & {
  rank: number;
  qualified: boolean;
};

/** Top 8 advance to the Round of 32. Fair play and FIFA ranking are not modeled. */
export function rankBestThirdPlaceTeams(
  groups: { code: string; teams: GroupStandingRow[] }[]
): RankedThirdPlace[] {
  const sorted = [...extractThirdPlaceCandidates(groups)].sort(compareBestThirdPlace);
  return sorted.map((t, i) => ({
    ...t,
    rank: i + 1,
    qualified: i < 8,
  }));
}
