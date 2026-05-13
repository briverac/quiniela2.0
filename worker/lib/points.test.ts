import { describe, it, expect } from "vitest";
import { calculatePredictionPoints } from "./points";
import { matchClosed } from "./matchLogic";

describe("calculatePredictionPoints", () => {
  it("awards big points on exact score", () => {
    const pts = calculatePredictionPoints(
      { id: 1, score1: 2, score2: 1 },
      { id: 1, team1Score: 2, team2Score: 1, isClosed: true, date: "2020-01-01" },
      { smallPoints: 1, bigPoints: 3 }
    );
    expect(pts).toBe(3);
  });

  it("awards small points on correct 1X2 only", () => {
    const pts = calculatePredictionPoints(
      { id: 1, score1: 1, score2: 0 },
      { id: 1, team1Score: 2, team2Score: 1, isClosed: true, date: "2020-01-01" },
      { smallPoints: 1, bigPoints: 3 }
    );
    expect(pts).toBe(1);
  });

  it("returns 0 on wrong outcome", () => {
    const pts = calculatePredictionPoints(
      { id: 1, score1: 0, score2: 1 },
      { id: 1, team1Score: 2, team2Score: 1, isClosed: true, date: "2020-01-01" },
      { smallPoints: 1, bigPoints: 3 }
    );
    expect(pts).toBe(0);
  });
});

describe("matchClosed", () => {
  it("closes at 5 minutes before kickoff", () => {
    const kick = new Date("2030-06-01T18:00:00.000Z").getTime();
    const kickIso = new Date(kick).toISOString();
    const fourMinBefore = new Date(kick - 4 * 60 * 1000);
    expect(
      matchClosed(
        { date: kickIso, isClosed: false, team1Score: null, team2Score: null },
        fourMinBefore
      )
    ).toBe(true);
    const sixMinBefore = new Date(kick - 6 * 60 * 1000);
    expect(
      matchClosed(
        { date: kickIso, isClosed: false, team1Score: null, team2Score: null },
        sixMinBefore
      )
    ).toBe(false);
  });
});
