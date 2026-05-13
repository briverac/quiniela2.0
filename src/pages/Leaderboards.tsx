import { useEffect, useState } from "react";
import { apiJson } from "../api";

type Board = {
  name: string | null;
  picture: string | null;
  points: number;
  index: number;
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
                {r.name}
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
        <form onSubmit={create} className="form-row">
          <input
            placeholder="Name (3–40 characters)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            minLength={3}
            maxLength={40}
            required
          />
          <label>
            <input type="checkbox" checked={priv} onChange={(e) => setPriv(e.target.checked)} /> Private
          </label>
          <button type="submit" className="button primary">
            Create
          </button>
        </form>
      </section>
    </div>
  );
}
