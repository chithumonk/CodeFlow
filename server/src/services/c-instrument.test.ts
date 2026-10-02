import { describe, expect, it } from "vitest";
import { instrumentC } from "./c-instrument.js";

/**
 * The instrumenter's one hard requirement is that its output still compiles.
 * These cover the shapes that most easily break that in C and C++: scope,
 * types without a printer, unbraced bodies, and void returns.
 */

const userCode = (code: string) => code.split("#line 1\n")[1] ?? "";

describe("instrumentC", () => {
  it("marks each statement with its own line number", async () => {
    const { code, error } = await instrumentC(
      `int main(void) {
    int x = 1;
    return 0;
}
`,
      "c",
    );

    expect(error).toBeNull();
    expect(userCode(code)).toContain("__cf_l(2); int x = 1;");
    expect(userCode(code)).toContain("__cf_l(3); return");
  });

  it("namespaces the calls in C++ but not in C", async () => {
    const source = `int main() {
    int x = 1;
    return 0;
}
`;
    const c = await instrumentC(source, "c");
    const cpp = await instrumentC(source, "cpp");

    expect(userCode(c.code)).toContain("__cf_l(2);");
    expect(userCode(c.code)).toContain('__cf_vll("x"');
    expect(userCode(cpp.code)).toContain("__cf::l(2);");
    expect(userCode(cpp.code)).toContain('__cf::v("x", x);');
  });

  it("gives every function a frame guard", async () => {
    const { code } = await instrumentC(
      `int helper(void) { return 1; }

int main(void) { return helper(); }
`,
      "c",
    );

    expect(userCode(code)).toContain('CF_FRAME("helper")');
    expect(userCode(code)).toContain('CF_FRAME("main")');
  });

  it("keeps the user's line numbers with a #line directive", async () => {
    // The prologue needs real lines for its #include directives, so without
    // this every compiler error would point at the wrong line.
    const { code } = await instrumentC(`int main(void) { return 0; }\n`, "c");
    expect(code).toContain("\n#line 1\n");
  });

  it("reports a loop variable inside the body, where it is in scope", async () => {
    const { code } = await instrumentC(
      `int main(void) {
    for (int n = 0; n < 3; n++) {
        int y = n;
    }
    return 0;
}
`,
      "c",
    );

    const text = userCode(code);
    expect(text).toContain('{ __cf_vll("n", (long long) (n));');
    // Reporting it after the loop would not compile: n is gone by then.
    expect(text).not.toMatch(/}\s*__cf_vll\("n"/);
  });

  it("picks the printer from the declared type", async () => {
    const { code } = await instrumentC(
      `int main(void) {
    int a = 1;
    double b = 2.0;
    const char *c = "hi";
    return 0;
}
`,
      "c",
    );

    const text = userCode(code);
    expect(text).toContain('__cf_vll("a", (long long) (a));');
    expect(text).toContain('__cf_vd("b", (double) (b));');
    expect(text).toContain('__cf_vs("c", c);');
  });

  it("stays silent about a type it has no printer for", async () => {
    // C has no overloading, so guessing here would fail to compile.
    const { code } = await instrumentC(
      `struct Point { int x; };

int main(void) {
    struct Point p;
    return 0;
}
`,
      "c",
    );

    expect(userCode(code)).not.toContain('"p"');
  });

  it("wraps a returned value but leaves a bare return alone", async () => {
    const { code } = await instrumentC(
      `void nothing(void) { return; }

int one(void) { return 1; }

double half(void) { return 0.5; }
`,
      "c",
    );

    const text = userCode(code);
    // CF_RET_I() with no argument would not compile, so a bare return is
    // marked as a step but never wrapped.
    expect(text).toContain("__cf_l(1); return;");
    expect(text).not.toContain("CF_RET_I(;");
    expect(text).toContain("return CF_RET_I(1);");
    expect(text).toContain("return CF_RET_D(0.5);");
  });

  it("only reports assignments to locals it saw declared", async () => {
    const { code } = await instrumentC(
      `int global_counter = 0;

int main(void) {
    int local = 0;
    local = 5;
    global_counter = 7;
    return 0;
}
`,
      "c",
    );

    const text = userCode(code);
    expect(text).toContain('local = 5; __cf_vll("local"');
    expect(text).not.toContain('__cf_vll("global_counter"');
  });

  it("leaves an unbraced body alone rather than producing invalid code", async () => {
    const { code } = await instrumentC(
      `#include <stdio.h>

int main(void) {
    int x = 1;
    if (x > 0) printf("big");
    return 0;
}
`,
      "c",
    );

    const text = userCode(code);
    expect(text).toContain('__cf_l(5); if (x > 0) printf("big");');
    expect(text).not.toContain("if (x > 0) __cf_l");
  });

  it("refuses a file that already uses the tracer's names", async () => {
    const { error } = await instrumentC(
      `int main(void) { int __cf_x = 1; return 0; }\n`,
      "c",
    );
    expect(error).toMatch(/__cf/);
  });

  it("hands a syntax error back rather than mangling the file", async () => {
    const source = `int main(void) { return`;
    const { code, error } = await instrumentC(source, "c");

    expect(error).toBeTruthy();
    expect(code).toBe(source);
  });
});
