import { MongoClient, Db } from "mongodb";

let db: Db;

export async function connectDB(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is missing in .env");

  const client = new MongoClient(uri);
  await client.connect();
  db = client.db("booknook");
  console.log("Connected to MongoDB");
}

export function getDb(): Db {
  if (!db) throw new Error("Database is not connected yet");
  return db;
}