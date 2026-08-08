import type { ConnectorId, Session } from "../types.js";
import {
  makeSessionKey,
  parseSessionKey,
  sessionRefFromSession,
  toSessionRef,
} from "./session-key.js";

type SessionInput = Partial<Session> & {
  projectPath: string;
  id: string;
  messages?: Array<{ role: string; text: string }>;
  identityKey?: string | null;
};

interface SessionSnapshot {
  sessions: Session[];
  activeByIdentity?: Array<[string, string]>;
}

function makeId(prefix: string, nextId: number): string {
  return `${prefix}_${String(nextId).padStart(4, "0")}`;
}

// Extracts the numeric suffix from a "session_NNNN" id, or 0 if the id does not
// match our generated pattern (e.g. external thread ids).
function parseSessionIdNumber(id: string): number {
  const match = /^session_(\d+)$/.exec(id);
  return match ? Number(match[1]) : 0;
}

// Composite key for the per-identity active-session pointer. NUL cannot
// appear in either an identityKey ("channel:stableId") or a filesystem path,
// so the join is unambiguous.
function identityProjectKey(identityKey: string, projectPath: string): string {
  return `${identityKey}\u0000${projectPath}`;
}

function projectPathFromIdentityKey(key: string): string | null {
  const separator = key.indexOf("\u0000");
  return separator >= 0 ? key.slice(separator + 1) : null;
}

function copySession(session: Session): Session {
  return { ...session, messages: [...session.messages] };
}

export class SessionStore {
  // `sessions` accepts either the legacy persisted shape (a flat array of
  // session objects) or the current one ({ sessions, activeByIdentity }).
  readonly sessionsByProject: Map<string, Session[]>;
  readonly activeByProject: Map<string, string>;
  readonly activeByIdentity: Map<string, string>;
  private nextId: number;

  constructor({ sessions = [] }: { sessions?: Session[] | SessionSnapshot } = {}) {
    const persisted: SessionSnapshot = Array.isArray(sessions) ? { sessions } : sessions ?? { sessions: [] };
    this.sessionsByProject = new Map<string, Session[]>();
    // Active pointers store connector-aware session keys. Session.id remains the
    // legacy/public raw id so existing APIs and Codex calls stay unchanged.
    this.activeByProject = new Map<string, string>();
    this.activeByIdentity = new Map<string, string>();
    this.nextId = 1;
    for (const session of persisted.sessions ?? []) {
      this.upsertExternalSession(session as SessionInput);
      const existingNumber = parseSessionIdNumber(session.rawSessionId ?? session.id);
      if (existingNumber >= this.nextId) {
        this.nextId = existingNumber + 1;
      }
    }
    // Migrate legacy raw-id pointers after every session has been normalized.
    for (const [key, storedId] of persisted.activeByIdentity ?? []) {
      const projectPath = projectPathFromIdentityKey(key);
      if (!projectPath) continue;
      const resolved = this.resolveStoredSessionKey(projectPath, storedId);
      if (resolved) this.activeByIdentity.set(key, resolved);
    }
  }

  setActive(projectPath: string, sessionIdOrKey: string, identityKey: string | null = null): void {
    const sessionKey = this.resolveStoredSessionKey(projectPath, sessionIdOrKey)
      ?? parseSessionKey(sessionIdOrKey)?.sessionKey
      ?? sessionIdOrKey;
    this.activeByProject.set(projectPath, sessionKey);
    if (identityKey) {
      this.activeByIdentity.set(identityProjectKey(identityKey, projectPath), sessionKey);
    }
  }

  createSession({ projectPath, title, firstMessage, identityKey = null, connector = null }: {
    projectPath: string;
    title?: string;
    firstMessage?: string;
    identityKey?: string | null;
    connector?: ConnectorId | string | null;
  }): Session {
    if (!projectPath) {
      throw new Error("projectPath is required");
    }
    const rawSessionId = makeId("session", this.nextId++);
    const ref = toSessionRef(rawSessionId, connector);
    const session: Session = {
      id: rawSessionId,
      rawSessionId,
      sessionKey: ref.sessionKey,
      connector: ref.connectorId,
      projectPath,
      title: title || firstMessage || "Untitled session",
      state: "idle",
      messages: firstMessage ? [{ role: "user", text: firstMessage }] : [],
      updatedAt: new Date().toISOString(),
    };

    const projectSessions = this.sessionsByProject.get(projectPath) ?? [];
    projectSessions.push(session);
    this.sessionsByProject.set(projectPath, projectSessions);
    this.setActive(projectPath, ref.sessionKey, identityKey);
    return copySession(session);
  }

  upsertExternalSession(input: SessionInput): Session {
    const {
      projectPath,
      title,
      state = "idle",
      messages = [],
      identityKey = null,
    } = input;
    const rawSessionId = input.rawSessionId ?? input.id;
    if (!projectPath || !rawSessionId) {
      throw new Error("projectPath and id are required");
    }
    const ref = sessionRefFromSession({
      ...input,
      id: rawSessionId,
      rawSessionId,
    });
    const projectSessions = this.sessionsByProject.get(projectPath) ?? [];
    const existing = projectSessions.find((session) => session.sessionKey === ref.sessionKey);
    if (existing) {
      existing.title = title ?? existing.title;
      existing.state = state ?? existing.state;
      existing.updatedAt = new Date().toISOString();
      this.setActive(projectPath, existing.sessionKey, identityKey);
      return copySession(existing);
    }

    const session: Session = {
      id: rawSessionId,
      rawSessionId,
      sessionKey: ref.sessionKey,
      connector: ref.connectorId,
      projectPath,
      title: title || rawSessionId,
      state,
      messages: [...messages],
      updatedAt: input.updatedAt ?? new Date().toISOString(),
      external: input.external ?? true,
    };
    projectSessions.push(session);
    this.sessionsByProject.set(projectPath, projectSessions);
    this.setActive(projectPath, ref.sessionKey, identityKey);
    return copySession(session);
  }

  listSessions(projectPath: string): Session[] {
    return (this.sessionsByProject.get(projectPath) ?? []).map(copySession);
  }

  useSession(
    projectPath: string,
    sessionIdOrNumber: string | number,
    identityKey: string | null = null,
    connector: ConnectorId | string | null = null,
  ): Session {
    const projectSessions = this.sessionsByProject.get(projectPath) ?? [];
    const byNumber = projectSessions[Number(sessionIdOrNumber) - 1];
    let session = byNumber;
    if (typeof sessionIdOrNumber === "string") {
      const parsed = parseSessionKey(sessionIdOrNumber);
      if (parsed) {
        session = projectSessions.find((candidate) => candidate.sessionKey === parsed.sessionKey);
      } else if (connector) {
        const key = makeSessionKey(connector, sessionIdOrNumber);
        session = projectSessions.find((candidate) => candidate.sessionKey === key) ?? byNumber;
      } else {
        const candidates = projectSessions.filter((candidate) => candidate.id === sessionIdOrNumber);
        if (candidates.length > 1) {
          throw new Error(`ambiguous session id: ${sessionIdOrNumber}`);
        }
        session = candidates[0] ?? byNumber;
      }
    }
    if (!session) {
      throw new Error(`unknown session: ${sessionIdOrNumber}`);
    }
    this.setActive(projectPath, session.sessionKey, identityKey);
    return copySession(session);
  }

  getActiveSession(projectPath: string, identityKey: string | null = null): Session | null {
    // Identity-scoped reads are strict: only the identity's own pointer counts.
    const activeKey = identityKey
      ? this.activeByIdentity.get(identityProjectKey(identityKey, projectPath)) ?? null
      : this.activeByProject.get(projectPath);
    if (!activeKey) {
      return null;
    }
    const session = (this.sessionsByProject.get(projectPath) ?? []).find(
      (candidate) => candidate.sessionKey === activeKey,
    );
    return session ? copySession(session) : null;
  }

  snapshot(): SessionSnapshot {
    return {
      sessions: Array.from(this.sessionsByProject.values()).flat().map(copySession),
      activeByIdentity: [...this.activeByIdentity],
    };
  }

  private resolveStoredSessionKey(projectPath: string, storedId: string): string | null {
    const sessions = this.sessionsByProject.get(projectPath) ?? [];
    const parsed = parseSessionKey(storedId);
    if (parsed && sessions.some((session) => session.sessionKey === parsed.sessionKey)) {
      return parsed.sessionKey;
    }
    const inferred = toSessionRef(storedId);
    if (sessions.some((session) => session.sessionKey === inferred.sessionKey)) {
      return inferred.sessionKey;
    }
    const matches = sessions.filter((session) => session.id === storedId);
    return matches.length === 1 ? matches[0].sessionKey ?? null : null;
  }
}
