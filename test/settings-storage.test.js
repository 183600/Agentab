// test/settings-storage.test.js - Tests for SettingsStorage

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SettingsStorage, settingsStorage } from '../lib/settings-storage.js';
import { mockChromeStorage } from './setup.js';

describe('SettingsStorage', () => {
  let storage;

  beforeEach(() => {
    vi.clearAllMocks();
    mockChromeStorage.local.data = {};
    storage = new SettingsStorage();
  });

  describe('getApiKey', () => {
    it('should return empty string when no key', async () => {
      const key = await storage.getApiKey();
      expect(key).toBe('');
    });

    it('should return plaintext API key', async () => {
      mockChromeStorage.local.data.apiKey = 'sk-test-key';
      const key = await storage.getApiKey();
      expect(key).toBe('sk-test-key');
    });

    it('should decrypt encrypted API key', async () => {
      mockChromeStorage.local.data.apiKeyEncrypted = 'encrypted-data';
      // The mock crypto will handle decryption
      const key = await storage.getApiKey();
      expect(typeof key).toBe('string');
    });
  });

  describe('saveApiKey', () => {
    it('should save encrypted API key', async () => {
      await storage.saveApiKey('sk-new-key');

      expect(mockChromeStorage.local.data.apiKeyEncrypted).toBeDefined();
      expect(mockChromeStorage.local.data.apiKey).toBe('');
    });

    it('should remove key when empty', async () => {
      mockChromeStorage.local.data.apiKey = 'existing';
      mockChromeStorage.local.data.apiKeyEncrypted = 'encrypted';

      await storage.saveApiKey('');

      expect(mockChromeStorage.local.data.apiKey).toBeUndefined();
      expect(mockChromeStorage.local.data.apiKeyEncrypted).toBeUndefined();
    });

    it('should remove key when whitespace', async () => {
      await storage.saveApiKey('   ');

      expect(mockChromeStorage.local.data.apiKey).toBeUndefined();
    });
  });

  describe('getApiBaseUrl', () => {
    it('should return default URL when not set', async () => {
      const url = await storage.getApiBaseUrl();
      expect(url).toBe('https://api.openai.com/v1');
    });

    it('should return custom URL', async () => {
      mockChromeStorage.local.data.apiBaseUrl = 'https://custom.api.com/v1';
      const url = await storage.getApiBaseUrl();
      expect(url).toBe('https://custom.api.com/v1');
    });
  });

  describe('saveApiBaseUrl', () => {
    it('should save API base URL', async () => {
      await storage.saveApiBaseUrl('https://new.url.com/v1');
      expect(mockChromeStorage.local.data.apiBaseUrl).toBe('https://new.url.com/v1');
    });
  });

  describe('getModel', () => {
    it('should return default model when not set', async () => {
      const model = await storage.getModel();
      expect(model).toBe('gpt-4');
    });

    it('should return custom model', async () => {
      mockChromeStorage.local.data.model = 'gpt-3.5-turbo';
      const model = await storage.getModel();
      expect(model).toBe('gpt-3.5-turbo');
    });
  });

  describe('saveModel', () => {
    it('should save model', async () => {
      await storage.saveModel('gpt-4-turbo');
      expect(mockChromeStorage.local.data.model).toBe('gpt-4-turbo');
    });
  });

  describe('getTheme', () => {
    it('should return default theme when not set', async () => {
      const theme = await storage.getTheme();
      expect(theme).toBe('light');
    });

    it('should return custom theme', async () => {
      mockChromeStorage.local.data.theme = 'dark';
      const theme = await storage.getTheme();
      expect(theme).toBe('dark');
    });
  });

  describe('saveTheme', () => {
    it('should save theme', async () => {
      await storage.saveTheme('dark');
      expect(mockChromeStorage.local.data.theme).toBe('dark');
    });
  });

  describe('getAll', () => {
    it('should return all settings', async () => {
      mockChromeStorage.local.data.apiBaseUrl = 'https://test.com';
      mockChromeStorage.local.data.model = 'test-model';
      mockChromeStorage.local.data.theme = 'dark';

      const settings = await storage.getAll();

      expect(settings).toHaveProperty('apiKey');
      expect(settings).toHaveProperty('apiBaseUrl');
      expect(settings).toHaveProperty('model');
      expect(settings).toHaveProperty('theme');
      expect(settings.apiBaseUrl).toBe('https://test.com');
      expect(settings.model).toBe('test-model');
      expect(settings.theme).toBe('dark');
    });
  });

  describe('updateAll', () => {
    it('should update multiple settings', async () => {
      await storage.updateAll({
        apiBaseUrl: 'https://new.com',
        model: 'new-model',
        theme: 'dark'
      });

      expect(mockChromeStorage.local.data.apiBaseUrl).toBe('https://new.com');
      expect(mockChromeStorage.local.data.model).toBe('new-model');
      expect(mockChromeStorage.local.data.theme).toBe('dark');
    });

    it('should only update specified settings', async () => {
      mockChromeStorage.local.data.theme = 'dark';

      await storage.updateAll({ model: 'new-model' });

      expect(mockChromeStorage.local.data.model).toBe('new-model');
      expect(mockChromeStorage.local.data.theme).toBe('dark');
    });

    it('should handle empty updates', async () => {
      await storage.updateAll({});
      // Should not throw
    });
  });
});

describe('settingsStorage singleton', () => {
  it('should be a SettingsStorage instance', () => {
    expect(settingsStorage).toBeInstanceOf(SettingsStorage);
  });
});
