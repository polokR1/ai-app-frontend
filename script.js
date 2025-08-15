const BACKEND_URL = "https://jobtaste.onrender.com/ask";

// Monaco Editor inicjalizacja
require.config({ paths: { vs: 'https://unpkg.com/monaco-editor@0.34.1/min/vs' }});
require(["vs/editor/editor.main"], function () {
  window.editor = monaco.editor.create(document.getElementById('editor'), {
    value: "<!-- wczytaj tutaj swój kod szablonu -->",
    language: "html"
  });
});

//// ========== AI CHAT ========== ////
document.getElementById("chat-send").onclick = handleChatSend;
const chatInput = document.getElementById("chat-input");
chatInput.addEventListener("keydown", function(event) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    document.getElementById("chat-send").click();
  }
});

async function handleChatSend() {
  const input = document.getElementById("chat-input");
  const msg = input.value.trim();
  if (!msg) return;

  addChatMessage("user", msg);

  // domyślnie wysyłamy kod z edytora
  const code = window.editor.getValue();
  try {
    const res = await fetch(BACKEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: msg, code })
    });
    const data = await res.json();
    addChatMessage("ai", data.result);
  } catch (e) {
    addChatMessage("ai", "Błąd połączenia z backendem :(");
  }
  input.value = "";
}

function addChatMessage(who, text) {
  const chat = document.getElementById("chat-messages");
  const div = document.createElement("div");
  div.className = who === "user" ? "msg-user" : "msg-ai";
  div.textContent = (who === "user" ? "Ty: " : "AI: ") + text;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

//// ========== SZABLONY HTML ========== ////
document.getElementById("loadTemplate").onclick = async () => {
  const selected = document.getElementById("templateSelect").value;
  if (!selected) return alert("Wybierz szablon");

  // czyścimy explorer plików
  clearExplorer();

  const res = await fetch(`/templates/${selected}.html`);
  const templateCode = await res.text();
  window.editor.setValue(templateCode);
};

//// ========== OBSŁUGA ZIPÓW ========== ////
let zipFile, zipObj, currentFilePath, allFileContents = {};

const zipInput = document.getElementById("zipInput");
const loadZipBtn = document.getElementById("loadZip");

zipInput.addEventListener("change", (e) => {
  zipFile = e.target.files[0];
  loadZipBtn.disabled = !zipFile;
});

loadZipBtn.addEventListener("click", async () => {
  if (!zipFile) return;
  // czyścimy explorer i stan
  clearExplorer();
  allFileContents = {};

  const arrayBuffer = await zipFile.arrayBuffer();
  zipObj = await JSZip.loadAsync(arrayBuffer);

  // wylistuj wszystkie pliki (bez folderów)
  const fileList = Object.keys(zipObj.files).filter(f => !zipObj.files[f].dir);
  if (fileList.length === 0) {
    alert("ZIP jest pusty!");
    return;
  }

  showFileExplorer(fileList);

  // domyślnie wybierz index.html lub pierwszy plik
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
      saveCurrentFile(); // zapisz zmiany bieżącego pliku
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
  // jeśli już mamy w pamięci, nie pobieraj jeszcze raz
  if (!allFileContents[fname]) {
    allFileContents[fname] = await zipObj.file(fname).async("string");
  }
  window.editor.setValue(allFileContents[fname]);
  // automatycznie wykryj język w Monaco
  let ext = fname.split('.').pop().toLowerCase();
  let lang = (ext === "js") ? "javascript" : (ext === "css" ? "css" : (ext === "json" ? "json" : "html"));
  monaco.editor.setModelLanguage(window.editor.getModel(), lang);
}

function saveCurrentFile() {
  // zapisz zmiany z edytora do allFileContents
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

//// ========== POBIERANIE CAŁEGO PROJEKTU JAKO ZIP ========== ////
document.getElementById("download").onclick = async () => {
  saveCurrentFile();
  let zip = new JSZip();

  // jeśli mamy ZIPa – pobierz pełny projekt (ze zmianami)
  if (zipObj) {
    // kopiuj wszystkie pliki z allFileContents
    for (const fname of Object.keys(allFileContents)) {
      zip.file(fname, allFileContents[fname]);
    }
  } else {
    // jeśli nie – pobieramy tylko kod z edytora jako index.html
    zip.file("index.html", window.editor.getValue());
  }
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "app.zip";
  a.click();
};

//// ========== DEPLOY DO VERCEL (TYLKO HTML) ========== ////
document.getElementById("deployVercel").onclick = async () => {
  let code;
  if (zipObj) {
    saveCurrentFile();
    // jeśli w ZIPie jest index.html, użyj go
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
