// test/performance.test.js - Tests for performance monitoring

import { describe, it, expect, beforeEach, vi } from 'vitest';
import './setup.js';
import {
  PerformanceMetrics,
  PerformanceTracker,
  metrics,
  tracker,
  perf
} from '../lib/performance.js';

describe('PerformanceMetrics', () => {
  let testMetrics;

  beforeEach(() => {
    testMetrics = new PerformanceMetrics({ reportInterval: 0 });
  });

  describe('constructor', () => {
    it('should create metrics with default options', () => {
      const m = new PerformanceMetrics({ reportInterval: 0 });
      expect(m.options.maxSamples).toBe(100);
    });

    it('should accept custom options', () => {
      const m = new PerformanceMetrics({ maxSamples: 50, reportInterval: 0 });
      expect(m.options.maxSamples).toBe(50);
    });
  });

  describe('timers', () => {
    it('should start and end timer', () => {
      const id = testMetrics.startTimer('operation');
      expect(id).toBeDefined();
      const duration = testMetrics.endTimer(id);
      expect(duration).toBeGreaterThanOrEqual(0);
    });

    it('should record timer duration', () => {
      const id = testMetrics.startTimer('test');
      testMetrics.endTimer(id);
      const stats = testMetrics.getStats('test');
      expect(stats).toBeDefined();
      expect(stats.count).toBe(1);
    });

    it('should return 0 for unknown timer', () => {
      const duration = testMetrics.endTimer('unknown');
      expect(duration).toBe(0);
    });
  });

  describe('record()', () => {
    it('should record metric value', () => {
      testMetrics.record('test', 100);
      const stats = testMetrics.getStats('test');
      expect(stats.count).toBe(1);
      expect(stats.sum).toBe(100);
    });

    it('should calculate statistics', () => {
      testMetrics.record('test', 10);
      testMetrics.record('test', 20);
      testMetrics.record('test', 30);
      const stats = testMetrics.getStats('test');
      expect(stats.avg).toBe(20);
      expect(stats.min).toBe(10);
      expect(stats.max).toBe(30);
    });

    it('should maintain max samples', () => {
      const smallMetrics = new PerformanceMetrics({ maxSamples: 5, reportInterval: 0 });
      for (let i = 0; i < 10; i++) {
        smallMetrics.record('test', i);
      }
      const stats = smallMetrics.getStats('test');
      expect(stats.count).toBe(10); // count includes all
    });
  });

  describe('counters', () => {
    it('should increment counter', () => {
      testMetrics.increment('requests');
      expect(testMetrics.getCounter('requests')).toBe(1);
    });

    it('should increment by amount', () => {
      testMetrics.increment('requests', 5);
      expect(testMetrics.getCounter('requests')).toBe(5);
    });

    it('should return 0 for unknown counter', () => {
      expect(testMetrics.getCounter('unknown')).toBe(0);
    });
  });

  describe('getStats()', () => {
    it('should return null for unknown metric', () => {
      expect(testMetrics.getStats('unknown')).toBeNull();
    });

    it('should calculate percentiles', () => {
      for (let i = 0; i < 100; i++) {
        testMetrics.record('test', i);
      }
      const stats = testMetrics.getStats('test');
      expect(stats.median).toBeDefined();
      expect(stats.p95).toBeDefined();
      expect(stats.p99).toBeDefined();
    });
  });

  describe('getAllStats()', () => {
    it('should return all metrics', () => {
      testMetrics.record('metric1', 1);
      testMetrics.record('metric2', 2);
      const stats = testMetrics.getAllStats();
      expect(stats.metric1).toBeDefined();
      expect(stats.metric2).toBeDefined();
    });
  });

  describe('subscribe()', () => {
    it('should notify on metric', () => {
      const listener = vi.fn();
      testMetrics.subscribe(listener);
      testMetrics.record('test', 1);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'metric',
          name: 'test'
        })
      );
    });

    it('should notify on counter', () => {
      const listener = vi.fn();
      testMetrics.subscribe(listener);
      testMetrics.increment('test');
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'counter',
          name: 'test'
        })
      );
    });
  });

  describe('clear()', () => {
    it('should clear all data', () => {
      testMetrics.record('test', 1);
      testMetrics.increment('counter');
      testMetrics.clear();
      expect(testMetrics.getStats('test')).toBeNull();
      expect(testMetrics.getCounter('counter')).toBe(0);
    });
  });

  describe('destroy()', () => {
    it('should clear and stop timer', () => {
      testMetrics.destroy();
      expect(testMetrics.metrics.size).toBe(0);
    });
  });
});

describe('PerformanceTracker', () => {
  let testTracker;
  let testMetrics;

  beforeEach(() => {
    testMetrics = new PerformanceMetrics({ reportInterval: 0 });
    testTracker = new PerformanceTracker(testMetrics);
  });

  describe('track()', () => {
    it('should track async function', async () => {
      const result = await testTracker.track('test', async () => 'value');
      expect(result).toBe('value');
      expect(testMetrics.getStats('test')).toBeDefined();
    });

    it('should track failed function', async () => {
      await expect(
        testTracker.track('test', async () => {
          throw new Error('failed');
        })
      ).rejects.toThrow('failed');
      expect(testMetrics.getCounter('errors.test')).toBe(1);
    });
  });

  describe('trackSync()', () => {
    it('should track sync function', () => {
      const result = testTracker.trackSync('test', () => 'value');
      expect(result).toBe('value');
      expect(testMetrics.getStats('test')).toBeDefined();
    });
  });

  describe('trackApi()', () => {
    it('should track API call', async () => {
      await testTracker.trackApi('users', async () => [1, 2, 3]);
      expect(testMetrics.getStats('api.users')).toBeDefined();
    });
  });

  describe('trackDom()', () => {
    it('should track DOM operation', () => {
      testTracker.trackDom('query', () => document.createElement('div'));
      expect(testMetrics.getStats('dom.query')).toBeDefined();
    });
  });

  describe('trackInteraction()', () => {
    it('should track user interaction', () => {
      testTracker.trackInteraction('click');
      expect(testMetrics.getCounter('interaction.click')).toBe(1);
    });
  });
});

describe('perf utilities', () => {
  describe('mark()', () => {
    it('should create performance mark', () => {
      expect(() => perf.mark('test')).not.toThrow();
    });
  });

  describe('measure()', () => {
    it('should create performance measure', () => {
      perf.mark('start');
      perf.mark('end');
      expect(() => perf.measure('test', 'start', 'end')).not.toThrow();
    });
  });

  describe('getEntries()', () => {
    it('should return entries array', () => {
      const entries = perf.getEntries();
      expect(Array.isArray(entries)).toBe(true);
    });
  });

  describe('getEntriesByType()', () => {
    it('should return filtered entries', () => {
      const entries = perf.getEntriesByType('mark');
      expect(Array.isArray(entries)).toBe(true);
    });
  });

  describe('clear()', () => {
    it('should clear performance entries', () => {
      expect(() => perf.clear()).not.toThrow();
    });
  });
});

describe('Default instances', () => {
  it('should have default metrics', () => {
    expect(metrics).toBeInstanceOf(PerformanceMetrics);
  });

  it('should have default tracker', () => {
    expect(tracker).toBeInstanceOf(PerformanceTracker);
  });
});
