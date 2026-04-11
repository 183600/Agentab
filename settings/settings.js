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
        return {
          valid: false,
          message: i18n('invalidUrlProtocol') || 'URL 必须使用 http 或 https 协议'
        };
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
      const advancedSettings = await chrome.storage.local.get([
        'maxIterations',
        'apiTimeout',
        'enableCache',
        'enableRecovery'
      ]);
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

  // === WebLLM Local Model Support ===
  const webllmStatusIndicator = document.getElementById('webllm-status-indicator');
  const webllmModelGroup = document.getElementById('webllm-model-group');
  const webllmActions = document.getElementById('webllm-actions');
  const webllmModelSelect = document.getElementById('webllm-model');
  const btnLoadWebLLM = document.getElementById('btn-load-webllm');
  const btnUnloadWebLLM = document.getElementById('btn-unload-webllm');
  const webllmProgress = document.getElementById('webllm-progress');
  const webllmProgressFill = document.getElementById('webllm-progress-fill');
  const webllmProgressText = document.getElementById('webllm-progress-text');
  const preferLocalModelCheckbox = document.getElementById('prefer-local-model');

  /**
   * Update WebLLM status display
   */
  function updateWebLLMStatus(status, text, isError = false) {
    const statusDot = webllmStatusIndicator.querySelector('.status-dot');
    const statusText = webllmStatusIndicator.querySelector('.status-text');

    statusDot.className = 'status-dot';
    if (status === 'supported') {
      statusDot.classList.add('supported');
    } else if (status === 'unsupported' || isError) {
      statusDot.classList.add('unsupported');
    } else if (status === 'loading') {
      statusDot.classList.add('loading');
    } else if (status === 'ready') {
      statusDot.classList.add('ready');
    }

    statusText.textContent = text;
  }

  /**
   * Check WebGPU support and initialize WebLLM UI
   */
  async function initWebLLM() {
    try {
      // Check if WebGPU is supported
      const response = await chrome.runtime.sendMessage({ action: 'check_webgpu_support' });

      if (response.supported) {
        updateWebLLMStatus('supported', i18n('webGPUSupported') || 'WebGPU 已支持');
        webllmModelGroup.style.display = 'block';
        webllmActions.style.display = 'block';
        btnLoadWebLLM.disabled = false;

        // Check if a model is already loaded
        const stateResponse = await chrome.runtime.sendMessage({ action: 'get_webllm_state' });
        if (stateResponse.state === 'ready') {
          updateWebLLMStatus('ready', `${i18n('modelLoaded') || '模型已加载'}: ${stateResponse.model}`);
          btnLoadWebLLM.style.display = 'none';
          btnUnloadWebLLM.style.display = 'inline-flex';
          webllmModelSelect.value = stateResponse.model;
        }

        // Load saved preference
        const settings = await chrome.storage.local.get('preferLocalModel');
        preferLocalModelCheckbox.checked = settings.preferLocalModel || false;
      } else {
        updateWebLLMStatus('unsupported', response.reason || (i18n('webGPUNotSupported') || 'WebGPU 不支持'));
      }
    } catch (error) {
      updateWebLLMStatus('unsupported', `${i18n('webGPUCheckFailed') || 'WebGPU 检查失败'}: ${error.message}`, true);
    }
  }

  // Initialize WebLLM
  initWebLLM();

  // Model selection change
  webllmModelSelect.addEventListener('change', () => {
    btnLoadWebLLM.disabled = !webllmModelSelect.value;
  });

  // Load model button
  btnLoadWebLLM.addEventListener('click', async () => {
    const modelId = webllmModelSelect.value;
    if (!modelId) return;

    btnLoadWebLLM.disabled = true;
    webllmProgress.style.display = 'flex';
    updateWebLLMStatus('loading', i18n('loadingModel') || '正在加载模型...');

    try {
      // Listen for progress updates
      const progressListener = message => {
        if (message.action === 'webllm_progress') {
          const progress = message.progress;
          webllmProgressFill.style.width = `${progress}%`;
          webllmProgressText.textContent = `${Math.round(progress)}%`;
        }
      };
      chrome.runtime.onMessage.addListener(progressListener);

      const response = await chrome.runtime.sendMessage({
        action: 'load_webllm_model',
        modelId
      });

      chrome.runtime.onMessage.removeListener(progressListener);

      if (response.success) {
        updateWebLLMStatus('ready', `${i18n('modelLoaded') || '模型已加载'}: ${modelId}`);
        btnLoadWebLLM.style.display = 'none';
        btnUnloadWebLLM.style.display = 'inline-flex';
        showToast(i18n('modelLoadSuccess') || '模型加载成功', 'success');
      } else {
        throw new Error(response.error || 'Unknown error');
      }
    } catch (error) {
      updateWebLLMStatus('unsupported', `${i18n('modelLoadFailed') || '模型加载失败'}: ${error.message}`, true);
      showToast(`${i18n('modelLoadFailed') || '模型加载失败'}: ${error.message}`, 'error');
    } finally {
      btnLoadWebLLM.disabled = false;
      webllmProgress.style.display = 'none';
    }
  });

  // Unload model button
  btnUnloadWebLLM.addEventListener('click', async () => {
    btnUnloadWebLLM.disabled = true;

    try {
      const response = await chrome.runtime.sendMessage({ action: 'unload_webllm_model' });

      if (response.success) {
        updateWebLLMStatus('supported', i18n('webGPUSupported') || 'WebGPU 已支持');
        btnLoadWebLLM.style.display = 'inline-flex';
        btnUnloadWebLLM.style.display = 'none';
        showToast(i18n('modelUnloaded') || '模型已卸载', 'success');
      }
    } catch (error) {
      showToast(`${i18n('error') || '错误'}: ${error.message}`, 'error');
    } finally {
      btnUnloadWebLLM.disabled = false;
    }
  });

  // Save prefer local model preference
  preferLocalModelCheckbox.addEventListener('change', async () => {
    await chrome.storage.local.set({ preferLocalModel: preferLocalModelCheckbox.checked });
  });
});
