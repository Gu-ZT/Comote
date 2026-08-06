<script setup lang="ts">
import { useI18n } from "vue-i18n";

defineProps<{ active: boolean }>();

const { t } = useI18n();
</script>

<template>
  <section id="logs" :class="['section-block', 'app-page', { active }]">
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
</template>
