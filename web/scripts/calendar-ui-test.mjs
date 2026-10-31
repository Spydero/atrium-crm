import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.resolve(__dirname, "../../design/screenshots");
const WEB = process.env.WEB_URL || "http://localhost:3000";
fs.mkdirSync(SHOTS, { recursive: true });

let failed = 0;
function log(ok, msg, detail = "") {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${msg}${detail ? ` - ${detail}` : ""}`);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const settle = (ms = 700) => page.waitForTimeout(ms);

try {
  await page.goto(`${WEB}/login`, { waitUntil: "networkidle" });
  await page.locator('input[type="email"]').fill("agent@atrium.demo");
  await page.locator('input[type="password"]').fill("demo1234");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/app/, { timeout: 15000 });
  await page.goto(`${WEB}/app/calendar`, { waitUntil: "networkidle" });
  await page.getByTestId("calendar-page").waitFor();
  await settle();

  log(await page.getByRole("heading", { name: "Calendar" }).isVisible(), "Calendar heading");
  log(await page.getByTestId("calendar-filters").isVisible(), "filters row");
  log(await page.getByTestId("calendar-grid").isVisible(), "month grid");
  await page.screenshot({ path: path.join(SHOTS, "v18-01-calendar-overview.png"), fullPage: true });

  // Create an event with notes
  await page.getByRole("button", { name: "Schedule" }).click();
  const form = page.getByTestId("event-form");
  await form.waitFor();
  await form.getByLabel("Event type").selectOption("FOLLOW_UP");
  await form.getByLabel("Event notes").fill("Probe note: client asked to pause");
  await form.getByLabel("Event title").fill("UI test follow-up");
  await form.getByRole("button", { name: "Save to calendar" }).click();
  await settle(1000);
  log(await page.getByTestId("event-detail").isVisible(), "detail opens after create");
  log(await page.getByTestId("event-notes").inputValue().then((v) => v.includes("pause")), "notes saved on create");
  await page.screenshot({ path: path.join(SHOTS, "v18-02-calendar-detail.png") });

  // Edit
  await page.getByTestId("event-detail").getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByTestId("event-form").waitFor();
  await page.getByTestId("event-form").getByLabel("Event title").fill("UI test follow-up edited");
  await page.getByTestId("event-form").getByRole("button", { name: "Save changes" }).click();
  await page.getByTestId("event-detail").waitFor({ timeout: 10000 });
  await settle(500);
  log(await page.getByTestId("event-detail").getByText("UI test follow-up edited").isVisible(), "edit title works");

  // Cancel with reason
  await page.getByTestId("event-detail").getByRole("button", { name: "Cancelled", exact: true }).click();
  await page.getByTestId("cancel-step").waitFor();
  await page.getByTestId("cancel-step").locator("select").selectOption("CLIENT");
  await page.getByTestId("cancel-step").locator("textarea").fill("Deal paused by client");
  await page.getByRole("button", { name: "Confirm cancel" }).click();
  await settle(900);
  log(await page.getByTestId("event-detail").getByText("Cancelled").first().isVisible(), "cancelled outcome shown");
  log(await page.getByTestId("event-detail").getByText(/Client|Deal paused/).first().isVisible(), "cancel reason / note shown");
  await page.screenshot({ path: path.join(SHOTS, "v18-03-calendar-cancelled.png") });

  // Filter cancelled
  await page.getByTestId("calendar-filters").getByRole("button", { name: "Cancelled", exact: true }).click();
  await settle();
  log(await page.url().includes("status=cancelled"), "cancelled filter in URL");
  await page.screenshot({ path: path.join(SHOTS, "v18-04-calendar-filter-cancelled.png") });

  // Delete
  await page.getByTestId("agenda-list").locator("button").first().click();
  await settle();
  await page.getByTestId("event-detail").getByRole("button", { name: "Delete" }).click();
  await page.getByTestId("delete-confirm").waitFor();
  await page.getByRole("button", { name: "Delete anyway" }).click();
  await settle(900);
  log(await page.getByTestId("calendar-msg").innerText().then((t) => /Deleted/i.test(t)), "delete works");

  // Needs outcome chip exists
  await page.getByTestId("calendar-filters").getByRole("button", { name: /Needs outcome/ }).click();
  await settle();
  log(await page.url().includes("status=needs"), "needs outcome filter");

  await page.screenshot({ path: path.join(SHOTS, "v18-05-calendar-needs-outcome.png"), fullPage: true });
  log(errors.length === 0, "no page errors", errors.join("; ").slice(0, 200));
} catch (e) {
  failed++;
  console.log("FAIL  exception", e.message);
  await page.screenshot({ path: path.join(SHOTS, "v18-error.png") }).catch(() => {});
}

await browser.close();
console.log(failed ? `\n${failed} FAILED` : "\nALL PASSED");
process.exit(failed ? 1 : 0);
