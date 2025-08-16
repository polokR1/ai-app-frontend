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

sendBtn.onclick = handleChatSend;
chatInput.addEventListener("keydown", function(event) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendBtn.click();
  }
});

// ========== Stan plików / ZIP ==========
let zipFile, zipObj, currentFilePath, allFileContents = {};

// ========== Wysyłka do backendu + obsługa odpowiedzi ==========
async function handleChatSend() {
  const msg = chatInput.value.trim();
  if (!msg) return;

  addChatMessage("user", msg);
  setSending(true);

  // Zbuduj payload z całym projektem
  let filesToSend = {};
  if (zipObj) {
    saveCurrentFile();
    filesToSend = { ...allFileContents };
  } else {
    filesToSend = { "index.html": window.editor.getValue() };
  }

  let responseText = "";
  try {
    const res = await fetch(BACKEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: msg, files: filesToSend })
    });

    responseText = await res.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      // Backend nie zwrócił JSON → pokaż raw
      data = { rawText: responseText, status: res.status };
    }

    debugRaw(data);

    const { files, message } = normalizeResponse(data);

    let changedFiles = [];
    if (files && typeof files === 'object') {
      changedFiles = applyFileChanges(files);
    }

    if (message) {
      addChatMessage("ai", message);
    }

    if (changedFiles.length > 0) {
      showAiCodePreview("Zmodyfikowane pliki: " + changedFiles.join(", "));
      addChatMessage("ai", "Zaktualizowałem pliki: " + changedFiles.join(", "));
    }

    if (!message && changedFiles.length === 0) {
      addChatMessage("ai", "Odpowiedź nie zawierała tekstu ani zmian plików. Sprawdź podgląd surowej odpowiedzi poniżej.");
    }
  } catch (err) {
    addChatMessage("ai", "Błąd połączenia z backendem. Szczegóły w konsoli.");
    console.error("Błąd fetch:", err);
    showAiCodePreview("Błąd połączenia z backendem");
  } finally {
    chatInput.value = "";
    setSending(false);
  }
}

// Ujednolicenie odpowiedzi backendu do {files, message}
function normalizeResponse(data) {
  // Przypadek 1: nasz pierwotny format
  if (data && typeof data.result !== 'undefined') {
    // jeśli string → wiadomość
    if (typeof data.result === 'string') {
      return { files: null, message: data.result };
    }
    // jeśli ma .files → zmiany plików + ewentualna wiadomość
    if (data.result && typeof data.result === 'object') {
      if (data.result.files && typeof data.result.files === 'object') {
        return { files: data.result.files, message: data.result.message || null };
      }
      // Jeśli obiekt wygląda jak mapa plików (klucze zakończone rozszerzeniami, wartości string)
      if (looksLikeFilesMap(data.result)) {
        return { files: data.result, message: data.message || null };
      }
    }
  }

  // Przypadek 2: płaski { files, message }
  if (data && data.files && typeof data.files === 'object') {
    return { files: data.files, message: data.message || null };
  }

  // Przypadek 3: OpenAI style
  const openaiMsg = data?.choices?.[0]?.message?.content || data?.message || data?.answer || data?.content;
  if (typeof openaiMsg === 'string') {
    return { files: null, message: openaiMsg };
  }

  // Przypadek 4: czysty tekst bez JSON
  if (typeof data?.rawText === 'string') {
    return { files: null, message: data.rawText };
  }

  return { files: null, message: null };
}

function looksLikeFilesMap(obj) {
  const keys = Object.keys(obj);
  if (keys.length === 0) return false;
  // co najmniej 1 klucz z rozszerzeniem oraz wartości typu string
  return keys.some(k => /\.[a-z0-9]+$/i.test(k)) && keys.every(k => typeof obj[k] === 'string');
}

// Zastosuj zmiany plików + zaktualizuj UI/edytor
function applyFileChanges(filesObj) {
  const changed = [];
  for (const [fname, content] of Object.entries(filesObj)) {
    allFileContents[fname] = content;
    ensureFileInExplorer(fname);

    if (zipObj) {
      if (fname === currentFilePath) {
        window.editor.setValue(content);
      }
    } else {
      if (fname === "index.html") {
        window.editor.setValue(content);
      }
    }
    changed.push(fname);
  }
  return changed;
}

// Dodać plik do eksploratora, jeżeli go jeszcze nie ma
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

// ========== Podgląd / debug ==========
function showAiCodePreview(text) {
  const preview = document.getElementById("ai-code-preview");
  preview.innerHTML = text ? text : "<em>Brak danych.</em>";
}

function debugRaw(obj) {
  const preview = document.getElementById("ai-code-preview");
  const pre = document.createElement('pre');
  pre.style.whiteSpace = 'pre-wrap';
  pre.style.wordBreak = 'break-word';
  pre.textContent = JSON.stringify(obj, null, 2);

  const wrap = document.createElement('details');
  const sum = document.createElement('summary');
  sum.textContent = 'Surowa odpowiedź backendu';
  wrap.appendChild(sum);
  wrap.appendChild(pre);

  // Nie kasuj poprzedniej informacji o "Zmodyfikowane pliki" – dołóż pod spodem
  if (!preview.innerHTML) preview.innerHTML = "<em>Odpowiedź z backendu poniżej.</em>";
  preview.appendChild(wrap);
}

// ========== SZABLONY HTML ==========
document.getElementById("loadTemplate").onclick = async () => {
  const selected = document.getElementById("templateSelect").value;
  if (!selected) return alert("Wybierz szablon");

  clearExplorer();

  const res = await fetch(`/templates/${selected}.html`);
  const templateCode = await res.text();
  window.editor.setValue(templateCode);
  monaco.editor.setModelLanguage(window.editor.getModel(), "html");
};

// ========== ZIPY ==========
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

// ========== Pobieranie ZIP ==========
document.getElementById("download").onclick = async () => {
  saveCurrentFile();
  let zip = new JSZip();

  if (zipObj) {
    for (const fname of Object.keys(allFileContents)) {
      zip.file(fname, allFileContents[fname]);
    }
  } else {
    zip.file("index.html", window.editor.getValue());
  }
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "app.zip";
  a.click();
};

// ========== Deploy do Vercel (tylko HTML) ==========
document.getElementById("deployVercel").onclick = async () => {
  let code;
  if (zipObj) {
    saveCurrentFile();
    code = allFileContents["index.html"] || window.editor.getValue();
  } else {
    code = window.editor.getValue();
  }
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
