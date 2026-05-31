# Karne

A free, full-stack order / inventory / receivables system for a meat-supply business —
built to replace a 56-tab Google Sheets workbook.

**🔗 Live:** https://vgrateja.github.io/karne/ — deploys automatically on every push to `main`.

- **Frontend:** React + Vite + TypeScript (static site → GitHub Pages)
- **Backend:** Supabase (Postgres + Auth + Row Level Security + Edge Functions)
- **SMS intake:** free Android SMS-forwarder app → Supabase Edge Function webhook
- **Cost:** $0 (see `PLAN.md` §5)

See **`PLAN.md`** for the architecture, the data model, and the build phases.

---

## Status

- [x] **Phase 0 — Foundation:** plan, data model, first migration (`supabase/migrations/0001_initial_schema.sql`)
- [x] **Phase 1 — Core app:** auth, catalog/price list, customers, enter-an-order-once, automatic inventory (builds clean; needs a Supabase project to run live)
- [x] **Phase 2 — Records & dashboards:** monthly view (replaces the 31 daily tabs), per-customer statements + payments, inventory valuation
- [x] **Phase 3 — Printing:** printable receipts + printable monthly report, business-header settings
- [x] **Phase 4 — SMS intake:** Edge Function webhook + parser + review **Inbox** (see `SMS_SETUP.md`)
- [~] **Phase 5 — Deploy done** (live on GitHub Pages); migrating real data still to do

---

## Repo layout

```
Meat/                             (Desktop\Meat — open this folder in VSCode)
├── PLAN.md                       architecture, data model, phases, cost
├── README.md                     this file
├── app/                          React + Vite + TypeScript web app
├── supabase/
│   └── migrations/
│       └── 0001_initial_schema.sql
└── _source/                      original workbook + analysis (not deployed)
    ├── orders_sheet.xlsx
    ├── xlsx_dump/
    └── parse_xlsx.ps1
```

---

## Applying the database schema

You don't have to do this yet — review the migration first. When ready, either:

**Option A — Supabase SQL editor (no install needed)**
1. Create a free project at <https://supabase.com> (region: Singapore, closest to PH).
2. Open **SQL Editor** → paste the contents of `supabase/migrations/0001_initial_schema.sql` → **Run**.

**Option B — Supabase CLI**
```bash
npm install -g supabase        # CLI isn't installed locally yet
supabase link --project-ref <your-ref>
supabase db push
```

### One-time Auth setup (important)
- **Disable public sign-ups**: Auth → Providers → Email → turn **off** "Allow new users to sign up".
  The owner then invites staff via Auth → Users → *Add user*. (The schema auto-creates a profile.)
- Promote the owner: in SQL editor, `update public.profiles set role = 'owner' where id = '<user-id>';`

---

## Run the app locally

```bash
cd app
cp .env.example .env.local      # then fill in your Supabase URL + publishable key
npm install                     # first time only
npm run dev                     # opens http://localhost:5173
```

Without Supabase credentials the app still loads — the login screen just shows a "not
configured yet" note. To use it for real:

1. Create a free Supabase project, run the migrations in order — `0001_*.sql` … `0004_*.sql`
   (and optionally `supabase/seed_products.sql`) — in the SQL editor.
2. Disable public sign-up and add the owner account (see *One-time Auth setup* above).
3. Put the project URL + **publishable** key in `app/.env.local`.
4. `npm run dev`, log in, and you'll land on the dashboard.

## What works now (Phases 1–3)

- Email/password login (accounts created by the owner)
- **Products & prices** — add/edit; one price per product, used everywhere
- **Customers** — add/edit; live balance owed; click a name for their statement
- **New order** — pick customer, add products (price auto-fills), see the total; saving creates
  the order, its items, and the inventory deductions in one atomic step
- **Orders** list and **Inventory** (stock on hand, record stock-in, inventory value)
- **Monthly view** — day-by-day totals, sales by product, sales by customer, with month
  navigation (this replaces flipping through the 31 daily tabs)
- **Customer statement** — full ledger (opening + orders − payments) with running balance, and
  a record-payment form
- **Printing** — a printable **receipt** for any order (🖨 from the order list or after saving)
  and a printable **monthly report**, both headed with the shop name
- **Settings** — business name / address / phone / receipt footer for the printouts
- **SMS Inbox** — forwarded texts are parsed into draft orders; review, fix, and confirm into a
  real order in one tap (setup in `SMS_SETUP.md`)
- **Purchases** — cattle bought (weight × price) + supplier purchases; tracks her supply cost
- **Expenses** — log salaries, diesel, utilities, etc.; running monthly total
- **Cash & Banks** — every account's balance, deposits/withdrawals/transfers, total cash on hand
- **Purchases & suppliers** — also tracks **supplier account balances (payables)** + payments to them
- **Loans & financing** — money borrowed (payable) / lent (receivable) with running balances
- **Cheques** — register received/issued cheques with due dates + status (pending → cleared)
- **Branches** — optional: tag orders by location (add branches in Settings)
- **Butchering** — record a whole animal in, list the cuts + weights; each cut is added to stock (shows yield)
- **Dashboard** — sales today, receivables, **payables**, cash on hand, and this-month sales /
  purchases / expenses / rough profit

## Next

Migrate her real data: import actual customers + opening balances from the workbook and tune the
product list/prices, staged as SQL to review before applying. Nothing is pushed to GitHub or
applied to Supabase without your go-ahead.
