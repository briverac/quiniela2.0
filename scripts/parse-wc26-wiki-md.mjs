/**
 * One-off parser for Spanish Wikipedia "Anexo: Calendario Mundial 2026" markdown export.
 * Reads pipe-table rows | N | ... and prints JSON to stdout.
 */
import { readFileSync } from "node:fs";

const path = process.argv[2];
if (!path) {
  console.error("Usage: node scripts/parse-wc26-wiki-md.mjs <path-to.md>");
  process.exit(1);
}

const MONTHS = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

const UTC_ZONE = {
  "UTC-12": "Etc/GMT+12",
  "UTC-11": "Etc/GMT+11",
  "UTC-10": "Pacific/Honolulu",
  "UTC-9": "America/Anchorage",
  "UTC-8": "America/Los_Angeles",
  "UTC-7": "America/Los_Angeles",
  "UTC-6": "America/Mexico_City",
  "UTC-5": "America/New_York",
  "UTC-4": "America/New_York",
  "UTC-3": "America/Sao_Paulo",
  "UTC+0": "Etc/UTC",
};

function parseSpanishDate(s) {
  const m = s.match(/(\d{1,2})\s+de\s+(\w+)/i);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const mon = MONTHS[m[2].toLowerCase()];
  if (!mon) return null;
  return { day, month: mon, year: 2026 };
}

function cellTeam1Code(cell) {
  if (!cell) return null;
  const r1 = cell.match(/\)\s*([A-Z]{3})\[/);
  if (r1) return r1[1];
  const r2 = cell.trim().match(/^([A-Z]{3})\[/);
  return r2 ? r2[1] : null;
}

function cellTeam2Code(cell) {
  const r = cell.trim().match(/^([A-Z]{3})\[/);
  return r ? r[1] : null;
}

function parseTimeUtc(cell) {
  const tm = cell.match(/(\d{1,2}):(\d{2})/);
  const zm = cell.match(/UTC([+-]\d+)/i);
  if (!tm || !zm) return null;
  const hour = parseInt(tm[1], 10);
  const min = parseInt(tm[2], 10);
  const offset = zm[1];
  const key = `UTC${offset}`;
  const zone = UTC_ZONE[key] ?? "America/Chicago";
  return { hour, min, zone, key };
}

function extractGroup(parts) {
  const tail = parts.slice(5).join(" ");
  const g = tail.match(/Grupo\s+([A-L])/i);
  return g ? g[1] : null;
}

const text = readFileSync(path, "utf8");
const lines = text.split("\n");
const rows = [];
let lastDateStr = null;

for (const line of lines) {
  if (!/^\|\s*\d+\s+\|/.test(line)) continue;
  const parts = line.split("|").map((p) => p.trim());
  if (parts.length < 8) continue;
  const num = parseInt(parts[1], 10);
  const t1 = cellTeam1Code(parts[2] ?? "");
  const t2 = cellTeam2Code(parts[4] ?? "");
  const c5 = parts[5] ?? "";
  const c6 = parts[6] ?? "";

  if (/^(Lunes|Martes|Miércoles|Jueves|Viernes|Sábado|Domingo)\b/i.test(c5)) {
    lastDateStr = c5;
  }

  const timeCell = /^\d{1,2}:\d{2}/.test(c5) ? c5 : c6;
  const pt = parseTimeUtc(timeCell);
  if (!lastDateStr || !pt) {
    rows.push({ num, t1, t2, error: "missing_date_or_time", c5, c6 });
    continue;
  }

  const sd = parseSpanishDate(lastDateStr);
  if (!sd) {
    rows.push({ num, t1, t2, error: "bad_spanish_date", lastDateStr });
    continue;
  }

  const group = extractGroup(parts);
  rows.push({
    num,
    t1,
    t2,
    dateEs: lastDateStr,
    ...sd,
    hour: pt.hour,
    min: pt.min,
    zone: pt.zone,
    utcKey: pt.key,
    group,
  });
}

console.log(JSON.stringify(rows, null, 2));
