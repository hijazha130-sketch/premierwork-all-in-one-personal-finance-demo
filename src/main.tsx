/**
 * DEMO entry point.
 *
 * `fake-indexeddb/auto` MUST be the very first import: it replaces the browser's
 * real IndexedDB with an in-memory one BEFORE Dexie is imported. That makes the
 * whole demo ephemeral — nothing a visitor enters is written to disk, so every
 * new session (reload / reopen, online or offline) starts from the same fresh,
 * seeded demo state. This is the deliberate reset behaviour.
 */
import "fake-indexeddb/auto";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "@/App";
import "@/index.css";
import { seedDemo } from "@/demo/seed";

async function start() {
  try {
    await seedDemo();
  } catch (err) {
    // A seed failure should never blank the demo — fall through to the app.
    console.error("Demo seed failed:", err);
  }
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void start();
