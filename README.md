# Synergy Feedback

A Jotform-style form builder and feedback platform for **Synergy Wellness** (physiotherapy & wellness).
Admins build forms with drag and drop, assign them to branches, publish them as links or QR codes, and
review submissions. Every form can send its submissions to **its own Google Sheet**.

**Stack:** Next.js 16 (App Router, Server Components, Server Actions, `proxy.ts`) · React 19 · TypeScript ·
Tailwind CSS 4 · shadcn/ui-style components (Radix) · Lucide · React Hook Form · Zod · dnd-kit ·
Supabase (Postgres, Auth, Storage, RLS) · Google OAuth 2.0 + Sheets API · Resend · Cloudflare Turnstile.

How it fits together (schema, RLS, OAuth flow, sync and retry design) is described in
**[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

---

## Features

- **Admin console:** dashboard with live counts, analytics (today / 7 / 30 / 90 days, by branch, by form,
  sync status), forms, submissions, branches, integrations, settings, team, audit log.
- **Form builder:** 23 field types (text, email, phone, number, URL, dropdown, radio, checkbox, multi-select,
  date, time, date & time, rating, star rating, yes/no, linear scale, file upload, signature, heading,
  description, divider, section/page). It has drag-and-drop ordering, a properties panel, validation rules
  (length, min/max, regex), conditional show/hide logic, undo and redo, debounced autosave, preview and publish.
- **Public forms:** `/forms/[slug]`, mobile-first and accessible, multi-step sections, uploads that work
  with the phone camera, a touch signature pad, SEO and Open Graph metadata, and a success screen showing
  the submission ID. Each form has its own branding.
- **Submissions:** search, filters (form, branch, dates, sync status, archived), pagination, a detail
  view, bulk archive, permanent delete for super admins, and a streaming CSV or Excel-compatible export
  that keeps the current filters.
- **Google Sheets per form:** OAuth with PKCE, create a new spreadsheet or pick an existing one, choose a
  worksheet, headers created automatically, columns that grow with the form, an optional field-mapping
  UI, test connection, open sheet, disconnect, reauthorize, and a per-submission sync status with retry.
- **Email notifications** through Resend. By default they don't include patient answers.
- **QR codes:** view, download as PNG or SVG, print, and copy the link.
- **Security:** RLS on every table, server-side validation, rate limiting, CAPTCHA, a honeypot, duplicate
  protection, file checks by magic bytes, encrypted OAuth tokens, an append-only audit log and strict
  security headers.

---

## Local setup

Requirements: Node.js ≥ 20.9, npm, Docker (for the local Supabase stack), and optionally `psql`.

```bash
npm install
cp .env.example .env.local          # fill in values (see below)
npx supabase start                  # local Postgres/Auth/Storage + runs migrations + seed
npm run dev                         # http://localhost:3000
```

`npx supabase start` prints `API_URL`, `ANON_KEY` and `SERVICE_ROLE_KEY`. Put them in `.env.local` as
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`. Then generate
the secrets:

```bash
openssl rand -base64 32   # TOKEN_ENCRYPTION_KEY
openssl rand -base64 48   # APP_SECRET
openssl rand -hex 32      # CRON_SECRET
```

> If Docker can't reach `public.ecr.aws`, run `SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io npx supabase start`.

### Create the first super admin

Public sign-up is disabled, so admins are invited. Create a user in Supabase Studio
(Authentication → Users → *Add user*, tick "Auto confirm") or with the Admin API. Then promote them:

```sql
update public.profiles set role = 'super_admin', is_active = true
where email = 'you@synergywellness.com';
```

New users start as **inactive staff**. A super admin activates them and assigns a role under
**Settings → Team**.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` · `npm run typecheck` | ESLint (flat config) · TypeScript |
| `npm test` | Vitest unit tests: logic, validation, sync engine, crypto, CSV, email |
| `npm run test:db` | Applies all migrations and the seed to a throwaway local Postgres, then runs the RLS and behaviour tests (`supabase/tests/rls.test.sql`) |

---

## Supabase setup (hosted project)

1. **Create a project** at supabase.com. Choose a region close to your clinics (for example Mumbai, `ap-south-1`).
2. **Environment variables:** in Project Settings → API, copy the URL and anon key (these are public) and
   the `service_role` key (server only, and never with a `NEXT_PUBLIC_` prefix).
3. **Run the migrations:**
   ```bash
   npx supabase login
   npx supabase link --project-ref <your-ref>
   npx supabase db push          # applies supabase/migrations/*
   ```
   Do **not** run `seed.sql` in production. It contains demo branches and forms.
4. **Authentication:**
   - Authentication → Sign In / Providers: keep **Email** enabled and **turn off "Allow new users to sign up"**.
   - URL Configuration: set **Site URL** to `https://your-domain` and add
     `https://your-domain/auth/confirm` to the redirect URLs.
   - Email Templates → *Reset password*: point the link to
     `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/admin/reset-password`
   - Configure custom SMTP (for example Resend SMTP) so auth emails come from your domain.
5. **Storage:** the migrations create `submission-files` (private: uploads and signatures, viewed through
   2-minute signed URLs) and `branding` (public: logos). No manual steps are needed.
6. **RLS** is enabled on every table by the migrations. Check that **Database → Advisors** shows no security
   warnings, and run `npm run test:db` locally after changing policies.

---

## Google Cloud setup (Google Sheets)

1. **Create a Google Cloud project** at console.cloud.google.com, for example "Synergy Feedback".
2. **Enable the Google Sheets API** under APIs & Services → Library.
3. **Enable the Google Drive API.** This is only needed so admins can *browse and search* their
   spreadsheets. If you set `GOOGLE_DRIVE_LISTING=false`, Drive isn't needed and admins paste a sheet link
   instead.
4. **Configure the OAuth consent screen:**
   - User type: **Internal** if all admins use a Google Workspace account under
     `@synergywellness.com`. This needs no Google verification. Otherwise choose **External**.
   - App name "Synergy Feedback", support email, and your logo.
   - Scopes: `openid`, `email`, `.../auth/spreadsheets`, and `.../auth/drive.metadata.readonly` if you use
     listing.
   - External apps in *Testing* mode: add each admin's Google account as a test user. To go to production
     with an External app, Google requires verification because of the sensitive and restricted scopes.
5. **Create OAuth credentials:** Credentials → Create credentials → OAuth client ID → *Web application*.
6. **Add the redirect URI** exactly as it will be used:
   - `http://localhost:3000/api/google/oauth/callback` (development)
   - `https://your-domain/api/google/oauth/callback` (production)
7. **Configure the environment variables:**
   ```
   GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=xxxx
   GOOGLE_REDIRECT_URI=https://your-domain/api/google/oauth/callback
   TOKEN_ENCRYPTION_KEY=<openssl rand -base64 32>
   ```
8. **Test the OAuth connection:** open a form → Settings → Integrations → **Connect Google Sheet** → sign in
   → choose *Create New Spreadsheet* → **Test Connection**. Submit the public form and a row appears in
   the sheet.

**Permission model.** The spreadsheet stays owned by the connected Google account. Synergy Feedback only
asks for the scopes above. Access and refresh tokens are AES-256-GCM encrypted in `google_accounts`, a
table only the server's service role can read, and they never reach the browser. Disconnecting a form
never deletes the spreadsheet. Removing an account under Integrations → Google Sheets revokes the token
with Google.

### Background retries

Failed syncs are retried by `GET /api/cron/google-sheets-sync`, which requires the header
`Authorization: Bearer $CRON_SECRET`.

- **Vercel:** `vercel.json` schedules it once a day (21:30 UTC = 03:00 IST), which is the most the
  Hobby plan allows. Vercel sends `CRON_SECRET` automatically. On the Pro plan you can change the
  schedule to `*/5 * * * *`.
- **More frequent retries on Hobby:** use the Supabase pg_cron option below.
- **Supabase pg_cron alternative:**
  ```sql
  select cron.schedule('sheets-sync', '*/5 * * * *', $$
    select net.http_get('https://your-domain/api/cron/google-sheets-sync',
      headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>'));
  $$);
  ```
Every new submission also retries a few overdue jobs, and admins can press **Retry Sync** at any time.

---

## Resend setup (email)

1. Create an account at resend.com, then add and **verify your domain** (DNS records for SPF and DKIM).
2. Create an API key and set:
   ```
   RESEND_API_KEY=re_xxx
   EMAIL_FROM="Synergy Feedback <notifications@synergywellness.com>"
   ```
3. Set the default recipients in **Settings → Email**, or per form in **Form → Settings → Notifications**.
   Subjects support `{form}`, `{branch}` and `{number}`. Emails leave out patient answers unless
   "Include answers" is turned on for that form.

If Resend isn't configured, submissions still work and the email step is skipped and logged.

---

## Deployment (Vercel)

1. Push the repository to GitHub and import it in Vercel. The framework (Next.js) is detected automatically.
2. Add every variable from `.env.example` to Production (and Preview). Set
   `NEXT_PUBLIC_APP_URL=https://your-domain`.
3. Deploy, then add your custom domain. HTTPS is automatic.
4. Update the **Supabase Site URL and redirect URLs** and the **Google OAuth redirect URI** to the
   production domain.
5. Check that the cron appears under Project → Settings → Cron Jobs.

---

## Production security checklist

- [ ] **RLS:** migrations applied, the Supabase security advisor is clean, and `npm run test:db` passes.
- [ ] **Environment variables:** the service-role key, `GOOGLE_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY`,
  `APP_SECRET` and `CRON_SECRET` are set only on the server (never `NEXT_PUBLIC_`) and are unique per
  environment. `.env*` files are never committed.
- [ ] **Auth:** public sign-up disabled, the first super admin created, everyone else activated
  individually, and a strong password policy and leaked-password protection turned on in Supabase.
- [ ] **OAuth:** the production redirect URI is registered, the consent screen is Internal or verified,
  and only the documented scopes are requested. Back up `TOKEN_ENCRYPTION_KEY`: losing it means every
  Google account has to reconnect.
- [ ] **CAPTCHA:** Turnstile site and secret keys are set and **Settings → Security → CAPTCHA** is enabled.
- [ ] **Rate limiting:** review the per-minute and per-hour submission limits. A shared clinic tablet on
  one IP may need higher values.
- [ ] **Storage:** `submission-files` stays private. Uploads are limited to images, PDF and Word files up
  to 10 MB and checked by magic bytes.
- [ ] **Email:** domain verified in Resend, SPF, DKIM and DMARC set, and patient answers kept out of email
  unless approved.
- [ ] **Domain and HTTPS:** custom domain on HTTPS. HSTS, CSP, frame-ancestors none and nosniff are sent
  from `next.config.ts`.
- [ ] **Cron:** the retry cron runs, and failed syncs on the dashboard are checked regularly.
- [ ] **Backups:** Supabase PITR or daily backups enabled. Google Sheets is a copy, not the backup.

---

## Data consistency

Supabase is the source of truth. A submission is committed to Postgres, together with a `pending` sync
record, before Google Sheets is contacted. If Google is down or access was revoked, the patient still
sees "Thank you", and the admin sees **⚠ Failed** or **⏳ Pending** with the reason and a **Retry Sync**
button. Retries never create duplicate rows (see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#sync--retry)).
