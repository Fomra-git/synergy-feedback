-- =============================================================================
-- Synergy Feedback — user management & granular permissions
-- =============================================================================
-- Roles:
--   super_admin  everything, including organisation settings and hard deletes
--   admin        every feature (within their branch scope) + managing users
--   staff        only the permissions ticked on their profile, within their
--                branch scope
-- Branch scope: rows in profile_branches restrict a user to those branches;
-- no rows = all branches. Super admins are never scoped.
--
-- Safe to run more than once.
-- =============================================================================

alter table public.profiles
  add column if not exists permissions text[] not null default '{}';

-- Known permission keys (kept in sync with lib/auth/permissions.ts).
alter table public.profiles drop constraint if exists profiles_permissions_known;
alter table public.profiles add constraint profiles_permissions_known check (
  permissions <@ array[
    'forms.create', 'forms.edit', 'submissions.view', 'submissions.export',
    'submissions.manage', 'analytics.view', 'branches.manage', 'integrations.manage'
  ]::text[]
);

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
-- Any active user of the console (super admin, admin or staff).
create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.is_active from public.profiles p where p.id = (select auth.uid())),
    false)
$$;

-- Admins and super admins hold every permission; staff hold the ones listed.
create or replace function public.has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.role in ('admin', 'super_admin') or p_permission = any (p.permissions)
     from public.profiles p
     where p.id = (select auth.uid()) and p.is_active),
    false)
$$;

-- Branch access now applies to every active user, not just admins.
create or replace function public.has_branch_access(p_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_super_admin()
    or (
      public.is_member()
      and (
        not public.is_branch_scoped()
        or (p_branch_id is not null and exists (
          select 1 from public.profile_branches pb
          where pb.profile_id = (select auth.uid()) and pb.branch_id = p_branch_id
        ))
      )
    )
$$;

revoke execute on function public.is_member() from public, anon;
revoke execute on function public.has_permission(text) from public, anon;
grant execute on function public.is_member() to authenticated, service_role;
grant execute on function public.has_permission(text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Users may edit their own name, but never their own role, activation, email
-- or permissions (those go through the server with the service role).
-- -----------------------------------------------------------------------------
create or replace function public.guard_profile_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Service role / migrations (no JWT) may change anything.
  if (select auth.uid()) is null then
    return new;
  end if;
  if (new.role is distinct from old.role or new.is_active is distinct from old.is_active
      or new.email is distinct from old.email or new.permissions is distinct from old.permissions)
     and not public.is_super_admin() then
    raise exception 'insufficient_privilege: only a super admin can change roles, activation or permissions'
      using errcode = '42501';
  end if;
  -- A super admin cannot demote or deactivate themselves (prevents lock-out).
  if new.id = (select auth.uid()) and (new.role <> 'super_admin' or not new.is_active)
     and old.role = 'super_admin' then
    raise exception 'cannot demote or deactivate your own super admin account'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Policies: reads follow branch scope; writes also need the permission.
-- -----------------------------------------------------------------------------
-- branches
drop policy if exists "branches: unscoped admins create" on public.branches;
create policy "branches: unscoped admins create" on public.branches
  for insert to authenticated
  with check (public.is_super_admin()
    or (public.has_permission('branches.manage') and not public.is_branch_scoped()));

drop policy if exists "branches: admins update accessible" on public.branches;
create policy "branches: admins update accessible" on public.branches
  for update to authenticated
  using (public.has_branch_access(id) and public.has_permission('branches.manage'))
  with check (public.has_branch_access(id) and public.has_permission('branches.manage'));

-- forms
drop policy if exists "forms: admins create in accessible branch" on public.forms;
create policy "forms: admins create in accessible branch" on public.forms
  for insert to authenticated
  with check (public.has_branch_access(branch_id) and public.has_permission('forms.create'));

drop policy if exists "forms: admins update accessible" on public.forms;
create policy "forms: admins update accessible" on public.forms
  for update to authenticated
  using (public.has_branch_access(branch_id) and public.has_permission('forms.edit'))
  with check (public.has_branch_access(branch_id) and public.has_permission('forms.edit'));

-- form_fields (read for anyone who can see the form; write needs edit/create)
drop policy if exists "form_fields: admins manage accessible" on public.form_fields;
drop policy if exists "form_fields: members read accessible" on public.form_fields;
drop policy if exists "form_fields: editors write accessible" on public.form_fields;
create policy "form_fields: members read accessible" on public.form_fields
  for select to authenticated
  using (public.can_access_form(form_id));
create policy "form_fields: editors write accessible" on public.form_fields
  for all to authenticated
  using (public.can_access_form(form_id)
    and (public.has_permission('forms.edit') or public.has_permission('forms.create')))
  with check (public.can_access_form(form_id)
    and (public.has_permission('forms.edit') or public.has_permission('forms.create')));

-- form_settings
drop policy if exists "form_settings: admins manage accessible" on public.form_settings;
drop policy if exists "form_settings: members read accessible" on public.form_settings;
drop policy if exists "form_settings: editors write accessible" on public.form_settings;
create policy "form_settings: members read accessible" on public.form_settings
  for select to authenticated
  using (public.can_access_form(form_id));
create policy "form_settings: editors write accessible" on public.form_settings
  for all to authenticated
  using (public.can_access_form(form_id)
    and (public.has_permission('forms.edit') or public.has_permission('forms.create')))
  with check (public.can_access_form(form_id)
    and (public.has_permission('forms.edit') or public.has_permission('forms.create')));

-- submissions
drop policy if exists "form_submissions: admins read accessible" on public.form_submissions;
create policy "form_submissions: admins read accessible" on public.form_submissions
  for select to authenticated
  using (public.can_access_form(form_id) and public.has_permission('submissions.view'));

drop policy if exists "form_submissions: admins archive accessible" on public.form_submissions;
create policy "form_submissions: admins archive accessible" on public.form_submissions
  for update to authenticated
  using (public.can_access_form(form_id) and public.has_permission('submissions.manage'))
  with check (public.can_access_form(form_id) and public.has_permission('submissions.manage'));

drop policy if exists "submission_answers: admins read accessible" on public.submission_answers;
create policy "submission_answers: admins read accessible" on public.submission_answers
  for select to authenticated
  using (public.has_permission('submissions.view') and exists (
    select 1 from public.form_submissions s
    where s.id = submission_id and public.can_access_form(s.form_id)
  ));

-- audit log: any active user may append entries as themselves
drop policy if exists "audit_logs: admins append as self" on public.audit_logs;
create policy "audit_logs: admins append as self" on public.audit_logs
  for insert to authenticated
  with check (public.is_member() and user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- Dashboard form counts follow branch scope (published forms are otherwise
-- readable by everyone, which inflated counts for branch-limited users).
-- -----------------------------------------------------------------------------
create or replace function public.get_dashboard_stats(p_tz text default 'Asia/Kolkata')
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with bounds as (
    select
      (date_trunc('day', now() at time zone p_tz)) at time zone p_tz as today_start,
      (date_trunc('week', now() at time zone p_tz)) at time zone p_tz as week_start,
      (date_trunc('month', now() at time zone p_tz)) at time zone p_tz as month_start
  ),
  f as (
    select
      count(*) filter (where status <> 'archived') as total,
      count(*) filter (where status = 'published') as published,
      count(*) filter (where status = 'draft') as draft
    from public.forms
    -- published forms are publicly readable; count only the user's own branches
    where public.can_access_form(id)
  ),
  s as (
    select
      count(*) as total,
      count(*) filter (where submitted_at >= b.today_start) as today,
      count(*) filter (where submitted_at >= b.week_start) as week,
      count(*) filter (where submitted_at >= b.month_start) as month
    from public.form_submissions, bounds b
    where status = 'active'
  )
  select jsonb_build_object(
    'totalForms', f.total,
    'publishedForms', f.published,
    'draftForms', f.draft,
    'totalSubmissions', s.total,
    'submissionsToday', s.today,
    'submissionsThisWeek', s.week,
    'submissionsThisMonth', s.month,
    'totalBranches', (select count(*) from public.branches where archived_at is null),
    'activeBranches', (select count(*) from public.branches where archived_at is null and status = 'active'),
    'sheetConnections', (select count(*) from public.google_sheet_connections where status = 'connected' and enabled),
    'sheetsNeedingAttention', (select count(*) from public.google_sheet_connections where status in ('reauth_required', 'error')),
    'failedSyncs', (select count(*) from public.google_sheet_sync_logs where status = 'failed'),
    'pendingSyncs', (select count(*) from public.google_sheet_sync_logs where status in ('pending', 'processing'))
  )
  from f, s
$$;
