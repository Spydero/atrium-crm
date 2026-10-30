import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.resolve(__dirname, "../../design/screenshots");
const API_DIR = path.resolve(__dirname, "../../api");
const WEB = process.env.WEB_URL || "http://localhost:3000";
const API = process.env.API_URL || "http://localhost:4000";
const ORG = "levante-demo";
fs.mkdirSync(SHOTS, { recursive: true });
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "guides-ui-"));

let failed = 0;
function check(ok, msg, detail = "") {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${msg}${detail ? ` - ${detail}` : ""}`);
}
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
const run = String(Math.floor(1000 + Math.random() * 8999));
const title = `UITest Guide ${run}`;

const browser = await chromium.launch({ headless: true });
const errors = [];
function watch(page, label) {
  page.on("pageerror", (e) => errors.push(`${label}: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/favicon|Failed to load resource/.test(m.text())) errors.push(`${label}: ${m.text()}`);
  });
}

// Two separate browsers: a visitor (no login) and the agent
const visitorCtx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
const agentCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const visitor = await visitorCtx.newPage();
const agent = await agentCtx.newPage();
watch(visitor, "visitor");
watch(agent, "agent");

async function readPdf(download, name) {
  const dest = path.join(TMP, name);
  await download.saveAs(dest);
  const buf = fs.readFileSync(dest);
  return { name: download.suggestedFilename(), head: buf.subarray(0, 5).toString(), size: buf.length };
}

try {
  // ======================= Visitor: library and gated guide =======================
  await visitor.goto(`${WEB}/guides/${ORG}`, { waitUntil: "networkidle" });
  await visitor.getByText("Practical guides from").waitFor();
  const cards = visitor.locator("a[href^='/guides/levante-demo/']");
  check((await cards.count()) >= 5, "Public library lists the published guides", `count=${await cards.count()}`);
  check(!(await visitor.getByText("Relocation Guide").count()), "Draft guide is not in the public library");
  check(!(await visitor.getByText("Spring Market Outlook").count()), "Archived guide is not in the public library");
  await shot(visitor, "v14-01-public-library");

  await visitor.goto(`${WEB}/guides/${ORG}/the-first-time-buyers-guide?utm_source=instagram&utm_medium=social&utm_campaign=ui-${run}`, { waitUntil: "networkidle" });
  await visitor.getByRole("heading", { name: "The First-Time Buyer's Guide" }).waitFor();
  const consent = visitor.getByRole("checkbox");
  check(!(await consent.isChecked()), "Marketing consent box is unticked by default");
  check(await visitor.getByText("Phone number").isVisible(), "Phone field is present");
  check((await visitor.getByText("optional").count()) >= 1, "Phone is marked optional");
  check((await visitor.getByRole("link", { name: "Privacy notice" }).count()) >= 1, "Privacy notice link is shown");
  await shot(visitor, "v14-02-public-guide-gated");

  // validation error
  await visitor.getByLabel("Your name").fill("Q");
  await visitor.getByLabel("Email address").fill("not-an-email");
  await visitor.getByRole("button", { name: /Get my free guide/ }).click();
  await visitor.locator("p[role=alert]").waitFor();
  const err = await visitor.locator("p[role=alert]").innerText();
  check(/name|email/i.test(err), "Form shows a clear error for bad input", err);
  await shot(visitor, "v14-03-form-validation");

  // honeypot hidden from people
  const hp = visitor.locator('input[tabindex="-1"]');
  const hpBox = await hp.boundingBox();
  check(!hpBox || hpBox.x < 0 || hpBox.width <= 1, "Honeypot field is not visible to people");

  // valid submission
  const email = `ui-${run}@uitest.example`;
  await visitor.getByLabel("Your name").fill(`UITest Visitor ${run}`);
  await visitor.getByLabel("Email address").fill(email);
  await visitor.getByRole("button", { name: /Get my free guide/ }).click();
  await visitor.waitForURL(/\/g\//, { timeout: 15000 });
  await visitor.getByText("Your guide is ready").waitFor();
  const personalUrl = visitor.url();
  check(/Thank you, UITest/.test(await visitor.locator("h1").innerText()), "Thank-you page greets the visitor");
  await visitor.waitForTimeout(600);
  await shot(visitor, "v14-04-thank-you");

  const [dl1] = await Promise.all([
    visitor.waitForEvent("download"),
    visitor.getByRole("link", { name: /Download the PDF/ }).click(),
  ]);
  const f1 = await readPdf(dl1, "first.pdf");
  check(f1.head === "%PDF-" && f1.size > 3000, "Download is a real PDF", `${f1.name} ${f1.size} bytes`);
  check(/\.pdf$/.test(f1.name) && !/[\u2014\u2013]/.test(f1.name), "Download has a clean file name", f1.name);

  // personal link works again later, in a brand new session
  const later = await (await browser.newContext({ acceptDownloads: true })).newPage();
  await later.goto(personalUrl, { waitUntil: "networkidle" });
  const [dl2] = await Promise.all([later.waitForEvent("download"), later.getByRole("link", { name: /Download the PDF/ }).click()]);
  check((await readPdf(dl2, "second.pdf")).head === "%PDF-", "Personal link still works later (re-download)");
  await later.context().close();

  // ======================= Visitor: open guide =======================
  await visitor.goto(`${WEB}/guides/${ORG}/the-renters-checklist`, { waitUntil: "networkidle" });
  await visitor.getByText("Free to download").waitFor();
  check((await visitor.getByLabel("Email address").count()) === 0, "Open guide shows no form up front");
  await shot(visitor, "v14-05-public-guide-open");
  const [dl3] = await Promise.all([visitor.waitForEvent("download"), visitor.getByRole("link", { name: /Download the PDF/ }).click()]);
  check((await readPdf(dl3, "open.pdf")).head === "%PDF-", "Open guide downloads without a form");
  await visitor.getByRole("button", { name: /personal copy/ }).click();
  check(await visitor.getByLabel("Email address").isVisible(), "Open guide offers an optional personal copy form");

  // unavailable pages
  await visitor.goto(`${WEB}/guides/${ORG}/relocation-guide-for-new-arrivals`, { waitUntil: "networkidle" });
  check(await visitor.getByText("This guide is not available").isVisible(), "Draft guide page says not available");
  await visitor.goto(`${WEB}/guides/${ORG}/spring-market-outlook`, { waitUntil: "networkidle" });
  check(await visitor.getByText("This guide is not available").isVisible(), "Archived guide page says not available");
  await visitor.goto(`${WEB}/guides/no-such-org`, { waitUntil: "networkidle" });
  check(await visitor.getByText("We could not find that page").isVisible(), "Unknown organization shows a friendly page");
  await visitor.goto(`${WEB}/g/not-a-real-token`, { waitUntil: "networkidle" });
  check(await visitor.getByText("This link is no longer available").isVisible(), "Bad personal link shows a friendly page");

  // phone width
  await visitor.setViewportSize({ width: 390, height: 844 });
  await visitor.goto(`${WEB}/guides/${ORG}/the-first-time-buyers-guide`, { waitUntil: "networkidle" });
  const overflow = await visitor.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check(!overflow, "Public guide page has no horizontal scroll on a phone");
  await shot(visitor, "v14-06-public-guide-mobile");
  await visitor.setViewportSize({ width: 1280, height: 900 });

  // ======================= Agent: library =======================
  await agent.goto(`${WEB}/login`, { waitUntil: "networkidle" });
  await agent.locator('input[type="email"]').fill("agent@atrium.demo");
  await agent.locator('input[type="password"]').fill("demo1234");
  await agent.getByRole("button", { name: /sign in/i }).click();
  await agent.waitForURL(/\/app/, { timeout: 15000 });

  await agent.getByRole("link", { name: "Guides" }).waitFor();
  check(await agent.getByText("Marketing", { exact: true }).isVisible(), "Sidebar has a Marketing group with a Guides link");
  await agent.getByRole("link", { name: "Guides" }).click();
  await agent.waitForURL(/\/app\/guides$/);
  await agent.locator("[data-testid=guide-card]").first().waitFor();
  const guideCards = await agent.locator("[data-testid=guide-card]").count();
  check(guideCards >= 7, "Library lists published, draft and archived guides", `count=${guideCards}`);
  check((await agent.getByText("PUBLISHED").count()) >= 5 && (await agent.getByText("DRAFT").count()) >= 1 && (await agent.getByText("ARCHIVED").count()) >= 1, "Status chips for all three states");
  await agent.waitForTimeout(500);
  await shot(agent, "v14-07-admin-library");

  const requestsStat = async () => Number((await agent.locator("div:has(> div:text-is('Requests')) >> nth=0").innerText().catch(() => "0")).replace(/\D/g, "") || 0);
  void requestsStat;
  const statText = async (label) => agent.getByTestId(`stat-${label}`).innerText();
  const before30 = await statText("Requests");
  await agent.getByRole("button", { name: "7d", exact: true }).click();
  await agent.waitForTimeout(700);
  const after7 = await statText("Requests");
  check(before30 !== after7, "Date filter changes the numbers", `${before30.replace(/\n/g, " ")} -> ${after7.replace(/\n/g, " ")}`);
  await agent.getByRole("button", { name: "30d", exact: true }).click();
  await agent.waitForTimeout(500);

  // ======================= Agent: create, upload, publish =======================
  await agent.getByRole("button", { name: /New guide/ }).click();
  await agent.getByRole("dialog", { name: "New guide" }).waitFor();
  await agent.waitForTimeout(400);
  await shot(agent, "v14-08-new-guide-dialog");
  check(await agent.getByRole("button", { name: "Create draft" }).isDisabled(), "Create is disabled until a title is typed");
  await agent.getByPlaceholder(/First-Time Buyer/).fill(title);
  await agent.getByRole("button", { name: "Sellers" }).click();
  await agent.getByRole("button", { name: "Create draft" }).click();
  await agent.waitForURL(/\/app\/guides\/[a-z0-9]+$/);
  await agent.getByRole("heading", { name: title }).waitFor();
  check((await agent.getByTestId("guide-status").innerText()) === "DRAFT", "New guide starts as a draft");
  await shot(agent, "v14-09-guide-draft");

  // publish without a PDF
  await agent.getByRole("button", { name: "Publish", exact: true }).click();
  await agent.locator("p[role=alert]").waitFor();
  check(/upload the pdf/i.test(await agent.locator("p[role=alert]").innerText()), "Publishing without a PDF is refused with a clear message");

  // wrong file type
  const fake = path.join(TMP, "notes.pdf");
  fs.writeFileSync(fake, "this is not really a pdf ".repeat(20));
  await agent.getByTestId("guide-file-input").setInputFiles(fake);
  await agent.getByText(/not a PDF/i).waitFor();
  check(true, "A text file renamed to .pdf is rejected");

  // real PDF
  const goodPdf = path.resolve(__dirname, "../../design/samples/sample-report.pdf");
  await agent.getByTestId("guide-file-input").setInputFiles(goodPdf);
  await agent.getByText("PDF uploaded").waitFor();
  check(await agent.getByText("sample-report.pdf").isVisible(), "Uploaded file name is shown");

  // details
  await agent.locator("textarea").nth(0).fill("A short guide for owners who are getting ready to sell their home.");
  await agent.locator("textarea").nth(1).fill("How to price with evidence\nHow to prepare the property\nWhat happens at offer stage");
  await agent.locator('input[placeholder^="e.g. Book a free"]').fill("Book a free valuation and we will call you.");
  await agent.getByRole("button", { name: "Save changes" }).click();
  await agent.getByText("Changes saved").waitFor();
  check(true, "Details saved");

  await agent.getByRole("button", { name: "Publish", exact: true }).click();
  await agent.getByText("Guide published").waitFor();
  check((await agent.getByTestId("guide-status").innerText()) === "PUBLISHED", "Guide is published");
  await agent.getByRole("button", { name: "Instagram" }).click();
  await agent.getByPlaceholder("e.g. spring-launch").fill(`ui-${run}`);
  const shareUrl = await agent.getByTestId("share-url").inputValue();
  check(/utm_source=instagram/.test(shareUrl) && /utm_medium=social/.test(shareUrl) && new RegExp(`utm_campaign=ui-${run}`).test(shareUrl), "Share link carries the campaign tags", shareUrl);
  await agent.waitForTimeout(500);
  check(await agent.getByAltText("QR code for the guide link").isVisible(), "QR code is generated");
  await agent.setViewportSize({ width: 1440, height: 1500 });
  await agent.waitForTimeout(300);
  await shot(agent, "v14-10-guide-published");
  await agent.setViewportSize({ width: 1440, height: 900 });

  // ======================= Visitor uses the new guide =======================
  const mail2 = `ui2-${run}@uitest.example`;
  await visitor.goto(shareUrl, { waitUntil: "networkidle" });
  await visitor.getByRole("heading", { name: title }).waitFor();
  check(await visitor.getByText("How to prepare the property").isVisible(), "Public page shows the benefits you wrote");
  await shot(visitor, "v14-11-new-guide-public");
  await visitor.getByLabel("Your name").fill(`UITest Seller ${run}`);
  await visitor.getByLabel("Email address").fill(mail2);
  await visitor.getByLabel("Phone number").fill("+971 50 123 4567");
  await visitor.getByRole("checkbox").check();
  await visitor.getByRole("button", { name: /Get my free guide/ }).click();
  await visitor.waitForURL(/\/g\//);
  await visitor.getByText("Book a free valuation and we will call you.").waitFor();
  check(true, "Next-step message is shown after download");
  const [dl4] = await Promise.all([visitor.waitForEvent("download"), visitor.getByRole("link", { name: /Download the PDF/ }).click()]);
  check((await readPdf(dl4, "new.pdf")).head === "%PDF-", "New guide downloads");

  // ======================= Agent sees the request and the lead =======================
  await agent.reload({ waitUntil: "networkidle" });
  const table = agent.getByTestId("requests-table");
  await table.waitFor();
  const row = table.locator("tr", { hasText: mail2 });
  check(await row.isVisible(), "Request appears in the guide's request log");
  const rowText = (await row.innerText()).replace(/\s+/g, " ");
  check(/Instagram \(social\)/.test(rowText), "Channel is recorded from the link", rowText);
  check(/Yes \(1\)/.test(rowText), "Download is recorded", rowText);
  check(/Yes/.test(rowText), "Marketing opt-in is recorded");
  await agent.waitForTimeout(300);
  await agent.setViewportSize({ width: 1440, height: 1500 });
  await agent.waitForTimeout(300);
  await shot(agent, "v14-12-guide-requests");
  await agent.setViewportSize({ width: 1440, height: 900 });

  const [csv] = await Promise.all([agent.waitForEvent("download"), agent.getByRole("button", { name: "Export CSV" }).click()]);
  const csvPath = path.join(TMP, "req.csv");
  await csv.saveAs(csvPath);
  const csvText = fs.readFileSync(csvPath, "utf8");
  check(csv.suggestedFilename().endsWith(".csv") && csvText.includes(mail2), "CSV export contains the request", csv.suggestedFilename());

  await agent.goto(`${WEB}/app/leads`, { waitUntil: "networkidle" });
  const leadCard = agent.locator("button[data-lead-card]", { hasText: `UITest Seller ${run}` });
  await leadCard.waitFor();
  check((await leadCard.innerText()).includes("Guide"), "Lead card shows the Guide source");
  await leadCard.click();
  const act = agent.getByText(/requested the guide|captured from the guide/i).first();
  await act.waitFor();
  await act.scrollIntoViewIfNeeded();
  await agent.waitForTimeout(500);
  await shot(agent, "v14-13-lead-from-guide");
  const cardsAll = await agent.locator("button[data-lead-card]", { hasText: "Guide" }).count();
  check(cardsAll >= 5, "Seeded guide leads are visible on the board", `count=${cardsAll}`);

  await agent.goto(`${WEB}/app/calendar`, { waitUntil: "networkidle" });
  await agent.getByText("10:00 FOLLO", { exact: false }).first().waitFor();
  check((await agent.getByText(/^10:00 follo/i).count()) >= 5, "Follow-up tasks from guide requests are on the calendar", `count=${await agent.getByText(/^10:00 follo/i).count()}`);
  await agent.waitForTimeout(300);
  await shot(agent, "v14-14-calendar-followups");

  // ======================= Settings =======================
  await agent.goto(`${WEB}/app/settings`, { waitUntil: "networkidle" });
  await agent.getByText("Public pages and guides").waitFor();
  await agent.getByPlaceholder("https://yourbrokerage.com/privacy").fill("not a link");
  await agent.getByRole("button", { name: "Save settings" }).click();
  await agent.waitForTimeout(800);
  await shot(agent, "v14-15-settings");
  check(!(await agent.getByText("Settings saved.").count()), "Settings refuse a privacy link that is not a URL");
  await agent.getByPlaceholder("https://yourbrokerage.com/privacy").fill("https://levante-demo.example/privacy");
  await agent.getByRole("button", { name: "Save settings" }).click();
  await agent.getByText("Settings saved.").waitFor();
  check(true, "Settings save with a valid privacy link");

  // ======================= Reports =======================
  await agent.goto(`${WEB}/app/reports`, { waitUntil: "networkidle" });
  const rep = agent.getByTestId("guides-report");
  await rep.waitFor();
  check((await rep.innerText()).includes("The First-Time Buyer's Guide"), "Reports list guide performance");
  await rep.scrollIntoViewIfNeeded();
  await agent.waitForTimeout(500);
  await shot(agent, "v14-16-reports-guides");
  await agent.getByRole("button", { name: /Export/ }).click();
  const [rp] = await Promise.all([agent.waitForEvent("download"), agent.getByRole("menuitem", { name: /Report \(PDF\)/ }).click()]);
  const rpt = await readPdf(rp, "report.pdf");
  check(rpt.head === "%PDF-" && rpt.size > 4000, "Report PDF exports with the guides page", `${rpt.name} ${rpt.size}`);
  fs.copyFileSync(path.join(TMP, "report.pdf"), path.resolve(__dirname, "../../design/samples/sample-report-with-guides.pdf"));

  // ======================= Archive =======================
  await agent.goto(shareUrl.replace(WEB, WEB), { waitUntil: "networkidle" });
  await agent.goto(`${WEB}/app/guides`, { waitUntil: "networkidle" });
  await agent.locator("[data-testid=guide-card]", { hasText: title }).click();
  await agent.getByRole("button", { name: "Archive" }).click();
  await agent.getByText("Guide archived").waitFor();
  await visitor.goto(shareUrl, { waitUntil: "networkidle" });
  check(await visitor.getByText("This guide is not available").isVisible(), "Archived guide disappears from the public site");
  await visitor.goto(personalUrl, { waitUntil: "networkidle" });
  check(await visitor.getByText("Your guide is ready").isVisible(), "Other guides' personal links keep working");

  check(errors.length === 0, "No console or page errors", errors.slice(0, 4).join(" | "));
} catch (e) {
  failed++;
  console.log("FAIL  exception:", e.message.split("\n").slice(0, 8).join("\n"));
  await agent.screenshot({ path: path.join(SHOTS, "v14-error-agent.png") }).catch(() => {});
  await visitor.screenshot({ path: path.join(SHOTS, "v14-error-visitor.png") }).catch(() => {});
} finally {
  await browser.close();
  try {
    console.log(execSync("npx tsx scripts/cleanup-test-leads.ts", { cwd: API_DIR, encoding: "utf8" }).trim());
  } catch (e) {
    console.log("cleanup failed:", e.message);
  }
  fs.rmSync(TMP, { recursive: true, force: true });
}

console.log(failed ? `${failed} FAILED` : "ALL PASSED");
process.exit(failed ? 1 : 0);
