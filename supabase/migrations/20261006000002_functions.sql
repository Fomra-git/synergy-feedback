-- =============================================================================
-- Synergy Feedback — functions & triggers
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Authorisation helpers (SECURITY DEFINER so policies can call them without
-- recursive RLS evaluation on profiles).
-- -----------------------------------------------------------------------------
create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p
  where p.id = (select auth.uid()) and p.is_active
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.role in ('admin', 'super_admin') from public.profiles p
     where p.id = (select auth.uid()) and p.is_active),
    false)
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.role = 'super_admin' from public.profiles p
     where p.id = (select auth.uid()) and p.is_active),
    false)
$$;

-- True when the current user is restricted to specific branches.
create or replace function public.is_branch_scoped()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profile_branches pb where pb.profile_id = (select auth.uid())
  )
$$;

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
      public.is_admin()
      and (
        not public.is_branch_scoped()
        or (p_branch_id is not null and exists (
          select 1 from public.profile_branches pb
          where pb.profile_id = (select auth.uid()) and pb.branch_id = p_branch_id
        ))
      )
    )
$$;

create or replace function public.can_access_form(p_form_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select public.has_branch_access(f.branch_id) from public.forms f where f.id = p_form_id),
    false)
$$;

-- -----------------------------------------------------------------------------
-- Profiles: auto-create on sign-up, prevent privilege escalation
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

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
      or new.email is distinct from old.email)
     and not public.is_super_admin() then
    raise exception 'insufficient_privilege: only a super admin can change roles or activation'
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

create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_update();

-- -----------------------------------------------------------------------------
-- Form fields: atomic save from the builder (SECURITY INVOKER → RLS applies)
-- -----------------------------------------------------------------------------
create or replace function public.save_form_fields(
  p_form_id uuid,
  p_fields jsonb,
  p_expected_version integer default null
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_version integer;
  v_field jsonb;
  v_position integer := 0;
  v_keep text[] := '{}';
begin
  select version into v_version from public.forms where id = p_form_id for update;
  if not found then
    raise exception 'form_not_found' using errcode = 'P0002';
  end if;
  if p_expected_version is not null and p_expected_version <> v_version then
    raise exception 'version_conflict' using errcode = '40001';
  end if;
  if jsonb_typeof(p_fields) <> 'array' then
    raise exception 'fields must be an array';
  end if;

  for v_field in select value from jsonb_array_elements(p_fields)
  loop
    v_keep := array_append(v_keep, v_field ->> 'field_id');
    insert into public.form_fields as ff (
      form_id, field_id, type, label, description, placeholder, required,
      position, settings, validation, logic
    ) values (
      p_form_id,
      v_field ->> 'field_id',
      v_field ->> 'type',
      coalesce(v_field ->> 'label', ''),
      nullif(v_field ->> 'description', ''),
      nullif(v_field ->> 'placeholder', ''),
      coalesce((v_field ->> 'required')::boolean, false),
      v_position,
      coalesce(v_field -> 'settings', '{}'::jsonb),
      coalesce(v_field -> 'validation', '{}'::jsonb),
      case when jsonb_typeof(v_field -> 'logic') = 'object' then v_field -> 'logic' else null end
    )
    on conflict (form_id, field_id) do update set
      type = excluded.type,
      label = excluded.label,
      description = excluded.description,
      placeholder = excluded.placeholder,
      required = excluded.required,
      position = excluded.position,
      settings = excluded.settings,
      validation = excluded.validation,
      logic = excluded.logic;
    v_position := v_position + 1;
  end loop;

  delete from public.form_fields
  where form_id = p_form_id and not (field_id = any (v_keep));

  update public.forms set version = version + 1 where id = p_form_id
  returning version into v_version;

  return v_version;
end;
$$;

-- -----------------------------------------------------------------------------
-- Form duplication. Copies configuration, fields, logic, appearance and
-- notification settings. NEVER copies submissions, Google Sheet connections,
-- OAuth credentials or sync logs.
-- -----------------------------------------------------------------------------
create or replace function public.duplicate_form(
  p_form_id uuid,
  p_new_name text,
  p_new_slug text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_new_id uuid;
begin
  insert into public.forms (branch_id, name, slug, description, status, settings, created_by)
  select branch_id, p_new_name, p_new_slug, description, 'draft', settings, (select auth.uid())
  from public.forms where id = p_form_id
  returning id into v_new_id;

  if v_new_id is null then
    raise exception 'form_not_found' using errcode = 'P0002';
  end if;

  insert into public.form_fields (form_id, field_id, type, label, description, placeholder,
    required, position, settings, validation, logic)
  select v_new_id, field_id, type, label, description, placeholder,
    required, position, settings, validation, logic
  from public.form_fields where form_id = p_form_id;

  insert into public.form_settings (form_id, submission, notifications, google_sheets)
  select v_new_id, submission, notifications, google_sheets
  from public.form_settings where form_id = p_form_id
  on conflict (form_id) do nothing;

  insert into public.form_settings (form_id) values (v_new_id) on conflict (form_id) do nothing;

  return v_new_id;
end;
$$;

-- Every form gets a private settings row.
create or replace function public.handle_new_form()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.form_settings (form_id) values (new.id) on conflict (form_id) do nothing;
  return new;
end;
$$;

create trigger on_form_created
  after insert on public.forms
  for each row execute function public.handle_new_form();

-- Keep published_at / archived_at consistent with status.
create or replace function public.handle_form_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    new.published_at = now();
  end if;
  if new.status = 'archived' and (tg_op = 'INSERT' or old.status is distinct from 'archived') then
    new.archived_at = now();
  elsif new.status <> 'archived' then
    new.archived_at = null;
  end if;
  return new;
end;
$$;

create trigger forms_status before insert or update of status on public.forms
  for each row execute function public.handle_form_status();

-- -----------------------------------------------------------------------------
-- Submission numbering: SW-YYYYMMDD-000123 (atomic per-day counter)
-- -----------------------------------------------------------------------------
create or replace function public.next_submission_number(p_tz text default 'Asia/Kolkata', p_prefix text default 'SW')
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date := (now() at time zone p_tz)::date;
  v_value integer;
begin
  insert into public.submission_counters as sc (day, last_value) values (v_day, 1)
  on conflict (day) do update set last_value = sc.last_value + 1
  returning last_value into v_value;
  return p_prefix || '-' || to_char(v_day, 'YYYYMMDD') || '-' || lpad(v_value::text, 6, '0');
end;
$$;

-- -----------------------------------------------------------------------------
-- Public submission creation. Called ONLY by the Next.js server (service role)
-- after rate limiting, CAPTCHA and full server-side validation. Saves the
-- submission, its answers and (if a sheet is connected) a pending sync record
-- in ONE transaction, so a Google outage can never lose a submission.
-- -----------------------------------------------------------------------------
create or replace function public.create_submission(
  p_form_id uuid,
  p_answers jsonb,
  p_client_token text default null,
  p_ip_hash text default null,
  p_user_agent text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_dedupe_hash text default null,
  p_search_text text default '',
  p_tz text default 'Asia/Kolkata'
)
returns table (submission_id uuid, submission_number text, sync_log_id uuid, is_duplicate boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_form public.forms%rowtype;
  v_settings public.form_settings%rowtype;
  v_conn public.google_sheet_connections%rowtype;
  v_existing record;
  v_max integer;
  v_count bigint;
  v_id uuid;
  v_number text;
  v_log uuid;
begin
  select * into v_form from public.forms where id = p_form_id and status = 'published';
  if not found then
    raise exception 'form_not_available' using errcode = 'P0002';
  end if;

  select * into v_settings from public.form_settings where form_id = p_form_id;

  if coalesce((v_settings.submission ->> 'allowSubmissions')::boolean, true) is false then
    raise exception 'submissions_closed' using errcode = 'P0001';
  end if;

  if (v_settings.submission ->> 'closeAt') is not null
     and (v_settings.submission ->> 'closeAt')::timestamptz <= now() then
    raise exception 'submissions_closed' using errcode = 'P0001';
  end if;

  -- Idempotency: same client token → return the original submission.
  if p_client_token is not null then
    select s.id, s.submission_number into v_existing
    from public.form_submissions s
    where s.form_id = p_form_id and s.client_token = p_client_token;
    if found then
      return query select v_existing.id, v_existing.submission_number,
        (select l.id from public.google_sheet_sync_logs l where l.submission_id = v_existing.id),
        true;
      return;
    end if;
  end if;

  -- Optional content-duplicate protection (same answers, same client, 10 min).
  if p_dedupe_hash is not null
     and coalesce((v_settings.submission ->> 'duplicateProtection')::boolean, true) then
    select s.id, s.submission_number into v_existing
    from public.form_submissions s
    where s.form_id = p_form_id
      and s.dedupe_hash = p_dedupe_hash
      and s.submitted_at > now() - interval '10 minutes'
    order by s.submitted_at desc
    limit 1;
    if found then
      return query select v_existing.id, v_existing.submission_number,
        (select l.id from public.google_sheet_sync_logs l where l.submission_id = v_existing.id),
        true;
      return;
    end if;
  end if;

  v_max := nullif(v_settings.submission ->> 'maxSubmissions', '')::integer;
  if v_max is not null and v_max > 0 then
    -- Serialise submissions for limited forms so the cap is exact.
    perform 1 from public.forms where id = p_form_id for update;
    select count(*) into v_count from public.form_submissions s
    where s.form_id = p_form_id and s.status = 'active';
    if v_count >= v_max then
      raise exception 'submission_limit_reached' using errcode = 'P0001';
    end if;
  end if;

  v_number := public.next_submission_number(p_tz);

  insert into public.form_submissions (form_id, branch_id, submission_number, ip_hash,
    user_agent, metadata, client_token, dedupe_hash, search_text)
  values (p_form_id, v_form.branch_id, v_number, p_ip_hash, left(p_user_agent, 500),
    coalesce(p_metadata, '{}'::jsonb), p_client_token, p_dedupe_hash,
    left(lower(v_number || ' ' || coalesce(p_search_text, '')), 20000))
  returning id into v_id;

  insert into public.submission_answers (submission_id, field_id, field_type, field_label, value, value_json)
  select v_id, a ->> 'field_id', a ->> 'field_type', coalesce(a ->> 'field_label', ''),
    a ->> 'value', a -> 'value_json'
  from jsonb_array_elements(p_answers) a;

  select * into v_conn from public.google_sheet_connections c
  where c.form_id = p_form_id and c.enabled;

  if found and v_conn.status in ('connected', 'reauth_required', 'error') and v_conn.spreadsheet_id is not null then
    insert into public.google_sheet_sync_logs (submission_id, form_id, connection_id,
      spreadsheet_id, worksheet_name, status, next_attempt_at)
    values (v_id, p_form_id, v_conn.id, v_conn.spreadsheet_id, v_conn.worksheet_name,
      'pending', case when v_conn.status = 'connected' then now() else null end)
    returning id into v_log;
  end if;

  return query select v_id, v_number, v_log, false;
end;
$$;

-- -----------------------------------------------------------------------------
-- Sync job claiming. Uses FOR UPDATE SKIP LOCKED so concurrent workers (cron +
-- post-submission) never process the same job twice. attempt_count is
-- incremented at claim time: attempt_count > 1 means an earlier attempt may
-- have reached Google, so the worker checks the sheet before appending.
-- -----------------------------------------------------------------------------
create or replace function public.claim_sync_jobs(p_limit integer default 25, p_ids uuid[] default null)
returns setof public.google_sheet_sync_logs
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  update public.google_sheet_sync_logs l
  set status = 'processing', locked_at = now(), attempted_at = now(),
      attempt_count = l.attempt_count + 1
  where l.id in (
    select j.id from public.google_sheet_sync_logs j
    where (p_ids is null or j.id = any (p_ids))
      and (
        (j.status in ('pending', 'failed') and j.next_attempt_at is not null and j.next_attempt_at <= now())
        or (j.status = 'processing' and j.locked_at < now() - interval '10 minutes')
      )
    order by j.next_attempt_at nulls last
    limit p_limit
    for update skip locked
  )
  returning l.*;
end;
$$;

-- -----------------------------------------------------------------------------
-- Rate limiting (fixed window, atomic)
-- -----------------------------------------------------------------------------
create or replace function public.check_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_count integer;
begin
  insert into public.rate_limits as r (key, window_start, count) values (p_key, v_window, 1)
  on conflict (key, window_start) do update set count = r.count + 1
  returning count into v_count;
  return v_count <= p_limit;
end;
$$;

create or replace function public.purge_rate_limits()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.rate_limits where window_start < now() - interval '1 day';
$$;

-- -----------------------------------------------------------------------------
-- Analytics (SECURITY INVOKER: results respect RLS / branch scoping)
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

create or replace function public.get_submission_timeseries(
  p_days integer default 30,
  p_tz text default 'Asia/Kolkata',
  p_form_id uuid default null,
  p_branch_id uuid default null
)
returns table (day date, total bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with days as (
    select generate_series(
      (now() at time zone p_tz)::date - (greatest(p_days, 1) - 1),
      (now() at time zone p_tz)::date,
      interval '1 day'
    )::date as day
  ),
  counts as (
    select (s.submitted_at at time zone p_tz)::date as day, count(*) as total
    from public.form_submissions s
    where s.status = 'active'
      and s.submitted_at >= ((now() at time zone p_tz)::date - (greatest(p_days, 1) - 1))::timestamp at time zone p_tz
      and (p_form_id is null or s.form_id = p_form_id)
      and (p_branch_id is null or s.branch_id = p_branch_id)
    group by 1
  )
  select d.day, coalesce(c.total, 0) from days d left join counts c on c.day = d.day order by d.day
$$;

create or replace function public.get_submissions_by_branch(p_days integer default 30)
returns table (branch_id uuid, branch_name text, total bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select s.branch_id, coalesce(b.name, 'Unassigned'), count(*)
  from public.form_submissions s
  left join public.branches b on b.id = s.branch_id
  where s.status = 'active' and s.submitted_at >= now() - make_interval(days => greatest(p_days, 1))
  group by s.branch_id, b.name
  order by 3 desc
$$;

create or replace function public.get_submissions_by_form(p_days integer default 30)
returns table (form_id uuid, form_name text, total bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select s.form_id, f.name, count(*)
  from public.form_submissions s
  join public.forms f on f.id = s.form_id
  where s.status = 'active' and s.submitted_at >= now() - make_interval(days => greatest(p_days, 1))
  group by s.form_id, f.name
  order by 3 desc
  limit 20
$$;

create or replace function public.get_sync_status_counts()
returns table (status public.sync_status, total bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select l.status, count(*) from public.google_sheet_sync_logs l group by l.status
$$;

create or replace function public.get_form_response_counts(p_form_ids uuid[])
returns table (form_id uuid, total bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select s.form_id, count(*) from public.form_submissions s
  where s.form_id = any (p_form_ids) and s.status = 'active'
  group by s.form_id
$$;

create or replace function public.get_branch_stats(p_branch_ids uuid[])
returns table (branch_id uuid, form_count bigint, submission_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select b.id,
    (select count(*) from public.forms f where f.branch_id = b.id and f.status <> 'archived'),
    (select count(*) from public.form_submissions s where s.branch_id = b.id and s.status = 'active')
  from public.branches b where b.id = any (p_branch_ids)
$$;

-- Safe, token-free listing of connected Google accounts for admins.
create or replace function public.list_google_accounts()
returns table (id uuid, email text, status public.google_account_status, scopes text[],
  created_at timestamptz, updated_at timestamptz, last_error text, connection_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.email, a.status, a.scopes, a.created_at, a.updated_at, a.last_error,
    (select count(*) from public.google_sheet_connections c
     where c.google_account_id = a.id and c.status <> 'disconnected')
  from public.google_accounts a
  where public.is_admin()
  order by a.created_at
$$;

-- -----------------------------------------------------------------------------
-- Function privileges: internal functions are service-role only.
-- -----------------------------------------------------------------------------
revoke execute on function public.create_submission(uuid, jsonb, text, text, text, jsonb, text, text, text) from public, anon, authenticated;
revoke execute on function public.claim_sync_jobs(integer, uuid[]) from public, anon, authenticated;
revoke execute on function public.check_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke execute on function public.purge_rate_limits() from public, anon, authenticated;
revoke execute on function public.next_submission_number(text, text) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

grant execute on function public.create_submission(uuid, jsonb, text, text, text, jsonb, text, text, text) to service_role;
grant execute on function public.claim_sync_jobs(integer, uuid[]) to service_role;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;
grant execute on function public.purge_rate_limits() to service_role;
grant execute on function public.next_submission_number(text, text) to service_role;

revoke execute on function public.save_form_fields(uuid, jsonb, integer) from public, anon;
revoke execute on function public.duplicate_form(uuid, text, text) from public, anon;
revoke execute on function public.get_dashboard_stats(text) from public, anon;
revoke execute on function public.get_submission_timeseries(integer, text, uuid, uuid) from public, anon;
revoke execute on function public.get_submissions_by_branch(integer) from public, anon;
revoke execute on function public.get_submissions_by_form(integer) from public, anon;
revoke execute on function public.get_sync_status_counts() from public, anon;
revoke execute on function public.get_form_response_counts(uuid[]) from public, anon;
revoke execute on function public.get_branch_stats(uuid[]) from public, anon;
revoke execute on function public.list_google_accounts() from public, anon;

grant execute on function public.save_form_fields(uuid, jsonb, integer) to authenticated, service_role;
grant execute on function public.duplicate_form(uuid, text, text) to authenticated, service_role;
grant execute on function public.get_dashboard_stats(text) to authenticated, service_role;
grant execute on function public.get_submission_timeseries(integer, text, uuid, uuid) to authenticated, service_role;
grant execute on function public.get_submissions_by_branch(integer) to authenticated, service_role;
grant execute on function public.get_submissions_by_form(integer) to authenticated, service_role;
grant execute on function public.get_sync_status_counts() to authenticated, service_role;
grant execute on function public.get_form_response_counts(uuid[]) to authenticated, service_role;
grant execute on function public.get_branch_stats(uuid[]) to authenticated, service_role;
grant execute on function public.list_google_accounts() to authenticated, service_role;
