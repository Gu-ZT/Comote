import type { ConnectorId } from "../types.js";
import type {
  AgentConnector,
  ConnectorCapabilities,
  ConnectorRegistration,
} from "./contracts.js";

export function createConnectorRegistry(registrations: ConnectorRegistration[] = []) {
  const byId = new Map<ConnectorId, ConnectorRegistration>();
  for (const registration of registrations) {
    validateRegistration(registration);
    const id = registration.definition.id;
    if (byId.has(id)) {
      throw new Error(`duplicate connector id: ${id}`);
    }
    byId.set(id, registration);
  }

  return {
    getRegistration(id: ConnectorId): ConnectorRegistration | null {
      return byId.get(id) ?? null;
    },
    getConnector(id: ConnectorId): AgentConnector | null {
      return byId.get(id)?.connector ?? null;
    },
    getCapabilities(id: ConnectorId): ConnectorCapabilities {
      return { ...(byId.get(id)?.definition.capabilities ?? {}) };
    },
    supports(id: ConnectorId, capability: keyof ConnectorCapabilities): boolean {
      return Boolean(byId.get(id)?.definition.capabilities?.[capability]);
    },
    sameSessionFamily(left: ConnectorId, right: ConnectorId): boolean {
      const leftFamily = byId.get(left)?.definition.sessionFamily;
      const rightFamily = byId.get(right)?.definition.sessionFamily;
      return Boolean(leftFamily && rightFamily && leftFamily === rightFamily);
    },
    listConnectors(): ConnectorRegistration[] {
      return [...byId.values()];
    },
  };
}

export type ConnectorRegistry = ReturnType<typeof createConnectorRegistry>;

function validateRegistration(registration: ConnectorRegistration): void {
  if (!registration?.definition?.id) {
    throw new Error("connector registration requires definition.id");
  }
  if (!registration.definition.sessionFamily) {
    throw new Error(`connector ${registration.definition.id} requires a sessionFamily`);
  }
  if (!registration.connector || typeof registration.connector !== "object") {
    throw new Error(`connector ${registration.definition.id} requires an implementation`);
  }
}
