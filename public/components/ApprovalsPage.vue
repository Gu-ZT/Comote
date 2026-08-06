<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

defineProps<{ active: boolean }>();

const { t } = useI18n();

interface Approval {
  id: string;
  method?: string;
  params?: { command?: string; reason?: string; cwd?: string };
}

const approvals = ref<Approval[]>([]);
const error = ref(false);
const busyId = ref<string | null>(null);
let refreshTimer: number | null = null;

async function refresh(): Promise<void> {
  try {
    const token = localStorage.getItem("comoteApiToken");
    const response = await fetch("/api/approvals", {
      headers: token ? { "x-comote-token": token } : undefined,
    });
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    approvals.value = (await response.json()) ?? [];
    error.value = false;
  } catch {
    error.value = true;
  }
}

async function decide(approval: Approval, decision: string): Promise<void> {
  busyId.value = approval.id;
  try {
    const token = localStorage.getItem("comoteApiToken");
    const response = await fetch(`/api/approvals/${encodeURIComponent(approval.id)}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { "x-comote-token": token } : {}),
      },
      body: JSON.stringify({ decision }),
    });
    if (!response.ok) {
      if (response.status === 401) {
        window.alert(t("web.action.unauthorized"));
        return;
      }
      throw new Error(`Request failed: ${response.status}`);
    }
    await refresh();
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    window.alert(t("web.action.failed", { message }));
  } finally {
    busyId.value = null;
  }
}

function approvalCommand(approval: Approval): string {
  return approval.params?.command ?? approval.params?.reason ?? approval.method ?? "";
}

watch(approvals, (value) => {
  const navCount = document.querySelector("#approvalsNavCount");
  if (!navCount) return;
  navCount.hidden = value.length === 0;
  navCount.textContent = String(value.length);
});

onMounted(() => {
  void refresh();
  refreshTimer = window.setInterval(() => void refresh(), 5000);
});

onBeforeUnmount(() => {
  if (refreshTimer !== null) window.clearInterval(refreshTimer);
});
</script>

<template>
  <section id="approvals" :class="['section-block', 'app-page', { active }]">
    <div class="section-heading inline-heading">
      <div>
        <h2>{{ t("web.approvals.title") }}</h2>
        <p>{{ t("web.approvals.subtitle") }}</p>
      </div>
      <span id="approvalsBadge" :class="['badge', approvals.length > 0 ? 'warning' : 'neutral']">
        {{ approvals.length > 0 ? t("web.approvals.badge.count", { count: approvals.length }) : t("web.approvals.badge.empty") }}
      </span>
    </div>
    <ul id="approvalsList" class="list">
      <li v-if="error" class="list-error"><strong>{{ t("web.connectors.error.approvals") }}</strong><div class="meta">{{ t("web.sectionError.retryHint") }}</div></li>
      <li v-else-if="approvals.length === 0"><strong>{{ t("web.approvals.empty.title") }}</strong><div class="meta">{{ t("web.approvals.empty.hint") }}</div></li>
      <li v-for="approval in approvals" :key="approval.id" class="list-row approval-row">
        <span class="approval-copy">
          <strong>{{ approvalCommand(approval) }}</strong>
          <div class="meta">{{ approval.id }}</div>
          <div class="meta">{{ approval.params?.cwd ?? "" }}</div>
        </span>
        <span class="button-row approval-actions">
          <button :disabled="busyId === approval.id" @click="decide(approval, 'accept')">{{ t("web.approvals.accept") }}</button>
          <button class="secondary-button" :disabled="busyId === approval.id" @click="decide(approval, 'acceptForSession')">{{ t("web.approvals.acceptForSession") }}</button>
          <button class="secondary-button" :disabled="busyId === approval.id" @click="decide(approval, 'decline')">{{ t("web.approvals.decline") }}</button>
        </span>
      </li>
    </ul>
  </section>
</template>
