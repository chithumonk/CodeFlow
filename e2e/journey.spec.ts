import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * The main user journey, end to end.
 *
 * Run now genuinely executes the editor's contents in a Worker — the trace,
 * variables and console output all come from the user's own code.
 *
 * PREREQUISITES — this suite will fail without them:
 *   1. supabase/migrations/0001_profiles.sql and 0002_projects.sql applied
 *   2. Supabase → Authentication → Email → "Confirm email" OFF
 *      (otherwise sign-up cannot produce a session inside a test run)
 *   3. `npm run dev` and `npm --prefix server run dev` both running
 *
 * Each run creates a throwaway account. Nothing here exercises real code
 * execution — Run replays the demo trace, which is what the product does
 * today.
 */

const password = "test-password-123";

function uniqueEmail(): string {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  return `codeflow-e2e-${stamp}@example.com`;
}

async function signUp(page: Page, email: string, name: string) {
  await page.goto("/signup");
  await page.locator("cf-signup cf-input#name-field input").fill(name);
  await page.locator("cf-signup cf-input#email-field input").fill(email);
  await page.locator("cf-signup cf-input#password-field input").fill(password);
  await page.locator('cf-signup cf-button[type="submit"]').click();
  await page.waitForURL("**/dashboard", { timeout: 15000 });
}

test.describe("CodeFlow", () => {
  test("landing → sign up → project → edit → save → run → delete → sign out", async ({
    page,
  }) => {
    const email = uniqueEmail();

    // --- Landing ---------------------------------------------------------
    await page.goto("/");
    await expect(page.locator("cf-hero")).toBeVisible();
    await page.locator("cf-nav").getByRole("link", { name: "Sign In" }).click();
    await expect(page).toHaveURL(/\/login$/);

    // --- Sign up ---------------------------------------------------------
    await page.locator("cf-login cf-auth-shell").evaluate((el: Element) => {
      (el as HTMLElement & { shadowRoot: ShadowRoot }).shadowRoot
        .querySelector<HTMLAnchorElement>('a[href="/signup"]')!
        .click();
    });
    await expect(page).toHaveURL(/\/signup$/);
    await signUp(page, email, "E2E Tester");

    // --- Dashboard: empty state -----------------------------------------
    await expect(page.locator("cf-dashboard")).toBeVisible();
    await expect(
      page.locator("cf-dashboard").getByText("No projects yet"),
    ).toBeVisible();

    // --- Create a project ------------------------------------------------
    await page
      .locator("cf-dashboard")
      .getByRole("button", { name: "New project" })
      .click();
    await page.waitForURL(/\/projects\/[0-9a-f-]+$/, { timeout: 15000 });
    await expect(page.locator("cf-workspace")).toBeVisible();

    const projectUrl = page.url();

    // --- Edit the code ---------------------------------------------------
    const editor = page.locator("cf-workspace cf-code-editor .cm-content");
    await editor.click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type("\n// edited by the e2e test\n");

    // Save is debounced. Assert it actually goes dirty and then settles —
    // toHaveText is an exact match, unlike hasText, which is a substring and
    // would treat "Unsaved changes" as a match for "Saved".
    await expect(page.locator("cf-workspace .save")).toHaveText(
      "Unsaved changes",
    );
    await expect(page.locator("cf-workspace .save")).toHaveText("Saved", {
      timeout: 15000,
    });

    // --- Persistence across a reload -------------------------------------
    await page.reload();
    await expect(page.locator("cf-workspace")).toBeVisible();
    await expect(
      page.locator("cf-workspace cf-code-editor .cm-content"),
    ).toContainText("edited by the e2e test");

    // --- Run the demo execution ------------------------------------------
    await page
      .locator("cf-exec-controls")
      .getByRole("button", { name: /^Run$/ })
      .click();

    // Status reaches a terminal state.
    await expect(page.locator("cf-exec-controls .status")).toHaveText(
      /completed/,
      { timeout: 25000 },
    );

    // Visualization actually populated.
    await expect(page.locator("cf-trace-panels")).toContainText("total");

    // The transcript is the default pane. It must narrate the real run,
    // quoting lines from the user's own source.
    await expect(page.locator("cf-transcript .row").first()).toBeVisible();
    await expect(page.locator("cf-transcript")).toContainText("total += n");

    // Console output lives behind its own tab.
    await page
      .locator("cf-workspace")
      .getByRole("tab", { name: /Console/ })
      .click();
    await expect(page.locator("cf-workspace .console")).toContainText(
      "total is 15",
    );

    // Execution is real now, so a clean run must carry no notice badge —
    // its presence would mean the engine had something to apologise for.
    await expect(page.locator("cf-workspace .bottom .demo")).toHaveCount(0);

    // Back to the transcript for the scrubbing checks below.
    await page
      .locator("cf-workspace")
      .getByRole("tab", { name: /Transcript/ })
      .click();

    // --- Scrub the timeline ----------------------------------------------
    await page.locator("cf-exec-controls #scrub").fill("2");
    await expect(page.locator("cf-exec-controls .status")).toHaveText(/paused/);
    await expect(page.locator("cf-exec-controls .counter")).toContainText("03");

    // Stepping backwards must show an earlier state.
    await page
      .locator("cf-exec-controls")
      .getByRole("button", { name: "Step back" })
      .click();
    await expect(page.locator("cf-exec-controls .counter")).toContainText("02");

    // --- Back to the dashboard, rename -----------------------------------
    await page.goto("/dashboard");
    await expect(page.locator("cf-dashboard .card")).toHaveCount(1);
    await page
      .locator("cf-dashboard")
      .getByRole("button", { name: /^Rename/ })
      .click();
    await page
      .locator("cf-dashboard cf-input[name='project-name'] input")
      .fill("Renamed by test");
    await page
      .locator("cf-dashboard cf-dialog")
      .getByRole("button", { name: "Save" })
      .click();
    await expect(page.locator("cf-dashboard .card h3")).toHaveText(
      "Renamed by test",
    );

    // --- Delete ------------------------------------------------------------
    await page
      .locator("cf-dashboard")
      .getByRole("button", { name: /^Delete/ })
      .click();
    await page
      .locator("cf-dashboard cf-dialog")
      .getByRole("button", { name: "Delete" })
      .click();
    await expect(
      page.locator("cf-dashboard").getByText("No projects yet"),
    ).toBeVisible();

    // --- Sign out and confirm protection ---------------------------------
    await page
      .locator("cf-app-bar")
      .evaluate((el: Element) => {
        const root = (el as HTMLElement & { shadowRoot: ShadowRoot }).shadowRoot;
        root.querySelector<HTMLButtonElement>(".trigger")!.click();
      });
    await page.locator("cf-app-bar").getByRole("menuitem", { name: "Sign out" }).click();
    await page.waitForURL("**/", { timeout: 10000 });

    await page.goto(projectUrl);
    await expect(page).toHaveURL(/\/login\?next=/);
  });

  test("one user cannot open another user's project", async ({ browser }) => {
    // --- User A creates a project ----------------------------------------
    const a = await browser.newContext();
    const pageA = await a.newPage();
    await signUp(pageA, uniqueEmail(), "User A");
    await pageA
      .locator("cf-dashboard")
      .getByRole("button", { name: "New project" })
      .click();
    await pageA.waitForURL(/\/projects\/[0-9a-f-]+$/, { timeout: 15000 });
    const victimUrl = pageA.url();
    await a.close();

    // --- User B tries to open it -----------------------------------------
    const b = await browser.newContext();
    const pageB = await b.newPage();
    await signUp(pageB, uniqueEmail(), "User B");
    await pageB.goto(victimUrl);

    // RLS filters the row out, so the API reports it as missing. B must not
    // see the workspace or any of A's code.
    await expect(
      pageB.locator("cf-workspace").getByText("Could not open this project"),
    ).toBeVisible({ timeout: 15000 });
    await expect(pageB.locator("cf-code-editor")).toHaveCount(0);
    await b.close();
  });
});
