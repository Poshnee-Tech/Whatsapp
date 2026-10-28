# Poshnee WhatsApp: webhook MVP

Receives WhatsApp Cloud API webhooks for Poshnee's business number and stores
messages and delivery statuses in Supabase. It runs as a Next.js app on Vercel
(Hobby plan) with a Supabase database (free tier). Both run in London: Supabase
`eu-west-2` and Vercel `lhr1` (set in `vercel.json`), so each database call stays local.

```
Meta ──POST──▶ https://wa.poshnee.com/api/webhook
                 1. check X-Hub-Signature-256 against the raw body   (401 if wrong)
                 2. save the raw event to webhook_events               (500 if the DB fails → Meta retries)
                 3. return 200
                 4. after the response: process the event, then up to 5 leftover events
                                                    ▲
               Vercel cron (daily) ─────────────────┘  plus manual replay
```

| Endpoint | Purpose |
|---|---|
| `GET /api/webhook` | Meta verification handshake (`hub.mode`, `hub.verify_token`, `hub.challenge`) |
| `POST /api/webhook` | Incoming messages and statuses |
| `GET /api/health` | Uptime check: DB reachable, stuck and dead event counts |
| `GET /api/cron/retry` | Retry pending, failed and stuck events (`Authorization: Bearer $CRON_SECRET`) |

**What the MVP handles**
- Batched payloads: every message and status in every entry is processed.
- Duplicates: messages, statuses and auto-replies are each unique by WhatsApp ID, so a repeat delivery has no effect.
- Statuses that arrive out of order or late never move a message's status backwards. Statuses never trigger replies.
- Incoming text, image, document, audio, video, sticker, interactive, button, reaction and location messages. Media is stored by ID only; downloading comes later.
- Retries: a failed event is retried up to 5 times, then marked `dead` and can be replayed by hand.
- Test auto-reply: text `ping` gets the reply `pong` when `AUTO_REPLY_PING=true`. The rule lives in `src/lib/replies.ts`, which is where greetings and FAQs will go later.

---

## 1. Supabase

1. Create a project at supabase.com (free tier).
2. Open **SQL Editor**, paste in [`supabase/schema.sql`](supabase/schema.sql) and run it.
3. Go to **Project Settings → API** and copy:
   - the **Project URL** → `SUPABASE_URL`
   - the **secret key** (`sb_secret_…`), or the legacy `service_role` key → `SUPABASE_SECRET_KEY`

   Keep the secret key server-side only. Every table has row-level security
   (RLS) turned on with no policies, so the public anon key can't read anything.

## 2. Deploy to Vercel

1. Push this folder to a private GitHub repo and import it at vercel.com/new.
   Alternatively, run `npx vercel` from this folder.
2. Under **Settings → Environment Variables**, add every variable from
   [`.env.example`](.env.example). Generate the random values with:
   ```bash
   openssl rand -hex 32   # once for WA_VERIFY_TOKEN, once for CRON_SECRET
   ```
   `WA_ACCESS_TOKEN` and `WA_PHONE_NUMBER_ID` come from step 4. You can deploy
   first with placeholder values, because they're only needed for sending.
3. Redeploy after changing environment variables. Vercel only applies them to new deployments.
4. Check `https://<project>.vercel.app/api/health`. It should return `{"ok":true,...}`.

## 3. Domain: wa.poshnee.com (GoDaddy)

1. In Vercel, go to **Settings → Domains** and add `wa.poshnee.com`.
2. In GoDaddy, go to **DNS → Add record**:
   - Type `CNAME`, Name `wa`, Value: the target Vercel shows (for example `cname.vercel-dns.com`)
3. Wait until Vercel shows the domain as valid. It issues the HTTPS certificate automatically.

## 4. Meta setup

1. **App:** at developers.facebook.com, create a **Business** app, add the **WhatsApp** product and connect Poshnee's WhatsApp Business Account (WABA).
2. **Permanent token:** in Business Settings, go to **System users**, add an admin system user, assign it the app and the WABA, then **Generate token** with only `whatsapp_business_messaging` and `whatsapp_business_management`. Put it in `WA_ACCESS_TOKEN`. Don't use the temporary 24-hour token from the dashboard.
3. **App secret:** **App settings → Basic → App secret** → `META_APP_SECRET`.
4. **Phone number ID:** **WhatsApp → API Setup** → `WA_PHONE_NUMBER_ID`.
5. **Webhook:** under **WhatsApp → Configuration → Webhook → Edit**:
   - Callback URL: `https://wa.poshnee.com/api/webhook`
   - Verify token: your `WA_VERIFY_TOKEN`
   - Click **Verify and save**. Meta calls the GET endpoint immediately, so the app must already be deployed.
   - Under **Webhook fields**, subscribe to **messages**.
6. **Subscribe the app to the WABA**, so events for Poshnee's number reach it:
   ```bash
   curl -X POST "https://graph.facebook.com/v25.0/<WABA_ID>/subscribed_apps" \
     -H "Authorization: Bearer $WA_ACCESS_TOKEN"
   ```
7. **Register the phone number** (one time; choose a 6-digit 2-step verification PIN):
   ```bash
   curl -X POST "https://graph.facebook.com/v25.0/<PHONE_NUMBER_ID>/register" \
     -H "Authorization: Bearer $WA_ACCESS_TOKEN" -H "Content-Type: application/json" \
     -d '{"messaging_product":"whatsapp","pin":"<6-digit PIN>"}'
   ```
8. **Go live:** add a privacy policy URL under **App settings → Basic**, switch the app to **Live**, and complete business verification if Meta asks for it.

## 5. Testing

From your own phone, send `ping` to the business number. You should get `pong`
back, and the message should appear in Supabase's `messages` table.

Synthetic tests (they use a fake phone number ID, so they never send real replies):

```bash
export META_APP_SECRET=...            # same value as in Vercel
URL=https://wa.poshnee.com/api/webhook

node scripts/send-test-webhook.mjs $URL                    # 200, one row in messages
node scripts/send-test-webhook.mjs $URL --bad-signature    # 401
node scripts/send-test-webhook.mjs $URL --repeat 5         # 5× 200, still one row in messages
node scripts/send-test-webhook.mjs $URL --status           # 200, one row in message_statuses
```

Useful queries:

```sql
select status, count(*) from webhook_events group by 1;          -- processing health
select * from messages order by created_at desc limit 20;        -- latest messages
select id, attempts, last_error from webhook_events where status in ('failed','dead');
```

## 6. Retries and replay

- Every webhook request also retries up to 5 leftover events, so with normal traffic the backlog clears within minutes.
- The Vercel cron calls `/api/cron/retry` once a day. On the Hobby plan, once a day is the most allowed.
- To replay by hand (`?dead=1` also replays events that ran out of attempts, 20 per call):
  ```bash
  curl -H "Authorization: Bearer $CRON_SECRET" "https://wa.poshnee.com/api/cron/retry?dead=1"
  ```
- **Optional:** retry every minute for free by using Supabase's own scheduler instead of the daily Vercel cron. Enable the `pg_cron` and `pg_net` extensions in Supabase (**Database → Extensions**), then run:
  ```sql
  select cron.schedule('wa-retry', '* * * * *', $$
    select net.http_get(
      url := 'https://wa.poshnee.com/api/cron/retry',
      headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>')
    );
  $$);
  ```

## 7. Staff inbox (read-only)

`https://wa.poshnee.com/inbox` lists conversations, newest first, and shows each
thread with delivery ticks. It refreshes every 5 seconds. Replying from the inbox
comes in a later phase.

- Set `INBOX_PASSWORD` (shared staff password) and `INBOX_SESSION_SECRET` in Vercel. A login lasts 7 days; changing `INBOX_SESSION_SECRET` logs everyone out.
- Existing projects: run [`supabase/migrations/002_inbox.sql`](supabase/migrations/002_inbox.sql) once in the SQL Editor. New projects get it from `schema.sql`.
- Media shows as a label (Photo, Document…) with its caption until media download is built.

## 8. Monitoring (free)

Point an uptime monitor (for example UptimeRobot) at `https://wa.poshnee.com/api/health`.
- It returns 503 when the database is unreachable.
- `stuckEvents > 0` means events are waiting more than 5 minutes.
- `deadEvents > 0` means events need a replay.

Function logs are under Vercel → **Logs**. Logs never include message content.

## 9. Upgrading the Graph API version

The version is pinned in `WA_GRAPH_API_VERSION` (currently `v25.0`). Meta supports
each version for about 2 years. To upgrade:
1. Read the WhatsApp and Graph API changelogs for breaking changes.
2. Change the variable in a Preview deployment and send a `ping` test.
3. Change it in Production and redeploy.

## Notes and limits

- **Vercel Hobby** is free but limited to non-commercial use under Vercel's terms. Upgrade to Pro ($20/month) if Vercel flags the project.
- **Supabase free tier** pauses projects after about a week with no activity. Daily WhatsApp traffic keeps it active. It has no automatic backups; Pro ($25/month) adds daily backups.
- Free-form replies only work within 24 hours of the customer's last message. The auto-reply checks this. Outside that window, Meta requires an approved template (not built yet).

## Project layout

```
src/app/api/webhook/route.ts     GET verification, POST signature check + store + ack
src/app/api/cron/retry/route.ts  retry/replay endpoint
src/app/api/health/route.ts      health check
src/app/inbox/page.tsx           staff inbox (read-only), login at src/app/login
src/lib/session.ts               signed login cookie
src/lib/process.ts               event processing, dedupe, statuses, auto-reply
src/lib/replies.ts               reply rules (the replaceable reply engine)
src/lib/whatsapp.ts              payload types + Cloud API send
src/lib/signature.ts             HMAC verification
supabase/schema.sql              tables, RLS, functions
scripts/send-test-webhook.mjs    signed test webhook sender
```
