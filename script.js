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
    // Wyciągamy bloki kodu z odpowiedzi i wyświetlamy w panelu bocznym
    showAiCodePreview(data.result);
    // Dodaj tylko komentarz (bez kodów) do czatu
    const explanation = extractExplanation(data.result);
    if (explanation.trim()) addChatMessage("ai", explanation.trim());
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

//// ========== PANEL PODGLĄDU KODU Z AI ========== ////
function showAiCodePreview(aiReply) {
  const preview = document.getElementById("ai-code-preview");
  preview.innerHTML = "";
  const codeBlocks = parseCodeBlocks(aiReply);
  if (!codeBlocks.length) {
    preview.innerHTML = "<em>Brak kodu w odpowiedzi AI.</em>";
    return;
  }
  codeBlocks.forEach((block, idx) => {
    const pre = document.createElement("pre");
    pre.innerHTML = `<code>${escapeHtml(block.code)}</code>`;
    // Dodaj przycisk do wstawiania kodu
    const btn = document.createElement("button");
    btn.className = "ai-insert-btn";
    btn.textContent = "Wstaw do edytora";
    btn.onclick = () => {
      window.editor.setValue(block.code);
      // Spróbuj ustawić odpowiedni język
      if (block.lang) {
        let monacoLang = block.lang === "js" ? "javascript" : block.lang;
        monaco.editor.setModelLanguage(window.editor.getModel(), monacoLang);
      }
    };
    pre.appendChild(btn);
    preview.appendChild(pre);
  });
}

// Parsuje bloki kodu w stylu ```lang\nkod```
function parseCodeBlocks(aiReply) {
  const blocks = [];
  const regex = /```(\w*)\n([\s\S]+?)```/g;
  let match;
  while ((match = regex.exec(aiReply)) !== null) {
    blocks.push({ lang: match[1], code: match[2] });
  }
  return blocks;
}

// Wyciąga tylko tekst przed pierwszym blokiem kodu (wyjaśnienie)
function extractExplanation(aiReply) {
  const firstBlock = aiReply.indexOf("```");
  if (firstBlock === -1) return aiReply;
  return aiReply.slice(0, firstBlock);
}
function escapeHtml(str) {
  return str.replace(/[&<>"']/g, function(m) {
    return ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[m];
  });
}

//// ========== SZABLONY HTML ========== ////
document.getElementById("loadTemplate").onclick = async () => {
  const selected = document.getElementById("templateSelect").value;
  if (!selected) return alert("Wybierz szablon");

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
