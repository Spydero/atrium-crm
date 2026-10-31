import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.resolve(__dirname, "../../design/screenshots");
const API_DIR = path.resolve(__dirname, "../../api");
const WEB = process.env.WEB_URL || "http://localhost:3000";
const API = process.env.API_URL || "http://localhost:4000";
fs.mkdirSync(SHOTS, { recursive: true });

let failed = 0;
function check(ok, msg, detail = "") {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${msg}${detail ? ` - ${detail}` : ""}`);
}

const run = String(Math.floor(1_000_000 + Math.random() * 8_999_999));
let n = 0;
const digits = () => `${run.slice(0, 6)}${++n}`;

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error" && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text());
});

/** Create a lead through the real API from inside the logged-in page. */
async function createLead(body, stage) {
  return page.evaluate(
    async ({ api, body, stage }) => {
      const r = await fetch(`${api}/api/leads`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (stage) {
        await fetch(`${api}/api/leads/${j.lead.id}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stage }),
        });
      }
      return j.lead.id;
    },
    { api: API, body, stage },
  );
}

const getLead = (id) =>
  page.evaluate(
    async ({ api, id }) => {
      const r = await fetch(`${api}/api/leads/${id}`, { credentials: "include" });
      return r.status === 200 ? r.json() : { status: r.status };
    },
    { api: API, id },
  );

const card = (name) => page.locator("button[data-lead-card]", { hasText: name });

try {
  await page.goto(`${WEB}/login`, { waitUntil: "networkidle" });
  await page.locator('input[type="email"]').fill("agent@atrium.demo");
  await page.locator('input[type="password"]').fill("demo1234");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/app/, { timeout: 15000 });

  // ---- Test data ----
  const bulkA = await createLead({ name: "UITest Bulk A", phone: `+97150${digits()}`, primarySource: "bayut" });
  const bulkB = await createLead({ name: "UITest Bulk B", phone: `+97150${digits()}`, primarySource: "DUBIZZLE" });
  const sharedDigits = digits();
  const dupA = await createLead(
    { name: "UITest Layla Hamdan", phone: `+97150${sharedDigits}`, primarySource: "bayut" },
    "NEW",
  );
  const dupB = await createLead(
    { name: "UITest Layla H.", phone: `050${sharedDigits}`, email: `layla-${run}@example.com`, primarySource: "property_finder" },
    "QUALIFIED",
  );
  const mailA = await createLead({ name: "UITest Mail A", phone: `+97150${digits()}`, email: `shared-${run}@example.com` });
  const mailB = await createLead({ name: "UITest Mail B", phone: `+97150${digits()}`, email: `SHARED-${run}@example.com` }, "VIEWING");

  await page.goto(`${WEB}/app/leads`, { waitUntil: "networkidle" });
  await card("UITest Bulk A").waitFor();
  await page.screenshot({ path: path.join(SHOTS, "v13-01-leads-duplicates-badge.png") });

  const badge = page.getByRole("button", { name: /Duplicates/ });
  check(await badge.isVisible(), "Duplicates button visible");
  const badgeText = (await badge.innerText()).replace(/\D/g, "");
  check(Number(badgeText) >= 2, "Duplicates badge counts groups", `count=${badgeText}`);

  // ---- Select mode ----
  await page.getByRole("button", { name: "Select", exact: true }).click();
  check(await page.getByRole("button", { name: "Done selecting" }).isVisible(), "Select mode on");
  check(await page.getByRole("toolbar", { name: "Bulk actions" }).isVisible(), "Bulk bar shown in select mode");
  await card("UITest Bulk A").click();
  await card("UITest Bulk B").click();
  check((await card("UITest Bulk A").getAttribute("aria-pressed")) === "true", "Card toggles selected");
  check(await page.getByText("2 selected").isVisible(), "Selected count reads 2");
  check((await page.getByRole("button", { name: "Merge", exact: true }).isEnabled()), "Merge enabled with 2 selected");
  await page.screenshot({ path: path.join(SHOTS, "v13-02-select-mode-action-bar.png") });

  // Clicking a card in select mode must not open the detail panel
  check((await page.getByRole("button", { name: "Schedule viewing" }).count()) === 0, "Select click does not open detail");

  // ---- Bulk stage ----
  await page.getByLabel("Move to stage").selectOption("QUALIFIED");
  await page.getByText(/Moved 2 leads to Qualified/).waitFor({ timeout: 8000 });
  check(true, "Bulk stage banner shown");
  check((await getLead(bulkA)).stage === "QUALIFIED" && (await getLead(bulkB)).stage === "QUALIFIED", "Both leads now QUALIFIED in the API");
  check(await page.getByText("0 selected").isVisible(), "Selection cleared after action");
  await page.screenshot({ path: path.join(SHOTS, "v13-03-bulk-stage-result.png") });

  // Re-run the same action: should be a no-op with an honest message
  await card("UITest Bulk A").click();
  await card("UITest Bulk B").click();
  await page.getByLabel("Move to stage").selectOption("QUALIFIED");
  await page.getByText(/Nothing to change/).waitFor({ timeout: 8000 });
  check(true, "No-op bulk action reports nothing to change");

  // ---- Bulk assign ----
  await card("UITest Bulk A").click();
  await card("UITest Bulk B").click();
  await page.getByLabel("Assign to").selectOption({ label: "Sara Al Maktoum" });
  await page.getByText(/Assigned 2 leads to Sara Al Maktoum/).waitFor({ timeout: 8000 });
  check((await getLead(bulkA)).assignedTo?.name === "Sara Al Maktoum", "Owner changed in the API");
  check((await card("UITest Bulk A").innerText()).includes("Sara Al Maktoum"), "Card shows new owner");
  await page.screenshot({ path: path.join(SHOTS, "v13-04-bulk-assign-result.png") });

  // ---- Select all in a column ----
  const qualifiedCol = page.locator("div.surface", { has: page.getByText("QUALIFIED", { exact: true }) }).first();
  await qualifiedCol.getByRole("button", { name: "All" }).click();
  const selectedTxt = await page.locator("[aria-live=polite]").first().innerText();
  check(/^[1-9]\d* selected/.test(selectedTxt), "Column All selects cards", selectedTxt);
  await qualifiedCol.getByRole("button", { name: "None" }).click();
  check(await page.getByText("0 selected").isVisible(), "Column None clears them");

  // ---- Escape leaves select mode ----
  await page.keyboard.press("Escape");
  check(await page.getByRole("button", { name: "Select", exact: true }).isVisible(), "Escape leaves select mode");

  // ---- Manual merge from selection ----
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await card("UITest Layla Hamdan").click();
  await card("UITest Layla H.").click();

  // Regression: the action bar must stay pinned to the viewport while scrolling
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.mouse.wheel(0, 2000);
  await page.waitForTimeout(250);
  const scrolledBox = await page.getByRole("toolbar", { name: "Bulk actions" }).boundingBox();
  check(
    !!scrolledBox && scrolledBox.y >= 0 && scrolledBox.y + scrolledBox.height <= 900,
    "Action bar stays inside the viewport when scrolled",
    JSON.stringify(scrolledBox),
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole("button", { name: "Merge", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Merge leads" });
  await dialog.waitFor();
  await dialog.getByText("Keep this lead").first().waitFor();
  const suggestedCard = dialog.locator("label", { hasText: "Suggested" });
  check((await suggestedCard.innerText()).includes("UITest Layla H."), "Suggests the more advanced lead (Qualified)");
  check((await dialog.getByText(/Result:/).innerText()).includes("2 sources"), "Result summary counts sources");
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SHOTS, "v13-05-merge-dialog.png") });

  // Choose the other lead to keep (the user is in control)
  await dialog.locator("label", { hasText: "UITest Layla Hamdan" }).click();
  check(
    (await dialog.getByRole("button", { name: /^Merge 2 leads/ }).isEnabled()) &&
      (await dialog.getByText(/Result:/).innerText()).includes("UITest Layla Hamdan"),
    "Choosing a different lead updates the result line",
  );
  await dialog.getByRole("button", { name: /^Merge 2 leads/ }).click();
  await page.getByText(/Merged 2 leads into one/).waitFor({ timeout: 8000 });
  check(true, "Merge banner shown");
  check((await card("UITest Layla H.").count()) === 0, "Duplicate removed from board");
  check((await card("UITest Layla Hamdan").count()) === 1, "Kept lead remains");
  const kept = await getLead(dupA);
  check(kept.sources.length === 2, "Kept lead has both sources", kept.sources.map((s) => s.source).join(", "));
  check(kept.email === `layla-${run}@example.com`, "Blank email filled from the duplicate");
  check((await getLead(dupB)).status === 404, "Duplicate lead no longer exists");
  check(
    await page.getByRole("heading", { name: "UITest Layla Hamdan" }).isVisible(),
    "Merged lead opens in the detail panel",
  );
  check(await page.getByText(/Merged duplicate/).first().isVisible(), "Merge appears in the activity log");
  await page.screenshot({ path: path.join(SHOTS, "v13-06-after-merge-detail.png") });

  // ---- Duplicates review dialog ----
  await page.getByRole("button", { name: /Duplicates/ }).click();
  const dupDialog = page.getByRole("dialog", { name: "Review duplicates" });
  await dupDialog.waitFor();
  await dupDialog.getByText("Same email").first().waitFor();
  check(await dupDialog.getByText("UITest Mail A").isVisible(), "Email duplicates listed");
  check((await dupDialog.getByText("Suggested to keep").count()) >= 1, "Suggested lead flagged");
  check(!(await dupDialog.getByText("UITest Layla").isVisible().catch(() => false)), "Already merged pair no longer listed");
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SHOTS, "v13-07-duplicates-dialog.png") });

  // Escape closes the dialog only
  await page.keyboard.press("Escape");
  check(!(await dupDialog.isVisible().catch(() => false)), "Escape closes duplicates dialog");

  // Merge the email pair from the review dialog
  await page.getByRole("button", { name: /Duplicates/ }).click();
  await dupDialog.waitFor();
  const group = dupDialog.locator("div.rounded-\\[10px\\]", { hasText: "UITest Mail A" });
  await group.getByRole("button", { name: "Review and merge" }).click();
  const merge2 = page.getByRole("dialog", { name: "Merge leads" });
  await merge2.waitFor();
  check((await merge2.locator("label", { hasText: "Suggested" }).innerText()).includes("UITest Mail B"), "Suggested is the Viewing-stage lead");
  await merge2.getByRole("button", { name: /^Merge 2 leads/ }).click();
  await merge2.waitFor({ state: "hidden", timeout: 8000 });
  await page.getByText(/Merged 2 leads into one/).waitFor({ timeout: 8000 });
  check((await getLead(mailB)).sources.length === 2, "Email-pair merged into the Viewing lead");
  check((await getLead(mailA)).status === 404, "Other email-pair lead removed");
  await page.screenshot({ path: path.join(SHOTS, "v13-08-after-review-merge.png") });

  // Cancel path: nothing changes
  const cd = digits();
  const cancelA = await createLead({ name: "UITest Cancel A", phone: `+97150${cd}`, primarySource: "bayut" });
  const cancelB = await createLead({ name: "UITest Cancel B", phone: `050${cd}`, primarySource: "DUBIZZLE" });
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Duplicates/ }).click();
  const cancelDialog = page.getByRole("dialog", { name: "Review duplicates" });
  const cancelGroup = cancelDialog.locator("div.rounded-\\[10px\\]", { hasText: "UITest Cancel A" });
  await cancelGroup.getByRole("button", { name: "Review and merge" }).click();
  const mergeCancel = page.getByRole("dialog", { name: "Merge leads" });
  await mergeCancel.waitFor();
  await mergeCancel.getByRole("button", { name: "Cancel" }).click();
  check(!(await mergeCancel.isVisible().catch(() => false)), "Cancel closes the merge dialog");
  check((await getLead(cancelA)).name === "UITest Cancel A" && (await getLead(cancelB)).name === "UITest Cancel B", "Cancel leaves both leads untouched");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");

  // ---- Mobile layout ----
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(`${WEB}/app/leads`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await card("UITest Bulk A").click();
  await page.screenshot({ path: path.join(SHOTS, "v13-09-mobile-select-mode.png") });
  const bar = page.getByRole("toolbar", { name: "Bulk actions" });
  const box = await bar.boundingBox();
  check(!!box && box.x >= 0 && box.x + box.width <= 390 + 1, "Action bar fits a phone screen", JSON.stringify(box));

  check(errors.length === 0, "No console or page errors", errors.slice(0, 3).join(" | "));
} catch (e) {
  failed++;
  console.log("FAIL  exception:", e.message.split("\n").slice(0, 6).join("\n"));
  await page.screenshot({ path: path.join(SHOTS, "v13-error.png") }).catch(() => {});
} finally {
  await browser.close();
  try {
    console.log(execSync("npx tsx scripts/cleanup-test-leads.ts", { cwd: API_DIR, encoding: "utf8" }).trim());
  } catch (e) {
    console.log("cleanup failed:", e.message);
  }
}

console.log(failed ? `${failed} FAILED` : "ALL PASSED");
process.exit(failed ? 1 : 0);
