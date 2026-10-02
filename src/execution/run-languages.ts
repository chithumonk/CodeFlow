/**
 * Languages CodeFlow can run but not trace.
 *
 * Tracing needs a hook inside the language runtime — Python's `sys.settrace`,
 * or instrumenting a JavaScript AST. A remote batch executor offers no such
 * hook: it takes source, runs it, and hands back whatever was printed. So
 * these languages get output and an exit code, and nothing else.
 *
 * The `id` is CodeFlow's own name for the language. Translating it into
 * whatever the configured execution service calls it is the server's job —
 * the browser must not need to know which provider is in use.
 */

export interface RunLanguageSpec {
  id: string;
  label: string;
  /** Lowercase, with the dot. First entry is the default for new files. */
  extensions: string[];
  /** "*" asks the provider for its newest available version. */
  version: string;
  sample: string;
}

const hello = (line: string) => `${line}\n`;

export const RUN_LANGUAGES: RunLanguageSpec[] = [
  // Java is not here: the server instruments it at the source level, so it
  // is a traced language in languages.ts rather than an output-only one.
  // Ruby is not here: ruby.wasm runs it in the browser with a real TracePoint
  // trace, so it lives in the traced tier in languages.ts.
  {
    id: "csharp",
    label: "C#",
    extensions: [".cs"],
    version: "*",
    sample: `using System;

class Program {
    static void Main() {
        int total = 0;
        for (int n = 1; n <= 5; n++) total += n;
        Console.WriteLine($"total is {total}");
    }
}
`,
  },
  {
    id: "go",
    label: "Go",
    extensions: [".go"],
    version: "*",
    sample: `package main

import "fmt"

func main() {
    total := 0
    for n := 1; n <= 5; n++ {
        total += n
    }
    fmt.Println("total is", total)
}
`,
  },
  {
    id: "rust",
    label: "Rust",
    extensions: [".rs"],
    version: "*",
    sample: `fn main() {
    let total: i32 = (1..=5).sum();
    println!("total is {}", total);
}
`,
  },
  {
    id: "php",
    label: "PHP",
    extensions: [".php"],
    version: "*",
    sample: `<?php
$total = 0;
for ($n = 1; $n <= 5; $n++) {
    $total += $n;
}
echo "total is $total\\n";
`,
  },
  {
    id: "kotlin",
    label: "Kotlin",
    extensions: [".kt"],
    version: "*",
    sample: `fun main() {
    val total = (1..5).sum()
    println("total is $total")
}
`,
  },
  {
    id: "swift",
    label: "Swift",
    extensions: [".swift"],
    version: "*",
    sample: `let total = (1...5).reduce(0, +)
print("total is \\(total)")
`,
  },
  {
    id: "scala",
    label: "Scala",
    extensions: [".scala"],
    version: "*",
    sample: `object Main extends App {
  val total = (1 to 5).sum
  println(s"total is $total")
}
`,
  },
  {
    id: "lua",
    label: "Lua",
    extensions: [".lua"],
    version: "*",
    sample: `local total = 0
for n = 1, 5 do
  total = total + n
end
print("total is " .. total)
`,
  },
  {
    id: "perl",
    label: "Perl",
    extensions: [".pl"],
    version: "*",
    sample: `my $total = 0;
$total += $_ for 1..5;
print "total is $total\\n";
`,
  },
  {
    id: "r",
    label: "R",
    extensions: [".r"],
    version: "*",
    sample: `total <- sum(1:5)
cat("total is", total, "\\n")
`,
  },
  {
    id: "bash",
    label: "Bash",
    extensions: [".sh"],
    version: "*",
    sample: `total=0
for n in 1 2 3 4 5; do
  total=$((total + n))
done
echo "total is $total"
`,
  },
  {
    id: "haskell",
    label: "Haskell",
    extensions: [".hs"],
    version: "*",
    sample: `main :: IO ()
main = putStrLn ("total is " ++ show (sum [1..5]))
`,
  },
  {
    id: "elixir",
    label: "Elixir",
    extensions: [".exs"],
    version: "*",
    sample: `total = Enum.sum(1..5)
IO.puts("total is #{total}")
`,
  },
  {
    id: "dart",
    label: "Dart",
    extensions: [".dart"],
    version: "*",
    sample: `void main() {
  var total = 0;
  for (var n = 1; n <= 5; n++) total += n;
  print('total is $total');
}
`,
  },
  {
    id: "julia",
    label: "Julia",
    extensions: [".jl"],
    version: "*",
    sample: hello('println("total is ", sum(1:5))'),
  },
  {
    id: "ocaml",
    label: "OCaml",
    extensions: [".ml"],
    version: "*",
    sample: hello('let () = print_endline ("total is " ^ string_of_int 15)'),
  },
  {
    id: "clojure",
    label: "Clojure",
    extensions: [".clj"],
    version: "*",
    sample: hello('(println "total is" (reduce + (range 1 6)))'),
  },
  {
    id: "crystal",
    label: "Crystal",
    extensions: [".cr"],
    version: "*",
    sample: hello('puts "total is #{(1..5).sum}"'),
  },
  {
    id: "nim",
    label: "Nim",
    extensions: [".nim"],
    version: "*",
    sample: `var total = 0
for n in 1..5: total += n
echo "total is ", total
`,
  },
  {
    id: "zig",
    label: "Zig",
    extensions: [".zig"],
    version: "*",
    sample: `const std = @import("std");

pub fn main() !void {
    var total: i32 = 0;
    var n: i32 = 1;
    while (n <= 5) : (n += 1) total += n;
    std.debug.print("total is {d}\\n", .{total});
}
`,
  },
  {
    id: "dlang",
    label: "D",
    extensions: [".d"],
    version: "*",
    sample: `import std.stdio;

void main() {
    int total = 0;
    foreach (n; 1 .. 6) total += n;
    writeln("total is ", total);
}
`,
  },
  {
    id: "erlang",
    label: "Erlang",
    extensions: [".erl"],
    version: "*",
    sample: hello('io:format("total is ~p~n", [lists:sum(lists:seq(1,5))]).'),
  },
  {
    id: "fortran",
    label: "Fortran",
    extensions: [".f90"],
    version: "*",
    sample: `program main
    integer :: n, total
    total = 0
    do n = 1, 5
        total = total + n
    end do
    print *, "total is ", total
end program main
`,
  },
  {
    id: "cobol",
    label: "COBOL",
    extensions: [".cob"],
    version: "*",
    sample: `IDENTIFICATION DIVISION.
PROGRAM-ID. MAIN.
PROCEDURE DIVISION.
    DISPLAY "total is 15".
    STOP RUN.
`,
  },
  {
    id: "pascal",
    label: "Pascal",
    extensions: [".pas"],
    version: "*",
    sample: `program Main;
var n, total: integer;
begin
  total := 0;
  for n := 1 to 5 do total := total + n;
  writeln('total is ', total);
end.
`,
  },
  {
    id: "groovy",
    label: "Groovy",
    extensions: [".groovy"],
    version: "*",
    sample: hello('println "total is ${(1..5).sum()}"'),
  },
  {
    id: "raku",
    label: "Raku",
    extensions: [".raku"],
    version: "*",
    sample: hello('say "total is ", [+] 1..5;'),
  },
  {
    id: "lisp",
    label: "Common Lisp",
    extensions: [".lisp"],
    version: "*",
    sample: hello(
      '(format t "total is ~a~%" (reduce (function +) (list 1 2 3 4 5)))',
    ),
  },
  {
    id: "prolog",
    label: "Prolog",
    extensions: [".pro"],
    version: "*",
    sample: `:- initialization(main).
main :- sum_list([1,2,3,4,5], T), format("total is ~w~n", [T]).
`,
  },
  {
    id: "racket",
    label: "Racket",
    extensions: [".rkt"],
    version: "*",
    sample: `#lang racket
(printf "total is ~a\\n" (for/sum ([n (in-range 1 6)]) n))
`,
  },
  {
    id: "powershell",
    label: "PowerShell",
    extensions: [".ps1"],
    version: "*",
    sample: hello(
      'Write-Output "total is $((1..5 | Measure-Object -Sum).Sum)"',
    ),
  },
  {
    id: "awk",
    label: "AWK",
    extensions: [".awk"],
    version: "*",
    sample: `BEGIN {
    for (n = 1; n <= 5; n++) total += n
    print "total is", total
}
`,
  },
  {
    id: "octave",
    label: "Octave",
    extensions: [".m"],
    version: "*",
    sample: hello('printf("total is %d\\n", sum(1:5));'),
  },
  {
    id: "sqlite",
    label: "SQLite",
    extensions: [".sql"],
    version: "*",
    sample: `SELECT 'total is ' || SUM(value) AS result
FROM (SELECT 1 AS value UNION SELECT 2 UNION SELECT 3
      UNION SELECT 4 UNION SELECT 5);
`,
  },
  {
    id: "vlang",
    label: "V",
    extensions: [".v"],
    version: "*",
    sample: `fn main() {
    mut total := 0
    for n in 1 .. 6 { total += n }
    println('total is $total')
}
`,
  },
  {
    id: "coffeescript",
    label: "CoffeeScript",
    extensions: [".coffee"],
    version: "*",
    sample: hello('console.log "total is #{[1..5].reduce (a, b) -> a + b}"'),
  },
  {
    id: "basic",
    label: "BASIC",
    extensions: [".bas"],
    version: "*",
    sample: `PRINT "total is 15"
`,
  },
  {
    id: "forth",
    label: "Forth",
    extensions: [".fth"],
    version: "*",
    sample: `: total 0 6 1 do i + loop ;
." total is " total . cr
bye
`,
  },
  {
    id: "smalltalk",
    label: "Smalltalk",
    extensions: [".st"],
    version: "*",
    sample: hello("Transcript showCr: 'total is 15'."),
  },
];
