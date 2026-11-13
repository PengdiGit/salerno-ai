-- Public image bucket for the bot; only admins can upload, replace, list or delete.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('images', 'images', true, 5242880, array['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
on conflict (id) do nothing;

create policy "admins list images" on storage.objects for select
  using (bucket_id = 'images' and public.is_admin());
create policy "admins upload images" on storage.objects for insert
  with check (bucket_id = 'images' and public.is_admin());
create policy "admins update images" on storage.objects for update
  using (bucket_id = 'images' and public.is_admin())
  with check (bucket_id = 'images' and public.is_admin());
create policy "admins delete images" on storage.objects for delete
  using (bucket_id = 'images' and public.is_admin());
