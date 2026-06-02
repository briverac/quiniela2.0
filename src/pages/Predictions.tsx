import { useEffect, useMemo, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import { createPortal } from "react-dom";
import { apiJson } from "../api";
import { TeamFlag } from "../components/TeamFlag";
import { MatchPickStatus } from "../components/MatchPickStatus";
import { formatMatchResultDisplay, team1Win, team2Win, tie } from "../../worker/lib/matchLogic";
import { Bar, BarChart, CartesianGrid, Cell, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipContentProps } from "recharts";

/** WC26 host palette: local team / draw / visitor (USA · Mexico · Canada). */
const CROWD_SHARE_COLORS = ["#2A398D", "#3CAC3B", "#E61D25"] as const;

type CrowdChartDatum = { name: string; v: number; fill: string };

function abbrevChartLabel(name: string, maxLen: number): string {
  if (name.length <= maxLen) return name;
  return `${name.slice(0, Math.max(1, maxLen - 1))}…`;
}

function CrowdShareChart({ data }: { data: CrowdChartDatum[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      if (w > 0) setWidth(Math.floor(w));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const tickSize = (width ?? 0) < 100 ? 7 : (width ?? 0) < 140 ? 8 : 9;
  const labelMax = (width ?? 0) < 100 ? 4 : (width ?? 0) < 130 ? 6 : (width ?? 0) < 170 ? 8 : 12;
  const chartHeight = 50;
  const xAxisHeight = 20;

  return (
    <div ref={containerRef} className="predictions-chart__inner">
      {width != null && width >= 40 ? (
        <BarChart
          width={width}
          height={chartHeight}
          data={data}
          margin={{ top: 2, right: 2, left: 0, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: tickSize }}
            interval={0}
            height={xAxisHeight}
            tickFormatter={(v) => abbrevChartLabel(String(v), labelMax)}
          />
          <YAxis hide domain={[0, 100]} width={0} />
          <Tooltip
            content={(props) => <CrowdShareTooltip {...props} anchorRef={containerRef} />}
            cursor={{ fill: "rgb(15 23 42 / 0.04)" }}
            isAnimationActive={false}
            wrapperStyle={{ visibility: "hidden", pointerEvents: "none" }}
          />
          <Bar dataKey="v" maxBarSize={width < 100 ? 14 : 22}>
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      ) : null}
    </div>
  );
}

type CrowdShareTooltipProps = TooltipContentProps & {
  anchorRef: RefObject<HTMLDivElement | null>;
};

function CrowdShareTooltip({ active, payload, coordinate, anchorRef }: CrowdShareTooltipProps) {
  if (!active || !payload?.length || coordinate == null || !anchorRef.current) return null;

  const entry = payload[0];
  const datum = entry.payload as CrowdChartDatum | undefined;
  const n = Math.round(Number(entry.value));
  const fill = datum?.fill ?? CROWD_SHARE_COLORS[0];
  const name = datum?.name ?? "";

  const rect = anchorRef.current.getBoundingClientRect();
  const left = rect.left + coordinate.x;
  const top = rect.top + coordinate.y;

  return createPortal(
    <div
      className="crowd-share-tooltip crowd-share-tooltip--portal"
      style={{
        position: "fixed",
        left,
        top,
        transform: "translate(-50%, calc(-100% - 6px))",
        zIndex: 10000,
        pointerEvents: "none",
      }}
    >
      <span className="crowd-share-tooltip__label">{name}</span>
      <span className="crowd-share-tooltip__value" style={{ color: fill }}>
        {n}%
      </span>
    </div>,
    document.body,
  );
}

const ORDER_KEY = "quiniela_predictions_order";

type BootMatch = {
  id: number;
  number: number;
  date: string;
  phaseId: number;
  phaseName: string;
  team1Code: string | null;
  team2Code: string | null;
  team1FlagCode: string | null;
  team2FlagCode: string | null;
  team1Name: string | null;
  team2Name: string | null;
  team1Score: number | null;
  team2Score: number | null;
  team1PenScore: number | null;
  team2PenScore: number | null;
  isClosed: boolean;
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

function parsePredictionDraft(d: { s1: string; s2: string }): { score1: number; score2: number } | null {
  if (d.s1 === "" || d.s2 === "") return null;
  const score1 = Number(d.s1);
  const score2 = Number(d.s2);
  if (
    !Number.isInteger(score1) ||
    !Number.isInteger(score2) ||
    score1 < 0 ||
    score1 > 99 ||
    score2 < 0 ||
    score2 > 99
  ) {
    return null;
  }
  return { score1, score2 };
}

function draftFromPredictions(predictions: PredRes["data"]["predictions"]) {
  const d: Record<number, { s1: string; s2: string }> = {};
  for (const pr of predictions) {
    d[pr.id] = {
      s1: pr.score1 != null ? String(pr.score1) : "",
      s2: pr.score2 != null ? String(pr.score2) : "",
    };
  }
  return d;
}

function mergeDraftWithDirty(
  serverPredictions: PredRes["data"]["predictions"],
  prev: Record<number, { s1: string; s2: string }>,
) {
  const merged = draftFromPredictions(serverPredictions);
  for (const pr of serverPredictions) {
    const local = prev[pr.id];
    if (!local) continue;
    const saved = merged[pr.id];
    if (local.s1 !== saved.s1 || local.s2 !== saved.s2) {
      merged[pr.id] = local;
    }
  }
  return merged;
}

function collectSaveItems(
  pred: PredRes["data"],
  draft: Record<number, { s1: string; s2: string }>,
  matches: BootMatch[],
) {
  const closedByMatchId = new Map(matches.map((m) => [m.id, m.closed]));
  const items: { predictionId: number; score1: number; score2: number }[] = [];
  for (const pr of pred.predictions) {
    if (closedByMatchId.get(pr.matchId)) continue;
    const d = draft[pr.id];
    if (!d) continue;
    const parsed = parsePredictionDraft(d);
    if (!parsed) continue;
    items.push({ predictionId: pr.id, ...parsed });
  }
  return items;
}

type PredGrade = "exact" | "partial" | "miss" | "pending";

function formatScoreLine(s1: number | null, s2: number | null): string | null {
  if (s1 == null || s2 == null) return null;
  return `${s1} – ${s2}`;
}

function gradePrediction(
  pr: { score1: number | null; score2: number | null },
  m: Pick<BootMatch, "closed" | "team1Score" | "team2Score">,
): PredGrade | null {
  if (!m.closed) return null;
  if (m.team1Score == null || m.team2Score == null) return "pending";
  if (pr.score1 == null || pr.score2 == null) return "miss";
  const ms1 = m.team1Score;
  const ms2 = m.team2Score;
  const ps1 = pr.score1;
  const ps2 = pr.score2;
  if (ms1 === ps1 && ms2 === ps2) return "exact";
  const sameOutcome =
    (team1Win(ms1, ms2) && team1Win(ps1, ps2)) ||
    (team2Win(ms1, ms2) && team2Win(ps1, ps2)) ||
    (tie(ms1, ms2) && tie(ps1, ps2));
  return sameOutcome ? "partial" : "miss";
}

function PredGradeIcon({ grade }: { grade: "exact" | "partial" | "miss" }) {
  const cls = `pred-grade__icon pred-grade__icon--${grade}`;
  if (grade === "exact") {
    return (
      <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
      </svg>
    );
  }
  if (grade === "partial") {
    return (
      <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
        <path d="M2.5 9.5c1.5-2 2.5-2 4 0s2.5 2 4 0 2.5-2 4 0" />
      </svg>
    );
  }
  return (
    <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M4.5 4.5 11.5 11.5" />
      <path d="M11.5 4.5 4.5 11.5" />
    </svg>
  );
}

function ClosedPredictionDisplay({
  pr,
  m,
}: {
  pr: { score1: number | null; score2: number | null };
  m: BootMatch;
}) {
  const grade = gradePrediction(pr, m);
  const pick = formatScoreLine(pr.score1, pr.score2) ?? "—";
  const real =
    formatMatchResultDisplay(m.team1Score, m.team2Score, m.team1PenScore, m.team2PenScore) ??
    formatScoreLine(m.team1Score, m.team2Score);

  if (grade === "pending") {
    return <span className="pred-grade pred-grade--pending">{pick}</span>;
  }
  if (grade === "exact") {
    return (
      <span className="pred-grade pred-grade--exact">
        {pick}
        <PredGradeIcon grade="exact" />
      </span>
    );
  }
  if (grade === "partial" || grade === "miss") {
    return (
      <span className={`pred-grade pred-grade--${grade}`}>
        <span className="pred-grade__pick">{pick}</span>
        <PredGradeIcon grade={grade} />
        {real ? <span className="pred-grade__real">{real}</span> : null}
      </span>
    );
  }
  return <span className="pred-grade pred-grade--pending">{pick}</span>;
}

type RowProps = {
  m: BootMatch;
  pr: { id: number; matchId: number; score1: number | null; score2: number | null; points: number | null };
  draft: Record<number, { s1: string; s2: string }>;
  setDraft: Dispatch<SetStateAction<Record<number, { s1: string; s2: string }>>>;
  onSaveRow: (predictionId: number) => void;
  statsByMatchNumber: PredRes["data"]["statsByMatchNumber"];
  /** When set, show Time + Phase columns after # (date view). */
  timeLabel?: string;
  phaseLabel?: string;
};

function MatchPredictionRow({ m, pr, draft, setDraft, onSaveRow, statsByMatchNumber, timeLabel, phaseLabel }: RowProps) {
  const d = draft[pr.id] ?? { s1: "", s2: "" };
  const st = statsByMatchNumber[m.number];
  const chartData: CrowdChartDatum[] = st
    ? [
        { name: m.team1Name ?? "1", v: Math.round(st.team1), fill: CROWD_SHARE_COLORS[0] },
        { name: "Draw", v: Math.round(st.tie), fill: CROWD_SHARE_COLORS[1] },
        { name: m.team2Name ?? "2", v: Math.round(st.team2), fill: CROWD_SHARE_COLORS[2] },
      ]
    : [];
  return (
    <tr className="predictions-row">
      <td>{m.number}</td>
      {timeLabel != null && <td className="predictions-time">{timeLabel}</td>}
      {phaseLabel != null && <td className="predictions-phase">{phaseLabel}</td>}
      <td className="match-status-cell">
        <MatchPickStatus date={m.date} isClosed={m.isClosed} closed={m.closed} layout="stack" />
      </td>
      <td className="match-cell">
        <div className="match-teams">
          <span className="team-with-flag">
            <TeamFlag code={m.team1FlagCode ?? m.team1Code} title={m.team1Name ?? undefined} />
            <strong>{m.team1Name}</strong>
          </span>
          <span className="muted">vs</span>
          <span className="team-with-flag">
            <TeamFlag code={m.team2FlagCode ?? m.team2Code} title={m.team2Name ?? undefined} />
            <strong>{m.team2Name}</strong>
          </span>
        </div>
      </td>
      <td className="predictions-prediction">
        {m.closed ? (
          <ClosedPredictionDisplay pr={pr} m={m} />
        ) : (
          <span className="pred-inputs">
            <input
              className="score"
              inputMode="numeric"
              value={d.s1}
              onChange={(e) => setDraft((x) => ({ ...x, [pr.id]: { ...d, s1: e.target.value } }))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onSaveRow(pr.id);
                }
              }}
            />
            <span>–</span>
            <input
              className="score"
              inputMode="numeric"
              value={d.s2}
              onChange={(e) => setDraft((x) => ({ ...x, [pr.id]: { ...d, s2: e.target.value } }))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onSaveRow(pr.id);
                }
              }}
            />
          </span>
        )}
      </td>
      <td className="predictions-pts">{pr.points ?? "—"}</td>
      <td className="predictions-chart">
        {chartData.length > 0 ? <CrowdShareChart data={chartData} /> : <span className="muted">—</span>}
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
        setDraft((prev) => mergeDraftWithDirty(p.data.predictions, prev));
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

  const putPredictions = async (items: { predictionId: number; score1: number; score2: number }[]) => {
    if (!items.length) return;
    await apiJson("/api/predictions", { method: "PUT", json: { items } });
    load();
  };

  const save = async () => {
    if (!pred || !boot) return;
    setMsg(null);
    setErr(null);
    const items = collectSaveItems(pred, draft, boot.matches);
    if (!items.length) {
      setErr("Enter both scores (0–99) on at least one open match.");
      return;
    }
    try {
      await putPredictions(items);
      setMsg("Predictions updated!");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Error");
    }
  };

  const saveRow = async (predictionId: number) => {
    if (!pred || !boot) return;
    const pr = pred.predictions.find((p) => p.id === predictionId);
    const m = pr ? boot.matches.find((x) => x.id === pr.matchId) : undefined;
    if (m?.closed) return;
    setMsg(null);
    setErr(null);
    const items = collectSaveItems(pred, draft, boot.matches);
    if (!items.length) {
      setErr("Enter both scores (0–99) on at least one open match.");
      return;
    }
    try {
      await putPredictions(items);
      const savedThis = items.some((it) => it.predictionId === predictionId);
      if (savedThis && items.length === 1) {
        setMsg("Prediction saved!");
      } else if (savedThis) {
        setMsg("Predictions saved!");
      } else {
        setMsg("Other predictions saved. Enter both scores (0–99) for this match.");
      }
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

      <p className="predictions-deadline-notice">
        All matches close for predictions <strong>5 minutes before</strong> the scheduled kickoff.
      </p>

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
                <div className="table-wrap">
                <table className="table table-predictions">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Status</th>
                      <th>Match</th>
                      <th>Score</th>
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
                          onSaveRow={(id) => void saveRow(id)}
                          statsByMatchNumber={pred.statsByMatchNumber}
                        />
                      );
                    })}
                  </tbody>
                </table>
                </div>
              </section>
            );
          })}

      {order === "date" && (
        <section className="phase-block">
          <h2 className="sr-only">All matches by date</h2>
          {dayBuckets.map((bucket) => (
            <div key={bucket.key} className="day-block">
              <h3 className="subsection-title">{bucket.label}</h3>
              <div className="table-wrap">
              <table className="table table-predictions">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Time</th>
                    <th>Phase</th>
                    <th>Status</th>
                    <th>Match</th>
                    <th>Score</th>
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
                          onSaveRow={(id) => void saveRow(id)}
                          statsByMatchNumber={pred.statsByMatchNumber}
                          timeLabel={formatTime(m.date)}
                          phaseLabel={m.phaseName}
                        />
                      );
                  })}
                </tbody>
              </table>
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
