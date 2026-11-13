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
  await Promise.all([loadEntries(), loadImages()]);
}

// ---------- images (Supabase Storage bucket "images")
const bucket = sb.storage.from("images");

function cleanFileName(name, originalName) {
  const ext = (originalName.match(/\.(png|jpe?g|gif|webp)$/i)?.[1] ?? "png").toLowerCase();
  const base = (name || originalName.replace(/\.[^.]+$/, ""))
    .toLowerCase()
    .replace(/\.(png|jpe?g|gif|webp)$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${base || "image"}.${ext}`;
}

async function loadImages() {
  const grid = $("images");
  const { data, error } = await bucket.list("", { limit: 1000, sortBy: { column: "name", order: "asc" } });
  if (error) {
    grid.textContent = `Could not load images: ${error.message}`;
    return;
  }
  grid.innerHTML = "";
  const files = data.filter((f) => f.id && !f.name.startsWith("."));
  if (!files.length) grid.textContent = "No images yet.";

  for (const f of files) {
    const url = bucket.getPublicUrl(f.name).data.publicUrl;
    const line = `IMG - ${f.name}`;

    const card = document.createElement("div");
    card.className = "image-card";
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    const img = document.createElement("img");
    img.src = `${url}?v=${encodeURIComponent(f.updated_at ?? "")}`;
    img.alt = f.name;
    img.loading = "lazy";
    link.appendChild(img);
    const name = document.createElement("div");
    name.className = "name";
    name.textContent = f.name;

    const actions = document.createElement("div");
    actions.className = "row";
    const add = document.createElement("button");
    add.className = "btn";
    add.type = "button";
    add.textContent = "Add to entry";
    add.onclick = () => {
      const box = $("entry-content");
      box.value = `${box.value.replace(/\s+$/, "")}${box.value.trim() ? "\n" : ""}${line} - `;
      box.focus();
      box.setSelectionRange(box.value.length, box.value.length);
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    const copy = document.createElement("button");
    copy.className = "ghost";
    copy.type = "button";
    copy.textContent = "Copy line";
    copy.onclick = async () => {
      await navigator.clipboard.writeText(line);
      copy.textContent = "Copied";
      setTimeout(() => (copy.textContent = "Copy line"), 1200);
    };
    const del = document.createElement("button");
    del.className = "btn danger";
    del.type = "button";
    del.textContent = "Delete";
    del.onclick = async () => {
      if (!confirm(`Delete ${f.name}? Entries that use it will stop showing it.`)) return;
      const { error } = await bucket.remove([f.name]);
      if (error) return alert(error.message);
      await loadImages();
    };
    actions.append(add, copy, del);

    card.append(link, name, actions);
    grid.appendChild(card);
  }
}

$("upload-btn").addEventListener("click", async () => {
  const file = $("image-file").files[0];
  const status = $("image-status");
  if (!file) {
    status.textContent = "Pick a file first.";
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    status.textContent = "That file is over 5 MB. Shrink or crop it first.";
    return;
  }
  const name = cleanFileName($("image-name").value.trim(), file.name);
  status.textContent = `Uploading ${name}...`;
  const { error } = await bucket.upload(name, file, { upsert: true, contentType: file.type, cacheControl: "300" });
  if (error) {
    status.textContent = `Upload failed: ${error.message}`;
    return;
  }
  status.textContent = `Uploaded. Use this line in an entry: IMG - ${name}`;
  $("image-file").value = "";
  $("image-name").value = "";
  await loadImages();
});

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
