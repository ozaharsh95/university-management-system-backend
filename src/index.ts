import express from "express";
import cors from "cors";
import subjectRouter from "./routes/subjects.js";

const app = express();
const PORT = 8000;

app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  }),
);

app.use(express.json());

app.use("/api/subjects", subjectRouter);

app.get("/", (req, res) => {
  res.send("Hello welcome !!!");
});

app.listen(PORT, () => {
  console.log(`Server is running at ${PORT}`);
});
