import express from "express";

const app = express();
const PORT = 8000;

app.use(express.json());

app.get("/", (req, res) => {
  res.send("Hello welcome !!!");
});

app.listen(PORT, () => {
  console.log(`Server is running at ${PORT}`);
});
