<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";
import { useI18n } from "vue-i18n";

import { tWeb } from "../i18n.js";

defineProps<{ active: boolean }>();

const { t } = useI18n();

interface PhoneCommand {
  id: string;
  usage: string;
  descriptionKey: string;
}

const PHONE_COMMANDS: readonly PhoneCommand[] = [
  { id: "help", usage: "/help", descriptionKey: "web.commands.description.help" },
  { id: "status", usage: "/status", descriptionKey: "web.commands.description.status" },
  { id: "current", usage: "/current", descriptionKey: "web.commands.description.current" },
  { id: "projects", usage: "/projects", descriptionKey: "web.commands.description.projects" },
  { id: "open", usage: "/open <number|path>", descriptionKey: "web.commands.description.open" },
  { id: "sessions", usage: "/sessions", descriptionKey: "web.commands.description.sessions" },
  { id: "use", usage: "/use <number|id>", descriptionKey: "web.commands.description.use" },
  { id: "switch", usage: "/switch <number|id>", descriptionKey: "web.commands.description.switch" },
  { id: "tail", usage: "/tail [n]", descriptionKey: "web.commands.description.tail" },
  { id: "new", usage: "/new <message>", descriptionKey: "web.commands.description.new" },
  { id: "file", usage: "/file <path>", descriptionKey: "web.commands.description.file" },
  { id: "automode", usage: "/automode <true|false>", descriptionKey: "web.commands.description.automode" },
  { id: "model", usage: "/model", descriptionKey: "web.commands.description.model" },
  { id: "cancel", usage: "/cancel", descriptionKey: "web.commands.description.cancel" },
  { id: "approve", usage: "/approve <number>", descriptionKey: "web.commands.description.approve" },
  { id: "deny", usage: "/deny <number>", descriptionKey: "web.commands.description.deny" },
];

const copiedCommandId = ref<string | null>(null);
const copyStatus = ref("");
let copiedTimer: number | null = null;

async function writeClipboard(text: string): Promise<boolean> {
  if (typeof navigator.clipboard?.writeText === "function") {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Continue with the fallback for non-secure local origins.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}

async function copyCommand(command: PhoneCommand): Promise<void> {
  const copied = await writeClipboard(command.usage);
  copyStatus.value = tWeb(copied ? "web.commands.copySuccess" : "web.commands.copyFailed");
  copiedCommandId.value = copied ? command.id : null;
  if (!copied) return;

  if (copiedTimer !== null) window.clearTimeout(copiedTimer);
  copiedTimer = window.setTimeout(() => {
    copiedCommandId.value = null;
    copiedTimer = null;
  }, 1400);
}

function commandTitle(command: PhoneCommand): string {
  return copiedCommandId.value === command.id
    ? tWeb("web.commands.copySuccess")
    : tWeb(`web.commands.tooltip.${command.id}`);
}

onBeforeUnmount(() => {
  if (copiedTimer !== null) window.clearTimeout(copiedTimer);
});
</script>

<template>
  <section id="phoneCommands" :class="['section-block', 'app-page', { active }]">
    <div class="section-heading inline-heading">
      <div>
        <h2>{{ t("web.commands.title") }}</h2>
        <p>{{ t("web.commands.subtitle") }}</p>
      </div>
      <span class="badge neutral">{{ t("web.commands.badge") }}</span>
    </div>

    <div id="phoneCommandList" class="command-list">
      <button
        v-for="command in PHONE_COMMANDS"
        :key="command.id"
        type="button"
        :class="['command-row', { copied: copiedCommandId === command.id }]"
        :aria-describedby="`phone-command-${command.id}-tooltip`"
        :aria-label="`${command.usage}: ${tWeb(command.descriptionKey)}`"
        :title="commandTitle(command)"
        @click="copyCommand(command)"
      >
        <code>{{ command.usage }}</code>
        <span class="command-description">{{ tWeb(command.descriptionKey) }}</span>
        <span :id="`phone-command-${command.id}-tooltip`" class="command-tooltip" role="tooltip">
          {{ tWeb(`web.commands.tooltip.${command.id}`) }}
        </span>
      </button>
    </div>
    <span id="commandCopyStatus" class="visually-hidden" aria-live="polite">{{ copyStatus }}</span>
  </section>
</template>
