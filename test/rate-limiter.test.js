// test/rate-limiter.test.js - Tests for RateLimiter

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RateLimiter } from '../lib/rate-limiter.js';

describe('RateLimiter', () => {
  let limiter;

  beforeEach(() => {
    vi.useFakeTimers();
    limiter = new RateLimiter({
      maxExecutions: 3,
      windowMs: 1000,
      autoCleanup: false // Disable auto cleanup for predictable tests
    });
  });

  afterEach(() => {
    limiter.destroy();
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should create limiter with default options', () => {
      const defaultLimiter = new RateLimiter();
      expect(defaultLimiter.maxExecutions).toBe(30);
      expect(defaultLimiter.windowMs).toBe(60000);
      defaultLimiter.destroy();
    });

    it('should accept custom options', () => {
      expect(limiter.maxExecutions).toBe(3);
      expect(limiter.windowMs).toBe(1000);
    });

    it('should setup auto cleanup by default', () => {
      const autoLimiter = new RateLimiter({ windowMs: 100 });
      expect(autoLimiter._cleanupTimer).toBeDefined();
      autoLimiter.destroy();
    });

    it('should skip auto cleanup when disabled', () => {
      const noCleanupLimiter = new RateLimiter({ autoCleanup: false });
      expect(noCleanupLimiter._cleanupTimer).toBeNull();
      noCleanupLimiter.destroy();
    });
  });

  describe('isLimited', () => {
    it('should return false initially', () => {
      expect(limiter.isLimited()).toBe(false);
    });

    it('should return true when limit reached', () => {
      limiter.record();
      limiter.record();
      limiter.record();
      expect(limiter.isLimited()).toBe(true);
    });

    it('should return false after window expires', () => {
      limiter.record();
      limiter.record();
      limiter.record();
      expect(limiter.isLimited()).toBe(true);

      vi.advanceTimersByTime(1001);
      expect(limiter.isLimited()).toBe(false);
    });
  });

  describe('record', () => {
    it('should record execution', () => {
      limiter.record();
      expect(limiter.executions.length).toBe(1);
    });

    it('should cleanup old entries on record', () => {
      limiter.record();
      vi.advanceTimersByTime(1001);
      limiter.record();

      // Should have cleaned up the old entry
      expect(limiter.executions.length).toBe(1);
    });
  });

  describe('getRemaining', () => {
    it('should return max when no executions', () => {
      expect(limiter.getRemaining()).toBe(3);
    });

    it('should return correct remaining count', () => {
      limiter.record();
      expect(limiter.getRemaining()).toBe(2);

      limiter.record();
      expect(limiter.getRemaining()).toBe(1);

      limiter.record();
      expect(limiter.getRemaining()).toBe(0);
    });

    it('should not go below zero', () => {
      limiter.record();
      limiter.record();
      limiter.record();
      limiter.record(); // Extra
      expect(limiter.getRemaining()).toBe(0);
    });
  });

  describe('getTimeUntilAvailable', () => {
    it('should return 0 when not limited', () => {
      expect(limiter.getTimeUntilAvailable()).toBe(0);
    });

    it('should return time until oldest execution expires', () => {
      limiter.record();
      limiter.record();
      limiter.record();

      vi.advanceTimersByTime(300);
      const timeRemaining = limiter.getTimeUntilAvailable();
      expect(timeRemaining).toBeCloseTo(700, -1);
    });

    it('should return 0 after window expires', () => {
      limiter.record();
      limiter.record();
      limiter.record();

      vi.advanceTimersByTime(1001);
      expect(limiter.getTimeUntilAvailable()).toBe(0);
    });
  });

  describe('reset', () => {
    it('should clear all executions', () => {
      limiter.record();
      limiter.record();
      limiter.record();

      limiter.reset();

      expect(limiter.executions.length).toBe(0);
      expect(limiter.isLimited()).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should return stats object', () => {
      limiter.record();
      const stats = limiter.getStats();

      expect(stats).toEqual({
        current: 1,
        max: 3,
        remaining: 2,
        windowMs: 1000
      });
    });
  });

  describe('cleanup', () => {
    it('should remove expired entries', () => {
      limiter.record();
      vi.advanceTimersByTime(1001);
      limiter.record(); // This triggers cleanup

      const removed = limiter.cleanup();
      expect(removed).toBe(0); // Already cleaned by record
      expect(limiter.executions.length).toBe(1);
    });

    it('should return number of removed entries', () => {
      limiter.record();
      limiter.record();
      vi.advanceTimersByTime(1001);

      const removed = limiter.cleanup();
      expect(removed).toBe(2);
    });
  });

  describe('destroy', () => {
    it('should clear cleanup timer', () => {
      const autoLimiter = new RateLimiter({ windowMs: 100 });
      expect(autoLimiter._cleanupTimer).toBeDefined();

      autoLimiter.destroy();
      expect(autoLimiter._cleanupTimer).toBeNull();
    });

    it('should clear executions', () => {
      limiter.record();
      limiter.destroy();
      expect(limiter.executions.length).toBe(0);
    });

    it('should be idempotent', () => {
      limiter.destroy();
      limiter.destroy();
      expect(limiter._cleanupTimer).toBeNull();
    });
  });
});
