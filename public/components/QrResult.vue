<script setup lang="ts">
defineProps<{ view: any; imageSource: string | null }>();
</script>

<template>
  <div v-if="view.phase === 'confirmed'" class="qr-result">
    <strong>{{ $t("web.channel.qr.confirmed") }}</strong>
    <span v-if="view.accountLine">{{ view.accountLine }}</span>
    <span v-if="view.message">{{ view.message }}</span>
  </div>
  <div v-else-if="view.phase === 'expired' || view.phase === 'failed'" class="qr-result">
    <strong>{{ $t("web.qr.needRebind") }}</strong>
    <span>{{ view.message ?? $t(`web.channel.qr.${view.phase}`) }}</span>
  </div>
  <div v-else :class="['qr-result', { 'has-qr': imageSource }]">
    <img v-if="imageSource" :src="imageSource" :alt="$t('web.channel.qr.imageAlt')">
    <div v-else class="qr-glyph" aria-hidden="true"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#c4c2bc" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M21 14v7h-7M17 21v-4"/></svg></div>
    <strong>{{ $t("web.channel.qr.scanHint") }}</strong>
    <span v-if="view.message && view.message !== $t('web.channel.qr.scanHint')">{{ view.message }}</span>
  </div>
</template>
