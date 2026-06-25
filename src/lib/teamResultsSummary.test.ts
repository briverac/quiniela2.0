import { describe, expect, it } from "vitest";
import { buildTeamResultsIndex } from "./teamResultsSummary";

describe("buildTeamResultsIndex", () => {
  it("indexes closed results by team code", () => {
    const index = buildTeamResultsIndex([
      {
        number: 1,
        closed: true,
        team1Code: "ger",
        team2Code: "sco",
        team1FlagCode: "ger",
        team2FlagCode: "sco",
        team1Name: "Germany",
        team2Name: "Scotland",
        team1Score: 2,
        team2Score: 1,
        team1PenScore: null,
        team2PenScore: null,
      },
      {
        number: 2,
        closed: true,
        team1Code: "ger",
        team2Code: "hun",
        team1FlagCode: "ger",
        team2FlagCode: "hun",
        team1Name: "Germany",
        team2Name: "Hungary",
        team1Score: 1,
        team2Score: 1,
        team1PenScore: null,
        team2PenScore: null,
      },
    ]);

    const ger = index.get("ger");
    expect(ger?.played).toHaveLength(2);
    expect(ger?.played[0]).toMatchObject({
      outcome: "W",
      opponentCode: "sco",
      opponentName: "Scotland",
    });
    expect(ger?.played[1]).toMatchObject({ outcome: "D", opponentName: "Hungary" });
    expect(ger?.points).toBe(4);
    expect(ger?.goalDifference).toBe(1);
  });

  it("ignores open matches", () => {
    const index = buildTeamResultsIndex([
      {
        number: 3,
        closed: false,
        team1Code: "mex",
        team2Code: "usa",
        team1FlagCode: "mex",
        team2FlagCode: "usa",
        team1Name: "Mexico",
        team2Name: "United States",
        team1Score: null,
        team2Score: null,
        team1PenScore: null,
        team2PenScore: null,
      },
    ]);
    expect(index.size).toBe(0);
  });
});
