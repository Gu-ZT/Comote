<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";

defineProps<{ active: boolean }>();

const { t } = useI18n();

interface VersionStatus {
  version?: string;
  latest?: string;
  hasUpdate?: boolean;
  error?: string;
  releaseUrl?: string;
  includePrereleases?: boolean;
}

const status = ref<VersionStatus | null>(null);
const checking = ref(false);
const includePrereleases = ref(localStorage.getItem("comoteIncludePrereleases") === "true");
let versionTimer: number | null = null;

const currentVersion = computed(() => status.value?.version ?? t("web.version.unknown"));
const latestVersion = computed(() => {
  const value = status.value;
  if (!value) return t("web.about.checking");
  if (value.latest) {
    return value.hasUpdate
      ? t("web.about.latestHasUpdate", { latest: value.latest })
      : t("web.about.latestUpToDate", { latest: value.latest });
  }
  if (value.error) return t("web.about.checkFailed", { error: value.error });
  return t("web.about.noRelease");
});

async function request(path: string, options?: RequestInit): Promise<VersionStatus> {
  const token = localStorage.getItem("comoteApiToken");
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options?.headers ?? {}),
      ...(token ? { "x-comote-token": token } : {}),
    },
  });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}

async function refreshVersion(): Promise<void> {
  try {
    status.value = await request("/api/version");
    if (localStorage.getItem("comoteIncludePrereleases") === null) {
      includePrereleases.value = Boolean(status.value.includePrereleases);
    }
  } catch (cause) {
    status.value = { error: cause instanceof Error ? cause.message : String(cause) };
  }
}

async function checkUpdate(): Promise<void> {
  checking.value = true;
  localStorage.setItem("comoteIncludePrereleases", String(includePrereleases.value));
  try {
    await request(`/api/version/check?includePrereleases=${includePrereleases.value ? "true" : "false"}`, { method: "POST" });
    await refreshVersion();
    window.dispatchEvent(new CustomEvent("comote:version-change"));
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    window.alert(t("web.about.checkUpdateFailed", { message }));
  } finally {
    checking.value = false;
  }
}

function savePrereleasePreference(): void {
  localStorage.setItem("comoteIncludePrereleases", String(includePrereleases.value));
}

onMounted(() => {
  void refreshVersion();
  versionTimer = window.setInterval(() => void refreshVersion(), 15 * 60 * 1000);
});

onBeforeUnmount(() => {
  if (versionTimer !== null) window.clearInterval(versionTimer);
});
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
          <dt>{{ t("web.about.currentVersion") }}</dt><dd id="aboutCurrentVersion">{{ currentVersion }}</dd>
          <dt>{{ t("web.about.latestRelease") }}</dt><dd id="aboutLatestVersion">{{ latestVersion }}</dd>
        </dl>
        <div class="actions">
          <button id="aboutCheckUpdate" class="secondary-button" type="button" :disabled="checking" @click="checkUpdate">{{ checking ? t("web.about.checking") : t("web.about.checkUpdate") }}</button>
          <a id="aboutReleasesLink" class="secondary-button" :href="status?.releaseUrl ?? 'https://github.com/Gu-ZT/Comote/releases'" target="_blank" rel="noopener">{{ t("web.about.allReleases") }}</a>
        </div>
        <label class="setting-toggle update-preference" for="includePrereleases">
          <span class="setting-copy">
            <strong>{{ t("web.about.includePrereleases") }}</strong>
            <span class="setting-note">{{ t("web.about.includePrereleasesHint") }}</span>
          </span>
          <span class="switch-control">
            <input id="includePrereleases" v-model="includePrereleases" type="checkbox" role="switch" :aria-label="t('web.about.includePrereleases')" @change="savePrereleasePreference">
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
