/** Match helpers — ported from Rails Match model */

export type MatchScores = {
  date: string;
  isClosed: boolean;
  team1Score: number | null;
  team2Score: number | null;
};

export function matchClosed(m: MatchScores, now: Date = new Date()): boolean {
  if (m.isClosed) return true;
  const kickoff = new Date(m.date).getTime();
  const deadline = kickoff - 5 * 60 * 1000;
  return now.getTime() >= deadline;
}

export function validRealScores(team1Score: number | null, team2Score: number | null): boolean {
  return team1Score != null && team2Score != null;
}

export function validPredictionScores(score1: number | null, score2: number | null): boolean {
  return score1 != null && score2 != null;
}

export function team1Win(team1Score: number, team2Score: number): boolean {
  return team1Score > team2Score;
}

export function team2Win(team1Score: number, team2Score: number): boolean {
  return team2Score > team1Score;
}

export function tie(team1Score: number, team2Score: number): boolean {
  return team1Score === team2Score;
}
