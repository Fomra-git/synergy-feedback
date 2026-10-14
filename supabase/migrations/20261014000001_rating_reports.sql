-- =============================================================================
-- Synergy Feedback — rating reports
-- =============================================================================
-- A "rating question" is a radio field whose options all start with a number
-- ("5", "4", … or "5 - Excellent", "1 - Poor"). The selected option's leading
-- number is the mark. Reports aggregate marks per question and branch.
--
-- SECURITY INVOKER: callers only see submissions their RLS allows (branch
-- scope + submissions.view). The monthly email runs with the service role.
-- Safe to run more than once.
-- =============================================================================

create or replace function public.rating_question_max(p_options jsonb)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(p_options) = 'array'
     and jsonb_array_length(p_options) >= 2
     and not exists (
       select 1 from jsonb_array_elements_text(p_options) o
       where o !~ '^\s*\d+(\.\d+)?(\s|$|[^0-9.])'
     )
    then (select max(substring(o from '^\s*(\d+(?:\.\d+)?)')::numeric) from jsonb_array_elements_text(p_options) o)
  end
$$;

-- Mark counts per branch and question in [p_from, p_to).
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
    and a.value ~ '^\s*\d'
  group by s.branch_id
$$;

revoke execute on function public.get_rating_report(timestamptz, timestamptz, uuid) from public, anon;
revoke execute on function public.get_rating_customers(timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.get_rating_report(timestamptz, timestamptz, uuid) to authenticated, service_role;
grant execute on function public.get_rating_customers(timestamptz, timestamptz, uuid) to authenticated, service_role;
grant execute on function public.rating_question_max(jsonb) to authenticated, service_role;
