// settings/settings.js

document.addEventListener('DOMContentLoaded', async () => {
  // Localize document
  localizeDocument();

  // === Theme ===
  await initTheme();

  // === Elements ===
  const apiBaseUrlInput = document.getElementById('api-base-url');
  const apiKeyInput = document.getElementById('api-key');
  const modelPresetSelect = document.getElementById('model-preset');
  const modelInput = document.getElementById('model');
  const maxIterationsInput = document.getElementById('max-iterations');
  const timeoutInput = document.getElementById('timeout');
  const enableCacheCheckbox = document.getElementById('enable-cache');
  const enableRecoveryCheckbox = document.getElementById('enable-recovery');
  const btnSaveSettings = document.getElementById('btn-save-settings');
  const btnTestConnection = document.getElementById('btn-test-connection');
  const toggleApiKey = document.getElementById('toggle-api-key');
  const eyeIcon = toggleApiKey.querySelector('.eye-icon');
  const eyeOffIcon = toggleApiKey.querySelector('.eye-off-icon');

  // === Inline Validation ===

  /**
   * Show validation feedback on an input
   * @param {HTMLInputElement} input - Input element
   * @param {boolean} valid - Whether input is valid
   * @param {string} message - Validation message (empty if valid)
   */
  function showValidation(input, valid, message = '') {
    const formGroup = input.closest('.form-group');
    let feedbackEl = formGroup.querySelector('.validation-feedback');

    if (!feedbackEl) {
      feedbackEl = document.createElement('div');
      feedbackEl.className = 'validation-feedback';
      formGroup.appendChild(feedbackEl);
    }

    if (valid) {
      input.classList.remove('invalid');
      input.classList.add('valid');
      feedbackEl.textContent = '';
      feedbackEl.classList.remove('visible');
    } else {
      input.classList.remove('valid');
      input.classList.add('invalid');
      feedbackEl.textContent = message;
      feedbackEl.classList.add('visible');
    }
  }

  /**
   * Clear validation state
   * @param {HTMLInputElement} input - Input element
   */
  function clearValidation(input) {
    input.classList.remove('valid', 'invalid');
    const formGroup = input.closest('.form-group');
    const feedbackEl = formGroup.querySelector('.validation-feedback');
    if (feedbackEl) {
      feedbackEl.classList.remove('visible');
    }
  }

  /**
   * Validate URL format
   * @param {string} url - URL to validate
   * @returns {{valid: boolean, message: string}}
   */
  function validateUrl(url) {
    if (!url.trim()) {
      return { valid: false, message: i18n('apiBaseUrlRequired') };
    }
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return { valid: false, message: i18n('invalidUrlProtocol') || 'URL 必须使用 http 或 https 协议' };
      }
      return { valid: true, message: '' };
    } catch {
      return { valid: false, message: i18n('invalidUrlFormat') || '无效的 URL 格式' };
    }
  }

  /**
   * Validate API key format
   * @param {string} key - API key to validate
   * @returns {{valid: boolean, message: string}}
   */
  function validateApiKey(key) {
    if (!key.trim()) {
      return { valid: false, message: i18n('apiKeyRequired') };
    }
    if (key.trim().length < 8) {
      return { valid: false, message: i18n('apiKeyTooShort') || 'API 密钥太短' };
    }
    return { valid: true, message: '' };
  }

  /**
   * Validate model name
   * @param {string} model - Model name to validate
   * @returns {{valid: boolean, message: string}}
   */
  function validateModel(model) {
    if (!model.trim()) {
      return { valid: false, message: i18n('modelRequired') };
    }
    return { valid: true, message: '' };
  }

  // Setup debounced validation
  let validationTimeout;
  function debounceValidation(fn, delay = 300) {
    clearTimeout(validationTimeout);
    validationTimeout = setTimeout(fn, delay);
  }

  // Add input listeners for inline validation
  apiBaseUrlInput.addEventListener('input', () => {
    debounceValidation(() => {
      const result = validateUrl(apiBaseUrlInput.value);
      showValidation(apiBaseUrlInput, result.valid, result.message);
    });
  });

  apiKeyInput.addEventListener('input', () => {
    debounceValidation(() => {
      const result = validateApiKey(apiKeyInput.value);
      showValidation(apiKeyInput, result.valid, result.message);
    });
  });

  modelInput.addEventListener('input', () => {
    debounceValidation(() => {
      const result = validateModel(modelInput.value);
      showValidation(modelInput, result.valid, result.message);
    });
  });

  // Clear validation on focus
  [apiBaseUrlInput, apiKeyInput, modelInput].forEach(input => {
    input.addEventListener('focus', () => clearValidation(input));
  });

  // === Load Settings ===
  async function loadSettings() {
    const response = await chrome.runtime.sendMessage({ action: 'get_settings' });
    if (response.success) {
      apiBaseUrlInput.value = response.settings.apiBaseUrl || '';
      apiKeyInput.value = response.settings.apiKey || '';
      modelInput.value = response.settings.model || '';

      // Update preset selector
      updatePresetFromModel(response.settings.model);

      // Load advanced settings from storage
      const advancedSettings = await chrome.storage.local.get(['maxIterations', 'apiTimeout', 'enableCache', 'enableRecovery']);
      maxIterationsInput.value = advancedSettings.maxIterations || 10;
      timeoutInput.value = advancedSettings.apiTimeout || 60;
      enableCacheCheckbox.checked = advancedSettings.enableCache !== false;
      enableRecoveryCheckbox.checked = advancedSettings.enableRecovery !== false;
    }
  }

  // Update preset selector based on model
  function updatePresetFromModel(model) {
    if (!model) return;

    const options = modelPresetSelect.options;
    for (let i = 0; i < options.length; i++) {
      if (options[i].value === model) {
        modelPresetSelect.value = model;
        return;
      }
    }
    // If not found in presets, set to custom
    modelPresetSelect.value = '';
  }

  loadSettings();

  // === Model Preset Change ===
  modelPresetSelect.addEventListener('change', () => {
    const selectedModel = modelPresetSelect.value;
    if (selectedModel) {
      modelInput.value = selectedModel;
    }
  });

  // === Model Input Change ===
  modelInput.addEventListener('input', () => {
    updatePresetFromModel(modelInput.value);
  });

  // === Toggle API Key Visibility ===
  toggleApiKey.addEventListener('click', () => {
    const isPassword = apiKeyInput.type === 'password';
    apiKeyInput.type = isPassword ? 'text' : 'password';
    eyeIcon.classList.toggle('hidden', isPassword);
    eyeOffIcon.classList.toggle('hidden', !isPassword);
  });

  // === Save Settings ===
  btnSaveSettings.addEventListener('click', async () => {
    const apiBaseUrl = apiBaseUrlInput.value.trim();
    const apiKey = apiKeyInput.value.trim();
    const model = modelInput.value.trim();
    const maxIterations = parseInt(maxIterationsInput.value) || 10;
    const apiTimeout = parseInt(timeoutInput.value) || 60;
    const enableCache = enableCacheCheckbox.checked;
    const enableRecovery = enableRecoveryCheckbox.checked;

    if (!apiBaseUrl) {
      showToast(i18n('apiBaseUrlRequired'), 'error');
      apiBaseUrlInput.focus();
      return;
    }

    if (!apiKey) {
      showToast(i18n('apiKeyRequired'), 'error');
      apiKeyInput.focus();
      return;
    }

    if (!model) {
      showToast(i18n('modelRequired'), 'error');
      modelInput.focus();
      return;
    }

    btnSaveSettings.disabled = true;
    const originalContent = btnSaveSettings.innerHTML;
    btnSaveSettings.innerHTML = `<div class="spinner"></div><span>${i18n('saving')}</span>`;

    try {
      // Save API settings
      const response = await chrome.runtime.sendMessage({
        action: 'save_settings',
        settings: {
          apiBaseUrl,
          apiKey,
          model
        }
      });

      // Save advanced settings
      await chrome.storage.local.set({
        maxIterations,
        apiTimeout,
        enableCache,
        enableRecovery
      });

      if (response.success) {
        showToast(i18n('settingsSaved'), 'success');
      } else {
        showToast(i18n('settingsSaveFailed'), 'error');
      }
    } catch (e) {
      showToast(`${i18n('error')}: ${e.message}`, 'error');
    } finally {
      btnSaveSettings.disabled = false;
      btnSaveSettings.innerHTML = originalContent;
    }
  });

  // === Test Connection ===
  btnTestConnection.addEventListener('click', async () => {
    const apiBaseUrl = apiBaseUrlInput.value.trim();
    const apiKey = apiKeyInput.value.trim();
    const model = modelInput.value.trim();

    if (!apiBaseUrl || !apiKey || !model) {
      showToast(i18n('fillAllFields'), 'error');
      return;
    }

    btnTestConnection.disabled = true;
    const originalContent = btnTestConnection.innerHTML;
    btnTestConnection.innerHTML = `<div class="spinner"></div><span>${i18n('testing')}</span>`;

    try {
      // Use secure background script for API testing (prevents key exposure)
      const response = await chrome.runtime.sendMessage({
        action: 'test_api_connection_with_params',
        apiBaseUrl,
        apiKey,
        model
      });

      if (response.success) {
        showToast(i18n('connectionSuccess'), 'success');
      } else {
        showToast(i18n('connectionFailed', [response.error || 'Unknown error']), 'error');
      }
    } catch (e) {
      showToast(i18n('connectionFailed', [e.message]), 'error');
    } finally {
      btnTestConnection.disabled = false;
      btnTestConnection.innerHTML = originalContent;
    }
  });
});
