import type { ConnectorId, Session } from "../types.js";

const SESSION_KEY_PREFIX = "connector:";

export interface SessionRef {
  connectorId: ConnectorId;
  rawSessionId: string;
  sessionKey: string;
}

/** Legacy migration rule: explicit connector wins; cli_* defaults to CLI; all else Desktop. */
export function inferLegacyConnectorId(
  rawSessionId: unknown,
  connectorId: ConnectorId | string | null | undefined = null,
): ConnectorId {
  if (typeof connectorId === "string" && connectorId.trim()) {
    return connectorId.trim() as ConnectorId;
  }
  return String(rawSessionId ?? "").startsWith("cli_") ? "cli" : "desktop";
}

export function makeSessionKey(connectorId: ConnectorId | string, rawSessionId: unknown): string {
  const connector = String(connectorId ?? "").trim();
  const raw = String(rawSessionId ?? "");
  if (!connector) {
    throw new Error("connectorId is required");
  }
  if (!raw) {
    throw new Error("rawSessionId is required");
  }
  return `${SESSION_KEY_PREFIX}${encodeURIComponent(connector)}:${encodeURIComponent(raw)}`;
}

export function parseSessionKey(value: unknown): SessionRef | null {
  if (typeof value !== "string" || !value.startsWith(SESSION_KEY_PREFIX)) {
    return null;
  }
  const separator = value.indexOf(":", SESSION_KEY_PREFIX.length);
  if (separator < 0) {
    return null;
  }
  try {
    const connectorId = decodeURIComponent(value.slice(SESSION_KEY_PREFIX.length, separator));
    const rawSessionId = decodeURIComponent(value.slice(separator + 1));
    if (!connectorId || !rawSessionId) {
      return null;
    }
    return {
      connectorId: connectorId as ConnectorId,
      rawSessionId,
      sessionKey: value,
    };
  } catch {
    return null;
  }
}

export function toSessionRef(
  sessionIdOrKey: unknown,
  connectorId: ConnectorId | string | null | undefined = null,
): SessionRef {
  const parsed = parseSessionKey(sessionIdOrKey);
  if (parsed) {
    return parsed;
  }
  const rawSessionId = String(sessionIdOrKey ?? "");
  const resolvedConnector = inferLegacyConnectorId(rawSessionId, connectorId);
  return {
    connectorId: resolvedConnector,
    rawSessionId,
    sessionKey: makeSessionKey(resolvedConnector, rawSessionId),
  };
}

export function sessionRefFromSession(session: Partial<Session>): SessionRef {
  const persistedKey = parseSessionKey(session.sessionKey);
  if (persistedKey) {
    return persistedKey;
  }
  const rawSessionId = session.rawSessionId ?? session.id;
  return toSessionRef(rawSessionId, session.connector);
}
