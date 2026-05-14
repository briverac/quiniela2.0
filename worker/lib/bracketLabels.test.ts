import { describe, expect, it } from "vitest";
import {
  buildBracketLabelContext,
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

  it("resolves 3-pool label to description", () => {
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
