import { Router } from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../db.js";

const router = Router();
const books = () => getDb().collection("books");
const borrows = () => getDb().collection("borrows");

const BORROW_DAYS = 7;

// POST /borrows
// TEMPORARY: userEmail and userName come from the body. They will switch to the verified JWT user.
router.post("/", async (req, res) => {
  try {
    const { bookId, userEmail, userName } = req.body;

    if (!bookId || !ObjectId.isValid(bookId) || !userEmail) {
      return res.status(400).json({ message: "Book and user details are required" });
    }

    const book = await books().findOne({ _id: new ObjectId(bookId) });
    if (!book) return res.status(404).json({ message: "Book not found" });

    // No double borrow
    const existing = await borrows().findOne({ bookId: book._id, userEmail });
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
      userName: userName || "",
      userEmail,
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

export default router;