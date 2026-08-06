import { copyFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
const dist = join(root, "dist");
const tsc = join(root, "node_modules", "typescript", "bin", "tsc");

await rm(dist, { recursive: true, force: true });
await execFileAsync(process.execPath, [tsc, "-p", join(root, "tsconfig.build.json")], { cwd: root });
// Runtime code resolves the package version relative to dist/src. Keep the
// compiled tree self-contained for npm, Docker, and the desktop sidecar.
await copyFile(join(root, "package.json"), join(dist, "package.json"));

console.log(`Built Node application into ${dist}`);
