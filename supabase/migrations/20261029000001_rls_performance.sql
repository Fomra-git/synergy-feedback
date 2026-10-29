-- =============================================================================
-- Synergy Feedback — faster Row Level Security on submissions
-- =============================================================================
-- The submission policies called can_access_form() and has_permission() for
-- every row, and each call re-read the user's profile, branch scope and the
-- form. Reports and dashboard counts over thousands of submissions spent
-- seconds on that. These policies decide exactly the same thing, but work out
-- the user's accessible forms and permission once per query: a function
-- wrapped in (select ...) runs once, as an InitPlan, instead of per row.
--
-- Who can see or change what is unchanged. Safe to run more than once.
-- =============================================================================

-- Ids of every form the current user may access (same rule as can_access_form).
create or replace function public.accessible_form_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(f.id), '{}'::uuid[])
  from public.forms f
  where public.has_branch_access(f.branch_id)
$$;

revoke execute on function public.accessible_form_ids() from public, anon;
grant execute on function public.accessible_form_ids() to authenticated, service_role;

-- submissions
drop policy if exists "form_submissions: admins read accessible" on public.form_submissions;
create policy "form_submissions: admins read accessible" on public.form_submissions
  for select to authenticated
  using (
    (select public.has_permission('submissions.view'))
    and form_id = any ((select public.accessible_form_ids())::uuid[])
  );

drop policy if exists "form_submissions: admins archive accessible" on public.form_submissions;
create policy "form_submissions: admins archive accessible" on public.form_submissions
  for update to authenticated
  using (
    (select public.has_permission('submissions.manage'))
    and form_id = any ((select public.accessible_form_ids())::uuid[])
  )
  with check (
    (select public.has_permission('submissions.manage'))
    and form_id = any ((select public.accessible_form_ids())::uuid[])
  );

drop policy if exists "submission_answers: admins read accessible" on public.submission_answers;
create policy "submission_answers: admins read accessible" on public.submission_answers
  for select to authenticated
  using (
    (select public.has_permission('submissions.view'))
    and exists (
      select 1 from public.form_submissions s
      where s.id = submission_id and s.form_id = any ((select public.accessible_form_ids())::uuid[])
    )
  );

-- Google Sheets status (read-only for members)
drop policy if exists "google_sheet_connections: admins read accessible" on public.google_sheet_connections;
create policy "google_sheet_connections: admins read accessible" on public.google_sheet_connections
  for select to authenticated
  using (form_id = any ((select public.accessible_form_ids())::uuid[]));

drop policy if exists "google_sheet_sync_logs: admins read accessible" on public.google_sheet_sync_logs;
create policy "google_sheet_sync_logs: admins read accessible" on public.google_sheet_sync_logs
  for select to authenticated
  using (form_id = any ((select public.accessible_form_ids())::uuid[]));

-- Rating answers are looked up by field; index the join keys.
create index if not exists submission_answers_field_idx on public.submission_answers (field_id, submission_id);

-- -----------------------------------------------------------------------------
-- Rating reports: same results, faster plan. Pick the rating questions and
-- the period's submissions first, then join each answer to its submission by
-- id (the planner otherwise matched answers to submissions by form, comparing
-- millions of rows once there were a few thousand submissions).
-- -----------------------------------------------------------------------------
create or replace function public.get_rating_report(
  p_from timestamptz,
  p_to timestamptz,
  p_branch_id uuid default null
)
returns table (
  branch_id uuid,
  branch_name text,
  question_key text,
  question text,
  score numeric,
  max_score numeric,
  responses bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with rq as materialized (
    -- rating questions; forms grouped under "Others" are not branch feedback
    select ff.form_id, ff.field_id, public.rating_question_max(ff.settings -> 'options') as max_score
    from public.form_fields ff
    join public.forms f on f.id = ff.form_id and f.other_name is null
    where ff.type = 'radio' and public.rating_question_max(ff.settings -> 'options') is not null
  ),
  sub as materialized (
    select s.id, s.form_id, s.branch_id
    from public.form_submissions s
    where s.status = 'active'
      and s.submitted_at >= p_from
      and s.submitted_at < p_to
      and (p_branch_id is null or s.branch_id = p_branch_id)
      and s.form_id in (select rq.form_id from rq)
  )
  select
    sub.branch_id,
    coalesce(b.name, 'No branch') as branch_name,
    lower(btrim(a.field_label)) as question_key,
    min(btrim(a.field_label)) as question,
    substring(a.value from '^\s*(\d+(?:\.\d+)?)')::numeric as score,
    max(rq.max_score) as max_score,
    count(*) as responses
  from sub
  join public.submission_answers a on a.submission_id = sub.id
  join rq on rq.form_id = sub.form_id and rq.field_id = a.field_id
  left join public.branches b on b.id = sub.branch_id
  where a.value ~ '^\s*\d'
  group by sub.branch_id, b.name, lower(btrim(a.field_label)), substring(a.value from '^\s*(\d+(?:\.\d+)?)')::numeric
$$;

-- Distinct customers (submissions) that answered at least one rating question.
create or replace function public.get_rating_customers(
  p_from timestamptz,
  p_to timestamptz,
  p_branch_id uuid default null
)
returns table (branch_id uuid, customers bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with rq as materialized (
    select ff.form_id, ff.field_id
    from public.form_fields ff
    join public.forms f on f.id = ff.form_id and f.other_name is null
    where ff.type = 'radio' and public.rating_question_max(ff.settings -> 'options') is not null
  ),
  sub as materialized (
    select s.id, s.form_id, s.branch_id
    from public.form_submissions s
    where s.status = 'active'
      and s.submitted_at >= p_from
      and s.submitted_at < p_to
      and (p_branch_id is null or s.branch_id = p_branch_id)
      and s.form_id in (select rq.form_id from rq)
  )
  select sub.branch_id, count(distinct sub.id)
  from sub
  join public.submission_answers a on a.submission_id = sub.id
  join rq on rq.form_id = sub.form_id and rq.field_id = a.field_id
  where a.value ~ '^\s*\d'
  group by sub.branch_id
$$;
