/**
 * Verifies data/wc26.yml kickoff times (UTC) against the official FIFA calendar API.
 * Wikipedia-derived scripts can drift; this is the source of truth for wall-clock.
 *
 * Run: node scripts/check-wc26-times-fifa.mjs
 * Exit 1 if any of the 104 ordered matches differs from FIFA (useful in CI).
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

async function main() {
  const res = await fetch(FIFA, {
    headers: { "User-Agent": "quiniela2-wc26-check/1.0 (wc26.yml drift check)" },
  });
  if (!res.ok) {
    console.error("FIFA API HTTP", res.status);
    process.exit(2);
  }
  const data = await res.json();
  const byNum = Object.fromEntries(data.Results.map((r) => [r.MatchNumber, r.Date]));
  const doc = parse(readFileSync(join(root, "data/wc26.yml"), "utf8"));
  const mism = [];
  doc.matches.forEach((m, i) => {
    const n = i + 1;
    const fd = byNum[n];
    if (fd == null) mism.push({ n, reason: "missing in FIFA response" });
    else if (m.date !== fd) mism.push({ n, yaml: m.date, fifa: fd });
  });
  if (mism.length) {
    console.error("wc26.yml differs from FIFA calendar:", mism.length, "issue(s)");
    for (const x of mism) console.error(x);
    process.exit(1);
  }
  console.log("OK: all", doc.matches.length, "matches match FIFA API kickoff (UTC).");
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
