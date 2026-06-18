<script setup lang="ts">
import { postMessage } from '../vscode-api';
import type { PanelState } from '../types/messages';

defineProps<{
  state: PanelState;
}>();

function onRefresh() {
  postMessage({ type: 'ready' });
}

function onRemove(providerId: string) {
  postMessage({ type: 'removeProvider', providerId });
}

function onClearAll() {
  postMessage({ type: 'clearCredentials' });
}
</script>

<template>
  <section class="panel">
    <div class="toolbar">
      <h2>Active Providers</h2>
      <button @click="onRefresh">Refresh</button>
    </div>

    <div v-if="!state.configured.length" class="muted">
      No active providers.
    </div>

    <div class="configured-list">
      <div
        v-for="provider in state.configured"
        :key="provider.id"
        class="provider-card"
      >
        <div class="provider-head">
          <div>
            <h3>{{ provider.label }}</h3>
            <div class="meta">
              {{ provider.id }} | {{ provider.modelCount }} models | {{ provider.authType }}
            </div>
          </div>
          <button @click="onRemove(provider.id)">Remove</button>
        </div>
        <div v-if="provider.envKeys.length" class="pill-row">
          <span v-for="key in provider.envKeys" :key="key" class="pill">{{ key }}</span>
        </div>
      </div>
    </div>

    <div class="actions">
      <button class="danger" @click="onClearAll">Clear All Credentials</button>
    </div>
  </section>
</template>

<style scoped>
.toolbar {
  align-items: center;
  display: flex;
  gap: 8px;
  justify-content: space-between;
  margin-bottom: 12px;
}

.configured-list {
  display: grid;
  gap: 10px;
}

.provider-card {
  border: 1px solid var(--vscode-input-border);
  border-radius: 6px;
  padding: 12px;
}

.provider-head {
  align-items: start;
  display: flex;
  gap: 8px;
  justify-content: space-between;
}

.meta {
  color: var(--vscode-descriptionForeground);
  font-size: 12px;
  margin-top: 4px;
}

.pill-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.pill {
  background: var(--vscode-badge-background);
  border-radius: 999px;
  color: var(--vscode-badge-foreground);
  font-size: 11px;
  padding: 2px 8px;
}

.muted {
  color: var(--vscode-descriptionForeground);
}

button {
  background: var(--vscode-button-secondaryBackground);
  border: 0;
  border-radius: 4px;
  color: var(--vscode-button-secondaryForeground);
  cursor: pointer;
  padding: 7px 10px;
}

button.danger {
  background: var(--vscode-inputValidation-errorBackground);
  color: var(--vscode-inputValidation-errorForeground);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}
</style>
