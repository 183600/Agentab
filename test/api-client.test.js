// test/api-client.test.js - Tests for LlmApiClient

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import './setup.js';

// Mock StorageManager
vi.mock('../lib/storage.js', () => ({
  StorageManager: {
    getApiKey: vi.fn(() => Promise.resolve('test-api-key')),
    getApiBaseUrl: vi.fn(() => Promise.resolve('https://api.openai.com/v1')),
    getModel: vi.fn(() => Promise.resolve('gpt-4'))
  }
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('LlmApiClient', () => {
  let LlmApiClient;
  let ApiError;
  let apiClient;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockFetch.mockReset();

    // Re-import to get fresh instance
    vi.resetModules();

    // Import error class
    const errorsModule = await import('../lib/errors.js');
    ApiError = errorsModule.ApiError;

    const module = await import('../lib/api-client.js');
    LlmApiClient = module.LlmApiClient;
    apiClient = new LlmApiClient();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default values', () => {
      expect(apiClient.defaultTimeout).toBe(60000);
      expect(apiClient.maxRetries).toBe(3);
      expect(apiClient.retryDelay).toBe(1000);
    });
  });

  describe('getConfig()', () => {
    it('should return API configuration', async () => {
      const config = await apiClient.getConfig();

      expect(config).toEqual({
        apiKey: 'test-api-key',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4'
      });
    });

    it('should use default baseUrl if not set', async () => {
      const { StorageManager } = await import('../lib/storage.js');
      StorageManager.getApiBaseUrl.mockResolvedValueOnce(null);

      const config = await apiClient.getConfig();

      expect(config.baseUrl).toBe('https://api.openai.com/v1');
    });

    it('should use default model if not set', async () => {
      const { StorageManager } = await import('../lib/storage.js');
      StorageManager.getModel.mockResolvedValueOnce(null);

      const config = await apiClient.getConfig();

      expect(config.model).toBe('gpt-4');
    });
  });

  describe('chatCompletion()', () => {
    it('should make successful API request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: { content: 'Hello, how can I help?' }
              }
            ]
          })
      });

      const messages = [{ role: 'user', content: 'Hello' }];

      const result = await apiClient.chatCompletion(messages);

      expect(result).toBe('Hello, how can I help?');
    });

    it('should handle API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () =>
          Promise.resolve({
            error: { message: 'Invalid API key' }
          })
      });

      const messages = [{ role: 'user', content: 'Hello' }];

      await expect(apiClient.chatCompletion(messages)).rejects.toThrow();
    });

    it('should handle abort signal', async () => {
      const controller = new AbortController();
      controller.abort();

      const messages = [{ role: 'user', content: 'Hello' }];

      await expect(
        apiClient.chatCompletion(messages, { signal: controller.signal })
      ).rejects.toThrow();
    });
  });

  describe('shouldNotRetry()', () => {
    it('should not retry 401 errors', () => {
      const error = new ApiError('Unauthorized', 401);
      expect(apiClient.shouldNotRetry(error)).toBe(true);
    });

    it('should not retry 400 errors', () => {
      const error = new ApiError('Bad Request', 400);
      expect(apiClient.shouldNotRetry(error)).toBe(true);
    });

    it('should retry other errors', () => {
      const error = new ApiError('Server Error', 500);
      expect(apiClient.shouldNotRetry(error)).toBe(false);
    });

    it('should retry network errors', () => {
      const error = new Error('Network error');
      expect(apiClient.shouldNotRetry(error)).toBe(false);
    });
  });

  describe('getRetryDelay()', () => {
    it('should use exponential backoff', () => {
      const error = new Error('Test');

      const delay1 = apiClient.getRetryDelay(error, 1);
      const delay2 = apiClient.getRetryDelay(error, 2);
      const delay3 = apiClient.getRetryDelay(error, 3);

      // Allow for jitter
      expect(delay1).toBeGreaterThan(500);
      expect(delay2).toBeGreaterThan(delay1 * 0.9);
      expect(delay3).toBeGreaterThan(delay2 * 0.9);
    });

    it('should cap delay at max', () => {
      const error = new Error('Test');
      const delay = apiClient.getRetryDelay(error, 10);

      expect(delay).toBeLessThanOrEqual(10000);
    });
  });

  describe('sleep()', () => {
    it('should delay for specified time', async () => {
      const start = Date.now();
      await apiClient.sleep(50);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(45);
    });
  });

  describe('testConnection()', () => {
    it('should return success for valid connection', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true
      });

      const result = await apiClient.testConnection();

      expect(result.success).toBe(true);
    });

    it('should return error for failed connection', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () =>
          Promise.resolve({
            error: { message: 'Unauthorized' }
          })
      });

      const result = await apiClient.testConnection();

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('listModels()', () => {
    it('should return list of models', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [{ id: 'gpt-4' }, { id: 'gpt-3.5-turbo' }, { id: 'claude-2' }]
          })
      });

      const models = await apiClient.listModels();

      expect(models.length).toBe(3);
      expect(models.map(m => m.id)).toContain('gpt-4');
    });

    it('should return empty array on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const models = await apiClient.listModels();

      expect(models).toEqual([]);
    });

    it('should filter to relevant models', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [
              { id: 'gpt-4' },
              { id: 'whisper-1' }, // Should be filtered out
              { id: 'llama-2' }
            ]
          })
      });

      const models = await apiClient.listModels();

      expect(models.length).toBe(2);
      expect(models.map(m => m.id)).not.toContain('whisper-1');
    });
  });

  describe('parseErrorResponse()', () => {
    it('should parse JSON error', async () => {
      const response = {
        json: () => Promise.resolve({ error: { message: 'Test error' } })
      };

      const body = await apiClient.parseErrorResponse(response);

      expect(body).toEqual({ error: { message: 'Test error' } });
    });

    it('should handle non-JSON response', async () => {
      const response = {
        json: () => Promise.reject(new Error('Not JSON')),
        text: () => Promise.resolve('Plain text error')
      };

      const body = await apiClient.parseErrorResponse(response);

      expect(body.error.message).toBe('Plain text error');
    });
  });
});
