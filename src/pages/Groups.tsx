import { useEffect, useState } from "react";
import { apiJson } from "../api";

type Row = {
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
};

type Data = { data: { code: string; teams: Row[] }[] };

export default function Groups() {
  const [data, setData] = useState<Data["data"] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    apiJson<Data>("/api/groups/standings")
      .then((r) => setData(r.data))
      .catch((e: Error) => setErr(e.message));
  }, []);
  if (err) return <div className="page error">{err}</div>;
  if (!data) return <div className="page">Loading…</div>;

  return (
    <div className="page">
      <h1>Group standings</h1>
      {data.map((g) => (
        <section key={g.code} className="phase-block">
          <h2>Group {g.code}</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Team</th>
                <th>P</th>
                <th>W</th>
                <th>D</th>
                <th>L</th>
                <th>GF</th>
                <th>GA</th>
                <th>GD</th>
                <th>Pts</th>
              </tr>
            </thead>
            <tbody>
              {g.teams.map((t) => (
                <tr key={t.code}>
                  <td>{t.name}</td>
                  <td>{t.matchesPlayed}</td>
                  <td>{t.win}</td>
                  <td>{t.draw}</td>
                  <td>{t.lost}</td>
                  <td>{t.goalInFavor}</td>
                  <td>{t.goalAgainst}</td>
                  <td>{t.goalDifference}</td>
                  <td>{t.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
