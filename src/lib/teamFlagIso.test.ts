import { describe, it, expect } from "vitest";
import { teamCodeToFlagIso } from "./teamFlagIso";

describe("teamCodeToFlagIso", () => {
  it("maps FIFA-style codes to flagcdn slugs", () => {
    expect(teamCodeToFlagIso("mex")).toBe("mx");
    expect(teamCodeToFlagIso("eng")).toBe("gb-eng");
    expect(teamCodeToFlagIso("sco")).toBe("gb-sct");
    expect(teamCodeToFlagIso("cuw")).toBe("cw");
  });

  it("returns null for unknown or empty", () => {
    expect(teamCodeToFlagIso(null)).toBeNull();
    expect(teamCodeToFlagIso("")).toBeNull();
    expect(teamCodeToFlagIso("zzz")).toBeNull();
  });
});
