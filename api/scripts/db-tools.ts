/**
 * Database migration tooling with an audit trail.
 *
 *   npm run db:deploy    back up, apply pending migrations, write an entry to prisma/apply-log.md
 *   npm run db:status    what is applied, what is pending, and whether the database matches schema.prisma
 *   npm run db:history   every migration the database has recorded (when, how many steps, logs)
 *
 * Creating a new migration is `npm run db:new -- <name>` (see prisma/CHANGELOG.md for the checklist).
 */
import "dotenv/config";
import { spawnSync, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "../src/lib/prisma.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const apiDir = path.resolve(here, "..");
const migrationsDir = path.join(apiDir, "prisma", "migrations");
const applyLog = path.join(apiDir, "prisma", "apply-log.md");
const backupDir = path.join(apiDir, "backups");

type Row = {
  migration_name: string;
  started_at: Date;
  finished_at: Date | null;
  rolled_back_at: Date | null;
  applied_steps_count: number;
  logs: string | null;
  checksum: string;
};

function dbInfo() {
  const raw = process.env.DATABASE_URL || "";
  try {
    const u = new URL(raw);
    return {
      label: `${u.pathname.replace(/^\//, "")} @ ${u.hostname}:${u.port || "5432"} (schema ${u.searchParams.get("schema") || "public"})`,
      name: u.pathname.replace(/^\//, ""),
      raw,
    };
  } catch {
    return { label: "unknown", name: "unknown", raw };
  }
}

function git(args: string[]) {
  try {
    return execFileSync("git", args, { cwd: apiDir, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function localMigrations() {
  if (!fs.existsSync(migrationsDir)) return [];
  return fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

async function recorded(): Promise<Row[]> {
  const t = await prisma.$queryRawUnsafe<{ t: string | null }[]>(`SELECT to_regclass('"_prisma_migrations"')::text AS t`);
  if (!t[0]?.t) return []; // brand new database: nothing recorded yet
  try {
    return await prisma.$queryRawUnsafe<Row[]>(
      `SELECT migration_name, started_at, finished_at, rolled_back_at, applied_steps_count, logs, checksum
       FROM "_prisma_migrations" ORDER BY started_at, migration_name`,
    );
  } catch {
    return [];
  }
}

function prismaRun(args: string[]) {
  const r = spawnSync("npx", ["prisma", ...args], { cwd: apiDir, encoding: "utf8", env: process.env });
  const out = `${r.stdout || ""}${r.stderr || ""}`
    .split("\n")
    .filter((l) => !/npm warn|Environment variables loaded/.test(l))
    .join("\n")
    .trim();
  return { ok: r.status === 0, out, code: r.status };
}

function stamp(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const tz = `${sign}${p(Math.floor(Math.abs(off) / 60))}:${p(Math.abs(off) % 60)}`;
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())} ${tz}`;
}

async function status() {
  const db = dbInfo();
  const done = (await recorded()).filter((r) => r.finished_at && !r.rolled_back_at).map((r) => r.migration_name);
  const local = localMigrations();
  const pending = local.filter((m) => !done.includes(m));
  const unknown = done.filter((m) => !local.includes(m));
  console.log(`Database: ${db.label}`);
  console.log(`Migrations in repo: ${local.length}, applied: ${done.length}, pending: ${pending.length}`);
  for (const m of pending) console.log(`  PENDING  ${m}`);
  for (const m of unknown) console.log(`  UNKNOWN  ${m} (applied in the database but missing from the repo)`);
  const drift = prismaRun([
    "migrate",
    "diff",
    "--from-schema-datasource",
    "prisma/schema.prisma",
    "--to-schema-datamodel",
    "prisma/schema.prisma",
    "--exit-code",
  ]);
  const drifted = drift.code === 2;
  if (drifted && pending.length) {
    console.log("Not in sync yet because migrations are pending. Run: npm run db:deploy");
  } else if (drifted) {
    console.log("DRIFT: the database does not match prisma/schema.prisma. Create a migration, do not use db push.");
    console.log(drift.out);
  } else {
    console.log("No drift: the database matches prisma/schema.prisma.");
  }
  return { pending, unknown, drifted };
}

async function history() {
  const rows = await recorded();
  const db = dbInfo();
  console.log(`Migration history for ${db.label}\n`);
  if (!rows.length) console.log("Nothing recorded yet.");
  for (const r of rows) {
    const state = r.rolled_back_at ? "ROLLED BACK" : r.finished_at ? "applied" : "FAILED / unfinished";
    console.log(`${r.migration_name}`);
    console.log(`  state     ${state}`);
    console.log(`  started   ${stamp(r.started_at)}`);
    console.log(`  finished  ${r.finished_at ? stamp(r.finished_at) : "-"}`);
    console.log(`  steps     ${r.applied_steps_count}`);
    console.log(`  checksum  ${r.checksum.slice(0, 16)}...`);
    if (r.logs) console.log(`  logs      ${r.logs.trim().split("\n").join("\n            ")}`);
    console.log("");
  }
}

function appendLog(entry: string) {
  if (!fs.existsSync(applyLog)) {
    fs.writeFileSync(
      applyLog,
      "# Migration apply log\n\nAppend-only record of every `npm run db:deploy` run: when, who, which commit, which database, what was applied, and the result.\nWritten by `scripts/db-tools.ts`. Do not edit old entries.\n",
    );
  }
  fs.appendFileSync(applyLog, `\n${entry}\n`);
}

async function deploy() {
  const started = Date.now();
  const db = dbInfo();
  const done = (await recorded()).filter((r) => r.finished_at && !r.rolled_back_at).map((r) => r.migration_name);
  const pending = localMigrations().filter((m) => !done.includes(m));
  const who = `${os.userInfo().username}@${os.hostname()}`;
  const commit = git(["rev-parse", "--short", "HEAD"]) || "unknown";
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]) || "unknown";
  const dirty = git(["status", "--porcelain", "--", "prisma"]) ? "yes (uncommitted prisma changes)" : "no";

  if (!pending.length) {
    console.log(`Nothing to apply on ${db.label}. ${done.length} migrations already applied.`);
    await prisma.$disconnect();
    return;
  }

  console.log(`Pending on ${db.label}:\n${pending.map((m) => `  ${m}`).join("\n")}`);

  // Backup first, so there is always a way back.
  let backup = "skipped (pg_dump not available)";
  try {
    fs.mkdirSync(backupDir, { recursive: true });
    const file = path.join(backupDir, `${stamp().replace(/[: ]/g, "-").replace(/\+/g, "p")}-before-${pending[0]}.sql`);
    execFileSync("pg_dump", ["--no-owner", "--file", file, db.raw.split("?")[0]], { stdio: "pipe" });
    backup = `${path.relative(apiDir, file)} (${Math.round(fs.statSync(file).size / 1024)} KB)`;
    console.log(`Backup written: ${backup}`);
  } catch (e) {
    backup = `FAILED: ${(e as Error).message.split("\n")[0]}`;
    console.log(`Backup ${backup}`);
  }

  const run = prismaRun(["migrate", "deploy"]);
  const after = (await recorded()).filter((r) => r.finished_at && !r.rolled_back_at).map((r) => r.migration_name);
  const applied = pending.filter((m) => after.includes(m));
  const failed = pending.filter((m) => !after.includes(m));
  const seconds = ((Date.now() - started) / 1000).toFixed(1);

  appendLog(
    [
      `## ${stamp()} - deploy - ${run.ok ? "SUCCESS" : "FAILED"}`,
      `- Database: ${db.label}`,
      `- Run by: ${who}`,
      `- Code version: ${commit} on ${branch}, uncommitted prisma changes: ${dirty}`,
      `- Pending before: ${pending.join(", ")}`,
      `- Applied: ${applied.length ? applied.join(", ") : "none"}`,
      ...(failed.length ? [`- NOT applied: ${failed.join(", ")}`] : []),
      `- Backup: ${backup}`,
      `- Duration: ${seconds}s`,
      "",
      "```",
      run.out,
      "```",
    ].join("\n"),
  );

  console.log(run.out);
  console.log(run.ok ? `\nDone in ${seconds}s. Logged to prisma/apply-log.md` : `\nFAILED. Logged to prisma/apply-log.md`);
  await prisma.$disconnect();
  if (!run.ok) process.exit(1);
}

const cmd = process.argv[2];
try {
  if (cmd === "deploy") await deploy();
  else if (cmd === "status") {
    const s = await status();
    await prisma.$disconnect();
    if (s.pending.length || s.drifted || s.unknown.length) process.exit(1);
  } else if (cmd === "history") {
    await history();
    await prisma.$disconnect();
  } else {
    console.log("Usage: tsx scripts/db-tools.ts deploy | status | history");
    process.exit(2);
  }
} catch (e) {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
}
