import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verify Meta's X-Hub-Signature-256 header ("sha256=<hex>") against the
 * raw request bytes. Must run on the exact bytes received, before JSON parsing.
 */
export function verifyMetaSignature(rawBody: Buffer, header: string | null, appSecret: string): boolean {
  if (!header || !header.startsWith("sha256=")) return false;
  const hex = header.slice("sha256=".length);
  if (!/^[0-9a-f]{64}$/i.test(hex)) return false;

  const expected = createHmac("sha256", appSecret).update(rawBody).digest();
  return timingSafeEqual(expected, Buffer.from(hex, "hex"));
}

/** Constant-time string comparison for shared secrets. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
