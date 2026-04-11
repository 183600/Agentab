// test/history-storage.test.js - Tests for HistoryStorage

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HistoryStorage, historyStorage } from '../lib/history-storage.js';
import { mockChromeStorage } from './setup.js';

describe('HistoryStorage', () => {
  let storage;

  beforeEach(() => {
    vi.clearAllMocks();
    mockChromeStorage.local.data = {};
    storage = new HistoryStorage({
      storageKey: 'test_history',
      maxEntries: 5
    });
  });

  describe('constructor', () => {
    it('should create with default options', () => {
      const defaultStorage = new HistoryStorage();
      expect(defaultStorage.storageKey).toBe('history');
      expect(defaultStorage.maxEntries).toBe(100);
    });

    it('should accept custom options', () => {
      expect(storage.storageKey).toBe('test_history');
      expect(storage.maxEntries).toBe(5);
    });
  });

  describe('getAll', () => {
    it('should return empty array when no history', async () => {
      const history = await storage.getAll();
      expect(history).toEqual([]);
    });

    it('should return existing history', async () => {
      mockChromeStorage.local.data.test_history = [
        { id: '1', type: 'test' },
        { id: '2', type: 'test' }
      ];

      const history = await storage.getAll();
      expect(history.length).toBe(2);
    });
  });

  describe('add', () => {
    it('should add history entry', async () => {
      const entry = await storage.add({
        type: 'execute',
        input: 'test input',
        results: { success: true }
      });

      expect(entry.id).toBeDefined();
      expect(entry.type).toBe('execute');
      expect(entry.timestamp).toBeDefined();
    });

    it('should add entry at the beginning', async () => {
      await storage.add({ type: 'first' });
      await storage.add({ type: 'second' });

      const history = await storage.getAll();
      expect(history[0].type).toBe('second');
      expect(history[1].type).toBe('first');
    });

    it('should limit entries to maxEntries', async () => {
      for (let i = 0; i < 10; i++) {
        await storage.add({ type: 'test', index: i });
      }

      const history = await storage.getAll();
      expect(history.length).toBe(5);
    });

    it('should keep most recent entries', async () => {
      for (let i = 0; i < 10; i++) {
        await storage.add({ type: 'test', index: i });
      }

      const history = await storage.getAll();
      expect(history[0].index).toBe(9); // Most recent
      expect(history[4].index).toBe(5); // Oldest kept
    });
  });

  describe('clear', () => {
    it('should clear all history', async () => {
      await storage.add({ type: 'test' });
      await storage.add({ type: 'test' });

      await storage.clear();

      const history = await storage.getAll();
      expect(history).toEqual([]);
    });
  });

  describe('getByType', () => {
    it('should filter by type', async () => {
      await storage.add({ type: 'execute' });
      await storage.add({ type: 'complete' });
      await storage.add({ type: 'execute' });

      const executeHistory = await storage.getByType('execute');
      expect(executeHistory.length).toBe(2);

      const completeHistory = await storage.getByType('complete');
      expect(completeHistory.length).toBe(1);
    });

    it('should return empty array for non-existent type', async () => {
      const result = await storage.getByType('nonexistent');
      expect(result).toEqual([]);
    });
  });

  describe('getRecent', () => {
    it('should return recent entries', async () => {
      for (let i = 0; i < 10; i++) {
        await storage.add({ type: 'test', index: i });
      }

      const recent = await storage.getRecent(3);
      expect(recent.length).toBe(3);
      expect(recent[0].index).toBe(9);
    });

    it('should return all if less than count', async () => {
      await storage.add({ type: 'test' });
      await storage.add({ type: 'test' });

      const recent = await storage.getRecent(10);
      expect(recent.length).toBe(2);
    });

    it('should use default count of 10', async () => {
      for (let i = 0; i < 15; i++) {
        await storage.add({ type: 'test', index: i });
      }

      const recent = await storage.getRecent();
      expect(recent.length).toBe(5); // Limited by maxEntries
    });
  });

  describe('search', () => {
    it('should search in input', async () => {
      await storage.add({ type: 'test', input: 'hello world' });
      await storage.add({ type: 'test', input: 'goodbye world' });

      const results = await storage.search('hello');
      expect(results.length).toBe(1);
      expect(results[0].input).toBe('hello world');
    });

    it('should search in results', async () => {
      await storage.add({
        type: 'test',
        input: 'test',
        results: { data: 'success response' }
      });
      await storage.add({
        type: 'test',
        input: 'test',
        results: { data: 'error response' }
      });

      const results = await storage.search('success');
      expect(results.length).toBe(1);
    });

    it('should be case insensitive', async () => {
      await storage.add({ type: 'test', input: 'Hello World' });

      const results = await storage.search('hello');
      expect(results.length).toBe(1);
    });

    it('should return empty array for no matches', async () => {
      await storage.add({ type: 'test', input: 'hello' });

      const results = await storage.search('nonexistent');
      expect(results).toEqual([]);
    });
  });

  describe('delete', () => {
    it('should delete specific entry', async () => {
      const entry = await storage.add({ type: 'test' });
      await storage.add({ type: 'other' });

      const result = await storage.delete(entry.id);
      expect(result).toBe(true);

      const history = await storage.getAll();
      expect(history.length).toBe(1);
      expect(history[0].type).toBe('other');
    });

    it('should return false for non-existent entry', async () => {
      const result = await storage.delete('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should return stats', async () => {
      await storage.add({ type: 'execute', results: { success: true } });
      await storage.add({ type: 'execute', results: { success: true } });
      await storage.add({ type: 'complete', results: { success: false } });

      const stats = await storage.getStats();

      expect(stats.total).toBe(3);
      expect(stats.byType.execute).toBe(2);
      expect(stats.byType.complete).toBe(1);
      expect(stats.successCount).toBe(2);
      expect(stats.errorCount).toBe(1);
    });

    it('should return empty stats for no history', async () => {
      const stats = await storage.getStats();

      expect(stats.total).toBe(0);
      expect(stats.byType).toEqual({});
      expect(stats.successCount).toBe(0);
      expect(stats.errorCount).toBe(0);
    });
  });
});

describe('historyStorage singleton', () => {
  it('should be a HistoryStorage instance', () => {
    expect(historyStorage).toBeInstanceOf(HistoryStorage);
  });

  it('should use default options', () => {
    expect(historyStorage.storageKey).toBe('history');
    expect(historyStorage.maxEntries).toBe(100);
  });
});
