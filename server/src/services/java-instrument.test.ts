import { describe, expect, it } from "vitest";
import { instrumentJava } from "./java-instrument.js";

/**
 * The instrumenter's one hard requirement is that its output still compiles.
 * These check the shapes that most easily break that — scopes, unbraced
 * bodies, void returns — plus that line numbers survive, since the editor
 * highlights by line.
 */

/**
 * The user's portion, without the appended tracer. Trailing blank lines from
 * joining the two are dropped: they sit after the user's last line and so
 * cannot shift any of it.
 */
const body = (code: string) =>
  code.split("/* --- CodeFlow tracer")[0]!.replace(/\n+$/, "\n");

describe("instrumentJava", () => {
  it("marks each statement with its own line number", () => {
    const { code, error } = instrumentJava(
      `public class Main {
    public static void main(String[] a) {
        int x = 1;
        System.out.println(x);
    }
}
`,
    );

    expect(error).toBeNull();
    expect(body(code)).toContain("__CF.l(3); int x = 1;");
    expect(body(code)).toContain("__CF.l(4); System.out.println(x);");
  });

  it("never adds a line, so editor line numbers still match", () => {
    const source = `public class Main {
    public static void main(String[] a) {
        int x = 1;
        if (x > 0) {
            x = 2;
        }
    }
}
`;
    const { code } = instrumentJava(source);
    expect(body(code).split("\n").length).toBe(source.split("\n").length);
  });

  it("reports a declared local after the statement that declares it", () => {
    const { code } = instrumentJava(
      `public class Main {
    public static void main(String[] a) {
        int total = 0;
    }
}
`,
    );
    expect(body(code)).toContain(`int total = 0; __CF.v("total", total);`);
  });

  it("reports a loop variable inside the body, where it is in scope", () => {
    // Emitting it after the loop would not compile: the variable is gone.
    const { code } = instrumentJava(
      `public class Main {
    public static void main(String[] a) {
        for (int n = 1; n <= 3; n++) {
            int y = n;
        }
    }
}
`,
    );

    const text = body(code);
    expect(text).toContain(`{ __CF.v("n", n);`);
    expect(text).not.toMatch(/}\s*__CF\.v\("n", n\);/);
  });

  it("wraps a returned expression but leaves a bare return alone", () => {
    const { code } = instrumentJava(
      `public class Main {
    static int one() {
        return 1;
    }

    static void nothing() {
        return;
    }
}
`,
    );

    const text = body(code);
    expect(text).toContain("return __CF.r(1);");
    // `return __CF.r();` would not compile.
    expect(text).toContain("__CF.l(7); return;");
  });

  it("leaves an unbraced body alone rather than producing invalid code", () => {
    // There is no statement list to splice into, so the inner statement is
    // simply not reported — the same limitation the JavaScript engine has.
    const { code } = instrumentJava(
      `public class Main {
    public static void main(String[] a) {
        int x = 0;
        if (x > 0) System.out.println(x);
    }
}
`,
    );

    const text = body(code);
    expect(text).toContain("__CF.l(4); if (x > 0) System.out.println(x);");
    expect(text).not.toContain("if (x > 0) __CF.l");
  });

  it("only reports assignments to locals it has actually seen declared", () => {
    // Naming a field or something out of scope would not compile.
    const { code } = instrumentJava(
      `public class Main {
    static int field = 0;

    public static void main(String[] a) {
        field = 5;
    }
}
`,
    );
    expect(body(code)).not.toContain(`__CF.v("field"`);
  });

  it("keeps each method's locals to itself", () => {
    const { code } = instrumentJava(
      `public class Main {
    static void first() {
        int only = 1;
    }

    static void second() {
        only = 2;
    }
}
`,
    );

    const text = body(code);
    // `only` is not in scope in second(), so it must not be reported there.
    expect(text).toContain(`int only = 1; __CF.v("only", only);`);
    expect(text).not.toContain(`only = 2; __CF.v("only", only);`);
  });

  it("appends the tracer class", () => {
    const { code } = instrumentJava(`public class Main { }\n`);
    expect(code).toContain("final class __CF");
    expect(code).toContain("addShutdownHook");
  });

  it("refuses a file that already uses the tracer's name", () => {
    const { error } = instrumentJava(
      `public class Main { static int __CF = 1; }\n`,
    );
    expect(error).toMatch(/__CF/);
  });

  it("hands a syntax error back rather than mangling the file", () => {
    const source = `public class Main { oops }\n`;
    const { code, error } = instrumentJava(source);

    expect(error).toBeTruthy();
    // Unchanged, so the Java compiler gets to report it with its own message.
    expect(code).toBe(source);
  });
});
