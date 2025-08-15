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
