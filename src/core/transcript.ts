import type { ConnectorId, TranscriptMessage } from "../types.js";
import { parseSessionKey, toSessionRef } from "./session-key.js";

/**
 * Bounded per-session conversation history. The public threadId remains the raw
 * connector id; the internal/persisted key includes the connector namespace.
 */
export class Transcript {
  private readonly maxPerThread: number;
  private readonly maxThreads: number;
  private readonly threads: Map<string, TranscriptThread>;

  constructor({ entries = [], maxPerThread = 50, maxThreads = 20 }: {
    entries?: TranscriptThread[];
    maxPerThread?: number;
    maxThreads?: number;
  } = {}) {
    this.maxPerThread = maxPerThread;
    this.maxThreads = maxThreads;
    this.threads = new Map();
    for (const entry of entries) {
      const storedId = entry?.sessionKey ?? entry?.rawSessionId ?? entry?.threadId;
      if (!storedId) continue;
      const ref = toSessionRef(storedId, entry.connector);
      this.threads.set(ref.sessionKey, {
        threadId: ref.rawSessionId,
        rawSessionId: ref.rawSessionId,
        sessionKey: ref.sessionKey,
        connector: ref.connectorId,
        updatedAt: entry.updatedAt ?? null,
        messages: (entry.messages ?? []).slice(-maxPerThread),
      });
    }
  }

  record(
    sessionIdOrKey: string,
    role: string,
    text: string,
    connector: ConnectorId | string | null = null,
  ): void {
    if (!sessionIdOrKey || !text) return;
    const ref = toSessionRef(sessionIdOrKey, connector);
    let thread = this.threads.get(ref.sessionKey);
    if (!thread) {
      thread = {
        threadId: ref.rawSessionId,
        rawSessionId: ref.rawSessionId,
        sessionKey: ref.sessionKey,
        connector: ref.connectorId,
        updatedAt: null,
        messages: [],
      };
      this.threads.set(ref.sessionKey, thread);
    }
    const now = new Date().toISOString();
    thread.messages.push({ role, text: String(text), at: now });
    if (thread.messages.length > this.maxPerThread) {
      thread.messages.splice(0, thread.messages.length - this.maxPerThread);
    }
    thread.updatedAt = now;
    if (this.threads.size > this.maxThreads) {
      const oldest = [...this.threads.values()].sort((a, b) =>
        (a.updatedAt ?? "").localeCompare(b.updatedAt ?? ""),
      )[0];
      if (oldest) this.threads.delete(oldest.sessionKey);
    }
  }

  list(): TranscriptThread[] {
    return [...this.threads.values()]
      .map(copyThread)
      .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  }

  listThread(
    sessionIdOrKey: string,
    { limit = 20, offset = 0, connector = null }: {
      limit?: number;
      offset?: number;
      connector?: ConnectorId | string | null;
    } = {},
  ) {
    const ref = toSessionRef(sessionIdOrKey, connector);
    let thread = this.threads.get(ref.sessionKey);
    // Back-compat for callers that only know a raw id: use a unique matching
    // namespace, but never choose arbitrarily when two connectors share the id.
    if (!thread && !parseSessionKey(sessionIdOrKey)) {
      const matches = [...this.threads.values()].filter((entry) => entry.rawSessionId === sessionIdOrKey);
      if (matches.length === 1) thread = matches[0];
    }
    if (!thread) {
      return {
        threadId: ref.rawSessionId,
        sessionKey: ref.sessionKey,
        connector: ref.connectorId,
        messages: [],
        total: 0,
        hasMore: false,
      };
    }
    const newestFirst = thread.messages.slice().reverse();
    const page = newestFirst.slice(offset, offset + limit).map((message) => ({ ...message }));
    return {
      threadId: thread.rawSessionId,
      sessionKey: thread.sessionKey,
      connector: thread.connector,
      messages: page,
      total: thread.messages.length,
      hasMore: offset + page.length < thread.messages.length,
    };
  }

  snapshot(): TranscriptThread[] {
    return this.list();
  }
}

interface TranscriptThread {
  threadId: string;
  rawSessionId?: string;
  sessionKey?: string;
  connector?: ConnectorId | string | null;
  updatedAt: string | null;
  messages: TranscriptMessage[];
}

function copyThread(thread: TranscriptThread): TranscriptThread {
  return {
    ...thread,
    messages: thread.messages.map((message) => ({ ...message })),
  };
}
