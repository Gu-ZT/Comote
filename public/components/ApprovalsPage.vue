<script setup lang="ts">
import { useI18n } from "vue-i18n";

defineProps<{ active: boolean }>();

const { t } = useI18n();
</script>

<template>
  <section id="approvals" :class="['section-block', 'app-page', { active }]">
    <div class="section-heading inline-heading">
      <div>
        <h2>{{ t("web.approvals.title") }}</h2>
        <p>{{ t("web.approvals.subtitle") }}</p>
      </div>
      <span id="approvalsBadge" v-once class="badge neutral" data-i18n="web.approvals.badge.empty">—</span>
    </div>
    <ul id="approvalsList" class="list"></ul>
  </section>
</template>
