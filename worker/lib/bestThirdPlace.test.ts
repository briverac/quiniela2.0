import { describe, it, expect } from "vitest";
import { compareBestThirdPlace, rankBestThirdPlaceTeams } from "./bestThirdPlace";
import type { GroupStandingRow } from "./groupStandingsSort";

function row(
  id: number,
  code: string,
  pts: number,
  gd: number,
  gf: number,
  ga: number
): GroupStandingRow {
  return {
    id,
    code,
    matchesPlayed: 3,
    win: 0,
    draw: 0,
    lost: 0,
    goalInFavor: gf,
    goalAgainst: ga,
    goalDifference: gd,
    points: pts,
  };
}

describe("compareBestThirdPlace", () => {
  it("ranks by points first", () => {
    const a = { groupCode: "A", code: "AAA", points: 4, goalDifference: -2, goalInFavor: 3, goalAgainst: 5, matchesPlayed: 3, win: 1, draw: 1, lost: 1 };
    const b = { groupCode: "B", code: "BBB", points: 3, goalDifference: 2, goalInFavor: 5, goalAgainst: 3, matchesPlayed: 3, win: 1, draw: 0, lost: 2 };
    expect(compareBestThirdPlace(a, b)).toBeLessThan(0);
  });

  it("then goal difference", () => {
    const a = { groupCode: "A", code: "AAA", points: 3, goalDifference: 1, goalInFavor: 4, goalAgainst: 3, matchesPlayed: 3, win: 1, draw: 0, lost: 2 };
    const b = { groupCode: "B", code: "BBB", points: 3, goalDifference: 0, goalInFavor: 4, goalAgainst: 4, matchesPlayed: 3, win: 1, draw: 0, lost: 2 };
    expect(compareBestThirdPlace(a, b)).toBeLessThan(0);
  });

  it("then goals scored", () => {
    const a = { groupCode: "A", code: "AAA", points: 1, goalDifference: -1, goalInFavor: 2, goalAgainst: 3, matchesPlayed: 3, win: 0, draw: 1, lost: 2 };
    const b = { groupCode: "B", code: "BBB", points: 1, goalDifference: -1, goalInFavor: 1, goalAgainst: 2, matchesPlayed: 3, win: 0, draw: 1, lost: 2 };
    expect(compareBestThirdPlace(a, b)).toBeLessThan(0);
  });
});

describe("rankBestThirdPlaceTeams", () => {
  it("takes third place from each group and marks top 8 as qualified", () => {
    const groups = [
      {
        code: "A",
        teams: [row(1, "T1", 9, 5, 8, 3), row(2, "T2", 6, 1, 5, 4), row(3, "T3", 3, -1, 2, 3)],
      },
      {
        code: "B",
        teams: [row(4, "U1", 7, 3, 6, 3), row(5, "U2", 5, 0, 4, 4), row(6, "U3", 4, -2, 3, 5)],
      },
    ];
    const ranked = rankBestThirdPlaceTeams(groups);
    expect(ranked).toHaveLength(2);
    expect(ranked[0]!.code).toBe("U3");
    expect(ranked[0]!.qualified).toBe(true);
    expect(ranked[1]!.code).toBe("T3");
    expect(ranked[1]!.qualified).toBe(true);
  });
});
