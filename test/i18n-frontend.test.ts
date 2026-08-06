import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

import { readFrontendSource } from "./helpers/frontend-build.js";

const builtI18n = await import(new URL("../dist/public/i18n.js", import.meta.url).href);
const {
  WEB_DEFAULT,
  WEB_LOCALES,
  WEB_LOCALE_NAMES,
  i18n,
  normalizeWebLocale,
  webLocale,
  webDict,
  tWeb,
  setWebLocale,
} = builtI18n;

test("Vite discovers every locale JSON and reads its display name", async () => {
  const files = (await readdir("src/i18n"))
    .filter((file) => file.endsWith(".json"))
    .sort();
  assert.deepEqual([...WEB_LOCALES].sort(), files.map((file) => file.replace(/\.json$/, "")));

  for (const file of files) {
    const locale = file.replace(/\.json$/, "");
    const dictionary = JSON.parse(await readFile(`src/i18n/${file}`, "utf8"));
    assert.equal(WEB_LOCALE_NAMES[locale], dictionary.$language);
    assert.ok(dictionary.$language, `${file} must define $language`);
  }
});

test("frontend locale JSON files do not contain duplicate keys", async () => {
  const files = (await readdir("src/i18n")).filter((file) => file.endsWith(".json"));
  for (const file of files) {
    const source = await readFile(`src/i18n/${file}`, "utf8");
    const keys = [...source.matchAll(/^\s*"([^"]+)"\s*:/gm)].map((match) => match[1]);
    assert.equal(new Set(keys).size, keys.length, `${file} contains duplicate keys`);
  }
});

test("frontend locales all share the same key set", () => {
  const base = Object.keys(webDict(WEB_DEFAULT)).sort();
  for (const loc of WEB_LOCALES) {
    assert.deepEqual(Object.keys(webDict(loc)).sort(), base, `web locale ${loc} differs`);
  }
});

test("frontend locales share the same {placeholder} vars as zh", () => {
  const placeholders = (s) => [...new Set((String(s).match(/\{(\w+)\}/g) ?? []))].sort();
  const zh = webDict("zh-CN");
  for (const key of Object.keys(zh)) {
    const want = placeholders(zh[key]);
    for (const loc of WEB_LOCALES) {
      assert.deepEqual(placeholders(webDict(loc)[key]), want, `web ${loc}/${key} placeholder mismatch`);
    }
  }
});

test("tWeb localizes and falls back", () => {
  assert.equal(normalizeWebLocale("en"), "en-US");
  assert.equal(normalizeWebLocale("zh_Hans_CN"), "zh-CN");
  assert.equal(setWebLocale("en"), "en-US");
  assert.equal(tWeb("web.nav.connectPhone"), "Connect phone");
  assert.equal(setWebLocale("zh"), "zh-CN");
  assert.equal(tWeb("web.nav.connectPhone"), "连接手机");
  assert.equal(tWeb("web.settings.pageTitle"), "设置");
  setWebLocale("xx"); // unknown -> default zh
  assert.equal(tWeb("web.nav.connectPhone"), "连接手机");
  assert.equal(tWeb("__missing__"), "__missing__");
});

test("command tooltips localize both effect and usage", () => {
  setWebLocale("en");
  const text = tWeb("web.commands.tooltip.automode");
  assert.match(text, /Effect:/);
  assert.match(text, /Usage: \/automode <true\|false>/);
  setWebLocale("zh");
});

test("Vue I18n owns the frontend message catalog", async () => {
  const source = await readFrontendSource("public/i18n.ts");
  assert.match(source, /createI18n\(/);
  assert.match(source, /fallbackLocale:\s*WEB_DEFAULT/);
  assert.match(source, /messages:\s*DICTS/);
  assert.match(source, /export const webLocale = ref\(WEB_DEFAULT\)/);

  setWebLocale("en");
  assert.equal(webLocale.value, "en-US");
  assert.equal(i18n.global.t("web.nav.connectPhone"), "Connect phone");
  setWebLocale("zh");
});
