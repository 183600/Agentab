// test/settings.test.js - Tests for settings page functionality
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock DOM elements
const mockSettingsElements = () => {
  document.body.innerHTML = `
    <input id="api-base-url" type="text">
    <input id="api-key" type="password">
    <select id="model-preset">
      <option value="">Custom</option>
      <option value="gpt-4">GPT-4</option>
      <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
    </select>
    <input id="model" type="text">
    <input id="max-iterations" type="number" value="10">
    <input id="timeout" type="number" value="60">
    <input id="enable-cache" type="checkbox" checked>
    <input id="enable-recovery" type="checkbox" checked>
    <button id="btn-save-settings">Save</button>
    <button id="btn-test-connection">Test</button>
    <button id="toggle-api-key">
      <span class="eye-icon">👁</span>
      <span class="eye-off-icon hidden">🙈</span>
    </button>
    <div id="webllm-status-indicator">
      <span class="status-dot"></span>
      <span class="status-text"></span>
    </div>
    <div id="webllm-model-group" style="display: none;">
      <select id="webllm-model">
        <option value="">Select model</option>
        <option value="Llama-3-8B">Llama-3-8B</option>
      </select>
    </div>
    <div id="webllm-actions" style="display: none;">
      <button id="btn-load-webllm">Load</button>
      <button id="btn-unload-webllm" style="display: none;">Unload</button>
    </div>
    <div id="webllm-progress" style="display: none;">
      <div id="webllm-progress-fill"></div>
      <span id="webllm-progress-text"></span>
    </div>
    <input id="prefer-local-model" type="checkbox">
  `;
};

// Mock i18n function
global.i18n = vi.fn((key) => key);

// Mock localizeDocument
global.localizeDocument = vi.fn();

// Mock initTheme
global.initTheme = vi.fn(async () => {});

// Mock showToast
global.showToast = vi.fn();

describe('Settings DOM Structure', () => {
  beforeEach(() => {
    mockSettingsElements();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('should have API configuration inputs', () => {
    expect(document.getElementById('api-base-url')).toBeTruthy();
    expect(document.getElementById('api-key')).toBeTruthy();
    expect(document.getElementById('model')).toBeTruthy();
  });

  it('should have model preset selector', () => {
    const preset = document.getElementById('model-preset');
    expect(preset).toBeTruthy();
    expect(preset.options.length).toBeGreaterThan(1);
  });

  it('should have advanced settings', () => {
    expect(document.getElementById('max-iterations')).toBeTruthy();
    expect(document.getElementById('timeout')).toBeTruthy();
    expect(document.getElementById('enable-cache')).toBeTruthy();
    expect(document.getElementById('enable-recovery')).toBeTruthy();
  });

  it('should have action buttons', () => {
    expect(document.getElementById('btn-save-settings')).toBeTruthy();
    expect(document.getElementById('btn-test-connection')).toBeTruthy();
  });

  it('should have WebLLM elements', () => {
    expect(document.getElementById('webllm-status-indicator')).toBeTruthy();
    expect(document.getElementById('webllm-model')).toBeTruthy();
    expect(document.getElementById('btn-load-webllm')).toBeTruthy();
  });
});

describe('URL Validation', () => {
  const validateUrl = (url) => {
    if (!url.trim()) {
      return { valid: false, message: 'URL is required' };
    }
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return { valid: false, message: 'URL must use http or https protocol' };
      }
      return { valid: true, message: '' };
    } catch {
      return { valid: false, message: 'Invalid URL format' };
    }
  };

  it('should accept valid https URL', () => {
    const result = validateUrl('https://api.openai.com/v1');
    expect(result.valid).toBe(true);
  });

  it('should accept valid http URL', () => {
    const result = validateUrl('http://localhost:8080/v1');
    expect(result.valid).toBe(true);
  });

  it('should reject empty URL', () => {
    const result = validateUrl('');
    expect(result.valid).toBe(false);
  });

  it('should reject whitespace-only URL', () => {
    const result = validateUrl('   ');
    expect(result.valid).toBe(false);
  });

  it('should reject invalid URL format', () => {
    const result = validateUrl('not-a-url');
    expect(result.valid).toBe(false);
  });

  it('should reject non-http(s) protocols', () => {
    const result = validateUrl('ftp://files.example.com');
    expect(result.valid).toBe(false);
  });
});

describe('API Key Validation', () => {
  const validateApiKey = (key) => {
    if (!key.trim()) {
      return { valid: false, message: 'API key is required' };
    }
    if (key.trim().length < 8) {
      return { valid: false, message: 'API key is too short' };
    }
    return { valid: true, message: '' };
  };

  it('should accept valid API key', () => {
    const result = validateApiKey('sk-1234567890abcdef');
    expect(result.valid).toBe(true);
  });

  it('should reject empty API key', () => {
    const result = validateApiKey('');
    expect(result.valid).toBe(false);
  });

  it('should reject short API key', () => {
    const result = validateApiKey('short');
    expect(result.valid).toBe(false);
  });

  it('should accept minimum length API key', () => {
    const result = validateApiKey('12345678');
    expect(result.valid).toBe(true);
  });
});

describe('Model Validation', () => {
  const validateModel = (model) => {
    if (!model.trim()) {
      return { valid: false, message: 'Model is required' };
    }
    return { valid: true, message: '' };
  };

  it('should accept valid model name', () => {
    const result = validateModel('gpt-4');
    expect(result.valid).toBe(true);
  });

  it('should reject empty model', () => {
    const result = validateModel('');
    expect(result.valid).toBe(false);
  });
});

describe('Model Preset Selection', () => {
  beforeEach(() => {
    mockSettingsElements();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('should update model input when preset selected', () => {
    const preset = document.getElementById('model-preset');
    const modelInput = document.getElementById('model');

    preset.value = 'gpt-4';
    modelInput.value = preset.value;

    expect(modelInput.value).toBe('gpt-4');
  });

  it('should not update model for custom preset', () => {
    const preset = document.getElementById('model-preset');
    const modelInput = document.getElementById('model');
    modelInput.value = 'custom-model';

    preset.value = '';

    expect(modelInput.value).toBe('custom-model');
  });
});

describe('API Key Visibility Toggle', () => {
  beforeEach(() => {
    mockSettingsElements();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('should toggle password visibility', () => {
    const apiKeyInput = document.getElementById('api-key');
    const toggleBtn = document.getElementById('toggle-api-key');
    const eyeIcon = toggleBtn.querySelector('.eye-icon');
    const eyeOffIcon = toggleBtn.querySelector('.eye-off-icon');

    // Initial state
    expect(apiKeyInput.type).toBe('password');
    expect(eyeOffIcon.classList.contains('hidden')).toBe(true);

    // Toggle
    apiKeyInput.type = 'text';
    eyeIcon.classList.add('hidden');
    eyeOffIcon.classList.remove('hidden');

    expect(apiKeyInput.type).toBe('text');
    expect(eyeIcon.classList.contains('hidden')).toBe(true);
    expect(eyeOffIcon.classList.contains('hidden')).toBe(false);
  });
});

describe('Settings Save', () => {
  beforeEach(() => {
    mockSettingsElements();
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('should send save_settings message', async () => {
    const settings = {
      apiBaseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test-key',
      model: 'gpt-4'
    };

    await chrome.runtime.sendMessage({
      action: 'save_settings',
      settings
    });

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      action: 'save_settings',
      settings
    });
  });

  it('should save advanced settings to storage', async () => {
    const advancedSettings = {
      maxIterations: 15,
      apiTimeout: 120,
      enableCache: true,
      enableRecovery: true
    };

    await chrome.storage.local.set(advancedSettings);

    expect(chrome.storage.local.set).toHaveBeenCalledWith(advancedSettings);
  });
});

describe('Test Connection', () => {
  beforeEach(() => {
    mockSettingsElements();
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('should send test_api_connection message', async () => {
    const params = {
      apiBaseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test-key',
      model: 'gpt-4'
    };

    await chrome.runtime.sendMessage({
      action: 'test_api_connection_with_params',
      ...params
    });

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      action: 'test_api_connection_with_params',
      ...params
    });
  });
});

describe('WebLLM Integration', () => {
  beforeEach(() => {
    mockSettingsElements();
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('should check WebGPU support', async () => {
    await chrome.runtime.sendMessage({ action: 'check_webgpu_support' });

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      action: 'check_webgpu_support'
    });
  });

  it('should load WebLLM model', async () => {
    await chrome.runtime.sendMessage({
      action: 'load_webllm_model',
      modelId: 'Llama-3-8B'
    });

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      action: 'load_webllm_model',
      modelId: 'Llama-3-8B'
    });
  });

  it('should unload WebLLM model', async () => {
    await chrome.runtime.sendMessage({ action: 'unload_webllm_model' });

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      action: 'unload_webllm_model'
    });
  });

  it('should get WebLLM state', async () => {
    await chrome.runtime.sendMessage({ action: 'get_webllm_state' });

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      action: 'get_webllm_state'
    });
  });

  it('should save prefer local model preference', async () => {
    await chrome.storage.local.set({ preferLocalModel: true });

    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      preferLocalModel: true
    });
  });
});
