import { createHmac } from "node:crypto";
import { cookies } from "next/headers";
import { env } from "./env";
import { safeEqual } from "./signature";

const COOKIE = "inbox_session";
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

// Cookie value is "<expiry ms>.<hmac>", so it can't be forged or extended
// without INBOX_SESSION_SECRET.
function sign(expiry: string): string {
  return createHmac("sha256", env.inboxSessionSecret).update(expiry).digest("hex");
}

export async function createSession(): Promise<void> {
  const expiry = String(Date.now() + MAX_AGE_SECONDS * 1000);
  (await cookies()).set(COOKIE, `${expiry}.${sign(expiry)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function hasSession(): Promise<boolean> {
  const value = (await cookies()).get(COOKIE)?.value;
  if (!value) return false;
  const [expiry, signature] = value.split(".");
  if (!expiry || !signature || Number(expiry) < Date.now()) return false;
  return safeEqual(signature, sign(expiry));
}

export async function destroySession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}
