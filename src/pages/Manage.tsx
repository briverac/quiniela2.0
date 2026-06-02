import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { apiJson } from "../api";

type LayoutUser = {
  id: number;
  email: string;
  name: string | null;
  picture: string | null;
  admin: boolean;
};

type ManageData = {
  data: {
    owned: { id: number; name: string; code: string; private: boolean; memberCount: number }[];
    memberOf: { id: number; name: string }[];
    invitations: { id: number; leaderboardId: number; leaderboardName: string }[];
  };
};

type SentInvite = {
  id: number;
  createdAt: string;
  user: { id: number; name: string | null; email: string };
};

function formatInviteDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso;
  }
}

export default function Manage() {
  const { user } = useOutletContext<{ user: LayoutUser }>();
  const [data, setData] = useState<ManageData["data"] | null>(null);
  const [members, setMembers] = useState<{ id: number; name: string | null; email: string }[]>([]);
  const [membersOwnerId, setMembersOwnerId] = useState<number | null>(null);
  const [membersLoadFailed, setMembersLoadFailed] = useState(false);
  const [sentInvites, setSentInvites] = useState<SentInvite[]>([]);
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
      setMembersOwnerId(null);
      setMembersLoadFailed(false);
      setSentInvites([]);
      return;
    }
    let cancelled = false;
    setMembersLoadFailed(false);
    void (async () => {
      const [candR, memR, sentR] = await Promise.allSettled([
        apiJson<{ data: { id: number; name: string | null; email: string }[] }>(
          `/api/leaderboards/${pickLb}/invite-candidates`
        ),
        apiJson<{ data: { id: number; name: string | null; email: string }[]; ownerId: number }>(
          `/api/leaderboards/${pickLb}/members`
        ),
        apiJson<{ data: SentInvite[] }>(`/api/leaderboards/${pickLb}/sent-invitations`),
      ]);
      if (cancelled) return;
      setCandidates(candR.status === "fulfilled" ? candR.value.data : []);
      if (memR.status === "fulfilled") {
        setMembers(memR.value.data);
        setMembersOwnerId(memR.value.ownerId);
        setMembersLoadFailed(false);
      } else {
        setMembers([]);
        setMembersOwnerId(null);
        setMembersLoadFailed(true);
      }
      setSentInvites(sentR.status === "fulfilled" ? sentR.value.data : []);
    })();
    setRemoveIds([]);
    return () => {
      cancelled = true;
    };
  }, [pickLb]);

  const removableIds = removeIds.filter((id) => id !== user.id && id !== membersOwnerId);

  const removeMembers = async () => {
    if (!pickLb || !removableIds.length) return;
    await apiJson(`/api/leaderboards/${pickLb}/members/remove`, {
      method: "POST",
      json: { userIds: removableIds },
    });
    setRemoveIds([]);
    const mem = await apiJson<{ data: { id: number; name: string | null; email: string }[]; ownerId: number }>(
      `/api/leaderboards/${pickLb}/members`
    );
    setMembers(mem.data);
    setMembersOwnerId(mem.ownerId);
    load();
  };

  const leaveLeague = async (id: number) => {
    setErr(null);
    try {
      await apiJson(`/api/leaderboards/${id}/leave`, { method: "POST" });
      load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Error");
    }
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
      if (pickLb != null) {
        try {
          const sent = await apiJson<{ data: SentInvite[] }>(`/api/leaderboards/${pickLb}/sent-invitations`);
          setSentInvites(sent.data);
        } catch {
          setSentInvites([]);
        }
      }
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
        <p className="manage-hint" style={{ marginBottom: "0.75rem" }}>
          When someone invites you to their mini-league, it shows up here until you accept or reject.
        </p>
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
        {data.owned.length === 0 && (data.memberOf?.length ?? 0) === 0 ? (
          <p className="muted">You don’t own or belong to any yet. Create one from Leaderboards.</p>
        ) : (
          <ul>
            {data.owned.map((o) => (
              <li key={o.id}>
                {o.name} <span className="muted">(you own this)</span>
              </li>
            ))}
            {(data.memberOf ?? []).map((o) => (
              <li key={o.id}>
                {o.name}{" "}
                <button type="button" className="linkbtn" onClick={() => leaveLeague(o.id)}>
                  Leave
                </button>
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
                  Which league you’re editing below. Changing this reloads members, the invite dropdown, and pending
                  invites you sent.
                </p>
              </div>

              <h3 className="subsection-title">Members {selectedBoard ? `— ${selectedBoard.name}` : ""}</h3>
              {membersLoadFailed ? (
                <p className="error">Could not load members for this league.</p>
              ) : members.length === 0 ? (
                <p className="muted">No members yet.</p>
              ) : (
                <ul>
                  {members.map((m) => {
                    const isOwner = membersOwnerId != null && m.id === membersOwnerId;
                    return (
                      <li key={m.id}>
                        {isOwner ? (
                          <>
                            {m.name ?? m.email} <span className="muted">(owner — can’t be removed)</span>
                          </>
                        ) : (
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
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              {removableIds.length > 0 && (
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

              <h3 className="subsection-title">Invites you sent (pending)</h3>
              {sentInvites.length === 0 ? (
                <p className="muted">No one is waiting on an invite for this league.</p>
              ) : (
                <ul className="manage-sent-invites">
                  {sentInvites.map((s) => (
                    <li key={s.id}>
                      <strong>{s.user.name ?? s.user.email}</strong>
                      {s.user.name && <span className="muted"> ({s.user.email})</span>}
                      <span className="muted" style={{ marginLeft: "0.35rem", fontSize: "0.85rem" }}>
                        — sent {formatInviteDate(s.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p id="manage-sent-invites-hint" className="manage-hint">
                These people were invited but haven’t accepted yet. They’ll disappear from this list when they accept
                or decline.
              </p>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
