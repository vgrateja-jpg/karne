# Karne — Meat Supply Order & Inventory System

A full-stack system to replace the 56-tab Google Sheets workbook used by a meat-supply
business (the owner supplies meat to wholesale clients such as Rustica). It removes the
two big pains: **typing each texted order into many places**, and **hopping across 31
daily tabs to check records**.

> Working name: **Karne** (Filipino for "meat"). Rename freely.

---

## 1. What the system does

- **Enter each order once** (customer + products + qty). Inventory, the customer's running
  balance, daily sales, and the dashboards all update automatically.
- **One rolling dashboard** instead of 31 daily tabs — filter by day, product, or customer.
- **Prices live in one place** (the catalog). Change a price once; it applies everywhere.
  Historical orders keep the price they were sold at.
- **Customer statements & printable receipts** (arrears + purchases − payments).
- **Inventory on-hand & valuation** from purchases in and sales out.
- **Cash / bank / GCash position** and expenses.
- **SMS intake**: a text sent to her business number is forwarded to the system, parsed into
  a draft order, and shown in an inbox for her to confirm with one tap.

---

## 2. Architecture

```
        Phone / Tablet / Office PC (browser)
                     │
        ┌────────────▼─────────────┐
        │  Karne web app (static)  │   React + Vite + TypeScript
        │  hosted on GitHub Pages  │   responsive, print-friendly
        └────────────┬─────────────┘
                     │  supabase-js (publishable key) + Auth (login)
        ┌────────────▼─────────────┐
        │        Supabase          │
        │  Postgres + RLS + Auth   │   clean normalized schema
        │  Edge Function (webhook) │   receives forwarded SMS
        └────────────┬─────────────┘
                     │  HTTPS webhook (shared secret)
        ┌────────────▼─────────────┐
        │  SMS forwarder on a phone │  Android app on the business SIM
        │  with the business SIM    │  auto-forwards incoming texts
        └───────────────────────────┘
```

**Why this shape**
- GitHub Pages is static-only, so it cannot receive the SMS webhook. The webhook lives in a
  **Supabase Edge Function** instead. (Alternative: host the app on **Cloudflare Pages** or
  **Vercel** — both free — which can host the app *and* the webhook together. GitHub Pages
  stays fully supported either way.)
- The app is public code; all business **data is protected by Supabase Auth + Row Level
  Security**. Public sign-up is disabled — the owner creates the few staff accounts.
- SMS intake via an Android **forwarder app** on the business SIM is the cheapest, most
  PH-friendly path (no carrier/Twilio onboarding). Can be swapped for a paid gateway later;
  the webhook accepts either.

---

## 3. Data model (replaces the workbook)

| New table | Replaces in the workbook |
|---|---|
| `products` (+ price) | `PLIST` and the prices hardcoded inside formulas (`×380`, `×260`…) |
| `customers` | per-customer tabs (`ARNELROMY`, `JING`, `KENNETH`…) + the daily credit ledger |
| `orders` / `order_items` | the per-product OUT / sales entries on each daily tab |
| `payments` | the `PAYMENTS` column of the credit ledger |
| `inventory_movements` | the master IN/OUT inventory ledger (`Sheet31`) |
| `suppliers` / `purchases` / `purchase_items` | `MEAT ACQUIRED`, supplier funds (`JC ALL FRESH`) |
| `cattle_purchases` | the `CATTLES` block (weight × price) |
| `bank_accounts` / `bank_transactions` | `CASH IN BANK` rows + the `SCHEDULE` deposits calendar |
| `expenses` | the expenses & salaries block |
| `sms_inbox` | (new) raw incoming texts → parsed draft orders awaiting confirmation |
| `profiles` | (new) app users (owner / staff) for login |

**Key clean-ups baked in**
- Stable IDs and foreign keys instead of hardcoded cell references (`='5'!Q33`).
- `order_items.unit_price` is captured at sale time → historical accuracy even after price changes.
- Canonical product & customer names (no more `BALAT`/`balat`/`BLAT`) via lookup tables + aliases.
- On-hand stock is derived (`sum(inventory_movements.quantity)`), so it can't silently drift.
- No `#DIV/0!` — totals are computed in SQL / the app, not fragile sheet formulas.

---

## 4. Build phases

- **Phase 0 — Foundation** *(in progress)*: repo scaffold, data model + RLS migration, this plan.
- **Phase 1 — Core app**: Supabase auth + client; product catalog & price list; customers;
  **enter-an-order-once** screen; automatic inventory deduction.
- **Phase 2 — Records & dashboards**: rolling monthly dashboard (replaces the 31 tabs);
  per-customer statements & receivables; inventory on-hand & valuation; daily cash reconciliation.
- **Phase 3 — Printing**: printable receipts (RESIBO) and daily/monthly reports.
- **Phase 4 — SMS intake**: Edge Function webhook; Android forwarder setup guide;
  pending-orders inbox (parse → review → confirm); optional AI-assisted parsing.
- **Phase 5 — Migrate & deploy**: import existing products/customers/opening balances from the
  workbook; deploy to GitHub Pages (or Cloudflare/Vercel); handover guide.

---

## 5. Cost — everything runs at $0

This is designed to cost her **nothing**, ongoing:

| Piece | Plan | Cost |
|---|---|---|
| Hosting (web app) | GitHub Pages (or Cloudflare/Vercel free tier) | Free |
| Database + Auth + Edge Function | Supabase Free tier (500 MB DB, 50k monthly active users, plenty of Edge Function calls) | Free |
| SMS intake | Free Android **SMS-forwarder app** on the existing business SIM → webhook | Free (no Twilio/gateway fees) |
| Domain | Free `*.github.io` subdomain (custom domain optional, not required) | Free |
| AI order parsing | **Optional.** Default parser is rule-based (free). AI parsing only if she ever wants it. | Free by default |

Notes / the only things to watch:
- Supabase Free pauses a project after ~7 days of **no activity** — a daily-use business app
  never hits that, so it's a non-issue here.
- The free tiers are comfortably above a single shop's volume. If she ever outgrew them (years
  out), upgrades are optional, not required.
- We deliberately avoid Twilio/paid SMS gateways — they're the usual hidden cost, and the
  forwarder-app approach replaces them for free.

## 6. Delivery & guardrails

- I build files locally for preview; **nothing is pushed to GitHub or applied to Supabase**
  without an explicit go-ahead. You review and apply on your own schedule.
- Migrations are plain SQL files under `supabase/migrations/` — runnable via the Supabase SQL
  editor or CLI.
