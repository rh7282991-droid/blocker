#!/usr/bin/env node
/**
 * Build orchestrator for FocusOS Chrome Extension.
 *
 * Steps:
 *   1. Build background + content scripts with esbuild (IIFE, single file each).
 *   2. Build popup + options React UIs with Vite.
 *   3. Generate the final manifest.json in dist/ pointing to the right paths.
 *   4. Copy any other static assets.
 */

import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  readdirSync,
} from "fs";
import { resolve, join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const DIST = resolve(ROOT, "dist");

function log(msg) {
  console.log(`[build] ${msg}`);
}

// Step 0: clean dist
log("Cleaning dist/...");
rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

// Step 1: build content + background scripts with esbuild as IIFE
log("Building service worker (background)...");
await esbuild({
  entryPoints: [resolve(ROOT, "src/background/index.ts")],
  bundle: true,
  outfile: resolve(DIST, "background.js"),
  format: "iife",
  platform: "browser",
  target: "chrome100",
  minify: false,
  sourcemap: false,
  logLevel: "info",
});

log("Building content script...");
await esbuild({
  entryPoints: [resolve(ROOT, "src/content/index.ts")],
  bundle: true,
  outfile: resolve(DIST, "content.js"),
  format: "iife",
  platform: "browser",
  target: "chrome100",
  minify: false,
  sourcemap: false,
  logLevel: "info",
});

// Step 2: build popup + options with Vite
log("Building popup + options (Vite)...");
await viteBuild({
  configFile: resolve(ROOT, "vite.config.ts"),
  build: {
    emptyOutDir: false, // keep our background.js / content.js
  },
});

// Step 3: Vite produces dist/src/popup/index.html and dist/src/options/index.html
// Move them to dist/popup.html and dist/options.html for cleaner manifest paths.
function moveHtml(srcRel, destRel) {
  const src = resolve(DIST, srcRel);
  const dest = resolve(DIST, destRel);
  if (!existsSync(src)) {
    throw new Error(`Expected Vite output not found: ${src}`);
  }
  const content = readFileSync(src, "utf-8");
  // Adjust asset paths: "../../assets/..." -> "assets/..."
  const adjusted = content.replace(/\.\.\/\.\.\/assets\//g, "assets/");
  writeFileSync(dest, adjusted);
  rmSync(src);
}
log("Relocating HTML files...");
moveHtml("src/popup/index.html", "popup.html");
moveHtml("src/options/index.html", "options.html");
// Clean up empty src/ tree in dist
try {
  rmSync(resolve(DIST, "src"), { recursive: true, force: true });
} catch {}

// Step 4: write the final manifest.json
log("Writing manifest.json...");
const manifestSrc = JSON.parse(
  readFileSync(resolve(ROOT, "manifest.json"), "utf-8")
);

const finalManifest = {
  ...manifestSrc,
  background: {
    service_worker: "background.js",
  },
  content_scripts: [
    {
      matches: manifestSrc.content_scripts?.[0]?.matches ?? [
        "*://*.facebook.com/*",
        "*://*.instagram.com/*",
        "*://*.youtube.com/*",
      ],
      js: ["content.js"],
      run_at: "document_idle",
    },
  ],
  action: {
    ...(manifestSrc.action ?? {}),
    default_popup: "popup.html",
  },
  options_page: "options.html",
};

writeFileSync(
  resolve(DIST, "manifest.json"),
  JSON.stringify(finalManifest, null, 2)
);

// Step 5: report final dist contents
log("Build complete. dist/ contents:");
function listDir(dir, prefix = "") {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      console.log(`${prefix}  ${entry.name}/`);
      listDir(path, prefix + "  ");
    } else {
      console.log(`${prefix}  ${entry.name}`);
    }
  }
}
listDir(DIST);
