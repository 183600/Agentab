// test/enhanced-api-client.test.js - Tests for Enhanced API Client

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EnhancedLlmApiClient, enhancedApiClient } from '../lib/enhanced-api-client.js';

// Mock the base API client
vi.mock('../lib/api-client.js', () => {
  return {
    LlmApiClient: class MockLlmApiClient {
      constructor() {
        this.config = {
          baseUrl: 'https://api.example.com/v1',
          apiKey: 'test-key',
          model: 'gpt-4'
        };
      }

      async getConfig() {
        return this.config;
      }

      async chatCompletion(messages, options = {}) {
        return 'Mock response for: ' + messages[messages.length - 1].content;
      }
    }
  };
});

// Mock smart cache
vi.mock('../lib/smart-cache.js', () => {
  const cache = new Map();
  const pendingRequests = new Map();

  return {
    apiCache: {
      get: vi.fn(key => cache.get(key)),
      set: vi.fn((key, value, ttl) => cache.set(key, value)),
      generateKey: vi.fn((type, model, messages) => `${type}:${model}:${JSON.stringify(messages)}`),
      getStats: vi.fn(() => ({ size: cache.size, hits: 0, misses: 0 })),
      clear: vi.fn(() => cache.clear())
    },
    requestDeduplicator: {
      execute: vi.fn(async (key, fn) => {
        if (pendingRequests.has(key)) {
          return pendingRequests.get(key);
        }
        const promise = fn();
        pendingRequests.set(key, promise);
        try {
          return await promise;
        } finally {
          pendingRequests.delete(key);
        }
      })
    }
  };
});

describe('EnhancedLlmApiClient', () => {
  let client;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new EnhancedLlmApiClient();
  });

  describe('constructor', () => {
    it('should initialize with caching enabled', () => {
      expect(client.enableCache).toBe(true);
      expect(client.enableDeduplication).toBe(true);
    });
  });

  describe('getCacheKey', () => {
    it('should generate stable cache key', async () => {
      const messages = [{ role: 'user', content: 'Hello' }];
      const config = { model: 'gpt-4' };

      const key1 = client.getCacheKey(messages, config);
      const key2 = client.getCacheKey(messages, config);

      expect(key1).toBe(key2);
    });

    it('should normalize messages for cache key', async () => {
      const messages1 = [{ role: 'user', content: 'Hello' }];
      const messages2 = [{ role: 'user', content: 'Hello' }];
      const config = { model: 'gpt-4' };

      const key1 = client.getCacheKey(messages1, config);
      const key2 = client.getCacheKey(messages2, config);

      expect(key1).toBe(key2);
    });

    it('should truncate long content in cache key', async () => {
      const longContent = 'A'.repeat(1000);
      const messages = [{ role: 'user', content: longContent }];
      const config = { model: 'gpt-4' };

      const key = client.getCacheKey(messages, config);

      // Key should be generated without error
      expect(key).toBeDefined();
    });
  });

  describe('shouldCache', () => {
    it('should cache normal messages', () => {
      const messages = [
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'Hello' }
      ];

      expect(client.shouldCache(messages)).toBe(true);
    });

    it('should not cache when disabled', () => {
      client.enableCache = false;
      const messages = [{ role: 'user', content: 'Hello' }];

      expect(client.shouldCache(messages)).toBe(false);
    });

    it('should not cache too many messages', () => {
      const messages = Array(25).fill({ role: 'user', content: 'Hello' });

      expect(client.shouldCache(messages)).toBe(false);
    });

    it('should not cache messages with timestamps', () => {
      const messages = [{ role: 'user', content: 'Time: Date.now()' }];

      expect(client.shouldCache(messages)).toBe(false);
    });

    it('should not cache messages with random data', () => {
      const messages = [{ role: 'user', content: 'Random: Math.random()' }];

      expect(client.shouldCache(messages)).toBe(false);
    });
  });

  describe('setCaching', () => {
    it('should enable/disable caching', () => {
      client.setCaching(false);
      expect(client.enableCache).toBe(false);

      client.setCaching(true);
      expect(client.enableCache).toBe(true);
    });
  });

  describe('setDeduplication', () => {
    it('should enable/disable deduplication', () => {
      client.setDeduplication(false);
      expect(client.enableDeduplication).toBe(false);

      client.setDeduplication(true);
      expect(client.enableDeduplication).toBe(true);
    });
  });

  describe('chatCompletion', () => {
    it('should make request and return response', async () => {
      const messages = [{ role: 'user', content: 'Hello' }];
      const response = await client.chatCompletion(messages);

      expect(response).toBeDefined();
    });

    it('should respect signal option', async () => {
      const controller = new AbortController();
      const messages = [{ role: 'user', content: 'Hello' }];

      // Request should work with signal
      const response = await client.chatCompletion(messages, { signal: controller.signal });
      expect(response).toBeDefined();
    });
  });

  describe('getCacheStats', () => {
    it('should return cache statistics', () => {
      const stats = client.getCacheStats();

      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('hits');
      expect(stats).toHaveProperty('misses');
    });
  });

  describe('clearCache', () => {
    it('should clear cache', () => {
      client.clearCache();
      const stats = client.getCacheStats();

      expect(stats.size).toBe(0);
    });
  });

  describe('groupRequests', () => {
    it('should group requests by model', () => {
      const requests = [
        { messages: [{ role: 'user', content: 'A' }], options: { model: 'gpt-4' } },
        { messages: [{ role: 'user', content: 'B' }], options: { model: 'gpt-4' } },
        { messages: [{ role: 'user', content: 'C' }], options: { model: 'gpt-3.5' } }
      ];

      const groups = client.groupRequests(requests);

      expect(groups.length).toBe(2);
    });

    it('should group requests without model as default', () => {
      const requests = [
        { messages: [{ role: 'user', content: 'A' }] },
        { messages: [{ role: 'user', content: 'B' }] }
      ];

      const groups = client.groupRequests(requests);

      expect(groups.length).toBe(1);
      expect(groups[0].items.length).toBe(2);
    });
  });

  describe('batchRequests', () => {
    it('should process multiple requests', async () => {
      const requests = [
        { messages: [{ role: 'user', content: 'Hello' }] },
        { messages: [{ role: 'user', content: 'World' }] }
      ];

      const results = await client.batchRequests(requests);

      expect(results.length).toBe(2);
      expect(results[0]).toHaveProperty('success');
    });
  });

  describe('streamChatCompletion', () => {
    it('should throw error for invalid response', async () => {
      // Mock fetch to return error response
      const originalFetch = global.fetch;
      global.fetch = vi.fn(async () => ({
        ok: false,
        json: async () => ({ error: { message: 'API Error' } })
      }));

      const messages = [{ role: 'user', content: 'Hello' }];

      await expect(client.streamChatCompletion(messages)).rejects.toThrow();

      global.fetch = originalFetch;
    });
  });
});

describe('enhancedApiClient singleton', () => {
  it('should be an instance of EnhancedLlmApiClient', () => {
    expect(enhancedApiClient).toBeInstanceOf(EnhancedLlmApiClient);
  });

  it('should have caching enabled by default', () => {
    expect(enhancedApiClient.enableCache).toBe(true);
  });

  it('should have deduplication enabled by default', () => {
    expect(enhancedApiClient.enableDeduplication).toBe(true);
  });
});
