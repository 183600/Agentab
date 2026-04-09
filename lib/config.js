// lib/config.js - Application configuration and settings management

import { StorageManager } from './storage.js';

/**
 * AppConfig - Application configuration
 */
export const AppConfig = {
  // API Configuration
  api: {
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
    timeout: 60000,
    maxRetries: 3,
    retryDelay: 1000
  },

  // Agent Configuration
  agent: {
    maxIterations: 10,
    executionTimeout: 30000
  },

  // Storage Configuration
  storage: {
    maxTasks: 500,
    maxHistoryEntries: 100,
    maxCodeSize: 100000
  },

  // UI Configuration
  ui: {
    defaultTheme: 'light',
    animationEnabled: true,
    syntaxHighlightEnabled: true
  },

  // Cache Configuration
  cache: {
    pageAnalysisTTL: 5000,
    maxCacheSize: 50
  },

  // Logging Configuration
  logging: {
    level: 'INFO',
    persistLogs: true,
    maxLogEntries: 100
  }
};

/**
 * SettingsManager - User settings management
 */
export class SettingsManager {
  /**
   * Get all settings
   * @returns {Promise<Object>}
   */
  static async getAll() {
    const result = await chrome.storage.local.get('settings');
    return result.settings || {};
  }

  /**
   * Get a specific setting
   * @param {string} key - Setting key (supports dot notation)
   * @param {any} defaultValue - Default value if not found
   * @returns {Promise<any>}
   */
  static async get(key, defaultValue = null) {
    const settings = await this.getAll();
    const parts = key.split('.');
    let value = settings;

    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
      } else {
        return defaultValue;
      }
    }

    return value;
  }

  /**
   * Set a specific setting
   * @param {string} key - Setting key (supports dot notation)
   * @param {any} value - Value to set
   */
  static async set(key, value) {
    const settings = await this.getAll();
    const parts = key.split('.');
    let current = settings;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in current)) {
        current[part] = {};
      }
      current = current[part];
    }

    current[parts[parts.length - 1]] = value;
    await chrome.storage.local.set({ settings });
  }

  /**
   * Update multiple settings at once
   * @param {Object} updates - Settings to update
   */
  static async update(updates) {
    const settings = await this.getAll();
    const merged = this.deepMerge(settings, updates);
    await chrome.storage.local.set({ settings: merged });
  }

  /**
   * Deep merge objects
   * @param {Object} target
   * @param {Object} source
   * @returns {Object}
   */
  static deepMerge(target, source) {
    const result = { ...target };

    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }

    return result;
  }

  /**
   * Reset settings to defaults
   */
  static async reset() {
    await chrome.storage.local.remove('settings');
  }

  /**
   * Validate API URL
   * @param {string} url - URL to validate
   * @returns {{valid: boolean, error?: string, normalized?: string}}
   */
  static validateApiUrl(url) {
    if (!url || typeof url !== 'string') {
      return { valid: false, error: 'URL is required' };
    }

    // Trim and normalize
    let normalized = url.trim();

    // Remove trailing slash
    normalized = normalized.replace(/\/+$/, '');

    // Check for valid URL format
    try {
      const parsed = new URL(normalized);

      // Only allow http and https
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return { valid: false, error: 'Only HTTP and HTTPS URLs are allowed' };
      }

      // Warn about localhost (for development)
      if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
        return {
          valid: true,
          normalized,
          warning: 'Using localhost - only for development'
        };
      }

      return { valid: true, normalized };
    } catch (error) {
      return { valid: false, error: 'Invalid URL format' };
    }
  }

  /**
   * Validate API key
   * @param {string} key - API key to validate
   * @returns {{valid: boolean, error?: string}}
   */
  static validateApiKey(key) {
    if (!key || typeof key !== 'string') {
      return { valid: false, error: 'API key is required' };
    }

    const trimmed = key.trim();

    // Check minimum length (most API keys are at least 20 chars)
    if (trimmed.length < 20) {
      return { valid: false, error: 'API key seems too short' };
    }

    // Check for common patterns
    // OpenAI keys start with sk-
    // Azure keys are longer
    // Local APIs may have custom formats

    // Warn about placeholder values
    const placeholders = ['your-api-key', 'xxx', 'test', 'placeholder', 'sk-xxx'];
    if (placeholders.some(p => trimmed.toLowerCase().includes(p))) {
      return { valid: false, error: 'Please enter a valid API key' };
    }

    return { valid: true };
  }

  /**
   * Validate model name
   * @param {string} model - Model name to validate
   * @returns {{valid: boolean, error?: string}}
   */
  static validateModel(model) {
    if (!model || typeof model !== 'string') {
      return { valid: false, error: 'Model name is required' };
    }

    const trimmed = model.trim();

    // Check for reasonable length
    if (trimmed.length < 2 || trimmed.length > 100) {
      return { valid: false, error: 'Invalid model name length' };
    }

    // Check for valid characters (alphanumeric, dash, dot, slash)
    if (!/^[a-zA-Z0-9\-./_:]+$/.test(trimmed)) {
      return { valid: false, error: 'Model name contains invalid characters' };
    }

    return { valid: true };
  }

  /**
   * Validate and normalize all API settings
   * @param {Object} settings - Settings to validate
   * @returns {{valid: boolean, errors: Object, warnings: Object, normalized: Object}}
   */
  static validateApiSettings(settings) {
    const result = {
      valid: true,
      errors: {},
      warnings: {},
      normalized: {}
    };

    // Validate API key
    if (settings.apiKey !== undefined) {
      const keyResult = this.validateApiKey(settings.apiKey);
      if (!keyResult.valid) {
        result.valid = false;
        result.errors.apiKey = keyResult.error;
      } else {
        result.normalized.apiKey = settings.apiKey.trim();
      }
    }

    // Validate URL
    if (settings.baseUrl !== undefined) {
      const urlResult = this.validateApiUrl(settings.baseUrl);
      if (!urlResult.valid) {
        result.valid = false;
        result.errors.baseUrl = urlResult.error;
      } else {
        result.normalized.baseUrl = urlResult.normalized;
        if (urlResult.warning) {
          result.warnings.baseUrl = urlResult.warning;
        }
      }
    }

    // Validate model
    if (settings.model !== undefined) {
      const modelResult = this.validateModel(settings.model);
      if (!modelResult.valid) {
        result.valid = false;
        result.errors.model = modelResult.error;
      } else {
        result.normalized.model = settings.model.trim();
      }
    }

    return result;
  }

  /**
   * Get API configuration with validation
   * @returns {Promise<Object>}
   */
  static async getApiConfig() {
    const [apiKey, baseUrl, model] = await Promise.all([
      StorageManager.getApiKey(),
      StorageManager.getApiBaseUrl(),
      StorageManager.getModel()
    ]);

    // Validate and normalize
    const validation = this.validateApiSettings({
      apiKey,
      baseUrl: baseUrl || AppConfig.api.defaultBaseUrl,
      model: model || AppConfig.api.defaultModel
    });

    return {
      apiKey: validation.normalized.apiKey || apiKey,
      baseUrl: validation.normalized.baseUrl || baseUrl || AppConfig.api.defaultBaseUrl,
      model: validation.normalized.model || model || AppConfig.api.defaultModel,
      timeout: AppConfig.api.timeout,
      maxRetries: AppConfig.api.maxRetries,
      validation: {
        valid: validation.valid,
        errors: validation.errors,
        warnings: validation.warnings
      }
    };
  }

  /**
   * Check if API is properly configured
   * @returns {Promise<{configured: boolean, issues: string[]}>}
   */
  static async isApiConfigured() {
    const issues = [];

    const apiKey = await StorageManager.getApiKey();
    if (!apiKey) {
      issues.push('API key is not set');
    } else {
      const keyValidation = this.validateApiKey(apiKey);
      if (!keyValidation.valid) {
        issues.push(`API key: ${keyValidation.error}`);
      }
    }

    const baseUrl = await StorageManager.getApiBaseUrl();
    if (baseUrl) {
      const urlValidation = this.validateApiUrl(baseUrl);
      if (!urlValidation.valid) {
        issues.push(`API URL: ${urlValidation.error}`);
      }
    }

    return {
      configured: issues.length === 0,
      issues
    };
  }

  /**
   * Get agent configuration
   * @returns {Promise<Object>}
   */
  static async getAgentConfig() {
    const customConfig = await this.get('agent', {});
    return {
      ...AppConfig.agent,
      ...customConfig
    };
  }

  /**
   * Get UI configuration
   * @returns {Promise<Object>}
   */
  static async getUiConfig() {
    const customConfig = await this.get('ui', {});
    return {
      ...AppConfig.ui,
      ...customConfig
    };
  }
}

/**
 * FeatureFlags - Feature flag management
 */
export class FeatureFlags {
  static flags = {
    syntaxHighlight: true,
    performanceMetrics: true,
    codeSnippets: true,
    taskTemplates: true,
    logging: true,
    experimental: false
  };

  /**
   * Check if a feature is enabled
   * @param {string} feature
   * @returns {Promise<boolean>}
   */
  static async isEnabled(feature) {
    // First check user override
    const userFlag = await SettingsManager.get(`features.${feature}`, null);
    if (userFlag !== null) {
      return userFlag;
    }
    // Fall back to default
    return this.flags[feature] ?? false;
  }

  /**
   * Enable or disable a feature
   * @param {string} feature
   * @param {boolean} enabled
   */
  static async setEnabled(feature, enabled) {
    await SettingsManager.set(`features.${feature}`, enabled);
  }

  /**
   * Get all feature flags
   * @returns {Promise<Object>}
   */
  static async getAll() {
    const result = {};
    for (const feature of Object.keys(this.flags)) {
      result[feature] = await this.isEnabled(feature);
    }
    return result;
  }
}

/**
 * KeyboardShortcutsConfig - Keyboard shortcuts configuration
 */
export const KeyboardShortcutsConfig = {
  run: { key: 'Enter', modifiers: ['Ctrl', 'Meta'], description: '运行任务' },
  stop: { key: 'Escape', modifiers: [], description: '停止执行' },
  save: { key: 's', modifiers: ['Ctrl', 'Meta'], description: '保存任务' },
  clear: { key: 'l', modifiers: ['Ctrl', 'Meta'], description: '清除输出' },
  toggleComment: { key: '/', modifiers: ['Ctrl', 'Meta'], description: '切换注释' },
  focusPrompt: { key: '1', modifiers: ['Ctrl', 'Meta'], description: '聚焦提示词' },
  focusCode: { key: '2', modifiers: ['Ctrl', 'Meta'], description: '聚焦代码' },
  openTasks: { key: 't', modifiers: ['Ctrl', 'Meta'], description: '打开任务' },
  openSettings: { key: ',', modifiers: ['Ctrl', 'Meta'], description: '打开设置' }
};

/**
 * Export configuration
 */
export default AppConfig;
