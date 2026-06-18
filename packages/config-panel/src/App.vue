<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { onMessage, postMessage } from './vscode-api';
import ProviderForm from './components/ProviderForm.vue';
import ProviderList from './components/ProviderList.vue';
import type { PanelState } from './types/messages';

const state = ref<PanelState>({
  providers: [],
  configured: [],
  oauthProviderIds: []
});

const error = ref('');

let cleanup: (() => void) | null = null;

onMounted(() => {
  cleanup = onMessage((message) => {
    if (message.type === 'state') {
      state.value = message.state;
      error.value = '';
    } else if (message.type === 'error') {
      error.value = message.error;
    }
  });
  postMessage({ type: 'ready' });
});

onUnmounted(() => {
  cleanup?.();
});
</script>

<template>
  <h1>Pi Router Providers</h1>
  <div v-if="error" class="error">{{ error }}</div>

  <div class="layout">
    <ProviderForm :state="state" />
    <ProviderList :state="state" />
  </div>
</template>

<style>
:root {
  color-scheme: dark light;
}

body {
  color: var(--vscode-foreground);
  font-family: var(--vscode-font-family);
  font-size: var(--vscode-font-size);
  padding: 20px;
}

h1,
h2,
h3 {
  margin: 0;
  line-height: 1.25;
}

h1 {
  font-size: 22px;
  margin-bottom: 16px;
}

h2 {
  font-size: 16px;
  margin-bottom: 12px;
}

h3 {
  font-size: 13px;
}

.layout {
  display: grid;
  gap: 18px;
  grid-template-columns: minmax(260px, 360px) 1fr;
}

@media (max-width: 860px) {
  .layout {
    grid-template-columns: 1fr;
  }
}

.error {
  color: var(--vscode-errorForeground);
  min-height: 18px;
  margin-bottom: 10px;
}

.panel {
  border: 1px solid var(--vscode-panel-border);
  border-radius: 6px;
  padding: 14px;
}
</style>
