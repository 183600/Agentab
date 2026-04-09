// test/storage.test.js - Tests for storage management

import { describe, it, expect, beforeEach } from 'vitest';
import './setup.js';
import { StorageManager } from '../lib/storage.js';

describe('StorageManager', () => {
  beforeEach(async () => {
    await chrome.storage.local.clear();
  });

  describe('Tasks', () => {
    describe('getTasks()', () => {
      it('should return empty array when no tasks', async () => {
        const tasks = await StorageManager.getTasks();
        expect(tasks).toEqual([]);
      });

      it('should return stored tasks', async () => {
        await StorageManager.saveTask({
          name: 'Test',
          type: 'prompt',
          content: 'test content'
        });
        const tasks = await StorageManager.getTasks();
        expect(tasks.length).toBe(1);
        expect(tasks[0].name).toBe('Test');
      });
    });

    describe('saveTask()', () => {
      it('should save task with generated id', async () => {
        const task = await StorageManager.saveTask({
          name: 'Test',
          type: 'prompt',
          content: 'content'
        });
        expect(task.id).toBeDefined();
        expect(task.name).toBe('Test');
        expect(task.type).toBe('prompt');
      });

      it('should set timestamps', async () => {
        const task = await StorageManager.saveTask({
          name: 'Test',
          type: 'code',
          content: 'code'
        });
        expect(task.createdAt).toBeDefined();
        expect(task.updatedAt).toBeDefined();
      });

      it('should initialize execution count', async () => {
        const task = await StorageManager.saveTask({
          name: 'Test',
          type: 'prompt',
          content: 'content'
        });
        expect(task.executionCount).toBe(0);
        expect(task.lastExecuted).toBeNull();
      });
    });

    describe('updateTask()', () => {
      it('should update existing task', async () => {
        const saved = await StorageManager.saveTask({
          name: 'Original',
          type: 'prompt',
          content: 'content'
        });
        const updated = await StorageManager.updateTask(saved.id, {
          name: 'Updated'
        });
        expect(updated.name).toBe('Updated');
      });

      it('should return null for non-existent task', async () => {
        const result = await StorageManager.updateTask('nonexistent', {});
        expect(result).toBeNull();
      });

      it('should update timestamp', async () => {
        const saved = await StorageManager.saveTask({
          name: 'Test',
          type: 'prompt',
          content: 'content'
        });
        const originalTime = saved.updatedAt;
        await new Promise(r => setTimeout(r, 10));
        const updated = await StorageManager.updateTask(saved.id, {
          name: 'Updated'
        });
        expect(updated.updatedAt).not.toBe(originalTime);
      });
    });

    describe('deleteTask()', () => {
      it('should delete task', async () => {
        const saved = await StorageManager.saveTask({
          name: 'Test',
          type: 'prompt',
          content: 'content'
        });
        const deleted = await StorageManager.deleteTask(saved.id);
        expect(deleted).toBe(true);
        const tasks = await StorageManager.getTasks();
        expect(tasks.length).toBe(0);
      });

      it('should return false for non-existent task', async () => {
        const deleted = await StorageManager.deleteTask('nonexistent');
        expect(deleted).toBe(false);
      });
    });

    describe('recordExecution()', () => {
      it('should increment execution count', async () => {
        const saved = await StorageManager.saveTask({
          name: 'Test',
          type: 'prompt',
          content: 'content'
        });
        await StorageManager.recordExecution(saved.id);
        const tasks = await StorageManager.getTasks();
        expect(tasks[0].executionCount).toBe(1);
        expect(tasks[0].lastExecuted).toBeDefined();
      });
    });
  });

  describe('API Configuration', () => {
    describe('getApiKey() / saveApiKey()', () => {
      it('should save and retrieve API key', async () => {
        await StorageManager.saveApiKey('test-key');
        const key = await StorageManager.getApiKey();
        expect(key).toBe('test-key');
      });

      it('should clear API key when empty', async () => {
        await StorageManager.saveApiKey('test-key');
        await StorageManager.saveApiKey('');
        const key = await StorageManager.getApiKey();
        expect(key).toBe('');
      });

      it('should return empty string when no key', async () => {
        const key = await StorageManager.getApiKey();
        expect(key).toBe('');
      });
    });

    describe('getApiBaseUrl() / saveApiBaseUrl()', () => {
      it('should return default URL', async () => {
        const url = await StorageManager.getApiBaseUrl();
        expect(url).toBe('https://api.openai.com/v1');
      });

      it('should save and retrieve URL', async () => {
        await StorageManager.saveApiBaseUrl('https://custom.api.com');
        const url = await StorageManager.getApiBaseUrl();
        expect(url).toBe('https://custom.api.com');
      });
    });

    describe('getModel() / saveModel()', () => {
      it('should return default model', async () => {
        const model = await StorageManager.getModel();
        expect(model).toBe('gpt-4');
      });

      it('should save and retrieve model', async () => {
        await StorageManager.saveModel('gpt-4o');
        const model = await StorageManager.getModel();
        expect(model).toBe('gpt-4o');
      });
    });
  });

  describe('History', () => {
    describe('getHistory()', () => {
      it('should return empty array when no history', async () => {
        const history = await StorageManager.getHistory();
        expect(history).toEqual([]);
      });
    });

    describe('addHistory()', () => {
      it('should add history entry', async () => {
        await StorageManager.addHistory({
          type: 'prompt',
          input: 'test'
        });
        const history = await StorageManager.getHistory();
        expect(history.length).toBe(1);
        expect(history[0].type).toBe('prompt');
        expect(history[0].timestamp).toBeDefined();
      });

      it('should limit history to 100 entries', async () => {
        for (let i = 0; i < 150; i++) {
          await StorageManager.addHistory({ type: 'prompt', input: i });
        }
        const history = await StorageManager.getHistory();
        expect(history.length).toBe(100);
      });

      it('should add entries to front', async () => {
        await StorageManager.addHistory({ type: 'prompt', input: 'first' });
        await StorageManager.addHistory({ type: 'prompt', input: 'second' });
        const history = await StorageManager.getHistory();
        expect(history[0].input).toBe('second');
      });
    });

    describe('clearHistory()', () => {
      it('should clear history', async () => {
        await StorageManager.addHistory({ type: 'prompt' });
        await StorageManager.clearHistory();
        const history = await StorageManager.getHistory();
        expect(history).toEqual([]);
      });
    });
  });

  describe('Theme', () => {
    it('should return default theme', async () => {
      const theme = await StorageManager.getTheme();
      expect(theme).toBe('light');
    });

    it('should save and retrieve theme', async () => {
      await StorageManager.saveTheme('dark');
      const theme = await StorageManager.getTheme();
      expect(theme).toBe('dark');
    });
  });
});
