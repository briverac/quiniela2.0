/**
 * Emit SQL that only updates matches.date (and updated_at) from data/wc26.yml.
 * Use when 0002/0003 already ran: add a NEW migration file (0004, 0005, …) and apply with wrangler.
 *
 * Usage:
 *   node scripts/emit-match-date-migration.mjs migrations/0005_wc26_match_dates.sql
 *   OUT=migrations/0005_wc26_match_dates.sql node scripts/emit-match-date-migration.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parse } from "yaml";
import { DateTime } from "luxon";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const seedFile = process.env.SEED_YAML ?? "data/wc26.yml";
const outPath = process.argv[2] ?? process.env.OUT;
if (!outPath) {
  console.error(
    "Usage: node scripts/emit-match-date-migration.mjs <output.sql>\n" +
      "Example: node scripts/emit-match-date-migration.mjs migrations/0005_wc26_match_dates.sql"
  );
  process.exit(1);
}

function parseMatchDate(str) {
  if (/^\d{4}-\d{2}-\d{2}T/.test(str)) {
    const dt = DateTime.fromISO(str, { zone: "utc" });
    if (!dt.isValid) throw new Error(`Bad ISO date: ${str} ${dt.invalidReason}`);
    return dt.toISO({ suppressMilliseconds: true });
  }
  const s = str.replace(/ CST$/, "");
  const dt = DateTime.fromFormat(s, "yyyy-MM-dd HH:mm", { zone: "America/Chicago" });
  if (!dt.isValid) throw new Error(`Bad date: ${str} ${dt.invalidReason}`);
  return dt.toUTC().toISO({ suppressMilliseconds: true });
}

const doc = parse(readFileSync(join(root, seedFile), "utf8"));
const code = doc.tournament?.code ?? "WC26";

const lines = [
  `-- Sync WC26 kickoff times from ${seedFile} (no INSERT/DELETE — safe for DBs with predictions).`,
  `-- Generated: node scripts/emit-match-date-migration.mjs`,
  `-- Targets tournament code ${code} (matches.id = number = 1..${doc.matches.length} in standard seed).`,
  "",
];

let n = 0;
for (const m of doc.matches) {
  n++;
  const iso = parseMatchDate(m.date);
  lines.push(
    `UPDATE matches SET date = '${iso}', updated_at = datetime('now') WHERE tournament_id = (SELECT id FROM tournaments WHERE code = '${code}' LIMIT 1) AND number = ${n};`
  );
}

writeFileSync(outPath, lines.join("\n") + "\n", "utf8");
console.log("Wrote", outPath, `(${n} UPDATEs)`);
