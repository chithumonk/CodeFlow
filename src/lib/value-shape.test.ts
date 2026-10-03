import { describe, expect, it } from "vitest";
import {
  MAX_STRING_CELLS,
  activeIndex,
  decodeEscapes,
  parseValue,
  pointerTarget,
  unquote,
} from "./value-shape";
import type { TraceVar } from "../execution/trace";

const v = (name: string, value: string, changed = false): TraceVar => ({
  name,
  value,
  changed,
});

describe("parseValue", () => {
  it("reads a flat array", () => {
    expect(parseValue("[1, 2, 3, 4]")).toEqual({
      kind: "array",
      items: ["1", "2", "3", "4"],
    });
  });

  it("reads an empty array", () => {
    expect(parseValue("[]")).toEqual({ kind: "array", items: [] });
    expect(parseValue("[ ]")).toEqual({ kind: "array", items: [] });
  });

  it("keeps a nested value whole", () => {
    // The naive split tears this into four pieces.
    expect(parseValue("[[1, 2], [3, 4]]")).toEqual({
      kind: "array",
      items: ["[1, 2]", "[3, 4]"],
    });
    expect(parseValue("[{a: 1, b: 2}, {a: 3}]")).toEqual({
      kind: "array",
      items: ["{a: 1, b: 2}", "{a: 3}"],
    });
  });

  it("does not split inside a string", () => {
    expect(parseValue(`["a,b", "c"]`)).toEqual({
      kind: "array",
      items: [`"a,b"`, `"c"`],
    });
    expect(parseValue(`['x, y']`)).toEqual({
      kind: "array",
      items: [`'x, y'`],
    });
  });

  it("honours an escaped quote", () => {
    expect(parseValue(`["a\\", b", "c"]`).kind).toBe("array");
    expect((parseValue(`["a\\", b", "c"]`) as { items: string[] }).items).toEqual(
      [`"a\\", b"`, `"c"`],
    );
  });

  it("reads an object into entries", () => {
    expect(parseValue("{name: 'ada', age: 36}")).toEqual({
      kind: "object",
      entries: [
        { key: "name", value: "'ada'" },
        { key: "age", value: "36" },
      ],
    });
  });

  it("strips quotes from object keys but not values", () => {
    expect(parseValue(`{"a": 1}`)).toEqual({
      kind: "object",
      entries: [{ key: "a", value: "1" }],
    });
  });

  it("splits an object entry on its first colon only", () => {
    expect(parseValue(`{url: "http://x.dev"}`)).toEqual({
      kind: "object",
      entries: [{ key: "url", value: `"http://x.dev"` }],
    });
  });

  it("treats anything else as a scalar", () => {
    for (const text of ["3", "-1", "true", "null", "undefined", "NaN"]) {
      expect(parseValue(text), text).toEqual({ kind: "scalar", text });
    }
  });

  it("does not mistake two adjacent groups for one enclosing pair", () => {
    // "[1] and [2]" starts with [ and ends with ], but is not an array.
    expect(parseValue("[1] and [2]").kind).toBe("scalar");
  });

  it("leaves an unbalanced value as a scalar", () => {
    expect(parseValue("[1, 2").kind).toBe("scalar");
  });
});

describe("parseValue on strings", () => {
  it("splits a quoted string into characters", () => {
    expect(parseValue(`"abc"`)).toEqual({
      kind: "string",
      text: "abc",
      chars: ["a", "b", "c"],
    });
  });

  it("accepts any of the three quote styles", () => {
    for (const raw of [`"ab"`, `'ab'`, "`ab`"]) {
      expect(parseValue(raw), raw).toEqual({
        kind: "string",
        text: "ab",
        chars: ["a", "b"],
      });
    }
  });

  it("decodes escapes into the character they stand for", () => {
    // Stepping over a backslash and an "n" as two cells is not what ran.
    expect(parseValue(`"a\\nb"`)).toEqual({
      kind: "string",
      text: "a\nb",
      chars: ["a", "\n", "b"],
    });
    expect(parseValue(`"a\\tb"`).kind).toBe("string");
    expect((parseValue(`"a\\\\b"`) as { chars: string[] }).chars).toEqual([
      "a",
      "\\",
      "b",
    ]);
  });

  it("decodes a unicode escape", () => {
    expect((parseValue(`"\\u0041b"`) as { chars: string[] }).chars).toEqual([
      "A",
      "b",
    ]);
  });

  it("keeps an unknown escape verbatim", () => {
    expect((parseValue(`"a\\qb"`) as { chars: string[] }).chars).toEqual([
      "a",
      "\\",
      "q",
      "b",
    ]);
  });

  it("does not split a surrogate pair", () => {
    // split("") would make two meaningless half-cells out of the emoji.
    const shape = parseValue(`"a🙂b"`) as { chars: string[] };
    expect(shape.chars).toEqual(["a", "🙂", "b"]);
  });

  it("does not treat concatenation as one string", () => {
    expect(parseValue(`'a' + 'b'`).kind).toBe("scalar");
  });

  it("leaves an empty string as a scalar", () => {
    // Nothing to walk, so there is nothing to draw.
    expect(parseValue(`""`).kind).toBe("scalar");
  });

  it("falls back to text past the cell limit", () => {
    const long = `"${"x".repeat(MAX_STRING_CELLS + 1)}"`;
    expect(parseValue(long).kind).toBe("scalar");
    const atLimit = `"${"x".repeat(MAX_STRING_CELLS)}"`;
    expect(parseValue(atLimit).kind).toBe("string");
  });

  it("does not mistake a quoted string for an array", () => {
    expect(parseValue(`"[1, 2]"`).kind).toBe("string");
  });
});

describe("unquote and decodeEscapes", () => {
  it("strips one layer of quotes only", () => {
    expect(unquote(`"a"`)).toBe("a");
    expect(unquote(`'a'`)).toBe("a");
    expect(unquote(`a`)).toBe("a");
    expect(unquote(`""a""`)).toBe(`"a"`);
  });

  it("leaves mismatched quotes alone", () => {
    expect(unquote(`"a'`)).toBe(`"a'`);
  });

  it("decodes only what it knows", () => {
    expect(decodeEscapes("a\\nb")).toBe("a\nb");
    expect(decodeEscapes("a\\qb")).toBe("a\\qb");
    expect(decodeEscapes("plain")).toBe("plain");
  });
});

describe("activeIndex over a string", () => {
  const chars = ["l", "e", "e", "t"];

  it("matches a quoted loop character against a bare cell", () => {
    // The cell holds `e`; the tracer reports the variable as `'e'`.
    expect(activeIndex(chars, [v("ch", "'e'")], 2)).toBe(1);
  });

  it("uses the counter when the character repeats", () => {
    // "e" is at 1 and 2, so the value alone cannot say which.
    expect(activeIndex(chars, [v("ch", "'e'")], 3)).toBe(2);
  });

  it("finds a unique character with no counter", () => {
    expect(activeIndex(chars, [v("ch", '"t"')])).toBe(3);
  });

  it("is not corroborated by the whole string being in scope", () => {
    // s holds "leet"; that is not the character being read.
    expect(activeIndex(chars, [v("s", '"leet"')])).toBeNull();
  });
});

describe("activeIndex", () => {
  const items = ["1", "2", "3", "4"];

  it("uses the loop counter when a variable corroborates it", () => {
    // iteration 3 -> index 2 -> value "3", and n holds 3.
    expect(activeIndex(items, [v("n", "3"), v("sum", "6")], 3)).toBe(2);
  });

  it("prefers a unique value match over a disagreeing counter", () => {
    // Counter says index 0 ("1"), but nothing holds 1 and only "4" matches.
    expect(activeIndex(items, [v("n", "4")], 1)).toBe(3);
  });

  it("works with no iteration at all, via a unique match", () => {
    // A while loop with a hand-rolled index reports no iteration.
    expect(activeIndex(items, [v("current", "2")])).toBe(1);
  });

  it("falls back to the counter when value matches are ambiguous", () => {
    const repeats = ["7", "7", "7"];
    // Three cells match, so no single one is implied -- use the counter.
    expect(activeIndex(repeats, [v("n", "7")], 2)).toBe(1);
  });

  it("returns null when nothing supports a guess", () => {
    expect(activeIndex(items, [v("sum", "99")])).toBeNull();
    expect(activeIndex(items, [])).toBeNull();
  });

  it("returns null for an empty collection", () => {
    expect(activeIndex([], [v("n", "1")], 1)).toBeNull();
  });

  it("ignores an out-of-range counter", () => {
    // Past the end: better no pointer than one off the edge.
    expect(activeIndex(items, [v("sum", "10")], 9)).toBeNull();
  });

  it("does not match a collection-valued variable against a cell", () => {
    // nums itself is in scope; it must not corroborate anything.
    const nested = ["[1]", "[2]"];
    expect(activeIndex(nested, [v("nums", "[1]")])).toBeNull();
  });
});

describe("pointerTarget", () => {
  it("gives the pointer to the collection being read, not the accumulator", () => {
    // Regression: walking s while building seen, both used to get a pointer.
    const target = pointerTarget(
      [
        v("s", `"abca"`),
        v("seen", `"abc"`, true),
        v("ch", `"c"`),
      ],
      3,
    );
    expect(target).toEqual({ name: "s", index: 2 });
  });

  it("returns exactly one target when several collections match", () => {
    const target = pointerTarget([v("a", "[1, 2]"), v("b", "[1, 2]"), v("n", "2")], 2);
    expect(target?.index).toBe(1);
    expect(["a", "b"]).toContain(target?.name);
  });

  it("still points at a collection that is being mutated in place", () => {
    // Every candidate changed, so the pointer is the best available truth.
    expect(pointerTarget([v("arr", "[3, 1, 2]", true), v("x", "1")])).toEqual({
      name: "arr",
      index: 1,
    });
  });

  it("returns null when nothing is being walked", () => {
    expect(pointerTarget([v("sum", "10"), v("done", "true")])).toBeNull();
    expect(pointerTarget([])).toBeNull();
  });

  it("ignores objects", () => {
    expect(pointerTarget([v("counts", "{a: 1, b: 2}"), v("k", "'a'")])).toBeNull();
  });
});

describe("pointerTarget edge cases", () => {
  it("does not let a one-character loop variable point at itself", () => {
    // ch is a 1-char string; it is the reader, not the thing being read.
    expect(pointerTarget([v("ch", "'a'")])).toBeNull();
  });

  it("ignores a single-element collection", () => {
    expect(pointerTarget([v("one", "[5]"), v("n", "5")], 1)).toBeNull();
  });
});
