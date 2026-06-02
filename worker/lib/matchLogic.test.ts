import { describe, expect, it } from "vitest";
import { formatPredictionCloseCountdown, pickDeadlineMs } from "./matchLogic";

describe("formatPredictionCloseCountdown", () => {
  it("counts down to kickoff minus 5 minutes", () => {
    const kickoff = Date.parse("2026-06-11T20:00:00.000Z");
    const date = new Date(kickoff).toISOString();
    const now = pickDeadlineMs(date) - 45 * 60_000;
    expect(formatPredictionCloseCountdown(date, now)).toBe("Closes in 45 min");
  });
});
