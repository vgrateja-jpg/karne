# Automatic nightly backups — setup (one time, ~10 minutes)

This makes a free, automatic copy of the whole database **every night** and keeps
the last 30 days. It runs on its own — nobody has to remember.

The backups must stay **private** (they contain customer data), so they live in a
separate **private** repo — NOT the public app repo.

## Steps

1. **Create a private repo**
   - GitHub → New repository → name it `karne-backups`
   - Visibility: **Private** ✅ (important)
   - Create it (you can add a README, doesn't matter)

2. **Add the workflow file**
   - In that new repo, create a file at exactly:
     `.github/workflows/backup.yml`
   - Paste in the contents of `backup.yml` (the file next to this one).

3. **Get the database connection string from Supabase**
   - Open your project, then click the green **Connect** button at the **top of the page**.
   - In the panel, use the **URI** view, and for **Type** choose **Session pooler**.
   - Copy the string — it looks like:
     `postgresql://postgres.xxxx:[YOUR-PASSWORD]@aws-0-<region>.pooler.supabase.com:5432/postgres`
   - Replace `[YOUR-PASSWORD]` with your actual **database** password (NOT your login password).
     Don't have it? Gear icon → **Project Settings → Database → Reset database password**, then copy it.
   - ⚠️ Must be the **Session pooler** one — the "Direct connection" is IPv6-only and
     GitHub's servers can't reach it, so the backup would silently fail.

4. **Save it as a secret in the backups repo**
   - In `karne-backups` → **Settings → Secrets and variables → Actions**
   - **New repository secret**
   - Name: `SUPABASE_DB_URL`
   - Value: the connection string from step 3
   - Add secret

5. **Test it now**
   - In `karne-backups` → **Actions** tab → **Nightly backup** → **Run workflow**
   - After ~1 minute it should go green, and a file like
     `backups/karne-2026-06-01.sql.gz` will appear in the repo.
   - From then on it runs automatically every night.

## How to restore (if it's ever needed)

A `.sql.gz` file is a full snapshot. To restore: unzip it and run it against a
Supabase project (`gunzip -c karne-DATE.sql.gz | psql "<connection string>"`).
If that day ever comes, send me the file and I'll handle the restore.

## Notes

- **Free:** private repos and GitHub Actions minutes are free on personal accounts;
  each backup is tiny (kilobytes for a while).
- This is the *automatic* safety net. The **Download backup** button in the app
  (Settings) is the *on-demand* one — use it before big changes or to keep your own copy.
- Time is 18:00 UTC (~2 AM Philippines / ~4 AM eastern Australia). Change the `cron:`
  line in `backup.yml` if you want a different time.
