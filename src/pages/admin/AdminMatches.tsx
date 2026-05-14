import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiJson } from "../../api";
import { TeamFlag } from "../../components/TeamFlag";

const TOURNAMENT = "WC26";

/** FIFA-style "best third among groups A+B+C+…" placeholder in our seed (e.g. 3ABCDF). */
function isThirdPoolLabel(s: string | null | undefined): boolean {
  return !!s && /^3[A-L]+$/i.test(s.trim());
}

function countThirdPoolSlots(matches: Match[]): { sides: number; labels: string[] } {
  const set = new Set<string>();
  let sides = 0;
  for (const m of matches) {
    if (!m.team1Code && isThirdPoolLabel(m.team1Label)) {
      sides++;
      set.add(m.team1Label!.trim().toUpperCase());
    }
    const team2ThirdSlot =
      (!m.team2Code && isThirdPoolLabel(m.team2Label)) ||
      (m.defaultThirdTeam2Label != null && m.team2Id != null);
    if (team2ThirdSlot) {
      sides++;
      const lab =
        m.team2Label && isThirdPoolLabel(m.team2Label)
          ? m.team2Label.trim().toUpperCase()
          : (m.defaultThirdTeam2Label ?? "").trim().toUpperCase();
      if (lab) set.add(lab);
    }
  }
  return { sides, labels: [...set].sort() };
}

type Match = {
  id: number;
  number: number;
  team1Id: number | null;
  team2Id: number | null;
  team1Score: number | null;
  team2Score: number | null;
  team1Label: string | null;
  team2Label: string | null;
  team1Code: string | null;
  team2Code: string | null;
  team1FlagCode: string | null;
  team2FlagCode: string | null;
  /** WC26 R32: FIFA 3… default for team2 when clearing a manual pick (from API). */
  defaultThirdTeam2Label: string | null;
  isClosed: boolean;
  ready: boolean;
};

type BootTeam = { id: number; code: string; name: string };

export default function AdminMatches() {
  const [rows, setRows] = useState<Match[]>([]);
  const [teams, setTeams] = useState<BootTeam[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const loadMatches = () =>
    apiJson<{ data: Match[] }>("/api/admin/matches")
      .then((r) => setRows(r.data))
      .catch((e: Error) => setErr(e.message));

  const loadTeams = () =>
    apiJson<{ data: { teams: BootTeam[] } }>(`/api/tournaments/${TOURNAMENT}/bootstrap`)
      .then((r) => setTeams(r.data.teams))
      .catch(() => setTeams([]));

  useEffect(() => {
    loadMatches();
    loadTeams();
  }, []);

  const thirdStats = useMemo(() => countThirdPoolSlots(rows), [rows]);

  const saveScoresAndRecalc = async (m: Match) => {
    setErr(null);
    await apiJson(`/api/admin/matches/${m.id}`, {
      method: "PUT",
      json: {
        team1Score: m.team1Score,
        team2Score: m.team2Score,
      },
    });
    await apiJson(`/api/admin/matches/${m.id}/recalculate-points`, { method: "POST" });
    loadMatches();
  };

  if (err && !rows.length) return <div className="page error">{err}</div>;

  return (
    <div className="page">
      <h1>Admin — matches</h1>
      {thirdStats.sides > 0 && (
        <p className="muted">
          <strong>Third-place FIFA slots:</strong> {thirdStats.sides} side(s) still use a{" "}
          <code>3…</code> placeholder in this fixture. Codes: {thirdStats.labels.join(", ")}. The app
          cannot guess the exact country (FIFA combination table). When you know who advances, pick the
          team below; that sets <code>team*_id</code> and clears the label for a clean public name. You can change
          the pick later from the same dropdown, or clear to restore the FIFA <code>3…</code> code.
        </p>
      )}
      <p className="muted admin-crosslinks">
        Public view: <Link to="/groups">Groups</Link>
        {" · "}
        <Link to="/predictions">Predictions</Link>
      </p>
      {err && <p className="error">{err}</p>}
      <table className="table">
        <thead>
          <tr>
            <th>#</th>
            <th>Teams</th>
            <th>Score</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <AdminMatchRow
              key={m.id}
              m={m}
              teams={teams}
              onSaveScoresAndRecalc={saveScoresAndRecalc}
              onReload={loadMatches}
              onError={setErr}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function putSlotTeam(
  matchId: number,
  side: 1 | 2,
  teamId: number | null,
  restoreLabel: string | null,
  onDone: () => void,
  onError: (s: string | null) => void
) {
  try {
    const idKey = side === 1 ? "team1Id" : "team2Id";
    const lbKey = side === 1 ? "team1Label" : "team2Label";
    const body: Record<string, unknown> = { [idKey]: teamId };
    if (teamId != null) body[lbKey] = null;
    else if (restoreLabel) body[lbKey] = restoreLabel;
    await apiJson(`/api/admin/matches/${matchId}`, { method: "PUT", json: body });
    onDone();
  } catch (e: unknown) {
    onError(e instanceof Error ? e.message : "err");
  }
}

function AdminMatchRow({
  m,
  teams,
  onSaveScoresAndRecalc,
  onReload,
  onError,
}: {
  m: Match;
  teams: BootTeam[];
  onSaveScoresAndRecalc: (m: Match) => Promise<void>;
  onReload: () => void;
  onError: (s: string | null) => void;
}) {
  const [s1, setS1] = useState(m.team1Score != null ? String(m.team1Score) : "");
  const [s2, setS2] = useState(m.team2Score != null ? String(m.team2Score) : "");

  useEffect(() => {
    setS1(m.team1Score != null ? String(m.team1Score) : "");
    setS2(m.team2Score != null ? String(m.team2Score) : "");
  }, [m.id, m.team1Score, m.team2Score]);

  const sideLabel = (side: 1 | 2) => {
    const code = side === 1 ? m.team1Code : m.team2Code;
    const lbl = side === 1 ? m.team1Label : m.team2Label;
    return code ?? lbl ?? "?";
  };

  const sideDisplay = (side: 1 | 2) => {
    const tid = side === 1 ? m.team1Id : m.team2Id;
    if (tid != null) {
      const name = teams.find((t) => t.id === tid)?.name;
      if (name) return name;
    }
    return sideLabel(side);
  };

  const sortedTeams = useMemo(() => [...teams].sort((a, b) => a.name.localeCompare(b.name)), [teams]);

  return (
    <tr>
      <td>{m.number}</td>
      <td>
        <div className="admin-match-teams">
          <div className="admin-match-side">
            <div className="match-teams" style={{ marginBottom: "0.25rem" }}>
              <span className="team-with-flag">
                <TeamFlag code={m.team1FlagCode ?? m.team1Code} />
                <span>{sideDisplay(1)}</span>
              </span>
              <span className="muted">vs</span>
              <span className="team-with-flag">
                <TeamFlag code={m.team2FlagCode ?? m.team2Code} />
                <span>{sideDisplay(2)}</span>
              </span>
            </div>
            {m.isClosed && <span className="badge">Locked</span>}
            <div className="admin-slot-pickers">
              {!m.team1Code && isThirdPoolLabel(m.team1Label) && (
                <label className="admin-slot">
                  <span className="sr-only">Team 1 third-place slot</span>
                  <select
                    className="admin-team-select"
                    value={m.team1Id ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      void putSlotTeam(m.id, 1, v === "" ? null : Number(v), null, onReload, onError);
                    }}
                  >
                    <option value="">— pick team for {m.team1Label} —</option>
                    {sortedTeams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {((!m.team2Code && isThirdPoolLabel(m.team2Label)) ||
                (m.defaultThirdTeam2Label != null && m.team2Id != null)) && (
                <label className="admin-slot">
                  <span className="sr-only">Team 2 third-place slot</span>
                  <select
                    className="admin-team-select"
                    value={m.team2Id ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      const id = v === "" ? null : Number(v);
                      const restore =
                        v === "" && m.defaultThirdTeam2Label ? m.defaultThirdTeam2Label : null;
                      void putSlotTeam(m.id, 2, id, restore, onReload, onError);
                    }}
                  >
                    <option value="">
                      {m.team2Id != null && m.defaultThirdTeam2Label
                        ? `— Clear (restore ${m.defaultThirdTeam2Label}) —`
                        : `— Pick team for ${m.team2Label} —`}
                    </option>
                    {sortedTeams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          </div>
        </div>
      </td>
      <td>
        <input className="score" value={s1} onChange={(e) => setS1(e.target.value)} /> –
        <input className="score" value={s2} onChange={(e) => setS2(e.target.value)} />
      </td>
      <td className="actions-cell">
        <button
          type="button"
          className="button small"
          onClick={async () => {
            const a = s1 === "" ? null : Number(s1);
            const b = s2 === "" ? null : Number(s2);
            try {
              onError(null);
              await onSaveScoresAndRecalc({ ...m, team1Score: a, team2Score: b });
            } catch (e: unknown) {
              onError(e instanceof Error ? e.message : "err");
            }
          }}
        >
          Save score & update points
        </button>
        <button
          type="button"
          className="button small"
          onClick={async () => {
            try {
              await apiJson(`/api/admin/matches/${m.id}/toggle-lock`, { method: "POST" });
              onReload();
            } catch (e: unknown) {
              onError(e instanceof Error ? e.message : "err");
            }
          }}
        >
          Toggle lock
        </button>
      </td>
    </tr>
  );
}
