import { describe, expect, it } from "vitest";
import { validateFileName } from "./files";

describe("validateFileName", () => {
  it("accepts ordinary names", () => {
    for (const name of ["main.js", "helpers.js", "a.js", "my-file_2.js"]) {
      expect(validateFileName(name)).toBeUndefined();
    }
  });

  it("requires a name", () => {
    expect(validateFileName("")).toMatch(/give the file a name/i);
    expect(validateFileName("   ")).toMatch(/give the file a name/i);
  });

  it("requires a .js extension while that is the only language", () => {
    expect(validateFileName("notes.txt")).toMatch(/\.js/);
    expect(validateFileName("main")).toMatch(/\.js/);
  });

  it("rejects anything that looks like a path", () => {
    // A slash would imply directories the product does not have, and is the
    // first step towards a name escaping its project.
    expect(validateFileName("src/main.js")).toBeTruthy();
    expect(validateFileName("../secrets.js")).toBeTruthy();
    expect(validateFileName("a\\b.js")).toBeTruthy();
  });

  it("rejects names that do not start with a letter or number", () => {
    expect(validateFileName(".hidden.js")).toBeTruthy();
    expect(validateFileName("-dash.js")).toBeTruthy();
  });

  it("rejects over-long names", () => {
    expect(validateFileName(`${"x".repeat(60)}.js`)).toMatch(/at most 60/);
  });

  it("rejects a duplicate, case-insensitively", () => {
    expect(validateFileName("main.js", ["main.js"])).toMatch(/already has/i);
    expect(validateFileName("MAIN.JS", ["main.js"])).toMatch(/already has/i);
    // ...but the file keeping its own name is fine.
    expect(validateFileName("other.js", ["main.js"])).toBeUndefined();
  });

  it("trims before judging", () => {
    expect(validateFileName("  main.js  ")).toBeUndefined();
    expect(validateFileName("  main.js  ", ["main.js"])).toMatch(
      /already has/i,
    );
  });
});
