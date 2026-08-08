import assert from "node:assert/strict";
import test from "node:test";

import {
  CODEX_CLI_CONNECTOR,
  CODEX_DESKTOP_CONNECTOR,
  KIMI_CONNECTOR,
  registerConnector,
} from "../src/connectors/contracts.js";
import { createConnectorRegistry } from "../src/connectors/registry.js";
import { makeSessionKey, parseSessionKey } from "../src/core/session-key.js";

test("connector registry exposes capabilities and shared session families", () => {
  const desktop = {};
  const cli = {};
  const registry = createConnectorRegistry([
    registerConnector(CODEX_DESKTOP_CONNECTOR, desktop),
    registerConnector(CODEX_CLI_CONNECTOR, cli),
  ]);

  assert.equal(registry.getConnector("desktop"), desktop);
  assert.equal(registry.supports("desktop", "streamingEvents"), true);
  assert.equal(registry.supports("cli", "streamingEvents"), false);
  assert.equal(registry.sameSessionFamily("desktop", "cli"), true);
  assert.equal(registry.sameSessionFamily("desktop", KIMI_CONNECTOR.id), false);
});

test("connector registry rejects duplicate connector ids", () => {
  assert.throws(
    () => createConnectorRegistry([
      registerConnector(CODEX_DESKTOP_CONNECTOR, {}),
      registerConnector(CODEX_DESKTOP_CONNECTOR, {}),
    ]),
    /duplicate connector id/,
  );
});

test("session keys round-trip connector and raw ids without ambiguity", () => {
  const key = makeSessionKey("kimi", "raw:id/with spaces");
  assert.deepEqual(parseSessionKey(key), {
    connectorId: "kimi",
    rawSessionId: "raw:id/with spaces",
    sessionKey: key,
  });
});
