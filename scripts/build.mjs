import { cp, copyFile, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { build as viteBuild } from "vite";

const execFileAsync = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
const dist = join(root, "dist");
const tsc = join(root, "node_modules", "typescript", "bin", "tsc");

await rm(dist, { recursive: true, force: true });
await execFileAsync(process.execPath, [tsc, "-p", join(root, "tsconfig.json")], { cwd: root });
// Runtime code resolves the package version relative to dist/src. Keep the
// compiled tree self-contained for npm, Docker, and the desktop sidecar.
await copyFile(join(root, "package.json"), join(dist, "package.json"));

const publicDir = join(root, "public");
const compiledPublicDir = join(dist, "public");
await mkdir(compiledPublicDir, { recursive: true });

for (const file of ["index.html", "boot.html", "styles.css", "logo.svg", "icon.png"]) {
  await copyFile(join(publicDir, file), join(compiledPublicDir, file));
}
await cp(join(publicDir, "vendor"), join(compiledPublicDir, "vendor"), { recursive: true });

// import.meta.glob is expanded by Vite. Bundle only the i18n engine so the
// existing browser entry and Node/Tauri build layout remain unchanged.
await viteBuild({
  configFile: false,
  logLevel: "error",
  build: {
    outDir: compiledPublicDir,
    emptyOutDir: false,
    minify: false,
    sourcemap: true,
    lib: {
      entry: join(publicDir, "i18n.ts"),
      formats: ["es"],
      fileName: () => "i18n.js",
    },
  },
});

console.log(`Built TypeScript application into ${dist}`);
