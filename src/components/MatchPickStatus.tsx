import { useEffect, useState } from "react";
import { formatPredictionCloseCountdown } from "../../worker/lib/matchLogic";

function formatKickoff(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function formatKickoffTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

function StatusBadge({ label, variant }: { label: string; variant: string }) {
  return (
    <span className={`badge badge--${variant}`} role="status">
      {label}
    </span>
  );
}

function StatusStack({
  badge,
  variant,
  primary,
  secondary,
  title,
}: {
  badge: string;
  variant: string;
  primary: string;
  secondary?: string;
  title?: string;
}) {
  return (
    <div className="match-status-stack">
      <StatusBadge label={badge} variant={variant} />
      <p className="match-status-hint" title={title}>
        {primary}
      </p>
      {secondary ? <p className="match-status-hint match-status-hint--sub">{secondary}</p> : null}
    </div>
  );
}

function OpenPickStatus({ date, layout }: { date: string; layout: MatchPickStatusProps["layout"] }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const countdown = formatPredictionCloseCountdown(date, now);
  const title = `Kickoff ${formatKickoff(date)}. Predictions lock 5 minutes before start.`;

  if (layout === "inline") {
    return <StatusBadge label="Open" variant="open" />;
  }

  if (layout === "compact") {
    return (
      <div className="match-status-compact">
        <StatusBadge label="Open" variant="open" />
        <span className="match-status-hint match-status-hint--inline" title={title}>
          {countdown}
        </span>
      </div>
    );
  }

  return <StatusStack badge="Open" variant="open" primary={countdown} title={title} />;
}

export type MatchPickStatusProps = {
  closed: boolean;
  isClosed?: boolean;
  date: string;
  mode?: "admin" | "public";
  layout?: "stack" | "inline" | "compact";
};

export function MatchPickStatus({
  closed,
  isClosed = false,
  date,
  mode = "public",
  layout = "stack",
}: MatchPickStatusProps) {
  if (!closed) {
    return <OpenPickStatus date={date} layout={layout} />;
  }

  const pickDeadlineHint = `Predictions close 5 minutes before kickoff (${formatKickoff(date)})`;
  const pastDeadline = closed && !isClosed;
  const kick = formatKickoffTime(date);

  if (mode === "admin") {
    const items: { label: string; hint: string; variant: string }[] = [];
    if (pastDeadline) {
      items.push({
        label: "Picks closed",
        hint: kick ? `5 min before ${kick} kickoff` : "5 min before kickoff",
        variant: "deadline",
      });
    }
    if (isClosed) {
      items.push({ label: "Admin lock", hint: "Locked manually in admin", variant: "admin-lock" });
    }
    if (layout === "compact") {
      return (
        <div className="match-status-compact match-status-compact--multi">
          {items.map((item) => (
            <span key={item.label} className="match-status-compact__row" title={item.hint}>
              <StatusBadge label={item.label} variant={item.variant} />
            </span>
          ))}
        </div>
      );
    }
    return (
      <div className={layout === "stack" ? "match-status-stack" : "match-status-badges"}>
        {items.map((item) => (
          <div key={item.label} className="match-status-stack__item">
            <StatusBadge label={item.label} variant={item.variant} />
            {layout === "stack" && <p className="match-status-hint">{item.hint}</p>}
          </div>
        ))}
      </div>
    );
  }

  const primary = isClosed ? "Locked by admin" : "Deadline passed";

  if (layout === "stack") {
    return (
      <StatusStack badge="Closed" variant="closed" primary={primary} title={pickDeadlineHint} />
    );
  }

  return (
    <div className="match-status-badges">
      <StatusBadge label="Closed" variant="closed" />
    </div>
  );
}

/** @deprecated Use MatchPickStatus */
export const MatchStatusBadges = MatchPickStatus;
