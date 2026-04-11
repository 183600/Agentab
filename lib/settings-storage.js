// lib/settings-storage.js - Settings-specific storage

import { cryptoManager, CryptoManager } from './crypto.js';
import { logger } from './logger.js';

/**
 * SettingsStorage - Manages settings and API configuration
 */
export class SettingsStorage {
  constructor() {
    this.defaults = {
      apiBaseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4',
      theme: 'light'
    };
  }

  /**
   * Get API key (decrypt if encrypted)
   * @returns {Promise<string>}
   */
  async getApiKey() {
    const result = await chrome.storage.local.get(['apiKey', 'apiKeyEncrypted']);

    if (result.apiKeyEncrypted) {
      const decrypted = await cryptoManager.decrypt(result.apiKeyEncrypted);

      if (CryptoManager.isDecryptionFailed(decrypted)) {
        logger.warn('API key decryption failed - may need re-entry');
      } else {
        return decrypted || '';
      }
    }

    return result.apiKey || '';
  }

  /**
   * Save API key (encrypted)
   * @param {string} key
   * @throws {Error} If encryption fails
   */
  async saveApiKey(key) {
    if (!key || key.trim() === '') {
      await chrome.storage.local.remove(['apiKey', 'apiKeyEncrypted']);
      return;
    }

    try {
      const encrypted = await cryptoManager.encrypt(key);
      await chrome.storage.local.set({
        apiKeyEncrypted: encrypted,
        apiKey: ''
      });
    } catch (error) {
      logger.error('Failed to encrypt API key', { error: error.message });
      throw new Error(
        'Failed to encrypt API key. Please try again or check browser security settings.'
      );
    }
  }

  /**
   * Get API base URL
   * @returns {Promise<string>}
   */
  async getApiBaseUrl() {
    const result = await chrome.storage.local.get('apiBaseUrl');
    return result.apiBaseUrl || this.defaults.apiBaseUrl;
  }

  /**
   * Save API base URL
   * @param {string} url
   */
  async saveApiBaseUrl(url) {
    await chrome.storage.local.set({ apiBaseUrl: url });
  }

  /**
   * Get model name
   * @returns {Promise<string>}
   */
  async getModel() {
    const result = await chrome.storage.local.get('model');
    return result.model || this.defaults.model;
  }

  /**
   * Save model name
   * @param {string} model
   */
  async saveModel(model) {
    await chrome.storage.local.set({ model });
  }

  /**
   * Get theme preference
   * @returns {Promise<string>}
   */
  async getTheme() {
    const result = await chrome.storage.local.get('theme');
    return result.theme || this.defaults.theme;
  }

  /**
   * Save theme preference
   * @param {string} theme - 'light' or 'dark'
   */
  async saveTheme(theme) {
    await chrome.storage.local.set({ theme });
  }

  /**
   * Get all settings at once
   * @returns {Promise<Object>}
   */
  async getAll() {
    const [apiKey, apiBaseUrl, model, theme] = await Promise.all([
      this.getApiKey(),
      this.getApiBaseUrl(),
      this.getModel(),
      this.getTheme()
    ]);

    return { apiKey, apiBaseUrl, model, theme };
  }

  /**
   * Update multiple settings at once
   * @param {Object} settings - Settings to update
   */
  async updateAll(settings) {
    const updates = [];

    if (settings.apiKey !== undefined) {
      updates.push(this.saveApiKey(settings.apiKey));
    }
    if (settings.apiBaseUrl !== undefined) {
      updates.push(this.saveApiBaseUrl(settings.apiBaseUrl));
    }
    if (settings.model !== undefined) {
      updates.push(this.saveModel(settings.model));
    }
    if (settings.theme !== undefined) {
      updates.push(this.saveTheme(settings.theme));
    }

    await Promise.all(updates);
  }
}

// Singleton instance
export const settingsStorage = new SettingsStorage();
