import type { ConnectorId, JsonMap } from "../types.js";

/** Host-level capabilities. These describe Comote integration, not wire protocols. */
export interface ConnectorCapabilities {
  projects?: boolean;
  sessions?: boolean;
  startSession?: boolean;
  resumeSession?: boolean;
  turns?: boolean;
  streamingEvents?: boolean;
  transcript?: boolean;
  models?: boolean;
  threadSettings?: boolean;
  approvals?: boolean;
  cancel?: boolean;
  usage?: boolean;
  capacityRetry?: boolean;
  changedFiles?: boolean;
}

export interface ConnectorDefinition {
  id: ConnectorId;
  displayName: string;
  sessionFamily: string;
  capabilities: ConnectorCapabilities;
}

export interface AgentConnector extends JsonMap {
  getStatus?: () => JsonMap;
  onEvent?: ((event: JsonMap) => unknown) | null;
}

export interface ConnectorRegistration {
  definition: ConnectorDefinition;
  connector: AgentConnector;
}

export const CODEX_DESKTOP_CONNECTOR: ConnectorDefinition = {
  id: "desktop",
  displayName: "Codex Desktop",
  sessionFamily: "codex",
  capabilities: {
    projects: true,
    sessions: true,
    startSession: true,
    resumeSession: true,
    turns: true,
    streamingEvents: true,
    transcript: true,
    models: true,
    threadSettings: true,
    approvals: true,
    cancel: true,
    usage: true,
    capacityRetry: true,
    changedFiles: true,
  },
};

export const CODEX_CLI_CONNECTOR: ConnectorDefinition = {
  id: "cli",
  displayName: "Codex CLI",
  sessionFamily: "codex",
  capabilities: {
    startSession: true,
    resumeSession: true,
    turns: true,
  },
};

// Reserved contract for the later ACP phase. Stage 1 intentionally registers no
// Kimi implementation and exposes no Kimi UI or settings.
export const KIMI_CONNECTOR: ConnectorDefinition = {
  id: "kimi",
  displayName: "Kimi",
  sessionFamily: "kimi",
  capabilities: {},
};

export function registerConnector(
  definition: ConnectorDefinition,
  connector: AgentConnector,
): ConnectorRegistration {
  return { definition, connector };
}
