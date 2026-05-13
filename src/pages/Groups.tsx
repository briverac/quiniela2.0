import { useEffect, useMemo, useState } from "react";
import { apiJson } from "../api";

const TOURNAMENT = "WC26";

type StandRow = {
  code: string;
  name: string;
  matchesPlayed: number;
  win: number;
  draw: number;
  lost: number;
  goalInFavor: number;
  goalAgainst: number;
  goalDifference: number;
  points: number;
};

type StandingsRes = { data: { code: string; teams: StandRow[] }[] };

type BootMatch = {
  id: number;
  number: number;
  date: string;
  phaseCode?: string | null;
  team1Name: string | null;
  team2Name: string | null;
  team1Score: number | null;
  team2Score: number | null;
  closed: boolean;
};

type BootstrapRes = {
  data: {
    matches: BootMatch[];
  };
};

function formatKickoff(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function isGroupLetter(code: string | null | undefined): code is string {
  return !!code && /^[A-L]$/.test(code);
}

export default function Groups() {
  const [standings, setStandings] = useState<StandingsRes["data"] | null>(null);
  const [matches, setMatches] = useState<BootMatch[] | null>(null);
  const [active, setActive] = useState<string>("A");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setErr(null);
    Promise.all([
      apiJson<StandingsRes>("/api/groups/standings"),
      apiJson<BootstrapRes>(`/api/tournaments/${TOURNAMENT}/bootstrap`),
    ])
      .then(([s, b]) => {
        setStandings(s.data);
        setMatches(b.data.matches);
        setActive((prev) => (s.data.some((g) => g.code === prev) ? prev : s.data[0]?.code ?? "A"));
      })
      .catch((e: Error) => setErr(e.message));
  }, []);

  const groupMatches = useMemo(() => {
    if (!matches || !isGroupLetter(active)) return [];
    return matches.filter((m) => m.phaseCode === active);
  }, [matches, active]);

  const activeStand = standings?.find((g) => g.code === active);

  if (err) return <div className="page error">{err}</div>;
  if (!standings || !matches) return <div className="page">Loading…</div>;

  return (
    <div className="page">
      <h1>Groups</h1>
      <p className="muted">
        Tab per group: standings (from finished matches with scores) and all group fixtures in date
        order.
      </p>

      <div className="tabs" role="tablist" aria-label="Groups">
        {standings.map((g) => (
          <button
            key={g.code}
            type="button"
            role="tab"
            aria-selected={active === g.code}
            className={`tab ${active === g.code ? "tab-active" : ""}`}
            onClick={() => setActive(g.code)}
          >
            Group {g.code}
          </button>
        ))}
      </div>

      <section className="tab-panel" aria-live="polite">
        <h2 className="sr-only">Group {active}</h2>

        <h3 className="subsection-title">Standings</h3>
        {activeStand && (
          <table className="table">
            <thead>
              <tr>
                <th>Team</th>
                <th>P</th>
                <th>W</th>
                <th>D</th>
                <th>L</th>
                <th>GF</th>
                <th>GA</th>
                <th>GD</th>
                <th>Pts</th>
              </tr>
            </thead>
            <tbody>
              {activeStand.teams.map((t) => (
                <tr key={t.code}>
                  <td>{t.name}</td>
                  <td>{t.matchesPlayed}</td>
                  <td>{t.win}</td>
                  <td>{t.draw}</td>
                  <td>{t.lost}</td>
                  <td>{t.goalInFavor}</td>
                  <td>{t.goalAgainst}</td>
                  <td>{t.goalDifference}</td>
                  <td>{t.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <h3 className="subsection-title">Matches</h3>
        {groupMatches.length === 0 ? (
          <p className="muted">No group-stage matches for this group.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>When</th>
                <th>Match</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {groupMatches.map((m) => (
                <tr key={m.id}>
                  <td>{m.number}</td>
                  <td>{formatKickoff(m.date)}</td>
                  <td>
                    <strong>{m.team1Name ?? "—"}</strong> vs <strong>{m.team2Name ?? "—"}</strong>
                    {m.closed && <span className="badge">Closed</span>}
                  </td>
                  <td>
                    {m.team1Score != null && m.team2Score != null
                      ? `${m.team1Score} – ${m.team2Score}`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
