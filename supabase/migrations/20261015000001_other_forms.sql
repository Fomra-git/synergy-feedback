-- =============================================================================
-- Synergy Feedback — "Others" forms (not tied to a branch)
-- =============================================================================
-- A form can be filed under "Others" with a free-text name instead of a
-- branch (e.g. "Recruitment", "Events"). Such forms have no branch and are
-- excluded from rating reports. Safe to run more than once.
-- =============================================================================

alter table public.forms add column if not exists other_name text;

alter table public.forms drop constraint if exists forms_other_name_check;
alter table public.forms add constraint forms_other_name_check check (
  other_name is null or (char_length(btrim(other_name)) between 2 and 80 and branch_id is null)
);

-- Rating counts per branch and question in [p_from, p_to).
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
  with q as (
    select ff.form_id, ff.field_id, public.rating_question_max(ff.settings -> 'options') as max_score
    from public.form_fields ff
    where ff.type = 'radio'
  )
  select
    s.branch_id,
    coalesce(b.name, 'No branch') as branch_name,
    lower(btrim(a.field_label)) as question_key,
    min(btrim(a.field_label)) as question,
    substring(a.value from '^\s*(\d+(?:\.\d+)?)')::numeric as score,
    max(q.max_score) as max_score,
    count(*) as responses
  from public.form_submissions s
  join public.submission_answers a on a.submission_id = s.id
  join q on q.form_id = s.form_id and q.field_id = a.field_id and q.max_score is not null
  left join public.branches b on b.id = s.branch_id
  where s.status = 'active'
    and s.submitted_at >= p_from
    and s.submitted_at < p_to
    and (p_branch_id is null or s.branch_id = p_branch_id)
    -- forms grouped under "Others" are not branch feedback: keep them out of reports
    and not exists (select 1 from public.forms f where f.id = s.form_id and f.other_name is not null)
    and a.value ~ '^\s*\d'
  group by s.branch_id, b.name, lower(btrim(a.field_label)), substring(a.value from '^\s*(\d+(?:\.\d+)?)')::numeric
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
  select s.branch_id, count(distinct s.id)
  from public.form_submissions s
  join public.submission_answers a on a.submission_id = s.id
  join public.form_fields ff on ff.form_id = s.form_id and ff.field_id = a.field_id
    and ff.type = 'radio' and public.rating_question_max(ff.settings -> 'options') is not null
  where s.status = 'active'
    and s.submitted_at >= p_from
    and s.submitted_at < p_to
    and (p_branch_id is null or s.branch_id = p_branch_id)
    -- forms grouped under "Others" are not branch feedback: keep them out of reports
    and not exists (select 1 from public.forms f where f.id = s.form_id and f.other_name is not null)
    and a.value ~ '^\s*\d'
  group by s.branch_id
$$;

