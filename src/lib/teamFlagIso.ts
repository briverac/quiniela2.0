/**
 * Map app team codes (WC26 seed / DB) → flagcdn.com file slug (ISO 3166-1 alpha-2
 * or composite like gb-eng). See https://flagcdn.com
 */
const TEAM_CODE_TO_FLAG_ISO: Record<string, string> = {
  mex: "mx",
  rsa: "za",
  kor: "kr",
  cze: "cz",
  can: "ca",
  bih: "ba",
  qat: "qa",
  sui: "ch",
  bra: "br",
  mar: "ma",
  hai: "ht",
  sco: "gb-sct",
  usa: "us",
  par: "py",
  aus: "au",
  tur: "tr",
  civ: "ci",
  ecu: "ec",
  ger: "de",
  cuw: "cw",
  ned: "nl",
  jpn: "jp",
  swe: "se",
  tun: "tn",
  bel: "be",
  egy: "eg",
  irn: "ir",
  nzl: "nz",
  ksa: "sa",
  uru: "uy",
  esp: "es",
  cpv: "cv",
  fra: "fr",
  sen: "sn",
  irq: "iq",
  nor: "no",
  arg: "ar",
  alg: "dz",
  aut: "at",
  jor: "jo",
  por: "pt",
  cod: "cd",
  uzb: "uz",
  col: "co",
  eng: "gb-eng",
  cro: "hr",
  gha: "gh",
  pan: "pa",
};

/** Lowercase slug for flagcdn (`https://flagcdn.com/w40/{slug}.png`). */
export function teamCodeToFlagIso(code: string | null | undefined): string | null {
  if (code == null || code === "") return null;
  return TEAM_CODE_TO_FLAG_ISO[code.toLowerCase()] ?? null;
}
