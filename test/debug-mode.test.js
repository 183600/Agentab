/**
 * Tests for Debug Mode module
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';

// Setup DOM environment
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.document = dom.window.document;
global.window = dom.window;
global.performance = {
  now: () => Date.now(),
  memory: {
    usedJSHeapSize: 1024 * 1024 * 50,
    totalJSHeapSize: 1024 * 1024 * 100,
    jsHeapSizeLimit: 1024 * 1024 * 500
  }
};

// Mock logger
vi.mock('../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    setLevel: vi.fn()
  }
}));

// Mock performance module
vi.mock('../lib/performance.js', () => ({
  metrics: new Map(),
  tracker: {
    start: vi.fn(),
    end: vi.fn()
  }
}));

import {
  enableDebugMode,
  disableDebugMode,
  isDebugEnabled,
  Profiler,
  MemoryProfiler,
  ApiProfiler,
  AgentProfiler,
  toggleDebugPanel,
  openDebugPanel,
  closeDebugPanel,
  createTraceId,
  timeAsync,
  getDebugSummary
} from '../lib/debug-mode.js';

describe('Debug Mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset debug state
    if (isDebugEnabled()) {
      disableDebugMode();
    }
  });

  afterEach(() => {
    if (isDebugEnabled()) {
      disableDebugMode();
    }
  });

  describe('enableDebugMode / disableDebugMode', () => {
    it('should enable debug mode', () => {
      enableDebugMode();
      expect(isDebugEnabled()).toBe(true);
    });

    it('should disable debug mode', () => {
      enableDebugMode();
      disableDebugMode();
      expect(isDebugEnabled()).toBe(false);
    });

    it('should accept config options', () => {
      enableDebugMode({
        logLevel: 'debug',
        showTimings: true,
        showMemory: true
      });
      expect(isDebugEnabled()).toBe(true);
    });
  });

  describe('Profiler', () => {
    beforeEach(() => {
      Profiler.clear();
    });

    it('should start profiling session', () => {
      const session = Profiler.startSession('test');
      expect(session.name).toBe('test');
      expect(session.startTime).toBeDefined();
    });

    it('should mark points in session', () => {
      const session = Profiler.startSession('test');
      Profiler.mark(session, 'start');
      Profiler.mark(session, 'end');
      
      expect(session.marks).toHaveLength(2);
      expect(session.marks[0].name).toBe('start');
      expect(session.marks[1].name).toBe('end');
    });

    it('should measure between marks', () => {
      const session = Profiler.startSession('test');
      Profiler.mark(session, 'start');
      Profiler.mark(session, 'end');
      
      const measure = Profiler.measure(session, 'duration', 'start', 'end');
      expect(measure).toBeDefined();
      expect(measure.name).toBe('duration');
      expect(measure.duration).toBeDefined();
    });

    it('should end session', () => {
      const session = Profiler.startSession('test');
      Profiler.endSession(session);
      
      expect(session.endTime).toBeDefined();
      expect(session.totalDuration).toBeDefined();
    });

    it('should get all entries', () => {
      Profiler.startSession('test1');
      Profiler.startSession('test2');
      
      const entries = Profiler.getEntries();
      expect(entries).toHaveLength(2);
    });

    it('should clear entries', () => {
      Profiler.startSession('test');
      Profiler.clear();
      
      expect(Profiler.getEntries()).toHaveLength(0);
    });
  });

  describe('MemoryProfiler', () => {
    it('should get memory usage', () => {
      const usage = MemoryProfiler.getUsage();
      
      expect(usage).not.toBeNull();
      expect(usage.usedJSHeapSize).toBeDefined();
      expect(usage.usedMB).toBeDefined();
    });

    it('should return null when memory API not available', () => {
      const originalMemory = performance.memory;
      performance.memory = undefined;
      
      const usage = MemoryProfiler.getUsage();
      expect(usage).toBeNull();
      
      performance.memory = originalMemory;
    });
  });

  describe('ApiProfiler', () => {
    beforeEach(() => {
      ApiProfiler.clear();
    });

    it('should record API calls', () => {
      ApiProfiler.recordCall({
        url: '/api/test',
        duration: 100,
        success: true
      });
      
      expect(ApiProfiler.calls).toHaveLength(1);
    });

    it('should calculate statistics', () => {
      ApiProfiler.recordCall({ url: '/api/1', duration: 100, success: true });
      ApiProfiler.recordCall({ url: '/api/2', duration: 200, success: true });
      ApiProfiler.recordCall({ url: '/api/3', duration: 150, success: false });
      
      const stats = ApiProfiler.getStats();
      
      expect(stats.total).toBe(3);
      expect(stats.success).toBe(2);
      expect(stats.failed).toBe(1);
      expect(stats.avgDuration).toBe(150);
    });

    it('should handle cache hits', () => {
      ApiProfiler.recordCall({ url: '/api/1', duration: 10, success: true, cached: true });
      ApiProfiler.recordCall({ url: '/api/2', duration: 100, success: true, cached: false });
      
      const stats = ApiProfiler.getStats();
      expect(stats.cacheHitRate).toBe(50);
    });

    it('should limit to last 100 calls', () => {
      for (let i = 0; i < 150; i++) {
        ApiProfiler.recordCall({
          url: `/api/${i}`,
          duration: 100,
          success: true
        });
      }
      
      expect(ApiProfiler.calls.length).toBeLessThanOrEqual(100);
    });

    it('should clear calls', () => {
      ApiProfiler.recordCall({ url: '/api/test', duration: 100, success: true });
      ApiProfiler.clear();
      
      expect(ApiProfiler.calls).toHaveLength(0);
    });
  });

  describe('AgentProfiler', () => {
    beforeEach(() => {
      AgentProfiler.clear();
    });

    it('should record agent executions', () => {
      AgentProfiler.recordExecution({
        prompt: 'Test prompt',
        iterations: 3,
        duration: 1000,
        success: true
      });
      
      expect(AgentProfiler.executions).toHaveLength(1);
    });

    it('should calculate statistics', () => {
      AgentProfiler.recordExecution({ prompt: 'Test 1', iterations: 2, duration: 500, success: true });
      AgentProfiler.recordExecution({ prompt: 'Test 2', iterations: 4, duration: 1000, success: true });
      AgentProfiler.recordExecution({ prompt: 'Test 3', iterations: 3, duration: 750, success: false });
      
      const stats = AgentProfiler.getStats();
      
      expect(stats.total).toBe(3);
      expect(stats.success).toBe(2);
      expect(stats.avgIterations).toBe(3);
      expect(stats.avgDuration).toBe(750);
    });

    it('should limit to last 50 executions', () => {
      for (let i = 0; i < 75; i++) {
        AgentProfiler.recordExecution({
          prompt: `Test ${i}`,
          iterations: 1,
          duration: 100,
          success: true
        });
      }
      
      expect(AgentProfiler.executions.length).toBeLessThanOrEqual(50);
    });

    it('should clear executions', () => {
      AgentProfiler.recordExecution({ prompt: 'Test', iterations: 1, duration: 100, success: true });
      AgentProfiler.clear();
      
      expect(AgentProfiler.executions).toHaveLength(0);
    });
  });

  describe('Debug Panel', () => {
    afterEach(() => {
      closeDebugPanel();
    });

    it('should open debug panel', () => {
      openDebugPanel();
      const panel = document.querySelector('.debug-panel');
      expect(panel).not.toBeNull();
    });

    it('should close debug panel', () => {
      openDebugPanel();
      closeDebugPanel();
      
      const panel = document.querySelector('.debug-panel');
      expect(panel.classList.contains('hidden')).toBe(true);
    });

    it('should toggle debug panel', () => {
      toggleDebugPanel();
      expect(document.querySelector('.debug-panel')).not.toBeNull();
      
      toggleDebugPanel();
      expect(document.querySelector('.debug-panel.hidden')).not.toBeNull();
    });
  });

  describe('createTraceId', () => {
    it('should create unique trace IDs', () => {
      const id1 = createTraceId();
      const id2 = createTraceId();
      
      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id1).not.toBe(id2);
    });

    it('should contain timestamp', () => {
      const id = createTraceId();
      const timestamp = id.split('-')[0];
      
      expect(parseInt(timestamp)).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('timeAsync', () => {
    it('should time async function', async () => {
      const { result, duration } = await timeAsync('test', async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'done';
      });
      
      expect(result).toBe('done');
      expect(duration).toBeGreaterThan(0);
    });

    it('should handle errors', async () => {
      await expect(
        timeAsync('test', async () => {
          throw new Error('Test error');
        })
      ).rejects.toThrow('Test error');
    });
  });

  describe('getDebugSummary', () => {
    beforeEach(() => {
      ApiProfiler.clear();
      AgentProfiler.clear();
    });

    it('should return debug summary', () => {
      const summary = getDebugSummary();
      
      expect(summary).toHaveProperty('enabled');
      expect(summary).toHaveProperty('logCount');
      expect(summary).toHaveProperty('apiStats');
      expect(summary).toHaveProperty('agentStats');
    });

    it('should include memory info when available', () => {
      const summary = getDebugSummary();
      
      expect(summary.memory).toBeDefined();
      expect(summary.memory.usedMB).toBeDefined();
    });
  });
});
