<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { onMessage, postMessage } from './vscode-api';
import ProviderForm from './components/ProviderForm.vue';
import ProviderList from './components/ProviderList.vue';
import type { PanelState } from '@pi-router/messages';

const state = ref<PanelState>({
  providers: [],
  configured: [],
  oauthProviderIds: []
});

const error = ref('');

// Modal state
const modalOpen = ref(false);
const editingProviderId = ref<string | null>(null);

let cleanup: (() => void) | null = null;

onMounted(() => {
  cleanup = onMessage((message) => {
    if (message.type === 'state') {
      state.value = message.state;
      error.value = '';
    } else if (message.type === 'error') {
      error.value = message.error;
    } else if (message.type === 'oauthDone') {
      // OAuth flow completed — refresh state
      postMessage({ type: 'ready' });
    }
  });
  postMessage({ type: 'ready' });
});

onUnmounted(() => {
  cleanup?.();
});

function onAddProvider() {
  editingProviderId.value = null;
  modalOpen.value = true;
}

function onEditProvider(providerId: string) {
  editingProviderId.value = providerId;
  modalOpen.value = true;
}

function onCloseModal() {
  modalOpen.value = false;
  editingProviderId.value = null;
}
</script>

<template>
  <div class="app-header">
    <h1>Pi Router</h1>
    <span class="subtitle">Model Provider Management</span>
  </div>

  <div v-if="error" class="error">{{ error }}</div>

  <ProviderList :state="state" @add="onAddProvider" @edit="onEditProvider" />

  <Teleport to="body">
    <ProviderForm v-if="modalOpen" :state="state" :editingProviderId="editingProviderId" @close="onCloseModal" />
  </Teleport>
</template>

<style>
:root {
  color-scheme: dark light;
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

body {
  background: var(--vscode-editor-background);
  color: var(--vscode-foreground);
  font-family: var(--vscode-font-family);
  font-size: var(--vscode-font-size);
  line-height: 1.45;
  margin: 0;
  padding: 20px;
}

h1,
h2,
h3 {
  margin: 0;
  line-height: 1.25;
}

h1 {
  color: var(--vscode-foreground);
  font-size: 20px;
  font-weight: 600;
}

h2 {
  font-size: 16px;
  margin-bottom: 12px;
}

h3 {
  font-size: 13px;
}

.app-header {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 18px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--vscode-panel-border);
}

.subtitle {
  color: var(--vscode-descriptionForeground);
  font-size: 13px;
}

.error {
  background: var(--vscode-inputValidation-errorBackground);
  border: 1px solid var(--vscode-inputValidation-errorBorder);
  border-radius: 2px;
  color: var(--vscode-inputValidation-errorForeground);
  margin-bottom: 16px;
  padding: 10px 14px;
}

@media (max-width: 640px) {
  body {
    padding: 14px;
  }

  .app-header {
    align-items: flex-start;
    flex-direction: column;
    gap: 4px;
  }
}
</style>
