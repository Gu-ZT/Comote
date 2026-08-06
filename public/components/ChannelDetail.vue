<script setup lang="ts">
import { useI18n } from "vue-i18n";

import { bindingAffordance, channelFormSpec, channelLastError } from "../channel-view.js";
import QrResult from "./QrResult.vue";

const props = defineProps<{
  channel: any;
  formValues: Record<string, Record<string, string | boolean>>;
  loginView: any;
  saving: boolean;
  saved: boolean;
  qrImageSource: string | null;
  actionLabel: string;
  hasQrArea: boolean;
  statusRows: any[];
  setup: any;
}>();

const emit = defineEmits<{ save: []; login: [] }>();
const { t } = useI18n();

function fields() {
  return channelFormSpec(props.channel, t);
}

function values() {
  return props.formValues[props.channel.id] ?? {};
}

function isCredentialBinding(): boolean {
  return Boolean(props.channel.credentialBinding);
}
</script>

<template>
  <div>
    <div v-if="channelLastError(channel)" class="channel-error"><strong>{{ t("web.channel.lastError") }}</strong>: {{ channelLastError(channel) }}</div>
    <div v-if="bindingAffordance(channel)?.kind === 'pairingCode'" class="pairing-block">
      <div class="intro">{{ t("web.channel.pairing.intro") }}</div>
      <span class="pairing-code">{{ bindingAffordance(channel)?.code ?? "-" }}</span>
    </div>
    <dl v-if="statusRows.length" :class="['kv', 'status-rows', { 'feishu-status-strip': isCredentialBinding() }]">
      <template v-for="row in statusRows" :key="row.label"><dt>{{ row.label }}</dt><dd>{{ row.value }}</dd></template>
    </dl>

    <div v-if="isCredentialBinding()" class="feishu-bind-grid">
      <section class="bind-method bind-method-primary">
        <header class="bind-method-head">
          <span class="bind-method-tag">{{ t("web.channel.feishu.recommended") }}</span>
          <h4>{{ t("web.channel.feishu.bindCredentials") }}</h4>
          <p>{{ t("web.channel.feishu.manualHint") }}</p>
        </header>
        <form v-if="fields().length" class="stack-form channel-config-form" @submit.prevent="emit('save')">
          <div v-for="field in fields()" :key="field.name" class="config-field">
            <label v-if="field.type !== 'checkbox'" class="domain-label" :for="`channel-${channel.id}-${field.name}`">{{ field.label }}</label>
            <select v-if="field.type === 'select'" :id="`channel-${channel.id}-${field.name}`" v-model="values()[field.name]" :name="field.name" :required="field.required">
              <option v-for="option in field.options" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
            <label v-else-if="field.type === 'checkbox'" class="config-field"><input v-model="values()[field.name]" :name="field.name" type="checkbox"> <span>{{ field.label }}</span></label>
            <input v-else :id="`channel-${channel.id}-${field.name}`" v-model="values()[field.name]" :name="field.name" :type="field.secret || field.type === 'password' ? 'password' : 'text'" :required="field.required" autocomplete="off">
          </div>
        </form>
        <details v-if="setup" class="channel-setup">
          <summary>{{ t("web.channel.howTo") }}</summary>
          <ol><li v-for="step in setup.steps" :key="step">{{ step }}</li></ol>
          <a v-if="setup.link" :href="setup.link.url" target="_blank" rel="noopener">-> {{ setup.link.label }}</a>
        </details>
        <div class="actions card-actions"><button type="button" class="btn-primary-card" :disabled="saving" @click="emit('save')">{{ saved ? t("web.channel.saved") : t("web.channel.feishu.bindCredentials") }}</button></div>
      </section>
      <section class="bind-method bind-method-secondary">
        <header class="bind-method-head">
          <span class="bind-method-tag neutral">{{ t("web.channel.feishu.alternative") }}</span>
          <h4>{{ t("web.channel.feishu.bindQr") }}</h4>
          <p>{{ t("web.channel.feishu.qrDesc") }}</p>
        </header>
        <QrResult v-if="hasQrArea" :view="loginView" :image-source="qrImageSource" />
        <div class="actions card-actions"><button type="button" class="secondary-button qr-bind-button" :disabled="saving" @click="emit('login')">{{ t("web.channel.feishu.bindQr") }}</button></div>
      </section>
    </div>

    <template v-else>
      <QrResult v-if="hasQrArea" :view="loginView" :image-source="qrImageSource" />
      <form v-if="fields().length" class="stack-form channel-config-form" @submit.prevent="emit('save')">
        <div v-for="field in fields()" :key="field.name" class="config-field">
          <label v-if="field.type !== 'checkbox'" class="domain-label" :for="`channel-${channel.id}-${field.name}`">{{ field.label }}</label>
          <select v-if="field.type === 'select'" :id="`channel-${channel.id}-${field.name}`" v-model="values()[field.name]" :name="field.name" :required="field.required"><option v-for="option in field.options" :key="option.value" :value="option.value">{{ option.label }}</option></select>
          <label v-else-if="field.type === 'checkbox'" class="config-field"><input v-model="values()[field.name]" :name="field.name" type="checkbox"> <span>{{ field.label }}</span></label>
          <input v-else :id="`channel-${channel.id}-${field.name}`" v-model="values()[field.name]" :name="field.name" :type="field.secret || field.type === 'password' ? 'password' : 'text'" :required="field.required" autocomplete="off">
        </div>
      </form>
      <details v-if="setup" class="channel-setup"><summary>{{ t("web.channel.howTo") }}</summary><ol><li v-for="step in setup.steps" :key="step">{{ step }}</li></ol><a v-if="setup.link" :href="setup.link.url" target="_blank" rel="noopener">-> {{ setup.link.label }}</a></details>
      <div class="actions card-actions"><button type="button" class="btn-primary-card" :disabled="saving" @click="channel.binding === 'qr' ? emit('login') : emit('save')">{{ actionLabel }}</button></div>
    </template>
  </div>
</template>
