import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { TeamResultsSummary } from "../lib/teamResultsSummary";
import { TeamFlag } from "./TeamFlag";

const SHOW_DELAY_MS = 350;

type Props = {
  teamCode: string | null;
  teamName: string | null;
  summary: TeamResultsSummary | null;
  children: ReactNode;
};

export function TeamResultsHint({ teamCode, teamName, summary, children }: Props) {
  const id = useId();
  const anchorRef = useRef<HTMLSpanElement>(null);
  const delayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const hasResults = (summary?.played.length ?? 0) > 0;

  const reposition = () => {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({ left: rect.left + rect.width / 2, top: rect.top });
  };

  const show = () => {
    if (!hasResults) return;
    if (delayRef.current) clearTimeout(delayRef.current);
    delayRef.current = setTimeout(() => {
      reposition();
      setOpen(true);
    }, SHOW_DELAY_MS);
  };

  const hide = () => {
    if (delayRef.current) clearTimeout(delayRef.current);
    setOpen(false);
  };

  const toggle = () => {
    if (!hasResults) return;
    if (open) {
      hide();
      return;
    }
    reposition();
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onScroll = () => reposition();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (anchorRef.current?.contains(e.target as Node)) return;
      hide();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(
    () => () => {
      if (delayRef.current) clearTimeout(delayRef.current);
    },
    []
  );

  if (!hasResults) return <>{children}</>;

  const tooltip =
    open && pos && summary ? (
      <div
        id={id}
        role="tooltip"
        className="team-results-tooltip team-results-tooltip--portal"
        style={{
          position: "fixed",
          left: pos.left,
          top: pos.top,
          transform: "translate(-50%, calc(-100% - 8px))",
          zIndex: 10000,
        }}
      >
        <p className="team-results-tooltip__title team-with-flag">
          <TeamFlag code={teamCode} size={18} title={teamName ?? undefined} />
          <span>{teamName ?? "Team"}</span>
        </p>
        <ul className="team-results-tooltip__list">
          {summary.played.map((row) => (
            <li key={row.matchNumber} className="team-results-tooltip__row">
              <span
                className={`team-results-tooltip__outcome team-results-tooltip__outcome--${row.outcome.toLowerCase()}`}
              >
                {row.outcome}
              </span>
              <span className="team-results-tooltip__score">{row.scoreLine}</span>
              <span className="muted team-results-tooltip__vs">vs</span>
              <span className="team-with-flag team-results-tooltip__opponent">
                <TeamFlag code={row.opponentCode} size={16} title={row.opponentName} />
                <span>{row.opponentName}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="team-results-tooltip__totals">
          {summary.points} pts · {summary.win}W {summary.draw}D {summary.lost}L · GD{" "}
          {summary.goalDifference >= 0 ? "+" : ""}
          {summary.goalDifference}
        </p>
      </div>
    ) : null;

  return (
    <>
      <span
        ref={anchorRef}
        className="team-results-hint"
        tabIndex={0}
        aria-describedby={open ? id : undefined}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={(e) => {
          e.stopPropagation();
          toggle();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
          if (e.key === "Escape") hide();
        }}
      >
        {children}
      </span>
      {tooltip ? createPortal(tooltip, document.body) : null}
    </>
  );
}
