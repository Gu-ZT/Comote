<script setup lang="ts">
import { nextTick, onMounted, watch } from "vue";
import { useRoute } from "vue-router";
import { useI18n } from "vue-i18n";
import PhoneCommandsPage from "./components/PhoneCommandsPage.vue";
import {
  applyTranslations,
  normalizeWebLocale,
  setWebLocale,
  WEB_LOCALES,
  WEB_LOCALE_NAMES,
  webLocale,
} from "./i18n.js";

const route = useRoute();
const { t } = useI18n();

defineOptions({ inheritAttrs: false });

const isPage = (page: string): boolean => route.meta.page === page;

function changeLocale(event: Event): void {
  const select = event.currentTarget as HTMLSelectElement;
  const locale = normalizeWebLocale(select.value);
  setWebLocale(locale);
  applyTranslations(document);
  window.dispatchEvent(new CustomEvent("comote:locale-change", { detail: { locale } }));
}

async function activateRoute(): Promise<void> {
  const page = String(route.meta.page ?? "connectPhone");
  document.body.dataset.activePage = page;
  window.scrollTo({ top: 0, behavior: "auto" });
  await nextTick();
  window.dispatchEvent(new CustomEvent("comote:route-change", { detail: { page } }));
}

watch(() => route.fullPath, activateRoute);
onMounted(activateRoute);
</script>

<template>
    <div class="app-frame">
      <aside class="side-nav" :aria-label="t('web.nav.ariaLabel')">
        <div class="side-brand">
          <img class="brand-logo" src="/icon.png" alt="GugleComote">
          <div>
            <h1>GugleComote</h1>
            <p>{{ t("web.brand.tagline") }}</p>
          </div>
        </div>

        <nav class="nav-list">
          <div class="nav-group-label">{{ t("web.nav.groupChannel") }}</div>
          <RouterLink class="nav-item" to="/connect-phone">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="7" y="2" width="10" height="20" rx="2.5"/><path d="M11 18h2"/></svg>
            <span>{{ t("web.nav.connectPhone") }}</span>
          </RouterLink>
          <RouterLink class="nav-item" to="/users">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.5-6 8-6s8 2 8 6"/></svg>
            <span>{{ t("web.nav.users") }}</span>
          </RouterLink>
          <RouterLink class="nav-item" to="/phone-commands">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 17V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10"/><path d="M2 21h20"/></svg>
            <span>{{ t("web.nav.phoneCommands") }}</span>
          </RouterLink>
          <div class="nav-group-label">{{ t("web.nav.groupRecords") }}</div>
          <RouterLink class="nav-item" to="/approvals">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 11l3 3 8-8"/><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"/></svg>
            <span>{{ t("web.nav.approvals") }}</span><span id="approvalsNavCount" class="nav-count" hidden>0</span>
          </RouterLink>
          <RouterLink class="nav-item" to="/conversation">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            <span>{{ t("web.nav.conversation") }}</span>
          </RouterLink>
          <RouterLink class="nav-item" to="/logs">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4h16v16H4z"/><path d="M8 9h8M8 13h5"/></svg>
            <span>{{ t("web.nav.logs") }}</span>
          </RouterLink>
          <RouterLink class="nav-item nav-item-system" to="/settings">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            <span>{{ t("web.nav.settings") }}</span>
          </RouterLink>
          <RouterLink class="nav-item" to="/about">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
            <span>{{ t("web.nav.about") }}</span>
          </RouterLink>
        </nav>
        <div class="sidebar-foot" id="sidebarVersion" data-i18n="web.version.checking">版本 · 检查中</div>
      </aside>

      <main class="main-pane">
        <header class="top-bar">
          <div>
            <h1 class="top-title">{{ t("web.top.title") }}</h1>
            <p class="top-subtitle">{{ t("web.top.subtitle") }}</p>
          </div>
          <div class="top-bar-actions">
            <label class="lang-switch" title="Language / 语言">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 3.5 9A14 14 0 0 1 12 21a14 14 0 0 1-3.5-9A14 14 0 0 1 12 3z"/></svg>
              <select id="langSelect" :value="webLocale" aria-label="Language" @change="changeLocale">
                <option v-for="locale in WEB_LOCALES" :key="locale" :value="locale">
                  {{ WEB_LOCALE_NAMES[locale] }}
                </option>
              </select>
            </label>
            <span id="bridgeStatus" class="status-pill">启动中</span>
          </div>
        </header>

        <section id="loadError" class="system-notice error-notice" hidden>
          <div>
            <strong id="loadErrorTitle" data-i18n="web.loadError.title">加载设置时出错</strong>
            <p id="loadErrorDetail"></p>
            <div id="apiTokenForm" class="token-auth-form" hidden>
              <label for="apiTokenInput">{{ t("web.loadError.tokenInputLabel") }}</label>
              <div class="token-auth-controls">
                <input id="apiTokenInput" type="password" autocomplete="off" spellcheck="false" :placeholder="t('web.loadError.tokenInputPlaceholder')">
                <button id="saveApiToken" class="secondary-button" type="button">{{ t("web.loadError.tokenSave") }}</button>
              </div>
            </div>
          </div>
          <button id="retryLoad" class="secondary-button" type="button">{{ t("web.button.retry") }}</button>
        </section>

        <section id="connectPhone" :class="['section-block', 'app-page', { active: isPage('connectPhone') }]">
          <section id="updateNotice" class="system-notice" hidden>
            <div>
              <strong><span>{{ t("web.update.available") }}</span><span id="updateLatestVersion"></span></strong>
              <p id="updateCurrentLine"><span>{{ t("web.update.currentPrefix") }}</span><span id="updateCurrentVersion"></span><span id="updateCurrentSuffix" data-i18n="web.update.currentSuffix">{{ t("web.update.currentSuffix") }}</span></p>
              <p id="updateCommandLine" hidden><span>{{ t("web.update.runHint") }}</span><code id="updateCommandText"></code></p>
            </div>
            <a id="updateDownloadLink" class="secondary-button" href="#" target="_blank" rel="noopener">{{ t("web.update.download") }}</a>
          </section>

          <section id="codexNotice" class="system-notice" hidden>
            <div>
              <strong>{{ t("web.codexNotice.title") }}</strong>
              <p>{{ t("web.codexNotice.body") }}</p>
              <p id="codexNoticeError" hidden></p>
              <p id="codexNoticeCommand" hidden><span>{{ t("web.codexNotice.commandLabel") }}</span><code id="codexNoticeCommandText"></code></p>
            </div>
            <button id="retryCodexConnection" class="secondary-button" data-default-label="重试" type="button" data-i18n="web.button.retry">重试</button>
          </section>

          <div class="section-heading inline-heading">
            <div>
              <h2>{{ t("web.connect.title") }}</h2>
              <p><span>{{ t("web.connect.subtitlePrefix") }}</span><strong>{{ t("web.connect.recommendFeishu") }}</strong><span>{{ t("web.connect.subtitleSuffix") }}</span></p>
            </div>
            <button id="refreshConnect" class="secondary-button refresh-button" type="button" :aria-label="t('web.button.refresh')" :title="t('web.button.refresh')">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8.1 8.1 0 0 0-15.5-2M4 4v5h5"/><path d="M4 13a8.1 8.1 0 0 0 15.5 2M20 20v-5h-5"/></svg>
              <span class="visually-hidden">{{ t("web.button.refresh") }}</span>
            </button>
          </div>

          <div id="readiness" class="readiness-block" hidden>
            <div class="subsection-heading">
              <h3>{{ t("web.readiness.title") }}</h3>
              <p>{{ t("web.readiness.subtitle") }}</p>
            </div>
            <ul id="readinessList" class="readiness-list"></ul>
          </div>

          <div id="channelCards"></div>
        </section>

        <section id="users" :class="['section-block', 'app-page', { active: isPage('users') }]">
          <div class="section-heading inline-heading">
            <div>
              <h2>{{ t("web.users.title") }}</h2>
              <p>{{ t("web.users.subtitle") }}</p>
            </div>
            <button id="refreshUsers" class="secondary-button refresh-button" type="button" :aria-label="t('web.button.refresh')" :title="t('web.button.refresh')">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8.1 8.1 0 0 0-15.5-2M4 4v5h5"/><path d="M4 13a8.1 8.1 0 0 0 15.5 2M20 20v-5h-5"/></svg>
              <span class="visually-hidden">{{ t("web.button.refresh") }}</span>
            </button>
          </div>

          <div class="user-grid">
            <article class="panel list-panel">
              <h3>{{ t("web.users.authorized") }}</h3>
              <ul id="identities" class="list"></ul>
            </article>
            <article class="panel list-panel">
              <h3>{{ t("web.users.pending") }}</h3>
              <ul id="identityCandidates" class="list compact-list"></ul>
            </article>
          </div>
        </section>

        <PhoneCommandsPage :active="isPage('phoneCommands')" />

        <section id="approvals" :class="['section-block', 'app-page', { active: isPage('approvals') }]">
          <div class="section-heading inline-heading">
            <div>
              <h2>{{ t("web.approvals.title") }}</h2>
              <p>{{ t("web.approvals.subtitle") }}</p>
            </div>
            <span id="approvalsBadge" class="badge neutral">0 项待处理</span>
          </div>
          <ul id="approvalsList" class="list"></ul>
        </section>

        <section id="conversation" :class="['section-block', 'app-page', 'conversation-page', { active: isPage('conversation') }]">
          <div class="conversation-browser">
            <aside class="conversation-tree-pane" :aria-label="t('web.conversation.treeTitle')">
              <div class="conversation-pane-title">{{ t("web.conversation.treeTitle") }}</div>
              <div id="conversationTree" class="conversation-tree" role="tree"></div>
            </aside>
            <section class="conversation-reader" aria-labelledby="conversationReaderTitle">
              <header class="conversation-reader-head">
                <div class="conversation-reader-mark" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                </div>
                <div class="conversation-reader-copy">
                  <h3 id="conversationReaderTitle"></h3>
                  <p id="conversationReaderMeta" class="meta"></p>
                </div>
              </header>
              <div id="conversationEmpty" class="conversation-empty">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 8h8M8 12h5"/></svg>
                <p>{{ t("web.conversation.selectThread") }}</p>
              </div>
              <div id="conversationMessages" class="conversation-messages" tabindex="0" hidden>
                <div id="conversationHistoryState" class="conversation-history-state" aria-live="polite"></div>
                <div id="conversationMessageList" class="conversation-message-list"></div>
              </div>
            </section>
          </div>
        </section>

        <section id="logs" :class="['section-block', 'app-page', { active: isPage('logs') }]">
          <div class="section-heading inline-heading">
            <div>
              <h2>{{ t("web.logs.title") }}</h2>
              <p>{{ t("web.logs.subtitle") }}</p>
            </div>
            <button id="refreshLogs" class="secondary-button refresh-button" type="button" :aria-label="t('web.button.refresh')" :title="t('web.button.refresh')">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8.1 8.1 0 0 0-15.5-2M4 4v5h5"/><path d="M4 13a8.1 8.1 0 0 0 15.5 2M20 20v-5h-5"/></svg>
              <span class="visually-hidden">{{ t("web.button.refresh") }}</span>
            </button>
          </div>
          <ul id="logList" class="list log-list"></ul>
        </section>

        <section id="settings" :class="['section-block', 'app-page', 'settings-page', { active: isPage('settings') }]">
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
                  <input id="capacityRetryLimit" type="number" min="1" max="100" step="1" inputmode="numeric" value="10" aria-label="连续错误上限">
                  <span class="setting-unit">{{ t("web.advanced.capacityRetryUnit") }}</span>
                </span>
              </label>
              <p id="capacityRetryStatus" class="setting-save-status" aria-live="polite" data-i18n="web.advanced.capacityRetryEffective">达到上限后停止当前任务。</p>
            </article>

            <article class="panel">
              <h3>{{ t("web.advanced.diagnostics") }}</h3>
              <dl id="connections" class="kv"></dl>
              <div class="actions">
                <button id="connectDesktop" class="secondary-button" type="button" data-i18n="web.advanced.retryDesktop">重试连接 Codex Desktop</button>
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

        <section id="about" :class="['section-block', 'app-page', { active: isPage('about') }]">
          <div class="section-heading">
            <h2>{{ t("web.about.title") }}</h2>
            <p>{{ t("web.about.subtitle") }}</p>
          </div>
          <div class="about-grid">
            <article class="panel">
              <h3>{{ t("web.about.version") }}</h3>
              <dl id="aboutVersion" class="kv">
                <dt>{{ t("web.about.currentVersion") }}</dt><dd id="aboutCurrentVersion">{{ t("web.about.checking") }}</dd>
                <dt>{{ t("web.about.latestRelease") }}</dt><dd id="aboutLatestVersion">{{ t("web.about.checking") }}</dd>
              </dl>
              <div class="actions">
                <button id="aboutCheckUpdate" class="secondary-button" type="button" data-i18n="web.about.checkUpdate">检查更新</button>
                <a id="aboutReleasesLink" class="secondary-button" href="https://github.com/Gu-ZT/Comote/releases" target="_blank" rel="noopener">{{ t("web.about.allReleases") }}</a>
              </div>
              <label class="setting-toggle update-preference" for="includePrereleases">
                <span class="setting-copy">
                  <strong>{{ t("web.about.includePrereleases") }}</strong>
                  <span class="setting-note">{{ t("web.about.includePrereleasesHint") }}</span>
                </span>
                <span class="switch-control">
                  <input id="includePrereleases" type="checkbox" role="switch" :aria-label="t('web.about.includePrereleases')">
                  <span class="switch-track" aria-hidden="true"></span>
                </span>
              </label>
            </article>
            <article class="panel">
              <h3>{{ t("web.about.project") }}</h3>
              <dl class="kv">
                <dt>{{ t("web.about.repo") }}</dt><dd><a href="https://github.com/Gu-ZT/Comote" target="_blank" rel="noopener">Gu-ZT/Comote</a></dd>
                <dt>{{ t("web.about.upstream") }}</dt><dd><a href="https://github.com/GavinYangAI/Comote" target="_blank" rel="noopener">GavinYangAI/Comote</a></dd>
                <dt>{{ t("web.about.author") }}</dt><dd><a href="https://github.com/GavinYangAI" target="_blank" rel="noopener">@GavinYangAI</a> · <a href="https://github.com/Gu-ZT" target="_blank" rel="noopener">Gugle</a></dd>
                <dt>{{ t("web.about.license") }}</dt><dd>MIT License</dd>
                <dt>{{ t("web.about.reportBug") }}</dt><dd><a href="https://github.com/Gu-ZT/Comote/issues" target="_blank" rel="noopener">{{ t("web.about.submitIssue") }}</a></dd>
              </dl>
            </article>
          </div>
        </section>
      </main>
    </div>

</template>
