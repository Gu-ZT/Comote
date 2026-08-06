<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { useI18n } from "vue-i18n";

import {
  bindingAffordance,
  channelBadge,
  channelBoundButton,
  channelFormSpec,
  channelLastError,
  channelRows,
  channelSetup,
  channelSummaryLine,
  isBound,
  isConnected,
  normalizedLoginView,
  partitionChannels,
  restingLoginView,
} from "../channel-view.js";
import { qrDataUrl } from "../qr-code.js";
import ChannelDetail from "./ChannelDetail.vue";

const { t } = useI18n();

interface Channel {
  id: string;
  displayName?: string;
  binding?: string;
  credentialBinding?: boolean;
  config?: Record<string, unknown>;
  [key: string]: any;
}

interface LoginView {
  phase: string;
  qrUrl?: string | null;
  accountLine?: string | null;
  message?: string | null;
}

const channels = ref<Channel[]>([]);
const expandedChannelId = ref<string | null>(null);
const accordionUserDecided = ref(false);
const refreshing = ref(false);
const savingId = ref<string | null>(null);
const savedId = ref<string | null>(null);
const error = ref(false);
const formValues = reactive<Record<string, Record<string, string | boolean>>>({});
const loginViews = reactive<Record<string, LoginView>>({});
const loginIds = reactive<Record<string, string | null>>({});
const pollTimers = new Map<string, number>();
let refreshTimer: number | null = null;

async function getJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("comoteApiToken");
  const headers = { ...(options.headers ?? {}), ...(token ? { "x-comote-token": token } : {}) };
  const response = await fetch(path, { ...options, headers });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return (response.status === 204 ? null : await response.json()) as T;
}

function ensureForm(channel: Channel): void {
  if (formValues[channel.id]) return;
  formValues[channel.id] = Object.fromEntries(
    channelFormSpec(channel, t).map((field) => [field.name, field.type === "checkbox" ? Boolean(field.value) : String(field.value ?? "")]),
  );
}

async function refresh(): Promise<void> {
  refreshing.value = true;
  try {
    channels.value = (await getJson<Channel[]>("/api/channels")) ?? [];
    for (const channel of channels.value) ensureForm(channel);
    const { connected } = partitionChannels(channels.value);
    if (expandedChannelId.value === null && !accordionUserDecided.value) {
      const pending = connected.find((channel) => isConnected(channel) && !isBound(channel));
      if (pending) expandedChannelId.value = pending.id;
    }
    error.value = false;
  } catch (cause) {
    error.value = true;
    console.error("channels load failed", cause);
  } finally {
    refreshing.value = false;
  }
}

function toggle(channelId: string): void {
  accordionUserDecided.value = true;
  expandedChannelId.value = expandedChannelId.value === channelId ? null : channelId;
}

function channelIcon(channel: Channel): string {
  return window.ComoteChannelIcons?.[channel.id] ?? "";
}

function badgeClass(channel: Channel): string {
  const badge = channelBadge(channel, t);
  const pending = isConnected(channel) && !isBound(channel);
  const tone = badge.tone === "error" ? "error" : pending ? "pending" : badge.tone ?? "";
  return `badge${tone ? ` ${tone}` : ""}`;
}

function detailId(channel: Channel): string {
  return `channel-detail-${channel.id}`;
}

function loginView(channel: Channel): LoginView {
  return loginViews[channel.id] ?? restingLoginView(channel, t);
}

function qrImageSource(value?: string | null): string | null {
  const text = value?.trim();
  if (!text) return null;
  if (/^(data:image\/|blob:)/i.test(text)) return text;
  if (/^https?:\/\//i.test(text) && /\.(png|jpe?g|gif|webp|svg)(?:[?#]|$)/i.test(text)) return text;
  if (/^[A-Za-z0-9+/=\s]+$/.test(text) && text.length > 80) return `data:image/png;base64,${text.replace(/\s/g, "")}`;
  return qrDataUrl(text);
}

function clearLogin(channelId: string): void {
  const timer = pollTimers.get(channelId);
  if (timer !== undefined) window.clearInterval(timer);
  pollTimers.delete(channelId);
  delete loginIds[channelId];
}

async function pollLogin(channel: Channel, start: Record<string, any>): Promise<void> {
  const previousTimer = pollTimers.get(channel.id);
  if (previousTimer !== undefined) window.clearInterval(previousTimer);
  pollTimers.delete(channel.id);
  const params = new URLSearchParams({ loginId: start.loginId ?? "" });
  for (const key of ["domain", "interval", "expireIn"]) {
    if (start[key] != null) params.set(key, String(start[key]));
  }
  const timer = window.setInterval(async () => {
    try {
      const status = await getJson<Record<string, any>>(`/api/channels/${encodeURIComponent(channel.id)}/login/status?${params}`);
      const view = normalizedLoginView(status, t) as LoginView;
      if (!view.qrUrl) view.qrUrl = start.qrUrl ?? null;
      loginViews[channel.id] = view;
      if (["confirmed", "expired", "failed"].includes(view.phase)) {
        window.clearInterval(timer);
        pollTimers.delete(channel.id);
        delete loginIds[channel.id];
        if (view.phase === "confirmed") await refresh();
      }
    } catch (cause) {
      loginViews[channel.id] = {
        phase: "pending",
        qrUrl: start.qrUrl ?? null,
        accountLine: null,
        message: t("web.channel.qr.checkFailed", { message: cause instanceof Error ? cause.message : String(cause) }),
      };
    }
  }, 2500);
  pollTimers.set(channel.id, timer);
}

async function startLogin(channel: Channel): Promise<void> {
  clearLogin(channel.id);
  try {
    const start = await getJson<Record<string, any>>(`/api/channels/${encodeURIComponent(channel.id)}/login/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(formValues[channel.id] ?? {}),
    });
    loginIds[channel.id] = start.loginId ?? null;
    loginViews[channel.id] = normalizedLoginView(start, t) as LoginView;
    await pollLogin(channel, start);
  } catch (cause) {
    loginViews[channel.id] = { phase: "failed", qrUrl: null, accountLine: null, message: cause instanceof Error ? cause.message : String(cause) };
  }
}

async function saveConfig(channel: Channel): Promise<void> {
  if (savingId.value) return;
  savingId.value = channel.id;
  savedId.value = null;
  try {
    const values = { ...(formValues[channel.id] ?? {}) };
    if (channel.credentialBinding) values.enabled = true;
    const config = await getJson<Record<string, any>>(`/api/channels/${encodeURIComponent(channel.id)}/config`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(values),
    });
    if (channel.credentialBinding && config?.configured) {
      await getJson(`/api/channels/${encodeURIComponent(channel.id)}/runtime/start`, { method: "POST" });
    }
    savedId.value = channel.id;
    await refresh();
    window.setTimeout(() => {
      if (savedId.value === channel.id) savedId.value = null;
    }, 2000);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    window.alert(t("web.action.failed", { message }));
  } finally {
    savingId.value = null;
  }
}

function setupLink(channel: Channel): any {
  const setup = channelSetup(channel, t);
  return setup;
}

function statusRows(channel: Channel): any[] {
  return channelRows(channel, t);
}

function actionLabel(channel: Channel): string {
  return channelBoundButton(channel, t, { activeLoginId: loginIds[channel.id] ?? null }).label;
}

function hasQrArea(channel: Channel): boolean {
  return channel.binding === "qr";
}

onMounted(() => {
  void refresh();
  refreshTimer = window.setInterval(() => {
    if (!document.hidden) void refresh();
  }, 5000);
});

onBeforeUnmount(() => {
  if (refreshTimer !== null) window.clearInterval(refreshTimer);
  for (const channelId of pollTimers.keys()) clearLogin(channelId);
});

const connectedChannels = computed(() => partitionChannels(channels.value).connected);
const availableChannels = computed(() => partitionChannels(channels.value).available);
</script>

<template>
  <div>
    <p v-if="error" class="list-error"><strong>{{ t("web.connectors.error.channels") }}</strong><span class="meta">{{ t("web.sectionError.retryHint") }}</span></p>
    <template v-else>
      <section v-if="connectedChannels.length" class="channel-section">
        <div class="channel-section-title">{{ t("web.channel.section.connected") }}</div>
        <article v-for="channel in connectedChannels" :key="channel.id" :class="['channel-row', { expanded: expandedChannelId === channel.id, 'channel-card-hybrid': channel.credentialBinding } ]" :data-channel="channel.id">
          <div class="channel-row-head">
            <div :class="['channel-tile', `${channel.id}-icon` ]" aria-hidden="true" v-html="channelIcon(channel)"></div>
            <div class="channel-copy"><div class="ch-name">{{ channel.displayName ?? channel.id }}</div><div v-if="channelSummaryLine(channel, t)" class="ch-summary" :title="channelSummaryLine(channel, t)">{{ channelSummaryLine(channel, t) }}</div></div>
            <span :class="badgeClass(channel)">{{ channelBadge(channel, t).text }}</span>
            <button type="button" class="channel-disclosure" :aria-expanded="expandedChannelId === channel.id" :aria-controls="detailId(channel)" :aria-label="expandedChannelId === channel.id ? t('web.channel.collapse') : t('web.channel.manage')" @click="toggle(channel.id)">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
            </button>
          </div>
          <div v-if="expandedChannelId === channel.id" :id="detailId(channel)" class="channel-row-body">
            <ChannelDetail :channel="channel" :form-values="formValues" :login-view="loginView(channel)" :saving="savingId === channel.id" :saved="savedId === channel.id" :qr-image-source="qrImageSource(loginView(channel).qrUrl)" :action-label="actionLabel(channel)" :has-qr-area="hasQrArea(channel)" :status-rows="statusRows(channel)" :setup="setupLink(channel)" @save="saveConfig(channel)" @login="startLogin(channel)" />
          </div>
        </article>
      </section>

      <section v-if="availableChannels.length" class="channel-section">
        <div class="channel-section-title">{{ t("web.channel.section.available") }}</div>
        <div class="channel-add-grid">
          <article v-for="channel in availableChannels" :key="channel.id" :class="['channel-add-tile', { expanded: expandedChannelId === channel.id, 'channel-card-hybrid': channel.credentialBinding } ]" :data-channel="channel.id">
            <template v-if="expandedChannelId !== channel.id">
              <div :class="['channel-tile', `${channel.id}-icon` ]" aria-hidden="true" v-html="channelIcon(channel)"></div>
              <div class="channel-copy"><div class="ch-name">{{ channel.displayName ?? channel.id }}</div><div class="ch-summary">{{ t("web.channel.state.notConfigured") }}</div></div>
              <button type="button" class="secondary-button channel-add-button" @click="toggle(channel.id)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg><span>{{ t("web.channel.add") }}</span></button>
            </template>
            <template v-else>
              <div class="channel-row-head channel-add-head">
                <div :class="['channel-tile', `${channel.id}-icon` ]" aria-hidden="true" v-html="channelIcon(channel)"></div>
                <div class="channel-copy"><div class="ch-name">{{ channel.displayName ?? channel.id }}</div><div class="ch-summary">{{ t("web.channel.state.notConfigured") }}</div></div>
                <button type="button" class="channel-disclosure" :aria-expanded="true" :aria-label="t('web.channel.collapse')" @click="toggle(channel.id)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>
              </div>
              <ChannelDetail :channel="channel" :form-values="formValues" :login-view="loginView(channel)" :saving="savingId === channel.id" :saved="savedId === channel.id" :qr-image-source="qrImageSource(loginView(channel).qrUrl)" :action-label="actionLabel(channel)" :has-qr-area="hasQrArea(channel)" :status-rows="statusRows(channel)" :setup="setupLink(channel)" @save="saveConfig(channel)" @login="startLogin(channel)" />
            </template>
          </article>
        </div>
      </section>
    </template>
  </div>
</template>
