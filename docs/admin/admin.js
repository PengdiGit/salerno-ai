// Single admin account; only the password is typed in.
const ADMIN_EMAIL = "admin@salerno-ai.app";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $ = (id) => document.getElementById(id);
const loginView = $("login-view");
const editorView = $("editor-view");
const logoutBtn = $("logout-btn");

let entries = [];

async function showView() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    loginView.hidden = false;
    editorView.hidden = true;
    logoutBtn.hidden = true;
    return;
  }

  const { data: admin } = await sb.from("admins").select("user_id").eq("user_id", session.user.id).maybeSingle();
  logoutBtn.hidden = false;
  if (!admin) {
    loginView.hidden = false;
    editorView.hidden = true;
    $("login-status").textContent = "This account is not an admin.";
    return;
  }

  loginView.hidden = true;
  editorView.hidden = false;
  await loadEntries();
}

async function loadEntries() {
  const { data, error } = await sb
    .from("knowledge")
    .select("id, category, title, content, source_file, updated_at")
    .order("category")
    .order("id");
  if (error) {
    $("entries").textContent = `Could not load entries: ${error.message}`;
    return;
  }
  entries = data;
  $("category-list").innerHTML = "";
  for (const cat of [...new Set(entries.map((e) => e.category))]) {
    const opt = document.createElement("option");
    opt.value = cat;
    $("category-list").appendChild(opt);
  }
  renderEntries();
}

function renderEntries() {
  const q = $("search").value.trim().toLowerCase();
  const list = $("entries");
  list.innerHTML = "";
  const shown = entries.filter(
    (e) => !q || `${e.title} ${e.category} ${e.content}`.toLowerCase().includes(q),
  );
  $("count").textContent = `${shown.length} of ${entries.length} entries`;

  for (const e of shown) {
    const card = document.createElement("div");
    card.className = "card entry";

    const head = document.createElement("div");
    head.className = "entry-head";
    const h3 = document.createElement("h3");
    h3.textContent = e.title;
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = `${e.category}${e.source_file ? ` · from ${e.source_file}` : ""} · updated ${e.updated_at.slice(0, 10)}`;
    head.append(h3, tag);

    const pre = document.createElement("pre");
    pre.textContent = e.content;

    const actions = document.createElement("div");
    actions.className = "row";
    actions.style.marginTop = "10px";
    const edit = document.createElement("button");
    edit.className = "ghost";
    edit.textContent = "Edit";
    edit.onclick = () => startEdit(e);
    const del = document.createElement("button");
    del.className = "btn danger";
    del.textContent = "Delete";
    del.onclick = () => deleteEntry(e);
    actions.append(edit, del);

    card.append(head, pre, actions);
    list.appendChild(card);
  }
}

function startEdit(e) {
  $("entry-id").value = e.id;
  $("entry-title").value = e.title;
  $("entry-category").value = e.category;
  $("entry-content").value = e.content;
  $("form-title").textContent = `Editing: ${e.title}`;
  $("cancel-edit").hidden = false;
  $("save-status").textContent = e.source_file
    ? `Note: this came from ${e.source_file}. Re-running the seed script will overwrite edits made here.`
    : "";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function resetForm() {
  $("entry-form").reset();
  $("entry-id").value = "";
  $("form-title").textContent = "Add an entry";
  $("cancel-edit").hidden = true;
}

async function deleteEntry(e) {
  if (!confirm(`Delete "${e.title}"?`)) return;
  const { error } = await sb.from("knowledge").delete().eq("id", e.id);
  if (error) return alert(error.message);
  await loadEntries();
}

$("entry-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const id = $("entry-id").value;
  const row = {
    title: $("entry-title").value.trim(),
    category: $("entry-category").value.trim().toLowerCase(),
    content: $("entry-content").value.trim(),
  };
  $("save-status").textContent = "Saving...";
  const { error } = id
    ? await sb.from("knowledge").update(row).eq("id", id)
    : await sb.from("knowledge").insert(row);
  if (error) {
    $("save-status").textContent = `Error: ${error.message}`;
    return;
  }
  $("save-status").textContent = "Saved.";
  resetForm();
  await loadEntries();
});

$("cancel-edit").addEventListener("click", () => {
  resetForm();
  $("save-status").textContent = "";
});

$("search").addEventListener("input", renderEntries);

$("login-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  $("login-status").textContent = "Logging in...";
  const { error } = await sb.auth.signInWithPassword({
    email: ADMIN_EMAIL,
    password: $("password").value,
  });
  $("password").value = "";
  $("login-status").textContent = error ? "Wrong password." : "";
  if (!error) await showView();
});

logoutBtn.addEventListener("click", async () => {
  await sb.auth.signOut();
  $("login-status").textContent = "";
  await showView();
});

showView();
