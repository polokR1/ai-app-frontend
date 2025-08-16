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

  // Zawsze wysyłamy CAŁY PROJEKT do AI
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
      // Odpowiedź zawiera pliki → traktuj jako zmiany w projekcie
      let changedFiles = Object.keys(data.result);
      changedFiles.forEach(fname => {
        allFileContents[fname] = data.result[fname];
        if (!zipObj && fname === "index.html") {
          window.editor.setValue(data.result[fname]);
        }
        if (zipObj && fname === currentFilePath) {
          window.editor.setValue(data.result[fname]);
        }
      });
      showAiCodePreview("Zmodyfikowane pliki: " + changedFiles.join(", "));
      addChatMessage("ai", "Zaktualizowałem pliki: " + changedFiles.join(", "));
    } else if (typeof data.result === "string") {
      // Odpowiedź to zwykły tekst → pokaż w czacie
      addChatMessage("ai", data.result);
    } else {
      showAiCodePreview("Nie udało się sparsować odpowiedzi AI.");
      addChatMessage("ai", "Nie udało się odczytać odpowiedzi AI.");
    }
  } catch (e) {
    addChatMessage("ai", "Błąd połączenia z backendem :(");
  }
  input.value = "";
}

function addChatMessage(who, text) {
  const chat = document.getElementById("chat-messages");
  const div = document.createElement("div");
  div.className = who === "user" ? "msg msg-user" : "msg msg-ai";

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;

  div.appendChild(bubble);
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

//// ========== PANEL PODGLĄDU KODU Z AI ========== ////
function showAiCodePreview(aiReply) {
  const preview = document.getElementById("ai-code-preview");
  preview.innerHTML = "";
  if (!aiReply) {
    preview.innerHTML = "<em>Brak kodu w odpowiedzi AI.</em>";
    return;
  }
  if (typeof aiReply === "string" && aiReply.startsWith("Zmodyfikowane pliki:")) {
    preview.textContent = aiReply;
    return;
  }
}

// ========== SZABLONY HTML ========== //
document.getElementById("loadTemplate").onclick = async () => {
  const selected = document.getElementById("templateSelect").value;
  if (!selected) return alert("Wybierz szablon");

  clearExplorer();

  const res = await fetch(`/templates/${selected}.html`);
  const templateCode = await res.text();
  window.editor.setValue(templateCode);
  monaco.editor.setModelLanguage(window.editor.getModel(), "html");
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

//// ========== POBIERANIE CAŁEGO PROJEKTU JAKO ZIP ========== ////
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

//// ========== DEPLOY DO VERCEL (TYLKO HTML) ========== ////
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
