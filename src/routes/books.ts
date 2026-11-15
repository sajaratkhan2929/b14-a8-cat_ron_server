import { Router } from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../db.js";
import { verifyToken } from "../middleware/verifyToken.js";

const router = Router();
const books = () => getDb().collection("books");

const CATEGORIES = ["Fiction", "Science", "History", "Kids", "Others"];

// GET /books (public). Newest first.
// Optional: ?limit=6 and ?addedBy=email (used by My Books)
router.get("/", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 0, 100);
    const filter: Record<string, unknown> = {};
    if (typeof req.query.addedBy === "string" && req.query.addedBy) {
      filter["addedBy.email"] = req.query.addedBy;
    }

    let cursor = books().find(filter).sort({ createdAt: -1 });
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

// POST /books (protected). addedBy comes from the verified token.
router.post("/", verifyToken, async (req, res) => {
  try {
    const user = req.user!;
    const { title, author, category, image, description, totalCopies } = req.body;

    const copies = Number(totalCopies);
    if (!title || !author || !category || !image || !description) {
      return res.status(400).json({ message: "Please fill in all the fields" });
    }
    if (!CATEGORIES.includes(category)) {
      return res.status(400).json({ message: "Please choose a valid category" });
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
      addedBy: { name: user.name, email: user.email },
      createdAt: new Date(),
    };

    const result = await books().insertOne(book);
    res.status(201).json({ _id: result.insertedId, ...book });
  } catch {
    res.status(500).json({ message: "Could not add the book" });
  }
});

// PATCH /books/:id (protected, owner only)
router.patch("/:id", verifyToken, async (req, res) => {
  try {
    const user = req.user!;
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid book id" });
    }

    const book = await books().findOne({ _id: new ObjectId(id) });
    if (!book) return res.status(404).json({ message: "Book not found" });
    if (book.addedBy?.email !== user.email) {
      return res.status(403).json({ message: "You can only edit your own books" });
    }

    const { title, author, category, image, description, totalCopies } = req.body;
    const updates: Record<string, unknown> = {};
    if (title !== undefined) updates.title = String(title).trim();
    if (author !== undefined) updates.author = String(author).trim();
    if (category !== undefined) {
      if (!CATEGORIES.includes(category)) {
        return res.status(400).json({ message: "Please choose a valid category" });
      }
      updates.category = category;
    }
    if (image !== undefined) updates.image = image;
    if (description !== undefined) updates.description = String(description).trim();

    // If total copies change, available copies move by the same amount.
    let availableChange = 0;
    if (totalCopies !== undefined) {
      const newTotal = Number(totalCopies);
      if (!Number.isInteger(newTotal) || newTotal < 1) {
        return res.status(400).json({ message: "Total copies must be at least 1" });
      }
      const borrowedNow = book.totalCopies - book.availableCopies;
      if (newTotal < borrowedNow) {
        return res.status(400).json({
          message: `${borrowedNow} copies are borrowed right now, so the total cannot be lower than that`,
        });
      }
      updates.totalCopies = newTotal;
      availableChange = newTotal - book.totalCopies;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "Nothing to update" });
    }

    const update: Record<string, unknown> = { $set: updates };
    if (availableChange !== 0) update.$inc = { availableCopies: availableChange };

    await books().updateOne({ _id: new ObjectId(id) }, update);
    res.json(await books().findOne({ _id: new ObjectId(id) }));
  } catch {
    res.status(500).json({ message: "Could not update the book" });
  }
});

// DELETE /books/:id (protected, owner only)
router.delete("/:id", verifyToken, async (req, res) => {
  try {
    const user = req.user!;
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid book id" });
    }

    const book = await books().findOne({ _id: new ObjectId(id) });
    if (!book) return res.status(404).json({ message: "Book not found" });
    if (book.addedBy?.email !== user.email) {
      return res.status(403).json({ message: "You can only delete your own books" });
    }

    await books().deleteOne({ _id: new ObjectId(id) });
    res.json({ message: "Book deleted", _id: id });
  } catch {
    res.status(500).json({ message: "Could not delete the book" });
  }
});

export default router;