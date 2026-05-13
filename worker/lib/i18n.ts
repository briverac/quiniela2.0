/** UI strings for tournament WC26 (FIFA World Cup 2026) */
export const tournamentName = "World Cup 2026";

export const teamNames: Record<string, string> = {
  mex: "Mexico",
  rsa: "South Africa",
  kor: "South Korea",
  cze: "Czechia",
  can: "Canada",
  bih: "Bosnia & Herzegovina",
  qat: "Qatar",
  sui: "Switzerland",
  bra: "Brazil",
  mar: "Morocco",
  hai: "Haiti",
  sco: "Scotland",
  usa: "United States",
  par: "Paraguay",
  aus: "Australia",
  tur: "Türkiye",
  civ: "Côte d'Ivoire",
  ecu: "Ecuador",
  ger: "Germany",
  cuw: "Curaçao",
  ned: "Netherlands",
  jpn: "Japan",
  swe: "Sweden",
  tun: "Tunisia",
  bel: "Belgium",
  egy: "Egypt",
  irn: "Iran",
  nzl: "New Zealand",
  ksa: "Saudi Arabia",
  uru: "Uruguay",
  esp: "Spain",
  cpv: "Cabo Verde",
  fra: "France",
  sen: "Senegal",
  irq: "Iraq",
  nor: "Norway",
  arg: "Argentina",
  alg: "Algeria",
  aut: "Austria",
  jor: "Jordan",
  por: "Portugal",
  cod: "DR Congo",
  uzb: "Uzbekistan",
  col: "Colombia",
  eng: "England",
  cro: "Croatia",
  gha: "Ghana",
  pan: "Panama",
};

export const phaseNames: Record<string, string> = {
  A: "Group A",
  B: "Group B",
  C: "Group C",
  D: "Group D",
  E: "Group E",
  F: "Group F",
  G: "Group G",
  H: "Group H",
  I: "Group I",
  J: "Group J",
  K: "Group K",
  L: "Group L",
  round_of_32: "Round of 32",
  round_of_16: "Round of 16",
  quarter_finals: "Quarter-finals",
  semi_finals: "Semi-finals",
  third_place: "Third place",
  final: "Final",
};

export function teamName(code: string | null | undefined): string {
  if (!code) return "";
  return teamNames[code] ?? code;
}

export function phaseName(code: string): string {
  return phaseNames[code] ?? code;
}
