/** Match helpers — ported from Rails Match model */

export type MatchScores = {
  date: string;
  isClosed: boolean;
  team1Score: number | null;
  team2Score: number | null;
};

const PICK_CLOSE_MS = 5 * 60 * 1000;

/** Kickoff minus 5 minutes — when predictions stop accepting edits. */
export function pickDeadlineMs(date: string): number {
  return new Date(date).getTime() - PICK_CLOSE_MS;
}

export function matchClosed(m: MatchScores, now: Date = new Date()): boolean {
  if (m.isClosed) return true;
  return now.getTime() >= pickDeadlineMs(m.date);
}

/** Relative countdown until the pick deadline (open matches only). */
export function formatPredictionCloseCountdown(date: string, nowMs = Date.now()): string {
  const diff = pickDeadlineMs(date) - nowMs;
  if (diff <= 0) return "Closing now";
  const totalMin = Math.floor(diff / 60_000);
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  const mins = totalMin % 60;
  if (days >= 2) return `Closes in ${days} days`;
  if (days === 1) return "Closes in 1 day";
  if (hours >= 1) return `Closes in ${hours}h ${mins}m`;
  if (mins >= 1) return `Closes in ${mins} min`;
  return "Closes in under 1 min";
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
