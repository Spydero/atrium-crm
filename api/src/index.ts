import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { mediaUrl, localUploadName, readUpload, presentMedia } from "./lib/media.js";
import { checkImage } from "./lib/guideTools.js";
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

import { clientChatRouter, messagesRouter } from "./routes/messages.js";

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
// Only validated raster images are served, including files uploaded before validation existed.
app.get("/uploads/:filename", async (req, res) => {
  const name = localUploadName(mediaUrl(req.params.filename));
  if (!name) return res.status(404).end();
  try {
    const buffer = await readUpload(name, 5 * 1024 * 1024);
    if (!buffer) return res.status(404).end();
    const image = checkImage(buffer);
    if (!image.ok) return res.status(404).end();
    res.setHeader("Content-Type", image.ext === "jpg" ? "image/jpeg" : `image/${image.ext}`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
    res.send(buffer);
  } catch {
    res.status(404).end();
  }
});
app.use((_req, res, next) => {
  const json = res.json.bind(res);
  res.json = (body) => json(presentMedia(body));
  next();
});

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
app.use("/api/messages", messagesRouter);
app.use("/api/client-chat", clientChatRouter);
app.use("/api/testing", testingRouter);
app.use("/api/places", placesRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/guides", guidesRouter);
app.use("/api/public", publicGuidesRouter);

app.use((error: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.headersSent) return next(error);
  if (error && typeof error === "object" && "name" in error && error.name === "MulterError") {
    return res.status(400).json({ error: "Upload rejected: check the file size and form field" });
  }
  console.error(error);
  res.status(500).json({ error: "Request failed" });
});

const server = app.listen(port);
server.on("listening", () => {
  console.log(`Atrium API on http://localhost:${port}`);
});
server.on("error", (error) => {
  console.error("API failed to start:", error);
  process.exit(1);
});
