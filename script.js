// ========== GLOBALNE DANE ==========
let allFileContents = {
  'index.html': '<!-- Zacznij tu tworzyć swój projekt -->',
  'style.css': '',
  'main.js': ''
};
let imageFiles = {}; // { filename: dataUrl }
let openTabs = ['index.html'];
let currentFilePath = 'index.html';

const FILE_ICONS = {
  html: '🟧',
  js: '🟨',
  css: '🟦',
  md: '📘',
  json: '🟦',
  txt: '📑',
  default: '📄'
};

// ========== MONACO EDITOR ==========
require.config({ paths: { vs: 'https://unpkg.com/monaco-editor@0.34.1/min/vs' } });
require(['vs/editor/editor.main'], function () {
  window.editor = monaco.editor.create(document.getElementById('editor'), {
    value: allFileContents['index.html'],
    language: 'html',
    theme: 'vs-dark',
    fontSize: 15,
    minimap: { enabled: false }
  });
  window.editor.onDidChangeModelContent(() => {
    saveCurrentFile();
    updateLivePreview();
  });
  initUI();
});

// ========== INICJALIZACJA UI ==========
function initUI() {
  renderFileTree();
  renderTabs();
  selectFile('index.html');
  renderImageList();
  updateLivePreview();

  // Obsługa przycisku dodawania pliku
  document.getElementById('fileInput').onchange = async (e) => {
    for (const file of e.target.files) {
      if (!file.type.startsWith('image/')) {
        const text = await file.text();
        allFileContents[file.name] = text;
        openFileTab(file.name);
      }
    }
    renderFileTree();
    renderTabs();
    updateLivePreview();
    e.target.value = '';
  };

  // Drag&drop plików
  document.getElementById('file-tree').ondragover = e => { e.preventDefault(); };
  document.getElementById('file-tree').ondrop = onFileDrop;

  // Dodawanie obrazków
  document.getElementById('imgInput').addEventListener('change', onImgInput);

  // Pobieranie ZIP
  document.getElementById('download').onclick = downloadZip;

  // Chat z AI
  document.getElementById('chat-send').onclick = handleChatSend;
  document.getElementById('chat-input').addEventListener('keydown', function (event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      document.getElementById('chat-send').click();
    }
  });

  // Resizery paneli
  resizerSetup();
}

// ========== COLLAPSIBLE PANELS ==========
window.toggleCollapse = function(panelId) {
  const panel = document.getElementById(panelId);
  const arrow = document.getElementById('arrow-' + panelId);
  // Collapsible-body = następny element po headerze, lub id="chat-collapsible-body"
  let body = null;
  if (panelId === 'chat-panel') body = document.getElementById('chat-collapsible-body');
  else body = panel.nextElementSibling;
  if (panel.classList.contains('collapsed')) {
    panel.classList.remove('collapsed');
    panel.classList.add('expanded');
    if (arrow) arrow.innerHTML = '&#9660;';
    if (body) body.style.display = '';
  } else {
    panel.classList.remove('expanded');
    panel.classList.add('collapsed');
    if (arrow) arrow.innerHTML = '&#9654;';
    if (body) body.style.display = 'none';
  }
}

// ========== OBSŁUGA DRZEWA PLIKÓW ==========
function renderFileTree() {
  const tree = document.getElementById('file-tree');
  tree.innerHTML = '';
  Object.keys(allFileContents).sort().forEach(fname => {
    const ext = fname.split('.').pop().toLowerCase();
    const icon = FILE_ICONS[ext] || FILE_ICONS.default;
    const li = document.createElement('li');
    li.draggable = true;
    li.className = (fname === currentFilePath) ? 'selected' : '';
    li.innerHTML = `<span class="file-icon">${icon}</span>${fname}`;

    li.onclick = (e) => {
      if (e.target.className !== 'file-actions' && !e.target.className.includes('fa')) {
        openFileTab(fname);
      }
    };
    li.ondragstart = e => {
      e.dataTransfer.setData('text/plain', fname);
    };

    // Akcje pliku (usuń, zmień nazwę)
    const actions = document.createElement('span');
    actions.className = 'file-actions';
    actions.innerHTML = `
      <button title="Zmień nazwę" onclick="event.stopPropagation();showRenameFileDialog('${fname}');">✏️</button>
      <button title="Usuń plik" onclick="event.stopPropagation();deleteFile('${fname}');">🗑️</button>
    `;
    li.appendChild(actions);
    tree.appendChild(li);
  });
}

// Dodawanie nowego pliku przez modal
function showAddFileDialog() {
  showModal('Nowy plik', `
    <label>Nazwa pliku:</label>
    <input id="new-file-name" placeholder="np. komponent.js" autofocus>
    <div class="modal-actions">
      <button onclick="hideModal()">Anuluj</button>
      <button onclick="addFileFromDialog()">Dodaj</button>
    </div>
  `);
  document.getElementById('new-file-name').addEventListener('keydown', e => {
    if (e.key === 'Enter') addFileFromDialog();
  });
}
function addFileFromDialog() {
  const fname = document.getElementById('new-file-name').value.trim();
  if (!fname || allFileContents[fname]) {
    alert('Nieprawidłowa lub istniejąca nazwa pliku!');
    return;
  }
  allFileContents[fname] = '';
  openFileTab(fname);
  renderFileTree();
  hideModal();
}

// Zmiana nazwy pliku
function showRenameFileDialog(oldName) {
  showModal('Zmień nazwę pliku', `
    <label>Nowa nazwa:</label>
    <input id="rename-file-name" value="${oldName}" autofocus>
    <div class="modal-actions">
      <button onclick="hideModal()">Anuluj</button>
      <button onclick="renameFile('${oldName}')">Zmień</button>
    </div>
  `);
  document.getElementById('rename-file-name').addEventListener('keydown', e => {
    if (e.key === 'Enter') renameFile(oldName);
  });
}
function renameFile(oldName) {
  const newName = document.getElementById('rename-file-name').value.trim();
  if (!newName || allFileContents[newName]) {
    alert('Niepoprawna lub istniejąca nazwa!');
    return;
  }
  allFileContents[newName] = allFileContents[oldName];
  delete allFileContents[oldName];
  openTabs = openTabs.map(n => (n === oldName ? newName : n));
  if (currentFilePath === oldName) currentFilePath = newName;
  renderFileTree();
  renderTabs();
  selectFile(newName);
  hideModal();
}

// Usuwanie pliku
function deleteFile(fname) {
  if (!confirm(`Usunąć plik ${fname}?`)) return;
  delete allFileContents[fname];
  openTabs = openTabs.filter(n => n !== fname);
  if (currentFilePath === fname) {
    currentFilePath = openTabs.length ? openTabs[0] : null;
  }
  renderFileTree();
  renderTabs();
  if (currentFilePath) selectFile(currentFilePath);
  else window.editor.setValue('');
  updateLivePreview();
}

// Obsługa drag&drop
function onFileDrop(e) {
  e.preventDefault();
  const files = Array.from(e.dataTransfer.files);
  for (let file of files) {
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = evt => {
        imageFiles[file.name] = evt.target.result;
        renderImageList();
      };
      reader.readAsDataURL(file);
      continue;
    }
    file.text().then(txt => {
      allFileContents[file.name] = txt;
      openFileTab(file.name);
      renderFileTree();
      renderTabs();
      updateLivePreview();
    });
  }
}

// ========== OBSŁUGA ZAKŁADEK ==========
function renderTabs() {
  const bar = document.getElementById('tabs-bar');
  bar.innerHTML = '';
  openTabs.forEach(fname => {
    const ext = fname.split('.').pop().toLowerCase();
    const icon = FILE_ICONS[ext] || FILE_ICONS.default;
    const tab = document.createElement('div');
    tab.className = 'tab' + (fname === currentFilePath ? ' active' : '');
    tab.innerHTML = `<span class="tab-icon">${icon}</span>${fname}
    <button class="close-btn" title="Zamknij" onclick="closeTab('${fname}', event)">&times;</button>`;
    tab.onclick = () => openFileTab(fname);
    bar.appendChild(tab);
  });
}
function openFileTab(fname) {
  if (!openTabs.includes(fname)) openTabs.push(fname);
  selectFile(fname);
  renderTabs();
}
function selectFile(fname) {
  saveCurrentFile();
  currentFilePath = fname;
  renderFileTree();
  renderTabs();
  loadFileInEditor(fname);
}
function closeTab(fname, e) {
  if (e) e.stopPropagation();
  openTabs = openTabs.filter(n => n !== fname);
  if (currentFilePath === fname) {
    currentFilePath = openTabs.length ? openTabs[openTabs.length - 1] : null;
    if (currentFilePath) loadFileInEditor(currentFilePath);
    else window.editor.setValue('');
  }
  renderTabs();
}

// ========== OBSŁUGA EDYTORA ==========
function loadFileInEditor(fname) {
  if (!window.editor) return;
  const val = allFileContents[fname] || '';
  window.editor.setValue(val);
  let ext = fname.split('.').pop().toLowerCase();
  let lang = ({
    js: 'javascript',
    css: 'css',
    html: 'html',
    md: 'markdown',
    json: 'json',
    txt: 'plaintext'
  })[ext] || 'plaintext';
  monaco.editor.setModelLanguage(window.editor.getModel(), lang);
}
function saveCurrentFile() {
  if (currentFilePath && window.editor) {
    allFileContents[currentFilePath] = window.editor.getValue();
  }
}

// ========== OBRAZKI ==========
function onImgInput(e) {
  for (const file of e.target.files) {
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = evt => {
        imageFiles[file.name] = evt.target.result;
        renderImageList();
        updateLivePreview();
      };
      reader.readAsDataURL(file);
    }
  }
  e.target.value = '';
}
function renderImageList() {
  const div = document.getElementById('img-list');
  div.innerHTML = '';
  Object.entries(imageFiles).forEach(([name, dataUrl]) => {
    const wrap = document.createElement('div');
    wrap.className = 'img-item';
    wrap.title = name;
    wrap.innerHTML = `
      <img src="${dataUrl}">
      <button class="img-remove" title="Usuń" onclick="removeImage('${name}')">×</button>`;
    div.appendChild(wrap);
  });
}
function removeImage(name) {
  if (!confirm(`Usunąć obrazek ${name}?`)) return;
  delete imageFiles[name];
  renderImageList();
  updateLivePreview();
}

// ========== POBIERANIE ZIP ==========
async function downloadZip() {
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
}

// ========== PODGLĄD NA ŻYWO ==========
function updateLivePreview() {
  saveCurrentFile();
  let html = allFileContents["index.html"] || "";
  if (allFileContents["style.css"]) {
    html = html.replace(
      /<\/head>/i,
      `<style>\n${allFileContents["style.css"]}\n</style>\n</head>`
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

// ========== MODAL ==========
function showModal(title, html) {
  document.getElementById('modal').innerHTML = `<h3 style="margin-top:0;">${title}</h3>${html}`;
  document.getElementById('modal-bg').style.display = 'flex';
}
function hideModal() {
  document.getElementById('modal-bg').style.display = 'none';
}

// ========== CHAT Z AI ==========
async function handleChatSend() {
  saveCurrentFile();
  const msg = document.getElementById('chat-input').value.trim();
  if (!msg) return;
  addChatMessage("user", msg);
  setSending(true);

  try {
    const res = await fetch("https://jobtaste.onrender.com/ask", {
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
      setSending(false);
      return;
    }

    if (data.error) {
      addChatMessage("ai", data.raw || JSON.stringify(data));
      setSending(false);
      return;
    }

    if (data.result && typeof data.result === "object") {
      if (data.result.message) addChatMessage("ai", data.result.message);
      if (data.result.files && typeof data.result.files === "object") {
        Object.keys(data.result.files).forEach(fname => {
          allFileContents[fname] = data.result.files[fname];
          if (!openTabs.includes(fname)) openTabs.push(fname);
        });
        renderTabs();
        renderFileTree();
        updateLivePreview();
      }
    } else {
      addChatMessage("ai", "Brak odpowiedzi AI.");
    }
  } catch (err) {
    addChatMessage("ai", "Błąd połączenia z backendem: " + err.message);
  } finally {
    document.getElementById('chat-input').value = '';
    setSending(false);
  }
}
function setSending(isSending) {
  const btn = document.getElementById('chat-send');
  btn.disabled = isSending;
  btn.textContent = isSending ? "Wysyłam..." : "Wyślij";
}
function addChatMessage(who, text) {
  const div = document.createElement("div");
  div.className = who === "user" ? "msg msg-user" : "msg msg-ai";
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;
  div.appendChild(bubble);
  document.getElementById("chat-messages").appendChild(div);
  document.getElementById("chat-messages").scrollTop = document.getElementById("chat-messages").scrollHeight;
}

// ========== RESIZER PANELS ==========
function resizerSetup() {
  function dragHandler(resizer, panelA, panelB, isLeft) {
    let startX, startA, startB;
    resizer.addEventListener('mousedown', function(e) {
      e.preventDefault();
      startX = e.clientX;
      startA = panelA.offsetWidth;
      startB = panelB.offsetWidth;
      resizer.classList.add('active');
      document.body.style.cursor = 'col-resize';

      function onMove(ev) {
        const dx = ev.clientX - startX;
        if (isLeft) {
          let newA = Math.max(170, startA + dx);
          let newB = Math.max(180, startB - dx);
          panelA.style.width = newA + 'px';
          panelB.style.width = newB + 'px';
        } else {
          let newA = Math.max(300, startA + dx);
          let newB = Math.max(180, startB - dx);
          panelA.style.width = newA + 'px';
          panelB.style.width = newB + 'px';
        }
        if (window.editor) window.editor.layout();
      }
      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        resizer.classList.remove('active');
        document.body.style.cursor = '';
        if (window.editor) window.editor.layout();
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }
  dragHandler(
    document.getElementById('resizer-left'),
    document.getElementById('sidebar-panel'),
    document.getElementById('editor-panel'),
    true
  );
  dragHandler(
    document.getElementById('resizer-right'),
    document.getElementById('editor-panel'),
    document.getElementById('right-panel'),
    false
  );
}

// ========== EKSPORT FUNKCJI DO HTML ==========
window.showRenameFileDialog = showRenameFileDialog;
window.renameFile = renameFile;
window.deleteFile = deleteFile;
window.removeImage = removeImage;
window.closeTab = closeTab;
window.hideModal = hideModal;
window.openFileTab = openFileTab;
window.addFileFromDialog = addFileFromDialog;
