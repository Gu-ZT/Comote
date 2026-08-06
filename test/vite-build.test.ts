import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { readFrontendEntry, readFrontendManifest } from "./helpers/frontend-build.js";

async function listFiles(root: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(join(root, prefix), { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const relative = join(prefix, entry.name);
    return entry.isDirectory() ? listFiles(root, relative) : [relative];
  }));
  return files.flat().sort();
}

test("Vite owns the complete frontend production bundle", async () => {
  const [manifest, builtIndex, builtBoot, appSource] = await Promise.all([
    readFrontendManifest(),
    readFile("dist/public/index.html", "utf8"),
    readFile("dist/public/boot.html", "utf8"),
    readFrontendEntry("index.html"),
  ]);

  assert.equal(manifest["index.html"]?.isEntry, true);
  assert.equal(manifest["i18n.ts"]?.isEntry, true);
  assert.match(builtIndex, /<script type="module"[^>]+src="\.\/assets\/index-[^"]+\.js"/);
  assert.match(builtIndex, /<link rel="stylesheet"[^>]+href="\.\/assets\/index-[^"]+\.css"/);
  assert.match(builtBoot, /<img class="logo" src="\.\/icon\.png"/);
  assert.match(appSource, /createWebHashHistory|vue-router/);

  const files = (await listFiles("dist/public")).map((file) => file.replaceAll("\\", "/"));
  assert.ok(files.includes(".vite/manifest.json"));
  assert.ok(files.includes("icon.png"));
  assert.ok(files.includes("logo.svg"));
  assert.equal(files.some((file) => /\.(?:ts|d\.ts|d\.ts\.map)$/.test(file)), false);
  assert.equal(files.some((file) => file.startsWith("vendor/")), false);
});

test("Tauri uses Vite development and production commands for each mode", async () => {
  const [packageJson, tauriConfig] = await Promise.all([
    readFile("package.json", "utf8").then(JSON.parse),
    readFile("src-tauri/tauri.conf.json", "utf8").then(JSON.parse),
  ]);

  assert.equal(packageJson.scripts["build:web"], "vite build");
  assert.equal(packageJson.scripts["dev:web"], "vite");
  assert.match(packageJson.scripts.build, /build:server && npm run build:web/);
  assert.equal(tauriConfig.build.beforeDevCommand, "npm run dev:web");
  assert.equal(tauriConfig.build.devUrl, "http://127.0.0.1:1420");
  assert.equal(tauriConfig.build.beforeBuildCommand, "npm run build:web");
  assert.equal(tauriConfig.build.frontendDist, "../dist/public");
});
