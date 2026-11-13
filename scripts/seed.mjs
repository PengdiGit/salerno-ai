// Loads knowledge/*.md and knowledge/*.txt into the knowledge table.
// Each "# Heading" starts a new entry. A file with no headings becomes one entry.
// Re-running replaces the entries that came from the same file; entries created on the admin page are untouched.
//
// Usage: node scripts/seed.mjs            (all files)
//        node scripts/seed.mjs mechanics  (only files whose name contains "mechanics")
//        node scripts/seed.mjs --dry-run  (show what would be uploaded)
//        node scripts/seed.mjs --sql      (print SQL to paste into the Supabase SQL editor instead of uploading)

import { readdir, readFile } from "node:fs/promises";
import { join, extname, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const knowledgeDir = join(root, "knowledge");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const sqlMode = args.includes("--sql");
const filter = args.find((a) => !a.startsWith("--"))?.toLowerCase();

try {
  process.loadEnvFile(join(root, ".env"));
} catch {
  // fall back to real environment variables
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!dryRun && !sqlMode && (!SUPABASE_URL || !SERVICE_KEY)) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Copy .env.example to .env and fill it in.");
  process.exit(1);
}

function categoryFromFile(file) {
  return basename(file, extname(file))
    .replace(/[_\s]+/g, "-")
    .replace(/^civmc-|^salerno-/i, "")
    .toLowerCase() || "general";
}

function parseFile(file, text) {
  const category = categoryFromFile(file);
  const entries = [];
  let current = null;

  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    const heading = line.match(/^#\s+(.+)$/);
    if (heading) {
      if (current) entries.push(current);
      current = { title: heading[1].trim(), lines: [] };
    } else {
      if (!current) current = { title: basename(file, extname(file)).replace(/[_-]+/g, " "), lines: [] };
      current.lines.push(line);
    }
  }
  if (current) entries.push(current);

  return entries
    .map((e) => ({ category, title: e.title.slice(0, 200), content: e.lines.join("\n").trim(), source_file: file }))
    .filter((e) => e.content || entries.length === 1);
}

async function rest(method, path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      ...(SERVICE_KEY.startsWith("eyJ") ? { Authorization: `Bearer ${SERVICE_KEY}` } : {}),
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} failed (${res.status}): ${await res.text()}`);
}

const files = (await readdir(knowledgeDir))
  .filter((f) => [".md", ".txt"].includes(extname(f).toLowerCase()))
  .filter((f) => !f.startsWith("_"))
  .filter((f) => !filter || f.toLowerCase().includes(filter));

if (!files.length) {
  console.log("No knowledge files found (files starting with _ are skipped).");
  process.exit(0);
}

const sqlText = (s) => `'${s.replace(/'/g, "''")}'`;

let total = 0;
const sql = ["begin;"];
for (const file of files) {
  const text = await readFile(join(knowledgeDir, file), "utf8");
  if (!text.trim()) {
    if (!sqlMode) console.log(`${file}: empty, skipped`);
    continue;
  }
  const entries = parseFile(file, text);
  total += entries.length;
  if (sqlMode) {
    sql.push(`delete from knowledge where source_file = ${sqlText(file)};`);
    for (const e of entries) {
      sql.push(
        `insert into knowledge (category, title, content, source_file) values (${sqlText(e.category)}, ${sqlText(e.title)}, ${sqlText(e.content)}, ${sqlText(file)});`,
      );
    }
    continue;
  }
  console.log(`${file}: ${entries.length} entries (category "${entries[0]?.category ?? categoryFromFile(file)}")`);
  if (dryRun) {
    for (const e of entries) console.log(`   - ${e.title}`);
    continue;
  }
  await rest("DELETE", `knowledge?source_file=eq.${encodeURIComponent(file)}`);
  if (entries.length) await rest("POST", "knowledge", entries);
}

if (sqlMode) {
  sql.push("commit;");
  console.log(sql.join("\n"));
} else {
  console.log(dryRun ? `Dry run: ${total} entries would be uploaded.` : `Done: uploaded ${total} entries.`);
}
