import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "node:path";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth.js";
import { listingsRouter } from "./routes/listings.js";
import { leadsRouter } from "./routes/leads.js";
import { calendarRouter } from "./routes/calendar.js";
import { moneyRouter } from "./routes/money.js";
import { shortlistsRouter } from "./routes/shortlists.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { bootstrapRouter } from "./routes/bootstrap.js";
import { testingRouter } from "./routes/testing.js";
import { placesRouter } from "./routes/places.js";
import { settingsRouter } from "./routes/settings.js";
import { reportsRouter } from "./routes/reports.js";
import { guidesRouter } from "./routes/guides.js";
import { publicGuidesRouter } from "./routes/publicGuides.js";
import { platformRouter } from "./routes/platform.js";
import { invitesRouter } from "./routes/invites.js";

const app = express();
const port = Number(process.env.PORT || 4000);
const allowedOrigins = [
  process.env.CLIENT_ORIGIN || "http://localhost:3000",
  process.env.ADMIN_ORIGIN || "http://localhost:3001",
].filter(Boolean);

app.use(
  cors({
    origin(origin, cb) {
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error(`Origin ${origin} not allowed`));
    },
    credentials: true,
    exposedHeaders: ["Content-Disposition"],
  }),
);

app.all("/api/auth/{*path}", toNodeHandler(auth));

app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

app.get("/health", (_req, res) => res.json({ ok: true, service: "atrium-api" }));

app.use("/api/listings", listingsRouter);
app.use("/api/leads", leadsRouter);
app.use("/api/calendar", calendarRouter);
app.use("/api/money", moneyRouter);
app.use("/api/shortlists", shortlistsRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/bootstrap", bootstrapRouter);
app.use("/api/platform", platformRouter);
app.use("/api/invites", invitesRouter);
app.use("/api/testing", testingRouter);
app.use("/api/places", placesRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/guides", guidesRouter);
app.use("/api/public", publicGuidesRouter);

app.listen(port, () => {
  console.log(`Atrium API on http://localhost:${port}`);
});
