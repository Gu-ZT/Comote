import zh from "./locales/zh.js";
import en from "./locales/en.js";
import ja from "./locales/ja.js";
import ko from "./locales/ko.js";
import fr from "./locales/fr.js";
import es from "./locales/es.js";

export const SUPPORTED_LOCALES = ["zh", "en", "ja", "ko", "fr", "es"] as const;
export type Locale = typeof SUPPORTED_LOCALES[number];
export const DEFAULT_LOCALE: Locale = "zh";
const DICTS: Record<Locale, Record<string, string>> = { zh, en, ja, ko, fr, es };

let currentLocale: Locale = DEFAULT_LOCALE;

export function setLocale(locale: string | null | undefined): Locale {
  currentLocale = (SUPPORTED_LOCALES as readonly string[]).includes(locale ?? "")
    ? locale as Locale
    : DEFAULT_LOCALE;
  return currentLocale;
}

export function getLocale(): Locale {
  return currentLocale;
}

export function t(key: string, vars?: Record<string, unknown>): string {
  const dict = DICTS[currentLocale] ?? DICTS[DEFAULT_LOCALE];
  let template = dict[key];
  if (template === undefined) template = DICTS[DEFAULT_LOCALE][key];
  if (template === undefined) return key;
  return vars ? interpolate(template, vars) : template;
}

function interpolate(template: string, vars: Record<string, unknown>): string {
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match,
  );
}
