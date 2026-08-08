if (!process.env.VERCEL) {
  const AgentAPI = (await import("apminsight")).default;
  AgentAPI.config();
}

import express from "express";
import cors from "cors";
import subjectRouter from "./routes/subjects.js";
import userRouter from "./routes/users.js";
import classRouter from "./routes/classes.js";
import statsRouter from "./routes/stats.js";
import teacherStatsRouter from "./routes/teacherStats.js";
import studentStatsRouter from "./routes/studentStats.js";
import announcementsRouter from "./routes/announcements.js";
import departmentsRouter from "./routes/departments.js";
import enrollmentsRouter from "./routes/enrollments.js";
import securityMiddleware from "./middleware/security.js";
import { sessionMiddleware } from "./middleware/auth.js";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth.js";
import logger from "./lib/logger.js";
import requestLogger from "./middleware/requestLogger.js";
import errorHandler from "./middleware/errorHandler.js";

const app = express();
const PORT = 8000;

if (!process.env.FRONTEND_URL) {
  throw new Error("FRONTEND_URL is not set in the .env file");
}

app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    credentials: true,
  }),
);

app.use(requestLogger);

app.all("/api/auth/*splat", toNodeHandler(auth));
app.all("/auth/*splat", toNodeHandler(auth));

app.use(express.json());
app.use(sessionMiddleware);
// app.use(securityMiddleware);

app.use("/api/subjects", subjectRouter);
app.use("/api/users", userRouter);
app.use("/api/classes", classRouter);
app.use("/api/stats/admin", statsRouter);
app.use("/api/stats/teacher", teacherStatsRouter);
app.use("/api/stats/student", studentStatsRouter);
app.use("/api/announcements", announcementsRouter);
app.use("/api/departments", departmentsRouter);
app.use("/api/enrollments", enrollmentsRouter);

app.get("/", (req, res) => {
  res.send("Hello welcome !!!");
});

app.use(errorHandler);

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    logger.info(`Server is running at ${PORT}`);
  });
}

export default app;
