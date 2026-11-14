import "dotenv/config";
import express from "express";
import cors from "cors";

const app = express();
const port = process.env.PORT || 5000;

app.use(cors({ origin: process.env.CLIENT_URL?.split(",") || "*" }));
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({ message: "BookNook server is running" });
});

app.listen(port, () => console.log(`BookNook server listening on ${port}`));