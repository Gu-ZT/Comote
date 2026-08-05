import assert from "node:assert/strict";
import test from "node:test";

import {
  CAPACITY_RETRY_ERROR_MESSAGE,
  createComoteState,
} from "../src/server/state.js";

function buildState({ enabled = true, limit = 3 } = {}) {
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
  const state = createComoteState({
    desktop,
    persisted: {
      settings: {
        capacityRetryEnabled: enabled,
        capacityRetryLimit: limit,
      },
    },
    autoStartWeChatRuntime: false,
    autoStartFeishuRuntime: false,
    autoStartDingTalkRuntime: false,
    autoStartTelegramRuntime: false,
  });
  return { calls, desktop, state };
}

function capacityError(threadId, turnId) {
  return { type: "error", threadId, turnId, message: CAPACITY_RETRY_ERROR_MESSAGE };
}

function turnStarted(threadId, turnId) {
  return { type: "turnStarted", threadId, turnId };
}

function turnCompleted(threadId, turnId) {
  return { type: "turnCompleted", threadId, turnId, changedPaths: [] };
}

async function flushAsyncWork() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

test("capacity errors send continue only after each failed turn and stop at the limit", async () => {
  const { calls, desktop } = buildState({ limit: 3 });
  const threadId = "thread-capacity";

  desktop.onEvent(turnStarted(threadId, "turn-1"));
  desktop.onEvent(capacityError(threadId, "turn-1"));
  assert.equal(calls.start.length, 0, "a continuation is not started inside the failed turn");
  desktop.onEvent(turnCompleted(threadId, "turn-1"));
  await flushAsyncWork();
  assert.equal(calls.start.length, 1);
  assert.equal(calls.start[0].text, "继续");
  assert.equal(calls.resume.length, 1);

  desktop.onEvent(turnStarted(threadId, "turn-2"));
  desktop.onEvent(capacityError(threadId, "turn-2"));
  desktop.onEvent(turnCompleted(threadId, "turn-2"));
  await flushAsyncWork();
  assert.equal(calls.start.length, 2);

  desktop.onEvent(turnStarted(threadId, "turn-3"));
  desktop.onEvent(capacityError(threadId, "turn-3"));
  await flushAsyncWork();
  assert.equal(calls.start.length, 2, "the limit error does not send another continuation");
  assert.equal(calls.cancel.length, 1, "the current task is interrupted once at the limit");
  assert.equal(calls.cancel[0].threadId, threadId);
});

test("a successful response resets the consecutive capacity error count", async () => {
  const { calls, desktop } = buildState({ limit: 2 });
  const threadId = "thread-reset";

  desktop.onEvent(turnStarted(threadId, "turn-1"));
  desktop.onEvent(capacityError(threadId, "turn-1"));
  desktop.onEvent(turnCompleted(threadId, "turn-1"));
  await flushAsyncWork();
  desktop.onEvent(turnStarted(threadId, "turn-2"));
  desktop.onEvent({ type: "agentMessage", threadId, turnId: "turn-2", text: "完成" });
  desktop.onEvent(turnCompleted(threadId, "turn-2"));

  // A later user turn starts a fresh consecutive-error sequence.
  desktop.onEvent(turnStarted(threadId, "turn-3"));
  desktop.onEvent(capacityError(threadId, "turn-3"));
  desktop.onEvent(turnCompleted(threadId, "turn-3"));
  await flushAsyncWork();

  assert.equal(calls.cancel.length, 0);
  assert.equal(calls.start.length, 2, "the later capacity error gets one retry after the reset");
});

test("disabled retry leaves capacity errors on the normal error path", async () => {
  const { calls, desktop, state } = buildState({ enabled: false, limit: 3 });
  state.commandRouter.threadBindings.set("thread-disabled", {
    channel: "wechat",
    conversationId: "conversation-1",
  });

  desktop.onEvent(turnStarted("thread-disabled", "turn-1"));
  desktop.onEvent(capacityError("thread-disabled", "turn-1"));
  await flushAsyncWork();

  assert.equal(calls.start.length, 0);
  assert.equal(calls.cancel.length, 0);
  assert.equal(
    state.outboundReplies.list({ channel: "wechat", pendingOnly: false }).some((entry) =>
      entry.text?.includes(CAPACITY_RETRY_ERROR_MESSAGE)),
    true,
  );
});
