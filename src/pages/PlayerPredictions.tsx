import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiJson } from "../api";
import { TeamFlag } from "../components/TeamFlag";
import { ClosedPredictionDisplay } from "../components/ClosedPredictionDisplay";

const TOURNAMENT = "WC26";

type BootMatch = {
  id: number;
  number: number;
  date: string;
  phaseName: string;
  phaseLevel: number;
  team1Code: string | null;
  team2Code: string | null;
  team1FlagCode: string | null;
  team2FlagCode: string | null;
  team1Name: string | null;
  team2Name: string | null;
  team1Score: number | null;
  team2Score: number | null;
  team1PenScore: number | null;
  team2PenScore: number | null;
  closed: boolean;
};

type ViewRes = {
  data: {
    user: { name: string; picture: string | null };
    predictionSet: { id: number; points: number };
    predictions: {
      id: number;
      matchId: number;
      score1: number | null;
      score2: number | null;
      points: number | null;
    }[];
  };
};

type RowEntry =
  | { kind: "phase"; key: string; phaseName: string }
  | { kind: "match"; key: string; pr: ViewRes["data"]["predictions"][number]; m: BootMatch };

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function localDayInfo(iso: string): { key: string; label: string } {
  const d = new Date(iso);
  const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  const label = d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return { key, label };
}

function buildDayEntries(
  predictions: ViewRes["data"]["predictions"],
  matches: BootMatch[],
): { key: string; label: string; entries: RowEntry[] }[] {
  const byId = new Map(matches.map((m) => [m.id, m]));
  const rows = predictions
    .map((pr) => {
      const m = byId.get(pr.matchId);
      if (!m?.closed) return null;
      return { pr, m };
    })
    .filter((x): x is { pr: ViewRes["data"]["predictions"][number]; m: BootMatch } => x != null)
    .sort((a, b) => a.m.number - b.m.number);

  const dayMap = new Map<string, { key: string; label: string; rows: typeof rows }>();
  for (const row of rows) {
    const { key, label } = localDayInfo(row.m.date);
    let bucket = dayMap.get(key);
    if (!bucket) {
      bucket = { key, label, rows: [] };
      dayMap.set(key, bucket);
    }
    bucket.rows.push(row);
  }

  return [...dayMap.values()].map((bucket) => {
    const entries: RowEntry[] = [];
    let lastPhaseLevel = 1;
    for (const { pr, m } of bucket.rows) {
      if (m.phaseLevel > 1 && m.phaseLevel !== lastPhaseLevel) {
        entries.push({
          kind: "phase",
          key: `phase-${m.phaseLevel}-${m.id}`,
          phaseName: m.phaseName,
        });
        lastPhaseLevel = m.phaseLevel;
      } else if (m.phaseLevel > 1) {
        lastPhaseLevel = m.phaseLevel;
      }
      entries.push({ kind: "match", key: String(pr.id), pr, m });
    }
    return { key: bucket.key, label: bucket.label, entries };
  });
}

export default function PlayerPredictions() {
  const { id } = useParams<{ id: string }>();
  const [view, setView] = useState<ViewRes["data"] | null>(null);
  const [matches, setMatches] = useState<BootMatch[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setErr(null);
    Promise.all([
      apiJson<ViewRes>(`/api/predictions/${id}`),
      apiJson<{ data: { matches: BootMatch[] } }>(`/api/tournaments/${TOURNAMENT}/bootstrap`),
    ])
      .then(([v, b]) => {
        setView(v.data);
        setMatches(b.data.matches);
      })
      .catch((e: Error) => setErr(e.message));
  }, [id]);

  const dayBuckets = useMemo(
    () => (view ? buildDayEntries(view.predictions, matches) : []),
    [view, matches],
  );

  if (err && !view) return <div className="page error">{err}</div>;
  if (!view) return <div className="page">Loading…</div>;

  return (
    <div className="page">
      <p className="muted">
        <Link to="/leaderboards">← Back to leaderboards</Link>
      </p>
      <h1>
        {view.user.picture && (
          <img src={view.user.picture} alt="" className="avatar sm" style={{ marginRight: "0.5rem" }} />
        )}
        {view.user.name} predictions
      </h1>
      <p>
        Total points: <strong>{view.predictionSet.points}</strong>
      </p>

      {dayBuckets.length === 0 ? (
        <p className="muted">No closed matches to show yet.</p>
      ) : (
        dayBuckets.map((bucket) => (
          <section key={bucket.key} className="phase-block">
            <h2 className="subsection-title">{bucket.label}</h2>
            <div className="table-wrap">
              <table className="table table-predictions">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Time</th>
                    <th>Phase</th>
                    <th>Match</th>
                    <th>Score</th>
                    <th>Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {bucket.entries.map((entry) =>
                    entry.kind === "phase" ? (
                      <tr key={entry.key}>
                        <td colSpan={6} className="phase-title">
                          {entry.phaseName}
                        </td>
                      </tr>
                    ) : (
                      <tr key={entry.key} className="predictions-row">
                        <td>{entry.m.number}</td>
                        <td className="predictions-time">{formatTime(entry.m.date)}</td>
                        <td className="predictions-phase">{entry.m.phaseName}</td>
                        <td className="match-cell">
                          <div className="match-teams">
                            <span className="team-with-flag">
                              <TeamFlag
                                code={entry.m.team1FlagCode ?? entry.m.team1Code}
                                title={entry.m.team1Name ?? undefined}
                              />
                              <strong>{entry.m.team1Name}</strong>
                            </span>
                            <span className="muted">vs</span>
                            <span className="team-with-flag">
                              <TeamFlag
                                code={entry.m.team2FlagCode ?? entry.m.team2Code}
                                title={entry.m.team2Name ?? undefined}
                              />
                              <strong>{entry.m.team2Name}</strong>
                            </span>
                          </div>
                        </td>
                        <td className="predictions-prediction">
                          <ClosedPredictionDisplay pr={entry.pr} m={entry.m} />
                        </td>
                        <td className="predictions-pts">{entry.pr.points ?? "—"}</td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}
    </div>
  );
}
