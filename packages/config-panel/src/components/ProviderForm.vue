<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { onMessage, postMessage } from '../vscode-api';
import type { PanelState, ProviderOption, ExtensionMessage } from '../types/messages';

const props = defineProps<{
  state: PanelState;
  editingProviderId: string | null;
}>();

const emit = defineEmits<{
  close: [];
}>();

// ── Provider selection ─────────────────────────────────────────────

const selectedProviderId = ref('');

const currentProvider = computed<ProviderOption | undefined>(() =>
  props.state.providers.find((p) => p.id === selectedProviderId.value)
);

const supportsOAuth = computed(() =>
  currentProvider.value ? props.state.oauthProviderIds.includes(currentProvider.value.id) : false
);

const showsApiKeyFields = computed(() => Boolean(currentProvider.value && !supportsOAuth.value));

const oauthDisplayName = computed(() => {
  const p = currentProvider.value;
  return p?.oauthName ? `Authorize with ${p.oauthName}` : 'Authorize with OAuth';
});

// ── Form fields ────────────────────────────────────────────────────

const apiKey = ref('');
const envText = ref('');

const envPlaceholder = computed(() => {
  const p = currentProvider.value;
  if (!p) return 'KEY=value';
  const lines = [...p.apiKeyEnvVars, ...p.envHints]
    .filter((key, i, arr) => arr.indexOf(key) === i)
    .map((key) => `${key}=`);
  return lines.length ? lines.join('\n') : 'KEY=value';
});

// ── OAuth inline flow state ────────────────────────────────────────

type OAuthStep =
  | { type: 'idle' }
  | { type: 'authorizing' }
  | { type: 'authUrl'; url: string; instructions?: string }
  | { type: 'deviceCode'; userCode: string; verificationUri: string }
  | { type: 'prompt'; message: string; placeholder?: string; allowEmpty?: boolean }
  | { type: 'select'; message: string; options: { id: string; label: string }[] }
  | { type: 'manualCodeInput' }
  | { type: 'progress'; message: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

const oauthStep = ref<OAuthStep>({ type: 'idle' });
const oauthInput = ref('');

let oauthCleanup: (() => void) | null = null;

onMounted(() => {
  oauthCleanup = onMessage((message: ExtensionMessage) => {
    // Only process OAuth messages for the current provider
    if ('providerId' in message && message.providerId !== selectedProviderId.value) {
      return;
    }

    switch (message.type) {
      case 'oauthAuth':
        oauthStep.value = { type: 'authUrl', url: message.url, instructions: message.instructions };
        break;
      case 'oauthDeviceCode':
        oauthStep.value = {
          type: 'deviceCode',
          userCode: message.userCode,
          verificationUri: message.verificationUri
        };
        break;
      case 'oauthPrompt':
        oauthStep.value = {
          type: 'prompt',
          message: message.message,
          placeholder: message.placeholder,
          allowEmpty: message.allowEmpty
        };
        oauthInput.value = '';
        break;
      case 'oauthSelect':
        oauthStep.value = {
          type: 'select',
          message: message.message,
          options: message.options
        };
        break;
      case 'oauthManualCodeInput':
        oauthStep.value = { type: 'manualCodeInput' };
        oauthInput.value = '';
        break;
      case 'oauthProgress':
        oauthStep.value = { type: 'progress', message: message.message };
        break;
      case 'oauthDone':
        oauthStep.value = { type: 'done' };
        break;
      case 'error':
        oauthStep.value = { type: 'error', message: message.error };
        break;
    }
  });
});

onUnmounted(() => {
  oauthCleanup?.();
});

// ── Initialize for edit mode ───────────────────────────────────────

watch(
  () => props.editingProviderId,
  (id) => {
    if (id) {
      selectedProviderId.value = id;
      apiKey.value = '';
      envText.value = '';
      oauthStep.value = { type: 'idle' };
    } else {
      // Add mode — select first provider if none selected
      if (props.state.providers.length && !props.state.providers.find(p => p.id === selectedProviderId.value)) {
        selectedProviderId.value = props.state.providers[0].id;
      }
      apiKey.value = '';
      envText.value = '';
      oauthStep.value = { type: 'idle' };
    }
  },
  { immediate: true }
);

watch(selectedProviderId, () => {
  apiKey.value = '';
  envText.value = '';
  oauthInput.value = '';
  oauthStep.value = { type: 'idle' };
});

// ── Actions ────────────────────────────────────────────────────────

const isEditing = computed(() => props.editingProviderId !== null);

const editProvider = computed(() =>
  isEditing.value
    ? props.state.configured.find((c) => c.id === props.editingProviderId)
    : undefined
);

const modalTitle = computed(() =>
  isEditing.value ? `Edit Provider: ${currentProvider.value?.label ?? ''}` : 'Add New Provider'
);

const modeDescription = computed(() =>
  isEditing.value
    ? 'Modify the existing provider credentials. Saved models and provider identity stay unchanged.'
    : 'Choose a provider and add credentials before it becomes available to Pi Router.'
);

const primaryButtonText = computed(() => {
  if (supportsOAuth.value) {
    if (oauthStep.value.type === 'done') {
      return 'Done';
    }
    return isEditing.value ? 'Reauthorize Provider' : 'Authorize Provider';
  }

  return isEditing.value ? 'Update Provider' : 'Add Provider';
});

const canUsePrimaryAction = computed(() => {
  if (!currentProvider.value) {
    return false;
  }

  if (supportsOAuth.value) {
    return ['idle', 'error', 'done'].includes(oauthStep.value.type);
  }

  return Boolean(apiKey.value || envText.value);
});

function onSave() {
  if (!currentProvider.value) return;

  if (isEditing.value && !confirmDangerousAction('Update this provider credentials? Existing saved credentials for this provider will be overwritten.')) {
    return;
  }

  postMessage({
    type: 'saveApiKey',
    providerId: currentProvider.value.id,
    apiKey: apiKey.value,
    envText: envText.value
  });
  apiKey.value = '';
  emit('close');
}

function onPrimaryAction() {
  if (!currentProvider.value) return;

  if (supportsOAuth.value) {
    if (oauthStep.value.type === 'done') {
      emit('close');
      return;
    }
    onStartOAuth();
    return;
  }

  onSave();
}

function onStartOAuth() {
  if (!currentProvider.value) return;

  if (isEditing.value && !confirmDangerousAction('Reauthorize this provider? Existing OAuth credentials for this provider will be replaced.')) {
    return;
  }

  oauthStep.value = { type: 'authorizing' };
  postMessage({ type: 'loginOAuth', providerId: currentProvider.value.id });
}

function confirmDangerousAction(message: string): boolean {
  return window.confirm(message);
}

function onSubmitOAuthPrompt() {
  const value = oauthInput.value;
  if (!value && oauthStep.value.type === 'prompt' && !oauthStep.value.allowEmpty) {
    return;
  }
  postMessage({ type: 'oauthPromptResponse', value });
  oauthInput.value = '';
  oauthStep.value = { type: 'authorizing' };
}

function onSelectOAuthOption(id: string) {
  postMessage({ type: 'oauthSelectResponse', id });
  oauthStep.value = { type: 'authorizing' };
}

function onSubmitOAuthCode() {
  const value = oauthInput.value;
  if (!value) return;
  postMessage({ type: 'oauthManualCodeResponse', value });
  oauthInput.value = '';
  oauthStep.value = { type: 'authorizing' };
}

function onCancelOAuth() {
  oauthStep.value = { type: 'idle' };
}

function onCopyCode() {
  if (oauthStep.value.type === 'deviceCode') {
    navigator.clipboard.writeText(oauthStep.value.userCode);
  }
}

function onOpenUrl(url: string) {
  postMessage({ type: 'oauthOpenUrl', url });
}

function onBackdropClick(e: MouseEvent) {
  if ((e.target as HTMLElement).classList.contains('modal-backdrop')) {
    emit('close');
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    emit('close');
  }
}
</script>

<template>
  <div class="modal-backdrop" @click="onBackdropClick" @keydown="onKeydown">
    <div class="modal" :class="isEditing ? 'modal--edit' : 'modal--add'" role="dialog" aria-modal="true">
      <div class="modal-header">
        <div>
          <div class="mode-eyebrow">{{ isEditing ? 'Editing Existing Provider' : 'Creating Provider' }}</div>
          <h2>{{ modalTitle }}</h2>
          <p>{{ modeDescription }}</p>
        </div>
        <button class="btn-icon-only modal-close" title="Close" @click="emit('close')">✕</button>
      </div>

      <div class="modal-body">
        <!-- Provider selection (add mode) -->
        <div v-if="!isEditing" class="mode-panel mode-panel--add">
          <div class="mode-panel-title">New provider setup</div>
          <p>Select a provider first. The available authentication fields will update automatically.</p>
          <label for="providerSelect">Provider</label>
          <select id="providerSelect" v-model="selectedProviderId">
            <option
              v-for="p in state.providers"
              :key="p.id"
              :value="p.id"
            >
              {{ p.label }} ({{ p.modelCount }} models)
            </option>
          </select>
        </div>

        <!-- Current status (edit mode) -->
        <div v-if="isEditing && editProvider" class="current-status">
          <div class="mode-panel-title">Existing provider settings</div>
          <p>Update credentials for this configured provider without changing the provider selection.</p>
          <div class="status-row">
            <span class="status-label">Auth Type:</span>
            <span class="badge" :class="editProvider.authType">
              {{ editProvider.authType === 'oauth' ? 'OAuth' : 'API Key' }}
            </span>
          </div>
          <div class="status-row">
            <span class="status-label">Status:</span>
            <span class="status-value">
              {{ editProvider.authType === 'oauth' ? 'Authorized' : (editProvider.hasKey ? 'Key set' : 'No key set') }}
            </span>
          </div>
        </div>

        <!-- Provider info -->
        <div v-if="currentProvider" class="provider-info">
          <div class="info-line">
            <span class="info-label">{{ currentProvider.modelCount }} models</span>
          </div>
          <div v-if="showsApiKeyFields && currentProvider.apiKeyEnvVars.length" class="info-line">
            <span class="info-label">API key env:</span>
            <code>{{ currentProvider.apiKeyEnvVars.join(' or ') }}</code>
          </div>
          <div v-if="currentProvider.envHints.length" class="info-line">
            <span class="info-label">Env vars:</span>
            <code>{{ currentProvider.envHints.join(', ') }}</code>
          </div>
          <div class="sample-models">
            <span
              v-for="model in currentProvider.sampleModels"
              :key="model"
              class="model-tag"
            >{{ model }}</span>
          </div>
        </div>

        <!-- OAuth section -->
        <div v-if="supportsOAuth && currentProvider" class="oauth-section">
          <div v-if="oauthStep.type === 'idle'" class="oauth-idle">
            <p class="oauth-hint">Sign in with your {{ currentProvider.oauthName || currentProvider.label }} account to automatically obtain credentials.</p>
            <button class="btn btn-oauth" @click="onStartOAuth">
              {{ oauthDisplayName }}
            </button>
          </div>

          <div v-else-if="oauthStep.type === 'authorizing'" class="oauth-status">
            <span class="spinner"></span>
            Authorizing, please wait...
          </div>

          <div v-else-if="oauthStep.type === 'authUrl'" class="oauth-step">
            <p class="oauth-message">
              {{ oauthStep.instructions || 'Open the following URL in your browser to authorize:' }}
            </p>
            <div class="url-box" @click="onOpenUrl(oauthStep.url)">
              <code class="url-text">{{ oauthStep.url }}</code>
              <button class="btn btn-small" @click.stop="onOpenUrl(oauthStep.url)">Open in Browser</button>
            </div>
          </div>

          <div v-else-if="oauthStep.type === 'deviceCode'" class="oauth-step">
            <p class="oauth-message">Enter the following code on the verification page:</p>
            <div class="code-box">
              <code class="code-text">{{ oauthStep.userCode }}</code>
              <button class="btn btn-small" @click="onCopyCode">Copy</button>
            </div>
            <button class="btn btn-small btn-link" @click="onOpenUrl(oauthStep.verificationUri)">
              Open Verification Page
            </button>
          </div>

          <div v-else-if="oauthStep.type === 'prompt'" class="oauth-step">
            <label :for="'oauth-input'">{{ oauthStep.message }}</label>
            <input
              :id="'oauth-input'"
              v-model="oauthInput"
              type="text"
              :placeholder="oauthStep.placeholder"
              @keyup.enter="onSubmitOAuthPrompt"
            />
            <div class="oauth-actions">
              <button class="btn btn-primary" @click="onSubmitOAuthPrompt">Submit</button>
              <button class="btn btn-secondary" @click="onCancelOAuth">Cancel</button>
            </div>
          </div>

          <div v-else-if="oauthStep.type === 'select'" class="oauth-step">
            <p class="oauth-message">{{ oauthStep.message }}</p>
            <div class="select-options">
              <button
                v-for="opt in oauthStep.options"
                :key="opt.id"
                class="btn btn-secondary select-option"
                @click="onSelectOAuthOption(opt.id)"
              >{{ opt.label }}</button>
            </div>
            <button class="btn btn-small btn-link" @click="onCancelOAuth">Cancel</button>
          </div>

          <div v-else-if="oauthStep.type === 'manualCodeInput'" class="oauth-step">
            <label for="oauth-code-input">Paste the authorization code or full redirect URL:</label>
            <input
              id="oauth-code-input"
              v-model="oauthInput"
              type="text"
              placeholder="Paste code or URL here..."
              @keyup.enter="onSubmitOAuthCode"
            />
            <div class="oauth-actions">
              <button class="btn btn-primary" @click="onSubmitOAuthCode" :disabled="!oauthInput">Submit</button>
              <button class="btn btn-secondary" @click="onCancelOAuth">Cancel</button>
            </div>
          </div>

          <div v-else-if="oauthStep.type === 'progress'" class="oauth-status">
            <span class="spinner"></span>
            {{ oauthStep.message }}
          </div>

          <div v-else-if="oauthStep.type === 'done'" class="oauth-done">
            Authorization complete. Your credentials have been saved.
          </div>

          <div v-else-if="oauthStep.type === 'error'" class="oauth-error">
            Authorization failed: {{ oauthStep.message }}
            <button class="btn btn-small btn-link" @click="onCancelOAuth">Dismiss</button>
          </div>
        </div>

        <!-- API Key -->
        <div v-if="currentProvider && showsApiKeyFields" class="credentials-section">
          <label for="apiKey">API Key</label>
          <input
            id="apiKey"
            v-model="apiKey"
            type="password"
            autocomplete="off"
            :placeholder="isEditing && editProvider?.hasKey ? 'Leave blank to keep current key' : 'Paste API key'"
          />

          <label for="envText">Environment Variables</label>
          <textarea
            id="envText"
            v-model="envText"
            spellcheck="false"
            :placeholder="envPlaceholder"
          ></textarea>
          <p class="field-hint">One KEY=value per line. Lines starting with # are ignored.</p>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-secondary" @click="emit('close')">Cancel</button>
        <button
          class="btn btn-primary"
          :disabled="!canUsePrimaryAction"
          @click="onPrimaryAction"
        >{{ primaryButtonText }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  align-items: center;
  background: rgba(0, 0, 0, 0.38);
  display: flex;
  inset: 0;
  justify-content: center;
  padding: 16px;
  position: fixed;
  z-index: 1000;
}

.modal {
  animation: modalIn 0.12s ease-out;
  background: var(--vscode-editorWidget-background, var(--vscode-editor-background));
  border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
  border-radius: 4px;
  box-shadow: 0 8px 32px var(--vscode-widget-shadow, rgba(0, 0, 0, 0.35));
  color: var(--vscode-editorWidget-foreground, var(--vscode-foreground));
  display: flex;
  flex-direction: column;
  max-height: 90vh;
  max-width: 620px;
  width: 100%;
}

.modal--add {
  border-top: 3px solid var(--vscode-button-background);
}

.modal--edit {
  border-top: 3px solid var(--vscode-focusBorder);
}

@keyframes modalIn {
  from { opacity: 0; transform: scale(0.95) translateY(10px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.modal-header {
  align-items: flex-start;
  background: var(--vscode-sideBar-background, var(--vscode-editor-background));
  border-bottom: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
  display: flex;
  justify-content: space-between;
  padding: 16px 20px 14px;
}

.modal-header h2 {
  color: var(--vscode-foreground);
  font-size: 16px;
  font-weight: 600;
  margin: 0;
}

.modal-header p {
  color: var(--vscode-descriptionForeground);
  font-size: 12px;
  margin: 6px 0 0;
}

.mode-eyebrow {
  color: var(--vscode-descriptionForeground);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  margin-bottom: 4px;
  text-transform: uppercase;
}

.modal-close {
  font-size: 18px;
  margin-left: 16px;
}

.modal-body {
  overflow-y: auto;
  padding: 18px 20px;
}

.modal-footer {
  background: var(--vscode-sideBar-background, var(--vscode-editor-background));
  border-top: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding: 12px 20px;
}

/* ── Shared ──────────────────────────────────────────────────────── */

label {
  color: var(--vscode-foreground);
  display: block;
  font-weight: 600;
  margin: 14px 0 5px;
  font-size: 12px;
}

select,
input,
textarea {
  background: var(--vscode-input-background);
  border: 1px solid var(--vscode-input-border, transparent);
  border-radius: 2px;
  box-sizing: border-box;
  color: var(--vscode-input-foreground);
  font-family: var(--vscode-font-family);
  font-size: 13px;
  line-height: 18px;
  padding: 6px 8px;
  width: 100%;
}

select:focus,
input:focus,
textarea:focus {
  border-color: var(--vscode-focusBorder);
  outline: 1px solid var(--vscode-focusBorder);
  outline-offset: -1px;
}

textarea {
  min-height: 92px;
  resize: vertical;
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
}

.btn:hover {
  opacity: 1;
}

.btn:disabled {
  cursor: default;
  opacity: 0.45;
}

.btn-primary {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
}

.btn-primary:hover:not(:disabled) {
  background: var(--vscode-button-hoverBackground);
}

.btn-secondary {
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
}

.btn-secondary:hover:not(:disabled) {
  background: var(--vscode-button-secondaryHoverBackground);
}

.btn:focus-visible,
.btn-icon-only:focus-visible {
  outline: 1px solid var(--vscode-focusBorder);
  outline-offset: 2px;
}

.btn-small {
  font-size: 12px;
  padding: 5px 10px;
}

.btn-oauth {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  justify-content: center;
  width: 100%;
}

.btn-oauth:hover:not(:disabled) {
  background: var(--vscode-button-hoverBackground);
}

.btn-link {
  background: transparent;
  color: var(--vscode-textLink-foreground);
  padding: 4px 0;
}

.btn-link:hover {
  color: var(--vscode-textLink-activeForeground);
  opacity: 1;
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

.field-hint {
  color: var(--vscode-descriptionForeground);
  font-size: 11px;
  margin: 4px 0 0;
}

/* ── Mode panels ─────────────────────────────────────────────────── */

.mode-panel,
.current-status {
  background: var(--vscode-editorWidget-background, var(--vscode-editor-background));
  border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
  border-left-width: 3px;
  border-radius: 3px;
  margin-bottom: 14px;
  padding: 12px 14px;
}

.mode-panel--add {
  border-left-color: var(--vscode-button-background);
}

.current-status {
  border-left-color: var(--vscode-focusBorder);
}

.mode-panel-title {
  color: var(--vscode-foreground);
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 4px;
}

.mode-panel p,
.current-status p {
  color: var(--vscode-descriptionForeground);
  font-size: 12px;
  margin: 0 0 10px;
}

/* ── Current status (edit mode) ──────────────────────────────────── */

.current-status {
  margin-bottom: 14px;
}

.status-row {
  align-items: center;
  display: flex;
  gap: 8px;
  margin-bottom: 4px;
}

.status-row:last-child {
  margin-bottom: 0;
}

.status-label {
  color: var(--vscode-descriptionForeground);
  font-size: 12px;
  min-width: 70px;
}

.status-value {
  font-size: 13px;
  font-weight: 500;
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

/* ── Provider info ────────────────────────────────────────────────── */

.provider-info {
  background: var(--vscode-sideBar-background, transparent);
  border: 1px solid var(--vscode-panel-border);
  border-radius: 3px;
  margin-top: 12px;
  padding: 10px 12px;
}

.info-line {
  align-items: center;
  color: var(--vscode-descriptionForeground);
  display: flex;
  flex-wrap: wrap;
  font-size: 12px;
  gap: 6px;
  margin-bottom: 4px;
}

.info-label {
  color: var(--vscode-descriptionForeground);
}

.info-line code {
  background: var(--vscode-textCodeBlock-background);
  border-radius: 2px;
  font-family: var(--vscode-editor-font-family, monospace);
  font-size: 11px;
  padding: 1px 5px;
}

.sample-models {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
}

.model-tag {
  background: var(--vscode-badge-background);
  border-radius: 2px;
  color: var(--vscode-badge-foreground);
  font-family: var(--vscode-editor-font-family, monospace);
  font-size: 11px;
  padding: 2px 7px;
}

/* ── OAuth section ───────────────────────────────────────────────── */

.oauth-section {
  background: var(--vscode-input-background);
  border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
  border-radius: 3px;
  margin-top: 16px;
  padding: 16px;
}

.oauth-hint {
  color: var(--vscode-descriptionForeground);
  font-size: 13px;
  margin: 0 0 12px;
}

.oauth-idle {
  text-align: center;
}

.oauth-status {
  align-items: center;
  color: var(--vscode-descriptionForeground);
  display: flex;
  font-size: 13px;
  gap: 10px;
  justify-content: center;
  padding: 8px 0;
}

.spinner {
  animation: spin 0.8s linear infinite;
  border: 2px solid var(--vscode-panel-border);
  border-radius: 50%;
  border-top-color: var(--vscode-focusBorder);
  display: inline-block;
  height: 18px;
  width: 18px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.oauth-step {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.oauth-message {
  font-size: 13px;
  margin: 0;
}

.url-box {
  align-items: center;
  background: var(--vscode-input-background);
  border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
  border-radius: 2px;
  cursor: pointer;
  display: flex;
  gap: 8px;
  justify-content: space-between;
  padding: 10px 12px;
  word-break: break-all;
}

.url-text {
  color: var(--vscode-textLink-foreground);
  font-family: var(--vscode-editor-font-family, monospace);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.code-box {
  align-items: center;
  background: var(--vscode-textCodeBlock-background);
  border: 1px solid var(--vscode-panel-border);
  border-radius: 3px;
  display: flex;
  gap: 12px;
  justify-content: center;
  padding: 16px;
}

.code-text {
  font-family: var(--vscode-editor-font-family, monospace);
  font-size: 24px;
  font-weight: 700;
  letter-spacing: 4px;
  user-select: all;
}

.select-options {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.select-option {
  justify-content: flex-start;
}

.oauth-actions {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}

.oauth-done {
  align-items: center;
  color: var(--vscode-terminal-ansiGreen);
  display: flex;
  font-size: 13px;
  font-weight: 500;
  justify-content: center;
  padding: 8px 0;
}

.oauth-error {
  color: var(--vscode-inputValidation-errorForeground);
  font-size: 13px;
}

</style>
