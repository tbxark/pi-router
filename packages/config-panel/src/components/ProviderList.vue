<script setup lang="ts">
import { computed, ref } from 'vue';
import { postMessage } from '../vscode-api';
import type { ConfiguredProvider, PanelState } from '../types/messages';

const props = defineProps<{
  state: PanelState;
}>();

const emit = defineEmits<{
  add: [];
  edit: [providerId: string];
}>();

const filter = ref('');

const filteredProviders = computed<ConfiguredProvider[]>(() => {
  const query = filter.value.trim().toLowerCase();
  if (!query) {
    return props.state.configured;
  }
  return props.state.configured.filter(
    (provider) => provider.label.toLowerCase().includes(query) || provider.id.toLowerCase().includes(query)
  );
});

function authLabel(provider: ConfiguredProvider): string {
  return provider.authType === 'oauth' ? 'OAuth' : 'API Key';
}

function needsKey(provider: ConfiguredProvider): boolean {
  return provider.authType === 'api_key' && !provider.hasKey;
}

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
    <h2>
      Active Providers
      <span v-if="state.configured.length" class="count-badge">{{ state.configured.length }}</span>
    </h2>
    <div class="toolbar-actions">
      <button class="btn btn-secondary" @click="onRefresh">Refresh</button>
      <button class="btn btn-primary" @click="emit('add')"><span class="btn-icon">+</span> Add Provider</button>
    </div>
  </div>

  <div v-if="!state.configured.length" class="empty-state">
    <div class="empty-icon">+</div>
    <p>No active providers configured yet.</p>
    <button class="btn btn-primary" @click="emit('add')">Add Your First Provider</button>
  </div>

  <template v-else>
    <div v-if="state.configured.length > 1" class="list-filter">
      <span class="list-filter-icon">⌕</span>
      <input v-model="filter" type="text" placeholder="Filter by name or id…" aria-label="Filter providers" />
      <button v-if="filter" class="btn-icon-only filter-clear" title="Clear filter" @click="filter = ''">✕</button>
    </div>

    <ul class="provider-list">
      <li
        v-for="provider in filteredProviders"
        :key="provider.id"
        class="provider-row"
        role="button"
        tabindex="0"
        @click="emit('edit', provider.id)"
        @keydown.enter="emit('edit', provider.id)"
        @keydown.space.prevent="emit('edit', provider.id)"
      >
        <div class="row-main">
          <div class="row-title">
            <span class="row-name">{{ provider.label }}</span>
            <span class="badge" :class="provider.authType">{{ authLabel(provider) }}</span>
            <span v-if="needsKey(provider)" class="badge warn" title="No API key resolved — models are hidden">
              No key
            </span>
          </div>

          <div class="row-meta">
            <span class="mono">{{ provider.id }}</span>
            <span class="dot">·</span>
            <span>{{ provider.modelCount }} models</span>
            <template v-if="provider.reasoningModels.length">
              <span class="dot">·</span>
              <span>{{ provider.reasoningModels.length }} reasoning</span>
            </template>
          </div>

          <div v-if="provider.envKeys.length" class="env-pills">
            <span v-for="key in provider.envKeys" :key="key" class="pill">{{ key }}</span>
          </div>
        </div>

        <div class="row-actions">
          <button
            type="button"
            class="btn-icon-only"
            title="Edit provider"
            aria-label="Edit provider"
            @click.stop="emit('edit', provider.id)"
          >
            ✎
          </button>
          <button
            type="button"
            class="btn-icon-only btn-remove"
            title="Remove provider"
            aria-label="Remove provider"
            @click.stop="onRemove(provider.id)"
          >
            ✕
          </button>
          <span class="row-chevron" aria-hidden="true">›</span>
        </div>
      </li>
    </ul>

    <p v-if="!filteredProviders.length" class="no-match">No providers match “{{ filter }}”.</p>
  </template>

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
  align-items: center;
  display: flex;
  gap: 8px;
  margin-bottom: 0;
}

.count-badge {
  background: var(--vscode-badge-background);
  border-radius: 10px;
  color: var(--vscode-badge-foreground);
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  min-width: 18px;
  padding: 3px 7px;
  text-align: center;
}

.toolbar-actions {
  display: flex;
  gap: 8px;
}

/* ── Filter ──────────────────────────────────────────────────────── */

.list-filter {
  align-items: center;
  background: var(--vscode-input-background);
  border: 1px solid var(--vscode-input-border, transparent);
  border-radius: 2px;
  display: flex;
  gap: 6px;
  margin-bottom: 10px;
  padding: 0 8px;
}

.list-filter:focus-within {
  border-color: var(--vscode-focusBorder);
  outline: 1px solid var(--vscode-focusBorder);
  outline-offset: -1px;
}

.list-filter-icon {
  color: var(--vscode-descriptionForeground);
  font-size: 14px;
}

.list-filter input {
  background: transparent;
  border: 0;
  color: var(--vscode-input-foreground);
  flex: 1;
  font-family: var(--vscode-font-family);
  font-size: 13px;
  outline: none;
  padding: 6px 0;
}

.filter-clear {
  height: 22px;
  width: 22px;
}

/* ── Buttons ─────────────────────────────────────────────────────── */

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

.btn-remove:hover {
  color: var(--vscode-inputValidation-errorForeground);
}

/* ── Empty state ─────────────────────────────────────────────────── */

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

/* ── List ────────────────────────────────────────────────────────── */

.provider-list {
  border: 1px solid var(--vscode-panel-border);
  border-radius: 3px;
  list-style: none;
  margin: 0;
  overflow: hidden;
  padding: 0;
}

.provider-row {
  align-items: center;
  background: var(--vscode-sideBar-background, var(--vscode-editor-background));
  border-bottom: 1px solid var(--vscode-panel-border);
  cursor: pointer;
  display: flex;
  gap: 12px;
  padding: 10px 12px;
}

.provider-row:last-child {
  border-bottom: 0;
}

.provider-row:hover {
  background: var(--vscode-list-hoverBackground);
}

.row-main {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
  flex: 1;
}

.row-title {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.row-name {
  color: var(--vscode-foreground);
  font-size: 13px;
  font-weight: 600;
}

.row-meta {
  align-items: center;
  color: var(--vscode-descriptionForeground);
  display: flex;
  flex-wrap: wrap;
  font-size: 12px;
  gap: 2px;
}

.mono {
  font-family: var(--vscode-editor-font-family, monospace);
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

/* ── Badges ──────────────────────────────────────────────────────── */

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

.badge.warn {
  background: var(--vscode-inputValidation-warningBackground, var(--vscode-editorWarning-foreground));
  border: 1px solid var(--vscode-inputValidation-warningBorder, transparent);
  color: var(--vscode-inputValidation-warningForeground, var(--vscode-foreground));
}

/* ── Row actions ─────────────────────────────────────────────────── */

.row-actions {
  align-items: center;
  display: flex;
  gap: 2px;
}

.row-chevron {
  color: var(--vscode-descriptionForeground);
  font-size: 18px;
  line-height: 1;
  padding-left: 2px;
}

.no-match {
  color: var(--vscode-descriptionForeground);
  font-size: 12px;
  margin: 10px 2px 0;
}

.footer-actions {
  margin-top: 20px;
}

.btn:focus-visible,
.btn-icon-only:focus-visible,
.provider-row:focus-visible {
  outline: 1px solid var(--vscode-focusBorder);
  outline-offset: -1px;
}

@media (max-width: 640px) {
  .toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .toolbar-actions {
    flex-wrap: wrap;
  }
}
</style>
