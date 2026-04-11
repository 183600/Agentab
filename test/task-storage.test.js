// test/task-storage.test.js - Tests for TaskStorage

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TaskStorage, taskStorage } from '../lib/task-storage.js';
import { mockChromeStorage } from './setup.js';

describe('TaskStorage', () => {
  let storage;

  beforeEach(() => {
    vi.clearAllMocks();
    mockChromeStorage.local.data = {};
    storage = new TaskStorage('test_tasks');
  });

  describe('getAll', () => {
    it('should return empty array when no tasks', async () => {
      const tasks = await storage.getAll();
      expect(tasks).toEqual([]);
    });

    it('should return existing tasks', async () => {
      mockChromeStorage.local.data.test_tasks = [
        { id: '1', name: 'Task 1' },
        { id: '2', name: 'Task 2' }
      ];

      const tasks = await storage.getAll();
      expect(tasks.length).toBe(2);
      expect(tasks[0].name).toBe('Task 1');
    });
  });

  describe('save', () => {
    it('should save a new task', async () => {
      const task = await storage.save({
        name: 'Test Task',
        type: 'automation',
        content: 'return 1'
      });

      expect(task.id).toBeDefined();
      expect(task.name).toBe('Test Task');
      expect(task.type).toBe('automation');
      expect(task.content).toBe('return 1');
      expect(task.createdAt).toBeDefined();
      expect(task.executionCount).toBe(0);
      expect(task.version).toBe(1);
    });

    it('should save task with description', async () => {
      const task = await storage.save({
        name: 'Task',
        type: 'test',
        content: 'code',
        description: 'A test task'
      });

      expect(task.description).toBe('A test task');
    });

    it('should generate unique IDs', async () => {
      const task1 = await storage.save({ name: 'Task 1', content: 'a' });
      const task2 = await storage.save({ name: 'Task 2', content: 'b' });

      expect(task1.id).not.toBe(task2.id);
    });
  });

  describe('update', () => {
    it('should update existing task', async () => {
      const saved = await storage.save({ name: 'Original', content: 'original' });
      const updated = await storage.update(saved.id, { name: 'Updated' });

      expect(updated.name).toBe('Updated');
      expect(updated.content).toBe('original');
    });

    it('should return null for non-existent task', async () => {
      const result = await storage.update('nonexistent', { name: 'Test' });
      expect(result).toBeNull();
    });

    it('should increment version on content change', async () => {
      const saved = await storage.save({ name: 'Task', content: 'v1' });
      const updated = await storage.update(saved.id, { content: 'v2' });

      expect(updated.version).toBe(2);
    });

    it('should not increment version on name change', async () => {
      const saved = await storage.save({ name: 'Task', content: 'code' });
      const updated = await storage.update(saved.id, { name: 'New Name' });

      expect(updated.version).toBe(1);
    });

    it('should keep history when content changes', async () => {
      const saved = await storage.save({ name: 'Task', content: 'v1' });
      await storage.update(saved.id, { content: 'v2' });
      await storage.update(saved.id, { content: 'v3' });

      const tasks = await storage.getAll();
      expect(tasks[0].history.length).toBe(2);
    });

    it('should limit history to 10 entries', async () => {
      const saved = await storage.save({ name: 'Task', content: 'v0' });

      for (let i = 1; i <= 15; i++) {
        await storage.update(saved.id, { content: `v${i}` });
      }

      const tasks = await storage.getAll();
      expect(tasks[0].history.length).toBe(10);
    });

    it('should skip history when disabled', async () => {
      const saved = await storage.save({ name: 'Task', content: 'v1' });
      await storage.update(saved.id, { content: 'v2' }, { keepHistory: false });

      const tasks = await storage.getAll();
      expect(tasks[0].history.length).toBe(0);
    });
  });

  describe('delete', () => {
    it('should delete existing task', async () => {
      const saved = await storage.save({ name: 'Task', content: 'code' });
      const result = await storage.delete(saved.id);

      expect(result).toBe(true);
      const tasks = await storage.getAll();
      expect(tasks.length).toBe(0);
    });

    it('should return false for non-existent task', async () => {
      const result = await storage.delete('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('recordExecution', () => {
    it('should increment execution count', async () => {
      const saved = await storage.save({ name: 'Task', content: 'code' });
      await storage.recordExecution(saved.id);

      const tasks = await storage.getAll();
      expect(tasks[0].executionCount).toBe(1);
      expect(tasks[0].lastExecuted).toBeDefined();
    });

    it('should do nothing for non-existent task', async () => {
      await storage.recordExecution('nonexistent');
      // Should not throw
    });
  });

  describe('getHistory', () => {
    it('should return task history', async () => {
      const saved = await storage.save({ name: 'Task', content: 'v1' });
      await storage.update(saved.id, { content: 'v2' });
      await storage.update(saved.id, { content: 'v3' });

      const history = await storage.getHistory(saved.id);
      expect(history.length).toBe(2);
    });

    it('should return empty array for non-existent task', async () => {
      const history = await storage.getHistory('nonexistent');
      expect(history).toEqual([]);
    });
  });

  describe('restoreVersion', () => {
    it('should restore to previous version', async () => {
      const saved = await storage.save({ name: 'Task', content: 'v1' });
      await storage.update(saved.id, { content: 'v2', name: 'V2' });
      await storage.update(saved.id, { content: 'v3', name: 'V3' });

      const restored = await storage.restoreVersion(saved.id, 2);

      expect(restored.content).toBe('v2');
      expect(restored.name).toBe('V2');
    });

    it('should return null for non-existent task', async () => {
      const result = await storage.restoreVersion('nonexistent', 1);
      expect(result).toBeNull();
    });

    it('should return null for non-existent version', async () => {
      const saved = await storage.save({ name: 'Task', content: 'v1' });
      const result = await storage.restoreVersion(saved.id, 999);
      expect(result).toBeNull();
    });

    it('should increment version after restore', async () => {
      const saved = await storage.save({ name: 'Task', content: 'v1' });
      await storage.update(saved.id, { content: 'v2' });

      const restored = await storage.restoreVersion(saved.id, 1);
      expect(restored.version).toBe(3); // 1 + 1 (update) + 1 (restore)
    });
  });
});

describe('taskStorage singleton', () => {
  it('should be a TaskStorage instance', () => {
    expect(taskStorage).toBeInstanceOf(TaskStorage);
  });

  it('should use default storage key', () => {
    expect(taskStorage.storageKey).toBe('tasks');
  });
});
