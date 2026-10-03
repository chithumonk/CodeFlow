import type { TraceVar } from "../execution/trace";

/**
 * Reading structure back out of a traced value.
 *
 * The event stream carries values as strings — `variable_update` reports
 * `"[1, 2, 3, 4]"`, not an array — because it has to cross a worker boundary
 * and survive four different language tracers. Drawing an array as cells
 * therefore means parsing that text back into its parts.
 *
 * This is deliberately a shallow, display-only parse. It splits one level and
 * keeps each part as the text the tracer produced, so a nested value renders
 * as its own source rather than being half-interpreted into something the
 * program never had.
 */

export type ValueShape =
  | { kind: "array"; items: string[] }
  | { kind: "object"; entries: Array<{ key: string; value: string }> }
  /** A quoted string, split into characters so it can be walked like a list. */
  | { kind: "string"; text: string; chars: string[] }
  | { kind: "scalar"; text: string };

/**
 * Longest string drawn as cells.
 *
 * Past this it is a paragraph, not a data structure: hundreds of one-character
 * boxes is neither readable nor cheap to render, so it falls back to text.
 */
export const MAX_STRING_CELLS = 240;

/** Opening bracket to its closing partner. */
const PAIRS: Record<string, string> = { "[": "]", "{": "}", "(": ")" };

/**
 * Split on commas that are not inside a nested value or a string.
 *
 * A plain `text.split(",")` tears `[[1, 2], [3]]` into four pieces and
 * `["a,b"]` into two, which is exactly the case a list visualization hits
 * first.
 */
function splitTopLevel(inner: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = "";

  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];

    if (quote !== null) {
      current += ch;
      // A backslash escapes the next character, including the quote itself.
      if (ch === "\\" && i + 1 < inner.length) {
        current += inner[++i];
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }

    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      current += ch;
    } else if (ch in PAIRS) {
      depth++;
      current += ch;
    } else if (ch === "]" || ch === "}" || ch === ")") {
      depth--;
      current += ch;
    } else if (ch === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }

  const last = current.trim();
  if (last !== "") parts.push(last);
  return parts;
}

/** True when `text` opens with `open` and that bracket closes at the very end. */
function isWrapped(text: string, open: string): boolean {
  if (!text.startsWith(open) || !text.endsWith(PAIRS[open])) return false;

  let depth = 0;
  let quote: string | null = null;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote !== null) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if (ch in PAIRS) depth++;
    else if (ch === "]" || ch === "}" || ch === ")") {
      depth--;
      // Closed before the end, so the brackets are not one enclosing pair.
      if (depth === 0 && i !== text.length - 1) return false;
    }
  }
  return depth === 0;
}

const QUOTES = ['"', "'", "`"];

/** Strip one layer of matching surrounding quotes, if there is one. */
export function unquote(text: string): string {
  const t = text.trim();
  for (const q of QUOTES) {
    if (t.length >= 2 && t.startsWith(q) && t.endsWith(q)) {
      return t.slice(1, -1);
    }
  }
  return t;
}

const ESCAPES: Record<string, string> = {
  n: "\n",
  t: "\t",
  r: "\r",
  "0": "\0",
  "\\": "\\",
  '"': '"',
  "'": "'",
  "`": "`",
};

/**
 * Turn the tracer's escape sequences back into the characters they stand for.
 *
 * Without this, walking `"a\nb"` character by character would step over a
 * backslash and an `n` as two separate cells, which is not what the program
 * iterated.
 */
export function decodeEscapes(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "\\" || i + 1 >= text.length) {
      out += text[i];
      continue;
    }
    const next = text[++i];
    if (next === "u" && /^[0-9a-fA-F]{4}$/.test(text.slice(i + 1, i + 5))) {
      out += String.fromCharCode(parseInt(text.slice(i + 1, i + 5), 16));
      i += 4;
    } else if (next in ESCAPES) {
      out += ESCAPES[next];
    } else {
      // Unknown escape: keep it verbatim rather than inventing a character.
      out += "\\" + next;
    }
  }
  return out;
}

/** True when the whole text is one quoted string, quotes included. */
function isQuoted(text: string): boolean {
  const q = QUOTES.find((c) => text.startsWith(c));
  if (q === undefined || text.length < 2 || !text.endsWith(q)) return false;

  // Walk it to be sure the opening quote closes at the very end, so
  // `'a' + 'b'` is not mistaken for one string.
  for (let i = 1; i < text.length; i++) {
    if (text[i] === "\\") {
      i++;
      continue;
    }
    if (text[i] === q) return i === text.length - 1;
  }
  return false;
}

export function parseValue(raw: string): ValueShape {
  const text = raw.trim();

  if (isWrapped(text, "[")) {
    const inner = text.slice(1, -1).trim();
    return { kind: "array", items: inner === "" ? [] : splitTopLevel(inner) };
  }

  if (isWrapped(text, "{")) {
    const inner = text.slice(1, -1).trim();
    if (inner === "") return { kind: "object", entries: [] };

    const entries: Array<{ key: string; value: string }> = [];
    for (const part of splitTopLevel(inner)) {
      // Only the first colon separates: a value may contain more of them.
      const at = part.indexOf(":");
      if (at === -1) {
        // Set-like or shorthand notation; show it as its own key.
        entries.push({ key: part, value: "" });
      } else {
        entries.push({
          key: part.slice(0, at).trim().replace(/^["'`]|["'`]$/g, ""),
          value: part.slice(at + 1).trim(),
        });
      }
    }
    return { kind: "object", entries };
  }

  if (isQuoted(text)) {
    const decoded = decodeEscapes(text.slice(1, -1));
    // Spread, not split(""): split tears surrogate pairs in half, so an emoji
    // would become two meaningless cells.
    const chars = [...decoded];
    if (chars.length > 0 && chars.length <= MAX_STRING_CELLS) {
      return { kind: "string", text: decoded, chars };
    }
  }

  return { kind: "scalar", text };
}

/**
 * Which cell of a collection the current step is working on, or null.
 *
 * The trace does not record this. `loop_iteration` reports a label and a
 * 1-based counter, and nothing ties either to a position in a particular
 * variable, so the index is inferred:
 *
 *   1. The loop counter gives a candidate position, `iteration - 1`.
 *   2. If some other variable in scope currently holds the value sitting at
 *      that position, the candidate is corroborated and used.
 *   3. Failing that, if exactly one cell matches a variable in scope, that
 *      cell is used instead — this covers `while` loops with a hand-rolled
 *      index, which report no iteration at all.
 *
 * Null when nothing supports a guess. A pointer under the wrong cell is
 * worse than no pointer, so this returns null rather than defaulting to 0.
 */
export function activeIndex(
  items: string[],
  vars: TraceVar[],
  iteration?: number,
): number | null {
  if (items.length === 0) return null;

  /*
   * Compare unquoted and unescaped on both sides.
   *
   * Walking a string, the cell holds a bare `l` while the loop variable is
   * reported as `'l'`; walking an array of strings, the item may be `"a"` and
   * the variable `'a'`. Neither pair is equal as written.
   */
  const norm = (text: string) => decodeEscapes(unquote(text));

  const scalars = vars
    // A collection cannot be the single element being read, so it never
    // corroborates a position -- but a one-character string is exactly what
    // a string walk puts in scope, so strings stay in.
    .filter((v) => {
      const kind = parseValue(v.value).kind;
      return kind !== "array" && kind !== "object";
    })
    .map((v) => norm(v.value));

  const cell = (i: number) => norm(items[i]);

  const candidate = iteration === undefined ? null : iteration - 1;
  if (
    candidate !== null &&
    candidate >= 0 &&
    candidate < items.length &&
    scalars.includes(cell(candidate))
  ) {
    return candidate;
  }

  const matches = items
    .map((_item, i) => ({ i, hit: scalars.includes(cell(i)) }))
    .filter((m) => m.hit);
  if (matches.length === 1) return matches[0].i;

  // The counter alone, when it is at least in range. Ambiguous value matches
  // (a list with repeats) fall through to here rather than picking one.
  if (candidate !== null && candidate >= 0 && candidate < items.length) {
    return candidate;
  }

  return null;
}

/**
 * Which single variable owns the "reading" pointer this step, if any.
 *
 * Asking each collection independently whether it has an active cell gives
 * the wrong answer when more than one is in scope: walking `s` while building
 * `seen` from it, the accumulator keeps matching the loop character too, and
 * both rows sprout a pointer. Only one collection is being read, so the
 * choice has to be made across all of them at once.
 *
 * A variable whose value changed on this step was *written*, not read, so an
 * unchanged collection always wins. If every candidate changed -- an in-place
 * sort, say, where the array being walked is also being mutated -- the first
 * is used rather than none, because there the pointer is still the truth.
 */
export function pointerTarget(
  vars: TraceVar[],
  iteration?: number,
): { name: string; index: number } | null {
  const candidates: Array<{ name: string; index: number; changed: boolean }> =
    [];

  for (const v of vars) {
    const shape = parseValue(v.value);
    const items =
      shape.kind === "array"
        ? shape.items
        : shape.kind === "string"
          ? shape.chars
          : null;
    // One cell is not a walk. Without this a single-character loop variable
    // counts as its own collection and points at itself, which is how `ch`
    // stole the pointer from the string it was reading.
    if (items === null || items.length < 2) continue;

    const index = activeIndex(items, vars, iteration);
    if (index !== null) {
      candidates.push({ name: v.name, index, changed: !!v.changed });
    }
  }

  if (candidates.length === 0) return null;
  const pick = candidates.find((c) => !c.changed) ?? candidates[0];
  return { name: pick.name, index: pick.index };
}
