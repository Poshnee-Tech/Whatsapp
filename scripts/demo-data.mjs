#!/usr/bin/env node
// Adds or removes demo conversations so the inbox can be shown before real
// customers arrive. Demo customers use +44 7700 900xxx, a UK range reserved
// for fiction, and demo message IDs start with "wamid.DEMO".
//
//   npm run demo:seed     add demo conversations (replaces any earlier demo data)
//   npm run demo:clean    remove all demo data

import { createClient } from "@supabase/supabase-js";

const mode = process.argv[2];
if (mode !== "seed" && mode !== "clean") {
  console.error("Usage: node --env-file=.env.local scripts/demo-data.mjs seed|clean");
  process.exit(1);
}
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
  console.error("SUPABASE_URL and SUPABASE_SECRET_KEY must be set (see .env.local).");
  process.exit(1);
}

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});
const DEMO_NUMBERS = "447700900%";
const minutesAgo = (m) => new Date(Date.now() - m * 60_000).toISOString();

async function check(result, what) {
  const { error } = await result;
  if (error) throw new Error(`${what}: ${error.message}`);
}

async function clean() {
  const { data, error } = await db.from("messages").select("wa_message_id").like("wa_id", DEMO_NUMBERS);
  if (error) throw new Error(`find demo messages: ${error.message}`);
  const ids = (data ?? []).map((m) => m.wa_message_id);
  if (ids.length) await check(db.from("message_statuses").delete().in("wa_message_id", ids), "delete statuses");
  await check(db.from("messages").delete().like("wa_id", DEMO_NUMBERS), "delete messages");
  await check(db.from("conversations").delete().like("wa_id", DEMO_NUMBERS), "delete conversations");
  await check(db.from("contacts").delete().like("wa_id", DEMO_NUMBERS), "delete contacts");
  return ids.length;
}

// Each customer: name (or null), conversation state, and messages oldest first.
// Message: [direction, minutesAgo, type, body, extra]. Outbound extra = { by, status }.
const CUSTOMERS = [
  {
    wa_id: "447700900111",
    name: "Aisha Khan",
    botPaused: true,
    readMinutesAgo: 170,
    messages: [
      ["in", 182, "text", "Hi, I ordered on Monday (order #PN-10482). Any update on delivery?"],
      ["out", 181, "text", "Thanks for messaging Poshnee! A member of our team will reply shortly.", { by: "bot", status: "read" }],
      ["out", 170, "text", "Hi Aisha, your order shipped yesterday with Royal Mail. Tracking number: RM123456785GB. It should arrive tomorrow.", { by: "staff", status: "read" }],
      ["in", 12, "text", "Amazing, thank you so much! 🙏"],
    ],
  },
  {
    wa_id: "447700900112",
    name: "Daniel Brooks",
    messages: [
      ["in", 41, "image", "Does this come in a size M?", { mime: "image/jpeg" }],
      ["in", 40, "text", "Also, do you offer gift wrapping?"],
    ],
  },
  {
    wa_id: "447700900116",
    name: "Fatima Ali",
    messages: [["in", 2, "audio", null, { mime: "audio/ogg" }]],
  },
  {
    wa_id: "447700900115",
    name: "Tom Wilson",
    botPaused: true,
    readMinutesAgo: 290,
    messages: [
      ["in", 302, "location", "Poshnee Store · Oxford Street, London · 51.5154,-0.1410"],
      ["in", 301, "text", "Is this the right shop for click & collect?"],
      ["out", 295, "text", "Yes, that's us! The collection desk is on the ground floor, just bring your order confirmation.", { by: "staff", status: "delivered" }],
    ],
  },
  {
    wa_id: "447700900113",
    name: "Priya Patel",
    botPaused: true,
    readMinutesAgo: 1100,
    messages: [
      ["in", 1260, "text", "Hello! What are your opening hours on Sunday?"],
      ["out", 1259, "text", "Thanks for messaging Poshnee! A member of our team will reply shortly.", { by: "bot", status: "read" }],
      ["out", 1180, "text", "Hi Priya, we're open 11am to 5pm on Sundays.", { by: "staff", status: "read" }],
      ["in", 1175, "interactive", "Thanks!"],
    ],
  },
  {
    wa_id: "447700900114",
    name: null,
    readMinutesAgo: 2870,
    messages: [
      ["in", 2885, "document", "Invoice_March.pdf", { mime: "application/pdf" }],
      ["out", 2880, "text", "Thanks, we've received your invoice and passed it to our accounts team.", { by: "staff", status: "failed" }],
    ],
  },
];

async function seed() {
  await clean();
  let n = 0;
  for (const c of CUSTOMERS) {
    await check(
      db.from("contacts").upsert({ wa_id: c.wa_id, profile_name: c.name, updated_at: new Date().toISOString() }),
      "insert contact",
    );

    for (const [direction, ago, type, body, extra = {}] of c.messages) {
      const id = `wamid.DEMO${c.wa_id}${String(n++).padStart(3, "0")}`;
      const at = minutesAgo(ago);
      await check(
        db.from("messages").insert({
          wa_message_id: id,
          direction,
          wa_id: c.wa_id,
          phone_number_id: "demo",
          type,
          body,
          media_id: extra.mime ? `demo-media-${n}` : null,
          media_mime_type: extra.mime ?? null,
          payload: { demo: true },
          sent_by: direction === "out" ? extra.by : null,
          status: extra.status ?? null,
          status_updated_at: extra.status ? at : null,
          error: extra.status === "failed" ? [{ code: 131026, title: "Message undeliverable" }] : null,
          wa_timestamp: at,
          created_at: at,
        }),
        "insert message",
      );
      if (extra.status) {
        await check(
          db.from("message_statuses").insert({ wa_message_id: id, status: extra.status, recipient_id: c.wa_id, wa_timestamp: at, payload: { demo: true } }),
          "insert status",
        );
      }
    }

    if (c.botPaused || c.readMinutesAgo) {
      await check(
        db.from("conversations").upsert({
          wa_id: c.wa_id,
          bot_paused: !!c.botPaused,
          last_read_at: c.readMinutesAgo ? minutesAgo(c.readMinutesAgo) : null,
          updated_at: new Date().toISOString(),
        }),
        "insert conversation",
      );
    }
  }
  return n;
}

try {
  if (mode === "seed") console.log(`Added ${await seed()} demo messages across ${CUSTOMERS.length} conversations.`);
  else console.log(`Removed ${await clean()} demo messages.`);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
