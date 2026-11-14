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

// PATCH /books/:id
// TEMPORARY: userEmail comes from the body. It will switch to the verified JWT user.
router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid book id" });
    }

    const book = await books().findOne({ _id: new ObjectId(id) });
    if (!book) return res.status(404).json({ message: "Book not found" });

    const { userEmail, title, author, category, image, description, totalCopies } = req.body;
    if (!userEmail || book.addedBy?.email !== userEmail) {
      return res.status(403).json({ message: "You can only edit your own books" });
    }

    const updates: Record<string, unknown> = {};
    if (title !== undefined) updates.title = String(title).trim();
    if (author !== undefined) updates.author = String(author).trim();
    if (category !== undefined) updates.category = category;
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
          message: `${borrowedNow} copies are borrowed right now, so total cannot be lower than that`,
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
    const updated = await books().findOne({ _id: new ObjectId(id) });
    res.json(updated);
  } catch {
    res.status(500).json({ message: "Could not update the book" });
  }
});

// DELETE /books/:id
// TEMPORARY: userEmail comes from the query. It will switch to the verified JWT user.
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid book id" });
    }

    const book = await books().findOne({ _id: new ObjectId(id) });
    if (!book) return res.status(404).json({ message: "Book not found" });

    const userEmail = String(req.query.userEmail || "");
    if (!userEmail || book.addedBy?.email !== userEmail) {
      return res.status(403).json({ message: "You can only delete your own books" });
    }

    await books().deleteOne({ _id: new ObjectId(id) });
    res.json({ message: "Book deleted", _id: id });
  } catch {
    res.status(500).json({ message: "Could not delete the book" });
  }
});

// GET /borrows?userEmail=...
// TEMPORARY: userEmail comes from the query. It will switch to the verified JWT user.
router.get("/", async (req, res) => {
  try {
    const userEmail = String(req.query.userEmail || "");
    if (!userEmail) {
      return res.status(400).json({ message: "User email is required" });
    }
    const list = await borrows()
      .find({ userEmail })
      .sort({ borrowDate: -1 })
      .toArray();
    res.json(list);
  } catch {
    res.status(500).json({ message: "Could not load your borrows" });
  }
});

// DELETE /borrows/:id  (return a book)
// TEMPORARY: userEmail comes from the query. It will switch to the verified JWT user.
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid borrow id" });
    }

    const borrow = await borrows().findOne({ _id: new ObjectId(id) });
    if (!borrow) return res.status(404).json({ message: "Borrow record not found" });

    const userEmail = String(req.query.userEmail || "");
    if (!userEmail || borrow.userEmail !== userEmail) {
      return res.status(403).json({ message: "You can only return your own borrowed books" });
    }

    await borrows().deleteOne({ _id: borrow._id });
    // Put the copy back (does nothing if the book was deleted meanwhile)
    await books().updateOne({ _id: borrow.bookId }, { $inc: { availableCopies: 1 } });

    res.json({ message: "Book returned", _id: id });
  } catch {
    res.status(500).json({ message: "Could not return the book" });
  }
});

export default router;