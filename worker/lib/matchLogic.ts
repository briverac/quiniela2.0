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

export function validPenScores(team1PenScore: number | null, team2PenScore: number | null): boolean {
  return team1PenScore != null && team2PenScore != null;
}

export type MatchResultScores = {
  team1Score: number | null;
  team2Score: number | null;
  team1PenScore?: number | null;
  team2PenScore?: number | null;
};

/** Winner after 90'+ET, or after penalties if tied. */
export function matchWinnerSide(m: MatchResultScores): "team1" | "team2" | null {
  if (!validRealScores(m.team1Score, m.team2Score)) return null;
  const s1 = m.team1Score!;
  const s2 = m.team2Score!;
  if (team1Win(s1, s2)) return "team1";
  if (team2Win(s1, s2)) return "team2";
  const p1 = m.team1PenScore ?? null;
  const p2 = m.team2PenScore ?? null;
  if (!validPenScores(p1, p2)) return null;
  if (p1! > p2!) return "team1";
  if (p2! > p1!) return "team2";
  return null;
}

/** e.g. `1 – 1 (4 – 2)` when knockout pens recorded. */
export function formatMatchResultDisplay(
  team1Score: number | null,
  team2Score: number | null,
  team1PenScore?: number | null,
  team2PenScore?: number | null
): string | null {
  if (!validRealScores(team1Score, team2Score)) return null;
  const base = `${team1Score} – ${team2Score}`;
  const p1 = team1PenScore ?? null;
  const p2 = team2PenScore ?? null;
  if (tie(team1Score!, team2Score!) && validPenScores(p1, p2)) {
    return `${base} (${p1} – ${p2})`;
  }
  return base;
}

function validScoreInt(n: number): boolean {
  return Number.isInteger(n) && n >= 0 && n <= 99;
}

/** Returns an error message, or null if valid. */
export function validateMatchScoresInput(args: {
  team1Score: number | null;
  team2Score: number | null;
  team1PenScore: number | null;
  team2PenScore: number | null;
  phaseLevel: number;
}): string | null {
  const { team1Score: s1, team2Score: s2, team1PenScore: p1, team2PenScore: p2, phaseLevel } = args;
  const ftMissing = s1 == null;
  const ftPartial = (s1 == null) !== (s2 == null);
  if (ftPartial) return "Enter both scores, or leave both empty to clear the result.";
  const penMissing = p1 == null;
  const penPartial = (p1 == null) !== (p2 == null);
  if (penPartial) return "Enter both penalty scores, or leave both empty.";

  if (!ftMissing) {
    if (!validScoreInt(s1!) || !validScoreInt(s2!)) {
      return "Scores must be whole numbers from 0 to 99.";
    }
  }
  if (!penMissing) {
    if (!validScoreInt(p1!) || !validScoreInt(p2!)) {
      return "Penalty scores must be whole numbers from 0 to 99.";
    }
    if (p1 === p2) return "Penalty shootout cannot end in a tie.";
  }

  const knockout = phaseLevel >= 2;
  if (!penMissing && !knockout) return "Penalty scores only apply to knockout matches.";
  if (!ftMissing && !penMissing) {
    if (!tie(s1!, s2!)) return "Penalty scores only apply when the match is tied after 90 minutes plus extra time.";
  }
  if (!ftMissing && !penMissing && knockout && tie(s1!, s2!)) return null;
  if (!ftMissing && penMissing && knockout) return null;
  if (!ftMissing && penMissing && !knockout) return null;
  if (ftMissing && !penMissing) return "Enter full-time scores before penalty scores.";
  if (ftMissing && penMissing) return null;
  if (!ftMissing && !penMissing) return null;
  if (!ftMissing && penMissing && !tie(s1!, s2!)) return null;
  return null;
}
