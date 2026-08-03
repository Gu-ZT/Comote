import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

export function buildVersion(baseVersion, buildNumber) {
  const base = String(baseVersion ?? "").trim().replace(/^v/i, "").split("+")[0];
  if (!/^\d+\.\d+\.\d+$/.test(base)) {
    throw new Error(`Invalid base version: ${baseVersion}`);
  }
  const build = String(buildNumber ?? "").trim();
  if (!/^\d+$/.test(build) || Number(build) < 1) {
    throw new Error(`Invalid build number: ${buildNumber}`);
  }
  return `${base}+build.${build}`;
}

function replaceFirstVersion(text, version) {
  const replaced = text.replace(/(\"version\"\s*:\s*\")[^\"]+(\")/, `$1${version}$2`);
  if (replaced === text) throw new Error("Could not find JSON version field");
  return replaced;
}

function replaceLockRootVersion(text, version) {
  const top = replaceFirstVersion(text, version);
  const root = top.replace(
    /(\"packages\"\s*:\s*\{\s*\"\"\s*:\s*\{\s*\"name\"\s*:\s*\"[^\"]+\"\s*,\s*\"version\"\s*:\s*\")[^\"]+(\")/s,
    `$1${version}$2`,
  );
  if (root === top) throw new Error("Could not find package-lock root version field");
  return root;
}

function replaceCargoPackageVersion(text, version) {
  const replaced = text.replace(/(name\s*=\s*\"comote\"\s*\r?\nversion\s*=\s*\")[^\"]+(\")/, `$1${version}$2`);
  if (replaced === text) throw new Error("Could not find Cargo package version");
  return replaced;
}

function replaceCargoLockPackageVersion(text, version) {
  const replaced = text.replace(/(name\s*=\s*\"comote\"\s*\r?\nversion\s*=\s*\")[^\"]+(\")/, `$1${version}$2`);
  if (replaced === text) throw new Error("Could not find Cargo.lock package version");
  return replaced;
}

export async function setBuildVersion({ rootDir = ROOT, buildNumber }) {
  const packagePath = join(rootDir, "package.json");
  const packageText = await readFile(packagePath, "utf8");
  const packageJson = JSON.parse(packageText);
  const version = buildVersion(packageJson.version, buildNumber);

  const updates = [
    [packagePath, replaceFirstVersion(packageText, version)],
    [join(rootDir, "package-lock.json"), null],
    [join(rootDir, "src-tauri", "Cargo.toml"), null],
    [join(rootDir, "src-tauri", "Cargo.lock"), null],
    [join(rootDir, "src-tauri", "tauri.conf.json"), null],
  ];
  const lockPath = updates[1][0];
  updates[1][1] = replaceLockRootVersion(await readFile(lockPath, "utf8"), version);
  const cargoPath = updates[2][0];
  updates[2][1] = replaceCargoPackageVersion(await readFile(cargoPath, "utf8"), version);
  const cargoLockPath = updates[3][0];
  updates[3][1] = replaceCargoLockPackageVersion(await readFile(cargoLockPath, "utf8"), version);
  const tauriPath = updates[4][0];
  updates[4][1] = replaceFirstVersion(await readFile(tauriPath, "utf8"), version);

  await Promise.all(updates.map(([path, text]) => writeFile(path, text, "utf8")));
  return version;
}

function parseArgs(argv) {
  const buildIndex = argv.indexOf("--build");
  if (buildIndex < 0 || argv[buildIndex + 1] === undefined) {
    throw new Error("Usage: node scripts/set-build-version.mjs --build <run-number>");
  }
  return { buildNumber: argv[buildIndex + 1] };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const { buildNumber } = parseArgs(process.argv.slice(2));
  const version = await setBuildVersion({ buildNumber });
  console.log(`Set build version to ${version}`);
}
