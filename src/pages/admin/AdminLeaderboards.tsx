import { useEffect, useState } from "react";
import { apiJson } from "../../api";

type Lb = {
  id: number;
  name: string;
  active: boolean;
  private: boolean;
};

export default function AdminLeaderboards() {
  const [rows, setRows] = useState<Lb[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const load = () =>
    apiJson<{ data: Lb[] }>("/api/admin/leaderboards")
      .then((r) => setRows(r.data))
      .catch((e: Error) => setErr(e.message));
  useEffect(() => {
    load();
  }, []);

  const patch = async (lb: Lb, body: { active?: boolean; private?: boolean }) => {
    setErr(null);
    await apiJson(`/api/admin/leaderboards/${lb.id}`, { method: "PUT", json: body });
    load();
  };

  const del = async (id: number) => {
    if (!confirm("Delete leaderboard?")) return;
    await apiJson(`/api/admin/leaderboards/${id}`, { method: "DELETE" });
    load();
  };

  if (err && !rows.length) return <div className="page error">{err}</div>;

  return (
    <div className="page">
      <h1>Admin — leaderboards</h1>
      {err && <p className="error">{err}</p>}
      <table className="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Active</th>
            <th>Private</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((lb) => (
            <tr key={lb.id}>
              <td>{lb.name}</td>
              <td>
                <input
                  type="checkbox"
                  defaultChecked={lb.active}
                  onChange={(e) => patch(lb, { active: e.target.checked })}
                />
              </td>
              <td>
                <input
                  type="checkbox"
                  defaultChecked={lb.private}
                  onChange={(e) => patch(lb, { private: e.target.checked })}
                />
              </td>
              <td>
                <button type="button" className="button small danger" onClick={() => del(lb.id)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
