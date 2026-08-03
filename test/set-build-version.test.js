import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { buildVersion, setBuildVersion } from "../scripts/set-build-version.mjs";

test("buildVersion creates a CI build metadata version", () => {
  assert.equal(buildVersion("v0.8.1", "42"), "0.8.1+build.42");
  assert.equal(buildVersion("0.8.1+build.7", "43"), "0.8.1+build.43");
  assert.throws(() => buildVersion("0.8", "42"), /Invalid base version/);
  assert.throws(() => buildVersion("0.8.1", "0"), /Invalid build number/);
});

test("setBuildVersion synchronizes all desktop manifests", async () => {
  const root = await mkdtemp(join(tmpdir(), "comote-build-version-"));
  try {
    await writeFile(join(root, "package.json"), '{\n  "name": "comote",\n  "version": "0.8.1"\n}\n');
    await writeFile(join(root, "package-lock.json"), '{\n  "name": "comote",\n  "version": "0.8.1",\n  "packages": {\n    "": {\n      "name": "comote",\n      "version": "0.8.1"\n    }\n  }\n}\n');
    await mkdir(join(root, "src-tauri"), { recursive: true });
    await writeFile(join(root, "src-tauri", "Cargo.toml"), '[package]\nname = "comote"\nversion = "0.8.1"\n');
    await writeFile(join(root, "src-tauri", "Cargo.lock"), '[[package]]\nname = "comote"\nversion = "0.8.1"\n');
    await writeFile(join(root, "src-tauri", "tauri.conf.json"), '{\n  "version": "0.8.1"\n}\n');

    assert.equal(await setBuildVersion({ rootDir: root, buildNumber: 42 }), "0.8.1+build.42");
    assert.equal(JSON.parse(await readFile(join(root, "package.json"))).version, "0.8.1+build.42");
    assert.equal(JSON.parse(await readFile(join(root, "package-lock.json"))).packages[""].version, "0.8.1+build.42");
    assert.match(await readFile(join(root, "src-tauri", "Cargo.toml"), "utf8"), /version = "0\.8\.1\+build\.42"/);
    assert.match(await readFile(join(root, "src-tauri", "Cargo.lock"), "utf8"), /version = "0\.8\.1\+build\.42"/);
    assert.equal(JSON.parse(await readFile(join(root, "src-tauri", "tauri.conf.json"))).version, "0.8.1+build.42");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
