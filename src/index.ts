import express from "express";
import subjectRouter from "./routes/subjects.js";

const app = express();
const PORT = 8000;

app.use(express.json());

app.use("/api/subjects", subjectRouter);

app.get("/", (req, res) => {
  res.send("Hello welcome !!!");
});

app.listen(PORT, () => {
  console.log(`Server is running at ${PORT}`);
});
