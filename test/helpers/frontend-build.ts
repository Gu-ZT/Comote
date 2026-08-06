import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface ViteManifestEntry {
  file: string;
  src?: string;
  isEntry?: boolean;
  imports?: string[];
  css?: string[];
  assets?: string[];
}

export type ViteManifest = Record<string, ViteManifestEntry>;

export async function readFrontendManifest(): Promise<ViteManifest> {
  return JSON.parse(await readFile("dist/public/.vite/manifest.json", "utf8")) as ViteManifest;
}

export async function readFrontendEntry(source: string): Promise<string> {
  const manifest = await readFrontendManifest();
  const entry = manifest[source];
  if (!entry?.file) {
    throw new Error(`Missing Vite manifest entry: ${source}`);
  }
  return readFile(join("dist", "public", entry.file), "utf8");
}

export async function readFrontendSource(source: string): Promise<string> {
  return readFile(source, "utf8");
}
