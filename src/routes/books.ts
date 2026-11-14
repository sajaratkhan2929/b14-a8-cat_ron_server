import { Router } from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../db.js";

const router = Router();
const books = () => getDb().collection("books");

// GET /books (public), newest first, optional ?limit=6
router.get("/", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 0, 100);
    let cursor = books().find().sort({ createdAt: -1 });
    if (limit > 0) cursor = cursor.limit(limit);
    res.json(await cursor.toArray());
  } catch {
    res.status(500).json({ message: "Could not load books" });
  }
});

// GET /books/:id
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid book id" });
    }
    const book = await books().findOne({ _id: new ObjectId(id) });
    if (!book) return res.status(404).json({ message: "Book not found" });
    res.json(book);
  } catch {
    res.status(500).json({ message: "Could not load the book" });
  }
});

// POST /books
// TEMPORARY: addedBy comes from the body. It will switch to the verified JWT user.
router.post("/", async (req, res) => {
  try {
    const { title, author, category, image, description, totalCopies, addedBy } = req.body;

    const copies = Number(totalCopies);
    if (!title || !author || !category || !image || !description || !addedBy?.email) {
      return res.status(400).json({ message: "Please fill in all the fields" });
    }
    if (!Number.isInteger(copies) || copies < 1) {
      return res.status(400).json({ message: "Total copies must be at least 1" });
    }

    const book = {
      title: String(title).trim(),
      author: String(author).trim(),
      category,
      image,
      description: String(description).trim(),
      totalCopies: copies,
      availableCopies: copies,
      addedBy: { name: addedBy.name, email: addedBy.email },
      createdAt: new Date(),
    };

    const result = await books().insertOne(book);
    res.status(201).json({ _id: result.insertedId, ...book });
  } catch {
    res.status(500).json({ message: "Could not add the book" });
  }
});

export default router;