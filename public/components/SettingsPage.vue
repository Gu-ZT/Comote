<script setup lang="ts">
import { useI18n } from "vue-i18n";

defineProps<{ active: boolean }>();

const { t } = useI18n();
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
            <input type="radio" name="preferredConnector" value="desktop">
            <span>
              <strong>Codex Desktop</strong>
              <small>{{ t("web.advanced.connectorDesktopHint") }}</small>
            </span>
          </label>
          <label class="segment-option">
            <input type="radio" name="preferredConnector" value="cli">
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
            <input id="capacityRetryEnabled" type="checkbox" role="switch" :aria-label="t('web.advanced.capacityRetryLabel')">
            <span class="switch-track" aria-hidden="true"></span>
          </span>
        </label>
        <label class="capacity-retry-limit-field" for="capacityRetryLimit">
          <span class="domain-label">{{ t("web.advanced.capacityRetryLimit") }}</span>
          <span class="setting-input-control">
            <input id="capacityRetryLimit" type="number" min="1" max="100" step="1" inputmode="numeric" value="10" :aria-label="t('web.advanced.capacityRetryLimit')">
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

      <article id="keepAlivePanel" class="panel" hidden>
        <h3>{{ t("web.advanced.keepAliveTitle") }}</h3>
        <label class="setting-toggle" for="keepDaemonAlive">
          <span class="setting-copy">
            <strong>{{ t("web.advanced.keepAliveLabel") }}</strong>
            <span id="keepDaemonAliveStatus" class="setting-note">{{ t("web.advanced.keepAliveHint") }}</span>
          </span>
          <span class="switch-control">
            <input id="keepDaemonAlive" type="checkbox" role="switch" :aria-label="t('web.advanced.keepAliveLabel')">
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
