/**
 * The C and C++ side of step-through for those languages.
 *
 * Prepended to the user's file, so their own line numbers must not move. The
 * whole prologue is therefore emitted on ONE line, and the instrumenter only
 * ever splices within existing lines.
 *
 * Neither language can report its own call stack the way the JVM can, so the
 * tracer keeps one:
 *   C++  a scope guard whose destructor pops — correct through any exit,
 *        including an exception.
 *   C    GCC's __attribute__((cleanup)), which runs a function when a local
 *        goes out of scope. Same guarantee, and both GCC and Clang have it.
 *
 * Events are printed as they happen, each on its own sentinel-prefixed line,
 * so the program's own output keeps its position relative to the steps that
 * produced it.
 */

/**
 * Marks a trace line in stdout.
 *
 * Written as an octal escape in the C source, never hex: a hex escape in
 * C is greedy, so "\x01CF" is read as one escape with the digits "01CF" —
 * out of range, and the sentinel never appears.
 */
export const C_TRACE_SENTINEL = "\u0001CF\u0001";

const C_SENTINEL_LITERAL = String.raw`\001CF\001`;

/**
 * The prologue spans as many lines as it needs: `#include` and `#define` are
 * preprocessor directives, and each has to be alone on its line.
 *
 * The user's line numbers survive anyway because `#line 1` follows, which
 * tells the compiler to number the next line as 1. Without it, every error
 * the compiler reports would be off by the length of this prologue.
 */
const join = (lines: string[]) => lines.join("\n");

/** Put between the tracer and the user's code. */
export const LINE_RESET = "\n#line 1\n";

export const C_TRACER = join([
  "#include <stdio.h>",
  "static const char *__cf_stack[256];",
  "static int __cf_depth = 0;",
  "static long __cf_events = 0;",
  "static const long __CF_MAX_EVENTS = 200000;",
  "static int __cf_over(void) { return ++__cf_events > __CF_MAX_EVENTS; }",
  "static void __cf_esc(const char *s) {",
  "  for (; *s; s++) {",
  '    if (*s == 34 || *s == 92) { putchar(92); putchar(*s); }',
  '    else if (*s == 10) { putchar(92); putchar(110); }',
  '    else if (*s == 13) { putchar(92); putchar(114); }',
  '    else if (*s == 9) { putchar(92); putchar(116); }',
  "    else if ((unsigned char) *s < 32) printf(\"\\\\u%04x\", (unsigned char) *s);",
  "    else putchar(*s);",
  "  }",
  "}",
  "static void __cf_l(int line) {",
  "  if (__cf_over()) return;",
  `  printf("${C_SENTINEL_LITERAL}{\\"t\\":\\"l\\",\\"n\\":%d,\\"s\\":[", line);`,
  '  for (int i = 0; i < __cf_depth; i++) { if (i) putchar(44); putchar(34); __cf_esc(__cf_stack[i]); putchar(34); }',
  '  printf("]}\\n"); fflush(stdout);',
  "}",
  "static void __cf_vll(const char *k, long long v) {",
  "  if (__cf_over()) return;",
  `  printf("${C_SENTINEL_LITERAL}{\\"t\\":\\"v\\",\\"k\\":\\"%s\\",\\"val\\":\\"%lld\\"}\\n", k, v);`,
  "  fflush(stdout);",
  "}",
  "static void __cf_vd(const char *k, double v) {",
  "  if (__cf_over()) return;",
  `  printf("${C_SENTINEL_LITERAL}{\\"t\\":\\"v\\",\\"k\\":\\"%s\\",\\"val\\":\\"%g\\"}\\n", k, v);`,
  "  fflush(stdout);",
  "}",
  "static void __cf_vs(const char *k, const char *v) {",
  "  if (__cf_over()) return;",
  `  printf("${C_SENTINEL_LITERAL}{\\"t\\":\\"v\\",\\"k\\":\\"%s\\",\\"val\\":\\"", k);`,
  '  if (v) { putchar(92); putchar(34); __cf_esc(v); putchar(92); putchar(34); } else printf("NULL");',
  '  printf("\\"}\\n"); fflush(stdout);',
  "}",
  "static void __cf_rll(long long v) {",
  "  if (__cf_over()) return;",
  `  printf("${C_SENTINEL_LITERAL}{\\"t\\":\\"r\\",\\"val\\":\\"%lld\\"}\\n", v); fflush(stdout);`,
  "}",
  "static void __cf_rd(double v) {",
  "  if (__cf_over()) return;",
  `  printf("${C_SENTINEL_LITERAL}{\\"t\\":\\"r\\",\\"val\\":\\"%g\\"}\\n", v); fflush(stdout);`,
  "}",
  "static int __cf_push(const char *name) {",
  "  if (__cf_depth < 256) __cf_stack[__cf_depth++] = name;",
  "  return 0;",
  "}",
  "static void __cf_pop(int *u) { (void) u; if (__cf_depth > 0) __cf_depth--; }",
  // The cleanup attribute is what gives C a reliable pop on every exit path.
  "#define CF_FRAME(n) __attribute__((cleanup(__cf_pop))) int __cf_guard = __cf_push(n);",
  // Statement expressions keep the returned expression evaluated exactly once.
  "#define CF_RET_I(e) ({ long long __cf_t = (e); __cf_rll(__cf_t); __cf_t; })",
  "#define CF_RET_D(e) ({ double __cf_t = (e); __cf_rd(__cf_t); __cf_t; })",
]);

export const CPP_TRACER = join([
  "#include <iostream>",
  "#include <sstream>",
  "#include <vector>",
  "#include <string>",
  "namespace __cf {",
  "static std::vector<const char*> stack;",
  "static long events = 0;",
  "static const long MAX_EVENTS = 200000;",
  "inline bool over() { return ++events > MAX_EVENTS; }",
  "inline std::string esc(const std::string &s) {",
  "  std::string o;",
  "  for (char c : s) {",
  "    if (c == '\"' || c == '\\\\') { o += '\\\\'; o += c; }",
  "    else if (c == '\\n') o += \"\\\\n\";",
  "    else if (c == '\\r') o += \"\\\\r\";",
  "    else if (c == '\\t') o += \"\\\\t\";",
  "    else o += c;",
  "  }",
  "  return o;",
  "}",
  "inline void l(int line) {",
  "  if (over()) return;",
  `  std::cout << "${C_SENTINEL_LITERAL}" << "{\\"t\\":\\"l\\",\\"n\\":" << line << ",\\"s\\":[";`,
  '  for (size_t i = 0; i < stack.size(); i++) { if (i) std::cout << ","; std::cout << \'"\' << esc(stack[i]) << \'"\'; }',
  '  std::cout << "]}\\n" << std::flush;',
  "}",
  // One template covers every streamable type; C++ has overloading, so no
  // per-type entry point is needed the way it is in C.
  "template <class T> inline void v(const char *k, const T &value) {",
  "  if (over()) return;",
  "  std::ostringstream s; s << value;",
  `  std::cout << "${C_SENTINEL_LITERAL}" << "{\\"t\\":\\"v\\",\\"k\\":\\"" << esc(k) << "\\",\\"val\\":\\"" << esc(s.str()) << "\\"}\\n" << std::flush;`,
  "}",
  "template <class T> inline T r(const T &value) {",
  "  if (!over()) {",
  "    std::ostringstream s; s << value;",
  `    std::cout << "${C_SENTINEL_LITERAL}" << "{\\"t\\":\\"r\\",\\"val\\":\\"" << esc(s.str()) << "\\"}\\n" << std::flush;`,
  "  }",
  "  return value;",
  "}",
  "struct Frame {",
  "  Frame(const char *n) { stack.push_back(n); }",
  "  ~Frame() { if (!stack.empty()) stack.pop_back(); }",
  "};",
  "}",
  "#define CF_FRAME(n) __cf::Frame __cf_frame(n);",
]);
