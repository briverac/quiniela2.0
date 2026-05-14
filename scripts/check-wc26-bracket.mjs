#!/usr/bin/env node
/**
 * Static checks on data/wc26.yml knockout bracket:
 * - R32: each 1[A–L] and 2[A–L] appears at most once (no duplicate group slots).
 * - W/L labels never reference a match number >= current match.
 * - R16 (89–96): team labels are only W73–W88.
 * - QF (97–100): inputs are W89–W96; SF (101–102): W97–W100; third/final L/W refs.
 * - Third-place default map matches yaml team2_label for those match numbers.
 * - Group stage: 6 matches per letter group, 4 teams × 3 MP each.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const seedFile = process.env.SEED_YAML ?? join(root, "data/wc26.yml");
const doc = parse(readFileSync(seedFile, "utf8"));

const errors = [];
function fail(msg) {
  errors.push(msg);
}

let matchNum = 0;
const r32 = [];
for (const m of doc.matches) {
  matchNum++;
  if (m.phase === "round_of_32") r32.push({ n: matchNum, m });
}

if (r32.length !== 16) fail(`Expected 16 R32 matches, got ${r32.length}`);

const slots = { first: {}, second: {} };
for (const { n, m } of r32) {
  for (const side of ["team1_label", "team2_label"]) {
    const lab = m[side];
    if (!lab) continue;
    const t = String(lab);
    const one = t.match(/^1([A-L])$/i);
    const two = t.match(/^2([A-L])$/i);
    if (one) {
      const g = one[1].toUpperCase();
      if (slots.first[g]) fail(`Duplicate 1${g}: matches ${slots.first[g]} and ${n}`);
      else slots.first[g] = n;
    }
    if (two) {
      const g = two[1].toUpperCase();
      if (slots.second[g]) fail(`Duplicate 2${g}: matches ${slots.second[g]} and ${n}`);
      else slots.second[g] = n;
    }
  }
}
for (const g of "ABCDEFGHIJKL") {
  if (!slots.first[g]) fail(`Missing group winner slot 1${g} in R32`);
  if (!slots.second[g]) fail(`Missing group runner-up slot 2${g} in R32`);
}

matchNum = 0;
const wlRefs = [];
for (const m of doc.matches) {
  matchNum++;
  for (const side of ["team1_label", "team2_label"]) {
    const lab = m[side];
    if (!lab) continue;
    const ws = String(lab).match(/^W(\d+)$/i);
    const ls = String(lab).match(/^L(\d+)$/i);
    if (ws) {
      const ref = +ws[1];
      wlRefs.push({ n: matchNum, ref, loser: false });
      if (ref >= matchNum) fail(`Match ${matchNum}: W${ref} references same or future match`);
    }
    if (ls) {
      const ref = +ls[1];
      wlRefs.push({ n: matchNum, ref, loser: true });
      if (ref >= matchNum) fail(`Match ${matchNum}: L${ref} references same or future match`);
    }
  }
}

const r32Nums = new Set(r32.map((x) => x.n));
for (const x of wlRefs) {
  if (x.n >= 89 && x.n <= 96 && !x.loser && !r32Nums.has(x.ref)) {
    fail(`R16 match ${x.n}: W${x.ref} is not an R32 match (expected 73–88)`);
  }
}

const r16out = [89, 90, 91, 92, 93, 94, 95, 96];
matchNum = 0;
for (const m of doc.matches) {
  matchNum++;
  if (matchNum < 97 || matchNum > 100) continue;
  for (const side of ["team1_label", "team2_label"]) {
    const lab = m[side];
    const w = lab && String(lab).match(/^W(\d+)$/i);
    if (w) {
      const ref = +w[1];
      if (!r16out.includes(ref)) fail(`QF match ${matchNum}: W${ref} not in R16 outputs 89–96`);
    }
  }
}

const m101 = doc.matches[100];
const m102 = doc.matches[101];
for (const [label, n, exp] of [
  [m101?.team1_label, 101, 97],
  [m101?.team2_label, 101, 98],
  [m102?.team1_label, 102, 99],
  [m102?.team2_label, 102, 100],
]) {
  const w = label && String(label).match(/^W(\d+)$/i);
  if (!w || +w[1] !== exp) fail(`SF match ${n}: expected W${exp}, got ${label}`);
}

const m103 = doc.matches[102];
if (m103?.team1_label !== "L101" || m103?.team2_label !== "L102") {
  fail(`Third place match 103: expected L101 / L102, got ${m103?.team1_label} / ${m103?.team2_label}`);
}
const m104 = doc.matches[103];
if (m104?.team1_label !== "W101" || m104?.team2_label !== "W102") {
  fail(`Final match 104: expected W101 / W102, got ${m104?.team1_label} / ${m104?.team2_label}`);
}

const DEFAULT_TEAM2 = {
  74: "3ABCDF",
  77: "3CDFGH",
  79: "3CEFHI",
  80: "3EHIJK",
  81: "3BEFIJ",
  82: "3AEHIJ",
  85: "3EFGIJ",
  87: "3DEIJL",
};
matchNum = 0;
for (const m of doc.matches) {
  matchNum++;
  const exp = DEFAULT_TEAM2[matchNum];
  if (!exp) continue;
  const got = (m.team2_label ?? "").toUpperCase();
  if (got !== exp) fail(`Match ${matchNum}: team2_label expected ${exp}, got ${m.team2_label}`);
}

const byG = {};
for (const m of doc.matches) {
  const g = m.phase;
  if (!/^[A-L]$/.test(g)) continue;
  if (!m.team1 || !m.team2) continue;
  if (!byG[g]) byG[g] = [];
  byG[g].push([m.team1, m.team2]);
}
for (const g of Object.keys(byG).sort()) {
  const pairs = byG[g];
  if (pairs.length !== 6) fail(`Group ${g}: expected 6 matches, got ${pairs.length}`);
  const cnt = {};
  for (const [a, b] of pairs) {
    cnt[a] = (cnt[a] ?? 0) + 1;
    cnt[b] = (cnt[b] ?? 0) + 1;
  }
  const teams = Object.keys(cnt);
  if (teams.length !== 4) fail(`Group ${g}: expected 4 teams, got ${teams.join(",")}`);
  for (const t of teams) {
    if (cnt[t] !== 3) fail(`Group ${g}: team ${t} should have 3 MP, has ${cnt[t]}`);
  }
}

if (errors.length) {
  console.error("Bracket check failed:\n", errors.join("\n"));
  process.exit(1);
}
console.log(`OK — ${seedFile} bracket checks passed.`);
