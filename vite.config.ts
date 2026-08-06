import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));
const frontendRoot = resolve(projectRoot, "public");

function normalizedFacade(id: string | null | undefined): string {
  return String(id ?? "").replaceAll("\\", "/");
}

export default defineConfig({
  plugins: [vue()],
  root: frontendRoot,
  base: "./",
  publicDir: false,
  server: {
    host: "127.0.0.1",
    proxy: {
      "/api": "http://127.0.0.1:16208",
    },
  },
  preview: {
    host: "127.0.0.1",
  },
  build: {
    outDir: resolve(projectRoot, "dist", "public"),
    emptyOutDir: true,
    assetsInlineLimit: 0,
    manifest: true,
    minify: false,
    sourcemap: true,
    target: "es2022",
    rollupOptions: {
      preserveEntrySignatures: "strict",
      input: {
        index: resolve(frontendRoot, "index.html"),
        boot: resolve(frontendRoot, "boot.html"),
        i18n: resolve(frontendRoot, "i18n.ts"),
      },
      output: {
        entryFileNames(chunkInfo) {
          const facade = normalizedFacade(chunkInfo.facadeModuleId);
          if (facade.endsWith("/app.ts")) return "app.js";
          if (facade.endsWith("/i18n.ts")) return "i18n.js";
          if (facade.endsWith("/main.ts")) return "app.js";
          return "assets/[name]-[hash].js";
        },
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames(assetInfo) {
          const sourceName = assetInfo.names?.[0] ?? assetInfo.name ?? "";
          if (sourceName === "icon.png" || sourceName === "logo.svg") {
            return sourceName;
          }
          return "assets/[name]-[hash][extname]";
        },
      },
    },
  },
});
