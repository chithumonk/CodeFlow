/**
 * CodeFlow language id → Judge0 language id.
 *
 * Judge0 identifies a language by a number tied to a specific compiler build,
 * so "the newest Go" is 107 rather than a version string. These were taken
 * from the live /languages catalogue and pinned: letting the newest id win
 * automatically would silently change compiler behaviour under people.
 *
 * Languages absent from this map are ones Judge0 does not offer. They stay in
 * the registry because a self-hosted Piston does run them — the provider, not
 * CodeFlow, is what decides.
 */
export const JUDGE0_LANGUAGE_IDS: Record<string, number> = {
  java: 91, // JDK 17.0.6
  c: 110, // Clang 19.1.7
  cpp: 105, // GCC 14.1.0
  csharp: 51, // Mono 6.6.0.161
  go: 107, // 1.23.5
  rust: 108, // 1.85.0
  php: 98, // 8.3.11
  kotlin: 111, // 2.1.10
  swift: 83, // 5.2.3
  scala: 112, // 3.4.2
  lua: 64, // 5.3.5
  perl: 85, // 5.28.1
  r: 99, // 4.4.1
  bash: 46, // 5.0.0
  haskell: 61, // GHC 8.8.1
  elixir: 57, // 1.9.4
  dart: 90, // 2.19.2
  ocaml: 65, // 4.09.0
  clojure: 86, // 1.10.1
  dlang: 56, // DMD 2.089.1
  erlang: 58, // OTP 22.2
  fortran: 59, // GFortran 9.2.0
  cobol: 77, // GnuCOBOL 2.2
  pascal: 67, // FPC 3.0.4
  groovy: 88, // 3.0.3
  lisp: 55, // SBCL 2.0.0
  prolog: 69, // GNU Prolog 1.4.5
  octave: 66, // 5.1.0
  sqlite: 82, // SQLite 3.27.2
  basic: 47, // FBC 1.07.1
};

/**
 * CodeFlow language id → the name Piston uses, where they differ.
 *
 * Anything not listed is passed through unchanged, which covers most of the
 * catalogue. This lives here, not in the browser bundle: which provider is
 * configured is a server concern, and the client sends CodeFlow's own id.
 */
export const PISTON_LANGUAGE_NAMES: Record<string, string> = {
  cpp: "c++",
  r: "rscript",
  dlang: "d",
  sqlite: "sqlite3",
};

/** Judge0 status ids worth distinguishing. The rest are runtime failures. */
export const JUDGE0_STATUS = {
  ACCEPTED: 3,
  TIME_LIMIT_EXCEEDED: 5,
  COMPILATION_ERROR: 6,
  INTERNAL_ERROR: 13,
  EXEC_FORMAT_ERROR: 14,
} as const;
