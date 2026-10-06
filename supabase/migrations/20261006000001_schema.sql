-- =============================================================================
-- Synergy Feedback — core schema
-- =============================================================================
-- Supabase is the single source of truth. Google Sheets is an external,
-- eventually-consistent sync destination tracked by google_sheet_sync_logs.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type public.user_role as enum ('super_admin', 'admin', 'staff');
create type public.branch_status as enum ('active', 'inactive');
create type public.form_status as enum ('draft', 'published', 'archived');
create type public.submission_status as enum ('active', 'archived');
create type public.google_account_status as enum ('connected', 'reauth_required', 'revoked');
create type public.sheet_connection_status as enum ('pending_setup', 'connected', 'reauth_required', 'error', 'disconnected');
create type public.sync_status as enum ('pending', 'processing', 'synced', 'failed', 'skipped');

-- -----------------------------------------------------------------------------
-- Generic updated_at trigger
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  role public.user_role not null default 'staff',
  -- New accounts are inactive until a super admin activates them.
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Branches
-- -----------------------------------------------------------------------------
create table public.branches (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  code text not null check (code ~ '^[A-Z0-9][A-Z0-9_-]{1,19}$'),
  address text,
  phone text,
  email text,
  manager_name text,
  status public.branch_status not null default 'active',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create unique index branches_code_key on public.branches (upper(code));
create index branches_status_idx on public.branches (status);

create trigger branches_updated_at before update on public.branches
  for each row execute function public.set_updated_at();

-- Branch assignments. An admin with NO assignments is organisation-wide; an
-- admin/staff member with assignments is scoped to those branches. This is the
-- foundation for future branch-specific staff permissions.
create table public.profile_branches (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  branch_id uuid not null references public.branches (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, branch_id)
);

create index profile_branches_branch_idx on public.profile_branches (branch_id);

-- -----------------------------------------------------------------------------
-- Forms
-- -----------------------------------------------------------------------------
-- forms.settings holds PUBLIC-SAFE configuration (appearance, behaviour, SEO)
-- that the public renderer needs. Private configuration (notification
-- recipients, submission limits, sheet metadata options) lives in form_settings.
create table public.forms (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.branches (id) on delete set null,
  name text not null check (char_length(name) between 2 and 150),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 2 and 80),
  description text check (description is null or char_length(description) <= 2000),
  status public.form_status not null default 'draft',
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  version integer not null default 1,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  archived_at timestamptz
);

create unique index forms_slug_key on public.forms (slug);
create index forms_branch_id_idx on public.forms (branch_id);
create index forms_status_idx on public.forms (status);
create index forms_updated_at_idx on public.forms (updated_at desc);

create trigger forms_updated_at before update on public.forms
  for each row execute function public.set_updated_at();

create table public.form_fields (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.forms (id) on delete cascade,
  -- Stable, human-readable key used in answers, logic and sheet mapping.
  field_id text not null check (field_id ~ '^[a-z][a-z0-9_]{0,63}$'),
  type text not null check (type in (
    'short_text', 'long_text', 'email', 'phone', 'number', 'url',
    'dropdown', 'radio', 'checkbox', 'multi_select',
    'date', 'time', 'datetime', 'rating', 'star_rating', 'yes_no', 'linear_scale',
    'file_upload', 'signature',
    'heading', 'paragraph', 'divider', 'section'
  )),
  label text not null default '' check (char_length(label) <= 500),
  description text check (description is null or char_length(description) <= 5000),
  placeholder text check (placeholder is null or char_length(placeholder) <= 300),
  required boolean not null default false,
  position integer not null default 0,
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  validation jsonb not null default '{}'::jsonb check (jsonb_typeof(validation) = 'object'),
  logic jsonb check (logic is null or jsonb_typeof(logic) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (form_id, field_id)
);

create index form_fields_form_id_idx on public.form_fields (form_id, position);

create trigger form_fields_updated_at before update on public.form_fields
  for each row execute function public.set_updated_at();

create table public.form_settings (
  form_id uuid primary key references public.forms (id) on delete cascade,
  submission jsonb not null default '{"allowSubmissions": true, "duplicateProtection": true}'::jsonb,
  notifications jsonb not null default '{"enabled": true, "recipients": [], "includeAnswers": false}'::jsonb,
  google_sheets jsonb not null default '{"includeFormName": true, "includeBranch": true, "includeUserAgent": false, "includeIpHash": false}'::jsonb,
  updated_at timestamptz not null default now()
);

create trigger form_settings_updated_at before update on public.form_settings
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Submissions
-- -----------------------------------------------------------------------------
create table public.submission_counters (
  day date primary key,
  last_value integer not null default 0
);

create table public.form_submissions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.forms (id) on delete cascade,
  branch_id uuid references public.branches (id) on delete set null,
  -- Public identifier, e.g. SW-20261006-000123. Internal UUIDs are never shown publicly.
  submission_number text not null,
  status public.submission_status not null default 'active',
  submitted_at timestamptz not null default now(),
  ip_hash text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  -- Client-generated idempotency key: protects against double clicks/retries.
  client_token text,
  -- Hash of normalised answers used for optional content-duplicate protection.
  dedupe_hash text,
  -- Lower-cased concatenation of answers for admin search (trigram indexed).
  search_text text not null default '',
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index form_submissions_number_key on public.form_submissions (submission_number);
create unique index form_submissions_client_token_key on public.form_submissions (form_id, client_token) where client_token is not null;
create index form_submissions_form_id_idx on public.form_submissions (form_id, submitted_at desc);
create index form_submissions_branch_id_idx on public.form_submissions (branch_id, submitted_at desc);
create index form_submissions_submitted_at_idx on public.form_submissions (submitted_at desc);
create index form_submissions_status_idx on public.form_submissions (status);
create index form_submissions_dedupe_idx on public.form_submissions (form_id, dedupe_hash, submitted_at desc) where dedupe_hash is not null;
create index form_submissions_search_trgm_idx on public.form_submissions using gin (search_text extensions.gin_trgm_ops);

create table public.submission_answers (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.form_submissions (id) on delete cascade,
  field_id text not null,
  -- Snapshots so history stays readable after fields are renamed/removed.
  field_type text not null,
  field_label text not null default '',
  value text,
  value_json jsonb,
  created_at timestamptz not null default now()
);

create index submission_answers_submission_id_idx on public.submission_answers (submission_id);

-- -----------------------------------------------------------------------------
-- Google Sheets integration
-- -----------------------------------------------------------------------------
-- OAuth tokens are stored once per Google account (AES-256-GCM encrypted by
-- the application before insert) and shared by every form connection that uses
-- that account. This avoids Google's per-account refresh-token limit and makes
-- re-authorisation fix every affected form at once.
-- THIS TABLE IS NEVER READABLE THROUGH THE PUBLIC API (no RLS policies).
create table public.google_accounts (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  google_user_id text,
  scopes text[] not null default '{}',
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  status public.google_account_status not null default 'connected',
  last_error text,
  connected_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index google_accounts_email_key on public.google_accounts (lower(email));

create trigger google_accounts_updated_at before update on public.google_accounts
  for each row execute function public.set_updated_at();

create table public.google_sheet_connections (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.forms (id) on delete cascade,
  google_account_id uuid references public.google_accounts (id) on delete set null,
  google_account_email text,
  spreadsheet_id text,
  spreadsheet_name text,
  spreadsheet_url text,
  worksheet_id bigint,
  worksheet_name text,
  status public.sheet_connection_status not null default 'pending_setup',
  enabled boolean not null default true,
  -- Ordered column definitions: [{"key": "meta:submission_id" | "field:<field_id>", "header": "..."}]
  -- Columns are only ever appended; removed fields keep their historical column.
  column_map jsonb not null default '[]'::jsonb check (jsonb_typeof(column_map) = 'array'),
  headers_hash text,
  last_sync_at timestamptz,
  last_error text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  connected_at timestamptz,
  disconnected_at timestamptz
);

create unique index google_sheet_connections_form_id_key on public.google_sheet_connections (form_id);
create index google_sheet_connections_account_idx on public.google_sheet_connections (google_account_id);
create index google_sheet_connections_status_idx on public.google_sheet_connections (status);

create trigger google_sheet_connections_updated_at before update on public.google_sheet_connections
  for each row execute function public.set_updated_at();

create table public.google_sheet_sync_logs (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.form_submissions (id) on delete cascade,
  form_id uuid not null references public.forms (id) on delete cascade,
  connection_id uuid references public.google_sheet_connections (id) on delete set null,
  spreadsheet_id text,
  worksheet_name text,
  status public.sync_status not null default 'pending',
  attempt_count integer not null default 0,
  google_row_number integer,
  error_message text,
  -- 'auth' errors wait for re-authorisation instead of retrying automatically.
  error_kind text,
  next_attempt_at timestamptz default now(),
  locked_at timestamptz,
  attempted_at timestamptz,
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One sync record per submission: the idempotency anchor for Sheets appends.
create unique index google_sheet_sync_logs_submission_key on public.google_sheet_sync_logs (submission_id);
create index google_sheet_sync_logs_status_idx on public.google_sheet_sync_logs (status, next_attempt_at);
create index google_sheet_sync_logs_form_idx on public.google_sheet_sync_logs (form_id, status);
create index google_sheet_sync_logs_connection_idx on public.google_sheet_sync_logs (connection_id);

create trigger google_sheet_sync_logs_updated_at before update on public.google_sheet_sync_logs
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Audit log (append-only)
-- -----------------------------------------------------------------------------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_created_at_idx on public.audit_logs (created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);

create or replace function public.prevent_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_logs is append-only';
end;
$$;

create trigger audit_logs_immutable before update or delete on public.audit_logs
  for each row execute function public.prevent_audit_mutation();

-- -----------------------------------------------------------------------------
-- Organisation settings (singleton row)
-- -----------------------------------------------------------------------------
create table public.app_settings (
  id smallint primary key default 1 check (id = 1),
  organization jsonb not null default '{"name": "Synergy Wellness", "email": "", "website": "", "logoUrl": ""}'::jsonb,
  branding jsonb not null default '{"primaryColor": "#0f766e", "secondaryColor": "#f59e0b", "logoUrl": ""}'::jsonb,
  email jsonb not null default '{"senderName": "Synergy Feedback", "senderEmail": "", "defaultRecipients": []}'::jsonb,
  security jsonb not null default '{"captchaEnabled": false, "submissionRateLimitPerMinute": 10, "submissionRateLimitPerHour": 60}'::jsonb,
  timezone text not null default 'Asia/Kolkata',
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (id) values (1) on conflict do nothing;

create trigger app_settings_updated_at before update on public.app_settings
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Distributed rate limiting (works across serverless instances)
-- -----------------------------------------------------------------------------
create table public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (key, window_start)
);

create index rate_limits_window_idx on public.rate_limits (window_start);
