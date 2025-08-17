const BACKEND_URL = "https://jobtaste.onrender.com/ask";

// ========== Monaco Editor ==========
require.config({ paths: { vs: 'https://unpkg.com/monaco-editor@0.34.1/min/vs' }});
require(["vs/editor/editor.main"], function () {
  window.editor = monaco.editor.create(document.getElementById('editor'), {
    value: "<!-- wczytaj tutaj swój kod szablonu -->",
    language: "html"
  });
  window.editor.onDidChangeModelContent(updateLivePreview);
});

// ========== Elementy UI ==========
const sendBtn = document.getElementById("chat-send");
const chatInput = document.getElementById("chat-input");
const chatBox = document.getElementById("chat-messages");
const preview = document.getElementById("ai-code-preview");

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

// ========== Obsługa ZIP ==========
const zipInput = document.getElementById("zipInput");
const loadZipBtn = document.getElementById("loadZip");

zipInput.addEventListener("change", (e) => {
  zipFile = e.target.files[0];
  loadZipBtn.disabled = !zipFile;
});

loadZipBtn.addEventListener("click", async () => {
  if (!zipFile) return;
  clearExplorer();
  allFileContents = {};

  const arrayBuffer = await zipFile.arrayBuffer();
  zipObj = await JSZip.loadAsync(arrayBuffer);

  const fileList = Object.keys(zipObj.files).filter(f => !zipObj.files[f].dir);
  if (fileList.length === 0) {
    alert("ZIP jest pusty!");
    return;
  }

  showFileExplorer(fileList);

  let mainFile = fileList.find(f => f.match(/index\.html$/i)) || fileList[0];
  selectFileInExplorer(mainFile);
  await loadAndShowFile(mainFile);
  updateLivePreview();
});

function showFileExplorer(fileList) {
  const explorer = document.getElementById("file-explorer");
  explorer.innerHTML = "";
  fileList.forEach(fname => {
    const el = document.createElement("span");
    el.textContent = fname;
    el.className = "file";
    el.onclick = async () => {
      saveCurrentFile();
      selectFileInExplorer(fname);
      await loadAndShowFile(fname);
      updateLivePreview();
    };
    explorer.appendChild(el);
  });
}

function selectFileInExplorer(fname) {
  currentFilePath = fname;
  const nodes = document.querySelectorAll("#file-explorer .file");
  nodes.forEach(n => n.classList.toggle("selected", n.textContent === fname));
}

async function loadAndShowFile(fname) {
  if (!allFileContents[fname]) {
    allFileContents[fname] = await zipObj.file(fname).async("string");
  }
  window.editor.setValue(allFileContents[fname]);
  let ext = fname.split('.').pop().toLowerCase();
  let lang = (ext === "js") ? "javascript" : (ext === "css" ? "css" : (ext === "json" ? "json" : "html"));
  monaco.editor.setModelLanguage(window.editor.getModel(), lang);
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

// ========== Szablony HTML ==========
document.getElementById("loadTemplate").onclick = async () => {
  const selected = document.getElementById("templateSelect").value;
  if (!selected) return alert("Wybierz szablon");

  clearExplorer();

  const res = await fetch(`/templates/${selected}.html`);
  const templateCode = await res.text();
  window.editor.setValue(templateCode);
  monaco.editor.setModelLanguage(window.editor.getModel(), "html");
  updateLivePreview();
};

// ========== AI CHAT ==========
async function handleChatSend() {
  const msg = chatInput.value.trim();
  if (!msg) return;

  addChatMessage("user", msg);
  setSending(true);
  preview.innerHTML = "<em>Oczekiwanie na odpowiedź AI...</em>";

  let filesToSend = {};
  if (zipObj) {
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

    const data = await res.json();

    if (data.result && typeof data.result === "object") {
      let changedFiles = Object.keys(data.result);
      changedFiles.forEach(fname => {
        allFileContents[fname] = data.result[fname];
        ensureFileInExplorer(fname);
        if ((!zipObj && fname === "index.html") || (zipObj && fname === currentFilePath)) {
          window.editor.setValue(data.result[fname]);
        }
      });
      preview.textContent = "Zmodyfikowane pliki: " + changedFiles.join(", ");
      updateLivePreview();
    } else {
      preview.textContent = "Nie udało się sparsować odpowiedzi AI.";
    }
  } catch (err) {
    addChatMessage("ai", "Błąd połączenia z backendem: " + err.message);
    preview.textContent = err.message;
  } finally {
    chatInput.value = "";
    setSending(false);
  }
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
    updateLivePreview();
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

// ========== Pobieranie ZIP ==========
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

// ========== Deploy do Vercel ==========
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

// ========== Podgląd na żywo ==========
function updateLivePreview() {
  // Budujemy index.html z plików projektu i inline-ujemy style + js
  let html = allFileContents["index.html"] || window.editor.getValue();
  if (allFileContents["styles.css"]) {
    html = html.replace(
      /<\/head>/i,
      `<style>\n${allFileContents["styles.css"]}\n</style>\n</head>`
    );
  }
  if (allFileContents["main.js"]) {
    html = html.replace(
      /<\/body>/i,
      `<script>\n${allFileContents["main.js"]}\n</script>\n</body>`
    );
  }
  document.getElementById("live-preview").srcdoc = html;
}

// Inicjalne wywołanie
window.addEventListener("DOMContentLoaded", updateLivePreview);
