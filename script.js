const BACKEND_URL = "https://jobtaste.onrender.com/ask";

// Monaco Editor
require.config({ paths: { vs: 'https://unpkg.com/monaco-editor@0.34.1/min/vs' }});
require(["vs/editor/editor.main"], function () {
  window.editor = monaco.editor.create(document.getElementById('editor'), {
    value: "<!-- wczytaj tutaj swój kod szablonu -->",
    language: "html"
  });
  window.editor.onDidChangeModelContent(updateLivePreview);
});

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

// ========== Obsługa plików projektu ==========
let allFileContents = {
  "index.html": "<!-- wczytaj tutaj swój kod szablonu -->",
  "styles.css": "",
  "main.js": ""
};
let currentFilePath = "index.html";

// ========== Obsługa obrazków ==========
let imageFiles = {}; // { fileName: dataUrl }

document.getElementById("imgInput").addEventListener("change", async (e) => {
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
    // Dodaj info o nazwie
    const span = document.createElement("span");
    span.textContent = name;
    span.style.fontSize = "0.8em";
    span.style.marginRight = "10px";
    container.appendChild(span);
  });
}

// ========== Prosty eksplorator plików ==========
const fileList = ["index.html", "styles.css", "main.js"];
function showFileExplorer() {
  const explorer = document.getElementById("file-explorer");
  explorer.innerHTML = "";
  fileList.forEach(fname => {
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
  });
}
function selectFileInExplorer(fname) {
  currentFilePath = fname;
  const nodes = document.querySelectorAll("#file-explorer .file");
  nodes.forEach(n => n.classList.toggle("selected", n.textContent === fname));
}
function loadAndShowFile(fname) {
  window.editor.setValue(allFileContents[fname] || "");
  let ext = fname.split('.').pop().toLowerCase();
  let lang = (ext === "js") ? "javascript" : (ext === "css" ? "css" : (ext === "json" ? "json" : "html"));
  monaco.editor.setModelLanguage(window.editor.getModel(), lang);
}
function saveCurrentFile() {
  if (currentFilePath) {
    allFileContents[currentFilePath] = window.editor.getValue();
  }
}

// ========== Szablony ==========
document.getElementById("loadTemplate").onclick = async () => {
  const selected = document.getElementById("templateSelect").value;
  if (!selected) return alert("Wybierz szablon");
  saveCurrentFile();
  const res = await fetch(`/templates/${selected}.html`);
  const templateCode = await res.text();
  allFileContents = {
    "index.html": templateCode,
    "styles.css": "",
    "main.js": ""
  };
  currentFilePath = "index.html";
  showFileExplorer();
  loadAndShowFile("index.html");
  updateLivePreview();
};

// ========== AI CHAT ==========
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

    const data = await res.json();

    if (data.result && typeof data.result === "object") {
      let changedFiles = Object.keys(data.result);
      changedFiles.forEach(fname => {
        allFileContents[fname] = data.result[fname];
        if (fname === currentFilePath) {
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
  for (const fname of fileList) {
    zip.file(fname, allFileContents[fname] || "");
  }
  for (const [fname, dataUrl] of Object.entries(imageFiles)) {
    // domyślnie PNG, ale można wyciągnąć typ z dataUrl
    const base64 = dataUrl.split(",")[1];
    const mime = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/);
    zip.file(fname, base64, {base64: true});
  }
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "webapp.zip";
  a.click();
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

// ========== Inicjalizacja ==========
window.addEventListener("DOMContentLoaded", () => {
  showFileExplorer();
  selectFileInExplorer("index.html");
  loadAndShowFile("index.html");
  refreshImgList();
  updateLivePreview();
});
