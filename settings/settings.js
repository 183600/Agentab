// settings/settings.js

document.addEventListener('DOMContentLoaded', async () => {
  // Localize document
  localizeDocument();

  // === Theme ===
  await initTheme();

  // === Elements ===
  const apiBaseUrlInput = document.getElementById('api-base-url');
  const apiKeyInput = document.getElementById('api-key');
  const modelInput = document.getElementById('model');
  const btnSaveSettings = document.getElementById('btn-save-settings');
  const btnTestConnection = document.getElementById('btn-test-connection');
  const toggleApiKey = document.getElementById('toggle-api-key');
  const eyeIcon = toggleApiKey.querySelector('.eye-icon');
  const eyeOffIcon = toggleApiKey.querySelector('.eye-off-icon');

  // === Load Settings ===
  async function loadSettings() {
    const response = await chrome.runtime.sendMessage({ action: 'get_settings' });
    if (response.success) {
      apiBaseUrlInput.value = response.settings.apiBaseUrl || '';
      apiKeyInput.value = response.settings.apiKey || '';
      modelInput.value = response.settings.model || '';
    }
  }

  loadSettings();

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
      const response = await chrome.runtime.sendMessage({
        action: 'save_settings',
        settings: {
          apiBaseUrl,
          apiKey,
          model
        }
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
      const response = await fetch(`${apiBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model,
          messages: [{ role: 'user', content: 'Hello' }],
          max_tokens: 5
        })
      });

      if (response.ok) {
        showToast(i18n('connectionSuccess'), 'success');
      } else {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData.error?.message || response.statusText;
        showToast(i18n('connectionFailed', [errorMsg]), 'error');
      }
    } catch (e) {
      showToast(i18n('connectionFailed', [e.message]), 'error');
    } finally {
      btnTestConnection.disabled = false;
      btnTestConnection.innerHTML = originalContent;
    }
  });
});
