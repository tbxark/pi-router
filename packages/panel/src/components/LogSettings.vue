<script setup lang="ts">
import { postMessage } from '../vscode-api';
import type { LogLevel } from '@pi-router/messages';

const props = defineProps<{
  level: LogLevel;
}>();

const LEVEL_LABELS: Record<LogLevel, string> = {
  off: 'Off',
  error: 'Error',
  info: 'Info',
  debug: 'Debug'
};

const LEVEL_HINTS: Record<LogLevel, string> = {
  off: 'Disable Pi Router output logging.',
  error: 'Log only request failures.',
  info: 'Log request and response summaries.',
  debug: 'Log summaries plus verbose diagnostic details.'
};

function onChange(event: Event): void {
  const level = (event.target as HTMLSelectElement).value as LogLevel;
  postMessage({ type: 'saveLogLevel', level });
}
</script>

<template>
  <section class="log-settings" aria-label="Log settings">
    <div>
      <div class="log-title">Logging</div>
      <p>{{ LEVEL_HINTS[props.level] }}</p>
    </div>
    <label class="log-select-label" for="log-level">Log level</label>
    <select id="log-level" :value="props.level" class="log-select" @change="onChange">
      <option v-for="(label, value) in LEVEL_LABELS" :key="value" :value="value">
        {{ label }}
      </option>
    </select>
  </section>
</template>

<style scoped>
.log-settings {
  align-items: center;
  background: var(--vscode-sideBar-background, transparent);
  border: 1px solid var(--vscode-panel-border);
  border-radius: 3px;
  display: flex;
  gap: 12px;
  justify-content: space-between;
  margin-bottom: 16px;
  padding: 12px 14px;
}

.log-title {
  color: var(--vscode-foreground);
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 3px;
}

.log-settings p {
  color: var(--vscode-descriptionForeground);
  font-size: 12px;
  margin: 0;
}

.log-select-label {
  height: 1px;
  margin: -1px;
  overflow: hidden;
  position: absolute;
  width: 1px;
}

.log-select {
  background: var(--vscode-input-background);
  border: 1px solid var(--vscode-input-border, transparent);
  border-radius: 2px;
  color: var(--vscode-input-foreground);
  flex: 0 0 auto;
  font-family: var(--vscode-font-family);
  font-size: 13px;
  padding: 4px 8px;
  width: 120px;
}

.log-select:focus {
  border-color: var(--vscode-focusBorder);
  outline: 1px solid var(--vscode-focusBorder);
  outline-offset: -1px;
}

@media (max-width: 520px) {
  .log-settings {
    align-items: stretch;
    flex-direction: column;
  }

  .log-select {
    width: 100%;
  }
}
</style>
