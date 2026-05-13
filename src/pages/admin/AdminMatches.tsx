import { useEffect, useState } from "react";
import { apiJson } from "../../api";

type Match = {
  id: number;
  number: number;
  team1Score: number | null;
  team2Score: number | null;
  team1Label: string | null;
  team2Label: string | null;
  team1Code: string | null;
  team2Code: string | null;
  isClosed: boolean;
  ready: boolean;
};

export default function AdminMatches() {
  const [rows, setRows] = useState<Match[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const load = () =>
    apiJson<{ data: Match[] }>("/api/admin/matches")
      .then((r) => setRows(r.data))
      .catch((e: Error) => setErr(e.message));

  useEffect(() => {
    load();
  }, []);

  const save = async (m: Match) => {
    setErr(null);
    await apiJson(`/api/admin/matches/${m.id}`, {
      method: "PUT",
      json: {
        team1Score: m.team1Score,
        team2Score: m.team2Score,
      },
    });
    load();
  };

  if (err && !rows.length) return <div className="page error">{err}</div>;

  return (
    <div className="page">
      <h1>Admin — matches</h1>
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
            <AdminMatchRow key={m.id} m={m} onSave={save} onReload={load} onError={setErr} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AdminMatchRow({
  m,
  onSave,
  onReload,
  onError,
}: {
  m: Match;
  onSave: (m: Match) => void;
  onReload: () => void;
  onError: (s: string | null) => void;
}) {
  const [s1, setS1] = useState(m.team1Score != null ? String(m.team1Score) : "");
  const [s2, setS2] = useState(m.team2Score != null ? String(m.team2Score) : "");

  const label = `${m.team1Code ?? m.team1Label ?? "?"} vs ${m.team2Code ?? m.team2Label ?? "?"}`;

  return (
    <tr>
      <td>{m.number}</td>
      <td>
        {label} {m.isClosed && <span className="badge">Locked</span>}
      </td>
      <td>
        <input className="score" value={s1} onChange={(e) => setS1(e.target.value)} /> –
        <input className="score" value={s2} onChange={(e) => setS2(e.target.value)} />
      </td>
      <td className="actions-cell">
        <button
          type="button"
          className="button small"
          onClick={() => {
            const a = s1 === "" ? null : Number(s1);
            const b = s2 === "" ? null : Number(s2);
            onSave({ ...m, team1Score: a, team2Score: b });
          }}
        >
          Save scores
        </button>
        <button
          type="button"
          className="button small"
          onClick={async () => {
            try {
              await apiJson(`/api/admin/matches/${m.id}/recalculate-points`, { method: "POST" });
              onReload();
            } catch (e: unknown) {
              onError(e instanceof Error ? e.message : "err");
            }
          }}
        >
          Recalc points
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
