// test/logger.test.js - Tests for logging system

import { describe, it, expect, beforeEach, vi } from 'vitest';
import './setup.js';
import { Logger, LogLevel, logger, agentLogger, apiLogger } from '../lib/logger.js';

describe('LogLevel', () => {
  it('should have correct order', () => {
    expect(LogLevel.DEBUG).toBeLessThan(LogLevel.INFO);
    expect(LogLevel.INFO).toBeLessThan(LogLevel.WARN);
    expect(LogLevel.WARN).toBeLessThan(LogLevel.ERROR);
    expect(LogLevel.ERROR).toBeLessThan(LogLevel.NONE);
  });
});

describe('Logger', () => {
  let testLogger;

  beforeEach(() => {
    testLogger = new Logger({
      name: 'Test',
      level: LogLevel.DEBUG,
      persist: false
    });
  });

  describe('constructor', () => {
    it('should create logger with default options', () => {
      const log = new Logger();
      expect(log.options.name).toBe('Agentab');
      // Default level is auto-detected, could be DEBUG or INFO depending on environment
      expect([LogLevel.DEBUG, LogLevel.INFO]).toContain(log.options.level);
    });

    it('should accept custom options', () => {
      const log = new Logger({ name: 'Custom', level: LogLevel.DEBUG });
      expect(log.options.name).toBe('Custom');
      expect(log.options.level).toBe(LogLevel.DEBUG);
    });
  });

  describe('log levels', () => {
    it('should log debug message', () => {
      const spy = vi.spyOn(console, 'debug');
      testLogger.debug('test message');
      expect(spy).toHaveBeenCalled();
    });

    it('should log info message', () => {
      const spy = vi.spyOn(console, 'info');
      testLogger.info('test message');
      expect(spy).toHaveBeenCalled();
    });

    it('should log warning message', () => {
      const spy = vi.spyOn(console, 'warn');
      testLogger.warn('test message');
      expect(spy).toHaveBeenCalled();
    });

    it('should log error message', () => {
      const spy = vi.spyOn(console, 'error');
      testLogger.error('test message');
      expect(spy).toHaveBeenCalled();
    });

    it('should not log below level', () => {
      const warnLogger = new Logger({ level: LogLevel.WARN, persist: false });
      const debugSpy = vi.spyOn(console, 'debug');
      const infoSpy = vi.spyOn(console, 'info');

      warnLogger.debug('debug');
      warnLogger.info('info');

      expect(debugSpy).not.toHaveBeenCalled();
      expect(infoSpy).not.toHaveBeenCalled();
    });
  });

  describe('entries', () => {
    it('should store log entries', () => {
      testLogger.info('test');
      const entries = testLogger.getEntries();
      expect(entries.length).toBe(1);
      expect(entries[0].message).toBe('test');
      expect(entries[0].level).toBe('INFO');
    });

    it('should filter entries by level', () => {
      testLogger.info('info');
      testLogger.error('error');
      const errorEntries = testLogger.getEntries('ERROR');
      expect(errorEntries.length).toBe(1);
      expect(errorEntries[0].message).toBe('error');
    });

    it('should limit max entries', () => {
      const smallLogger = new Logger({ maxEntries: 5, persist: false });
      for (let i = 0; i < 10; i++) {
        smallLogger.info(`message ${i}`);
      }
      const entries = smallLogger.getEntries();
      expect(entries.length).toBe(5);
    });
  });

  describe('formatEntry()', () => {
    it('should create entry with timestamp', () => {
      const entry = testLogger.formatEntry('INFO', 'test', { data: 1 });
      expect(entry.timestamp).toBeDefined();
      expect(entry.level).toBe('INFO');
      expect(entry.message).toBe('test');
      expect(entry.data).toEqual({ data: 1 });
    });
  });

  describe('time()', () => {
    it('should track timing', () => {
      const endTimer = testLogger.time('operation');
      const duration = endTimer();
      expect(duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('trace()', () => {
    it('should trace async function', async () => {
      const result = await testLogger.trace('test', async () => 'value');
      expect(result).toBe('value');
    });

    it('should trace failed function', async () => {
      await expect(
        testLogger.trace('test', async () => {
          throw new Error('failed');
        })
      ).rejects.toThrow('failed');
    });
  });

  describe('subscribe()', () => {
    it('should notify listeners', () => {
      const listener = vi.fn();
      testLogger.subscribe(listener);
      testLogger.info('test');
      expect(listener).toHaveBeenCalled();
    });

    it('should return unsubscribe function', () => {
      const listener = vi.fn();
      const unsubscribe = testLogger.subscribe(listener);
      unsubscribe();
      testLogger.info('test');
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('clear()', () => {
    it('should clear entries', () => {
      testLogger.info('test');
      testLogger.clear();
      expect(testLogger.getEntries().length).toBe(0);
    });
  });

  describe('export()', () => {
    it('should export logs as JSON', () => {
      testLogger.info('test');
      const exported = testLogger.export();
      const parsed = JSON.parse(exported);
      expect(parsed.entries.length).toBe(1);
      expect(parsed.source).toBe('Test');
    });
  });

  describe('child()', () => {
    it('should create child logger', () => {
      const child = testLogger.child('SubModule');
      expect(child.options.name).toBe('Test:SubModule');
    });

    it('should inherit options', () => {
      const child = testLogger.child('SubModule');
      expect(child.options.level).toBe(testLogger.options.level);
    });
  });
});

describe('Predefined loggers', () => {
  it('should have default logger', () => {
    expect(logger).toBeInstanceOf(Logger);
  });

  it('should have agent logger', () => {
    expect(agentLogger).toBeInstanceOf(Logger);
    expect(agentLogger.options.name).toContain('Agent');
  });

  it('should have api logger', () => {
    expect(apiLogger).toBeInstanceOf(Logger);
    expect(apiLogger.options.name).toContain('API');
  });
});
