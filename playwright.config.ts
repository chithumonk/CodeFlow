import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end configuration.
 *
 * The dev server and the GraphQL API are expected to be running already —
 * `npm run dev` and `npm --prefix server run dev`. They are not started here
 * because both need real Supabase credentials, which are not in source
 * control.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
