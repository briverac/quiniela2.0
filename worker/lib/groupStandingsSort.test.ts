import { describe, it, expect } from "vitest";
import {
  sortGroupTeamsByFifaRules,
  aggregateMiniLeague,
  type GroupStandingRow,
  type ClosedGroupMatch,
} from "./groupStandingsSort";

function row(
  id: number,
  code: string,
  pts: number,
  gd: number,
  gf: number,
  ga: number
): GroupStandingRow {
  const w = 0;
  const d = 0;
  const l = 0;
  const mp = 0;
  return {
    id,
    code,
    matchesPlayed: mp,
    win: w,
    draw: d,
    lost: l,
    goalInFavor: gf,
    goalAgainst: ga,
    goalDifference: gd,
    points: pts,
  };
}

describe("aggregateMiniLeague", () => {
  it("counts only matches between listed teams", () => {
    const matches: ClosedGroupMatch[] = [
      { team1Id: 1, team2Id: 2, team1Score: 2, team2Score: 1 },
      { team1Id: 1, team2Id: 3, team1Score: 0, team2Score: 0 },
    ];
    const m = aggregateMiniLeague([1, 2], matches);
    expect(m.get(1)).toEqual({ pts: 3, gf: 2, ga: 1, gd: 1 });
    expect(m.get(2)).toEqual({ pts: 0, gf: 1, ga: 2, gd: -1 });
  });
});

describe("sortGroupTeamsByFifaRules", () => {
  it("ranks higher head-to-head when total points are equal", () => {
    const rows = [
      row(1, "AAA", 6, 2, 5, 3),
      row(2, "BBB", 6, 5, 8, 3),
    ];
    const matches: ClosedGroupMatch[] = [{ team1Id: 1, team2Id: 2, team1Score: 1, team2Score: 0 }];
    const sorted = sortGroupTeamsByFifaRules(rows, matches);
    expect(sorted.map((r) => r.id)).toEqual([1, 2]);
  });

  it("uses overall goal difference when head-to-head is level", () => {
    const rows = [
      row(1, "AAA", 6, 10, 12, 2),
      row(2, "BBB", 6, 2, 5, 3),
    ];
    const matches: ClosedGroupMatch[] = [{ team1Id: 1, team2Id: 2, team1Score: 1, team2Score: 1 }];
    const sorted = sortGroupTeamsByFifaRules(rows, matches);
    expect(sorted.map((r) => r.id)).toEqual([1, 2]);
  });

  it("resolves a three-way tie on mini-table with recursion", () => {
    const rows = [
      row(1, "A", 3, 0, 2, 2),
      row(2, "B", 3, 0, 2, 2),
      row(3, "C", 3, 0, 2, 2),
    ];
    const matches: ClosedGroupMatch[] = [
      { team1Id: 1, team2Id: 2, team1Score: 1, team2Score: 0 },
      { team1Id: 2, team2Id: 3, team1Score: 1, team2Score: 0 },
      { team1Id: 3, team2Id: 1, team1Score: 1, team2Score: 0 },
    ];
    const sorted = sortGroupTeamsByFifaRules(rows, matches);
    expect(sorted.map((r) => r.id)).toEqual([1, 2, 3]);
  });

  it("uses overall table when everyone shares the same mini record", () => {
    const rows = [
      row(1, "A", 2, 5, 4, 1),
      row(2, "B", 2, 1, 2, 3),
      row(3, "C", 2, 1, 1, 2),
    ];
    const matches: ClosedGroupMatch[] = [
      { team1Id: 1, team2Id: 2, team1Score: 0, team2Score: 0 },
      { team1Id: 2, team2Id: 3, team1Score: 0, team2Score: 0 },
      { team1Id: 3, team2Id: 1, team1Score: 0, team2Score: 0 },
    ];
    const sorted = sortGroupTeamsByFifaRules(rows, matches);
    expect(sorted.map((r) => r.id)).toEqual([1, 2, 3]);
  });

  it("orders by points first across the whole group", () => {
    const rows = [
      row(1, "A", 3, 0, 1, 1),
      row(2, "B", 6, 0, 2, 2),
    ];
    const sorted = sortGroupTeamsByFifaRules(rows, []);
    expect(sorted.map((r) => r.id)).toEqual([2, 1]);
  });
});
