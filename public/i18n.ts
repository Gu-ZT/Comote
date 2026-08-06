// Frontend i18n engine. Vite expands the locale JSON glob at build time, so
// adding a file under src/i18n automatically registers another UI language.

import { createI18n } from "vue-i18n";
import { ref } from "vue";

export type WebDictionary = Record<string, string>;

const LANGUAGE_NAME_KEY = "$language";
const localeModules = import.meta.glob("../src/i18n/*.json", {
  eager: true,
  import: "default",
}) as Record<string, WebDictionary>;

function localeCodeFromPath(path: string): string {
  return path.split("/").at(-1)?.replace(/\.json$/i, "") ?? "";
}

const localeEntries = Object.entries(localeModules)
  .map(([path, rawDictionary]) => {
    const locale = localeCodeFromPath(path);
    const languageName = String(rawDictionary?.[LANGUAGE_NAME_KEY] ?? locale);
    const dictionary = Object.fromEntries(
      Object.entries(rawDictionary ?? {}).filter(([key]) => key !== LANGUAGE_NAME_KEY),
    ) as WebDictionary;
    return { locale, languageName, dictionary };
  })
  .filter((entry) => entry.locale)
  .sort((left, right) => left.locale.localeCompare(right.locale));

if (localeEntries.length === 0) {
  throw new Error("No frontend locale files were discovered in src/i18n");
}

const DICTS = Object.fromEntries(
  localeEntries.map(({ locale, dictionary }) => [locale, dictionary]),
) as Record<string, WebDictionary>;

export const WEB_LOCALES = Object.freeze(localeEntries.map(({ locale }) => locale));
export const WEB_DEFAULT = WEB_LOCALES.find((locale) => locale.toLowerCase() === "zh-cn")
  ?? WEB_LOCALES[0];
export const WEB_LOCALE_NAMES = Object.freeze(Object.fromEntries(
  localeEntries.map(({ locale, languageName }) => [locale, languageName]),
)) as Readonly<Record<string, string>>;

export const i18n = createI18n({
  legacy: false,
  locale: WEB_DEFAULT,
  fallbackLocale: WEB_DEFAULT,
  messages: DICTS,
});

// Keep the compatibility helpers and Vue templates on the same reactive value.
// The daemon controller still calls setWebLocale(), while Vue components can
// bind directly to this ref without maintaining a second locale state.
export const webLocale = ref(WEB_DEFAULT);

const localeAliases = new Map<string, string>();
for (const locale of WEB_LOCALES) {
  const normalized = locale.toLowerCase();
  const primary = normalized.split("-")[0];
  localeAliases.set(normalized, locale);
  if (!localeAliases.has(primary)) localeAliases.set(primary, locale);
}

export function normalizeWebLocale(
  locale: string | null | undefined,
  fallback = WEB_DEFAULT,
): string {
  const normalized = String(locale ?? "").trim().replaceAll("_", "-").toLowerCase();
  const primary = normalized.split("-")[0];
  return localeAliases.get(normalized)
    ?? localeAliases.get(primary)
    ?? localeAliases.get(String(fallback).toLowerCase())
    ?? WEB_DEFAULT;
}

export function setWebLocale(locale: string): string {
  const normalized = normalizeWebLocale(locale);
  webLocale.value = normalized;
  i18n.global.locale.value = normalized;
  return normalized;
}

export function getWebLocale(): string {
  return webLocale.value;
}

export function webDict(locale: string): WebDictionary {
  return DICTS[normalizeWebLocale(locale)] ?? DICTS[WEB_DEFAULT];
}

export function tWeb(key: string, vars?: Record<string, unknown>): string {
  // Read through Vue I18n's message catalog, but interpolate manually so
  // literal pipes in command syntax (for example `<true|false>`) are not
  // interpreted as vue-i18n's legacy plural separator.
  const localeMessages = i18n.global.getLocaleMessage(webLocale.value) as WebDictionary;
  const fallbackMessages = i18n.global.getLocaleMessage(WEB_DEFAULT) as WebDictionary;
  let text = localeMessages[key] ?? fallbackMessages[key];
  if (text === undefined) return key;
  return vars
    ? text.replace(/\{(\w+)\}/g, (match, name) =>
        Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match,
      )
    : text;
}

// data-i18n="key" sets textContent; data-i18n-attr="title:key" sets attributes.
export function applyTranslations(root = document): void {
  if (root.documentElement) root.documentElement.lang = webLocale.value;
  root.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = tWeb(element.getAttribute("data-i18n") ?? "");
  });
  root.querySelectorAll("[data-i18n-attr]").forEach((element) => {
    (element.getAttribute("data-i18n-attr") ?? "")
      .split(";")
      .forEach((pair) => {
        const [attribute, key] = pair.split(":").map((value) => value.trim());
        if (attribute && key) element.setAttribute(attribute, tWeb(key));
      });
  });
}
