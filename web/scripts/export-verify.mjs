// Downloads every export from the running API and saves it to design/exports.
import fs from "node:fs";
import path from "node:path";

const API = process.env.API_URL || "http://localhost:4000";
const OUT = path.resolve("../design/exports");
fs.mkdirSync(OUT, { recursive: true });

const login = await fetch(`${API}/api/auth/sign-in/email`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
  body: JSON.stringify({ email: "agent@atrium.demo", password: "demo1234" }),
});
if (!login.ok) throw new Error(`login failed ${login.status}`);
const cookie = login.headers
  .getSetCookie()
  .map((c) => c.split(";")[0])
  .join("; ");

async function get(p, file) {
  const res = await fetch(`${API}${p}`, { headers: { cookie } });
  const buf = Buffer.from(await res.arrayBuffer());
  console.log(res.status, p, buf.length, "bytes", res.headers.get("content-type"));
  if (res.ok && file) fs.writeFileSync(path.join(OUT, file), buf);
  return { res, buf };
}

const listings = await (await fetch(`${API}/api/listings`, { headers: { cookie } })).json();
console.log("listings:", listings.length);
const withPin = listings.filter((l) => l.lat != null);
const noPin = listings.filter((l) => l.lat == null);
const picks = [withPin[0], withPin[1], noPin[0]].filter(Boolean);
let i = 1;
for (const l of picks) {
  await get(`/api/listings/${l.id}/brochure.pdf`, `brochure-${i++}.pdf`);
}
await get("/api/reports/export.pdf?range=30d", "report-30d.pdf");
await get("/api/reports/export.pdf?range=90d", "report-90d.pdf");
await get("/api/reports/export.csv?range=30d", "report-30d.csv");
await get("/api/leads/export.csv", "leads.csv");
await get("/api/listings/export.csv", "listings.csv");
