/**
 * DEMO entry point.
 *
 * `fake-indexeddb/auto` MUST be the very first import: it swaps the browser's
 * real IndexedDB for an in-memory one BEFORE Dexie loads. That makes the whole
 * demo ephemeral — nothing a visitor enters is written to disk, so every reload
 * starts from a fresh, empty file. The Phase 6 boot in DataProvider then seeds
 * the example data automatically, so each visit opens on a living app.
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
