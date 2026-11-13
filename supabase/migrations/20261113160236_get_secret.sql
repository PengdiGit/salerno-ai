-- Lets the chat Edge Function (service_role only) read secrets stored in Supabase Vault.
create function get_secret(p_name text) returns text
language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = p_name limit 1;
$$;

revoke all on function get_secret(text) from public, anon, authenticated;
grant execute on function get_secret(text) to service_role;
