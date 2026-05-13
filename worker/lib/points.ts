import {
  matchClosed,
  team1Win,
  team2Win,
  tie,
  validPredictionScores,
  validRealScores,
} from "./matchLogic";

export type PhasePoints = { smallPoints: number; bigPoints: number };

export type PredictionRow = {
  id: number;
  score1: number | null;
  score2: number | null;
};

export type MatchRow = {
  id: number;
  team1Score: number | null;
  team2Score: number | null;
  isClosed: boolean;
  date: string;
};

/** Points for one prediction vs real result — ported from Rails Points#calculate_points */
export function calculatePredictionPoints(
  prediction: PredictionRow,
  match: MatchRow,
  phase: PhasePoints
): number {
  if (!validRealScores(match.team1Score, match.team2Score)) return 0;
  if (!validPredictionScores(prediction.score1, prediction.score2)) return 0;
  const ms1 = match.team1Score!;
  const ms2 = match.team2Score!;
  const ps1 = prediction.score1!;
  const ps2 = prediction.score2!;
  if (ms1 === ps1 && ms2 === ps2) return phase.bigPoints;
  if (
    (team1Win(ms1, ms2) && team1Win(ps1, ps2)) ||
    (team2Win(ms1, ms2) && team2Win(ps1, ps2)) ||
    (tie(ms1, ms2) && tie(ps1, ps2))
  ) {
    return phase.smallPoints;
  }
  return 0;
}

/** Sum prediction rows' points column (used after per-row update) */
export function sumPredictionPoints(rows: { points: number | null }[]): number {
  return rows.reduce((acc, r) => acc + (r.points ?? 0), 0);
}

export { matchClosed };
