<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";

defineProps<{ active: boolean }>();

const { t } = useI18n();
type Connector = "desktop" | "cli";

const preferredConnector = ref<Connector>("desktop");
const connectorSaving = ref(false);
const connectorStatus = ref("web.advanced.connectorEffective");
const capacityRetryEnabled = ref(false);
const capacityRetryLimit = ref(10);
const capacityRetrySaving = ref(false);
const capacityRetryStatus = ref("web.advanced.capacityRetryEffective");
let committedCapacity = { enabled: false, limit: 10 };
const keepAliveVisible = ref(false);
const keepDaemonAlive = ref(false);
const keepAliveSaving = ref(false);

async function getJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("comoteApiToken");
  const headers = { ...(options.headers ?? {}), ...(token ? { "x-comote-token": token } : {}) };
  const response = await fetch(path, { ...options, headers });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return (response.status === 204 ? null : await response.json()) as T;
}

function normalizeLimit(value: unknown): number | null {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 100 ? number : null;
}

async function loadSettings(): Promise<void> {
  try {
    const settings = await getJson<{ preferredConnector?: string; capacityRetryEnabled?: boolean; capacityRetryLimit?: number }>("/api/settings");
    preferredConnector.value = settings.preferredConnector === "cli" ? "cli" : "desktop";
    capacityRetryEnabled.value = Boolean(settings.capacityRetryEnabled);
    capacityRetryLimit.value = normalizeLimit(settings.capacityRetryLimit) ?? 10;
    committedCapacity = { enabled: capacityRetryEnabled.value, limit: capacityRetryLimit.value };
  } catch (error) {
    console.error("settings load failed", error);
  }
}

async function saveConnector(next: Connector): Promise<void> {
  if (connectorSaving.value || next === preferredConnector.value) return;
  const previous = preferredConnector.value;
  preferredConnector.value = next;
  connectorSaving.value = true;
  connectorStatus.value = "web.advanced.connectorSaving";
  try {
    const saved = await getJson<{ preferredConnector?: string }>("/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ preferredConnector: next }),
    });
    preferredConnector.value = saved.preferredConnector === "cli" ? "cli" : next;
    connectorStatus.value = "web.advanced.connectorSaved";
  } catch (error) {
    preferredConnector.value = previous;
    connectorStatus.value = "web.advanced.connectorSaveFailed";
    console.error("preferred connector save failed", error);
  } finally {
    connectorSaving.value = false;
  }
}

async function saveCapacity(nextEnabled: boolean, nextLimit: number): Promise<void> {
  const limit = normalizeLimit(nextLimit);
  if (limit === null) {
    capacityRetryEnabled.value = committedCapacity.enabled;
    capacityRetryLimit.value = committedCapacity.limit;
    capacityRetryStatus.value = "web.advanced.capacityRetryInvalid";
    return;
  }
  const previous = { ...committedCapacity };
  capacityRetryEnabled.value = nextEnabled;
  capacityRetryLimit.value = limit;
  capacityRetrySaving.value = true;
  capacityRetryStatus.value = "web.advanced.capacityRetrySaving";
  try {
    const saved = await getJson<{ capacityRetryEnabled?: boolean; capacityRetryLimit?: number }>("/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ capacityRetryEnabled: nextEnabled, capacityRetryLimit: limit }),
    });
    capacityRetryEnabled.value = Boolean(saved.capacityRetryEnabled);
    capacityRetryLimit.value = normalizeLimit(saved.capacityRetryLimit) ?? limit;
    committedCapacity = { enabled: capacityRetryEnabled.value, limit: capacityRetryLimit.value };
    capacityRetryStatus.value = "web.advanced.capacityRetrySaved";
  } catch (error) {
    capacityRetryEnabled.value = previous.enabled;
    capacityRetryLimit.value = previous.limit;
    capacityRetryStatus.value = "web.advanced.capacityRetrySaveFailed";
    console.error("capacity retry settings save failed", error);
  } finally {
    capacityRetrySaving.value = false;
  }
}

async function toggleKeepAlive(): Promise<void> {
  if (keepAliveSaving.value) return;
  const desired = keepDaemonAlive.value;
  keepAliveSaving.value = true;
  try {
    const invoke = window.__TAURI__?.core?.invoke;
    if (typeof invoke !== "function") return;
    await invoke("set_keep_daemon_alive", { enabled: desired });
  } catch (error) {
    keepDaemonAlive.value = !desired;
    console.error("keep daemon alive save failed", error);
  } finally {
    keepAliveSaving.value = false;
  }
}

const capacityLimitDisabled = computed(() => capacityRetrySaving.value || !capacityRetryEnabled.value);

onMounted(async () => {
  const invoke = window.__TAURI__?.core?.invoke;
  if (typeof invoke === "function") {
    keepAliveVisible.value = true;
    try {
      keepDaemonAlive.value = Boolean(await invoke("get_keep_daemon_alive"));
    } catch (error) {
      console.error("get_keep_daemon_alive failed", error);
    }
  }
  await loadSettings();
  document.querySelector("#preferredConnectorStatus")?.removeAttribute("data-i18n");
  document.querySelector("#capacityRetryStatus")?.removeAttribute("data-i18n");
});
</script>

<template>
  <section id="settings" :class="['section-block', 'app-page', 'settings-page', { active }]">
    <div class="section-heading">
      <h2>{{ t("web.settings.pageTitle") }}</h2>
    </div>
    <section class="settings-grid">
      <article class="panel connector-preference-panel">
        <h3>{{ t("web.advanced.connectorTitle") }}</h3>
        <p class="setting-note">{{ t("web.advanced.connectorHint") }}</p>
        <fieldset id="preferredConnector" class="segmented-selector">
          <legend class="visually-hidden">{{ t("web.advanced.connectorLabel") }}</legend>
          <label class="segment-option">
            <input type="radio" name="preferredConnector" value="desktop" :checked="preferredConnector === 'desktop'" :disabled="connectorSaving" @change="saveConnector('desktop')">
            <span>
              <strong>Codex Desktop</strong>
              <small>{{ t("web.advanced.connectorDesktopHint") }}</small>
            </span>
          </label>
          <label class="segment-option">
            <input type="radio" name="preferredConnector" value="cli" :checked="preferredConnector === 'cli'" :disabled="connectorSaving" @change="saveConnector('cli')">
            <span>
              <strong>Codex CLI</strong>
              <small>{{ t("web.advanced.connectorCliHint") }}</small>
            </span>
          </label>
        </fieldset>
        <p id="preferredConnectorStatus" class="setting-save-status" aria-live="polite" data-i18n="web.advanced.connectorEffective">将在下一次新建或打开会话时生效。</p>
      </article>

      <article class="panel capacity-retry-panel">
        <h3>{{ t("web.advanced.capacityRetryTitle") }}</h3>
        <p class="setting-note">{{ t("web.advanced.capacityRetryHint") }}</p>
        <label class="setting-toggle" for="capacityRetryEnabled">
          <span class="setting-copy">
            <strong>{{ t("web.advanced.capacityRetryLabel") }}</strong>
            <span class="setting-note">{{ t("web.advanced.capacityRetryDetail") }}</span>
          </span>
          <span class="switch-control">
            <input id="capacityRetryEnabled" type="checkbox" role="switch" v-model="capacityRetryEnabled" :aria-label="t('web.advanced.capacityRetryLabel')" :disabled="capacityRetrySaving" @change="saveCapacity(capacityRetryEnabled, capacityRetryLimit)">
            <span class="switch-track" aria-hidden="true"></span>
          </span>
        </label>
        <label class="capacity-retry-limit-field" for="capacityRetryLimit">
          <span class="domain-label">{{ t("web.advanced.capacityRetryLimit") }}</span>
          <span class="setting-input-control">
            <input id="capacityRetryLimit" type="number" min="1" max="100" step="1" inputmode="numeric" v-model.number="capacityRetryLimit" :aria-label="t('web.advanced.capacityRetryLimit')" :disabled="capacityLimitDisabled" @change="saveCapacity(capacityRetryEnabled, capacityRetryLimit)">
            <span class="setting-unit">{{ t("web.advanced.capacityRetryUnit") }}</span>
          </span>
        </label>
        <p id="capacityRetryStatus" class="setting-save-status" aria-live="polite" data-i18n="web.advanced.capacityRetryEffective">达到上限后停止当前任务。</p>
      </article>

      <article class="panel">
        <h3>{{ t("web.advanced.diagnostics") }}</h3>
        <dl id="connections" class="kv"></dl>
        <div class="actions">
          <button id="connectDesktop" v-once class="secondary-button" type="button" data-i18n="web.advanced.retryDesktop">重试连接 Codex Desktop</button>
        </div>
      </article>

      <article id="keepAlivePanel" class="panel" :hidden="!keepAliveVisible">
        <h3>{{ t("web.advanced.keepAliveTitle") }}</h3>
        <label class="setting-toggle" for="keepDaemonAlive">
          <span class="setting-copy">
            <strong>{{ t("web.advanced.keepAliveLabel") }}</strong>
            <span id="keepDaemonAliveStatus" class="setting-note">{{ t("web.advanced.keepAliveHint") }}</span>
          </span>
          <span class="switch-control">
            <input id="keepDaemonAlive" v-model="keepDaemonAlive" type="checkbox" role="switch" :aria-label="t('web.advanced.keepAliveLabel')" :disabled="keepAliveSaving" @change="toggleKeepAlive">
            <span class="switch-track" aria-hidden="true"></span>
          </span>
        </label>
      </article>

      <article class="panel">
        <h3>{{ t("web.advanced.addUser") }}</h3>
        <form id="identityForm" class="inline-form">
          <select name="channel" :aria-label="t('web.advanced.channelLabel')"></select>
          <input name="stableId" :placeholder="t('web.advanced.userIdPlaceholder')" required>
          <input name="displayName" :placeholder="t('web.advanced.displayNamePlaceholder')" required>
          <button type="submit">{{ t("web.button.confirm") }}</button>
        </form>
      </article>
    </section>
  </section>
</template>
