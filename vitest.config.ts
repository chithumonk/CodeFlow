import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Unit tests only. The e2e/ directory is Playwright's, and its specs
    // import @playwright/test, which Vitest cannot run.
    include: ["src/**/*.{test,spec}.ts"],
    exclude: ["node_modules", "dist", "e2e", "server"],
  },
});
