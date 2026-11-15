import type { NextFunction, Request, Response } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks() {
  const authUrl = process.env.AUTH_URL;
  if (!authUrl) throw new Error("AUTH_URL is missing in .env");
  if (!jwks) jwks = createRemoteJWKSet(new URL(`${authUrl}/api/auth/jwks`));
  return jwks;
}

export async function verifyToken(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Please log in to continue" });
  }

  try {
    const token = header.slice(7);
    const { payload } = await jwtVerify(token, getJwks(), {
      issuer: process.env.AUTH_URL,
    });

    const email = typeof payload.email === "string" ? payload.email : "";
    if (!email) {
      return res.status(401).json({ message: "Your session is invalid" });
    }

    req.user = {
      id: payload.sub,
      email,
      name: typeof payload.name === "string" ? payload.name : "",
    };
    next();
  } catch (err) {
    console.error("JWT check failed:", err instanceof Error ? err.message : err);
    res.status(401).json({ message: "Your session is invalid or has expired" });
  }
}