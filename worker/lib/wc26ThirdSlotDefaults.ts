/**
 * WC26 seed: R32 matches whose team2 slot is a FIFA "best third" pool (3…).
 * Used to restore team2_label when admin clears a manual team2_id assignment.
 */
const DEFAULT_TEAM2_LABEL: Record<number, string> = {
  74: "3ABCDF",
  77: "3CDFGH",
  79: "3CEFHI",
  80: "3EHIJK",
  81: "3BEFIJ",
  82: "3AEHIJ",
  85: "3EFGIJ",
  87: "3DEIJL",
};

export function defaultWc26ThirdTeam2Label(matchNumber: number): string | null {
  return DEFAULT_TEAM2_LABEL[matchNumber] ?? null;
}

export function isWc26ThirdTeam2Slot(matchNumber: number): boolean {
  return matchNumber in DEFAULT_TEAM2_LABEL;
}
