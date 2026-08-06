<script setup lang="ts">
import { nextTick, onMounted, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";

import AboutPage from "./components/AboutPage.vue";
import ApprovalsPage from "./components/ApprovalsPage.vue";
import ConnectPhonePage from "./components/ConnectPhonePage.vue";
import ConversationPage from "./components/ConversationPage.vue";
import LogsPage from "./components/LogsPage.vue";
import PhoneCommandsPage from "./components/PhoneCommandsPage.vue";
import SettingsPage from "./components/SettingsPage.vue";
import UsersPage from "./components/UsersPage.vue";
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
      <div id="sidebarVersion" v-once class="sidebar-foot" data-i18n="web.version.checking">版本 · 检查中</div>
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
          <span id="bridgeStatus" v-once class="status-pill" data-i18n="web.status.starting">启动中</span>
        </div>
      </header>

      <section id="loadError" class="system-notice error-notice" hidden>
        <div>
          <strong id="loadErrorTitle" v-once data-i18n="web.loadError.title">加载设置时出错</strong>
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

      <ConnectPhonePage :active="isPage('connectPhone')" />
      <UsersPage :active="isPage('users')" />
      <PhoneCommandsPage :active="isPage('phoneCommands')" />
      <ApprovalsPage :active="isPage('approvals')" />
      <ConversationPage :active="isPage('conversation')" />
      <LogsPage :active="isPage('logs')" />
      <SettingsPage :active="isPage('settings')" />
      <AboutPage :active="isPage('about')" />
    </main>
  </div>
</template>
