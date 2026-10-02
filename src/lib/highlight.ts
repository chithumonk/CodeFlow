/**
 * A deliberately tiny JS/TS tokenizer.
 *
 * CodeFlow's real editor will be CodeMirror 6, but the landing page only needs
 * to colour a handful of hand-picked snippets. Shipping a full grammar for that
 * would cost far more than it returns, so this walks the line left-to-right and
 * takes the first rule that matches.
 */

export type TokenKind =
  | "comment"
  | "string"
  | "number"
  | "keyword"
  | "literal"
  | "fn"
  | "ident"
  | "operator"
  | "punct"
  | "plain";

export interface Token {
  kind: TokenKind;
  text: string;
}

interface Rule {
  kind: TokenKind;
  re: RegExp;
}

/** Order is significance: earlier rules win at the same position. */
const RULES: Rule[] = [
  { kind: "comment", re: /^\/\/.*/ },
  {
    kind: "string",
    re: /^(?:`(?:[^`\\]|\\.)*`|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/,
  },
  { kind: "number", re: /^\d+(?:\.\d+)?\b/ },
  {
    kind: "literal",
    re: /^(?:true|false|null|undefined|NaN|this)\b/,
  },
  {
    kind: "keyword",
    re: /^(?:function|return|const|let|var|for|of|in|if|else|while|do|new|class|extends|import|export|default|from|as|await|async|try|catch|finally|throw|typeof|instanceof|delete|void|yield|switch|case|break|continue|interface|type)\b/,
  },
  // An identifier immediately followed by "(" reads as a call or declaration.
  { kind: "fn", re: /^[A-Za-z_$][\w$]*(?=\s*\()/ },
  { kind: "ident", re: /^[A-Za-z_$][\w$]*/ },
  { kind: "operator", re: /^(?:=>|\.\.\.|[+\-*/%=<>!&|^~?:]+)/ },
  { kind: "punct", re: /^[{}()[\];,.]/ },
  { kind: "plain", re: /^\s+/ },
];

/** Split one line of source into coloured tokens. */
export function tokenize(line: string): Token[] {
  const tokens: Token[] = [];
  let rest = line;

  while (rest.length > 0) {
    let matched = false;

    for (const rule of RULES) {
      const m = rule.re.exec(rest);
      if (m && m[0].length > 0) {
        tokens.push({ kind: rule.kind, text: m[0] });
        rest = rest.slice(m[0].length);
        matched = true;
        break;
      }
    }

    // Unknown character: emit it verbatim so nothing is ever dropped.
    if (!matched) {
      tokens.push({ kind: "plain", text: rest[0] });
      rest = rest.slice(1);
    }
  }

  return tokens;
}

/** Shared token colours, mixed into any component that renders code. */
export const highlightStyles = `
  .tok-comment { color: var(--cf-text-faint); font-style: italic; }
  .tok-string  { color: var(--cf-green); }
  .tok-number  { color: var(--cf-yellow); }
  .tok-keyword { color: var(--cf-violet); }
  .tok-literal { color: var(--cf-rose); }
  .tok-fn      { color: var(--cf-blue); }
  .tok-ident   { color: var(--cf-text); }
  .tok-operator{ color: var(--cf-teal); }
  .tok-punct   { color: var(--cf-text-muted); }

  /* Whitespace tokens carry the source indentation, so they have to survive
     collapsing even where the surrounding element is not white-space: pre.
     This keeps indentation correct no matter how the Lit template around the
     tokens happens to be line-wrapped by a formatter. */
  .tok-plain   { color: var(--cf-text-dim); white-space: pre; }
`;
