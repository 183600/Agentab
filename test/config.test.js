// test/config.test.js - Tests for configuration management

import { describe, it, expect, beforeEach } from 'vitest';
import './setup.js';
import {
  AppConfig,
  SettingsManager,
  FeatureFlags,
  KeyboardShortcutsConfig
} from '../lib/config.js';

describe('AppConfig', () => {
  it('should have default API configuration', () => {
    expect(AppConfig.api).toBeDefined();
    expect(AppConfig.api.defaultBaseUrl).toBe('https://api.openai.com/v1');
    expect(AppConfig.api.defaultModel).toBe('gpt-4o');
    expect(AppConfig.api.timeout).toBe(60000);
  });

  it('should have agent configuration', () => {
    expect(AppConfig.agent).toBeDefined();
    expect(AppConfig.agent.maxIterations).toBe(10);
    expect(AppConfig.agent.executionTimeout).toBe(30000);
  });

  it('should have storage configuration', () => {
    expect(AppConfig.storage).toBeDefined();
    expect(AppConfig.storage.maxTasks).toBe(500);
    expect(AppConfig.storage.maxHistoryEntries).toBe(100);
  });

  it('should have UI configuration', () => {
    expect(AppConfig.ui).toBeDefined();
    expect(AppConfig.ui.defaultTheme).toBe('light');
    expect(AppConfig.ui.animationEnabled).toBe(true);
  });

  it('should have cache configuration', () => {
    expect(AppConfig.cache).toBeDefined();
    expect(AppConfig.cache.pageAnalysisTTL).toBe(5000);
  });

  it('should have logging configuration', () => {
    expect(AppConfig.logging).toBeDefined();
    expect(AppConfig.logging.level).toBe('INFO');
  });
});

describe('SettingsManager', () => {
  beforeEach(async () => {
    await SettingsManager.reset();
  });

  describe('getAll()', () => {
    it('should return empty object when no settings', async () => {
      const settings = await SettingsManager.getAll();
      expect(settings).toEqual({});
    });

    it('should return stored settings', async () => {
      await SettingsManager.set('test', 'value');
      const settings = await SettingsManager.getAll();
      expect(settings.test).toBe('value');
    });
  });

  describe('get()', () => {
    it('should return null for non-existent key', async () => {
      const value = await SettingsManager.get('nonexistent');
      expect(value).toBeNull();
    });

    it('should return default value for non-existent key', async () => {
      const value = await SettingsManager.get('nonexistent', 'default');
      expect(value).toBe('default');
    });

    it('should get nested value with dot notation', async () => {
      await SettingsManager.set('api.baseUrl', 'https://example.com');
      const value = await SettingsManager.get('api.baseUrl');
      expect(value).toBe('https://example.com');
    });

    it('should return default for missing nested value', async () => {
      await SettingsManager.set('api', { baseUrl: 'test' });
      const value = await SettingsManager.get('api.model', 'default-model');
      expect(value).toBe('default-model');
    });
  });

  describe('set()', () => {
    it('should set a simple value', async () => {
      await SettingsManager.set('key', 'value');
      const value = await SettingsManager.get('key');
      expect(value).toBe('value');
    });

    it('should set nested value', async () => {
      await SettingsManager.set('nested.key', 'value');
      const settings = await SettingsManager.getAll();
      expect(settings.nested.key).toBe('value');
    });

    it('should preserve existing nested values', async () => {
      await SettingsManager.set('api.baseUrl', 'url1');
      await SettingsManager.set('api.model', 'model1');
      const settings = await SettingsManager.getAll();
      expect(settings.api.baseUrl).toBe('url1');
      expect(settings.api.model).toBe('model1');
    });
  });

  describe('update()', () => {
    it('should update multiple settings', async () => {
      await SettingsManager.update({ key1: 'value1', key2: 'value2' });
      const value1 = await SettingsManager.get('key1');
      const value2 = await SettingsManager.get('key2');
      expect(value1).toBe('value1');
      expect(value2).toBe('value2');
    });

    it('should deep merge settings', async () => {
      await SettingsManager.set('api.baseUrl', 'original');
      await SettingsManager.update({ api: { model: 'new-model' } });
      const settings = await SettingsManager.getAll();
      expect(settings.api.baseUrl).toBe('original');
      expect(settings.api.model).toBe('new-model');
    });
  });

  describe('deepMerge()', () => {
    it('should merge flat objects', () => {
      const result = SettingsManager.deepMerge({ a: 1 }, { b: 2 });
      expect(result).toEqual({ a: 1, b: 2 });
    });

    it('should deep merge nested objects', () => {
      const result = SettingsManager.deepMerge({ api: { url: 'a' } }, { api: { model: 'b' } });
      expect(result.api.url).toBe('a');
      expect(result.api.model).toBe('b');
    });

    it('should overwrite primitive values', () => {
      const result = SettingsManager.deepMerge({ a: 1 }, { a: 2 });
      expect(result.a).toBe(2);
    });
  });

  describe('reset()', () => {
    it('should clear all settings', async () => {
      await SettingsManager.set('key', 'value');
      await SettingsManager.reset();
      const settings = await SettingsManager.getAll();
      expect(settings).toEqual({});
    });
  });
});

describe('FeatureFlags', () => {
  beforeEach(async () => {
    await SettingsManager.reset();
  });

  describe('isEnabled()', () => {
    it('should return default flag value', async () => {
      const enabled = await FeatureFlags.isEnabled('syntaxHighlight');
      expect(enabled).toBe(true);
    });

    it('should return false for unknown feature', async () => {
      const enabled = await FeatureFlags.isEnabled('unknownFeature');
      expect(enabled).toBe(false);
    });

    it('should respect user override', async () => {
      await FeatureFlags.setEnabled('syntaxHighlight', false);
      const enabled = await FeatureFlags.isEnabled('syntaxHighlight');
      expect(enabled).toBe(false);
    });
  });

  describe('setEnabled()', () => {
    it('should set feature flag', async () => {
      await FeatureFlags.setEnabled('experimental', true);
      const enabled = await FeatureFlags.isEnabled('experimental');
      expect(enabled).toBe(true);
    });
  });

  describe('getAll()', () => {
    it('should return all feature flags', async () => {
      const flags = await FeatureFlags.getAll();
      expect(flags.syntaxHighlight).toBe(true);
      expect(flags.performanceMetrics).toBe(true);
      expect(flags.codeSnippets).toBe(true);
      expect(flags.taskTemplates).toBe(true);
      expect(flags.logging).toBe(true);
      expect(flags.experimental).toBe(false);
    });
  });
});

describe('KeyboardShortcutsConfig', () => {
  it('should have run shortcut', () => {
    expect(KeyboardShortcutsConfig.run).toBeDefined();
    expect(KeyboardShortcutsConfig.run.key).toBe('Enter');
  });

  it('should have stop shortcut', () => {
    expect(KeyboardShortcutsConfig.stop).toBeDefined();
    expect(KeyboardShortcutsConfig.stop.key).toBe('Escape');
  });

  it('should have save shortcut', () => {
    expect(KeyboardShortcutsConfig.save).toBeDefined();
    expect(KeyboardShortcutsConfig.save.key).toBe('s');
  });

  it('should have description for all shortcuts', () => {
    for (const [name, config] of Object.entries(KeyboardShortcutsConfig)) {
      expect(config.description).toBeDefined();
    }
  });
});
