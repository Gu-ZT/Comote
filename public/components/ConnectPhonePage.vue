<script setup lang="ts">
import { useI18n } from "vue-i18n";

defineProps<{ active: boolean }>();

const { t } = useI18n();
</script>

<template>
  <section id="connectPhone" :class="['section-block', 'app-page', { active }]">
    <section id="updateNotice" class="system-notice" hidden>
      <div>
        <strong><span>{{ t("web.update.available") }}</span><span id="updateLatestVersion"></span></strong>
        <p id="updateCurrentLine"><span>{{ t("web.update.currentPrefix") }}</span><span id="updateCurrentVersion"></span><span id="updateCurrentSuffix" v-once data-i18n="web.update.currentSuffix">。点击下载并替换本机的 GugleComote。</span></p>
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
      <button id="retryCodexConnection" v-once class="secondary-button" data-default-label="重试" type="button" data-i18n="web.button.retry">重试</button>
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
</template>
