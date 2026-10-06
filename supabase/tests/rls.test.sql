-- =============================================================================
-- RLS & database behaviour tests. Run with `npm run test:db` (local Postgres)
-- or paste into the Supabase SQL editor of a NON-production project.
-- Every assertion raises an exception on failure; the script ends with
-- 'ALL DATABASE TESTS PASSED'.
-- =============================================================================
\set ON_ERROR_STOP on
set client_min_messages = warning;

-- ---------- fixtures (as superuser / service role) ---------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'super@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'admin@test.local'),
  ('00000000-0000-0000-0000-00000000000c', 'scoped@test.local'),
  ('00000000-0000-0000-0000-00000000000d', 'inactive@test.local');

update public.profiles set role = 'super_admin', is_active = true where email = 'super@test.local';
update public.profiles set role = 'admin', is_active = true where email in ('admin@test.local', 'scoped@test.local');

insert into public.branches (id, name, code) values
  ('10000000-0000-0000-0000-000000000001', 'Anna Nagar', 'ANN'),
  ('10000000-0000-0000-0000-000000000002', 'Porur', 'POR');

insert into public.profile_branches (profile_id, branch_id) values
  ('00000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-000000000002');

insert into public.forms (id, branch_id, name, slug, status) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Published Form', 'published-form', 'published'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Draft Form', 'draft-form', 'draft');

insert into public.form_fields (form_id, field_id, type, label, required, position) values
  ('20000000-0000-0000-0000-000000000001', 'full_name', 'short_text', 'Full Name', true, 0),
  ('20000000-0000-0000-0000-000000000002', 'secret', 'short_text', 'Draft only', false, 0);

insert into public.google_accounts (id, email, access_token_encrypted, refresh_token_encrypted)
values ('30000000-0000-0000-0000-000000000001', 'sheets@test.local', 'v1:enc', 'v1:enc');

insert into public.google_sheet_connections (form_id, google_account_id, google_account_email,
  spreadsheet_id, spreadsheet_name, worksheet_id, worksheet_name, status)
values ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
  'sheets@test.local', 'sheet123', 'Responses Sheet', 0, 'Responses', 'connected');

-- form_settings row auto-created by trigger
do $$ begin
  assert (select count(*) from public.form_settings) = 2, 'form_settings rows should be auto-created';
  assert (select published_at is not null from public.forms where slug = 'published-form'), 'published_at should be set';
end $$;

-- ---------- create_submission (service role path) ----------------------------
do $$
declare r record; r2 record;
begin
  select * into r from public.create_submission(
    '20000000-0000-0000-0000-000000000001',
    '[{"field_id":"full_name","field_type":"short_text","field_label":"Full Name","value":"John Doe"}]'::jsonb,
    'client-token-1', 'iphash', 'agent', '{}'::jsonb, 'dedupe-1', 'john doe');
  assert r.submission_number ~ '^SW-\d{8}-000001$', 'unexpected submission number ' || r.submission_number;
  assert r.sync_log_id is not null, 'sync log should be created for connected sheet';
  assert not r.is_duplicate;

  -- Same client token → idempotent
  select * into r2 from public.create_submission(
    '20000000-0000-0000-0000-000000000001', '[]'::jsonb, 'client-token-1');
  assert r2.is_duplicate and r2.submission_id = r.submission_id, 'client token must be idempotent';

  -- Same answers hash within 10 minutes → duplicate
  select * into r2 from public.create_submission(
    '20000000-0000-0000-0000-000000000001', '[]'::jsonb, 'client-token-2', null, null, '{}'::jsonb, 'dedupe-1');
  assert r2.is_duplicate, 'dedupe hash must detect duplicate';

  select * into r2 from public.create_submission(
    '20000000-0000-0000-0000-000000000001',
    '[{"field_id":"full_name","field_type":"short_text","field_label":"Full Name","value":"Jane"}]'::jsonb,
    'client-token-3', null, null, '{}'::jsonb, 'dedupe-2', 'jane');
  assert r2.submission_number ~ '-000002$', 'counter should increment';

  -- Draft forms cannot receive submissions
  begin
    perform public.create_submission('20000000-0000-0000-0000-000000000002', '[]'::jsonb);
    raise exception 'draft form accepted a submission';
  exception when sqlstate 'P0002' then null;
  end;
end $$;

-- Submission limit
update public.form_settings set submission = submission || '{"maxSubmissions": 2}'::jsonb
where form_id = '20000000-0000-0000-0000-000000000001';
do $$ begin
  begin
    perform public.create_submission('20000000-0000-0000-0000-000000000001', '[]'::jsonb, 'client-token-4');
    raise exception 'limit not enforced';
  exception when sqlstate 'P0001' then
    assert sqlerrm = 'submission_limit_reached', sqlerrm;
  end;
end $$;
update public.form_settings set submission = submission - 'maxSubmissions'
where form_id = '20000000-0000-0000-0000-000000000001';

-- ---------- claim_sync_jobs: no double processing ----------------------------
do $$
declare n int;
begin
  select count(*) into n from public.claim_sync_jobs(10);
  assert n = 2, 'expected 2 claimable jobs, got ' || n;
  select count(*) into n from public.claim_sync_jobs(10);
  assert n = 0, 'jobs must not be claimed twice';
  assert (select max(attempt_count) from public.google_sheet_sync_logs) = 1;
end $$;

-- ---------- rate limiting ------------------------------------------------------
do $$ begin
  assert public.check_rate_limit('t', 2, 60);
  assert public.check_rate_limit('t', 2, 60);
  assert not public.check_rate_limit('t', 2, 60), 'third call must be limited';
end $$;

-- =============================================================================
-- ANON (public) role
-- =============================================================================
begin;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
do $$
declare n int;
begin
  select count(*) into n from public.forms;
  assert n = 1, 'anon should see only the published form, saw ' || n;
  select count(*) into n from public.form_fields;
  assert n = 1, 'anon should see only fields of published forms';

  begin
    perform 1 from public.form_submissions;
    raise exception 'anon could read submissions';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.google_accounts;
    raise exception 'anon could read google tokens';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.google_sheet_connections;
    raise exception 'anon could read sheet connections';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.form_settings;
    raise exception 'anon could read private form settings';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.forms set name = 'hacked';
    raise exception 'anon could modify forms';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.form_submissions (form_id, submission_number) values ('20000000-0000-0000-0000-000000000001', 'X');
    raise exception 'anon could insert submissions directly';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.create_submission('20000000-0000-0000-0000-000000000001', '[]'::jsonb);
    raise exception 'anon could call create_submission';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

-- =============================================================================
-- Inactive / staff user: no admin data
-- =============================================================================
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', true);
do $$
declare n int;
begin
  select count(*) into n from public.form_submissions;
  assert n = 0, 'inactive user must not see submissions';
  select count(*) into n from public.forms;
  assert n = 1, 'inactive user sees only public forms';
  select count(*) into n from public.branches;
  assert n = 0, 'inactive user must not see branches';
  begin
    update public.profiles set role = 'super_admin', is_active = true
    where id = '00000000-0000-0000-0000-00000000000d';
    raise exception 'privilege escalation possible';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

-- =============================================================================
-- Admin (organisation-wide)
-- =============================================================================
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
do $$
declare n int; v int;
begin
  select count(*) into n from public.forms;
  assert n = 2, 'admin should see all forms';
  select count(*) into n from public.form_submissions;
  assert n = 2, 'admin should see submissions';
  select count(*) into n from public.google_sheet_connections;
  assert n = 1, 'admin should see token-free connections';
  begin
    perform 1 from public.google_accounts;
    raise exception 'admin could read google tokens table';
  exception when insufficient_privilege then null;
  end;
  select count(*) into n from public.list_google_accounts();
  assert n = 1, 'admin should list google accounts (token-free)';

  -- builder save is atomic & versioned
  select public.save_form_fields('20000000-0000-0000-0000-000000000002',
    '[{"field_id":"a","type":"short_text","label":"A"},{"field_id":"b","type":"email","label":"B","required":true}]'::jsonb,
    1) into v;
  assert v = 2, 'version should increment';
  select count(*) into n from public.form_fields where form_id = '20000000-0000-0000-0000-000000000002';
  assert n = 2, 'removed fields should be deleted and new ones inserted';
  begin
    perform public.save_form_fields('20000000-0000-0000-0000-000000000002', '[]'::jsonb, 1);
    raise exception 'stale version accepted';
  exception when sqlstate '40001' then null;
  end;

  -- duplicate copies fields but not the sheet connection
  perform public.duplicate_form('20000000-0000-0000-0000-000000000001', 'Copy', 'published-form-copy');
  select count(*) into n from public.forms where slug = 'published-form-copy' and status = 'draft';
  assert n = 1, 'duplicate should be a draft';
  select count(*) into n from public.form_fields ff join public.forms f on f.id = ff.form_id where f.slug = 'published-form-copy';
  assert n = 1, 'duplicate should copy fields';
  select count(*) into n from public.google_sheet_connections c join public.forms f on f.id = c.form_id where f.slug = 'published-form-copy';
  assert n = 0, 'duplicate must not copy google sheet connection';

  begin
    insert into public.google_sheet_connections (form_id) values ('20000000-0000-0000-0000-000000000002');
    raise exception 'admin could write connections directly';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.profiles set role = 'super_admin' where id = '00000000-0000-0000-0000-00000000000b';
    raise exception 'admin self-promotion possible';
  exception when insufficient_privilege then null;
  end;

  begin
    delete from public.audit_logs;
  exception when others then null;
  end;
end $$;
rollback;

-- =============================================================================
-- Branch-scoped admin: only Porur
-- =============================================================================
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true);
do $$
declare n int;
begin
  select count(*) into n from public.branches;
  assert n = 1, 'scoped admin should see only their branch';
  select count(*) into n from public.form_submissions;
  assert n = 0, 'scoped admin must not see other branches submissions';
  select count(*) into n from public.forms where status = 'draft';
  assert n = 0, 'scoped admin must not see other branches draft forms';
  begin
    insert into public.forms (branch_id, name, slug) values ('10000000-0000-0000-0000-000000000001', 'X form', 'x-form');
    raise exception 'scoped admin created form in another branch';
  exception when insufficient_privilege then null;
  end;
  insert into public.forms (branch_id, name, slug) values ('10000000-0000-0000-0000-000000000002', 'Porur form', 'porur-form');
end $$;
rollback;

-- =============================================================================
-- Super admin
-- =============================================================================
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
do $$
declare s jsonb;
begin
  update public.profiles set is_active = true where id = '00000000-0000-0000-0000-00000000000d';
  s := public.get_dashboard_stats('Asia/Kolkata');
  assert (s ->> 'totalSubmissions')::int = 2, 'dashboard total wrong: ' || s::text;
  assert (s ->> 'publishedForms')::int = 1;
  assert (s ->> 'sheetConnections')::int = 1;
  assert (select count(*) from public.get_submission_timeseries(7, 'Asia/Kolkata')) = 7;
  begin
    update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000000a';
    raise exception 'super admin could demote self';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

-- audit log is append-only even for the owner
do $$ begin
  insert into public.audit_logs (action, entity_type) values ('test', 'test');
  begin
    delete from public.audit_logs;
    raise exception 'audit log deletable';
  exception when raise_exception then
    if sqlerrm <> 'audit_logs is append-only' then raise; end if;
  end;
end $$;

select 'ALL DATABASE TESTS PASSED' as result;
