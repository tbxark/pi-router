<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { postMessage } from '../vscode-api';
import type { PanelState, ProviderOption } from '../types/messages';

const props = defineProps<{
  state: PanelState;
}>();

const selectedProviderId = ref('');
const apiKey = ref('');
const envText = ref('');

const currentProvider = computed<ProviderOption | undefined>(() =>
  props.state.providers.find((p) => p.id === selectedProviderId.value)
);

const oauthDisplayName = computed(() => {
  const p = currentProvider.value;
  return p?.oauthName ? `Authorize ${p.oauthName}` : 'Authorize with OAuth';
});

const supportsOAuth = computed(() =>
  currentProvider.value ? props.state.oauthProviderIds.includes(currentProvider.value.id) : false
);

const envPlaceholder = computed(() => {
  const p = currentProvider.value;
  if (!p) return 'KEY=value';
  const lines = [...p.apiKeyEnvVars, ...p.envHints]
    .filter((key, i, arr) => arr.indexOf(key) === i)
    .map((key) => `${key}=`);
  return lines.length ? lines.join('\n') : 'KEY=value';
});

// Ensure a provider is selected when the list populates
watch(
  () => props.state.providers,
  (providers) => {
    if (providers.length && (!selectedProviderId.value || !providers.find((p) => p.id === selectedProviderId.value))) {
      selectedProviderId.value = providers[0].id;
    }
  },
  { immediate: true }
);

function onSave() {
  if (!currentProvider.value) return;
  postMessage({
    type: 'saveApiKey',
    providerId: currentProvider.value.id,
    apiKey: apiKey.value,
    envText: envText.value
  });
  apiKey.value = '';
}

function onOAuthLogin() {
  if (!currentProvider.value) return;
  postMessage({ type: 'loginOAuth', providerId: currentProvider.value.id });
}
</script>

<template>
  <section class="panel">
    <h2>Add or Update Provider</h2>

    <label for="providerSelect">Provider</label>
    <select id="providerSelect" v-model="selectedProviderId">
      <option
        v-for="p in state.providers"
        :key="p.id"
        :value="p.id"
      >
        {{ p.label }} ({{ p.modelCount }})
      </option>
    </select>

    <div v-if="currentProvider" class="meta">
      {{ currentProvider.modelCount }} models
      <template v-if="currentProvider.apiKeyEnvVars.length">
        | API key: {{ currentProvider.apiKeyEnvVars.join(' or ') }}
      </template>
      <template v-if="currentProvider.envHints.length">
        | Env: {{ currentProvider.envHints.join(', ') }}
      </template>
    </div>

    <ul v-if="currentProvider" class="model-list muted">
      <li v-for="model in currentProvider.sampleModels" :key="model">{{ model }}</li>
    </ul>

    <div v-if="supportsOAuth" id="oauthBlock">
      <div class="actions">
        <button class="primary" @click="onOAuthLogin">{{ oauthDisplayName }}</button>
      </div>
    </div>

    <label for="apiKey">API Key</label>
    <input id="apiKey" type="password" autocomplete="off" placeholder="Paste API key" v-model="apiKey" />

    <label for="envText">Provider Env</label>
    <textarea
      id="envText"
      spellcheck="false"
      :placeholder="envPlaceholder"
      v-model="envText"
    ></textarea>

    <div class="actions">
      <button class="primary" @click="onSave">Save API Key / Env</button>
    </div>
  </section>
</template>

<style scoped>
label {
  display: block;
  font-weight: 600;
  margin: 12px 0 6px;
}

select,
input,
textarea {
  background: var(--vscode-input-background);
  border: 1px solid var(--vscode-input-border);
  box-sizing: border-box;
  color: var(--vscode-input-foreground);
  font-family: var(--vscode-font-family);
  padding: 8px;
  width: 100%;
}

textarea {
  min-height: 118px;
  resize: vertical;
}

button {
  background: var(--vscode-button-secondaryBackground);
  border: 0;
  border-radius: 4px;
  color: var(--vscode-button-secondaryForeground);
  cursor: pointer;
  padding: 7px 10px;
}

button.primary {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
}

button:disabled {
  cursor: default;
  opacity: 0.45;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.meta {
  color: var(--vscode-descriptionForeground);
  font-size: 12px;
  margin-top: 4px;
}

.muted {
  color: var(--vscode-descriptionForeground);
}

.model-list {
  margin: 8px 0 0;
  padding-left: 18px;
}
</style>
