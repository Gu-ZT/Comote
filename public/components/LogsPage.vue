<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

import { getWebLocale } from "../i18n.js";

const props = defineProps<{ active: boolean }>();

const { t } = useI18n();

interface LogEntry {
  id?: string | number;
  at?: string;
  level?: string;
  message?: string;
  detail?: unknown;
}

const entries = ref<LogEntry[]>([]);
const hasMore = ref(false);
const loading = ref(false);
const error = ref(false);
const initialized = ref(false);
let refreshTimer: number | null = null;

function formatTime(value?: string): string {
  const date = new Date(value ?? "");
  if (Number.isNaN(date.getTime())) return value ?? "";
  return date.toLocaleTimeString(getWebLocale(), { hour12: false });
}

function formatDetail(detail: unknown): string {
  if (detail == null) return "";
  if (typeof detail !== "object") return String(detail);
  if (Array.isArray(detail)) return JSON.stringify(detail, null, 2);
  return Object.entries(detail as Record<string, unknown>)
    .map(([key, value]) => `${key}: ${value !== null && typeof value === "object" ? JSON.stringify(value, null, 2) : String(value)}`)
    .join("\n");
}

function mergeEntries(next: LogEntry[]): LogEntry[] {
  const byId = new Map<string, LogEntry>();
  for (const entry of [...next, ...entries.value]) {
    const key = String(entry?.id ?? `${entry.at}:${entry.message}`);
    if (!byId.has(key)) byId.set(key, entry);
  }
  return [...byId.values()].sort((left, right) => Number(right.id ?? 0) - Number(left.id ?? 0));
}

async function fetchPage(older = false): Promise<void> {
  if (loading.value || (older && !hasMore.value)) return;
  loading.value = true;
  const oldest = entries.value.at(-1)?.id;
  const before = older && oldest != null ? `&before=${encodeURIComponent(String(oldest))}` : "";
  try {
    const token = localStorage.getItem("comoteApiToken");
    const response = await fetch(`/api/logs?limit=20${before}`, {
      headers: token ? { "x-comote-token": token } : undefined,
    });
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    const data = await response.json();
    entries.value = older ? mergeEntries(data.entries ?? []) : mergeEntries(data.entries ?? []);
    hasMore.value = Boolean(data.hasMore) && (data.entries?.length ?? 0) > 0;
    error.value = false;
    initialized.value = true;
  } catch {
    error.value = true;
  } finally {
    loading.value = false;
  }
}

function nearBottom(): boolean {
  return window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 160;
}

function maybeLoadMore(): void {
  if (props.active && nearBottom()) void fetchPage(true);
}

onMounted(() => {
  void fetchPage();
  refreshTimer = window.setInterval(() => {
    if (!document.hidden) void fetchPage();
  }, 5000);
  window.addEventListener("scroll", maybeLoadMore, { passive: true });
});

watch(() => props.active, (active) => {
  if (active) queueMicrotask(maybeLoadMore);
});

onBeforeUnmount(() => {
  if (refreshTimer !== null) window.clearInterval(refreshTimer);
  window.removeEventListener("scroll", maybeLoadMore);
});
</script>

<template>
  <section id="logs" :class="['section-block', 'app-page', { active }]">
    <div class="section-heading inline-heading">
      <div>
        <h2>{{ t("web.logs.title") }}</h2>
        <p>{{ t("web.logs.subtitle") }}</p>
      </div>
      <button id="refreshLogs" class="secondary-button refresh-button" type="button" :aria-label="t('web.button.refresh')" :title="t('web.button.refresh')" :disabled="loading" @click="fetchPage()">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8.1 8.1 0 0 0-15.5-2M4 4v5h5"/><path d="M4 13a8.1 8.1 0 0 0 15.5 2M20 20v-5h-5"/></svg>
        <span class="visually-hidden">{{ t("web.button.refresh") }}</span>
      </button>
    </div>
    <ul id="logList" class="list log-list">
      <li v-if="error && !initialized" class="list-error"><strong>{{ t("web.connectors.error.logs") }}</strong><div class="meta">{{ t("web.sectionError.retryHint") }}</div></li>
      <li v-else-if="entries.length === 0 && !loading"><strong>{{ t("web.logs.empty.title") }}</strong><div class="meta">{{ t("web.logs.empty.hint") }}</div></li>
      <li v-for="entry in entries" :key="String(entry.id ?? `${entry.at}:${entry.message}`)" :class="['log-row', `log-${entry.level ?? 'info'}`]">
        <span class="log-time">{{ formatTime(entry.at) }}</span>
        <span><strong>{{ entry.message }}</strong><div v-if="formatDetail(entry.detail)" class="meta log-detail">{{ formatDetail(entry.detail) }}</div></span>
      </li>
      <li v-if="loading" class="logs-loading meta" aria-live="polite">{{ t("web.logs.loading") }}</li>
    </ul>
  </section>
</template>
