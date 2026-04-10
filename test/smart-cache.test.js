// test/smart-cache.test.js - Tests for SmartCache

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SmartCache, RequestDeduplicator } from '../lib/smart-cache.js';

describe('SmartCache', () => {
  let cache;

  beforeEach(() => {
    cache = new SmartCache({
      maxSize: 5,
      defaultTTL: 1000 // 1 second for tests
    });
  });

  describe('basic operations', () => {
    it('should set and get values', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('should return null for non-existent keys', () => {
      expect(cache.get('nonexistent')).toBeNull();
    });

    it('should delete values', () => {
      cache.set('key1', 'value1');
      cache.delete('key1');
      expect(cache.get('key1')).toBeNull();
    });

    it('should clear all values', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.clear();
      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key2')).toBeNull();
    });
  });

  describe('TTL expiration', () => {
    it('should expire values after TTL', async () => {
      cache.set('key1', 'value1', 100); // 100ms TTL

      expect(cache.get('key1')).toBe('value1');

      await new Promise(resolve => setTimeout(resolve, 150));

      expect(cache.get('key1')).toBeNull();
    });

    it('should support custom TTL', async () => {
      cache.set('key1', 'value1', 500); // 500ms TTL

      await new Promise(resolve => setTimeout(resolve, 300));
      expect(cache.get('key1')).toBe('value1');

      await new Promise(resolve => setTimeout(resolve, 300));
      expect(cache.get('key1')).toBeNull();
    });
  });

  describe('LRU eviction', () => {
    it('should evict least recently used items when full', () => {
      // Fill cache
      for (let i = 0; i < 5; i++) {
        cache.set(`key${i}`, `value${i}`);
      }

      // Access key0 to make it recently used
      cache.get('key0');

      // Add one more item, should evict key1 (least recently used)
      cache.set('key5', 'value5');

      expect(cache.get('key0')).toBe('value0'); // Should still exist
      expect(cache.get('key1')).toBeNull(); // Should be evicted
    });
  });

  describe('statistics', () => {
    it('should track hits and misses', () => {
      cache.set('key1', 'value1');

      cache.get('key1'); // hit
      cache.get('key1'); // hit
      cache.get('nonexistent'); // miss

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
    });

    it('should calculate hit rate', () => {
      cache.set('key1', 'value1');

      cache.get('key1'); // hit
      cache.get('nonexistent'); // miss

      const stats = cache.getStats();
      expect(stats.hitRate).toBe('50.00%');
    });
  });

  describe('getOrSet pattern', () => {
    it('should return cached value if exists', async () => {
      cache.set('key1', 'cached');

      const result = await cache.getOrSet('key1', () => 'new value');
      expect(result).toBe('cached');
    });

    it('should compute and cache value if not exists', async () => {
      const computeFn = vi.fn(() => 'computed');

      const result = await cache.getOrSet('key1', computeFn);
      expect(result).toBe('computed');
      expect(computeFn).toHaveBeenCalledTimes(1);

      // Second call should use cache
      const result2 = await cache.getOrSet('key1', computeFn);
      expect(result2).toBe('computed');
      expect(computeFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('key generation', () => {
    it('should generate consistent keys', () => {
      const key1 = cache.generateKey('namespace', 'arg1', 'arg2');
      const key2 = cache.generateKey('namespace', 'arg1', 'arg2');
      expect(key1).toBe(key2);
    });

    it('should generate different keys for different args', () => {
      const key1 = cache.generateKey('namespace', 'arg1');
      const key2 = cache.generateKey('namespace', 'arg2');
      expect(key1).not.toBe(key2);
    });
  });
});

describe('RequestDeduplicator', () => {
  let dedup;

  beforeEach(() => {
    dedup = new RequestDeduplicator();
  });

  it('should deduplicate concurrent requests', async () => {
    let callCount = 0;

    const fn = async () => {
      callCount++;
      await new Promise(resolve => setTimeout(resolve, 50));
      return 'result';
    };

    // Start two concurrent requests
    const [result1, result2] = await Promise.all([
      dedup.execute('key1', fn),
      dedup.execute('key1', fn)
    ]);

    expect(result1).toBe('result');
    expect(result2).toBe('result');
    expect(callCount).toBe(1); // Should only call once
  });

  it('should not deduplicate different keys', async () => {
    let callCount = 0;

    const fn = async () => {
      callCount++;
      return 'result';
    };

    await Promise.all([dedup.execute('key1', fn), dedup.execute('key2', fn)]);

    expect(callCount).toBe(2);
  });

  it('should clear pending requests', () => {
    dedup.pending.set('key1', Promise.resolve());
    dedup.clear();
    expect(dedup.pending.size).toBe(0);
  });
});
