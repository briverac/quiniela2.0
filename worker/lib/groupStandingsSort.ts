/**
 * FIFA-style group ranking (WC regulations Art. 18 pattern):
 * 1) Points in all group matches
 * 2–4) Among teams tied on (1): points, goal difference, goals scored in matches among them
 *    (re-applied on subgroups when mini-table splits the set)
 * 5–6) Goal difference / goals scored in all group matches among the tied teams
 * 7–8) Fair play / drawing of lots — not modeled; we use stable team code order.
 */

export type GroupStandingRow = {
  id: number;
  code: string;
  matchesPlayed: number;
  win: number;
  draw: number;
  lost: number;
  goalInFavor: number;
  goalAgainst: number;
  goalDifference: number;
  points: number;
};

export type ClosedGroupMatch = {
  team1Id: number;
  team2Id: number;
  team1Score: number;
  team2Score: number;
};

export function aggregateMiniLeague(
  teamIds: number[],
  matches: ClosedGroupMatch[]
): Map<number, { pts: number; gf: number; ga: number; gd: number }> {
  const set = new Set(teamIds);
  const map = new Map<number, { pts: number; gf: number; ga: number; gd: number }>();
  for (const id of teamIds) {
    map.set(id, { pts: 0, gf: 0, ga: 0, gd: 0 });
  }
  for (const m of matches) {
    if (!set.has(m.team1Id) || !set.has(m.team2Id)) continue;
    const s1 = m.team1Score;
    const s2 = m.team2Score;
    const a = map.get(m.team1Id)!;
    const b = map.get(m.team2Id)!;
    a.gf += s1;
    a.ga += s2;
    b.gf += s2;
    b.ga += s1;
    if (s1 === s2) {
      a.pts += 1;
      b.pts += 1;
    } else if (s1 > s2) {
      a.pts += 3;
    } else {
      b.pts += 3;
    }
  }
  for (const v of map.values()) {
    v.gd = v.gf - v.ga;
  }
  return map;
}

function miniKey(m: { pts: number; gd: number; gf: number }): string {
  return `${m.pts},${m.gd},${m.gf}`;
}

/** Rank a subset of teams that already share the same total group points. */
function rankSubsetTiedOnPoints(
  subset: GroupStandingRow[],
  groupMatches: ClosedGroupMatch[]
): GroupStandingRow[] {
  if (subset.length <= 1) return subset;

  const ids = subset.map((r) => r.id);
  const mini = aggregateMiniLeague(ids, groupMatches);

  const sortedByMini = [...subset].sort((a, b) => {
    const ma = mini.get(a.id)!;
    const mb = mini.get(b.id)!;
    let c = mb.pts - ma.pts;
    if (c !== 0) return c;
    c = mb.gd - ma.gd;
    if (c !== 0) return c;
    c = mb.gf - ma.gf;
    if (c !== 0) return c;
    return 0;
  });

  const buckets: GroupStandingRow[][] = [];
  for (const t of sortedByMini) {
    const k = miniKey(mini.get(t.id)!);
    const last = buckets[buckets.length - 1];
    if (last && miniKey(mini.get(last[0].id)!) === k) {
      last.push(t);
    } else {
      buckets.push([t]);
    }
  }

  const out: GroupStandingRow[] = [];
  for (const bucket of buckets) {
    if (bucket.length === 1) {
      out.push(bucket[0]);
      continue;
    }
    const everyoneInSubsetSharesSameMini = bucket.length === subset.length;
    if (everyoneInSubsetSharesSameMini) {
      bucket.sort((a, b) => {
        let c = b.goalDifference - a.goalDifference;
        if (c !== 0) return c;
        c = b.goalInFavor - a.goalInFavor;
        if (c !== 0) return c;
        return a.code.localeCompare(b.code);
      });
      out.push(...bucket);
    } else {
      out.push(...rankSubsetTiedOnPoints(bucket, groupMatches));
    }
  }
  return out;
}

/** Partition rows by equal `points`, preserving insertion order within partitions. */
function partitionByPoints(rows: GroupStandingRow[]): GroupStandingRow[][] {
  const sorted = [...rows].sort((a, b) => b.points - a.points);
  const parts: GroupStandingRow[][] = [];
  for (const r of sorted) {
    const last = parts[parts.length - 1];
    if (last && last[0].points === r.points) {
      last.push(r);
    } else {
      parts.push([r]);
    }
  }
  return parts;
}

export function sortGroupTeamsByFifaRules(
  rows: GroupStandingRow[],
  groupMatches: ClosedGroupMatch[]
): GroupStandingRow[] {
  const parts = partitionByPoints(rows);
  const ordered: GroupStandingRow[] = [];
  for (const part of parts) {
    ordered.push(...rankSubsetTiedOnPoints(part, groupMatches));
  }
  return ordered;
}
