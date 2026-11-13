const HISTORY_KEY = "salerno-ai-history";
const MAX_HISTORY = 12;

const messagesEl = document.getElementById("messages");
const welcomeEl = document.getElementById("welcome");
const form = document.getElementById("chat-form");
const input = document.getElementById("input");
const sendBtn = document.getElementById("send-btn");

let history = loadHistory();
let busy = false;

function loadHistory() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(HISTORY_KEY) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function saveHistory() {
  sessionStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-MAX_HISTORY)));
}

function renderMarkdown(text) {
  const html = DOMPurify.sanitize(marked.parse(text, { breaks: true }));
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  for (const a of wrapper.querySelectorAll("a")) {
    a.target = "_blank";
    a.rel = "noopener noreferrer";
  }
  for (const img of wrapper.querySelectorAll("img")) {
    const src = img.getAttribute("src") || "";
    if (!/^images\/[\w./-]+$/.test(src) || src.includes("..")) {
      img.remove();
      continue;
    }
    img.loading = "lazy";
    const link = document.createElement("a");
    link.href = src;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className = "img-link";
    img.replaceWith(link);
    link.appendChild(img);
  }
  return wrapper.innerHTML;
}

// Hide images that fail to load (e.g. a file name the bot got wrong).
messagesEl.addEventListener("error", (e) => {
  if (e.target.tagName === "IMG") (e.target.closest(".img-link") || e.target).remove();
}, true);

function addMessage(role, text) {
  welcomeEl.hidden = true;
  const row = document.createElement("div");
  row.className = `msg ${role}`;
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  if (role === "user") bubble.textContent = text;
  else bubble.innerHTML = renderMarkdown(text);
  row.appendChild(bubble);
  messagesEl.appendChild(row);
  scrollToBottom();
  return bubble;
}

function addSources(bubble, sources) {
  if (!sources?.length) return;
  const box = document.createElement("div");
  box.className = "sources";
  box.textContent = "Sources: ";
  sources.forEach((s, i) => {
    const a = document.createElement("a");
    a.href = s.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = s.title || new URL(s.url).hostname;
    box.appendChild(a);
    if (i < sources.length - 1) box.append(" · ");
  });
  bubble.appendChild(box);
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function setBusy(value) {
  busy = value;
  sendBtn.disabled = value;
  input.disabled = value;
  if (!value) input.focus();
}

async function ask(question) {
  if (busy || !question.trim()) return;
  setBusy(true);

  history.push({ role: "user", text: question.trim() });
  addMessage("user", question.trim());

  const bubble = addMessage("model", "");
  bubble.classList.add("typing");
  bubble.innerHTML = '<span class="dots"><span></span><span></span><span></span></span>';

  let answer = "";
  let sources = [];
  try {
    const res = await fetch(CHAT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ messages: history.slice(-MAX_HISTORY) }),
    });

    if (!res.ok || !res.body) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Request failed (${res.status})`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        const msg = JSON.parse(line);
        if (msg.text) {
          answer += msg.text;
          bubble.classList.remove("typing");
          bubble.innerHTML = renderMarkdown(answer);
          scrollToBottom();
        }
        if (msg.sources) sources = msg.sources;
        if (msg.error) throw new Error(msg.error);
      }
    }

    if (!answer) throw new Error("No answer came back. Try rephrasing your question.");
    history.push({ role: "model", text: answer });
    saveHistory();
    addSources(bubble, sources);
  } catch (err) {
    history.pop();
    bubble.classList.remove("typing");
    bubble.classList.add("error");
    bubble.textContent = err.message || "Something went wrong.";
  } finally {
    setBusy(false);
    scrollToBottom();
  }
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const q = input.value;
  input.value = "";
  autoResize();
  ask(q);
});

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    form.requestSubmit();
  }
});

function autoResize() {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 160) + "px";
}
input.addEventListener("input", autoResize);

for (const btn of document.querySelectorAll(".suggestion")) {
  btn.addEventListener("click", () => ask(btn.textContent));
}

document.getElementById("clear-btn").addEventListener("click", () => {
  history = [];
  saveHistory();
  for (const el of messagesEl.querySelectorAll(".msg")) el.remove();
  welcomeEl.hidden = false;
  input.focus();
});

for (const m of history) addMessage(m.role, m.text);
input.focus();
