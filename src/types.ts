/** Shared domain contracts used at the boundaries between the daemon layers. */
export type JsonMap = Record<string, any>;

declare global {
  interface Error {
    code?: string | number;
  }
}

export type ChannelId = string;
export type ConversationType = "direct" | "group" | string;
export type MediaKind = "image" | "file" | string;

/** Settings that Codex applies to the current and subsequent turns. */
export interface ThreadSettings {
  model?: string | null;
  reasoningEffort?: string | null;
}

export interface StartTurnOptions extends ThreadSettings {
  threadId: string;
  text: string;
  cwd?: string | null;
  images?: string[];
}

export interface Identity {
  channel: ChannelId;
  stableId: string;
  displayName?: string | null;
  role?: string;
}

export interface Attachment extends JsonMap {
  id?: string | number;
  fileName?: string;
  name?: string;
  kind?: MediaKind;
  localPath?: string;
}

export interface NormalizedInboundMessage {
  messageId: string;
  conversationId: string;
  conversationType: ConversationType;
  identity: Identity;
  text: string;
  attachments: Attachment[];
  accountId?: string | null;
}

export interface ConversationRef {
  channel: ChannelId;
  conversationId: string;
  accountId?: string | null;
  inReplyTo?: string | null;
}

export type ReplyKind = "text" | "status" | "approval" | "approvalResolved" | "picker" | "media";

export interface OutboundReply extends ConversationRef, JsonMap {
  id?: string;
  kind: ReplyKind;
  text?: string;
  path?: string;
  fileName?: string;
  inReplyTo?: string;
  dedupeKey?: string;
  noFailureNotice?: boolean;
}

export interface RouterReply extends JsonMap {
  kind?: string;
  text?: string;
  startedThreadId?: string | null;
  approvalResolution?: boolean;
  picker?: { pickKind: string; items: JsonMap[] };
}

export interface Project {
  id: string;
  name: string;
  path: string;
  source: string;
  status: string;
}

export interface TranscriptMessage {
  role: string;
  text: string;
  at: string;
}

export interface Session {
  id: string;
  projectPath: string;
  title: string;
  state: string;
  messages: Array<{ role: string; text: string }>;
  updatedAt: string;
  external?: boolean;
  connector?: string | null;
}

export interface EventEntry {
  id: number;
  at: string;
  level: "info" | "warn" | "error" | string;
  message: string;
  detail?: unknown;
}

export interface QueueEntry extends OutboundReply {
  id: string;
  status: "queued" | "retrying" | "delivered" | "failed";
  createdAt: string;
  ackedAt: string | null;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: string | null;
}

export interface CommandRouterLike {
  authorization?: { isAuthorized?: (identity: Identity) => boolean };
  handleMessageAsync(input: JsonMap): Promise<RouterReply>;
}

export type SendReply = (reply: OutboundReply) => Promise<unknown> | unknown;
export type AttachmentDownloader = (input: {
  attachment: Attachment;
  identity: Identity;
}) => Promise<{ relativePath: string }>;

export interface ChannelAdapterOptions {
  channelId: ChannelId;
  commandRouter: CommandRouterLike;
  sendReply: SendReply;
  onDetectedIdentity?: ((identity: Identity) => void) | null;
  resolveIdentityName?: ((identity: Identity) => Promise<unknown> | unknown) | null;
  downloadAttachment?: AttachmentDownloader | null;
  supportsMedia?: boolean | null;
  allowGroups?: boolean;
  noProjectMessage?: (() => string) | string | null;
  beginInboundFeedback?: ((message: NormalizedInboundMessage) => Promise<unknown> | unknown) | null;
  finishInboundFeedback?: ((input: JsonMap) => Promise<unknown> | unknown) | null;
  singleMessageTurns?: boolean | (() => boolean);
}

export interface ChannelDriverLike extends JsonMap {
  getStatus?: () => JsonMap;
  startEventStream?: (handlers: JsonMap) => Promise<unknown>;
  stopEventStream?: () => void;
  fetchUpdates?: (input: JsonMap) => Promise<{ updates?: unknown[]; nextCursor?: string | null }>;
  normalizeUpdate?: (update: unknown) => unknown;
}

export interface OutboundQueueLike {
  enqueue?(reply: OutboundReply): QueueEntry;
  list(options: JsonMap): QueueEntry[];
  markDelivered(id: string): QueueEntry;
  markFailed(id: string, error: unknown): QueueEntry;
}

export interface ChannelRendererLike {
  render(reply: QueueEntry, context: JsonMap): Promise<unknown>;
  [key: string]: any;
}

export interface RuntimeOptions {
  channelId: ChannelId;
  inboundMode?: "push" | "poll" | string;
  adapter: any;
  outboundQueue: OutboundQueueLike;
  renderer: ChannelRendererLike;
  driver?: ChannelDriverLike | null;
  persist?: (() => Promise<unknown> | unknown) | null;
  eventLog?: {
    info?: (message: string, detail?: unknown) => unknown;
    warn?: (message: string, detail?: unknown) => unknown;
    error?: (message: string, detail?: unknown) => unknown;
  } | null;
  onAction?: ((action: unknown) => Promise<unknown> | unknown) | null;
  pollIntervalMs?: number;
  dedupMax?: number;
}

export interface PluginMeta {
  id: string;
  displayName: string;
  inboundMode: string;
  binding: string;
  capabilities?: JsonMap;
  [key: string]: any;
}

export interface ChannelPlugin {
  meta: PluginMeta;
  normalizeConfig(raw?: JsonMap): JsonMap;
  publicConfig?(config: JsonMap): JsonMap;
  createDriver?(config: JsonMap): ChannelDriverLike | null;
  [key: string]: any;
}
