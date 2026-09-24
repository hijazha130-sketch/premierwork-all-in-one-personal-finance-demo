/**
 * DEMO entry point. `fake-indexeddb/auto` MUST be the very first import: it swaps
 * the browser's real IndexedDB for an in-memory one BEFORE Dexie loads, so every
 * reload starts from a fresh, empty file and the Phase 6 boot re-seeds the example
 * data. Nothing a visitor enters is written to disk.
 */
import "fake-indexeddb/auto";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "@/App";
import "@/index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
