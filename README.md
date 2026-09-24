# All in One Personal Finance — Demo

A **live, public demo** of the *All in One Personal Finance* app. It is the complete
application — the real UI, navigation, and features — running in a temporary demo
mode. It tracks the product through **Phase 6 (The Conversion Layer)**: the Today
story with the safe-to-spend receipt and per-day number, month charts (donut,
day-by-day and until-payday strips), the five spending groups, Milestones, Plan →
Month "at a glance", per-screen hero numbers, help "?" tips, and "Make it yours"
(your name, planner name, and what to call the big number). Home, Money, Plan
(Budget / Month / 50-30-20 / Goals / Debt), Wealth, settings, themes and wallpapers
are all present.

This repository is **separate from the main application** and exists only to host
the demo. The production app is untouched.

## The one thing that makes it a demo: it resets every session

The demo runs against an **in-memory database**. Nothing a visitor types is ever
written to disk:

- On every page load the app starts from a **fresh, empty in-memory database**,
  then seeds a realistic sample so you land on a populated dashboard.
- Anything you add or change lives **only until you reload or close the tab**.
- Reopen the link later (online *or* offline) and you get the **same clean demo
  state again** — the previous visitor's data is gone.

So the link can be shared freely: no one can turn it into their own persistent
copy, and one visitor's data never becomes the next visitor's.

### How it works (implementation)

- [`src/main.tsx`](src/main.tsx) imports **`fake-indexeddb/auto` as its very first
  line**, which replaces the browser's real IndexedDB with an in-memory one
  *before* Dexie loads. All storage therefore lives only in the page's memory.
- The app's own **Phase 6 boot** (in `src/state/DataProvider.tsx`) then seeds the
  example data into that empty in-memory file on each load, so every visit opens on
  a living dashboard — via `buildDemoRecords` / `loadDemoData` in
  [`src/data/demo.ts`](src/data/demo.ts). There is no demo-only seed file anymore.
- Built as the **demo edition** (`VITE_EDITION=demo`): the gentle 40-spend limit is
  active, and the single-file build carries **no service worker / install prompt**.
- [`src/App.tsx`](src/App.tsx) uses **HashRouter** so the statically-hosted page
  survives a refresh at any route. Deep links therefore take the hash form, e.g.
  `…/#/?start=debt` (also `today | bills | goals | wealth | plan`).

`src/main.tsx` (in-memory swap) and `src/App.tsx` (HashRouter) are the **only**
demo-specific edits; everything else is the real application code, synced from the
product repo.

## Run it locally

```bash
npm install
npm run dev
```

## Build the demo

```bash
npm run build:singlefile
```

This produces a single self-contained `index.html` (JS + CSS inlined, no service
worker) written to both the repo **root** and **`docs/`**, so GitHub Pages serves
it whichever folder is selected. `CashHorizon_Demo.html` is a copy of that same
build. The env-prefixed script assumes a POSIX shell (Git Bash / WSL).

## Deploy

- **GitHub Pages:** already wired — Pages serves the built `index.html` at the repo
  root (`.nojekyll` disables Jekyll). Re-run the build above and push.
- **Vercel (optional):** import this repo, framework **Vite**, build command
  `npm run build`, output `dist/`.

> Note: the `test` / `lint:buyer-language` scripts are inherited from the main app
> and are not required to run the demo.
