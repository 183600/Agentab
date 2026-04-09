// test/recovery.test.js - Tests for RecoveryManager and CircuitBreaker

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RecoveryManager, RecoveryStrategy, CircuitBreaker } from '../lib/recovery.js';

describe('RecoveryManager', () => {
  let manager;

  beforeEach(() => {
    manager = new RecoveryManager({
      enableRecovery: true,
      enableLogging: false
    });
  });

  describe('executeWithRecovery', () => {
    it('should return result on success', async () => {
      const fn = vi.fn(async () => 'success');
      
      const result = await manager.executeWithRecovery(fn, RecoveryStrategy.DEFAULT);
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable errors', async () => {
      let attempts = 0;
      const fn = vi.fn(async () => {
        attempts++;
        if (attempts < 3) {
          const error = new Error('Network error');
          error.name = 'NetworkError';
          throw error;
        }
        return 'success';
      });
      
      const strategy = {
        ...RecoveryStrategy.DEFAULT,
        maxRetries: 3,
        retryableErrors: ['NetworkError']
      };
      
      const result = await manager.executeWithRecovery(fn, strategy);
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should not retry non-retryable errors', async () => {
      const fn = vi.fn(async () => {
        const error = new Error('Non-retryable');
        error.name = 'ValidationError';
        throw error;
      });
      
      const strategy = {
        ...RecoveryStrategy.DEFAULT,
        retryableErrors: ['NetworkError']
      };
      
      await expect(manager.executeWithRecovery(fn, strategy)).rejects.toThrow('Non-retryable');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should throw after max retries', async () => {
      const fn = vi.fn(async () => {
        const error = new Error('Network error');
        error.name = 'NetworkError';
        throw error;
      });
      
      const strategy = {
        maxRetries: 2,
        baseDelay: 10,
        maxDelay: 100,
        backoffMultiplier: 1,
        retryableErrors: ['NetworkError']
      };
      
      await expect(manager.executeWithRecovery(fn, strategy)).rejects.toThrow('Network error');
      expect(fn).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });
  });

  describe('isRetryable', () => {
    it('should identify retryable errors by name', () => {
      const error = new Error();
      error.name = 'NetworkError';
      
      const strategy = { retryableErrors: ['NetworkError'] };
      
      expect(manager.isRetryable(error, strategy)).toBe(true);
    });

    it('should identify retryable errors by message', () => {
      const error = new Error('ECONNREFUSED');
      
      const strategy = { retryableErrors: ['ECONNREFUSED'] };
      
      expect(manager.isRetryable(error, strategy)).toBe(true);
    });

    it('should identify retryable errors by status code', () => {
      const error = new Error();
      error.statusCode = 429;
      
      const strategy = { retryableStatusCodes: [429, 500] };
      
      expect(manager.isRetryable(error, strategy)).toBe(true);
    });
  });

  describe('statistics', () => {
    it('should track recovery statistics', async () => {
      const fn = vi.fn(async () => 'success');
      
      await manager.executeWithRecovery(fn, RecoveryStrategy.DEFAULT);
      
      const stats = manager.getStats();
      expect(stats.total).toBe(1);
      expect(stats.successful).toBe(1);
      expect(stats.failed).toBe(0);
    });
  });
});

describe('CircuitBreaker', () => {
  let breaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({
      failureThreshold: 3,
      recoveryTimeout: 100,
      monitoringPeriod: 1000
    });
  });

  describe('normal operation', () => {
    it('should execute function successfully', async () => {
      const fn = vi.fn(async () => 'success');
      
      const result = await breaker.execute(fn);
      
      expect(result).toBe('success');
      expect(breaker.state).toBe('CLOSED');
    });

    it('should remain closed on success', async () => {
      const fn = vi.fn(async () => 'success');
      
      for (let i = 0; i < 5; i++) {
        await breaker.execute(fn);
      }
      
      expect(breaker.state).toBe('CLOSED');
    });
  });

  describe('failure handling', () => {
    it('should open after threshold failures', async () => {
      const fn = vi.fn(async () => {
        throw new Error('Failure');
      });
      
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(fn);
        } catch (e) {
          // Expected
        }
      }
      
      expect(breaker.state).toBe('OPEN');
    });

    it('should reject requests when open', async () => {
      // Force open
      breaker.state = 'OPEN';
      breaker.nextAttemptTime = Date.now() + 10000;
      
      await expect(breaker.execute(async () => 'success')).rejects.toThrow('Circuit breaker is OPEN');
    });

    it('should transition to half-open after timeout', async () => {
      breaker.state = 'OPEN';
      breaker.nextAttemptTime = Date.now() - 1; // Past
      
      const fn = vi.fn(async () => 'success');
      
      await breaker.execute(fn);
      
      expect(breaker.state).toBe('CLOSED');
    });
  });

  describe('recovery', () => {
    it('should close after successful half-open', async () => {
      breaker.state = 'HALF_OPEN';
      
      const fn = vi.fn(async () => 'success');
      
      await breaker.execute(fn);
      
      expect(breaker.state).toBe('CLOSED');
    });

    it('should open again after failed half-open', async () => {
      breaker.state = 'HALF_OPEN';
      
      const fn = vi.fn(async () => {
        throw new Error('Failure');
      });
      
      try {
        await breaker.execute(fn);
      } catch (e) {
        // Expected
      }
      
      // After failure in HALF_OPEN, state goes to OPEN
      expect(breaker.state).toBe('OPEN');
    });
  });

  describe('reset', () => {
    it('should reset to closed state', () => {
      breaker.state = 'OPEN';
      breaker.failures = [1, 2, 3];
      
      breaker.reset();
      
      expect(breaker.state).toBe('CLOSED');
      expect(breaker.failures).toEqual([]);
    });
  });
});