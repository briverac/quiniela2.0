import { useEffect, useState } from "react";
import { apiJson } from "../api";

type ManageData = {
  data: {
    owned: { id: number; name: string; code: string; private: boolean }[];
    invitations: { id: number; leaderboardId: number; leaderboardName: string }[];
  };
};

export default function Manage() {
  const [data, setData] = useState<ManageData["data"] | null>(null);
  const [members, setMembers] = useState<{ id: number; name: string | null; email: string }[]>([]);
  const [removeIds, setRemoveIds] = useState<number[]>([]);
  const [candidates, setCandidates] = useState<{ id: number; name: string | null; email: string }[]>([]);
  const [pickLb, setPickLb] = useState<number | null>(null);
  const [pickUser, setPickUser] = useState<number | "">("");
  const [err, setErr] = useState<string | null>(null);

  const load = () =>
    apiJson<ManageData>("/api/leaderboards/manage")
      .then((r) => {
        setData(r.data);
        if (r.data.owned.length && pickLb == null) setPickLb(r.data.owned[0]!.id);
      })
      .catch((e: Error) => setErr(e.message));

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!pickLb) {
      setCandidates([]);
      setMembers([]);
      return;
    }
    apiJson<{ data: { id: number; name: string | null; email: string }[] }>(
      `/api/leaderboards/${pickLb}/invite-candidates`
    )
      .then((r) => setCandidates(r.data))
      .catch(() => setCandidates([]));
    apiJson<{ data: { id: number; name: string | null; email: string }[] }>(`/api/leaderboards/${pickLb}/members`)
      .then((r) => setMembers(r.data))
      .catch(() => setMembers([]));
    setRemoveIds([]);
  }, [pickLb]);

  const removeMembers = async () => {
    if (!pickLb || !removeIds.length) return;
    await apiJson(`/api/leaderboards/${pickLb}/members/remove`, {
      method: "POST",
      json: { userIds: removeIds },
    });
    setRemoveIds([]);
    load();
  };

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pickLb || pickUser === "") return;
    setErr(null);
    try {
      await apiJson(`/api/leaderboards/${pickLb}/invitations`, {
        method: "POST",
        json: { userId: pickUser },
      });
      setPickUser("");
      load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Error");
    }
  };

  const accept = async (id: number) => {
    await apiJson(`/api/invitations/${id}/accept`, { method: "POST" });
    load();
  };
  const reject = async (id: number) => {
    await apiJson(`/api/invitations/${id}/reject`, { method: "POST" });
    load();
  };

  if (!data) return <div className="page">{err ?? "Loading…"}</div>;

  return (
    <div className="page">
      <h1>Manage</h1>
      {err && <p className="error">{err}</p>}

      <section className="phase-block">
        <h2>Your mini-leagues</h2>
        <ul>
          {data.owned.map((o) => (
            <li key={o.id}>
              {o.name}{" "}
              <button type="button" className="linkbtn" onClick={() => apiJson(`/api/leaderboards/${o.id}/leave`, { method: "POST" }).then(load)}>
                Leave (removes you only)
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="phase-block">
        <h2>Members of selected board</h2>
        {members.length === 0 && <p className="muted">None or not owner.</p>}
        <ul>
          {members.map((m) => (
            <li key={m.id}>
              <label>
                <input
                  type="checkbox"
                  checked={removeIds.includes(m.id)}
                  onChange={(e) =>
                    setRemoveIds((prev) =>
                      e.target.checked ? [...prev, m.id] : prev.filter((x) => x !== m.id)
                    )
                  }
                />{" "}
                {m.name ?? m.email}
              </label>
            </li>
          ))}
        </ul>
        {removeIds.length > 0 && (
          <button type="button" className="button danger" onClick={removeMembers}>
            Remove selected members
          </button>
        )}
      </section>

      <section className="phase-block">
        <h2>Invite player</h2>
        <form onSubmit={invite} className="form-col">
          <label>
            Leaderboard
            <select value={pickLb ?? ""} onChange={(e) => setPickLb(Number(e.target.value))}>
              {data.owned.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            User
            <select
              value={pickUser === "" ? "" : String(pickUser)}
              onChange={(e) => setPickUser(e.target.value === "" ? "" : Number(e.target.value))}
            >
              <option value="">Select…</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name ?? c.email}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="button primary">
            Send invitation
          </button>
        </form>
      </section>

      <section className="phase-block">
        <h2>Invitations for you</h2>
        {data.invitations.length === 0 && <p className="muted">None.</p>}
        <ul>
          {data.invitations.map((i) => (
            <li key={i.id}>
              {i.leaderboardName}{" "}
              <button type="button" className="button small" onClick={() => accept(i.id)}>
                Accept
              </button>{" "}
              <button type="button" className="button small" onClick={() => reject(i.id)}>
                Reject
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
