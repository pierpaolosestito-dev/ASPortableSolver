const $ = (s) => document.querySelector(s);
const out = $("#out");

// 1) Crea il worker dal file generato
const worker = new Worker(chrome.runtime.getURL("clingo.web.worker.js"));

let initialized = false;

// 2) Ascolta i messaggi dal worker
worker.onmessage = (e) => {
  console.log("Worker response:", e.data);
  if (e.data === null) {
    initialized = true;
    out.textContent += "[Clingo initialized]\n";
    return;
  }
  if (typeof e.data === "string") {
    out.textContent += e.data + "\n";
  } else if (e.data && e.data.Result) {
    out.textContent += JSON.stringify(e.data, null, 2) + "\n";
  }
};

// 3) Inizializza il worker indicando dov’è il .wasm nell’estensione
const wasmUrl = chrome.runtime.getURL("clingo.wasm");
worker.postMessage({ type: "init", wasmUrl });

// 4) Solve
$("#run").addEventListener("click", () => {
  out.textContent = "";
  if (!initialized) {
    out.textContent = "[Error] Clingo not initialized yet";
    return;
  }
  const program = $("#code").value;
  const n = parseInt($("#n").value.trim(), 10) || 0;

  // Il worker del pacchetto accetta {type:"run", args:[program, n]}
  worker.postMessage({
    type: "run",
    args: [program, n]
  });
});
