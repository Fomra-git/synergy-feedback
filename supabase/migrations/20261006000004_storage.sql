-- =============================================================================
-- Synergy Feedback — Storage buckets
-- =============================================================================
-- submission-files: PRIVATE. Public uploads go through the Next.js server
--                   (type/size validated, rate limited) using the service role.
--                   Admins view files through short-lived signed URLs.
-- branding:         PUBLIC read (logos shown on public forms). Admin writes.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'submission-files', 'submission-files', false, 10485760,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ]
)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('branding', 'branding', true, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
on conflict (id) do nothing;

create policy "submission-files: admins read" on storage.objects
  for select to authenticated
  using (bucket_id = 'submission-files' and public.is_admin());

create policy "branding: admins upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'branding' and public.is_admin());

create policy "branding: admins update" on storage.objects
  for update to authenticated
  using (bucket_id = 'branding' and public.is_admin());

create policy "branding: admins delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'branding' and public.is_admin());
