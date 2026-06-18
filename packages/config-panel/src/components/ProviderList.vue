<script setup lang="ts">
import { postMessage } from '../vscode-api';
import type { PanelState } from '../types/messages';

defineProps<{
  state: PanelState;
}>();

const emit = defineEmits<{
  add: [];
  edit: [providerId: string];
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
  <div class="toolbar">
    <h2>Active Providers</h2>
    <div class="toolbar-actions">
      <button class="btn btn-secondary" @click="onRefresh">Refresh</button>
      <button class="btn btn-primary" @click="emit('add')">
        <span class="btn-icon">+</span> Add Provider
      </button>
    </div>
  </div>

  <div v-if="!state.configured.length" class="empty-state">
    <div class="empty-icon">+</div>
    <p>No active providers configured yet.</p>
    <button class="btn btn-primary" @click="emit('add')">Add Your First Provider</button>
  </div>

  <div v-else class="provider-grid">
    <div
      v-for="provider in state.configured"
      :key="provider.id"
      class="provider-card"
      role="button"
      tabindex="0"
      @click="emit('edit', provider.id)"
      @keydown.enter="emit('edit', provider.id)"
      @keydown.space.prevent="emit('edit', provider.id)"
    >
      <div class="card-header">
        <div class="card-title">
          <h3>{{ provider.label }}</h3>
          <span class="badge" :class="provider.authType">
            {{ provider.authType === 'oauth' ? 'OAuth' : 'API Key' }}
          </span>
        </div>
        <button
          type="button"
          class="btn-icon-only"
          title="Remove provider"
          aria-label="Remove provider"
          @click.stop="onRemove(provider.id)"
        >
          ✕
        </button>
      </div>

      <div class="card-meta">
        <span>{{ provider.id }}</span>
        <span class="dot">·</span>
        <span>{{ provider.modelCount }} models</span>
      </div>

      <div v-if="provider.envKeys.length" class="env-pills">
        <span v-for="key in provider.envKeys" :key="key" class="pill">{{ key }}</span>
      </div>
    </div>
  </div>

  <div v-if="state.configured.length" class="footer-actions">
    <button class="btn btn-danger" @click="onClearAll">Clear All Credentials</button>
  </div>
</template>

<style scoped>
.toolbar {
  align-items: center;
  display: flex;
  gap: 12px;
  justify-content: space-between;
  margin-bottom: 14px;
}

.toolbar h2 {
  margin-bottom: 0;
}

.toolbar-actions {
  display: flex;
  gap: 8px;
}

.btn {
  align-items: center;
  border: 1px solid transparent;
  border-radius: 2px;
  cursor: pointer;
  display: inline-flex;
  font-family: inherit;
  font-size: 13px;
  gap: 6px;
  line-height: 18px;
  min-height: 28px;
  padding: 4px 12px;
  white-space: nowrap;
}

.btn:hover {
  opacity: 1;
}

.btn-primary {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
}

.btn-primary:hover {
  background: var(--vscode-button-hoverBackground);
}

.btn-secondary {
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
}

.btn-secondary:hover {
  background: var(--vscode-button-secondaryHoverBackground);
}

.btn-danger {
  background: transparent;
  border: 1px solid var(--vscode-inputValidation-errorBorder);
  color: var(--vscode-inputValidation-errorForeground);
}

.btn-icon {
  font-size: 16px;
  font-weight: 600;
  line-height: 1;
}

.btn-icon-only {
  align-items: center;
  background: transparent;
  border: 0;
  border-radius: 3px;
  color: var(--vscode-descriptionForeground);
  cursor: pointer;
  display: inline-flex;
  font-size: 14px;
  height: 28px;
  justify-content: center;
  padding: 0;
  width: 28px;
}

.btn-icon-only:hover {
  background: var(--vscode-toolbar-hoverBackground);
  color: var(--vscode-foreground);
}

.empty-state {
  align-items: center;
  background: var(--vscode-sideBar-background, transparent);
  border: 1px dashed var(--vscode-panel-border);
  border-radius: 3px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 48px 24px;
  text-align: center;
}

.empty-icon {
  align-items: center;
  border: 1px solid var(--vscode-panel-border);
  border-radius: 50%;
  color: var(--vscode-descriptionForeground);
  display: flex;
  font-size: 24px;
  height: 44px;
  justify-content: center;
  line-height: 1;
  width: 44px;
}

.empty-state p {
  color: var(--vscode-descriptionForeground);
  margin: 0;
}

.provider-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
}

.provider-card {
  background: var(--vscode-sideBar-background, var(--vscode-editor-background));
  border: 1px solid var(--vscode-panel-border);
  border-radius: 3px;
  cursor: pointer;
  padding: 14px;
}

.provider-card:hover {
  background: var(--vscode-list-hoverBackground);
  border-color: var(--vscode-focusBorder);
}

.card-header {
  align-items: flex-start;
  display: flex;
  justify-content: space-between;
  margin-bottom: 10px;
}

.card-title {
  align-items: center;
  display: flex;
  gap: 8px;
}

.badge {
  border-radius: 2px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.3px;
  padding: 2px 7px;
  text-transform: uppercase;
}

.badge.api_key {
  background: var(--vscode-badge-background);
  color: var(--vscode-badge-foreground);
}

.badge.oauth {
  background: var(--vscode-statusBarItem-prominentBackground, var(--vscode-badge-background));
  color: var(--vscode-statusBarItem-prominentForeground, var(--vscode-badge-foreground));
}

.card-meta {
  color: var(--vscode-descriptionForeground);
  font-size: 12px;
  margin-bottom: 10px;
}

.dot {
  margin: 0 4px;
}

.env-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.pill {
  background: var(--vscode-badge-background);
  border-radius: 2px;
  color: var(--vscode-badge-foreground);
  font-family: var(--vscode-editor-font-family, monospace);
  font-size: 11px;
  padding: 2px 10px;
}

.footer-actions {
  margin-top: 20px;
}

.btn:focus-visible,
.btn-icon-only:focus-visible,
.provider-card:focus-visible {
  outline: 1px solid var(--vscode-focusBorder);
  outline-offset: 2px;
}

@media (max-width: 640px) {
  .toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .toolbar-actions {
    flex-wrap: wrap;
  }

  .provider-grid {
    grid-template-columns: 1fr;
  }
}
</style>
