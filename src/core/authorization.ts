import type { Identity } from "../types.js";

function identityKey(identity: Identity): string {
  if (!identity?.channel || !identity?.stableId) {
    throw new Error("identity requires channel and stableId");
  }
  return `${identity.channel}:${identity.stableId}`;
}

export class AuthorizationStore {
  readonly identities: Map<string, Identity>;
  readonly detectedIdentities: Map<string, Identity>;

  constructor({ identities = [] }: { identities?: Identity[] } = {}) {
    this.identities = new Map<string, Identity>();
    this.detectedIdentities = new Map<string, Identity>();
    for (const identity of identities) {
      this.confirmIdentity(identity);
    }
  }

  confirmIdentity(identity: Identity): Identity {
    const confirmed = {
      channel: identity.channel,
      stableId: identity.stableId,
      displayName: identity.displayName ?? identity.stableId,
      role: identity.role ?? "operator",
    };
    this.identities.set(identityKey(confirmed), confirmed);
    this.detectedIdentities.delete(identityKey(confirmed));
    return { ...confirmed };
  }

  detectIdentity(identity: Identity): Identity {
    const detected = {
      channel: identity.channel,
      stableId: identity.stableId,
      displayName: identity.displayName ?? identity.stableId,
      role: identity.role ?? "operator",
    };
    const key = identityKey(detected);
    if (!this.identities.has(key)) {
      this.detectedIdentities.set(key, detected);
    }
    return { ...detected };
  }

  removeIdentity(identity: Identity): boolean {
    return this.identities.delete(identityKey(identity));
  }

  isAuthorized(identity: Identity | null | undefined): boolean {
    if (!identity?.channel || !identity?.stableId) {
      return false;
    }
    return this.identities.has(identityKey(identity));
  }

  listIdentities(): Identity[] {
    return Array.from(this.identities.values(), (identity) => ({ ...identity }));
  }

  listDetectedIdentities(): Identity[] {
    return Array.from(this.detectedIdentities.values(), (identity) => ({ ...identity }));
  }
}

export function describeIdentity(identity: Identity): string {
  return `${identity.channel}:${identity.displayName ?? identity.stableId}`;
}
