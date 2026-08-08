import assert from "node:assert/strict";
import test from "node:test";

import { AuthorizationStore } from "../src/core/authorization.js";
import { CommandRouter } from "../src/core/commands.js";
import { ProjectStore } from "../src/core/projects.js";
import { SessionStore } from "../src/core/sessions.js";
import { makeSessionKey } from "../src/core/session-key.js";
import { Transcript } from "../src/core/transcript.js";
import {
  CAPACITY_RETRY_ERROR_MESSAGE,
  createComoteState,
} from "../src/server/state.js";

const PROJECT = "/repo";
const RAW_SESSION_ID = "shared-thread";
const DESKTOP_KEY = makeSessionKey("desktop", RAW_SESSION_ID);
const CLI_KEY = makeSessionKey("cli", RAW_SESSION_ID);
const NO_AUTOSTART = {
  autoStartWeChatRuntime: false,
  autoStartFeishuRuntime: false,
  autoStartDingTalkRuntime: false,
  autoStartTelegramRuntime: false,
};

function makeRouter({ persisted = {} } = {}) {
  return new CommandRouter({
    authorization: new AuthorizationStore(),
    projects: new ProjectStore(),
    sessions: new SessionStore(),
    persisted,
  });
}

function bindConversation(state, identity, conversationId, connectorId) {
  state.commandRouter.conversationByIdentity.set(
    state.commandRouter.identityKey(identity),
    { channel: "wechat", conversationId },
  );
  state.commandRouter.bindThreadForIdentity(
    identity,
    RAW_SESSION_ID,
    PROJECT,
    connectorId,
  );
}

function buildState({ capacityRetryEnabled = false } = {}) {
  const calls = { resume: [], start: [], cancel: [] };
  const desktop = {
    onEvent: null,
    getStatus() {
      return { state: "connected" };
    },
    async listProjects() {
      return [];
    },
    async resumeThread(args) {
      calls.resume.push(args);
    },
    async startTurn(args) {
      calls.start.push(args);
    },
    async cancelTurn(args) {
      calls.cancel.push(args);
    },
  };
  const cli = {
    getStatus() {
      return { state: "available" };
    },
    async runPrompt({ cwd, text }) {
      return { id: RAW_SESSION_ID, cwd, text, output: "CLI output" };
    },
  };
  const state = createComoteState({
    ...NO_AUTOSTART,
    desktop,
    cli,
    persisted: {
      settings: {
        capacityRetryEnabled,
        capacityRetryLimit: 3,
      },
    },
  });
  return { calls, state };
}

test("SessionStore isolates equal raw ids and restores identity-scoped active pointers", () => {
  const store = new SessionStore();
  const desktop = store.upsertExternalSession({
    projectPath: PROJECT,
    id: RAW_SESSION_ID,
    connector: "desktop",
    identityKey: "wechat:desktop-owner",
    title: "Desktop session",
  });
  const cli = store.upsertExternalSession({
    projectPath: PROJECT,
    id: RAW_SESSION_ID,
    connector: "cli",
    identityKey: "wechat:cli-owner",
    title: "CLI session",
  });

  assert.equal(desktop.id, RAW_SESSION_ID);
  assert.equal(desktop.sessionKey, DESKTOP_KEY);
  assert.equal(cli.id, RAW_SESSION_ID);
  assert.equal(cli.sessionKey, CLI_KEY);
  assert.equal(store.listSessions(PROJECT).length, 2);
  assert.throws(() => store.useSession(PROJECT, RAW_SESSION_ID), /ambiguous session id/);
  assert.equal(store.useSession(PROJECT, RAW_SESSION_ID, null, "cli").sessionKey, CLI_KEY);

  const restored = new SessionStore({ sessions: store.snapshot() });
  assert.equal(
    restored.getActiveSession(PROJECT, "wechat:desktop-owner")?.sessionKey,
    DESKTOP_KEY,
  );
  assert.equal(
    restored.getActiveSession(PROJECT, "wechat:cli-owner")?.sessionKey,
    CLI_KEY,
  );
});

test("SessionStore migrates legacy connector metadata and raw active pointers", () => {
  const store = new SessionStore({
    sessions: {
      sessions: [
        { projectPath: PROJECT, id: "legacy-desktop", title: "Desktop", state: "idle", messages: [] },
        { projectPath: PROJECT, id: "cli_legacy", title: "CLI", state: "idle", messages: [] },
        { projectPath: PROJECT, id: "explicit", connector: "cli", title: "Explicit CLI", state: "idle", messages: [] },
      ],
      activeByIdentity: [["wechat:owner\u0000/repo", "legacy-desktop"]],
    },
  });
  const sessions = store.listSessions(PROJECT);

  assert.equal(sessions.find((session) => session.id === "legacy-desktop")?.connector, "desktop");
  assert.equal(sessions.find((session) => session.id === "cli_legacy")?.connector, "cli");
  assert.equal(sessions.find((session) => session.id === "explicit")?.connector, "cli");
  assert.equal(
    store.getActiveSession(PROJECT, "wechat:owner")?.sessionKey,
    makeSessionKey("desktop", "legacy-desktop"),
  );
});

test("Transcript isolates, snapshots, and restores equal raw ids", () => {
  const transcript = new Transcript();
  transcript.record(RAW_SESSION_ID, "assistant", "Desktop answer", "desktop");
  transcript.record(RAW_SESSION_ID, "assistant", "CLI answer", "cli");

  assert.deepEqual(
    transcript.listThread(DESKTOP_KEY).messages.map((message) => message.text),
    ["Desktop answer"],
  );
  assert.deepEqual(
    transcript.listThread(CLI_KEY).messages.map((message) => message.text),
    ["CLI answer"],
  );

  const restored = new Transcript({ entries: transcript.snapshot() });
  assert.equal(restored.listThread(DESKTOP_KEY).sessionKey, DESKTOP_KEY);
  assert.equal(restored.listThread(CLI_KEY).sessionKey, CLI_KEY);
  assert.equal(restored.listThread(CLI_KEY).messages[0].text, "CLI answer");
});

test("Transcript migrates legacy raw entries with explicit connector precedence", () => {
  const transcript = new Transcript({
    entries: [
      {
        threadId: "legacy-desktop",
        updatedAt: "2025-01-01T00:00:00.000Z",
        messages: [{ role: "user", text: "desktop", at: "2025-01-01T00:00:00.000Z" }],
      },
      {
        threadId: "cli_legacy",
        updatedAt: "2025-01-01T00:00:01.000Z",
        messages: [{ role: "user", text: "cli", at: "2025-01-01T00:00:01.000Z" }],
      },
      {
        threadId: "explicit",
        connector: "cli",
        updatedAt: "2025-01-01T00:00:02.000Z",
        messages: [{ role: "user", text: "explicit cli", at: "2025-01-01T00:00:02.000Z" }],
      },
    ],
  });

  assert.equal(transcript.listThread(makeSessionKey("desktop", "legacy-desktop")).messages[0].text, "desktop");
  assert.equal(transcript.listThread(makeSessionKey("cli", "cli_legacy")).messages[0].text, "cli");
  assert.equal(transcript.listThread(makeSessionKey("cli", "explicit")).messages[0].text, "explicit cli");
});

test("CommandRouter isolates bindings and settings and rejects ambiguous raw lookup", () => {
  const router = makeRouter();
  const desktopIdentity = { channel: "wechat", stableId: "desktop-owner" };
  const cliIdentity = { channel: "wechat", stableId: "cli-owner" };
  router.conversationByIdentity.set(router.identityKey(desktopIdentity), {
    channel: "wechat",
    conversationId: "desktop-conversation",
  });
  router.conversationByIdentity.set(router.identityKey(cliIdentity), {
    channel: "wechat",
    conversationId: "cli-conversation",
  });
  router.bindThreadForIdentity(desktopIdentity, RAW_SESSION_ID, PROJECT, "desktop");
  router.bindThreadForIdentity(cliIdentity, RAW_SESSION_ID, PROJECT, "cli");
  router.setThreadSettings(DESKTOP_KEY, { model: "desktop-model", reasoningEffort: "high" });
  router.setThreadSettings(CLI_KEY, { model: "cli-model", reasoningEffort: "low" });

  assert.equal(router.getThreadBinding(RAW_SESSION_ID), null);
  assert.equal(router.getThreadBinding(DESKTOP_KEY)?.conversationId, "desktop-conversation");
  assert.equal(router.getThreadBinding(CLI_KEY)?.conversationId, "cli-conversation");
  assert.equal(router.getThreadSettings(DESKTOP_KEY)?.model, "desktop-model");
  assert.equal(router.getThreadSettings(CLI_KEY)?.model, "cli-model");

  const restored = makeRouter({ persisted: router.snapshot() });
  assert.equal(restored.getThreadBinding(DESKTOP_KEY)?.conversationId, "desktop-conversation");
  assert.equal(restored.getThreadBinding(CLI_KEY)?.conversationId, "cli-conversation");
  assert.equal(restored.getThreadSettings(DESKTOP_KEY)?.model, "desktop-model");
  assert.equal(restored.getThreadSettings(CLI_KEY)?.model, "cli-model");

  const desktopOnly = makeRouter();
  desktopOnly.threadBindings.set(DESKTOP_KEY, {
    channel: "wechat",
    conversationId: "desktop-only",
    sessionKey: DESKTOP_KEY,
    connectorId: "desktop",
    rawSessionId: RAW_SESSION_ID,
  });
  assert.equal(desktopOnly.getThreadBinding(CLI_KEY), null);
});

test("CommandRouter migrates legacy bindings and settings into connector namespaces", () => {
  const router = makeRouter({
    persisted: {
      threadBindings: [
        ["legacy-desktop", { channel: "wechat", conversationId: "desktop-conversation" }],
        ["explicit", { channel: "wechat", conversationId: "cli-conversation", connector: "cli" }],
      ],
      threadSettingsById: [
        ["legacy-desktop", { model: "desktop-model" }],
        ["cli_legacy", { model: "cli-model" }],
      ],
    },
  });

  assert.equal(router.getThreadBinding(makeSessionKey("desktop", "legacy-desktop"))?.conversationId, "desktop-conversation");
  assert.equal(router.getThreadBinding(makeSessionKey("cli", "explicit"))?.conversationId, "cli-conversation");
  assert.equal(router.getThreadSettings(makeSessionKey("desktop", "legacy-desktop"))?.model, "desktop-model");
  assert.equal(router.getThreadSettings(makeSessionKey("cli", "cli_legacy"))?.model, "cli-model");
});

test("routeConnectorEvent isolates equal raw ids across conversations, transcripts, and dedupe keys", async (t) => {
  const { state } = buildState();
  t.after(() => state.shutdown());
  bindConversation(
    state,
    { channel: "wechat", stableId: "desktop-owner" },
    "desktop-conversation",
    "desktop",
  );
  bindConversation(
    state,
    { channel: "wechat", stableId: "cli-owner" },
    "cli-conversation",
    "cli",
  );

  state.routeConnectorEvent({ type: "turnStarted", threadId: RAW_SESSION_ID, turnId: "turn-1" }, "desktop");
  state.routeConnectorEvent({ type: "turnStarted", threadId: RAW_SESSION_ID, turnId: "turn-1" }, "cli");
  state.routeConnectorEvent({ type: "milestone", threadId: RAW_SESSION_ID, turnId: "turn-1", kind: "command", label: "desktop-step" }, "desktop");
  state.routeConnectorEvent({ type: "milestone", threadId: RAW_SESSION_ID, turnId: "turn-1", kind: "command", label: "cli-step" }, "cli");
  state.routeConnectorEvent({ type: "agentMessage", threadId: RAW_SESSION_ID, turnId: "turn-1", itemId: "shared-item", text: "Desktop answer" }, "desktop");
  state.routeConnectorEvent({ type: "agentMessage", threadId: RAW_SESSION_ID, turnId: "turn-1", itemId: "shared-item", text: "CLI answer" }, "cli");

  const replies = state.outboundReplies.snapshot();
  const agentReplies = replies.filter((entry) => entry.dedupeKey?.startsWith("agent:"));
  const milestoneReplies = replies.filter((entry) => entry.dedupeKey?.startsWith("ms:"));
  assert.deepEqual(
    agentReplies.map((entry) => [entry.conversationId, entry.text]).sort(),
    [
      ["cli-conversation", "CLI answer"],
      ["desktop-conversation", "Desktop answer"],
    ],
  );
  assert.deepEqual(
    agentReplies.map((entry) => entry.dedupeKey).sort(),
    ["agent:cli~shared-thread:shared-item", "agent:shared-item"],
  );
  assert.deepEqual(
    milestoneReplies.map((entry) => entry.dedupeKey).sort(),
    ["ms:cli~shared-thread:1:1", "ms:shared-thread:1:1"],
  );
  assert.equal(state.transcript.listThread(DESKTOP_KEY).messages[0].text, "Desktop answer");
  assert.equal(state.transcript.listThread(CLI_KEY).messages[0].text, "CLI answer");

  state.routeConnectorEvent({ type: "turnCompleted", threadId: RAW_SESSION_ID, turnId: "turn-1", changedPaths: [] }, "desktop");
  state.routeConnectorEvent({ type: "turnCompleted", threadId: RAW_SESSION_ID, turnId: "turn-1", changedPaths: [] }, "cli");
});

test("CLI capacity errors never invoke the Desktop retry connector", async (t) => {
  const { calls, state } = buildState({ capacityRetryEnabled: true });
  t.after(() => state.shutdown());
  bindConversation(
    state,
    { channel: "wechat", stableId: "desktop-owner" },
    "desktop-conversation",
    "desktop",
  );
  bindConversation(
    state,
    { channel: "wechat", stableId: "cli-owner" },
    "cli-conversation",
    "cli",
  );

  state.routeConnectorEvent({
    type: "error",
    threadId: RAW_SESSION_ID,
    turnId: "cli-turn-1",
    message: CAPACITY_RETRY_ERROR_MESSAGE,
  }, "cli");

  assert.deepEqual(calls.resume, []);
  assert.deepEqual(calls.start, []);
  assert.deepEqual(calls.cancel, []);
  assert.equal(state.connectorRegistry.supports("cli", "capacityRetry"), false);
  assert.equal(
    state.outboundReplies.snapshot().some((entry) =>
      entry.conversationId === "cli-conversation"
      && entry.text?.includes(CAPACITY_RETRY_ERROR_MESSAGE)),
    true,
  );
  assert.equal(
    state.transcript.listThread(CLI_KEY).messages.some((message) => message.text === "继续"),
    false,
  );
});
