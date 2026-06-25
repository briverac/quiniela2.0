import { describe, it, expect } from "vitest";
import {
  lookupAnnexC,
  thirdPlaceCombinationKey,
  thirdGroupForPool,
  WINNER_GROUP_BY_MATCH,
} from "./thirdPlaceAnnexC";

describe("thirdPlaceAnnexC", () => {
  it("builds combination key from 8 group letters", () => {
    expect(thirdPlaceCombinationKey(["C", "D", "E", "F", "G", "I", "K", "L"])).toBe("CDEFGIKL");
  });

  it("rejects wrong count", () => {
    expect(thirdPlaceCombinationKey(["A", "B"])).toBeNull();
  });

  it("matches FIFA Annex C row 1 (groups E–L all qualify)", () => {
    const r = lookupAnnexC(["E", "F", "G", "H", "I", "J", "K", "L"]);
    expect(r).not.toBeNull();
    expect(r!.combinationKey).toBe("EFGHIJKL");
    expect(r!.byWinner.A).toBe("E");
    expect(r!.byWinner.B).toBe("J");
    expect(r!.byWinner.E).toBe("F");
    expect(r!.byWinner.I).toBe("G");
    expect(r!.byWinner.K).toBe("L");
    expect(r!.byWinner.L).toBe("K");
  });

  it("maps match 74 (1E) to third from assigned group within pool", () => {
    const r = lookupAnnexC(["E", "F", "G", "H", "I", "J", "K", "L"])!;
    const third = thirdGroupForPool("3ABCDF", WINNER_GROUP_BY_MATCH[74]!, r.byWinner);
    expect(third).toBe("F");
  });

  it("covers all 495 combinations", () => {
    expect(lookupAnnexC(["A", "B", "C", "D", "E", "F", "G", "H"])).not.toBeNull();
    expect(lookupAnnexC(["E", "F", "G", "H", "I", "J", "K", "L"])).not.toBeNull();
  });
});
