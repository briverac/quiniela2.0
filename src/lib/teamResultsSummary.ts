export type MatchForTeamSummary = {
  number: number;
  closed: boolean;
  team1Code: string | null;
  team2Code: string | null;
  team1FlagCode: string | null;
  team2FlagCode: string | null;
  team1Name: string | null;
  team2Name: string | null;
  team1Score: number | null;
  team2Score: number | null;
  team1PenScore: number | null;
  team2PenScore: number | null;
};

export type TeamMatchResult = {
  matchNumber: number;
  opponentCode: string | null;
  opponentName: string;
  outcome: "W" | "D" | "L";
  scoreLine: string;
};

export type TeamResultsSummary = {
  played: TeamMatchResult[];
  win: number;
  draw: number;
  lost: number;
  goalInFavor: number;
  goalAgainst: number;
  goalDifference: number;
  points: number;
};

function teamKey(side: 1 | 2, m: MatchForTeamSummary): string | null {
  return side === 1 ? m.team1FlagCode ?? m.team1Code : m.team2FlagCode ?? m.team2Code;
}

function resultForSide(m: MatchForTeamSummary, side: 1 | 2): TeamMatchResult | null {
  if (!m.closed || m.team1Score == null || m.team2Score == null) return null;
  const code = teamKey(side, m);
  if (!code) return null;

  const gf = side === 1 ? m.team1Score : m.team2Score;
  const ga = side === 1 ? m.team2Score : m.team1Score;
  const opponentName = (side === 1 ? m.team2Name : m.team1Name) ?? "—";
  const opponentCode = side === 1 ? teamKey(2, m) : teamKey(1, m);
  const pFor = side === 1 ? m.team1PenScore : m.team2PenScore;
  const pAg = side === 1 ? m.team2PenScore : m.team1PenScore;

  let outcome: "W" | "D" | "L";
  let scoreLine = `${gf}–${ga}`;

  if (gf === ga && pFor != null && pAg != null) {
    if (pFor > pAg) outcome = "W";
    else if (pFor < pAg) outcome = "L";
    else outcome = "D";
    scoreLine = `${gf}–${ga} (${pFor}–${pAg} pens)`;
  } else {
    outcome = gf > ga ? "W" : gf < ga ? "L" : "D";
  }

  return { matchNumber: m.number, opponentCode, opponentName, outcome, scoreLine };
}

function emptySummary(): TeamResultsSummary {
  return {
    played: [],
    win: 0,
    draw: 0,
    lost: 0,
    goalInFavor: 0,
    goalAgainst: 0,
    goalDifference: 0,
    points: 0,
  };
}

function finalizeSummary(played: TeamMatchResult[]): TeamResultsSummary {
  let win = 0;
  let draw = 0;
  let lost = 0;
  let goalInFavor = 0;
  let goalAgainst = 0;

  for (const row of played) {
    const [gfRaw, gaRaw] = row.scoreLine.split(" ")[0]!.split("–");
    const gf = Number(gfRaw);
    const ga = Number(gaRaw);
    if (Number.isFinite(gf)) goalInFavor += gf;
    if (Number.isFinite(ga)) goalAgainst += ga;
    if (row.outcome === "W") win++;
    else if (row.outcome === "D") draw++;
    else lost++;
  }

  return {
    played,
    win,
    draw,
    lost,
    goalInFavor,
    goalAgainst,
    goalDifference: goalInFavor - goalAgainst,
    points: win * 3 + draw,
  };
}

/** Closed matches with scores, indexed by team code (flag code when bracket-resolved). */
export function buildTeamResultsIndex(
  matches: MatchForTeamSummary[]
): Map<string, TeamResultsSummary> {
  const byCode = new Map<string, TeamMatchResult[]>();

  for (const m of matches) {
    for (const side of [1, 2] as const) {
      const row = resultForSide(m, side);
      if (!row) continue;
      const code = teamKey(side, m)!;
      const list = byCode.get(code);
      if (list) list.push(row);
      else byCode.set(code, [row]);
    }
  }

  const out = new Map<string, TeamResultsSummary>();
  for (const [code, played] of byCode) {
    played.sort((a, b) => a.matchNumber - b.matchNumber);
    out.set(code, finalizeSummary(played));
  }
  return out;
}

export function teamResultsForCode(
  index: Map<string, TeamResultsSummary>,
  teamCode: string | null | undefined
): TeamResultsSummary | null {
  if (!teamCode) return null;
  return index.get(teamCode) ?? emptySummary();
}
