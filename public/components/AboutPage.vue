<script setup lang="ts">
import { useI18n } from "vue-i18n";

defineProps<{ active: boolean }>();

const { t } = useI18n();
</script>

<template>
  <section id="about" :class="['section-block', 'app-page', { active }]">
    <div class="section-heading">
      <h2>{{ t("web.about.title") }}</h2>
      <p>{{ t("web.about.subtitle") }}</p>
    </div>
    <div class="about-grid">
      <article class="panel">
        <h3>{{ t("web.about.version") }}</h3>
        <dl id="aboutVersion" class="kv">
          <dt>{{ t("web.about.currentVersion") }}</dt><dd id="aboutCurrentVersion" v-once>检查中…</dd>
          <dt>{{ t("web.about.latestRelease") }}</dt><dd id="aboutLatestVersion" v-once>检查中…</dd>
        </dl>
        <div class="actions">
          <button id="aboutCheckUpdate" v-once class="secondary-button" type="button" data-i18n="web.about.checkUpdate">检查更新</button>
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
</template>
