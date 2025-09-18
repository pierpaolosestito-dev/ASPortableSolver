const $ = (s) => document.querySelector(s);
const out = $("#out");
const badge = $("#status-badge");
const runBtn = $("#run");
const copyBtn = $("#copy");
const clearBtn = $("#clear");
const themeToggle = $("#theme-toggle");

/* ---------------- Theme handling (override prefers-color-scheme) ---------------- */
function getSystemPref() {
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

function applyTheme(theme) {
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  // Update toggle label/icon
  if (theme === "light") {
    themeToggle.textContent = "☀ Light";
  } else {
    themeToggle.textContent = "☾ Dark";
  }
}

// Load saved theme, else system preference
const savedTheme = localStorage.getItem("asportable-theme");
applyTheme(savedTheme || getSystemPref());

// Toggle on click & persist
themeToggle.addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme") || "dark";
  const next = current === "dark" ? "light" : "dark";
  applyTheme(next);
  localStorage.setItem("asportable-theme", next);
});

/* ---------------- Solver wiring ---------------- */
const worker = new Worker(chrome.runtime.getURL("clingo.web.worker.js"));
let initialized = false;

worker.onmessage = (e) => {
  console.log("Worker response:", e.data);

  // Init ack (the worker posts `null` after init)
  if (e.data === null) {
    initialized = true;
    runBtn.disabled = false;
    if (badge) {
      badge.textContent = "ready • WebAssembly";
      badge.classList.add("ok"); // turns the badge green via CSS
    }
    out.textContent += "[Clingo initialized]\n";
    return;
  }

  if (typeof e.data === "string") {
    out.textContent += e.data + "\n";
  } else if (e.data && e.data.Result) {
    out.textContent += JSON.stringify(e.data, null, 2) + "\n";
  }
};

// Initialize worker with wasm URL inside the extension
const wasmUrl = chrome.runtime.getURL("clingo.wasm");
worker.postMessage({ type: "init", wasmUrl });

// Solve
runBtn.addEventListener("click", () => {
  out.textContent = "";
  if (!initialized) {
    out.textContent = "[Error] Clingo not initialized yet";
    return;
  }
  const program = $("#code").value;
  const n = parseInt($("#n").value.trim(), 10) || 0;

  worker.postMessage({
    type: "run",
    args: [program, n]
  });
});

// Copy output
copyBtn.addEventListener("click", async () => {
  const text = out.textContent || "";
  try {
    await navigator.clipboard.writeText(text);
    const old = badge?.textContent;
    if (badge) {
      badge.textContent = "copied ✓";
      setTimeout(() => (badge.textContent = old || "ready • WebAssembly"), 900);
    }
  } catch (err) {
    // Fallback (rare)
    const range = document.createRange();
    range.selectNodeContents(out);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    document.execCommand("copy");
    sel.removeAllRanges();
  }
});

// Clear output
clearBtn.addEventListener("click", () => {
  out.textContent = "";
});
