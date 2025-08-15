const BACKEND_URL = "https://TWÓJ-BACKEND.onrender.com/ask";

require.config({ paths: { vs: 'https://unpkg.com/monaco-editor@0.34.1/min/vs' }});
require(["vs/editor/editor.main"], function () {
  window.editor = monaco.editor.create(document.getElementById('editor'), {
    value: "<!-- wczytaj tutaj swój kod szablonu -->",
    language: "html"
  });
});

document.getElementById("send").onclick = async () => {
  const prompt = document.getElementById("prompt").value;
  const code = window.editor.getValue();

  const res = await fetch(BACKEND_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, code })
  });

  const data = await res.json();
  window.editor.setValue(data.result);
};
// --- ładowanie szablonu ---
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

  // tworzymy plik README w payloadzie, bo Vercel tego wymaga
  const payload = {
    name: `ai-generated-app-${Date.now()}`,
    description: "App wygenerowana przez AI App Builder",
    private: false,
    files: {
      "index.html": code,
      "README.md": "# App wygenerowana z AI App Builder"
    }
  };

  // otwarcie gotowego linku Vercel
  const encoded = encodeURIComponent(JSON.stringify(payload));
  window.open(`https://vercel.new/clone?repo-data=${encoded}`, "_blank");
};
