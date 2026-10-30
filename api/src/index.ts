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

const app = express();
const port = Number(process.env.PORT || 4000);
const origin = process.env.CLIENT_ORIGIN || "http://localhost:3000";

app.use(
  cors({
    origin,
    credentials: true,
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
app.use("/api/testing", testingRouter);

app.listen(port, () => {
  console.log(`Atrium API on http://localhost:${port}`);
});
