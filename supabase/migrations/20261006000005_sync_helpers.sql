-- =============================================================================
-- Synergy Feedback — Google Sheets sync queue helpers (service role only)
-- =============================================================================

-- Queues every active submission of a form for (re)sync to its CURRENT sheet.
-- attempt_count is set to 1 so the worker's first claim (→ 2) performs the
-- duplicate check against the sheet before appending: back-filling a sheet
-- that already contains some rows never duplicates them.
create or replace function public.queue_sheet_backfill(p_form_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conn public.google_sheet_connections%rowtype;
  v_count integer;
begin
  select * into v_conn from public.google_sheet_connections
  where form_id = p_form_id and status = 'connected' and enabled and spreadsheet_id is not null;
  if not found then
    return 0;
  end if;

  insert into public.google_sheet_sync_logs as l (submission_id, form_id, connection_id,
    spreadsheet_id, worksheet_name, status, attempt_count, next_attempt_at)
  select s.id, s.form_id, v_conn.id, v_conn.spreadsheet_id, v_conn.worksheet_name, 'pending', 1, now()
  from public.form_submissions s
  where s.form_id = p_form_id and s.status = 'active'
  on conflict (submission_id) do update set
    connection_id = excluded.connection_id,
    spreadsheet_id = excluded.spreadsheet_id,
    worksheet_name = excluded.worksheet_name,
    status = 'pending',
    attempt_count = 1,
    next_attempt_at = now(),
    error_message = null,
    error_kind = null,
    google_row_number = null,
    synced_at = null,
    locked_at = null
  where l.status <> 'synced' or l.spreadsheet_id is distinct from excluded.spreadsheet_id
     or l.worksheet_name is distinct from excluded.worksheet_name;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Re-queues failed/stalled jobs. Filters are optional and combinable.
-- When submission ids are given, missing sync records are created against the
-- form's current connection (e.g. submissions received while disconnected).
-- A job that was attempted before keeps attempt_count = 1 so the next claim
-- re-checks the sheet for an existing row (idempotency), while its retry
-- budget is reset.
create or replace function public.requeue_sheet_jobs(
  p_form_id uuid default null,
  p_account_id uuid default null,
  p_submission_ids uuid[] default null,
  p_include_pending boolean default true
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_submission_ids is not null then
    insert into public.google_sheet_sync_logs (submission_id, form_id, connection_id,
      spreadsheet_id, worksheet_name, status, attempt_count, next_attempt_at)
    select s.id, s.form_id, c.id, c.spreadsheet_id, c.worksheet_name, 'pending', 0, now()
    from public.form_submissions s
    join public.google_sheet_connections c on c.form_id = s.form_id
      and c.status = 'connected' and c.enabled and c.spreadsheet_id is not null
    where s.id = any (p_submission_ids)
    on conflict (submission_id) do nothing;
  end if;

  update public.google_sheet_sync_logs l
  set status = 'pending',
      next_attempt_at = now(),
      attempt_count = case when l.attempt_count > 0 then 1 else 0 end,
      locked_at = null,
      error_message = null,
      error_kind = null,
      connection_id = coalesce(c.id, l.connection_id),
      spreadsheet_id = coalesce(c.spreadsheet_id, l.spreadsheet_id),
      worksheet_name = coalesce(c.worksheet_name, l.worksheet_name)
  from public.google_sheet_connections c
  where c.form_id = l.form_id
    and c.status = 'connected' and c.enabled and c.spreadsheet_id is not null
    and (l.status in ('failed', 'skipped') or (p_include_pending and l.status = 'pending'))
    and (p_form_id is null or l.form_id = p_form_id)
    and (p_account_id is null or c.google_account_id = p_account_id)
    and (p_submission_ids is null or l.submission_id = any (p_submission_ids));

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.queue_sheet_backfill(uuid) from public, anon, authenticated;
revoke execute on function public.requeue_sheet_jobs(uuid, uuid, uuid[], boolean) from public, anon, authenticated;
grant execute on function public.queue_sheet_backfill(uuid) to service_role;
grant execute on function public.requeue_sheet_jobs(uuid, uuid, uuid[], boolean) to service_role;
