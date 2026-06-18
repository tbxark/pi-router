<script setup lang="ts">
import { postMessage } from '../vscode-api';
import type { ConfiguredProvider } from '../types/messages';

const props = defineProps<{
  provider: ConfiguredProvider;
}>();

const LEVEL_LABELS: Record<string, string> = {
  off: 'Off',
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra High'
};

function levelLabel(level: string): string {
  return LEVEL_LABELS[level] ?? level;
}

function onChange(modelId: string, event: Event): void {
  const level = (event.target as HTMLSelectElement).value;
  postMessage({ type: 'saveModelReasoning', providerId: props.provider.id, modelId, level });
}
</script>

<template>
  <div class="reasoning-section">
    <div class="mode-panel-title">Reasoning</div>
    <p class="field-hint">
      Set the thinking level per model. Reasoning-capable models default to <code>Medium</code>; choose
      <code>Off</code> to disable thinking.
    </p>

    <div class="reasoning-row" v-for="model in provider.reasoningModels" :key="model.id">
      <label :for="`reasoning-${model.id}`" class="reasoning-label">{{ model.name }}</label>
      <select
        :id="`reasoning-${model.id}`"
        :value="model.configuredLevel"
        class="reasoning-select"
        @change="onChange(model.id, $event)"
      >
        <option value="off">{{ levelLabel('off') }}</option>
        <option v-for="level in model.supportedLevels" :key="level" :value="level">
          {{ levelLabel(level) }}
        </option>
      </select>
    </div>
  </div>
</template>

<style scoped>
.reasoning-section {
  background: var(--vscode-sideBar-background, transparent);
  border: 1px solid var(--vscode-panel-border);
  border-radius: 3px;
  margin-top: 16px;
  padding: 12px 14px;
}

.mode-panel-title {
  color: var(--vscode-foreground);
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 4px;
}

.field-hint {
  color: var(--vscode-descriptionForeground);
  font-size: 11px;
  margin: 0 0 10px;
}

.field-hint code {
  background: var(--vscode-textCodeBlock-background);
  border-radius: 2px;
  font-family: var(--vscode-editor-font-family, monospace);
  padding: 0 4px;
}

.reasoning-row {
  align-items: center;
  display: flex;
  gap: 10px;
  margin-bottom: 8px;
}

.reasoning-row:last-child {
  margin-bottom: 0;
}

.reasoning-label {
  color: var(--vscode-foreground);
  flex: 1;
  font-family: var(--vscode-editor-font-family, monospace);
  font-size: 12px;
  font-weight: 500;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reasoning-select {
  background: var(--vscode-input-background);
  border: 1px solid var(--vscode-input-border, transparent);
  border-radius: 2px;
  color: var(--vscode-input-foreground);
  flex: 0 0 auto;
  font-family: var(--vscode-font-family);
  font-size: 13px;
  padding: 4px 8px;
  width: 130px;
}

.reasoning-select:focus {
  border-color: var(--vscode-focusBorder);
  outline: 1px solid var(--vscode-focusBorder);
  outline-offset: -1px;
}
</style>
