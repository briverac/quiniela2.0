/**
 * Verifies data/wc26.yml against the official FIFA calendar API:
 * - Kickoff times (UTC) — same as wall-clock source of truth.
 * - Bracket slots: team1_label/team2_label vs PlaceHolderA/B, or group team codes vs Home/Away.
 *
 * FIFA uses `RU101` for “runner-up / losing side of match 101”; we store `L101` (same meaning for
 * resolveBracketLabel). This script normalizes RU{n} → L{n} when comparing.
 *
 * Run: node scripts/check-wc26-times-fifa.mjs
 * Exit 1 on any mismatch (useful in CI).
 *
 * API: https://api.fifa.com/api/v3/calendar/matches?idseason=285023
 * (season id 285023 = FIFA World Cup 2026™)
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parse } from "yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const FIFA =
  "https://api.fifa.com/api/v3/calendar/matches?idseason=285023&language=es&count=500";

/** Uppercase trim; map FIFA RU{n} (third-place / losing ref) to our L{n} labels. */
function normalizeSlot(s) {
  const t = String(s ?? "").trim().toUpperCase();
  const ru = t.match(/^RU(\d+)$/);
  if (ru) return `L${ru[1]}`;
  return t;
}

async function main() {
  const res = await fetch(FIFA, {
    headers: { "User-Agent": "quiniela2-wc26-check/1.0 (wc26.yml drift check)" },
  });
  if (!res.ok) {
    console.error("FIFA API HTTP", res.status);
    process.exit(2);
  }
  const data = await res.json();
  const byNum = Object.fromEntries(data.Results.map((r) => [r.MatchNumber, r]));
  const doc = parse(readFileSync(join(root, "data/wc26.yml"), "utf8"));
  const timeMism = [];
  const slotMism = [];
  doc.matches.forEach((m, i) => {
    const n = i + 1;
    const row = byNum[n];
    if (row == null) {
      timeMism.push({ n, reason: "missing in FIFA response" });
      return;
    }
    if (m.date !== row.Date) timeMism.push({ n, yaml: m.date, fifa: row.Date });

    if (m.team1_label) {
      if (normalizeSlot(m.team1_label) !== normalizeSlot(row.PlaceHolderA)) {
        slotMism.push({ n, side: "team1_label", yaml: m.team1_label, fifa: row.PlaceHolderA });
      }
    } else if (m.team1) {
      const h = row.Home?.Abbreviation?.toLowerCase();
      if (h !== m.team1) slotMism.push({ n, side: "team1", yaml: m.team1, fifaHome: h });
    }
    if (m.team2_label) {
      if (normalizeSlot(m.team2_label) !== normalizeSlot(row.PlaceHolderB)) {
        slotMism.push({ n, side: "team2_label", yaml: m.team2_label, fifa: row.PlaceHolderB });
      }
    } else if (m.team2) {
      const a = row.Away?.Abbreviation?.toLowerCase();
      if (a !== m.team2) slotMism.push({ n, side: "team2", yaml: m.team2, fifaAway: a });
    }
  });
  if (timeMism.length) {
    console.error("wc26.yml differs from FIFA API kickoff:", timeMism.length, "issue(s)");
    for (const x of timeMism) console.error(x);
    process.exit(1);
  }
  if (slotMism.length) {
    console.error("wc26.yml differs from FIFA API bracket slots:", slotMism.length, "issue(s)");
    for (const x of slotMism) console.error(x);
    process.exit(1);
  }
  console.log(
    "OK: all",
    doc.matches.length,
    "matches match FIFA API (UTC kickoff + placeholders / group teams)."
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
