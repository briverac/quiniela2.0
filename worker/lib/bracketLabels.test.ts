import { describe, expect, it } from "vitest";
import {
  buildBracketLabelContext,
  formatThirdPlacePreview,
  formatAnnexMatchupPreview,
  formatGroupWinnerSlotDisplay,
  resolveBracketLabel,
  resolveBracketTeamCode,
  matchTeamFlagCodes,
  thirdPlacePoolDescription,
} from "./bracketLabels";

describe("thirdPlacePoolDescription", () => {
  it("formats multiple groups", () => {
    expect(thirdPlacePoolDescription("ABCDF")).toBe("3rd-place qualifier (A, B, C, D, F)");
  });

  it("dedupes and sorts letters", () => {
    expect(thirdPlacePoolDescription("BABA")).toBe("3rd-place qualifier (A, B)");
  });

  it("formats single group", () => {
    expect(thirdPlacePoolDescription("E")).toBe("3rd place — Group E");
  });
});

describe("resolveBracketLabel", () => {
  const emptyCtx = buildBracketLabelContext([], [], []);

  it("returns null for unknown patterns", () => {
    expect(resolveBracketLabel("W", emptyCtx)).toBeNull();
    expect(resolveBracketLabel("foo", emptyCtx)).toBeNull();
  });

  it("resolves W from match number and scores", () => {
    const ctx = buildBracketLabelContext(
      [
        {
          number: 90,
          team1Id: 1,
          team2Id: 2,
          team1Score: 2,
          team2Score: 1,
        },
      ],
      [
        { id: 1, code: "mex" },
        { id: 2, code: "usa" },
      ],
      []
    );
    expect(resolveBracketLabel("W90", ctx)).toBe("Mexico");
  });

  it("resolves L from match number", () => {
    const ctx = buildBracketLabelContext(
      [
        {
          number: 101,
          team1Id: 10,
          team2Id: 20,
          team1Score: 0,
          team2Score: 1,
        },
      ],
      [
        { id: 10, code: "bra" },
        { id: 20, code: "arg" },
      ],
      []
    );
    expect(resolveBracketLabel("L101", ctx)).toBe("Brazil");
  });

  it("resolves W75 from R32 labels without team ids (pen winner)", () => {
    const ctx = buildBracketLabelContext(
      [
        {
          number: 75,
          team1Id: null,
          team2Id: null,
          team1Label: "1F",
          team2Label: "2C",
          team1Score: 3,
          team2Score: 3,
          team1PenScore: 1,
          team2PenScore: 3,
        },
      ],
      [
        { id: 22, code: "jpn" },
        { id: 11, code: "hai" },
      ],
      [
        { code: "F", teams: [{ code: "jpn" }, { code: "tun" }] },
        { code: "C", teams: [{ code: "bra" }, { code: "hai" }] },
      ]
    );
    expect(resolveBracketLabel("W75", ctx)).toBe("Haiti");
  });

  it("resolves W from penalties when FT is tied", () => {
    const ctx = buildBracketLabelContext(
      [
        {
          number: 90,
          team1Id: 1,
          team2Id: 2,
          team1Score: 1,
          team2Score: 1,
          team1PenScore: 4,
          team2PenScore: 2,
        },
      ],
      [
        { id: 1, code: "mex" },
        { id: 2, code: "usa" },
      ],
      []
    );
    expect(resolveBracketLabel("W90", ctx)).toBe("Mexico");
  });

  it("returns null for W when match not played", () => {
    const ctx = buildBracketLabelContext(
      [{ number: 90, team1Id: 1, team2Id: 2, team1Score: null, team2Score: null }],
      [
        { id: 1, code: "mex" },
        { id: 2, code: "usa" },
      ],
      []
    );
    expect(resolveBracketLabel("W90", ctx)).toBeNull();
  });

  it("resolves 1A / 2A from standings order", () => {
    const ctx = buildBracketLabelContext(
      [],
      [
        { id: 1, code: "mex" },
        { id: 2, code: "usa" },
      ],
      [{ code: "A", teams: [{ code: "mex" }, { code: "usa" }] }]
    );
    expect(resolveBracketLabel("1A", ctx)).toBe("Mexico");
    expect(resolveBracketLabel("2A", ctx)).toBe("United States");
  });

  it("shows slot suffix when group still has unfinished matches", () => {
    const ctx = buildBracketLabelContext(
      [],
      [
        { id: 1, code: "mex" },
        { id: 2, code: "usa" },
      ],
      [{ code: "A", teams: [{ code: "mex" }, { code: "usa" }] }],
      { groupsWithPendingMatches: new Set(["A"]) }
    );
    expect(resolveBracketLabel("1A", ctx)).toBe("Mexico (1A)");
    expect(resolveBracketLabel("2A", ctx)).toBe("United States (2A)");
  });

  it("resolves 3 pool when Annex C is available", () => {
    const ctx = buildBracketLabelContext([], [], [], {
      thirdPlaceTeamByWinnerGroup: new Map([["E", "usa"]]),
      thirdPlaceGroupByWinnerGroup: new Map([["E", "D"]]),
    });
    expect(resolveBracketLabel("3ABCDF", ctx, "1E")).toBe("United States");
    expect(resolveBracketTeamCode("3ABCDF", ctx, "1E")).toBe("usa");
  });

  it("shows 3D suffix while group stage is still open", () => {
    const ctx = buildBracketLabelContext(
      [],
      [],
      [
        { code: "D", teams: [{ code: "usa" }, { code: "mex" }, { code: "can" }] },
        { code: "E", teams: [{ code: "ger" }, { code: "fra" }, { code: "esp" }] },
      ],
      {
        groupsWithPendingMatches: new Set(["F"]),
        groupStagePending: true,
        thirdPlaceTeamByWinnerGroup: new Map([["E", "usa"]]),
        thirdPlaceGroupByWinnerGroup: new Map([["E", "D"]]),
      }
    );
    expect(resolveBracketLabel("3ABCDF", ctx, "1E")).toBe("United States (3D)");
  });

  it("shows 3D suffix even when that third's group already closed but group stage open", () => {
    const ctx = buildBracketLabelContext(
      [],
      [],
      [
        { code: "C", teams: [{ code: "mex" }, { code: "usa" }, { code: "sco" }] },
        { code: "A", teams: [{ code: "mex" }, { code: "can" }, { code: "usa" }] },
      ],
      {
        groupsWithPendingMatches: new Set(["B"]),
        groupStagePending: true,
        thirdPlaceTeamByWinnerGroup: new Map([["A", "sco"]]),
        thirdPlaceGroupByWinnerGroup: new Map([["A", "C"]]),
      }
    );
    expect(resolveBracketLabel("3ABC", ctx, "1A")).toBe("Scotland (3C)");
  });

  it("drops 3X suffix once entire group stage is finished", () => {
    const ctx = buildBracketLabelContext(
      [],
      [],
      [
        { code: "D", teams: [{ code: "usa" }, { code: "mex" }, { code: "can" }] },
        { code: "E", teams: [{ code: "ger" }, { code: "fra" }, { code: "esp" }] },
      ],
      {
        groupsWithPendingMatches: new Set(),
        groupStagePending: false,
        thirdPlaceTeamByWinnerGroup: new Map([["E", "usa"]]),
        thirdPlaceGroupByWinnerGroup: new Map([["E", "D"]]),
      }
    );
    expect(resolveBracketLabel("3ABCDF", ctx, "1E")).toBe("United States");
  });

  it("1X keeps suffix on its own side while group stage open", () => {
    const ctx = buildBracketLabelContext(
      [],
      [],
      [
        { code: "D", teams: [{ code: "usa" }, { code: "mex" }, { code: "can" }] },
        { code: "E", teams: [{ code: "ger" }, { code: "fra" }, { code: "esp" }] },
      ],
      {
        groupsWithPendingMatches: new Set(["D", "E"]),
        groupStagePending: true,
        thirdPlaceTeamByWinnerGroup: new Map([["E", "usa"]]),
        thirdPlaceGroupByWinnerGroup: new Map([["E", "D"]]),
      }
    );
    expect(resolveBracketLabel("3ABCDF", ctx, "1E")).toBe("United States (3D)");
    expect(resolveBracketLabel("1E", ctx)).toBe("Germany (1E)");
  });

  it("annex preview always shows 3X and 1Y wildcards even when groups closed", () => {
    const ctx = buildBracketLabelContext(
      [],
      [],
      [
        { code: "C", teams: [{ code: "mex" }, { code: "usa" }, { code: "sco" }] },
        { code: "A", teams: [{ code: "mex" }, { code: "can" }, { code: "usa" }] },
      ],
      { groupsWithPendingMatches: new Set() }
    );
    expect(formatAnnexMatchupPreview("C", "sco", "A", ctx)).toBe("Mexico (1A) vs Scotland (3C)");
    expect(formatGroupWinnerSlotDisplay("A", ctx)).toBe("Mexico (1A)");
  });

  it("resolves 3-pool label to description when Annex C unknown", () => {
    expect(resolveBracketLabel("3ABCDF", emptyCtx)).toBe("3rd-place qualifier (A, B, C, D, F)");
  });
});

describe("resolveBracketTeamCode", () => {
  const emptyCtx = buildBracketLabelContext([], [], []);

  it("returns null for third pool and unknown", () => {
    expect(resolveBracketTeamCode("3ABCDF", emptyCtx)).toBeNull();
    expect(resolveBracketTeamCode("W", emptyCtx)).toBeNull();
  });

  it("resolves W / L / 1 / 2 to team codes", () => {
    const ctx = buildBracketLabelContext(
      [
        {
          number: 90,
          team1Id: 1,
          team2Id: 2,
          team1Score: 2,
          team2Score: 1,
        },
        {
          number: 91,
          team1Id: 1,
          team2Id: 2,
          team1Score: 0,
          team2Score: 1,
        },
      ],
      [
        { id: 1, code: "mex" },
        { id: 2, code: "usa" },
      ],
      [{ code: "A", teams: [{ code: "mex" }, { code: "usa" }] }]
    );
    expect(resolveBracketTeamCode("W90", ctx)).toBe("mex");
    expect(resolveBracketTeamCode("L91", ctx)).toBe("mex");
    expect(resolveBracketTeamCode("1A", ctx)).toBe("mex");
    expect(resolveBracketTeamCode("2A", ctx)).toBe("usa");
  });

  it("still returns group leader code when group has pending matches", () => {
    const ctx = buildBracketLabelContext(
      [],
      [
        { id: 1, code: "mex" },
        { id: 2, code: "usa" },
      ],
      [{ code: "A", teams: [{ code: "mex" }, { code: "usa" }] }],
      { groupsWithPendingMatches: new Set(["A"]) }
    );
    expect(resolveBracketTeamCode("1A", ctx)).toBe("mex");
  });
});

describe("matchTeamFlagCodes", () => {
  it("prefers team id assignment over label", () => {
    const ctx = buildBracketLabelContext([], [], []);
    const teamById = new Map([
      [10, { code: "bra" }],
      [20, { code: "arg" }],
    ]);
    const fc = matchTeamFlagCodes(
      {
        team1Id: 10,
        team2Id: null,
        team1Label: "1A",
        team2Label: "W90",
      },
      teamById,
      ctx
    );
    expect(fc.team1FlagCode).toBe("bra");
    expect(fc.team2FlagCode).toBeNull();
  });
});
