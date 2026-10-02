/**
 * Captures the real screenshots and video used by the documentation.
 *
 * Run with both dev servers up:  node scripts/capture-docs-media.mjs
 *
 * Everything here comes from the running application, not a mock-up: one
 * account is created, projects are made through the launcher, and the trace
 * is a genuine recorded run. Re-running this refreshes the media when the UI
 * changes, so the docs cannot drift into showing something that no longer
 * exists.
 */
import { chromium } from "@playwright/test";
import path from "node:path";
import { mkdir, rm, readdir, rename } from "node:fs/promises";

const BASE = "http://localhost:5173";
const OUT = path.resolve(process.cwd(), "public/docs");
const VIDEO_TMP = path.resolve(process.cwd(), "node_modules/.cache/codeflow-video");

await mkdir(OUT, { recursive: true });
await rm(VIDEO_TMP, { recursive: true, force: true });
await mkdir(VIDEO_TMP, { recursive: true });

const email = `codeflow-docs-${Date.now()}@example.com`;
const browser = await chromium.launch();

const log = (m) => console.log(m);

// --- helpers ---------------------------------------------------------------

const ws = (page) =>
  page.evaluate(() => document.querySelector("cf-workspace")?.shadowRoot);

async function signUp(page) {
  await page.goto(`${BASE}/signup`);
  await page.locator("cf-signup cf-input#name-field input").fill("Ada");
  await page.locator("cf-signup cf-input#email-field input").fill(email);
  await page
    .locator("cf-signup cf-input#password-field input")
    .fill("test-password-123");
  await page.locator('cf-signup cf-button[type="submit"]').click();
  await page.waitForURL("**/dashboard", { timeout: 30000 });
}

async function startFromTile(page, label) {
  await page.goto(`${BASE}/dashboard`);
  await page.waitForTimeout(900);
  await page.evaluate((l) => {
    const d = document.querySelector("cf-dashboard")?.shadowRoot;
    [...(d?.querySelectorAll(".tile") ?? [])]
      .find((t) => t.querySelector(".tile-name")?.textContent?.trim() === l)
      ?.click();
  }, label);
  await page.waitForURL(/\/projects\//, { timeout: 40000 });
  await page.locator("cf-workspace cf-code-editor").waitFor({ timeout: 30000 });
  await page.waitForTimeout(1200);
}

async function runAndWait(page, timeout = 120000) {
  await page.evaluate(() => {
    const c = document
      .querySelector("cf-workspace")
      ?.shadowRoot?.querySelector("cf-exec-controls");
    [...(c?.shadowRoot?.querySelectorAll("button") ?? [])]
      .find((b) => /run/i.test(b.textContent ?? ""))
      ?.click();
  });
  await page.waitForFunction(
    () => {
      const c = document
        .querySelector("cf-workspace")
        ?.shadowRoot?.querySelector("cf-exec-controls");
      return (c?.totalSteps ?? 0) > 0 || c?.status === "error";
    },
    { timeout },
  );
}

/** Pause on the step with the deepest call stack — the most illustrative one. */
async function seekDeepest(page) {
  await page.evaluate(() => {
    const w = document.querySelector("cf-workspace");
    const ctrl = w?.shadowRoot?.querySelector("cf-exec-controls");
    const frames = w?.exec?.trace?.frames ?? [];
    let best = 0;
    frames.forEach((f, i) => {
      if (f.stack.length > frames[best].stack.length) best = i;
    });
    ctrl?.dispatchEvent(
      new CustomEvent("cf-seek", { detail: { step: best }, bubbles: true }),
    );
  });
  await page.waitForTimeout(700);
}

/** Screenshot one element inside the workspace's shadow root. */
async function shotPart(page, selector, file, padding = 0) {
  const box = await page.evaluate((sel) => {
    const el = document
      .querySelector("cf-workspace")
      ?.shadowRoot?.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }, selector);

  if (!box) {
    log(`   !! missing ${selector}`);
    return false;
  }

  await page.screenshot({
    path: path.join(OUT, file),
    clip: {
      x: Math.max(0, box.x - padding),
      y: Math.max(0, box.y - padding),
      width: box.width + padding * 2,
      height: box.height + padding * 2,
    },
  });
  log(`   ${file}`);
  return true;
}

// --- 1. Screenshots, in both themes ---------------------------------------

const setupCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const setupPage = await setupCtx.newPage();
await signUp(setupPage);
const state = await setupCtx.storageState();
await setupCtx.close();

for (const theme of ["dark", "light"]) {
  log(`\n--- ${theme} ---`);
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    storageState: state,
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  await page.addInitScript(
    (t) => localStorage.setItem("codeflow-theme", t),
    theme,
  );

  // Dashboard + launcher
  await page.goto(`${BASE}/dashboard`);
  await page.waitForTimeout(1000);
  const launcher = await page.evaluate(() => {
    const d = document.querySelector("cf-dashboard")?.shadowRoot;
    const el = d?.querySelector(".launcher");
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  if (launcher) {
    await page.screenshot({
      path: path.join(OUT, `launcher-${theme}.png`),
      clip: {
        x: launcher.x - 8,
        y: launcher.y - 8,
        width: launcher.width + 16,
        height: launcher.height + 16,
      },
    });
    log(`   launcher-${theme}.png`);
  }

  // A traced run: C++, paused at the deepest point.
  await startFromTile(page, "C++");
  await runAndWait(page);
  await seekDeepest(page);

  await page.screenshot({ path: path.join(OUT, `workspace-${theme}.png`) });
  log(`   workspace-${theme}.png`);

  await shotPart(page, ".rail", `panels-${theme}.png`, 6);
  await shotPart(page, "cf-exec-controls", `controls-${theme}.png`, 6);

  // The transcript, which explains each step in words.
  await page.evaluate(() => {
    const w = document.querySelector("cf-workspace")?.shadowRoot;
    [...(w?.querySelectorAll(".bottom header button") ?? [])]
      .find((b) => /transcript/i.test(b.textContent ?? ""))
      ?.click();
  });
  await page.waitForTimeout(500);
  await shotPart(page, ".bottom", `transcript-${theme}.png`, 6);

  // An output-only language, so the docs can show the difference honestly.
  await startFromTile(page, "JavaScript");
  await page.evaluate(() => {
    const w = document.querySelector("cf-workspace")?.shadowRoot;
    [...(w?.querySelectorAll("button") ?? [])]
      .find((b) =>
        /new file|add file/i.test(
          `${b.getAttribute("title") ?? ""} ${b.getAttribute("aria-label") ?? ""}`,
        ),
      )
      ?.click();
  });
  const nameInput = page.locator("cf-workspace cf-dialog cf-input input").first();
  await nameInput.waitFor({ timeout: 10000 });
  await nameInput.fill("main.go");
  await page.evaluate(() => {
    const d = document.querySelector("cf-workspace")?.shadowRoot?.querySelector("cf-dialog");
    const all = [...(d?.shadowRoot?.querySelectorAll("button, cf-button") ?? [])];
    (all.find((b) => /create|add|confirm/i.test(b.textContent ?? "")) ?? all.at(-1))?.click();
  });
  await page.waitForTimeout(1500);
  await runAndWait(page).catch(() => {});
  await page.waitForTimeout(1500);
  await shotPart(page, ".stage", `output-only-${theme}.png`, 0);

  await ctx.close();
}

// --- 2. A real video of a run ---------------------------------------------

log("\n--- video ---");
const vctx = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  storageState: state,
  recordVideo: { dir: VIDEO_TMP, size: { width: 1280, height: 720 } },
});
const vpage = await vctx.newPage();
await vpage.addInitScript(() => localStorage.setItem("codeflow-theme", "dark"));

await startFromTile(vpage, "Python");
await vpage.waitForTimeout(1200);
await runAndWait(vpage);

// Let it play, then scrub back and step, so the video shows the controls.
await vpage.waitForTimeout(7000);
await vpage.evaluate(() => {
  const c = document.querySelector("cf-workspace")?.shadowRoot?.querySelector("cf-exec-controls");
  [...(c?.shadowRoot?.querySelectorAll("button") ?? [])]
    .find((b) => /pause/i.test(b.textContent ?? ""))
    ?.click();
});
await vpage.waitForTimeout(800);

for (const step of [4, 9, 14, 19, 24]) {
  await vpage.evaluate((s) => {
    const c = document.querySelector("cf-workspace")?.shadowRoot?.querySelector("cf-exec-controls");
    c?.dispatchEvent(new CustomEvent("cf-seek", { detail: { step: s }, bubbles: true }));
  }, step);
  await vpage.waitForTimeout(900);
}

await vctx.close();

const made = (await readdir(VIDEO_TMP)).filter((f) => f.endsWith(".webm"));
if (made[0]) {
  await rename(path.join(VIDEO_TMP, made[0]), path.join(OUT, "walkthrough.webm"));
  log("   walkthrough.webm");
} else {
  log("   !! no video produced");
}

await browser.close();

const files = await readdir(OUT);
log(`\n${files.length} files in public/docs:`);
for (const f of files.sort()) log(`   ${f}`);
