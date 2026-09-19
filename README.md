# All in One Personal Finance — Demo

A **live, public demo** of the *All in One Personal Finance* app. It is the complete
application — the real UI, navigation, and features (Home, Money, Plan → Budget /
50-30-20 / Goals / Debt, Wealth, settings, themes, wallpapers) — running in a
temporary demo mode.

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
- [`src/demo/seed.ts`](src/demo/seed.ts) fills that in-memory database with sample
  accounts, transactions, bills, a budget, goals, debts and assets on each load.
- The PWA service worker still caches the **app shell** for offline use, but it
  never touches the database — so offline sessions reset exactly the same way.

These two files are the **only** demo-specific additions; everything else is the
real application code.

## Run it locally

```bash
npm install
npm run dev      # or: npm run build && npm run preview
```

## Deploy

Any static host works (the build output is `dist/`). On Vercel: import this repo,
framework **Vite**, build command `npm run build`, output directory `dist`. The
resulting URL is the demo link.

> Note: the `test` / `lint:buyer-language` scripts are inherited from the main app
> and are not required to run the demo.
