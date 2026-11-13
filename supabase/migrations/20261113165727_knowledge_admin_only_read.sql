-- The site is login-only for now, so the knowledge isn't publicly readable either.
drop policy "read knowledge" on knowledge;
create policy "read knowledge" on knowledge for select using (is_admin());
