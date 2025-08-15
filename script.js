const BACKEND_URL = "https://jobtaste.onrender.com/ask";

// Monaco Editor inicjalizacja
require.config({ paths: { vs: 'https://unpkg.com/monaco-editor@0.34.1/min/vs' }});
require(["vs/editor/editor.main"], function () {
  window.editor = monaco.editor.create(document.getElementById('editor'), {
    value: "<!-- wczytaj tutaj swój kod szablonu -->",
    language: "html"
  });
});

// --- czat AI panel ---
document.getElementById("chat-send").onclick = async () => {
  const input = document.getElementById("chat-input");
  const msg = input.value.trim();
  if (!msg) return;

  addChatMessage("user", msg);

  const code = window.editor.getValue();
  const res = await fetch(BACKEND_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: msg, code })
  });
  const data = await res.json();
  addChatMessage("ai", data.result);

  input.value = "";
};

// Wysyłanie wiadomości Enterem (Shift+Enter = nowa linia)
const chatInput = document.getElementById("chat-input");
chatInput.addEventListener("keydown", function(event) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    document.getElementById("chat-send").click();
  }
});

function addChatMessage(who, text) {
  const chat = document.getElementById("chat-messages");
  const div = document.createElement("div");
  div.className = who === "user" ? "msg-user" : "msg-ai";
  div.textContent = (who === "user" ? "Ty: " : "AI: ") + text;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

// --- kodowanie panel: obsługa edytora i szablonów ---
document.getElementById("loadTemplate").onclick = async () => {
  const selected = document.getElementById("templateSelect").value;
  if (!selected) return alert("Wybierz szablon");

  const res = await fetch(`/templates/${selected}.html`);
  const templateCode = await res.text();
  window.editor.setValue(templateCode);
};

// --- pobieranie gotowego kodu ---
document.getElementById("download").onclick = () => {
  const code = window.editor.getValue();
  const blob = new Blob([code], { type: "text/html" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "app.html";
  a.click();
};

// --- deploy do Vercel ---
document.getElementById("deployVercel").onclick = async () => {
  const code = window.editor.getValue();

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
