import { useEffect, useState } from "react";
import { apiJson } from "../api";
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";

type Bootstrap = {
  data: {
    tournament: { code: string; name: string };
    phases: { id: number; code: string; name: string; level: number }[];
    matches: {
      id: number;
      number: number;
      phaseId: number;
      phaseName: string;
      team1Name: string | null;
      team2Name: string | null;
      closed: boolean;
    }[];
  };
};

type PredRes = {
  data: {
    predictionSet: { id: number; points: number };
    predictions: { id: number; matchId: number; score1: number | null; score2: number | null; points: number | null }[];
    statsByMatchNumber: Record<number, { team1: number; team2: number; tie: number }>;
  };
};

export default function Predictions() {
  const [boot, setBoot] = useState<Bootstrap["data"] | null>(null);
  const [pred, setPred] = useState<PredRes["data"] | null>(null);
  const [draft, setDraft] = useState<Record<number, { s1: string; s2: string }>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = () => {
    setErr(null);
    Promise.all([
      apiJson<Bootstrap>("/api/tournaments/WC26/bootstrap"),
      apiJson<PredRes>("/api/predictions"),
    ])
      .then(([b, p]) => {
        setBoot(b.data);
        setPred(p.data);
        const d: Record<number, { s1: string; s2: string }> = {};
        for (const pr of p.data.predictions) {
          d[pr.id] = {
            s1: pr.score1 != null ? String(pr.score1) : "",
            s2: pr.score2 != null ? String(pr.score2) : "",
          };
        }
        setDraft(d);
      })
      .catch((e: Error) => setErr(e.message));
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    if (!pred) return;
    setMsg(null);
    setErr(null);
    const items: { predictionId: number; score1: number; score2: number }[] = [];
    for (const pr of pred.predictions) {
      const d = draft[pr.id];
      if (!d) continue;
      if (d.s1 === "" || d.s2 === "") continue;
      const score1 = Number(d.s1);
      const score2 = Number(d.s2);
      if (Number.isNaN(score1) || Number.isNaN(score2)) continue;
      items.push({ predictionId: pr.id, score1, score2 });
    }
    try {
      await apiJson("/api/predictions", { method: "PUT", json: { items } });
      setMsg("Predictions updated!");
      load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Error");
    }
  };

  if (err && !boot) return <div className="page error">{err}</div>;
  if (!boot || !pred) return <div className="page">Loading…</div>;

  return (
    <div className="page">
      <h1>
        {boot.tournament.name} <span className="muted">({boot.tournament.code})</span>
      </h1>
      <p className="points-line">
        Your points: <strong>{pred.predictionSet.points}</strong>
      </p>
      {msg && <p className="ok">{msg}</p>}
      {err && <p className="error">{err}</p>}

      <div className="actions">
        <button type="button" className="button primary" onClick={save}>
          Save predictions
        </button>
      </div>

      {boot.phases
        .slice()
        .sort((a, b) => a.level - b.level || a.code.localeCompare(b.code))
        .map((ph) => {
          const matches = boot.matches.filter((m) => m.phaseId === ph.id);
          if (!matches.length) return null;
          return (
            <section key={ph.id} className="phase-block">
              <h2>{ph.name}</h2>
              <table className="table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Match</th>
                    <th>Prediction</th>
                    <th>Pts</th>
                    <th>Crowd %</th>
                  </tr>
                </thead>
                <tbody>
                  {matches.map((m) => {
                    const pr = pred.predictions.find((p) => p.matchId === m.id);
                    if (!pr) return null;
                    const d = draft[pr.id] ?? { s1: "", s2: "" };
                    const st = pred.statsByMatchNumber[m.number];
                    const chartData = st
                      ? [
                          { name: m.team1Name ?? "1", v: Math.round(st.team1) },
                          { name: "Draw", v: Math.round(st.tie) },
                          { name: m.team2Name ?? "2", v: Math.round(st.team2) },
                        ]
                      : [];
                    return (
                      <tr key={m.id}>
                        <td>{m.number}</td>
                        <td>
                          <strong>{m.team1Name}</strong> vs <strong>{m.team2Name}</strong>
                          {m.closed && <span className="badge">Closed</span>}
                        </td>
                        <td>
                          {m.closed ? (
                            <span>
                              {pr.score1 ?? "—"} – {pr.score2 ?? "—"}
                            </span>
                          ) : (
                            <span className="pred-inputs">
                              <input
                                className="score"
                                inputMode="numeric"
                                value={d.s1}
                                onChange={(e) =>
                                  setDraft((x) => ({ ...x, [pr.id]: { ...d, s1: e.target.value } }))
                                }
                              />
                              <span>–</span>
                              <input
                                className="score"
                                inputMode="numeric"
                                value={d.s2}
                                onChange={(e) =>
                                  setDraft((x) => ({ ...x, [pr.id]: { ...d, s2: e.target.value } }))
                                }
                              />
                            </span>
                          )}
                        </td>
                        <td>{pr.points ?? "—"}</td>
                        <td style={{ verticalAlign: "middle" }}>
                          {chartData.length > 0 && (
                            <BarChart
                              width={200}
                              height={76}
                              data={chartData}
                              margin={{ top: 4, right: 4, left: 0, bottom: 4 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="name" tick={{ fontSize: 9 }} interval={0} height={36} />
                              <YAxis hide domain={[0, 100]} />
                              <Tooltip />
                              <Bar dataKey="v" fill="#3b82f6" name="%" />
                            </BarChart>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          );
        })}
    </div>
  );
}
