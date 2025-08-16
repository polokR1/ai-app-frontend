const BACKEND_URL = "https://jobtaste.onrender.com/ask";

// ========== Monaco Editor ==========
require.config({ paths: { vs: 'https://unpkg.com/monaco-editor@0.34.1/min/vs' }});
require(["vs/editor/editor.main"], function () {
  window.editor = monaco.editor.create(document.getElementById('editor'), {
    value: "<!-- wczytaj tutaj swój kod szablonu -->",
    language: "html"
  });
});

// ========== Elementy UI ==========
const sendBtn = document.getElementById("chat-send");
const chatInput = document.getElementById("chat-input");
const chatBox = document.getElementById("chat-messages");
const preview = document.getElementById("ai-code-preview");

// Nowy input do wielu plików
const multiFileInput = document.createElement("input");
multiFileInput.type = "file";
multiFileInput.multiple = true;
multiFileInput.id = "multiFileInput";

// Dodaj etykietę + przycisk do UI
const fileLabel = document.createElement("label");
fileLabel.textContent = "Wczytaj pliki:";
fileLabel.appendChild(multiFileInput);

document.querySelector(".code-panel").insertBefore(fileLabel, document.getElementById("file-explorer"));

sendBtn.onclick = handleChatSend;
chatInput.addEventListener("keydown", function(event) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendBtn.click();
  }
});

// ========== Stan plików ==========
let zipFile, zipObj, currentFilePath;
let allFileContents = {};

multiFileInput.addEventListener("change", async (e) => {
  clearExplorer();
  allFileContents = {};
  const files = Array.from(e.target.files);
  for (let f of files) {
    const content = await f.arrayBuffer();
    // zapisujemy jako base64, żeby można było wysłać binaria np. APK
    allFileContents[f.name] = btoa(String.fromCharCode(...new Uint8Array(content)));
    ensureFileInExplorer(f.name);
  }
  if (files.length > 0) {
    currentFilePath = files[0].name;
    if (files[0].type.startsWith("text")) {
      window.editor.setValue(await files[0].text());
    } else {
      window.editor.setValue(`/* ${files[0].name} (plik binarny, wysłany jako base64) */`);
    }
  }
});

// ========== Wysyłka do backendu + obsługa odpowiedzi ==========
async function handleChatSend() {
  const msg = chatInput.value.trim();
  if (!msg) return;

  addChatMessage("user", msg);
  setSending(true);
  preview.innerHTML = "<em>Oczekiwanie na odpowiedź AI...</em>";

  let filesToSend = {};
  if (Object.keys(allFileContents).length > 0) {
    filesToSend = { ...allFileContents };
  } else if (zipObj) {
    saveCurrentFile();
    filesToSend = { ...allFileContents };
  } else {
    filesToSend = { "index.html": window.editor.getValue() };
  }

  try {
    const res = await fetch(BACKEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: msg, files: filesToSend })
    });

    const responseText = await res.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      preview.innerHTML = `<h4>Surowa odpowiedź:</h4><pre>${escapeHtml(responseText)}</pre>`;
      addChatMessage("ai", responseText);
      return;
    }

    preview.innerHTML = `<h4>Surowa odpowiedź (JSON):</h4><pre>${escapeHtml(JSON.stringify(data, null, 2))}</pre>`;

    const { files, message } = normalizeResponse(data);

    let changedFiles = [];
    if (files && typeof files === 'object') {
      changedFiles = applyFileChanges(files);
    }

    if (message) {
      addChatMessage("ai", message);
    }

    if (changedFiles.length > 0 && !message) {
      addChatMessage("ai", "Zaktualizowałem pliki: " + changedFiles.join(", "));
    }

    if (!message && changedFiles.length === 0) {
      addChatMessage("ai", "Odpowiedź nie zawierała tekstu ani zmian plików. Sprawdź podgląd poniżej.");
    }
  } catch (err) {
    addChatMessage("ai", "Błąd połączenia z backendem: " + err.message);
    preview.innerHTML = `<pre>${escapeHtml(err.stack)}</pre>`;
  } finally {
    chatInput.value = "";
    setSending(false);
  }
}

function escapeHtml(str) {
  return str.replace(/[&<>\"]/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;'
  }[c]));
}

function normalizeResponse(data) {
  if (data && typeof data.result !== 'undefined') {
    if (typeof data.result === 'string') {
      return { files: null, message: data.result };
    }
    if (data.result && typeof data.result === 'object') {
      if (data.result.files && typeof data.result.files === 'object') {
        return { files: data.result.files, message: data.result.message || null };
      }
      if (looksLikeFilesMap(data.result)) {
        return { files: data.result, message: data.message || null };
      }
    }
  }
  if (data && data.files && typeof data.files === 'object') {
    return { files: data.files, message: data.message || null };
  }
  const openaiMsg = data?.choices?.[0]?.message?.content || data?.message || data?.answer || data?.content;
  if (typeof openaiMsg === 'string') {
    return { files: null, message: openaiMsg };
  }
  if (typeof data?.rawText === 'string') {
    return { files: null, message: data.rawText };
  }
  return { files: null, message: null };
}

function looksLikeFilesMap(obj) {
  const keys = Object.keys(obj);
  if (keys.length === 0) return false;
  return keys.some(k => /\.[a-z0-9]+$/i.test(k)) && keys.every(k => typeof obj[k] === 'string');
}

function applyFileChanges(filesObj) {
  const changed = [];
  for (const [fname, content] of Object.entries(filesObj)) {
    allFileContents[fname] = content;
    ensureFileInExplorer(fname);
    if (fname === currentFilePath) {
      try {
        window.editor.setValue(content);
      } catch {}
    }
    changed.push(fname);
  }
  return changed;
}

function ensureFileInExplorer(fname) {
  const explorer = document.getElementById("file-explorer");
  const exists = Array.from(explorer.querySelectorAll('.file')).some(n => n.textContent === fname);
  if (exists) return;
  const el = document.createElement("span");
  el.textContent = fname;
  el.className = "file";
  el.onclick = async () => {
    saveCurrentFile();
    selectFileInExplorer(fname);
    await loadAndShowFile(fname);
  };
  explorer.appendChild(el);
}

function setSending(isSending) {
  sendBtn.disabled = isSending;
  sendBtn.textContent = isSending ? "Wysyłam..." : "Wyślij";
}

function addChatMessage(who, text) {
  const div = document.createElement("div");
  div.className = who === "user" ? "msg msg-user" : "msg msg-ai";
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;
  div.appendChild(bubble);
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function saveCurrentFile() {
  if (currentFilePath) {
    allFileContents[currentFilePath] = window.editor.getValue();
  }
}

function clearExplorer() {
  document.getElementById("file-explorer").innerHTML = "";
  zipObj = null;
  currentFilePath = null;
  allFileContents = {};
}

function selectFileInExplorer(fname) {
  currentFilePath = fname;
  const nodes = document.querySelectorAll("#file-explorer .file");
  nodes.forEach(n => n.classList.toggle("selected", n.textContent === fname));
}

async function loadAndShowFile(fname) {
  if (!allFileContents[fname]) return;
  try {
    const decoded = atob(allFileContents[fname]);
    window.editor.setValue(decoded);
  } catch {
    window.editor.setValue(`/* ${fname} (plik binarny) */`);
  }
}

document.getElementById("download").onclick = async () => {
  saveCurrentFile();
  let zip = new JSZip();
  for (const fname of Object.keys(allFileContents)) {
    zip.file(fname, allFileContents[fname]);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "app.zip";
  a.click();
};

document.getElementById("deployVercel").onclick = async () => {
  saveCurrentFile();
  const code = allFileContents["index.html"] || window.editor.getValue();
  const payload = {
    name: `ai-generated-app-${Date.now()}`,
    description: "App wygenerowana przez AI App Builder",
    private: false,
    files: {
      "index.html": code,
      "README.md": "# App wygenerowana z AI App Builder"
    }
  };
  const encoded = encodeURIComponent(JSON.stringify(payload));
  window.open(`https://vercel.new/clone?repo-data=${encoded}`, "_blank");
};
