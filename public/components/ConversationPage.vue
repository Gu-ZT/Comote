<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { useI18n } from "vue-i18n";

import {
  advanceRefreshCursor,
  newTranscriptMessages,
  prependedTranscriptScrollTop,
  shouldFillTranscriptViewport,
  shouldLoadOlderTranscript,
  transcriptRefreshLimit,
  resolveRefreshTotal,
} from "../thread-view.js";

defineProps<{ active: boolean }>();

const { t } = useI18n();
const THREAD_PAGE_SIZE = 30;
const MESSAGE_PAGE_SIZE = 30;

interface Project { name: string; path: string; [key: string]: any }
interface Thread { id?: string; title?: string; name?: string; preview?: string; [key: string]: any }
interface Message { role?: string; text?: string; id?: string | number; [key: string]: any }
interface ProjectState {
  project: Project;
  expanded: boolean;
  items: Thread[];
  cursor: string | null;
  loaded: boolean;
  loading: boolean;
  paged: boolean;
  error: boolean;
}

const projects = ref<Project[]>([]);
const projectStates = reactive<Record<string, ProjectState>>({});
const selectedProjectPath = ref<string | null>(null);
const selectedThreadId = ref<string | null>(null);
const loadedThreadId = ref<string | null>(null);
const messages = ref<Message[]>([]);
const readerTitle = ref("");
const readerMeta = ref("");
const readerEmptyMessage = ref("");
const readerEmptyVisible = ref(true);
const historyMessage = ref("");
const messageOffset = ref(0);
const messageTotal = ref(0);
const messageHasMore = ref(false);
const messageLoading = ref(false);
const refreshing = ref(false);
const reader = ref<HTMLElement | null>(null);
let refreshTimer: number | null = null;
let generation = 0;

async function getJson<T>(path: string): Promise<T> {
  const token = localStorage.getItem("comoteApiToken");
  const response = await fetch(path, { headers: token ? { "x-comote-token": token } : undefined });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json() as Promise<T>;
}

async function safeGet<T>(path: string, fallback: T): Promise<{ ok: boolean; value: T }> {
  try {
    return { ok: true, value: await getJson<T>(path) };
  } catch (error) {
    console.error(path, error);
    return { ok: false, value: fallback };
  }
}

function threadId(thread: Thread): string { return String(thread?.id ?? ""); }
function threadTitle(thread: Thread): string { return String(thread?.title ?? thread?.name ?? thread?.preview ?? thread?.id ?? ""); }
function threadsUrl(path: string, cursor: string | null = null): string {
  const params = new URLSearchParams({ cwd: path, limit: String(THREAD_PAGE_SIZE) });
  if (cursor) params.set("cursor", cursor);
  return `/api/codex/threads?${params}`;
}
function transcriptUrl(id: string, offset = 0, limit = MESSAGE_PAGE_SIZE): string {
  return `/api/codex/transcript?${new URLSearchParams({ threadId: id, offset: String(offset), limit: String(limit) })}`;
}

function syncProjects(next: Project[]): void {
  projects.value = Array.isArray(next) ? next : [];
  const livePaths = new Set(projects.value.map((project) => project.path));
  for (const path of Object.keys(projectStates)) if (!livePaths.has(path)) delete projectStates[path];
  for (const project of projects.value) {
    const current = projectStates[project.path];
    if (current) current.project = project;
    else projectStates[project.path] = { project, expanded: false, items: [], cursor: null, loaded: false, loading: false, paged: false, error: false };
  }
  if (!selectedProjectPath.value || !livePaths.has(selectedProjectPath.value)) {
    selectedProjectPath.value = projects.value[0]?.path ?? null;
    selectedThreadId.value = null;
    loadedThreadId.value = null;
    messages.value = [];
  }
  if (selectedProjectPath.value && projectStates[selectedProjectPath.value]) projectStates[selectedProjectPath.value].expanded = true;
}

function setReaderMessage(message: string, meta = ""): void {
  readerEmptyMessage.value = message;
  readerEmptyVisible.value = true;
  readerTitle.value = message;
  readerMeta.value = meta;
  messages.value = [];
  historyMessage.value = "";
}

function updateReaderHead(project: Project | null, thread: Thread | null, source?: string): void {
  if (!thread) {
    readerTitle.value = t("web.conversation.selectThread");
    readerMeta.value = "";
    return;
  }
  readerTitle.value = threadTitle(thread);
  readerMeta.value = [project?.name, threadId(thread), source === "desktop" ? t("web.threads.sourceDesktop") : ""].filter(Boolean).join(" · ");
}

function updateHistory(message = ""): void {
  historyMessage.value = message || (!messageHasMore.value && messageOffset.value > 0 ? t("web.conversation.startReached") : "");
}

async function loadThreads(path: string, cursor: string | null = null, autoSelect = false): Promise<void> {
  const state = projectStates[path];
  if (!state || state.loading) return;
  state.loading = true;
  state.error = false;
  const result = await safeGet<any>(threadsUrl(path, cursor), null);
  state.loading = false;
  if (!result.ok || !result.value) {
    state.error = true;
    return;
  }
  const page = result.value.data ?? result.value.threads ?? [];
  if (cursor) {
    const known = new Set(state.items.map(threadId));
    state.items = [...state.items, ...page.filter((thread: Thread) => !known.has(threadId(thread)))];
    state.cursor = page.length ? result.value.nextCursor ?? null : null;
    state.paged = true;
  } else if (!state.loaded || !state.paged) {
    state.items = page;
    state.cursor = result.value.nextCursor ?? null;
  } else {
    const headIds = new Set(page.map(threadId));
    state.items = [...page, ...state.items.filter((thread) => !headIds.has(threadId(thread)))];
  }
  state.loaded = true;
  if (!autoSelect || selectedProjectPath.value !== path) return;
  const selected = state.items.find((thread) => threadId(thread) === selectedThreadId.value) ?? state.items[0] ?? null;
  if (!selected) {
    setReaderMessage(t("web.threads.empty", { name: state.project.name }));
    return;
  }
  const selectedId = threadId(selected);
  if (loadedThreadId.value === selectedId && selectedThreadId.value === selectedId) {
    updateReaderHead(state.project, selected);
    await refreshMessages();
  } else {
    await openThread(path, selected);
  }
}

async function openThread(path: string, thread: Thread): Promise<void> {
  const id = threadId(thread);
  if (!id) return;
  selectedProjectPath.value = path;
  selectedThreadId.value = id;
  loadedThreadId.value = null;
  messageOffset.value = 0;
  messageTotal.value = 0;
  messageHasMore.value = false;
  messageLoading.value = true;
  const currentGeneration = ++generation;
  readerEmptyVisible.value = false;
  messages.value = [];
  updateReaderHead(projectStates[path]?.project ?? null, thread);
  updateHistory(t("web.threads.loading"));
  const result = await safeGet<any>(transcriptUrl(id), null);
  if (currentGeneration !== generation || selectedThreadId.value !== id) return;
  messageLoading.value = false;
  if (!result.ok || !result.value) {
    updateHistory(t("web.conversation.loadError"));
    return;
  }
  const page = (result.value.messages ?? []).slice().reverse();
  messages.value = page;
  messageOffset.value = page.length;
  messageTotal.value = result.value.total ?? page.length;
  messageHasMore.value = Boolean(result.value.hasMore);
  loadedThreadId.value = id;
  updateReaderHead(projectStates[path]?.project ?? null, thread, result.value.source);
  updateHistory();
  await nextTick();
  if (reader.value && selectedThreadId.value === id) {
    reader.value.scrollTop = reader.value.scrollHeight;
    await fillViewportHistory(id, currentGeneration);
  }
}

async function refreshMessages(): Promise<void> {
  const id = selectedThreadId.value;
  if (!id || loadedThreadId.value !== id || messageLoading.value) return;
  const currentGeneration = generation;
  messageLoading.value = true;
  try {
    const probe = await safeGet<any>(transcriptUrl(id, 0, 20), null);
    if (!probe.ok || !probe.value || currentGeneration !== generation) return;
    let total = probe.value.total ?? messageTotal.value;
    let page = probe.value.messages ?? [];
    const wideLimit = transcriptRefreshLimit(messageTotal.value, total);
    if (wideLimit > 20) {
      const wide = await safeGet<any>(transcriptUrl(id, 0, wideLimit), null);
      if (wide.ok && wide.value) {
        total = wide.value.total ?? total;
        page = wide.value.messages ?? page;
      }
    }
    const newest = newTranscriptMessages(page, messageTotal.value, total);
    if (!newest.length) return;
    const nearBottom = reader.value ? reader.value.scrollHeight - reader.value.scrollTop - reader.value.clientHeight < 96 : true;
    if (!messages.value.length) messages.value = [];
    messages.value.push(...newest);
    const cursor = advanceRefreshCursor(messageOffset.value, messageTotal.value, newest.length);
    messageOffset.value = cursor.offset;
    messageTotal.value = resolveRefreshTotal(messageTotal.value, total, newest.length);
    await nextTick();
    if (nearBottom && reader.value) reader.value.scrollTop = reader.value.scrollHeight;
  } finally {
    if (currentGeneration === generation && selectedThreadId.value === id) messageLoading.value = false;
  }
}

async function loadOlder(): Promise<boolean> {
  const id = selectedThreadId.value;
  if (!id || !reader.value || !shouldLoadOlderTranscript(reader.value.scrollTop, messageHasMore.value, messageLoading.value)) return false;
  messageLoading.value = true;
  updateHistory(t("web.conversation.loadingOlder"));
  const currentGeneration = generation;
  const previousHeight = reader.value.scrollHeight;
  const previousTop = reader.value.scrollTop;
  const result = await safeGet<any>(transcriptUrl(id, messageOffset.value), null);
  if (currentGeneration !== generation || selectedThreadId.value !== id) return false;
  messageLoading.value = false;
  if (!result.ok || !result.value) {
    updateHistory(t("web.conversation.loadError"));
    return false;
  }
  const older = (result.value.messages ?? []).slice().reverse();
  if (older.length) {
    messages.value.unshift(...older);
    messageOffset.value += older.length;
    await nextTick();
    if (reader.value) reader.value.scrollTop = prependedTranscriptScrollTop(previousTop, previousHeight, reader.value.scrollHeight);
  }
  messageHasMore.value = Boolean(result.value.hasMore) && older.length > 0;
  if (result.value.total != null) messageTotal.value = result.value.total;
  updateHistory();
  return older.length > 0;
}

async function fillViewportHistory(id: string, currentGeneration: number): Promise<void> {
  while (reader.value && currentGeneration === generation && selectedThreadId.value === id && shouldFillTranscriptViewport(reader.value.scrollHeight, reader.value.clientHeight, messageHasMore.value, messageLoading.value)) {
    if (!await loadOlder()) return;
    await nextTick();
  }
}

function toggleProject(path: string): void {
  const state = projectStates[path];
  if (!state) return;
  state.expanded = !state.expanded;
  if (state.expanded && !state.loaded) void loadThreads(path);
}

function selectProject(path: string): void {
  selectedProjectPath.value = path;
  selectedThreadId.value = null;
  loadedThreadId.value = null;
  const state = projectStates[path];
  if (state) state.expanded = true;
  void loadThreads(path, null, true);
}

function onTreeThread(path: string, thread: Thread): void {
  selectedProjectPath.value = path;
  void openThread(path, thread);
}

async function refresh(): Promise<void> {
  if (refreshing.value) return;
  refreshing.value = true;
  const [status, projectResult] = await Promise.all([
    safeGet<any>("/api/status", null),
    safeGet<Project[]>("/api/projects", []),
  ]);
  syncProjects(projectResult.value ?? []);
  const connected = status.ok && status.value?.connectors?.desktop?.state === "connected";
  if (!connected) {
    setReaderMessage(t("web.threads.disconnected.title"), t("web.threads.disconnected.hint"));
    refreshing.value = false;
    return;
  }
  if (!selectedProjectPath.value) {
    setReaderMessage(t("web.conversation.noProjects"));
    refreshing.value = false;
    return;
  }
  await loadThreads(selectedProjectPath.value, null, true);
  refreshing.value = false;
}

function handleScroll(): void {
  void loadOlder();
}

onMounted(() => {
  void refresh();
  refreshTimer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 5000);
});

onBeforeUnmount(() => {
  if (refreshTimer !== null) window.clearInterval(refreshTimer);
});
</script>

<template>
  <section id="conversation" :class="['section-block', 'app-page', 'conversation-page', { active }]">
    <div class="conversation-browser">
      <aside class="conversation-tree-pane" :aria-label="t('web.conversation.treeTitle')">
        <div class="conversation-pane-title">{{ t("web.conversation.treeTitle") }}</div>
        <div id="conversationTree" class="conversation-tree" role="tree">
          <div v-if="projects.length === 0" class="conversation-tree-empty meta">{{ t("web.conversation.noProjects") }}</div>
          <div v-for="project in projects" :key="project.path" :class="['conversation-project-branch', { selected: project.path === selectedProjectPath }]">
            <button class="conversation-project-node" type="button" role="treeitem" :aria-expanded="projectStates[project.path]?.expanded ?? false" :data-project-path="project.path" @click="toggleProject(project.path)">
              <span class="conversation-tree-chevron" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></span>
              <span class="conversation-tree-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h6l2 2h10v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg></span>
              <span class="conversation-project-copy"><strong>{{ project.name }}</strong><span>{{ project.path }}</span></span>
            </button>
            <div v-if="projectStates[project.path]?.expanded" class="conversation-thread-branch" role="group">
              <div v-if="projectStates[project.path]?.loading && !projectStates[project.path]?.loaded" class="conversation-tree-status meta">{{ t("web.threads.loading") }}</div>
              <div v-else-if="projectStates[project.path]?.error && !projectStates[project.path]?.loaded" class="conversation-tree-status meta">{{ t("web.threads.loadError") }}</div>
              <div v-else-if="projectStates[project.path]?.loaded && !projectStates[project.path]?.items.length" class="conversation-tree-status meta">{{ t("web.threads.empty", { name: project.name }) }}</div>
              <template v-else>
                <button v-for="thread in projectStates[project.path]?.items" :key="threadId(thread)" :class="['conversation-thread-node', { active: threadId(thread) === selectedThreadId && project.path === selectedProjectPath }]" type="button" role="treeitem" :aria-selected="threadId(thread) === selectedThreadId && project.path === selectedProjectPath" :data-project-path="project.path" :data-thread-id="threadId(thread)" @click="onTreeThread(project.path, thread)">
                  <span class="conversation-tree-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></span>
                  <span class="conversation-thread-copy"><strong>{{ threadTitle(thread) }}</strong><span>{{ threadId(thread) }}</span></span>
                </button>
                <button v-if="projectStates[project.path]?.cursor" class="conversation-tree-more" type="button" :disabled="projectStates[project.path]?.loading" :data-project-load-more="project.path" @click="loadThreads(project.path, projectStates[project.path]?.cursor ?? null)">{{ projectStates[project.path]?.loading ? t("web.threads.loading") : t("web.threads.loadMore") }}</button>
              </template>
            </div>
          </div>
        </div>
      </aside>
      <section class="conversation-reader" aria-labelledby="conversationReaderTitle">
        <header class="conversation-reader-head">
          <div class="conversation-reader-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14z"/></svg></div>
          <div class="conversation-reader-copy"><h3 id="conversationReaderTitle">{{ readerTitle }}</h3><p id="conversationReaderMeta" class="meta">{{ readerMeta }}</p></div>
        </header>
        <div v-if="readerEmptyVisible" id="conversationEmpty" class="conversation-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14z"/><path d="M8 8h8M8 12h5"/></svg><p>{{ readerEmptyMessage || t("web.conversation.selectThread") }}</p></div>
        <div id="conversationMessages" class="conversation-messages" v-else ref="reader" tabindex="0" @scroll.passive="handleScroll">
          <div id="conversationHistoryState" class="conversation-history-state" :class="{ visible: historyMessage }" aria-live="polite">{{ historyMessage }}</div>
          <div id="conversationMessageList" class="conversation-message-list">
            <div v-if="!messages.length && !messageLoading" class="conversation-no-messages meta">{{ t("web.threads.noLocal") }}</div>
            <article v-for="(message, index) in messages" :key="String(message.id ?? `${index}:${message.text}`)" :class="['conversation-message', `conversation-message-${message.role === 'user' ? 'user' : 'assistant'}`]">
              <span class="conversation-avatar" aria-hidden="true"><svg v-if="message.role === 'user'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.5-6 8-6s8 2 8 6"/></svg><svg v-else viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z"/></svg></span>
              <div class="conversation-message-copy"><span class="conversation-message-role">{{ message.role === "user" ? t("web.conversation.user") : "Codex" }}</span><div class="conversation-bubble">{{ message.text }}</div></div>
            </article>
          </div>
        </div>
      </section>
    </div>
  </section>
</template>
