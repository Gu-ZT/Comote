<script setup lang="ts">
import { useI18n } from "vue-i18n";

defineProps<{ active: boolean }>();

const { t } = useI18n();
</script>

<template>
  <section id="conversation" :class="['section-block', 'app-page', 'conversation-page', { active }]">
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
</template>
