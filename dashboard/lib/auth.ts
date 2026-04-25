import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";

const COOKIE_NAME = "admin_session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function getSecret(): string {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) throw new Error("ADMIN_PASSWORD env var is required");
  return pw;
}

/**
 * Derive a separate HMAC key from the password using scrypt.
 * This ensures the session signing key is not the raw password,
 * so even if sessions are analyzed, the password itself isn't exposed.
 */
let derivedKey: Buffer | null = null;
function getSigningKey(): Buffer {
  if (derivedKey) return derivedKey;
  derivedKey = crypto.scryptSync(getSecret(), "agentcenter-session-signing", 32);
  return derivedKey;
}

function sign(value: string): string {
  const hmac = crypto.createHmac("sha256", getSigningKey());
  hmac.update(value);
  return `${value}.${hmac.digest("hex")}`;
}

/**
 * Verify a session token using constant-time comparison
 * to prevent timing attacks.
 */
function verify(token: string): boolean {
  const lastDot = token.lastIndexOf(".");
  if (lastDot === -1) return false;
  const value = token.substring(0, lastDot);
  const expected = sign(value);

  if (expected.length !== token.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token));
}

export async function setSessionCookie(): Promise<void> {
  const ts = Date.now().toString();
  const token = sign(ts);
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: MAX_AGE,
    path: "/",
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

export async function isAuthenticated(): Promise<boolean> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return false;
  return verify(token);
}

/**
 * Verify password using constant-time comparison to prevent timing attacks.
 */
export function verifyPassword(password: string): boolean {
  const secret = getSecret();
  if (password.length !== secret.length) return false;
  return crypto.timingSafeEqual(Buffer.from(password), Buffer.from(secret));
}

/**
 * Verify server-to-server API key from X-API-Key header.
 * Used by the Cloudflare Pages function to call infra endpoints without a session cookie.
 */
export function isApiKeyAuthenticated(req: NextRequest): boolean {
  const apiKey = req.headers.get("X-API-Key");
  if (!apiKey) return false;
  const validKey = process.env.API_KEY;
  if (!validKey) return false;
  if (apiKey.length !== validKey.length) return false;
  return crypto.timingSafeEqual(Buffer.from(apiKey), Buffer.from(validKey));
}
