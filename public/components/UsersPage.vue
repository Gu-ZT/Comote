<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";

defineProps<{ active: boolean }>();

const { t } = useI18n();

interface Identity {
  channel: string;
  stableId: string;
  displayName: string;
  role?: string;
}

interface ChannelMeta {
  id: string;
  displayName?: string;
}

const identities = ref<Identity[]>([]);
const candidates = ref<Identity[]>([]);
const channelNames = ref<Record<string, string>>({});
const identitiesError = ref(false);
const candidatesError = ref(false);
const refreshing = ref(false);
let refreshTimer: number | null = null;

async function getJson<T>(path: string): Promise<T> {
  const token = localStorage.getItem("comoteApiToken");
  const response = await fetch(path, { headers: token ? { "x-comote-token": token } : undefined });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}

async function refresh(): Promise<void> {
  refreshing.value = true;
  const [identityResult, candidateResult, channelResult] = await Promise.allSettled([
    getJson<Identity[]>("/api/identities"),
    getJson<Identity[]>("/api/identities/candidates"),
    getJson<ChannelMeta[]>("/api/channels"),
  ]);
  if (identityResult.status === "fulfilled") {
    identities.value = identityResult.value ?? [];
    identitiesError.value = false;
  } else {
    identitiesError.value = true;
  }
  if (candidateResult.status === "fulfilled") {
    candidates.value = candidateResult.value ?? [];
    candidatesError.value = false;
  } else {
    candidatesError.value = true;
  }
  if (channelResult.status === "fulfilled") {
    channelNames.value = Object.fromEntries((channelResult.value ?? []).map((channel) => [channel.id, channel.displayName ?? channel.id]));
  }
  refreshing.value = false;
}

function channelName(channel: string): string {
  const known = channelNames.value[channel];
  if (known && known !== channel) return known;
  const translated = t(`web.channelName.${channel}`);
  return translated.startsWith("web.") ? channel : translated;
}

function roleName(role?: string): string {
  if (!role) return "";
  const translated = t(`web.role.${role}`);
  return translated.startsWith("web.") ? role : translated;
}

async function action(path: string, method: string, body?: unknown): Promise<void> {
  try {
    const token = localStorage.getItem("comoteApiToken");
    const response = await fetch(path, {
      method,
      headers: {
        ...(body ? { "content-type": "application/json" } : {}),
        ...(token ? { "x-comote-token": token } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      if (response.status === 401) {
        window.alert(t("web.action.unauthorized"));
        return;
      }
      throw new Error(`Request failed: ${response.status}`);
    }
    await refresh();
    window.dispatchEvent(new CustomEvent("comote:identities-change", { detail: { source: "users" } }));
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    window.alert(t("web.action.failed", { message }));
  }
}

function confirmCandidate(candidate: Identity): Promise<void> {
  return action("/api/identities/confirm", "POST", {
    channel: candidate.channel,
    stableId: candidate.stableId,
    displayName: candidate.displayName,
  });
}

function removeIdentity(identity: Identity): Promise<void> {
  return action(`/api/identities/${encodeURIComponent(identity.channel)}/${encodeURIComponent(identity.stableId)}`, "DELETE");
}

function refreshFromEvent(event: Event): void {
  if ((event as CustomEvent<{ source?: string }>).detail?.source === "users") return;
  void refresh();
}

onMounted(() => {
  void refresh();
  refreshTimer = window.setInterval(() => void refresh(), 5000);
  window.addEventListener("comote:identities-change", refreshFromEvent);
});

onBeforeUnmount(() => {
  if (refreshTimer !== null) window.clearInterval(refreshTimer);
  window.removeEventListener("comote:identities-change", refreshFromEvent);
});
</script>

<template>
  <section id="users" :class="['section-block', 'app-page', { active }]">
    <div class="section-heading inline-heading">
      <div>
        <h2>{{ t("web.users.title") }}</h2>
        <p>{{ t("web.users.subtitle") }}</p>
      </div>
      <button id="refreshUsers" class="secondary-button refresh-button" type="button" :aria-label="t('web.button.refresh')" :title="t('web.button.refresh')" :disabled="refreshing" @click="refresh">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8.1 8.1 0 0 0-15.5-2M4 4v5h5"/><path d="M4 13a8.1 8.1 0 0 0 15.5 2M20 20v-5h-5"/></svg>
        <span class="visually-hidden">{{ t("web.button.refresh") }}</span>
      </button>
    </div>

    <div class="user-grid">
      <article class="panel list-panel">
        <h3>{{ t("web.users.authorized") }}</h3>
        <ul id="identities" class="list">
          <li v-if="identitiesError" class="list-error"><strong>{{ t("web.connectors.error.identities") }}</strong><div class="meta">{{ t("web.sectionError.retryHint") }}</div></li>
          <li v-else-if="identities.length === 0" class="empty-list-item"><strong>{{ t("web.identities.empty.title") }}</strong><div class="meta">{{ t("web.identities.empty.hint") }}</div></li>
          <li v-for="identity in identities" :key="`${identity.channel}|${identity.stableId}`" class="list-row">
            <div class="list-row-copy"><strong>{{ identity.displayName }}</strong><div class="meta identity-meta"><span>{{ channelName(identity.channel) }}</span><span class="identity-id" :title="identity.stableId">{{ identity.stableId }}</span><span>{{ roleName(identity.role) }}</span></div></div>
            <button class="secondary-button row-action" @click="removeIdentity(identity)">{{ t("web.identities.remove") }}</button>
          </li>
        </ul>
      </article>
      <article class="panel list-panel">
        <h3>{{ t("web.users.pending") }}</h3>
        <ul id="identityCandidates" class="list compact-list">
          <li v-if="candidatesError" class="list-error"><strong>{{ t("web.connectors.error.candidates") }}</strong><div class="meta">{{ t("web.sectionError.retryHint") }}</div></li>
          <li v-else-if="candidates.length === 0" class="empty-list-item"><strong>{{ t("web.candidates.empty.title") }}</strong><div class="meta">{{ t("web.candidates.empty.hint") }}</div></li>
          <li v-for="candidate in candidates" :key="`${candidate.channel}|${candidate.stableId}`" class="list-row">
            <div class="list-row-copy"><strong>{{ candidate.displayName }}</strong><div class="meta identity-meta"><span>{{ channelName(candidate.channel) }}</span><span class="identity-id" :title="candidate.stableId">{{ candidate.stableId }}</span></div></div>
            <button class="row-action" @click="confirmCandidate(candidate)">{{ t("web.candidates.confirm") }}</button>
          </li>
        </ul>
      </article>
    </div>
  </section>
</template>
