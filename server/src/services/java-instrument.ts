import { parse, BaseJavaCstVisitorWithDefaults } from "java-parser";
import { JAVA_TRACER } from "./java-tracer.js";

/**
 * Rewrites Java source so that running it also reports what it did.
 *
 * Same strategy as the JavaScript instrumenter: find the statements that sit
 * directly in a statement LIST, and splice calls in around them, back to
 * front so earlier offsets stay valid. Nothing is ever injected into the
 * middle of an expression, which is what keeps the result compiling.
 *
 * The consequence, as in JavaScript, is that a single statement used as a
 * loop or `if` body without braces is not reported — there is no statement
 * list to splice into. Adding braces makes it visible.
 */

interface Insert {
  offset: number;
  text: string;
  /** Lower sorts earlier when two inserts share an offset. */
  order: number;
}

interface Token {
  image: string;
  startOffset: number;
  endOffset?: number;
  startLine?: number;
  tokenType?: { name: string };
}

type Node = Record<string, unknown>;

function isToken(value: unknown): value is Token {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Token).image === "string" &&
    typeof (value as Token).startOffset === "number"
  );
}

function eachChild(node: unknown, fn: (child: unknown) => void) {
  if (!node || typeof node !== "object") return;
  const children = ((node as Node).children ?? node) as Node;
  for (const value of Object.values(children)) {
    if (Array.isArray(value)) value.forEach(fn);
    else if (value && typeof value === "object") fn(value);
  }
}

function firstToken(node: unknown): Token | null {
  let best: Token | null = null;
  const walk = (n: unknown) => {
    if (isToken(n)) {
      if (!best || n.startOffset < best.startOffset) best = n;
      return;
    }
    eachChild(n, walk);
  };
  walk(node);
  return best;
}

function lastToken(node: unknown): Token | null {
  let best: Token | null = null;
  const walk = (n: unknown) => {
    if (isToken(n)) {
      const end = n.endOffset ?? n.startOffset;
      const bestEnd = best ? (best.endOffset ?? best.startOffset) : -1;
      if (end > bestEnd) best = n;
      return;
    }
    eachChild(n, walk);
  };
  walk(node);
  return best;
}

/** Identifier names declared by a variable-declarator list. */
function declaredNames(node: unknown): string[] {
  const names: string[] = [];
  const walk = (n: unknown, insideDeclaratorId: boolean) => {
    if (isToken(n)) {
      if (insideDeclaratorId && n.tokenType?.name === "Identifier") {
        names.push(n.image);
      }
      return;
    }
    if (!n || typeof n !== "object") return;
    const children = ((n as Node).children ?? {}) as Node;
    for (const [key, value] of Object.entries(children)) {
      const inside = insideDeclaratorId || key === "variableDeclaratorId";
      if (Array.isArray(value)) value.forEach((v) => walk(v, inside));
      else if (value && typeof value === "object") walk(value, inside);
    }
  };
  walk(node, false);
  return names;
}

/**
 * A statement that assigns to a plain local, e.g. `total += n;`.
 *
 * Read off the statement's own text rather than the tree: the assignment
 * shapes worth reporting are exactly the ones that look like this, and a
 * narrower rule is safer than a broad tree walk that might name something
 * which is not in scope — that would fail to compile.
 */
const SIMPLE_ASSIGNMENT = /^([A-Za-z_$][A-Za-z0-9_$]*)\s*(?:=[^=]|\+=|-=|\*=|\/=|%=|\+\+|--)/;
const TRAILING_INCREMENT = /^(?:\+\+|--)([A-Za-z_$][A-Za-z0-9_$]*)/;

class Instrumenter extends BaseJavaCstVisitorWithDefaults {
  inserts: Insert[] = [];
  /** Locals declared in the method being visited, so we only print real ones. */
  private locals = new Set<string>();
  private source: string;

  constructor(source: string) {
    super();
    this.source = source;
    this.validateVisitor();
  }

  private statementText(start: number, end: number): string {
    return this.source.slice(start, end + 1).trim();
  }

  /** Every statement directly inside a block. */
  blockStatements(ctx: Record<string, unknown[]>) {
    const list = (ctx.blockStatement ?? []) as unknown[];

    for (const statement of list) {
      const first = firstToken(statement);
      const last = lastToken(statement);
      if (!first || first.startLine === undefined) continue;

      this.inserts.push({
        offset: first.startOffset,
        text: `__CF.l(${first.startLine}); `,
        order: 0,
      });

      // Report what the statement changed, after it has run.
      if (last?.endOffset !== undefined) {
        const names = this.namesTouchedBy(statement, first, last);
        if (names.length) {
          this.inserts.push({
            offset: last.endOffset + 1,
            text: names.map((n) => ` __CF.v("${n}", ${n});`).join(""),
            order: 10,
          });
        }
      }
    }

    for (const statement of list) this.visit(statement as never);
  }

  private namesTouchedBy(
    statement: unknown,
    first: Token,
    last: Token,
  ): string[] {
    // A declaration is reliable: the parser tells us exactly what it declares.
    const declared = this.declarationNames(statement);
    if (declared.length) {
      declared.forEach((n) => this.locals.add(n));
      return declared;
    }

    const text = this.statementText(first.startOffset, last.endOffset ?? first.startOffset);
    const assigned =
      SIMPLE_ASSIGNMENT.exec(text)?.[1] ?? TRAILING_INCREMENT.exec(text)?.[1];

    return assigned && this.locals.has(assigned) ? [assigned] : [];
  }

  /**
   * Non-empty only when this statement IS a local declaration.
   *
   * Direct children only. Walking deeper would find the `int n` inside a
   * `for` header and report it after the whole loop, where it is no longer
   * in scope — which does not compile.
   */
  private declarationNames(statement: unknown): string[] {
    const children = ((statement as Node)?.children ?? {}) as Node;
    const declaration = (children.localVariableDeclarationStatement ??
      []) as unknown[];
    return declaration.length ? declaredNames(declaration[0]) : [];
  }

  /** `for (int n = 0; ...)` — report the loop variable inside the body. */
  basicForStatement(ctx: Record<string, unknown[]>) {
    const init = (ctx.forInit ?? [])[0];
    const body = (ctx.statement ?? [])[0];
    const names = init ? declaredNames(init) : [];

    if (names.length && body) {
      names.forEach((n) => this.locals.add(n));
      const open = firstToken(body);
      // Only when the body is a braced block; there is no statement list to
      // splice into otherwise.
      if (open && open.image === "{") {
        this.inserts.push({
          offset: open.startOffset + 1,
          text: names.map((n) => ` __CF.v("${n}", ${n});`).join(""),
          order: -10,
        });
      }
    }

    if (ctx.statement) for (const s of ctx.statement) this.visit(s as never);
    if (ctx.expression) for (const e of ctx.expression) this.visit(e as never);
  }

  /** `for (String s : list)` — same idea for the enhanced form. */
  enhancedForStatement(ctx: Record<string, unknown[]>) {
    const body = (ctx.statement ?? [])[0];
    const names = declaredNames(
      (ctx.localVariableDeclaration ?? ctx.variableDeclaratorId ?? [])[0],
    );

    if (names.length && body) {
      names.forEach((n) => this.locals.add(n));
      const open = firstToken(body);
      if (open && open.image === "{") {
        this.inserts.push({
          offset: open.startOffset + 1,
          text: names.map((n) => ` __CF.v("${n}", ${n});`).join(""),
          order: -10,
        });
      }
    }

    if (ctx.statement) for (const s of ctx.statement) this.visit(s as never);
  }

  /** `return expr;` becomes `return __CF.r(expr);`. */
  returnStatement(ctx: Record<string, unknown[]>) {
    const expression = (ctx.expression ?? [])[0];
    if (expression) {
      const start = firstToken(expression);
      const end = lastToken(expression);
      if (start && end?.endOffset !== undefined) {
        this.inserts.push({ offset: start.startOffset, text: "__CF.r(", order: 5 });
        this.inserts.push({ offset: end.endOffset + 1, text: ")", order: -5 });
      }
      this.visit(expression as never);
    }
  }

  /** Each method gets its own notion of which locals exist. */
  methodDeclaration(ctx: Record<string, unknown[]>) {
    const previous = this.locals;
    this.locals = new Set();
    eachChild({ children: ctx }, (child) => this.visit(child as never));
    this.locals = previous;
  }
}

export interface InstrumentResult {
  /** Instrumented source, with the tracer class appended. */
  code: string;
  /** Null when the source parsed; otherwise why it could not be instrumented. */
  error: string | null;
}

/** Characters that would collide with the tracer's own name. */
const RESERVED = /\b__CF\b/;

export function instrumentJava(source: string): InstrumentResult {
  if (RESERVED.test(source)) {
    return {
      code: source,
      error: "This file uses the name __CF, which CodeFlow needs for tracing.",
    };
  }

  let visitor: Instrumenter;
  try {
    const cst = parse(source);
    visitor = new Instrumenter(source);
    visitor.visit(cst as never);
  } catch (error) {
    // A syntax error is the compiler's to report, with its better message.
    // Running the original source gets that, rather than a parser's wording.
    return {
      code: source,
      error: error instanceof Error ? error.message : "Could not parse this file.",
    };
  }

  // Back to front, so every offset still refers to the original text. Ties
  // are broken by `order` to keep `__CF.r(` outside the expression it wraps.
  const ordered = [...visitor.inserts].sort(
    (a, b) => b.offset - a.offset || b.order - a.order,
  );

  let code = source;
  for (const insert of ordered) {
    code = code.slice(0, insert.offset) + insert.text + code.slice(insert.offset);
  }

  return { code: `${code}\n${JAVA_TRACER}`, error: null };
}
