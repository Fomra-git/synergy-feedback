-- =============================================================================
-- Synergy Feedback — Row Level Security
-- =============================================================================
-- Public (anon):   read published forms + their fields. Nothing else.
--                  Submissions are created ONLY through the Next.js server
--                  (validated, rate limited, CAPTCHA-checked) using the
--                  service role — anon cannot insert directly.
-- Admin:           manage forms / branches / submissions within branch scope.
-- Super admin:     full access, including users, settings and hard deletes.
-- Google tokens:   google_accounts has RLS enabled and NO policies, and table
--                  privileges are revoked: only the service role can read it.
-- =============================================================================

alter table public.profiles enable row level security;
alter table public.branches enable row level security;
alter table public.profile_branches enable row level security;
alter table public.forms enable row level security;
alter table public.form_fields enable row level security;
alter table public.form_settings enable row level security;
alter table public.form_submissions enable row level security;
alter table public.submission_answers enable row level security;
alter table public.submission_counters enable row level security;
alter table public.google_accounts enable row level security;
alter table public.google_sheet_connections enable row level security;
alter table public.google_sheet_sync_logs enable row level security;
alter table public.audit_logs enable row level security;
alter table public.app_settings enable row level security;
alter table public.rate_limits enable row level security;

-- Defence in depth: strip table privileges that should never exist.
revoke all on public.google_accounts from anon, authenticated;
revoke all on public.rate_limits from anon, authenticated;
revoke all on public.submission_counters from anon, authenticated;
revoke all on public.form_submissions, public.submission_answers, public.form_settings,
  public.google_sheet_connections, public.google_sheet_sync_logs, public.audit_logs,
  public.app_settings, public.profiles, public.profile_branches, public.branches from anon;
revoke insert, update, delete on public.forms, public.form_fields from anon;

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
create policy "profiles: read own or admin reads all" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.is_admin());

create policy "profiles: update own or super admin" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or public.is_super_admin())
  with check (id = (select auth.uid()) or public.is_super_admin());
-- Role/activation changes are additionally guarded by trigger profiles_guard.

-- -----------------------------------------------------------------------------
-- profile_branches
-- -----------------------------------------------------------------------------
create policy "profile_branches: read own or admin" on public.profile_branches
  for select to authenticated
  using (profile_id = (select auth.uid()) or public.is_admin());

create policy "profile_branches: super admin manages" on public.profile_branches
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- -----------------------------------------------------------------------------
-- branches
-- -----------------------------------------------------------------------------
create policy "branches: admins read accessible" on public.branches
  for select to authenticated
  using (public.has_branch_access(id));

create policy "branches: unscoped admins create" on public.branches
  for insert to authenticated
  with check (public.is_super_admin() or (public.is_admin() and not public.is_branch_scoped()));

create policy "branches: admins update accessible" on public.branches
  for update to authenticated
  using (public.has_branch_access(id))
  with check (public.has_branch_access(id));

create policy "branches: super admin deletes" on public.branches
  for delete to authenticated
  using (public.is_super_admin());

-- -----------------------------------------------------------------------------
-- forms
-- -----------------------------------------------------------------------------
create policy "forms: public reads published" on public.forms
  for select to anon, authenticated
  using (status = 'published');

create policy "forms: admins read accessible" on public.forms
  for select to authenticated
  using (public.has_branch_access(branch_id));

create policy "forms: admins create in accessible branch" on public.forms
  for insert to authenticated
  with check (public.has_branch_access(branch_id));

create policy "forms: admins update accessible" on public.forms
  for update to authenticated
  using (public.has_branch_access(branch_id))
  with check (public.has_branch_access(branch_id));

create policy "forms: super admin deletes" on public.forms
  for delete to authenticated
  using (public.is_super_admin());

-- -----------------------------------------------------------------------------
-- form_fields
-- -----------------------------------------------------------------------------
create policy "form_fields: public reads fields of published forms" on public.form_fields
  for select to anon, authenticated
  using (exists (
    select 1 from public.forms f where f.id = form_id and f.status = 'published'
  ));

create policy "form_fields: admins manage accessible" on public.form_fields
  for all to authenticated
  using (public.can_access_form(form_id))
  with check (public.can_access_form(form_id));

-- -----------------------------------------------------------------------------
-- form_settings (private configuration — never public)
-- -----------------------------------------------------------------------------
create policy "form_settings: admins manage accessible" on public.form_settings
  for all to authenticated
  using (public.can_access_form(form_id))
  with check (public.can_access_form(form_id));

-- -----------------------------------------------------------------------------
-- form_submissions / submission_answers (admins only; inserts via server)
-- -----------------------------------------------------------------------------
create policy "form_submissions: admins read accessible" on public.form_submissions
  for select to authenticated
  using (public.can_access_form(form_id));

create policy "form_submissions: admins archive accessible" on public.form_submissions
  for update to authenticated
  using (public.can_access_form(form_id))
  with check (public.can_access_form(form_id));

create policy "form_submissions: super admin deletes" on public.form_submissions
  for delete to authenticated
  using (public.is_super_admin());

create policy "submission_answers: admins read accessible" on public.submission_answers
  for select to authenticated
  using (exists (
    select 1 from public.form_submissions s
    where s.id = submission_id and public.can_access_form(s.form_id)
  ));

-- -----------------------------------------------------------------------------
-- Google Sheets (connections & logs are token-free; read-only for admins,
-- all writes happen server-side with the service role after authorisation)
-- -----------------------------------------------------------------------------
create policy "google_sheet_connections: admins read accessible" on public.google_sheet_connections
  for select to authenticated
  using (public.can_access_form(form_id));

create policy "google_sheet_sync_logs: admins read accessible" on public.google_sheet_sync_logs
  for select to authenticated
  using (public.can_access_form(form_id));

revoke insert, update, delete on public.google_sheet_connections, public.google_sheet_sync_logs from authenticated;

-- -----------------------------------------------------------------------------
-- audit_logs (append-only; users can only write entries as themselves)
-- -----------------------------------------------------------------------------
create policy "audit_logs: admins read" on public.audit_logs
  for select to authenticated
  using (public.is_admin());

create policy "audit_logs: admins append as self" on public.audit_logs
  for insert to authenticated
  with check (public.is_admin() and user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- app_settings
-- -----------------------------------------------------------------------------
create policy "app_settings: admins read" on public.app_settings
  for select to authenticated
  using (public.is_admin());

create policy "app_settings: super admin updates" on public.app_settings
  for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());
