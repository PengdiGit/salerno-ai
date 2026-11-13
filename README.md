# Salerno AI

A chatbot for players of Salerno on CivMC. Ask it about Civ mechanics and Salerno (government, places, shops, history).

- `docs/` is the website (GitHub Pages): `index.html` is the chat, `/admin` (not linked anywhere, password only) edits the knowledge.
- `supabase/functions/chat/` is the backend. It loads the knowledge, calls Gemini, and streams the answer back.
- `supabase/migrations/` is the database setup.
- `knowledge/` holds the knowledge files (`.md` or `.txt`). See `knowledge/_TEMPLATE.md`.
- `scripts/seed.mjs` uploads the knowledge files to the database.

## Writing knowledge

Each `# Heading` line starts a new entry. A line like `I - https://some-page` makes the bot read that page when a question is related to it. The file name becomes the category.

To show pictures, put them in `docs/images/` and add a line like `IMG - brunsvik-factory.png - The Brunsvik factory building` (the caption is optional). Use `.png`, `.jpg`, `.gif` or `.webp`, with no spaces in the file name. Commit and push the image so it's live on the site. The bot only shows images that are listed in the knowledge.

```
node scripts/seed.mjs --dry-run   # preview
node scripts/seed.mjs             # upload all files
node scripts/seed.mjs government  # upload only files with "government" in the name
node scripts/seed.mjs --sql       # print SQL to paste into the Supabase SQL editor (no secret key needed)
```

Knowledge files are git-ignored so they don't end up in the public repo (only `_TEMPLATE.md` is committed). Empty files are skipped.

Re-uploading a file replaces the entries that came from it. Entries made on the admin page are not touched.

## One-time setup

1. Create a new project at https://supabase.com/dashboard.
2. Link and push the database:
   ```
   supabase login
   supabase link --project-ref YOUR-PROJECT-REF
   supabase db push
   ```
3. Give the backend your Gemini key (from https://aistudio.google.com/apikey) and deploy it. The key can be either a function secret or a Vault secret named `gemini_api_key` (this project currently uses Vault):
   ```
   supabase secrets set GEMINI_API_KEY=your-key
   supabase functions deploy chat
   ```
   ```sql
   -- or, in the SQL editor (to replace it later: select vault.update_secret(id, 'new-key') from vault.secrets where name = 'gemini_api_key';)
   select vault.create_secret('your-key', 'gemini_api_key');
   ```
   Optional secrets: `GEMINI_MODEL` (default `gemini-3.5-flash`), `GEMINI_FALLBACK_MODEL` (default `gemini-flash-lite-latest`, used when the main model is busy), `ALLOWED_ORIGINS` (e.g. `https://pengdigit.github.io`), `RATE_LIMIT_MAX` (default 20), `RATE_LIMIT_WINDOW_SECONDS` (default 600), `USE_WEB_SEARCH` (default `false`; Google Search grounding needs a paid Gemini plan).
4. Put the project URL and anon/publishable key in `docs/config.js`.
5. Copy `.env.example` to `.env`, fill it in, and run `node scripts/seed.mjs`.
6. The admin page signs in as the single account `admin@salerno-ai.app` (set in `docs/admin/admin.js`); only the password is typed. To add an admin, create the user in Authentication > Users and run:
   ```sql
   insert into admins (user_id, name) values ('USER-UUID', 'Name');
   ```
