import Parser from "web-tree-sitter";
import { createRequire } from "node:module";
import { C_TRACER, CPP_TRACER, LINE_RESET } from "./c-tracer.js";

/**
 * Rewrites C and C++ so that running the program also reports what it did.
 *
 * Same conservative rule as the JavaScript and Java passes: only splice into
 * statement LISTS — here, the children of a compound_statement — and never
 * into the middle of an expression. That is what keeps the output compiling.
 *
 * The one thing these two need that the others do not is the TYPE of each
 * value. C has no function overloading, so a single reporting function would
 * not typecheck. Instrumenting at the declaration solves it: the declared
 * type is right there, so the right reporter can be chosen. Anything whose
 * type is not recognised is simply not reported, which is always safe.
 */

export type CDialect = "c" | "cpp";

const require = createRequire(import.meta.url);

/**
 * One literal require per dialect, rather than a template string built from
 * `dialect`.
 *
 * A path computed at runtime is invisible to static analysis — and that is
 * exactly how these two .wasm files are found and bundled, both by Vite in
 * the browser build and by Vercel's function bundler tracing this file's
 * dependencies. A templated `require.resolve` would silently ship a function
 * missing both grammars, so C and C++ tracing would 500 only in production.
 */
const WASM_PATH: Record<CDialect, string> = {
  c: require.resolve("tree-sitter-wasms/out/tree-sitter-c.wasm"),
  cpp: require.resolve("tree-sitter-wasms/out/tree-sitter-cpp.wasm"),
};

let ready: Promise<void> | null = null;
const languages = new Map<CDialect, Parser.Language>();

async function parserFor(dialect: CDialect): Promise<Parser> {
  ready ??= Parser.init();
  await ready;

  let language = languages.get(dialect);
  if (!language) {
    language = await Parser.Language.load(WASM_PATH[dialect]);
    languages.set(dialect, language);
  }

  const parser = new Parser();
  parser.setLanguage(language);
  return parser;
}

/** How a value of a given declared type should be reported, if at all. */
type Reporter = "int" | "float" | "string" | null;

const INT_TYPES =
  /^(?:(?:un)?signed\s+)?(?:char|short|int|long|long\s+long|size_t|ssize_t|bool|_Bool|int8_t|int16_t|int32_t|int64_t|uint8_t|uint16_t|uint32_t|uint64_t)$/;
const FLOAT_TYPES = /^(?:float|double|long\s+double)$/;
const STRING_TYPES = /^(?:(?:const\s+)?char\s*\*|std::string|string)$/;

function reporterFor(type: string, dialect: CDialect): Reporter {
  const clean = type.replace(/\s+/g, " ").trim();

  if (INT_TYPES.test(clean)) return "int";
  if (FLOAT_TYPES.test(clean)) return "float";
  if (STRING_TYPES.test(clean)) return "string";
  // C++ can stream a std::string; C cannot, and neither can print a struct
  // without knowing its shape.
  if (dialect === "cpp" && /^std::string$/.test(clean)) return "string";
  return null;
}

function reportCall(
  dialect: CDialect,
  reporter: Reporter,
  name: string,
): string | null {
  if (!reporter) return null;

  if (dialect === "cpp") return ` __cf::v("${name}", ${name});`;

  switch (reporter) {
    case "int":
      return ` __cf_vll("${name}", (long long) (${name}));`;
    case "float":
      return ` __cf_vd("${name}", (double) (${name}));`;
    case "string":
      return ` __cf_vs("${name}", ${name});`;
  }
}

interface Insert {
  offset: number;
  text: string;
  /** Higher sorts later at the same offset. */
  order: number;
}

export interface InstrumentResult {
  code: string;
  error: string | null;
}

/** Collides with the tracer's own names. */
const RESERVED = /\b(?:__cf_[a-z]|__cf::|CF_FRAME|CF_RET_)/;

export async function instrumentC(
  source: string,
  dialect: CDialect,
): Promise<InstrumentResult> {
  if (RESERVED.test(source)) {
    return {
      code: source,
      error:
        "This file uses a name beginning __cf, which CodeFlow needs for tracing.",
    };
  }

  const parser = await parserFor(dialect);
  const tree = parser.parse(source);

  if (tree.rootNode.hasError) {
    // Let the compiler report it: its message is better than a parser's.
    return { code: source, error: "This file did not parse cleanly." };
  }

  const inserts: Insert[] = [];
  /** Declared locals, so an assignment only reports something real. */
  const localTypes = new Map<string, Reporter>();

  const nameOf = (node: Parser.SyntaxNode | null): string | null => {
    if (!node) return null;
    if (node.type === "identifier" || node.type === "field_identifier") {
      return node.text;
    }
    for (let i = 0; i < node.namedChildCount; i++) {
      const found = nameOf(node.namedChild(i));
      if (found) return found;
    }
    return null;
  };

  /**
   * Names declared by a `declaration`, each with the reporter it needs.
   *
   * The declared TYPE alone is not enough. For `const char *c`, the type
   * field is just `char` — the `*` lives in the declarator. Reporting that
   * as an integer prints a pointer address instead of the string, so
   * pointer-ness has to be read from the declarator.
   */
  const declaredIn = (
    node: Parser.SyntaxNode,
  ): { name: string; reporter: Reporter }[] => {
    const baseType = node.childForFieldName("type")?.text ?? "";
    const base = reporterFor(baseType, dialect);
    const out: { name: string; reporter: Reporter }[] = [];

    const isPointer = (declarator: Parser.SyntaxNode | null): boolean => {
      let current = declarator;
      while (current) {
        if (current.type === "pointer_declarator") return true;
        if (current.type === "array_declarator") return true;
        current = current.childForFieldName("declarator");
      }
      return false;
    };

    for (let i = 0; i < node.namedChildCount; i++) {
      const child = node.namedChild(i)!;
      let declarator: Parser.SyntaxNode | null = null;

      if (child.type === "init_declarator") {
        declarator = child.childForFieldName("declarator");
      } else if (
        child.type === "identifier" ||
        child.type === "pointer_declarator" ||
        child.type === "array_declarator"
      ) {
        declarator = child;
      } else {
        continue;
      }

      const name = nameOf(declarator);
      if (!name) continue;

      // A char pointer is a string; any other pointer or array would only
      // report an address, which tells the reader nothing useful.
      const reporter: Reporter = isPointer(declarator)
        ? /\bchar\b/.test(baseType)
          ? "string"
          : null
        : base;

      out.push({ name, reporter });
    }

    return out;
  };

  const walk = (node: Parser.SyntaxNode) => {
    // A function body gets a frame guard, which is what maintains the stack.
    if (node.type === "function_definition") {
      const name = nameOf(node.childForFieldName("declarator"));
      const body = node.childForFieldName("body");
      if (name && body && body.type === "compound_statement") {
        inserts.push({
          offset: body.startIndex + 1,
          text: ` CF_FRAME("${name}")`,
          order: -100,
        });
      }
      // Each function has its own locals.
      localTypes.clear();
    }

    if (node.type === "compound_statement") {
      for (let i = 0; i < node.namedChildCount; i++) {
        const statement = node.namedChild(i)!;
        if (statement.type === "comment") continue;

        // C++ puts the tracer in a namespace; C has no namespaces.
        const lineCall = dialect === "cpp" ? "__cf::l" : "__cf_l";
        inserts.push({
          offset: statement.startIndex,
          text: `${lineCall}(${statement.startPosition.row + 1}); `,
          order: 0,
        });

        const after = reportsAfter(statement);
        if (after) {
          inserts.push({ offset: statement.endIndex, text: after, order: 10 });
        }
      }
    }

    // `for (int n = 0; ...)` — report the loop variable inside the body,
    // where it is still in scope.
    if (node.type === "for_statement") {
      const init = node.childForFieldName("initializer");
      const body = node.childForFieldName("body");
      if (init && init.type === "declaration" && body?.type === "compound_statement") {
        const calls = declaredIn(init)
          .map(({ name, reporter }) => {
            localTypes.set(name, reporter);
            return reportCall(dialect, reporter, name);
          })
          .filter(Boolean)
          .join("");
        if (calls) {
          inserts.push({ offset: body.startIndex + 1, text: calls, order: -50 });
        }
      }
    }

    if (node.type === "return_statement") {
      wrapReturn(node);
    }

    for (let i = 0; i < node.childCount; i++) walk(node.child(i)!);
  };

  /** What should be reported once this statement has run. */
  const reportsAfter = (statement: Parser.SyntaxNode): string | null => {
    if (statement.type === "declaration") {
      const calls = declaredIn(statement)
        .map(({ name, reporter }) => {
          localTypes.set(name, reporter);
          return reportCall(dialect, reporter, name);
        })
        .filter(Boolean)
        .join("");
      return calls || null;
    }

    if (statement.type === "expression_statement") {
      const expression = statement.namedChild(0);
      if (!expression) return null;

      let target: string | null = null;
      if (expression.type === "assignment_expression") {
        const left = expression.childForFieldName("left");
        if (left?.type === "identifier") target = left.text;
      } else if (
        expression.type === "update_expression" // n++ / ++n
      ) {
        const argument = expression.childForFieldName("argument");
        if (argument?.type === "identifier") target = argument.text;
      }

      // Only a local we saw declared: naming anything else would not compile.
      if (target && localTypes.has(target)) {
        return reportCall(dialect, localTypes.get(target)!, target);
      }
    }

    return null;
  };

  /** `return expr;` reports the value, evaluating it exactly once. */
  const wrapReturn = (node: Parser.SyntaxNode) => {
    const value = node.namedChild(0);
    if (!value) return;

    const fn = enclosingFunction(node);
    const returnType = fn?.childForFieldName("type")?.text ?? "";
    const reporter = reporterFor(returnType, dialect);
    if (!reporter) return;

    if (dialect === "cpp") {
      inserts.push({ offset: value.startIndex, text: "__cf::r(", order: 5 });
      inserts.push({ offset: value.endIndex, text: ")", order: -5 });
      return;
    }

    const macro = reporter === "float" ? "CF_RET_D" : "CF_RET_I";
    inserts.push({ offset: value.startIndex, text: `${macro}(`, order: 5 });
    inserts.push({ offset: value.endIndex, text: ")", order: -5 });
  };

  const enclosingFunction = (
    node: Parser.SyntaxNode,
  ): Parser.SyntaxNode | null => {
    let current: Parser.SyntaxNode | null = node;
    while (current && current.type !== "function_definition") {
      current = current.parent;
    }
    return current;
  };

  walk(tree.rootNode);

  // Back to front, so every offset still refers to the original text.
  const ordered = [...inserts].sort(
    (a, b) => b.offset - a.offset || b.order - a.order,
  );

  let code = source;
  for (const insert of ordered) {
    code = code.slice(0, insert.offset) + insert.text + code.slice(insert.offset);
  }

  const prologue = dialect === "cpp" ? CPP_TRACER : C_TRACER;
  return { code: prologue + LINE_RESET + code, error: null };
}
