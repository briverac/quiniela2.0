import { ANNEX_C_ROWS, ANNEX_C_WINNERS } from "./thirdPlaceAnnexC.data";

/** R32 matches with a third-place pool on team2 and group-winner on team1. */
export const WINNER_GROUP_BY_MATCH: Record<number, string> = {
  74: "E",
  77: "I",
  79: "A",
  80: "L",
  81: "D",
  82: "G",
  85: "B",
  87: "K",
};

export type ThirdPlaceSlotAssignment = {
  winnerGroup: string;
  thirdGroup: string;
  matchNumber: number;
};

export type AnnexCLookupResult = {
  /** Sorted 8 group letters whose thirds qualified, e.g. "CDEFGIKL". */
  combinationKey: string;
  /** Winner group letter → third-place group letter. */
  byWinner: Record<string, string>;
  /** Flat list with R32 match numbers. */
  slots: ThirdPlaceSlotAssignment[];
};

const annexCByKey = new Map<string, Record<string, string>>();

for (const row of ANNEX_C_ROWS) {
  const letters = [...row];
  const key = [...letters].sort().join("");
  const byWinner: Record<string, string> = {};
  for (let i = 0; i < ANNEX_C_WINNERS.length; i++) {
    byWinner[ANNEX_C_WINNERS[i]!] = letters[i]!;
  }
  annexCByKey.set(key, byWinner);
}

/** Build lookup key from the 8 group letters whose third-placed teams qualified. */
export function thirdPlaceCombinationKey(qualifiedThirdGroupLetters: string[]): string | null {
  if (qualifiedThirdGroupLetters.length !== 8) return null;
  const upper = qualifiedThirdGroupLetters.map((g) => g.toUpperCase());
  if (new Set(upper).size !== 8) return null;
  if (!upper.every((g) => g >= "A" && g <= "L")) return null;
  return [...upper].sort().join("");
}

/**
 * FIFA Annex C lookup: given exactly 8 group letters whose thirds are the best eight,
 * returns which third (by group letter) faces each group winner in the R32.
 */
export function lookupAnnexC(qualifiedThirdGroupLetters: string[]): AnnexCLookupResult | null {
  const combinationKey = thirdPlaceCombinationKey(qualifiedThirdGroupLetters);
  if (!combinationKey) return null;
  const byWinner = annexCByKey.get(combinationKey);
  if (!byWinner) return null;

  const slots: ThirdPlaceSlotAssignment[] = [];
  for (const [matchNumber, winnerGroup] of Object.entries(WINNER_GROUP_BY_MATCH)) {
    const thirdGroup = byWinner[winnerGroup];
    if (!thirdGroup) return null;
    slots.push({ winnerGroup, thirdGroup, matchNumber: Number(matchNumber) });
  }
  return { combinationKey, byWinner, slots };
}

/** Given a pool label (e.g. 3ABCDF) and winner group (E), return the assigned third group letter if in pool. */
export function thirdGroupForPool(
  poolLabel: string,
  winnerGroup: string,
  byWinner: Record<string, string>
): string | null {
  const pool = poolLabel.match(/^3([A-L]+)$/i);
  if (!pool) return null;
  const allowed = new Set(pool[1]!.toUpperCase().split(""));
  const third = byWinner[winnerGroup.toUpperCase()];
  if (!third || !allowed.has(third)) return null;
  return third;
}

/** Resolve winner-group letter → third-place team code using Annex C + group standings. */
export function buildThirdPlaceTeamByWinner(
  groupStandings: { code: string; teams: { code: string }[] }[],
  qualifiedThirdGroupLetters: string[]
): { byWinner: Record<string, string>; annex: AnnexCLookupResult; teamByWinner: Map<string, string> } | null {
  const annex = lookupAnnexC(qualifiedThirdGroupLetters);
  if (!annex) return null;
  const teamByWinner = new Map<string, string>();
  for (const [winner, thirdGroup] of Object.entries(annex.byWinner)) {
    const stand = groupStandings.find((g) => g.code === thirdGroup);
    const thirdCode = stand?.teams[2]?.code;
    if (!thirdCode) return null;
    teamByWinner.set(winner, thirdCode);
  }
  return { byWinner: annex.byWinner, annex, teamByWinner };
}
