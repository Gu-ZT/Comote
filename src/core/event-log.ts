/**
 * In-memory ring buffer of diagnostic events for the settings UI Logs panel.
 * Events are ephemeral by design — they are not persisted across daemon restarts.
 */
export class EventLog {
  readonly capacity: number;
  private entries: EventEntry[];
  private sequence: number;

  constructor({ capacity = 200, entries = [] }: { capacity?: number; entries?: EventEntry[] } = {}) {
    this.capacity = capacity;
    this.entries = entries.slice(-capacity).map((entry) => ({ ...entry }));
    this.sequence = this.entries.reduce((max, entry) => Math.max(max, entry.id ?? 0), 0);
  }

  // Chronological (oldest-first) snapshot for persistence.
  snapshot() {
    return this.entries.map((entry) => ({ ...entry }));
  }

  record(level: EventEntry["level"], message: unknown, detail: unknown = null): EventEntry {
    const entry = {
      id: ++this.sequence,
      at: new Date().toISOString(),
      level,
      message: String(message ?? ""),
      ...(detail == null ? {} : { detail }),
    };
    this.entries.push(entry);
    if (this.entries.length > this.capacity) {
      this.entries.splice(0, this.entries.length - this.capacity);
    }
    return entry;
  }

  info(message: unknown, detail?: unknown): EventEntry {
    return this.record("info", message, detail);
  }

  warn(message: unknown, detail?: unknown): EventEntry {
    return this.record("warn", message, detail);
  }

  error(message: unknown, detail?: unknown): EventEntry {
    return this.record("error", message, detail);
  }

  list({ limit = 100, offset = 0, before = null }: { limit?: number; offset?: number; before?: number | string | null } = {}): EventEntry[] {
    const beforeId = before === null || before === undefined || before === ""
      ? null
      : Number.isFinite(Number(before))
        ? Number(before)
        : null;
    const newestFirst = this.entries
      .slice()
      .reverse()
      .filter((entry) => beforeId === null || entry.id < beforeId);
    return newestFirst.slice(offset, offset + limit).map((entry) => ({ ...entry }));
  }

  hasBefore(id: number | string): boolean {
    const beforeId = Number(id);
    return Number.isFinite(beforeId) && this.entries.some((entry) => entry.id < beforeId);
  }

  size(): number {
    return this.entries.length;
  }
}
import type { EventEntry } from "../types.js";
