const BACKEND_URL = "https://jobtaste.onrender.com/ask";

// ========== Monaco Editor ==========
require.config({ paths: { vs: 'https://unpkg.com/monaco-editor@0.34.1/min/vs' }});
require(["vs/editor/editor.main"], function () {
  window.editor = monaco.editor.create(document.getElementById('editor'), {
    value: "<!-- wczytaj tutaj swój kod szablonu -->",
    language: "html"
  });
  window.editor.onDidChangeModelContent(updateLivePreview);

  // ========== Inicjalizacja ==========
  window.addEventListener("DOMContentLoaded", () => {
    showFileExplorer();
    selectFileInExplorer("index.html");
    loadAndShowFile("index.html");
    refreshImgList();
    updateLivePreview();
  });
});

const sendBtn = document.getElementById("chat-send");
const chatInput = document.getElementById("chat-input");
const chatBox = document.getElementById("chat-messages");
const preview = document.getElementById("ai-code-preview");

// ========== Obsługa plików projektu ==========
let allFileContents = {
  "index.html": "<!-- wczytaj tutaj swój kod szablonu -->",
  "styles.css": "",
  "main.js": ""
};
let currentFilePath = "index.html";

// ========== Obsługa obrazków ==========
let imageFiles = {}; // { fileName: dataUrl }

// ========== Obsługa wgrywania wielu plików ==========
const multiFileInput = document.createElement("input");
multiFileInput.type = "file";
multiFileInput.multiple = true;
multiFileInput.id = "multiFileInput";
const multiFileLabel = document.createElement("label");
multiFileLabel.textContent = "Wczytaj pliki szablonu:";
multiFileLabel.appendChild(multiFileInput);
document.querySelector(".code-panel").insertBefore(multiFileLabel, document.getElementById("file-explorer"));

multiFileInput.addEventListener("change", async (e) => {
  const files = Array.from(e.target.files);
  for (let file of files) {
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = function(evt) {
        imageFiles[file.name] = evt.target.result;
        refreshImgList();
      };
      reader.readAsDataURL(file);
      continue;
    }
    // Pliki tekstowe
    const text = await file.text();
    allFileContents[file.name] = text;
    ensureFileInExplorer(file.name);
  }
  if (files.length > 0) {
    currentFilePath = files[0].name;
    window.editor.setValue(allFileContents[currentFilePath]);
    selectFileInExplorer(currentFilePath);
    updateLivePreview();
  }
  showFileExplorer();
});

// ========== Obsługa obrazków (dodatkowy input) ==========
const imgInput = document.createElement("input");
imgInput.type = "file";
imgInput.accept = "image/*";
imgInput.multiple = true;
imgInput.id = "imgInput";
const imgLabel = document.createElement("label");
imgLabel.textContent = "Dodaj obrazek:";
imgLabel.appendChild(imgInput);
document.querySelector(".code-panel").insertBefore(imgLabel, document.getElementById("file-explorer"));

const imgListDiv = document.createElement("div");
imgListDiv.id = "img-list";
imgListDiv.style.margin = "10px 0";
document.querySelector(".code-panel").insertBefore(imgListDiv, document.getElementById("file-explorer"));

imgInput.addEventListener("change", async (e) => {
  for (const file of e.target.files) {
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = function(evt) {
        imageFiles[file.name] = evt.target.result;
        refreshImgList();
      };
      reader.readAsDataURL(file);
    }
  }
});

function refreshImgList() {
  const container = document.getElementById("img-list");
  container.innerHTML = "";
  Object.entries(imageFiles).forEach(([name, dataUrl]) => {
    const img = document.createElement("img");
    img.src = dataUrl;
    img.style.maxWidth = "60px";
    img.style.maxHeight = "60px";
    img.title = name;
    container.appendChild(img);
    const span = document.createElement("span");
    span.textContent = name;
    span.style.fontSize = "0.8em";
    span.style.marginRight = "10px";
    container.appendChild(span);
  });
}

// ========== Eksplorator plików ==========
function showFileExplorer() {
  const explorer = document.getElementById("file-explorer");
  explorer.innerHTML = "";
  Object.keys(allFileContents).forEach(fname => {
    ensureFileInExplorer(fname);
  });
}
function ensureFileInExplorer(fname) {
  const explorer = document.getElementById("file-explorer");
  if ([...explorer.children].some(n => n.textContent === fname)) return;
  const el = document.createElement("span");
  el.textContent = fname;
  el.className = "file";
  el.onclick = () => {
    saveCurrentFile();
    selectFileInExplorer(fname);
    loadAndShowFile(fname);
    updateLivePreview();
  };
  explorer.appendChild(el);
}
function selectFileInExplorer(fname) {
  currentFilePath = fname;
  const nodes = document.querySelectorAll("#file-explorer .file");
  nodes.forEach(n => n.classList.toggle("selected", n.textContent === fname));
}
function loadAndShowFile(fname) {
  if (!window.editor || typeof window.editor.setValue !== "function") return;
  window.editor.setValue(allFileContents[fname] || "");
  let ext = fname.split('.').pop().toLowerCase();
  let lang = (ext === "js") ? "javascript" :
             (ext === "css") ? "css" :
             (ext === "json") ? "json" :
             (ext === "md") ? "markdown" :
             (ext === "txt") ? "plaintext" : "html";
  monaco.editor.setModelLanguage(window.editor.getModel(), lang);
}
function saveCurrentFile() {
  if (currentFilePath && window.editor && typeof window.editor.getValue === "function") {
    allFileContents[currentFilePath] = window.editor.getValue();
  }
}

// ========== AI CHAT ==========
sendBtn.onclick = handleChatSend;
chatInput.addEventListener("keydown", function(event) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendBtn.click();
  }
});

async function handleChatSend() {
  saveCurrentFile();
  const msg = chatInput.value.trim();
  if (!msg) return;
  addChatMessage("user", msg);
  setSending(true);
  preview.innerHTML = "<em>Oczekiwanie na odpowiedź AI...</em>";

  try {
    const res = await fetch(BACKEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: msg, files: allFileContents, images: imageFiles })
    });

    let rawText = await res.text();
    let data;
    try {
      data = JSON.parse(rawText);
    } catch (e) {
      addChatMessage("ai", rawText);
      preview.textContent = "Niepoprawna odpowiedź z API: " + rawText;
      setSending(false);
      return;
    }

    if (data.error) {
      addChatMessage("ai", data.raw || JSON.stringify(data));
      preview.textContent = "Błąd backendu: " + (data.raw || JSON.stringify(data));
      setSending(false);
      return;
    }

    let aiMessage = "";
    let changedFiles = [];

    if (data.result && typeof data.result === "object") {
      if (data.result.message) addChatMessage("ai", data.result.message);
      if (data.result.files && typeof data.result.files === "object") {
        changedFiles = Object.keys(data.result.files);
        changedFiles.forEach(fname => {
          allFileContents[fname] = data.result.files[fname];
          if (fname === currentFilePath) {
            window.editor.setValue(data.result.files[fname]);
          }
          ensureFileInExplorer(fname);
        });
        updateLivePreview();
        aiMessage = changedFiles.length
          ? "Zaktualizowałem pliki: " + changedFiles.join(", ")
          : "";
        preview.textContent = aiMessage || "Brak zmian w plikach.";
      }
      showFileExplorer();
    } else {
      addChatMessage("ai", "Brak odpowiedzi AI.");
    }

  } catch (err) {
    addChatMessage("ai", "Błąd połączenia z backendem: " + err.message);
    preview.textContent = err.message;
  } finally {
    chatInput.value = "";
    setSending(false);
  }
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
  if (typeof JSZip === "undefined") {
    alert("Nie udało się załadować biblioteki JSZip!");
    return;
  }
  let zip = new JSZip();
  Object.keys(allFileContents).forEach(fname => {
    zip.file(fname, allFileContents[fname] || "");
  });
  for (const [fname, dataUrl] of Object.entries(imageFiles)) {
    const base64 = dataUrl.split(",")[1];
    zip.file(fname, base64, {base64: true});
  }
  try {
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "webapp.zip";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  } catch (e) {
    alert("Błąd podczas generowania ZIP: " + e.message);
  }
};

// ========== Podgląd na żywo ==========
function updateLivePreview() {
  saveCurrentFile();
  let html = allFileContents["index.html"] || "";
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
  // Zamień src="nazwa.png" na dataURL jeśli jest taki obrazek
  html = html.replace(/src\s*=\s*["']([^"']+)["']/g, (match, fname) => {
    if (imageFiles[fname]) return `src="${imageFiles[fname]}"`;
    return match;
  });
  document.getElementById("live-preview").srcdoc = html;
}

// ========== Deploy do Vercel ==========
document.getElementById("deployVercel").onclick = async () => {
  saveCurrentFile();
  const code = allFileContents["index.html"] || window.editor.getValue();
  const payload = {
    name: `ai-generated-app-${Date.now()}`,
    description: "App wygenerowana przez AI App Builder",
    private: false,
    files: {
      ...allFileContents,
      "README.md": "# App wygenerowana z AI App Builder"
    }
  };
  const encoded = encodeURIComponent(JSON.stringify(payload));
  window.open(`https://vercel.new/clone?repo-data=${encoded}`, "_blank");
};
