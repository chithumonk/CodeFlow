import { transform } from "sucrase";
import { createJsFamilyEngine } from "./js-engine";

/**
 * TypeScript, by way of JavaScript.
 *
 * Sucrase strips types without moving anything: the output has exactly the
 * same number of lines, and every statement stays on the line it started on.
 * That is the reason this is a transform rather than a separate engine —
 * once the types are gone, the JavaScript instrumenter and worker do the rest
 * and every line number still points at the file the reader wrote.
 *
 * Type *checking* does not happen here. A type error will not stop the run;
 * you will see whatever the code does at runtime.
 */
export const typescriptEngine = createJsFamilyEngine({
  id: "typescript-worker",
  language: "typescript",
  transform: (source) =>
    transform(source, {
      transforms: ["typescript"],
      // Keep the generated code as close to the input as possible.
      disableESTransforms: true,
      preserveDynamicImport: true,
    }).code,
});
