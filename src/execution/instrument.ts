import { parse } from "acorn";
import type { Node } from "acorn";

/**
 * Rewrites JavaScript so that running it reports what it did.
 *
 * The approach is source-level instrumentation: parse to an AST, work out
 * where to splice in calls to a runtime object, and apply those splices from
 * the end of the file backwards so earlier offsets stay valid. No code
 * generator is involved, so the user's own formatting, comments and
 * semantics survive untouched — only extra statements are added.
 *
 * The alternative, writing an interpreter, would mean reimplementing
 * JavaScript's semantics and getting them subtly wrong. Here the real engine
 * still runs the code; we only ask it to narrate.
 */

export class InstrumentError extends Error {
  readonly line?: number;
  constructor(message: string, line?: number) {
    super(message);
    this.name = "InstrumentError";
    this.line = line;
  }
}

interface Insert {
  pos: number;
  text: string;
  /** Tie-break for inserts at the same offset; lower runs first. */
  order: number;
}

/** Minimal shapes we read off acorn's nodes. */
interface AnyNode extends Node {
  type: string;
  body?: AnyNode | AnyNode[];
  [key: string]: unknown;
}

const RUNTIME = "__cf";

function quote(text: string): string {
  return JSON.stringify(text);
}

export function instrument(source: string): string {
  let ast: AnyNode;
  try {
    ast = parse(source, {
      ecmaVersion: 2022,
      sourceType: "script",
      locations: true,
      allowReturnOutsideFunction: false,
    }) as unknown as AnyNode;
  } catch (error) {
    const err = error as Error & { loc?: { line: number } };
    throw new InstrumentError(err.message, err.loc?.line);
  }

  const inserts: Insert[] = [];
  const add = (pos: number, text: string, order = 0) =>
    inserts.push({ pos, text, order });

  const lineOf = (node: AnyNode): number =>
    (node.loc as { start: { line: number } } | undefined)?.start.line ?? 0;

  let loopCounter = 0;

  /** Names bound by a declarator pattern, so we can report their values. */
  function boundNames(target: AnyNode): string[] {
    switch (target.type) {
      case "Identifier":
        return [target.name as string];
      case "ObjectPattern":
        return (target.properties as AnyNode[]).flatMap((p) =>
          p.type === "Property"
            ? boundNames(p.value as AnyNode)
            : boundNames(p.argument as AnyNode),
        );
      case "ArrayPattern":
        return (target.elements as (AnyNode | null)[]).flatMap((el) =>
          el ? boundNames(el) : [],
        );
      case "AssignmentPattern":
        return boundNames(target.left as AnyNode);
      case "RestElement":
        return boundNames(target.argument as AnyNode);
      default:
        return [];
    }
  }

  function reportNames(names: string[], pos: number) {
    for (const name of names) {
      add(
        pos,
        `${RUNTIME}.v(${quote(name)},typeof ${name}==="undefined"?undefined:${name});`,
        2,
      );
    }
  }

  /**
   * Instrument a list of statements. Only statement *lists* are safe to
   * splice into — a single-statement `if (x) return;` body has nowhere to
   * put an extra statement without inventing a block.
   */
  function walkStatements(list: AnyNode[], fnName: string | null) {
    for (const stmt of list) {
      add(stmt.start, `${RUNTIME}.s(${lineOf(stmt)});`, 0);
      walkNode(stmt, fnName);

      // Report bindings and assignments *after* the statement runs.
      if (stmt.type === "VariableDeclaration") {
        const names = (stmt.declarations as AnyNode[]).flatMap((d) =>
          boundNames(d.id as AnyNode),
        );
        reportNames(names, stmt.end);
      } else if (
        stmt.type === "ExpressionStatement" &&
        (stmt.expression as AnyNode).type === "AssignmentExpression"
      ) {
        const left = (stmt.expression as AnyNode).left as AnyNode;
        reportNames(boundNames(left), stmt.end);
      }
    }
  }

  function instrumentFunction(node: AnyNode, name: string) {
    const body = node.body as AnyNode;

    // An expression-bodied arrow has no block to instrument. It still runs
    // correctly, it just does not narrate.
    if (body.type !== "BlockStatement") return;

    add(body.start + 1, `${RUNTIME}.enter(${quote(name)});`, -1);

    // Parameters are bound on entry; surface them before the first line.
    const params = (node.params as AnyNode[]).flatMap(boundNames);
    for (const p of params) {
      add(body.start + 1, `${RUNTIME}.v(${quote(p)},${p});`, 0);
    }

    walkStatements(body.body as AnyNode[], name);

    // Reached only when the function falls off the end without returning.
    add(body.end - 1, `${RUNTIME}.exit(${quote(name)});`, 3);
  }

  function walkNode(node: AnyNode | null | undefined, fnName: string | null) {
    if (!node || typeof node.type !== "string") return;

    switch (node.type) {
      case "FunctionDeclaration":
      case "FunctionExpression": {
        const id = node.id as AnyNode | null;
        instrumentFunction(node, (id?.name as string) ?? "(anonymous)");
        return;
      }

      case "ArrowFunctionExpression":
        instrumentFunction(node, "(arrow)");
        return;

      case "ReturnStatement": {
        const owner = fnName ?? "(anonymous)";
        const argument = node.argument as AnyNode | null;

        if (argument) {
          // return X  ->  return __cf.ret("f", LINE, (X))
          // The line matters: as a recursion unwinds, each return happens
          // at a different call site, and without it every return would
          // land in the same frame and overwrite the previous value.
          add(
            argument.start,
            `${RUNTIME}.ret(${quote(owner)},${lineOf(node)},(`,
            1,
          );
          add(argument.end, `))`, -1);
          walkNode(argument, fnName);
        } else {
          add(node.start, `${RUNTIME}.exit(${quote(owner)});`, 1);
        }
        return;
      }

      case "BlockStatement":
        walkStatements(node.body as AnyNode[], fnName);
        return;

      case "ForStatement":
      case "ForInStatement":
      case "ForOfStatement":
      case "WhileStatement":
      case "DoWhileStatement": {
        const id = loopCounter++;
        const body = node.body as AnyNode;
        const label = node.type.replace("Statement", "").toLowerCase();

        if (body.type === "BlockStatement") {
          add(body.start + 1, `${RUNTIME}.loop(${id},${quote(label)});`, -1);
          walkStatements(body.body as AnyNode[], fnName);
        }

        // A for-of/for-in binding changes each iteration; report it.
        const left = node.left as AnyNode | undefined;
        if (left && body.type === "BlockStatement") {
          const names =
            left.type === "VariableDeclaration"
              ? (left.declarations as AnyNode[]).flatMap((d) =>
                  boundNames(d.id as AnyNode),
                )
              : boundNames(left);
          for (const n of names) {
            add(body.start + 1, `${RUNTIME}.v(${quote(n)},${n});`, 0);
          }
        }

        walkNode(node.init as AnyNode, fnName);
        walkNode(node.test as AnyNode, fnName);
        walkNode(node.update as AnyNode, fnName);
        walkNode(node.right as AnyNode, fnName);
        return;
      }

      default:
        break;
    }

    // Generic recursion for everything not handled above.
    for (const key of Object.keys(node)) {
      if (key === "loc" || key === "start" || key === "end" || key === "type") {
        continue;
      }
      const value = node[key];
      if (Array.isArray(value)) {
        for (const child of value) {
          if (child && typeof child === "object") {
            walkNode(child as AnyNode, fnName);
          }
        }
      } else if (value && typeof value === "object") {
        walkNode(value as AnyNode, fnName);
      }
    }
  }

  walkStatements(ast.body as AnyNode[], null);

  // Apply from the end so earlier offsets remain valid.
  inserts.sort((a, b) => b.pos - a.pos || b.order - a.order);

  let output = source;
  for (const { pos, text } of inserts) {
    output = output.slice(0, pos) + text + output.slice(pos);
  }
  return output;
}
