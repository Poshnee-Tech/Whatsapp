#!/usr/bin/env node
// Sends a signed, Meta-shaped webhook to your deployment for testing.
//
//   META_APP_SECRET=... node scripts/send-test-webhook.mjs <url> [options]
//
// Options:
//   --text "hello"      message body (default "hello from test")
//   --status            send a "delivered" status event instead of a message
//   --repeat N          send the same event N times (duplicate test)
//   --bad-signature     sign with the wrong secret (expect 401)
//   --phone-id ID       metadata.phone_number_id (default: test-phone-number-id,
//                       which never triggers an auto-reply)

import { createHmac, randomBytes } from "node:crypto";

const args = process.argv.slice(2);
const url = args.find((a) => a.startsWith("http"));
const flag = (name) => args.includes(name);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const secret = process.env.META_APP_SECRET;
if (!url || !secret) {
  console.error("Usage: META_APP_SECRET=... node scripts/send-test-webhook.mjs <url> [options]");
  process.exit(1);
}

const now = String(Math.floor(Date.now() / 1000));
const id = `wamid.TEST${randomBytes(12).toString("hex")}`;
const value = {
  messaging_product: "whatsapp",
  metadata: { display_phone_number: "15550000000", phone_number_id: option("--phone-id", "test-phone-number-id") },
};

if (flag("--status")) {
  value.statuses = [{ id, status: "delivered", timestamp: now, recipient_id: "15551234567" }];
} else {
  value.contacts = [{ profile: { name: "Test Customer" }, wa_id: "15551234567" }];
  value.messages = [
    { from: "15551234567", id, timestamp: now, type: "text", text: { body: option("--text", "hello from test") } },
  ];
}

const body = JSON.stringify({
  object: "whatsapp_business_account",
  entry: [{ id: "TEST_WABA_ID", changes: [{ field: "messages", value }] }],
});
const signature = "sha256=" + createHmac("sha256", flag("--bad-signature") ? "wrong-secret" : secret).update(body).digest("hex");

const repeat = Number(option("--repeat", "1"));
for (let i = 1; i <= repeat; i++) {
  const started = Date.now();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Hub-Signature-256": signature },
    body,
  });
  console.log(`#${i} → HTTP ${res.status} ${await res.text()} (${Date.now() - started} ms)  id=${id}`);
}
