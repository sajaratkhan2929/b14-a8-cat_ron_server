import "dotenv/config";
import express from "express";
import cors from "cors";
import { connectDB } from "./db.js";
import booksRouter from "./routes/books.js";
import borrowsRouter from "./routes/borrows.js";

const app = express();
const port = process.env.PORT || 5000;

app.use(cors({ origin: process.env.CLIENT_URL?.split(",") || "*" }));
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({ message: "BookNook server is running" });
});
app.use("/books", booksRouter);
app.use("/borrows", borrowsRouter);

connectDB()
  .then(() => {
    app.listen(port, () => console.log(`BookNook server listening on ${port}`));
  })
  .catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
  });