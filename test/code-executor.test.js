// test/code-executor.test.js - Tests for CodeExecutor

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CodeExecutor, CHROME_AGENT_HELPERS } from '../lib/code-executor.js';
import { mockChromeScripting, mockChromeStorage } from './setup.js';

describe('CodeExecutor', () => {
  let executor;

  beforeEach(() => {
    vi.clearAllMocks();
    executor = new CodeExecutor();
  });

  afterEach(() => {
    if (executor) {
      executor.destroy();
    }
  });

  describe('constructor', () => {
    it('should create executor with default options', () => {
      expect(executor).toBeDefined();
      expect(executor.promiseTimeout).toBe(30000);
      expect(executor._destroyed).toBe(false);
    });

    it('should accept custom options', () => {
      const customExecutor = new CodeExecutor({
        maxExecutionsPerMinute: 10,
        promiseTimeout: 5000
      });
      expect(customExecutor.promiseTimeout).toBe(5000);
      expect(customExecutor.rateLimiter.maxExecutions).toBe(10);
      customExecutor.destroy();
    });
  });

  describe('execute', () => {
    it('should reject empty code', async () => {
      const result = await executor.execute(1, '');
      expect(result.success).toBe(false);
      expect(result.error).toContain('non-empty string');
    });

    it('should reject null code', async () => {
      const result = await executor.execute(1, null);
      expect(result.success).toBe(false);
    });

    it('should reject code with eval()', async () => {
      const result = await executor.execute(1, 'eval("alert(1)")');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Blocked');
    });

    it('should reject code with Function constructor', async () => {
      const result = await executor.execute(1, 'new Function("return 1")()');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Blocked');
    });

    it('should reject code with __proto__', async () => {
      const result = await executor.execute(1, 'const x = {}; x.__proto__ = {}');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Prototype pollution');
    });

    it('should reject code with Chrome API access', async () => {
      const result = await executor.execute(1, 'chrome.storage.local.get("key")');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Chrome API');
    });

    it('should execute valid code', async () => {
      mockChromeScripting.executeScript.mockResolvedValueOnce([
        { result: 42 }
      ]);

      const result = await executor.execute(1, 'return 1 + 1');
      expect(result.success).toBe(true);
      expect(result.result).toBe(42);
    });

    it('should handle execution errors', async () => {
      mockChromeScripting.executeScript.mockResolvedValueOnce([
        { result: { __error: true, message: 'Test error' } }
      ]);

      const result = await executor.execute(1, 'throw new Error("test")');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Test error');
    });

    it('should handle Chrome errors', async () => {
      mockChromeScripting.executeScript.mockRejectedValueOnce(
        new Error('Cannot access a chrome:// URL')
      );

      const result = await executor.execute(1, 'return 1');
      expect(result.success).toBe(false);
      expect(result.error).toContain('restricted page');
    });

    it('should handle tab closed error', async () => {
      mockChromeScripting.executeScript.mockRejectedValueOnce(
        new Error('No tab with id: 123')
      );

      const result = await executor.execute(123, 'return 1');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Tab was closed');
    });

    it('should rate limit excessive executions', async () => {
      // Create executor with very low limit
      const limitedExecutor = new CodeExecutor({ maxExecutionsPerMinute: 2 });
      
      mockChromeScripting.executeScript.mockResolvedValue([{ result: true }]);

      // First two should succeed
      await limitedExecutor.execute(1, 'return 1');
      await limitedExecutor.execute(1, 'return 1');

      // Third should be rate limited
      const result = await limitedExecutor.execute(1, 'return 1');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Rate limit');

      limitedExecutor.destroy();
    });
  });

  describe('destroy', () => {
    it('should mark executor as destroyed', () => {
      executor.destroy();
      expect(executor.isDestroyed()).toBe(true);
    });

    it('should reject execution after destroy', async () => {
      executor.destroy();
      const result = await executor.execute(1, 'return 1');
      expect(result.success).toBe(false);
      expect(result.error).toContain('destroyed');
    });

    it('should be idempotent', () => {
      executor.destroy();
      executor.destroy();
      expect(executor.isDestroyed()).toBe(true);
    });
  });

  describe('getRateLimitStats', () => {
    it('should return rate limit stats', () => {
      const stats = executor.getRateLimitStats();
      expect(stats).toHaveProperty('current');
      expect(stats).toHaveProperty('max');
      expect(stats).toHaveProperty('remaining');
      expect(stats).toHaveProperty('windowMs');
    });
  });

  describe('CHROME_AGENT_HELPERS', () => {
    it('should be a non-empty string', () => {
      expect(CHROME_AGENT_HELPERS).toBeDefined();
      expect(typeof CHROME_AGENT_HELPERS).toBe('string');
      expect(CHROME_AGENT_HELPERS.length).toBeGreaterThan(100);
    });

    it('should contain __chromeAgent definition', () => {
      expect(CHROME_AGENT_HELPERS).toContain('__chromeAgent');
    });

    it('should contain waitForElement helper', () => {
      expect(CHROME_AGENT_HELPERS).toContain('waitForElement');
    });

    it('should contain sleep helper', () => {
      expect(CHROME_AGENT_HELPERS).toContain('sleep');
    });

    it('should contain click helper', () => {
      expect(CHROME_AGENT_HELPERS).toContain('click:');
    });

    it('should contain type helper', () => {
      expect(CHROME_AGENT_HELPERS).toContain('type:');
    });
  });
});
