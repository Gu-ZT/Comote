import test from "node:test";
import assert from "node:assert/strict";
import { createComoteState } from "../src/server/state.js";
import { getLocale, setLocale } from "../src/core/i18n/index.js";

test("state initializes i18n locale from persisted settings", () => {
  createComoteState({ persisted: { settings: { locale: "en" } } });
  assert.equal(getLocale(), "en");
});

test("setLocale updates settings and i18n; getSettings reflects it", () => {
  const state = createComoteState({ persisted: {} });
  state.setLocale("ja");
  assert.equal(getLocale(), "ja");
  assert.equal(state.getSettings().locale, "ja");
  // i18n locale is a module-level global; reset so later tests aren't affected.
  setLocale("zh");
});

test("an invalid persisted locale is normalized in both i18n and settings", () => {
  const state = createComoteState({ persisted: { settings: { locale: "de" } } });
  assert.equal(getLocale(), "zh");
  assert.equal(state.getSettings().locale, "zh");
  setLocale("zh");
});

test("connector preference defaults to Desktop and restores a valid persisted choice", () => {
  const defaults = createComoteState({ persisted: {} });
  const restored = createComoteState({ persisted: { settings: { preferredConnector: "cli" } } });
  const invalid = createComoteState({ persisted: { settings: { preferredConnector: "other" } } });

  assert.equal(defaults.getSettings().preferredConnector, "desktop");
  assert.equal(restored.getSettings().preferredConnector, "cli");
  assert.equal(invalid.getSettings().preferredConnector, "desktop");
});

test("setPreferredConnector validates and updates the live setting", () => {
  const state = createComoteState({ persisted: {} });

  state.setPreferredConnector("cli");

  assert.equal(state.getSettings().preferredConnector, "cli");
  assert.throws(() => state.setPreferredConnector("other"), /unsupported connector preference/);
  assert.equal(state.getSettings().preferredConnector, "cli");
});

test("capacity retry settings default, restore, and validate", () => {
  const defaults = createComoteState({ persisted: {} });
  const restored = createComoteState({
    persisted: { settings: { capacityRetryEnabled: true, capacityRetryLimit: 24 } },
  });
  const invalid = createComoteState({
    persisted: { settings: { capacityRetryEnabled: "yes", capacityRetryLimit: 0 } },
  });

  assert.equal(defaults.getSettings().capacityRetryEnabled, false);
  assert.equal(defaults.getSettings().capacityRetryLimit, 10);
  assert.equal(restored.getSettings().capacityRetryEnabled, true);
  assert.equal(restored.getSettings().capacityRetryLimit, 24);
  assert.equal(invalid.getSettings().capacityRetryEnabled, false);
  assert.equal(invalid.getSettings().capacityRetryLimit, 10);

  defaults.setCapacityRetryEnabled(true);
  defaults.setCapacityRetryLimit(3);
  assert.equal(defaults.getSettings().capacityRetryEnabled, true);
  assert.equal(defaults.getSettings().capacityRetryLimit, 3);
  assert.throws(() => defaults.setCapacityRetryEnabled("true"), /must be a boolean/);
  assert.throws(() => defaults.setCapacityRetryLimit(101), /between 1 and 100/);
});
