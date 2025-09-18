const $ = (s) => document.querySelector(s);

/* ---------------- Elements ---------------- */
const badge = $("#status-badge");
const themeToggle = $("#theme-toggle");
const runBtn = $("#run");
const copyBtn = $("#copy");
const clearBtn = $("#clear");
const errBanner = $("#error-banner");

/* Tabs */
const tabHuman = $("#tab-human");
const tabJson  = $("#tab-json");
const panelHuman = $("#panel-human");
const panelJson  = $("#panel-json");
const outHuman = $("#out-human");
const outJson  = $("#out-json");

/* ---------------- Theme handling ---------------- */
function getSystemPref() {
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light" : "dark";
}
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  themeToggle.textContent = theme === "light" ? "☀ Light" : "☾ Dark";
}
const savedTheme = localStorage.getItem("asportable-theme");
applyTheme(savedTheme || getSystemPref());
themeToggle.addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme") || "dark";
  const next = current === "dark" ? "light" : "dark";
  applyTheme(next);
  localStorage.setItem("asportable-theme", next);
});

/* ---------------- Tabs logic (ARIA + persistence) ---------------- */
function setActiveTab(tabId) {
  const isHuman = tabId === "tab-human";
  tabHuman.setAttribute("aria-selected", String(isHuman));
  tabHuman.tabIndex = isHuman ? 0 : -1;
  panelHuman.setAttribute("aria-hidden", String(!isHuman));

  tabJson.setAttribute("aria-selected", String(!isHuman));
  tabJson.tabIndex = isHuman ? -1 : 0;
  panelJson.setAttribute("aria-hidden", String(isHuman));

  (isHuman ? tabHuman : tabJson).focus();
  localStorage.setItem("asportable-active-tab", tabId);
}
tabHuman.addEventListener("click", () => setActiveTab("tab-human"));
tabJson.addEventListener("click", () => setActiveTab("tab-json"));
tabHuman.addEventListener("keydown", (e) => {
  if (e.key === "ArrowRight") { e.preventDefault(); setActiveTab("tab-json"); }
});
tabJson.addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft") { e.preventDefault(); setActiveTab("tab-human"); }
});
setActiveTab(localStorage.getItem("asportable-active-tab") || "tab-human");

/* ---------------- Solver wiring ---------------- */
const worker = new Worker(chrome.runtime.getURL("clingo.web.worker.js"));
let initialized = false;
let lastJson = null;        // ultimo JSON clingo (object)
let lastHumanText = "";     // formattazione "umana" (string)
let lastJsonText = "";      // pretty JSON (string)

/* Helpers */
function showError(msg) {
  errBanner.textContent = msg;
  errBanner.classList.add("show");
}
function clearError() {
  errBanner.textContent = "";
  errBanner.classList.remove("show");
}
function resetOutputs() {
  lastJson = null;
  lastHumanText = "";
  lastJsonText = "";
  outHuman.textContent = "";
  outJson.textContent = "";
  clearError();
}

/* Human formatting from clingo JSON (minimal, robust) */
function formatHumanView(obj) {
  try {
    if (!obj || typeof obj !== "object") return "[no data]";

    const lines = [];
    // Summary header
    const result = obj.Result || "UNKNOWN";
    const num = obj.Models && typeof obj.Models.Number === "number" ? obj.Models.Number : 0;
    const more = obj.Models && obj.Models.More === "yes" ? "+" : "";
    let summary = `Result: ${result}`;
    if (obj.Models) summary += ` | Models: ${num}${more}`;
    if (obj.Optimization && obj.Optimization.Optimum) {
      summary += ` | Optimization: ${obj.Optimization.Optimum === "yes" ? "optimum" : "not optimum"}`;
    }
    if (obj.Call && obj.Call[0] && obj.Call[0].Time && typeof obj.Call[0].Time.Total !== "undefined") {
      summary += ` | Time: ${obj.Call[0].Time.Total}s`;
    }
    lines.push(summary, "");

    // Answer sets
    if (result === "UNSATISFIABLE") {
      lines.push("No answer sets found.");
      return lines.join("\n");
    }
    if (!obj.Call || !obj.Call[0]) {
      lines.push("[no call data]");
      return lines.join("\n");
    }
    const w = obj.Call[0].Witnesses || [];
    if (!w.length) {
      if (num === 0 && obj.Models && obj.Models.More === "yes") {
        lines.push("No models shown (more models exist). Increase the number of models.");
      } else {
        lines.push("No models to display.");
      }
      return lines.join("\n");
    }

    // List each witness
    for (let i = 0; i < w.length; i++) {
      const atoms = Array.isArray(w[i].Value) ? [...w[i].Value].sort() : [];
      const cost = Array.isArray(w[i].Costs) ? `  cost: [${w[i].Costs.join(", ")}]` : "";
      lines.push(`Answer set ${i + 1}: {${atoms.join(", ")}}${cost}`);
    }
    return lines.join("\n");
  } catch (e) {
    return `[format error] ${e?.message || e}`;
  }
}

/* Handle messages from worker */
worker.onmessage = (e) => {
  // Init ack (worker posts `null` after successful init)
  if (e.data === null) {
    initialized = true;
    runBtn.disabled = false;
    if (badge) {
      badge.textContent = "ready • WebAssembly";
      badge.classList.add("ok");
    }
    outHuman.textContent = "[Clingo initialized]\n";
    outJson.textContent  = "[Clingo initialized]\n";
    return;
  }

  // Some builds may print plain strings along the way
  if (typeof e.data === "string") {
    outHuman.textContent += e.data + "\n";
    outJson.textContent  += e.data + "\n";
    return;
  }

  // clingo JSON result (from clingo-wasm wrapper)
  if (e.data && e.data.Result) {
    clearError();
    lastJson = e.data;
    lastJsonText = JSON.stringify(e.data, null, 2);
    lastHumanText = formatHumanView(e.data);

    outHuman.textContent = lastHumanText;
    outJson.textContent  = lastJsonText;
    return;
  }

  // Unknown payload
  showError("[unexpected message] " + JSON.stringify(e.data));
};

/* Initialize worker with wasm URL inside the extension */
const wasmUrl = chrome.runtime.getURL("clingo.wasm");
worker.postMessage({ type: "init", wasmUrl });

/* Solve */
runBtn.addEventListener("click", () => {
  resetOutputs();
  if (!initialized) {
    outHuman.textContent = "[Error] Clingo not initialized yet";
    outJson.textContent  = "[Error] Clingo not initialized yet";
    return;
  }
  const program = ($("#code")?.value) || "";
  const n = parseInt(($("#n")?.value || "").trim(), 10) || 0;

  worker.postMessage({ type: "run", args: [program, n] });
});

/* Copy output of the active tab */
copyBtn.addEventListener("click", async () => {
  const activeTab = tabHuman.getAttribute("aria-selected") === "true" ? "human" : "json";
  const text = activeTab === "human" ? outHuman.textContent : outJson.textContent;

  try {
    await navigator.clipboard.writeText(text || "");
    const old = badge?.textContent;
    if (badge) {
      badge.textContent = "copied ✓";
      setTimeout(() => (badge.textContent = old || "ready • WebAssembly"), 900);
    }
  } catch {
    // Fallback selection copy
    const range = document.createRange();
    range.selectNodeContents(activeTab === "human" ? outHuman : outJson);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    document.execCommand("copy");
    sel.removeAllRanges();
  }
});

/* Clear both outputs */
clearBtn.addEventListener("click", () => {
  resetOutputs();
});
