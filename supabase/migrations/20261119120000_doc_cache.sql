-- Cached plain-text exports of Google Docs referenced by DOC - lines.
-- Only the chat Edge Function (service_role) reads/writes this; survives cold starts.
create table doc_cache (
  doc_id text primary key,
  text text not null check (char_length(text) <= 200000),
  fetched_at timestamptz not null default now()
);

alter table doc_cache enable row level security;
-- no policies: anon/authenticated cannot access; service_role bypasses RLS
