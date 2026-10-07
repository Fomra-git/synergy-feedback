# Synergy Feedback — Architecture

## 1. System overview

```
               ┌──────────────────────────── Browser ────────────────────────────┐
               │  Public form (/forms/[slug])        Admin console (/admin/*)    │
               │  DynamicFormRenderer                Server Components + small   │
               │  (client validation = UX only)      client islands (builder…)   │
               └───────────────┬─────────────────────────────┬───────────────────┘
                               │ POST /api/forms/:slug/submit │ Server Actions / RSC
                               ▼                              ▼
               ┌──────────────────────────── Next.js server ─────────────────────┐
               │ proxy.ts: session refresh + /admin gate                          │
               │ Route handlers: submit, upload, export, files, OAuth, cron      │
               │ Server actions: forms, builder, settings, branches, sheets      │
               │ services/*: submissions, google-sheets (engine), email          │
               └──────┬──────────────────────────┬──────────────────────┬────────┘
                      │ user JWT (RLS enforced)  │ service role (after   │ HTTPS
                      │                          │ explicit authz)       │
                      ▼                          ▼                       ▼
               ┌────────────── Supabase ──────────────┐     ┌── Google APIs ──┐  ┌─ Resend ─┐
               │ Postgres (RLS) · Auth · Storage      │     │ OAuth · Sheets   │  │  Email   │
               │ PRIMARY SOURCE OF TRUTH              │     │ · Drive metadata │  └──────────┘
               └──────────────────────────────────────┘     └──────────────────┘
```

* Supabase is the single source of truth. Google Sheets is an eventually-consistent
  copy fed from `google_sheet_sync_logs`.
* The browser never talks to Google, never sees tokens, and never holds the
  service-role key. Only `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY`,
  `NEXT_PUBLIC_APP_URL` and `NEXT_PUBLIC_TURNSTILE_SITE_KEY` are public.
* Admin reads use the user's Supabase session, so PostgreSQL RLS decides what each
  admin can see (including branch scoping). Service-role access is reserved for
  public submission handling, token storage and Sheets sync — always behind an
  explicit `requireAdmin()` / `assertFormAccess()` check where a user is involved.

## 2. Database (supabase/migrations)

| Table | Purpose |
|---|---|
| `profiles` | 1:1 with `auth.users`; `role` (`super_admin`/`admin`/`staff`), `is_active`. New users are inactive staff. |
| `profile_branches` | Branch assignments. An admin with none is organisation-wide; with some, scoped. Foundation for branch staff permissions. |
| `branches` | Clinic locations, soft-deleted via `archived_at`. |
| `forms` | Form metadata + **public-safe** `settings` JSONB (appearance, behaviour, SEO). `version` for optimistic concurrency. |
| `form_fields` | One row per field: stable `field_id`, `type`, `settings`/`validation`/`logic` JSONB, `position`. |
| `form_settings` | **Private** per-form config: submission limits, notification recipients, sheet metadata options. Never public. |
| `form_submissions` | One row per response. Public `submission_number` (`SW-YYYYMMDD-000123`), `client_token` (idempotency), `dedupe_hash`, `ip_hash` (salted HMAC, never raw IP), trigram-indexed `search_text`. |
| `submission_answers` | One row per answered field; `value` (text) + `value_json` (arrays, numbers, file refs). Label/type snapshots keep history readable after fields change. |
| `google_accounts` | Encrypted OAuth tokens (AES-256-GCM, app-level key). RLS on, **no policies**, privileges revoked → service role only. |
| `google_sheet_connections` | One per form: account, spreadsheet, worksheet, status, ordered `column_map`, `headers_hash`. Token-free. |
| `google_sheet_sync_logs` | One per submission: status, attempts, row number, error, `next_attempt_at`, `locked_at`. |
| `audit_logs` | Append-only (trigger blocks UPDATE/DELETE). |
| `app_settings` | Singleton organisation/branding/email/security settings. |
| `rate_limits`, `submission_counters` | Internal: distributed rate limiter, atomic daily numbering. |

No per-form tables are ever created; flexible configuration lives in JSONB.

### Key functions
* `create_submission(...)` — SECURITY DEFINER, service-role only. In one transaction:
  checks the form is published/open, enforces limits, idempotency (`client_token`)
  and duplicate protection, allocates the submission number, inserts answers and
  a `pending` sync log when a sheet is connected.
* `save_form_fields(form, fields, expected_version)` — SECURITY INVOKER (RLS applies);
  atomic upsert + delete of builder fields with version conflict detection.
* `duplicate_form` — copies config/fields/logic/settings; never submissions,
  connections, tokens or logs.
* `claim_sync_jobs` — `FOR UPDATE SKIP LOCKED` job claiming; increments `attempt_count`.
* `queue_sheet_backfill`, `requeue_sheet_jobs` — retry/backfill helpers.
* `check_rate_limit` — atomic fixed-window counter.
* Analytics: `get_dashboard_stats`, `get_submission_timeseries`, `get_submissions_by_branch`,
  `get_submissions_by_form`, `get_sync_status_counts` (SECURITY INVOKER → RLS-scoped).

## 3. RLS summary

| Role | Can |
|---|---|
| anon | `SELECT` published `forms` and their `form_fields`. Nothing else. Cannot insert submissions directly (submissions go through the validated server endpoint). |
| inactive / staff | Same as anon (plus own profile). |
| admin | Manage forms, fields, private settings, submissions (archive), branches **within branch scope**; read token-free sheet connections & logs; append audit entries as self. |
| super_admin | Everything above for all branches + hard deletes, app settings, user roles. Cannot demote/deactivate themself. |

Privilege escalation is blocked by the `profiles_guard` trigger. `supabase/tests/rls.test.sql`
proves each rule (`npm run test:db`).

## 4. Form-builder data model

```ts
FormField {
  field_id: "patient_name"            // stable key (answers, logic, sheet columns)
  type: "short_text" | … | "section"  // 23 types, see types/forms.ts
  label, description, placeholder, required
  settings: { options, helpText, defaultValue, hidden, max, min, minLabel, maxLabel,
              maxFiles, maxSizeMb, accept, level, width, prefillParam }
  validation: { minLength, maxLength, min, max, pattern, patternMessage }
  logic: { action: "show"|"hide", match: "all"|"any",
           conditions: [{ fieldId, operator, value }] } | null
}
```

* `section` fields split the form into steps (progress bar).
* `lib/forms/logic.ts` evaluates visibility (cascading: a condition on a hidden
  field sees an empty value). `lib/forms/validation.ts` builds validation from the
  field config. **Both run in the browser and on the server**; the server discards
  values of fields hidden by logic and rejects unknown options.
* Builder: dnd-kit palette → sortable canvas, properties panel, logic editor,
  undo/redo (coalesced typing), debounced autosave (1 s) through `save_form_fields`
  with optimistic concurrency.

## 5. Google Sheets integration

### OAuth (per Google account, reused by many forms)
1. Admin clicks **Connect Google Sheet** on a form → `GET /api/google/oauth/start?formId=…`
   (admin + form access checked).
2. Server creates `state` + PKCE verifier, stores them in a signed, httpOnly,
   10-minute cookie, redirects to Google with scopes
   `openid email spreadsheets [drive.metadata.readonly]`, `access_type=offline`,
   `prompt=consent`.
3. `GET /api/google/oauth/callback` verifies state (constant-time), the admin session
   (same user), exchanges the code with the PKCE verifier, validates the ID token
   claims, encrypts access + refresh tokens and upserts `google_accounts`.
4. The form's connection is set to `pending_setup`; the admin picks
   **Create New Spreadsheet** (`Synergy Feedback - {Form Name}` / `Responses`) or
   **Select Existing Spreadsheet** (Drive search, or paste a link) and a worksheet.
5. Header row is written immediately. Optionally existing submissions are back-filled.

Tokens live in one row per Google account, so re-authorising once fixes every form
and Google's per-account refresh-token limit is never hit. Other admins can attach
an already-authorised account to a form without repeating OAuth.

### Sync & retry
```
submit ─▶ create_submission (tx: submission + answers + sync_log[pending])
       ─▶ HTTP 200 to patient
       └▶ after(): runSyncBatch([log]) ─▶ Sheets append ─▶ log synced (row #)
                                       └▶ failure ─▶ log failed + next_attempt_at
cron (daily on Hobby, or pg_cron every 5 min) / piggy-back after submissions / admin "Retry Sync"
       ─▶ claim_sync_jobs (SKIP LOCKED) ─▶ engine.syncJobs
```
* Backoff: 1 m, 5 m, 15 m, 1 h, 3 h, 6 h, 12 h; stops after 8 attempts.
* Permanent errors (deleted sheet, lost access) stop retrying and flag the
  connection; auth errors (revoked/expired) mark the account and its connections
  `reauth_required` and wait — re-consent re-queues them automatically.
* **Idempotency:** the Submission ID is always a sheet column. A job whose previous
  attempt may have reached Google (`attempt_count > 1`) or is being re-pointed to a
  new sheet reads that column first and records the existing row instead of
  appending. Concurrent workers can't claim the same job.
* **Dynamic columns:** `column_map` only grows. New fields append columns; removed
  fields keep their column (historical data is never touched); renamed labels
  update non-custom headers; custom headers (mapping UI) stick. Connecting to a
  worksheet that already has headers adopts them in place.
* Values are written with `valueInputOption=RAW`, so patient text is never
  evaluated as a formula.

## 6. Submission security pipeline (`/api/forms/[slug]/submit`)
1. Same-origin check (CSRF) → 2. distributed rate limit per hashed IP (per minute
and per hour, configurable) → 3. 1.5 MB streamed body cap → 4. Zod body schema →
5. honeypot + minimum fill time → 6. Turnstile (when enabled) → 7. full server-side
validation against the form definition → 8. upload tokens verified (HMAC, bound to
form + field) and files moved out of `pending/` → 9. `create_submission` →
10. response → 11. `after()`: Sheets sync, email, opportunistic retries.

Uploads: `/api/forms/[slug]/upload` checks size, MIME allow-list per field **and**
magic bytes, stores privately; admins receive 2-minute signed URLs via
`/api/admin/files` after an RLS check.

## 7. Project structure
```
app/
  admin/(auth)/…            login, forgot/reset password, auth actions
  admin/(console)/…         dashboard, forms, submissions, branches, analytics,
                            integrations, settings, audit-log (sidebar layout)
  admin/(builder)/…         full-screen form builder
  forms/[slug]/             public form
  api/…                     submit, upload, export, files, google oauth, cron
  auth/confirm/             Supabase email-link handler
components/ ui · admin · form-builder · form-fields · public-form · dashboard · google-sheets
lib/        supabase · auth · forms · google · security · env · audit · logger
services/   forms · submissions · google-sheets · email · analytics · settings
schemas/    Zod schemas for admin input
supabase/   migrations · seed.sql · tests
tests/      Vitest unit tests
proxy.ts    (Next.js 16 replacement for middleware.ts)
```
