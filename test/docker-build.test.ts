import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Docker image copies every root build config before npm run build", async () => {
  const dockerfile = await readFile("Dockerfile", "utf8");
  const buildStep = dockerfile.indexOf("RUN npm run build");

  assert.notEqual(buildStep, -1);
  for (const file of ["tsconfig.json", "tsconfig.build.json", "vite.config.ts"]) {
    const copyStep = dockerfile.search(new RegExp(`^COPY [^\\r\\n]*\\b${file.replaceAll(".", "\\.")}\\b`, "m"));
    assert.notEqual(copyStep, -1, `${file} must be copied into the build image`);
    assert.ok(copyStep < buildStep, `${file} must be copied before npm run build`);
  }
});
