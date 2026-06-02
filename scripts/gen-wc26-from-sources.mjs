/**
 * Builds data/wc26.yml from:
 * - Spanish Wikipedia annex markdown (local kickoff + UTC offset; venue zones)
 * - Hiraoka blog (America/Lima) for rows where the wiki table drops date/time cells
 *
 * Run: node scripts/gen-wc26-from-sources.mjs [path-to-wiki.md]
 * Default wiki path points at Cursor upload location.
 *
 * After regenerating from wiki, align kickoffs with FIFA (authoritative UTC):
 *   npm run db:check-wc26-fifa
 * If that fails, fix `date` fields in data/wc26.yml to match
 * https://api.fifa.com/api/v3/calendar/matches?idseason=285023 (see scripts/check-wc26-times-fifa.mjs).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { DateTime } from "luxon";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const DEFAULT_WIKI =
  process.env.WC26_WIKI_MD ??
  join(
    process.env.HOME ?? "",
    ".cursor/projects/Users-bryan-code-quiniela/uploads/Anexo_Calendario_de_la_Copa_Mundial_de_F_tbol_de_2026-0.md"
  );

const wikiPath = process.argv[2] || DEFAULT_WIKI;

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
  "UTC-5": "America/Chicago",
  "UTC-4": "America/New_York",
  "UTC-3": "America/Sao_Paulo",
  "UTC+0": "Etc/UTC",
};

/** When wiki cells are empty, use Hiraoka (Peru local time) for that calendar day. */
const LIMA_FIXUP = {
  50: { day: 24, month: 6, hour: 17, min: 0 },
  52: { day: 24, month: 6, hour: 14, min: 0 },
  54: { day: 24, month: 6, hour: 20, min: 0 },
  56: { day: 25, month: 6, hour: 15, min: 0 },
  58: { day: 25, month: 6, hour: 18, min: 0 },
  60: { day: 25, month: 6, hour: 21, min: 0 },
  62: { day: 26, month: 6, hour: 14, min: 0 },
  64: { day: 26, month: 6, hour: 22, min: 0 },
  68: { day: 27, month: 6, hour: 16, min: 0 },
  70: { day: 27, month: 6, hour: 21, min: 0 },
  72: { day: 27, month: 6, hour: 18, min: 30 },
};

const GROUP_OF_TEAM = {};
const GROUPS = {
  A: ["mex", "rsa", "kor", "cze"],
  B: ["can", "bih", "qat", "sui"],
  C: ["bra", "mar", "hai", "sco"],
  D: ["usa", "par", "aus", "tur"],
  E: ["civ", "ecu", "ger", "cuw"],
  F: ["ned", "jpn", "swe", "tun"],
  G: ["bel", "egy", "irn", "nzl"],
  H: ["ksa", "uru", "esp", "cpv"],
  I: ["fra", "sen", "irq", "nor"],
  J: ["arg", "alg", "aut", "jor"],
  K: ["por", "cod", "uzb", "col"],
  L: ["eng", "cro", "gha", "pan"],
};
for (const [g, codes] of Object.entries(GROUPS)) {
  for (const c of codes) GROUP_OF_TEAM[c] = g;
}

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
  if (r1) return r1[1].toLowerCase();
  const r2 = cell.trim().match(/^([A-Z]{3})\[/);
  return r2 ? r2[1].toLowerCase() : null;
}

function cellTeam2Code(cell) {
  const r = cell?.trim().match(/^([A-Z]{3})\[/);
  return r ? r[1].toLowerCase() : null;
}

function parseTimeUtc(cell) {
  if (!cell) return null;
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
  return g ? g[1].toUpperCase() : null;
}

function toIsoUtc({ year, month, day, hour, min, zone }) {
  const dt = DateTime.fromObject({ year, month, day, hour, minute: min }, { zone });
  if (!dt.isValid) throw new Error(dt.invalidExplanation);
  return dt.toUTC().toISO({ suppressMilliseconds: true });
}

/** Bracket slots from FIFA schedule + Hiraoka wording (73–88 R32). */
const KO_R32 = [
  { n: 73, l1: "2A", l2: "2B" },
  { n: 74, l1: "1E", l2: "3ABCDF" },
  { n: 75, l1: "1F", l2: "2C" },
  { n: 76, l1: "1C", l2: "2F" },
  { n: 77, l1: "1I", l2: "3CDFGH" },
  { n: 78, l1: "2E", l2: "2I" },
  { n: 79, l1: "1A", l2: "3CEFHI" },
  { n: 80, l1: "1L", l2: "3EHIJK" },
  { n: 81, l1: "1D", l2: "3BEFIJ" },
  { n: 82, l1: "1G", l2: "3AEHIJ" },
  { n: 83, l1: "2K", l2: "2L" },
  { n: 84, l1: "1H", l2: "2J" },
  { n: 85, l1: "1B", l2: "3EFGIJ" },
  { n: 86, l1: "1J", l2: "2H" },
  { n: 87, l1: "1K", l2: "3DEIJL" },
  { n: 88, l1: "2D", l2: "2G" },
];

const KO_R16 = [
  { n: 89, l1: "W74", l2: "W77" },
  { n: 90, l1: "W73", l2: "W75" },
  { n: 91, l1: "W76", l2: "W78" },
  { n: 92, l1: "W79", l2: "W80" },
  { n: 93, l1: "W83", l2: "W84" },
  { n: 94, l1: "W81", l2: "W82" },
  { n: 95, l1: "W86", l2: "W88" },
  { n: 96, l1: "W85", l2: "W87" },
];

const KO_QF = [
  { n: 97, l1: "W89", l2: "W90" },
  { n: 98, l1: "W93", l2: "W94" },
  { n: 99, l1: "W91", l2: "W92" },
  { n: 100, l1: "W95", l2: "W96" },
];

const KO_SF = [
  { n: 101, l1: "W97", l2: "W98" },
  { n: 102, l1: "W99", l2: "W100" },
];

const KO_REST = [
  { n: 103, l1: "L101", l2: "L102" },
  { n: 104, l1: "W101", l2: "W102" },
];

function parseWikiRows(text) {
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
    let iso = null;
    let group = extractGroup(parts);

    if (lastDateStr && pt) {
      const sd = parseSpanishDate(lastDateStr);
      if (sd) {
        iso = toIsoUtc({ ...sd, hour: pt.hour, min: pt.min, zone: pt.zone });
      }
    }

    if (!iso && LIMA_FIXUP[num] && t1 && t2) {
      const f = LIMA_FIXUP[num];
      iso = toIsoUtc({ year: 2026, ...f, zone: "America/Lima" });
    }

    rows.push({ num, t1, t2, iso, group, lastDateStr });
  }
  return rows;
}

const text = readFileSync(wikiPath, "utf8");
const wikiRows = parseWikiRows(text);
const byNum = Object.fromEntries(wikiRows.map((r) => [r.num, r]));

const missing = wikiRows.filter((r) => !r.iso && r.num <= 104);
if (missing.length) {
  console.error("Rows without ISO:", missing.map((m) => m.num).join(", "));
  process.exit(1);
}

function phaseForGroup(g) {
  if (!g) throw new Error("missing group");
  return g.toUpperCase();
}

const teamsYaml = Object.entries(GROUPS)
  .flatMap(([g, codes]) => codes.map((code) => `  - code: '${code}'\n    group: '${g}'`))
  .join("\n");

const groupMatches = [];
for (let n = 1; n <= 72; n++) {
  const r = byNum[n];
  if (!r?.t1 || !r?.t2) throw new Error(`Group match ${n} missing teams`);
  const g = r.group ?? GROUP_OF_TEAM[r.t1];
  if (!g) throw new Error(`Group match ${n} cannot resolve group for ${r.t1}-${r.t2}`);
  groupMatches.push({
    n,
    phase: phaseForGroup(g),
    team1: r.t1,
    team2: r.t2,
    iso: r.iso,
  });
}

function koMatch(n, phase, l1, l2) {
  const r = byNum[n];
  if (!r?.iso) throw new Error(`KO ${n} no iso`);
  return { n, phase, team1_label: l1, team2_label: l2, iso: r.iso };
}

const ko = [
  ...KO_R32.map((x) => koMatch(x.n, "round_of_32", x.l1, x.l2)),
  ...KO_R16.map((x) => koMatch(x.n, "round_of_16", x.l1, x.l2)),
  ...KO_QF.map((x) => koMatch(x.n, "quarter_finals", x.l1, x.l2)),
  ...KO_SF.map((x) => koMatch(x.n, "semi_finals", x.l1, x.l2)),
  koMatch(103, "third_place", KO_REST[0].l1, KO_REST[0].l2),
  koMatch(104, "final", KO_REST[1].l1, KO_REST[1].l2),
];

const matchesYaml = [...groupMatches, ...ko.map((k) => ({ ...k }))]
  .sort((a, b) => a.n - b.n)
  .map((m) => {
    if (m.team1) {
      return `  - date: '${m.iso}'\n    team1: ${m.team1}\n    team2: ${m.team2}\n    phase: ${m.phase}`;
    }
    return `  - date: '${m.iso}'\n    team1_label: '${m.team1_label}'\n    team2_label: '${m.team2_label}'\n    phase: ${m.phase}`;
  })
  .join("\n");

const yaml = `tournament:
  code: 'WC26'
admins:
  - email: 'bryan.rivera@lognllc.com'
phases:
  - code: 'A'
    level: 1
    small_points: 1
    big_points: 3
    active: true
  - code: 'B'
    level: 1
    small_points: 1
    big_points: 3
    active: true
  - code: 'C'
    level: 1
    small_points: 1
    big_points: 3
    active: true
  - code: 'D'
    level: 1
    small_points: 1
    big_points: 3
    active: true
  - code: 'E'
    level: 1
    small_points: 1
    big_points: 3
    active: true
  - code: 'F'
    level: 1
    small_points: 1
    big_points: 3
    active: true
  - code: 'G'
    level: 1
    small_points: 1
    big_points: 3
    active: true
  - code: 'H'
    level: 1
    small_points: 1
    big_points: 3
    active: true
  - code: 'I'
    level: 1
    small_points: 1
    big_points: 3
    active: true
  - code: 'J'
    level: 1
    small_points: 1
    big_points: 3
    active: true
  - code: 'K'
    level: 1
    small_points: 1
    big_points: 3
    active: true
  - code: 'L'
    level: 1
    small_points: 1
    big_points: 3
    active: true
  - code: 'round_of_32'
    level: 2
    small_points: 2
    big_points: 4
    active: false
  - code: 'round_of_16'
    level: 3
    small_points: 2
    big_points: 5
    active: false
  - code: 'quarter_finals'
    level: 4
    small_points: 3
    big_points: 7
    active: false
  - code: 'semi_finals'
    level: 5
    small_points: 4
    big_points: 9
    active: false
  - code: 'third_place'
    level: 6
    small_points: 5
    big_points: 11
    active: false
  - code: 'final'
    level: 7
    small_points: 6
    big_points: 13
    active: false
teams:
${teamsYaml}
matches:
${matchesYaml}
`;

const out = join(root, "data/wc26.yml");
writeFileSync(out, yaml, "utf8");
console.log("Wrote", out, "from", wikiPath);
