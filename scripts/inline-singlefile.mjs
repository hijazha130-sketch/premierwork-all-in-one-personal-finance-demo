/**
 * Turn the Vite build (dist/index.html + dist/assets/*) into ONE self-contained
 * index.html with the JS and CSS inlined. The result works when opened directly
 * (file://) or served from any path (GitHub Pages subfolder, etc.).
 *
 * Run after: SINGLEFILE=1 vite build   (see package.json "build:singlefile").
 * Output: docs/index.html (+ docs/.nojekyll), which GitHub Pages can serve.
 */
import fs from "node:fs";
import path from "node:path";

const dist = "dist";
const outDir = "docs";
let html = fs.readFileSync(path.join(dist, "index.html"), "utf8");

// Inline every module script: <script type="module" ... src="./assets/x.js"></script>
html = html.replace(
  /<script\b[^>]*\bsrc="([^"]+\.js)"[^>]*><\/script>/g,
  (_m, src) => {
    const file = path.join(dist, src.replace(/^\.?\//, ""));
    let js = fs.readFileSync(file, "utf8");
    js = js.replace(/<\/script>/gi, "<\\/script>"); // never break out of the tag
    return `<script type="module">${js}</script>`;
  },
);

// Inline every stylesheet: <link rel="stylesheet" ... href="./assets/x.css">
html = html.replace(
  /<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+\.css)"[^>]*>/g,
  (_m, href) => {
    const file = path.join(dist, href.replace(/^\.?\//, ""));
    const css = fs.readFileSync(file, "utf8");
    return `<style>${css}</style>`;
  },
);

// Drop any leftover PWA/module-preload links that point at now-inlined assets.
html = html.replace(/<link\b[^>]*\brel="modulepreload"[^>]*>/g, "");
html = html.replace(/<link\b[^>]*\bhref="[^"]*(?:manifest\.webmanifest|registerSW\.js)"[^>]*>/g, "");

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "index.html"), html, "utf8");
fs.writeFileSync(path.join(outDir, ".nojekyll"), "", "utf8"); // let GitHub Pages serve it as-is

const kb = (Buffer.byteLength(html, "utf8") / 1024).toFixed(0);
const inlinedScript = /<script type="module">/.test(html);
const inlinedStyle = /<style>/.test(html);
const leftoverAssetRef = /assets\/[^"']+\.(?:js|css)/.test(html);
console.log(`Single-file written -> ${outDir}/index.html (${kb} KB)`);
console.log(`  inlined script: ${inlinedScript}  inlined style: ${inlinedStyle}  leftover asset refs: ${leftoverAssetRef}`);
if (!inlinedScript || !inlinedStyle || leftoverAssetRef) {
  console.error("Single-file inlining incomplete — check the build output.");
  process.exit(1);
}
