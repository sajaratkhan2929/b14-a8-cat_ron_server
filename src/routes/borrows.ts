import { Router } from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../db.js";
import { verifyToken } from "../middleware/verifyToken.js";

const router = Router();
const books = () => getDb().collection("books");
const borrows = () => getDb().collection("borrows");

const BORROW_DAYS = 7;

// Every borrow route needs a valid JWT
router.use(verifyToken);

// POST /borrows
router.post("/", async (req, res) => {
  try {
    const user = req.user!;
    const { bookId } = req.body;

    if (!bookId || !ObjectId.isValid(bookId)) {
      return res.status(400).json({ message: "A valid book is required" });
    }

    const book = await books().findOne({ _id: new ObjectId(bookId) });
    if (!book) return res.status(404).json({ message: "Book not found" });

    // No double borrow
    const existing = await borrows().findOne({
      bookId: book._id,
      userEmail: user.email,
    });
    if (existing) {
      return res.status(409).json({ message: "You have already borrowed this book" });
    }

    // Take one copy, but only if at least one is available
    const taken = await books().updateOne(
      { _id: book._id, availableCopies: { $gt: 0 } },
      { $inc: { availableCopies: -1 } }
    );
    if (taken.modifiedCount === 0) {
      return res.status(409).json({ message: "This book is not available right now" });
    }

    const borrowDate = new Date();
    const returnDate = new Date(borrowDate);
    returnDate.setDate(returnDate.getDate() + BORROW_DAYS);

    const borrow = {
      bookId: book._id,
      bookTitle: book.title,
      bookImage: book.image,
      userName: user.name,
      userEmail: user.email,
      borrowDate,
      returnDate,
    };

    try {
      const result = await borrows().insertOne(borrow);
      res.status(201).json({ _id: result.insertedId, ...borrow });
    } catch (err) {
      // Give the copy back if the borrow could not be saved
      await books().updateOne({ _id: book._id }, { $inc: { availableCopies: 1 } });
      if ((err as { code?: number }).code === 11000) {
        return res.status(409).json({ message: "You have already borrowed this book" });
      }
      throw err;
    }
  } catch {
    res.status(500).json({ message: "Could not borrow the book" });
  }
});

// GET /borrows: only the logged in user's borrows
router.get("/", async (req, res) => {
  try {
    const user = req.user!;
    const list = await borrows()
      .find({ userEmail: user.email })
      .sort({ borrowDate: -1 })
      .toArray();
    res.json(list);
  } catch {
    res.status(500).json({ message: "Could not load your borrows" });
  }
});

// DELETE /borrows/:id: return a book
router.delete("/:id", async (req, res) => {
  try {
    const user = req.user!;
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid borrow id" });
    }

    const borrow = await borrows().findOne({ _id: new ObjectId(id) });
    if (!borrow) return res.status(404).json({ message: "Borrow record not found" });
    if (borrow.userEmail !== user.email) {
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