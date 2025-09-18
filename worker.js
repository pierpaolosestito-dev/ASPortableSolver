// worker.js
let clingo = null;

self.onmessage = async (e) => {
  const msg = e.data;

  if (msg.type === "init") {
    try {
      const url = msg.wasmUrl;
      const response = await fetch(url);
      const bytes = await response.arrayBuffer();

      // Qui non usiamo eval/new Function: solo WebAssembly.instantiate
      const { instance } = await WebAssembly.instantiate(bytes, {});

      clingo = instance.exports;
      self.postMessage({ type: "ready", exports: Object.keys(clingo) });
    } catch (err) {
      self.postMessage({ type: "error", error: String(err) });
    }
  }

  if (msg.type === "call" && clingo) {
    try {
      const fn = msg.fn;
      if (typeof clingo[fn] !== "function") {
        self.postMessage({ type: "error", error: `Function ${fn} not found in exports` });
        return;
      }
      const result = clingo[fn](...(msg.args || []));
      self.postMessage({ type: "result", fn, result });
    } catch (err) {
      self.postMessage({ type: "error", error: String(err) });
    }
  }
};
