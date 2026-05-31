# SMS intake setup (free)

How a text to her business number becomes a draft order in the app:

```
Customer texts her SIM ─▶ free Android forwarder app ─▶ POST ─▶ Supabase Edge Function
                                                                  (sms-inbound)
                                                                       │ parses + matches customer
                                                                       ▼
                                                            sms_inbox row (status: pending)
                                                                       │
                                                                       ▼
                                          Karne app ▸ "Inbox" ▸ she reviews & taps Confirm ▶ order
```

Everything here is **free**: Supabase Edge Functions are on the free tier, and the forwarder
is a free phone app using her existing SIM (no Twilio / no per-SMS fees).

---

## 1. Pick a webhook secret
Choose any long random string (this stops strangers from posting fake orders). Example:
`karne_7f3k9Qd2zP8w`. You'll use it in two places below.

> Prereq: make sure migrations `0001`–`0005` are applied (0005 adds the senders
> registry). If you're updating an already-deployed function, just re-deploy it
> with the current `index.ts`.

## 2. Deploy the Edge Function

**Option A — Supabase CLI**
```bash
npm install -g supabase
supabase login
supabase functions deploy sms-inbound --no-verify-jwt --project-ref <YOUR-REF>
supabase secrets set SMS_WEBHOOK_SECRET="karne_7f3k9Qd2zP8w" --project-ref <YOUR-REF>
```

**Option B — Supabase dashboard (no install)**
1. **Edge Functions** → **Deploy a new function** → name it exactly **`sms-inbound`**.
2. Paste the contents of `supabase/functions/sms-inbound/index.ts`.
3. Turn **Verify JWT = OFF** (the forwarder app has no Supabase token; we use our own secret).
4. **Deploy**.
5. Add the secret: **Edge Functions → Secrets** (or Project Settings → Functions) →
   `SMS_WEBHOOK_SECRET` = your secret from step 1.

> `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically — don't add them.

Your webhook URL is:
```
https://<YOUR-REF>.supabase.co/functions/v1/sms-inbound?secret=karne_7f3k9Qd2zP8w
```

## 3. Test it
```bash
curl -X POST "https://<YOUR-REF>.supabase.co/functions/v1/sms-inbound?secret=karne_7f3k9Qd2zP8w" \
  -H "content-type: application/json" \
  -d '{"from":"09171234567","text":"BF Shank 5kg, Chicken Whole 3, Salmon Head 2"}'
```
Expected: `{"ok":true,...}`. Then open the app → **Inbox** → the text should be waiting, parsed
into line items for you to confirm.

## 4. Set up the phone forwarder
On the phone with the **business SIM**, install a free SMS-forwarding app from the Play Store
(search "SMS forwarder to URL / webhook" — e.g. *SMS to URL Forwarder*, *SMSForwarder*,
or use *MacroDroid*/*Tasker* if you already have them). Then create a rule:

- **Trigger:** incoming SMS (optionally only from specific numbers — your regular order
  senders — to cut noise).
- **Action:** HTTP **POST** to your webhook URL (step 2).
- **Body:** JSON — most apps support placeholders for the sender and message. Use:
  ```json
  {"from":"%sender%","text":"%message%"}
  ```
  (placeholder names vary by app — e.g. `%from%`/`%text%`, `{sender}`/`{message}`. The function
  also accepts form fields named `from`/`sender`/`phone` and `text`/`message`/`body`.)
- **Headers (optional):** instead of `?secret=` in the URL you may send
  `x-webhook-secret: <your secret>`.

Send yourself a test text to confirm it lands in the **Inbox**.

---

## Notes
- The parser is **best-effort** — it matches product names and the aliases you add (Products →
  each product can have spelling variants like `bulalo`, `balat`). Anything it can't match shows
  up for you to fix before confirming. Nothing is ever auto-posted as a final order.
- Add **aliases** for the words customers actually text (Products → each product's variants).
- **Register order senders** in the app: **Settings → SMS order senders** (phone → customer).
  Texts from registered numbers auto-pick the customer; texts from unregistered numbers still
  appear in the Inbox flagged **“unknown sender”**, with a one-tap **Register this number** button.
- To revoke access, change `SMS_WEBHOOK_SECRET` (and update the forwarder app).
