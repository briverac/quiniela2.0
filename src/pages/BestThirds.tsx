import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiJson } from "../api";
import { TeamFlag } from "../components/TeamFlag";

type Row = {
  rank: number;
  qualified: boolean;
  groupCode: string;
  code: string;
  name: string;
  matchesPlayed: number;
  win: number;
  draw: number;
  lost: number;
  goalInFavor: number;
  goalAgainst: number;
  goalDifference: number;
  points: number;
  r32Opponent: string | null;
};

type AnnexSlot = {
  matchNumber: number;
  winnerGroup: string;
  thirdGroup: string;
  opponentLabel: string;
  thirdTeamCode: string | null;
  thirdTeamName: string | null;
};

type ApiRes = {
  data: Row[];
  annex: { combinationKey: string; slots: AnnexSlot[] } | null;
};

export default function BestThirds() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [annex, setAnnex] = useState<ApiRes["annex"]>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    apiJson<ApiRes>("/api/groups/best-thirds")
      .then((r) => {
        setRows(r.data);
        setAnnex(r.annex);
      })
      .catch((e: Error) => setErr(e.message));
  }, []);

  if (err) return <div className="page error">{err}</div>;
  if (!rows) return <div className="page">Loading…</div>;

  return (
    <div className="page">
      <p className="muted">
        <Link to="/groups">← Back to groups</Link>
      </p>
      <h1>Best third-place teams</h1>
      <p className="muted" style={{ maxWidth: "42rem", lineHeight: 1.55 }}>
        The top two in each group advance automatically. Among the twelve third-placed sides, the{" "}
        <strong>best eight</strong> also reach the Round of 32. FIFA ranks them across all groups using
        only their <strong>full group record</strong> (not head-to-head within the group).
      </p>
      <p className="predictions-deadline-notice">
        Tiebreakers modeled here: <strong>points</strong>, then <strong>goal difference</strong>, then{" "}
        <strong>goals scored</strong>. Fair play (cards) and FIFA ranking are not included — ties after
        goals may differ from the official table.
      </p>

      {annex && (
        <section className="phase-block">
          <h2 className="subsection-title">Round of 32 assignments (FIFA Annex C)</h2>
          <p className="muted">
            Combination key: <code>{annex.combinationKey}</code> — which groups produced a qualifying
            third. Each row is a fixed R32 slot (no draw).
          </p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Match #</th>
                  <th>Opponent</th>
                  <th>Third (group)</th>
                  <th>Team</th>
                </tr>
              </thead>
              <tbody>
                {annex.slots.map((s) => (
                  <tr key={s.matchNumber}>
                    <td>{s.matchNumber}</td>
                    <td>{s.opponentLabel}</td>
                    <td>3{s.thirdGroup}</td>
                    <td>
                      {s.thirdTeamCode ? (
                        <span className="team-with-flag">
                          <TeamFlag code={s.thirdTeamCode} title={s.thirdTeamName ?? undefined} />
                          {s.thirdTeamName}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="table-wrap">
        <table className="table table-best-thirds">
          <thead>
            <tr>
              <th>#</th>
              <th>Team</th>
              <th>Group</th>
              <th>P</th>
              <th>W</th>
              <th>D</th>
              <th>L</th>
              <th>GF</th>
              <th>GA</th>
              <th>GD</th>
              <th>Pts</th>
              <th>R32</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr
                key={t.groupCode}
                className={
                  t.qualified
                    ? "best-thirds-row best-thirds-row--in"
                    : "best-thirds-row best-thirds-row--out"
                }
              >
                <td>{t.rank}</td>
                <td>
                  <span className="team-with-flag">
                    <TeamFlag code={t.code} title={t.name} />
                    {t.name}
                  </span>
                </td>
                <td>{t.groupCode}</td>
                <td>{t.matchesPlayed}</td>
                <td>{t.win}</td>
                <td>{t.draw}</td>
                <td>{t.lost}</td>
                <td>{t.goalInFavor}</td>
                <td>{t.goalAgainst}</td>
                <td>{t.goalDifference}</td>
                <td>{t.points}</td>
                <td>{t.r32Opponent ?? "—"}</td>
                <td>{t.qualified ? "Advances" : "Eliminated"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length >= 8 && (
        <p className="muted">Cut line after rank 8 — positions 9–12 are out.</p>
      )}
    </div>
  );
}
