import { useEffect, useState } from "react";
import { apiJson } from "../api";

type ManageData = {
  data: {
    owned: { id: number; name: string; code: string; private: boolean; memberCount: number }[];
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
        const ids = r.data.owned.map((o) => o.id);
        setPickLb((cur) => {
          if (!ids.length) return null;
          if (cur != null && ids.includes(cur)) return cur;
          return ids[0]!;
        });
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

  const selectedBoard = data.owned.find((o) => o.id === pickLb);

  return (
    <div className="page">
      <h1>Manage</h1>
      {err && <p className="error">{err}</p>}

      <section className="phase-block">
        <h2>Invitations for you</h2>
        {data.invitations.length === 0 && <p className="muted">No pending invitations.</p>}
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

      <section className="phase-block">
        <h2>Your mini-leagues</h2>
        {data.owned.length === 0 ? (
          <p className="muted">You don’t own any yet. Create one from Leaderboards.</p>
        ) : (
          <ul>
            {data.owned.map((o) => (
              <li key={o.id}>
                {o.name}
                {o.memberCount > 1 ? (
                  <>
                    {" "}
                    <button
                      type="button"
                      className="linkbtn"
                      onClick={() => apiJson(`/api/leaderboards/${o.id}/leave`, { method: "POST" }).then(load)}
                    >
                      Leave (you only, league stays)
                    </button>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="phase-block">
        <h2>Members & invites</h2>
        {data.owned.length === 0 ? (
          <p className="muted">Nothing to manage until you own a mini-league.</p>
        ) : (
          <>
            <p className="muted manage-section-lead" style={{ maxWidth: "38rem", lineHeight: 1.5 }}>
              Pick a mini-league, then manage who is in it or send email invitations. You must be the owner to see
              members and candidates.
            </p>

            <div className="manage-form form-col">
              <div>
                <label htmlFor="manage-pick-lb" className="field-label">
                  Mini-league
                </label>
                <select
                  id="manage-pick-lb"
                  aria-describedby="manage-pick-lb-hint"
                  value={pickLb ?? ""}
                  onChange={(e) => setPickLb(Number(e.target.value))}
                >
                  {data.owned.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
                <p id="manage-pick-lb-hint" className="manage-hint">
                  Which league you’re editing below. Changing this reloads the member list and the invite list.
                </p>
              </div>

              <h3 className="subsection-title">Members {selectedBoard ? `— ${selectedBoard.name}` : ""}</h3>
              {members.length === 0 ? (
                <p className="muted">No members listed (or you’re not the owner).</p>
              ) : (
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
              )}
              {removeIds.length > 0 && (
                <p>
                  <button type="button" className="button danger" onClick={removeMembers}>
                    Remove selected
                  </button>
                </p>
              )}

              <h3 className="subsection-title">Invite someone</h3>
              <form onSubmit={invite} className="form-col">
                <div>
                  <label htmlFor="manage-pick-user" className="field-label">
                    User to invite
                  </label>
                  <select
                    id="manage-pick-user"
                    aria-describedby="manage-pick-user-hint"
                    value={pickUser === "" ? "" : String(pickUser)}
                    onChange={(e) => setPickUser(e.target.value === "" ? "" : Number(e.target.value))}
                  >
                    <option value="">Choose a user…</option>
                    {candidates.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name ?? c.email}
                      </option>
                    ))}
                  </select>
                  <p id="manage-pick-user-hint" className="manage-hint">
                    Active users who are not already in this league and don’t already have a pending invite. You can’t
                    invite yourself.
                  </p>
                </div>
                <button type="submit" className="button primary">
                  Send invitation
                </button>
              </form>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
