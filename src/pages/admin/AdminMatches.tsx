import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiJson } from "../../api";
import { TeamFlag } from "../../components/TeamFlag";
import { MatchPickStatus } from "../../components/MatchPickStatus";

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

/** What still needs admin input — used for sort order (most urgent first). */
function adminMatchAttention(m: Match): { priority: number; dateMs: number } {
  const dateMs = new Date(m.date).getTime();
  const knockout = m.phaseLevel >= 2;

  const missingScore = m.closed && (m.team1Score == null || m.team2Score == null);
  if (missingScore) return { priority: 0, dateMs };

  const missingPen =
    knockout &&
    m.team1Score != null &&
    m.team2Score != null &&
    m.team1Score === m.team2Score &&
    (m.team1PenScore == null || m.team2PenScore == null);
  if (missingPen) return { priority: 1, dateMs };

  const needsThirdPick =
    (!m.team1Code && isThirdPoolLabel(m.team1Label) && m.team1Id == null) ||
    (!m.team2Code && isThirdPoolLabel(m.team2Label) && m.team2Id == null);
  if (needsThirdPick) return { priority: 2, dateMs };

  return { priority: 3, dateMs };
}

function compareAdminMatches(a: Match, b: Match): number {
  const aa = adminMatchAttention(a);
  const bb = adminMatchAttention(b);
  if (aa.priority !== bb.priority) return aa.priority - bb.priority;
  if (aa.priority < 3) return aa.dateMs - bb.dateMs;
  return a.number - b.number;
}

function adminMatchNeedsAttention(m: Match): boolean {
  return adminMatchAttention(m).priority < 3;
}

type Match = {
  id: number;
  number: number;
  team1Id: number | null;
  team2Id: number | null;
  team1Score: number | null;
  team2Score: number | null;
  team1PenScore: number | null;
  team2PenScore: number | null;
  phaseLevel: number;
  team1Label: string | null;
  team2Label: string | null;
  team1Code: string | null;
  team2Code: string | null;
  team1FlagCode: string | null;
  team2FlagCode: string | null;
  /** WC26 R32: FIFA 3… default for team2 when clearing a manual pick (from API). */
  defaultThirdTeam2Label: string | null;
  date: string;
  isClosed: boolean;
  closed: boolean;
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

  const sortedRows = useMemo(() => [...rows].sort(compareAdminMatches), [rows]);
  const needsAttentionCount = useMemo(() => sortedRows.filter(adminMatchNeedsAttention).length, [sortedRows]);

  const saveScoresAndRecalc = async (m: Match) => {
    setErr(null);
    await apiJson(`/api/admin/matches/${m.id}`, {
      method: "PUT",
      json: {
        team1Score: m.team1Score,
        team2Score: m.team2Score,
        team1PenScore: m.team1PenScore,
        team2PenScore: m.team2PenScore,
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
      {needsAttentionCount > 0 && (
        <p className="predictions-deadline-notice">
          <strong>{needsAttentionCount}</strong>{" "}
          {needsAttentionCount === 1 ? "match still needs" : "matches still need"} scores, penalties, or
          third-place picks — listed first below.
        </p>
      )}
      <p className="predictions-deadline-notice">
        Predictions close for players <strong>5 minutes before</strong> kickoff. Use <strong>Toggle lock</strong>{" "}
        to lock or unlock a match manually.
      </p>
      <div className="table-wrap">
      <table className="table table-admin-matches">
        <colgroup>
          <col className="col-num" />
          <col className="col-teams" />
          <col className="col-status" />
          <col className="col-score" />
          <col className="col-actions" />
        </colgroup>
        <thead>
          <tr>
            <th>#</th>
            <th>Teams</th>
            <th>Status</th>
            <th>Score</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((m) => (
            <AdminMatchRow
              key={m.id}
              m={m}
              teams={teams}
              needsAttention={adminMatchNeedsAttention(m)}
              onSaveScoresAndRecalc={saveScoresAndRecalc}
              onReload={loadMatches}
              onError={setErr}
            />
          ))}
        </tbody>
      </table>
      </div>
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
  needsAttention,
  onSaveScoresAndRecalc,
  onReload,
  onError,
}: {
  m: Match;
  teams: BootTeam[];
  needsAttention: boolean;
  onSaveScoresAndRecalc: (m: Match) => Promise<void>;
  onReload: () => void;
  onError: (s: string | null) => void;
}) {
  const knockout = m.phaseLevel >= 2;
  const [s1, setS1] = useState(m.team1Score != null ? String(m.team1Score) : "");
  const [s2, setS2] = useState(m.team2Score != null ? String(m.team2Score) : "");
  const [p1, setP1] = useState(m.team1PenScore != null ? String(m.team1PenScore) : "");
  const [p2, setP2] = useState(m.team2PenScore != null ? String(m.team2PenScore) : "");

  useEffect(() => {
    setS1(m.team1Score != null ? String(m.team1Score) : "");
    setS2(m.team2Score != null ? String(m.team2Score) : "");
    setP1(m.team1PenScore != null ? String(m.team1PenScore) : "");
    setP2(m.team2PenScore != null ? String(m.team2PenScore) : "");
  }, [m.id, m.team1Score, m.team2Score, m.team1PenScore, m.team2PenScore]);

  const parseScorePair = (
    a: string,
    b: string,
    label: string
  ): { ok: true; v1: number | null; v2: number | null } | { ok: false; msg: string } => {
    const empty1 = a.trim() === "";
    const empty2 = b.trim() === "";
    if (empty1 !== empty2) {
      return { ok: false, msg: `Enter both ${label}, or leave both empty.` };
    }
    if (empty1) return { ok: true, v1: null, v2: null };
    const v1 = Number(a);
    const v2 = Number(b);
    if (!Number.isInteger(v1) || !Number.isInteger(v2) || v1 < 0 || v1 > 99 || v2 < 0 || v2 > 99) {
      return { ok: false, msg: `${label} must be whole numbers from 0 to 99.` };
    }
    return { ok: true, v1, v2 };
  };

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
    <tr className={`admin-match-row${needsAttention ? " admin-match-row--needs-attention" : ""}`}>
      <td className="admin-match-num">{m.number}</td>
      <td className="admin-match-teams-cell">
        <div className="admin-match-teams">
          <div className="admin-match-side">
            <div className="match-teams">
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
      <td className="match-status-cell">
        <MatchPickStatus
          mode="admin"
          layout="compact"
          date={m.date}
          isClosed={m.isClosed}
          closed={m.closed}
        />
      </td>
      <td className="admin-score-cell">
        <div className="admin-score-stack">
          <span className="admin-score-inputs">
            <input
              className="score"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              name={`match-${m.number}-ft1`}
              value={s1}
              onChange={(e) => setS1(e.target.value)}
            />
            <span className="muted">–</span>
            <input
              className="score"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              name={`match-${m.number}-ft2`}
              value={s2}
              onChange={(e) => setS2(e.target.value)}
            />
          </span>
          {knockout && (
            <span className="admin-score-inputs admin-score-inputs--pen">
              <span className="admin-score-pen-label">Pen</span>
              <input
                className="score score--pen"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                name={`match-${m.number}-pen1`}
                value={p1}
                onChange={(e) => setP1(e.target.value)}
              />
              <span className="muted">–</span>
              <input
                className="score score--pen"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                name={`match-${m.number}-pen2`}
                value={p2}
                onChange={(e) => setP2(e.target.value)}
              />
            </span>
          )}
        </div>
      </td>
      <td className="actions-cell">
        <div className="actions-cell__inner">
        <button
          type="button"
          className="button small primary admin-save-btn"
          onClick={async () => {
            const ft = parseScorePair(s1, s2, "scores");
            if (!ft.ok) {
              onError(ft.msg);
              return;
            }
            let pen1: number | null = null;
            let pen2: number | null = null;
            if (knockout) {
              const pen = parseScorePair(p1, p2, "penalty scores");
              if (!pen.ok) {
                onError(pen.msg);
                return;
              }
              pen1 = pen.v1;
              pen2 = pen.v2;
              if (pen1 != null && pen2 != null && pen1 === pen2) {
                onError("Penalty shootout cannot end in a tie.");
                return;
              }
              if (ft.v1 != null && ft.v2 != null && ft.v1 !== ft.v2 && (pen1 != null || pen2 != null)) {
                onError("Penalty scores only apply when the match is tied after 90 minutes plus extra time.");
                return;
              }
            }
            try {
              onError(null);
              await onSaveScoresAndRecalc({
                ...m,
                team1Score: ft.v1,
                team2Score: ft.v2,
                team1PenScore: knockout ? pen1 : null,
                team2PenScore: knockout ? pen2 : null,
              });
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
              onError(null);
              setS1("");
              setS2("");
              setP1("");
              setP2("");
              await onSaveScoresAndRecalc({
                ...m,
                team1Score: null,
                team2Score: null,
                team1PenScore: null,
                team2PenScore: null,
              });
            } catch (e: unknown) {
              onError(e instanceof Error ? e.message : "err");
            }
          }}
        >
          Clear score
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
        </div>
      </td>
    </tr>
  );
}
