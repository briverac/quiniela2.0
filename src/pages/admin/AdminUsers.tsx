import { useEffect, useState } from "react";
import { apiJson } from "../../api";

type U = { id: number; email: string; name: string | null; active: boolean; admin: boolean };

export default function AdminUsers() {
  const [rows, setRows] = useState<U[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const load = () =>
    apiJson<{ data: U[] }>("/api/admin/users")
      .then((r) => setRows(r.data))
      .catch((e: Error) => setErr(e.message));
  useEffect(() => {
    load();
  }, []);

  const patch = async (u: U, p: Partial<U>) => {
    setErr(null);
    await apiJson(`/api/admin/users/${u.id}`, {
      method: "PUT",
      json: p,
    });
    load();
  };

  if (err && !rows.length) return <div className="page error">{err}</div>;

  return (
    <div className="page">
      <h1>Admin — users</h1>
      {err && <p className="error">{err}</p>}
      <table className="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Active</th>
            <th>Admin</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((u) => (
            <tr key={u.id}>
              <td>
                <input defaultValue={u.name ?? ""} id={`n-${u.id}`} />
              </td>
              <td>{u.email}</td>
              <td>
                <input
                  type="checkbox"
                  defaultChecked={u.active}
                  onChange={(e) => patch(u, { active: e.target.checked })}
                />
              </td>
              <td>
                <input
                  type="checkbox"
                  defaultChecked={u.admin}
                  onChange={(e) => patch(u, { admin: e.target.checked })}
                />
              </td>
              <td>
                <button
                  type="button"
                  className="button small"
                  onClick={() => {
                    const el = document.getElementById(`n-${u.id}`) as HTMLInputElement;
                    patch(u, { name: el.value });
                  }}
                >
                  Save name
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
