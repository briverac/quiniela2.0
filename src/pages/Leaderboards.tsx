import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiJson } from "../api";

type Board = {
  name: string | null;
  picture: string | null;
  points: number;
  index: number;
  predictionSetId: number;
};

type Data = {
  data: {
    general: Board[];
    boards: { id: number; name: string; code: string; positions: Board[] }[];
  };
};

export default function Leaderboards() {
  const [data, setData] = useState<Data["data"] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [priv, setPriv] = useState(true);

  const load = () =>
    apiJson<Data>("/api/leaderboards")
      .then((r) => setData(r.data))
      .catch((e: Error) => setErr(e.message));

  useEffect(() => {
    load();
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    try {
      await apiJson("/api/leaderboards", { method: "POST", json: { name, private: priv } });
      setName("");
      load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Error");
    }
  };

  if (err && !data) return <div className="page error">{err}</div>;
  if (!data) return <div className="page">Loading…</div>;

  const renderTable = (title: string, rows: Board[]) => (
    <section className="phase-block">
      <h2>{title}</h2>
      <table className="table">
        <thead>
          <tr>
            <th>#</th>
            <th>Player</th>
            <th>Points</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{r.index}</td>
              <td>
                {r.picture && <img src={r.picture} alt="" className="avatar sm" />}
                <Link to={`/predictions/${r.predictionSetId}`}>{r.name}</Link>
              </td>
              <td>{r.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );

  return (
    <div className="page">
      <h1>Leaderboards</h1>
      {err && <p className="error">{err}</p>}
      {renderTable("General ranking", data.general)}

      {data.boards.map((b) => (
        <div key={b.id}>{renderTable(b.name, b.positions)}</div>
      ))}

      <section className="phase-block">
        <h2>Create mini-league</h2>
        <p className="muted" style={{ maxWidth: "40rem", lineHeight: 1.55 }}>
          A mini-league is a <strong>private ranking</strong> for a group of friends on top of the same tournament
          predictions. Everyone still competes in the general table; this extra table only lists people you add.
          After creating it, go to <Link to="/manage">Manage</Link> to invite players and remove members.
        </p>

        <form onSubmit={create} className="create-mini-league">
          <div>
            <label htmlFor="mini-league-name" className="field-label">
              Name
            </label>
            <input
              id="mini-league-name"
              type="text"
              autoComplete="off"
              value={name}
              onChange={(e) => setName(e.target.value)}
              minLength={3}
              maxLength={40}
              required
              placeholder="e.g. Office pool"
            />
            <p className="field-hint">Between 3 and 40 characters. Must be unique.</p>
          </div>

          <div className="create-mini-league-private">
            <label className="checkbox-row">
              <input type="checkbox" checked={priv} onChange={(e) => setPriv(e.target.checked)} />
              <span>
                <strong>Private</strong>
                <span className="checkbox-desc">
                  On by default. Everyone still joins only if you invite them from Manage; this marks the league as
                  private in the system.
                </span>
              </span>
            </label>
          </div>

          <div className="create-mini-league-actions">
            <button type="submit" className="button primary">
              Create mini-league
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
