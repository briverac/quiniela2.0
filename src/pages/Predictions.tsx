import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { apiJson } from "../api";
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";

const ORDER_KEY = "quiniela_predictions_order";

type BootMatch = {
  id: number;
  number: number;
  date: string;
  phaseId: number;
  phaseName: string;
  team1Name: string | null;
  team2Name: string | null;
  closed: boolean;
};

type Bootstrap = {
  data: {
    tournament: { code: string; name: string };
    phases: { id: number; code: string; name: string; level: number }[];
    matches: BootMatch[];
  };
};

type PredRes = {
  data: {
    predictionSet: { id: number; points: number };
    predictions: { id: number; matchId: number; score1: number | null; score2: number | null; points: number | null }[];
    statsByMatchNumber: Record<number, { team1: number; team2: number; tie: number }>;
  };
};

type OrderMode = "groups" | "date";

function readOrderPref(): OrderMode {
  try {
    const v = localStorage.getItem(ORDER_KEY);
    if (v === "groups" || v === "date") return v;
  } catch {
    /* ignore */
  }
  return "date";
}

function localDayInfo(iso: string): { key: string; label: string } {
  const d = new Date(iso);
  const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  const label = d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return { key, label };
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

type RowProps = {
  m: BootMatch;
  pr: { id: number; matchId: number; score1: number | null; score2: number | null; points: number | null };
  draft: Record<number, { s1: string; s2: string }>;
  setDraft: Dispatch<SetStateAction<Record<number, { s1: string; s2: string }>>>;
  statsByMatchNumber: PredRes["data"]["statsByMatchNumber"];
  /** When set, show Time + Phase columns after # (date view). */
  timeLabel?: string;
  phaseLabel?: string;
};

function MatchPredictionRow({ m, pr, draft, setDraft, statsByMatchNumber, timeLabel, phaseLabel }: RowProps) {
  const d = draft[pr.id] ?? { s1: "", s2: "" };
  const st = statsByMatchNumber[m.number];
  const chartData = st
    ? [
        { name: m.team1Name ?? "1", v: Math.round(st.team1) },
        { name: "Draw", v: Math.round(st.tie) },
        { name: m.team2Name ?? "2", v: Math.round(st.team2) },
      ]
    : [];
  return (
    <tr>
      <td>{m.number}</td>
      {timeLabel != null && <td>{timeLabel}</td>}
      {phaseLabel != null && (
        <td className="muted" style={{ fontSize: "0.85rem" }}>
          {phaseLabel}
        </td>
      )}
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
              onChange={(e) => setDraft((x) => ({ ...x, [pr.id]: { ...d, s1: e.target.value } }))}
            />
            <span>–</span>
            <input
              className="score"
              inputMode="numeric"
              value={d.s2}
              onChange={(e) => setDraft((x) => ({ ...x, [pr.id]: { ...d, s2: e.target.value } }))}
            />
          </span>
        )}
      </td>
      <td>{pr.points ?? "—"}</td>
      <td style={{ verticalAlign: "middle" }}>
        {chartData.length > 0 && (
          <BarChart width={200} height={76} data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 4 }}>
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
}

export default function Predictions() {
  const [boot, setBoot] = useState<Bootstrap["data"] | null>(null);
  const [pred, setPred] = useState<PredRes["data"] | null>(null);
  const [draft, setDraft] = useState<Record<number, { s1: string; s2: string }>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [order, setOrder] = useState<OrderMode>(readOrderPref);

  useEffect(() => {
    try {
      localStorage.setItem(ORDER_KEY, order);
    } catch {
      /* ignore */
    }
  }, [order]);

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

  const dayBuckets = useMemo(() => {
    if (!boot) return [];
    const sorted = [...boot.matches].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const buckets: { key: string; label: string; matches: BootMatch[] }[] = [];
    for (const m of sorted) {
      const { key, label } = localDayInfo(m.date);
      const last = buckets[buckets.length - 1];
      if (!last || last.key !== key) {
        buckets.push({ key, label, matches: [m] });
      } else {
        last.matches.push(m);
      }
    }
    return buckets;
  }, [boot]);

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

      <div className="actions form-row" style={{ alignItems: "center", justifyContent: "space-between" }}>
        <button type="button" className="button primary" onClick={save}>
          Save predictions
        </button>
        <div className="tabs view-toggle" role="group" aria-label="How to order matches">
          <button
            type="button"
            className={`tab ${order === "groups" ? "tab-active" : ""}`}
            aria-pressed={order === "groups"}
            onClick={() => setOrder("groups")}
          >
            Order by group
          </button>
          <button
            type="button"
            className={`tab ${order === "date" ? "tab-active" : ""}`}
            aria-pressed={order === "date"}
            onClick={() => setOrder("date")}
          >
            Order by date
          </button>
        </div>
      </div>

      {order === "groups" &&
        boot.phases
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
                      return (
                        <MatchPredictionRow
                          key={m.id}
                          m={m}
                          pr={pr}
                          draft={draft}
                          setDraft={setDraft}
                          statsByMatchNumber={pred.statsByMatchNumber}
                        />
                      );
                    })}
                  </tbody>
                </table>
              </section>
            );
          })}

      {order === "date" && (
        <section className="phase-block">
          <h2 className="sr-only">All matches by date</h2>
          {dayBuckets.map((bucket) => (
            <div key={bucket.key} className="day-block">
              <h3 className="subsection-title">{bucket.label}</h3>
              <table className="table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Time</th>
                    <th>Phase</th>
                    <th>Match</th>
                    <th>Prediction</th>
                    <th>Pts</th>
                    <th>Crowd %</th>
                  </tr>
                </thead>
                <tbody>
                  {bucket.matches.map((m) => {
                    const pr = pred.predictions.find((p) => p.matchId === m.id);
                    if (!pr) return null;
                      return (
                        <MatchPredictionRow
                          key={m.id}
                          m={m}
                          pr={pr}
                          draft={draft}
                          setDraft={setDraft}
                          statsByMatchNumber={pred.statsByMatchNumber}
                          timeLabel={formatTime(m.date)}
                          phaseLabel={m.phaseName}
                        />
                      );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
