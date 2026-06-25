import { formatMatchResultDisplay, team1Win, team2Win, tie } from "../../worker/lib/matchLogic";

export type MatchForGrade = {
  closed: boolean;
  team1Score: number | null;
  team2Score: number | null;
  team1PenScore?: number | null;
  team2PenScore?: number | null;
};

type PredGrade = "exact" | "partial" | "miss" | "pending";

function formatScoreLine(s1: number | null, s2: number | null): string | null {
  if (s1 == null || s2 == null) return null;
  return `${s1} – ${s2}`;
}

function gradePrediction(
  pr: { score1: number | null; score2: number | null },
  m: Pick<MatchForGrade, "closed" | "team1Score" | "team2Score">,
): PredGrade | null {
  if (!m.closed) return null;
  if (m.team1Score == null || m.team2Score == null) return "pending";
  if (pr.score1 == null || pr.score2 == null) return "miss";
  const ms1 = m.team1Score;
  const ms2 = m.team2Score;
  const ps1 = pr.score1;
  const ps2 = pr.score2;
  if (ms1 === ps1 && ms2 === ps2) return "exact";
  const sameOutcome =
    (team1Win(ms1, ms2) && team1Win(ps1, ps2)) ||
    (team2Win(ms1, ms2) && team2Win(ps1, ps2)) ||
    (tie(ms1, ms2) && tie(ps1, ps2));
  return sameOutcome ? "partial" : "miss";
}

function PredGradeIcon({ grade }: { grade: "exact" | "partial" | "miss" }) {
  const cls = `pred-grade__icon pred-grade__icon--${grade}`;
  if (grade === "exact") {
    return (
      <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
      </svg>
    );
  }
  if (grade === "partial") {
    return (
      <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
        <path d="M2.5 9.5c1.5-2 2.5-2 4 0s2.5 2 4 0 2.5-2 4 0" />
      </svg>
    );
  }
  return (
    <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M4.5 4.5 11.5 11.5" />
      <path d="M11.5 4.5 4.5 11.5" />
    </svg>
  );
}

export function ClosedPredictionDisplay({
  pr,
  m,
}: {
  pr: { score1: number | null; score2: number | null };
  m: MatchForGrade;
}) {
  const grade = gradePrediction(pr, m);
  const pick = formatScoreLine(pr.score1, pr.score2) ?? "—";
  const real =
    formatMatchResultDisplay(m.team1Score, m.team2Score, m.team1PenScore, m.team2PenScore) ??
    formatScoreLine(m.team1Score, m.team2Score);

  if (grade === "pending") {
    return <span className="pred-grade pred-grade--pending">{pick}</span>;
  }
  if (grade === "exact") {
    return (
      <span className="pred-grade pred-grade--exact">
        {pick}
        <PredGradeIcon grade="exact" />
      </span>
    );
  }
  if (grade === "partial" || grade === "miss") {
    return (
      <span className={`pred-grade pred-grade--${grade}`}>
        <span className="pred-grade__pick">{pick}</span>
        <PredGradeIcon grade={grade} />
        {real ? <span className="pred-grade__real">{real}</span> : null}
      </span>
    );
  }
  return <span className="pred-grade pred-grade--pending">{pick}</span>;
}
