import { describe, expect, it } from "vitest";
import {
  formatMatchResultDisplay,
  formatPredictionCloseCountdown,
  matchWinnerSide,
  pickDeadlineMs,
  validateMatchScoresInput,
} from "./matchLogic";

describe("formatMatchResultDisplay", () => {
  it("appends pens when FT is tied", () => {
    expect(formatMatchResultDisplay(1, 1, 4, 2)).toBe("1 – 1 (4 – 2)");
  });

  it("omits pens when FT has a winner", () => {
    expect(formatMatchResultDisplay(2, 1, 4, 2)).toBe("2 – 1");
  });
});

describe("matchWinnerSide", () => {
  it("uses penalties when FT is tied", () => {
    expect(
      matchWinnerSide({ team1Score: 1, team2Score: 1, team1PenScore: 5, team2PenScore: 4 })
    ).toBe("team1");
  });
});

describe("validateMatchScoresInput", () => {
  it("rejects pens on group-stage matches", () => {
    expect(
      validateMatchScoresInput({
        team1Score: 1,
        team2Score: 1,
        team1PenScore: 4,
        team2PenScore: 2,
        phaseLevel: 1,
      })
    ).toMatch(/knockout/i);
  });
});

describe("formatPredictionCloseCountdown", () => {
  it("counts down to kickoff minus 5 minutes", () => {
    const kickoff = Date.parse("2026-06-11T20:00:00.000Z");
    const date = new Date(kickoff).toISOString();
    const now = pickDeadlineMs(date) - 45 * 60_000;
    expect(formatPredictionCloseCountdown(date, now)).toBe("Closes in 45 min");
  });
});
