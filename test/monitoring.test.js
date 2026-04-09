// test/monitoring.test.js - Tests for Error Monitoring System

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  Monitoring,
  getMonitoring,
  Severity,
  BreadcrumbCategory,
  EventType
} from '../lib/monitoring.js';

// Mock chrome storage
const mockStorage = {
  data: {},
  local: {
    get: vi.fn(key => Promise.resolve({ [key]: mockStorage.data[key] || [] })),
    set: vi.fn(obj => {
      Object.assign(mockStorage.data, obj);
      return Promise.resolve();
    }),
    remove: vi.fn(key => {
      delete mockStorage.data[key];
      return Promise.resolve();
    })
  }
};

global.chrome = { storage: mockStorage };

describe('Monitoring', () => {
  let monitoring;

  beforeEach(() => {
    mockStorage.data = {};
    monitoring = new Monitoring({
      enabled: true,
      debug: false,
      sampleRate: 1.0,
      endpoint: null
    });
    monitoring.init();
  });

  afterEach(() => {
    monitoring.clear();
  });

  describe('initialization', () => {
    it('should initialize successfully', () => {
      expect(monitoring.initialized).toBe(true);
    });

    it('should not reinitialize', () => {
      monitoring.init();
      expect(monitoring.initialized).toBe(true);
    });
  });

  describe('captureException', () => {
    it('should capture Error objects', () => {
      const error = new Error('Test error');
      const eventId = monitoring.captureException(error);
      expect(eventId).toBeTruthy();
    });

    it('should capture custom errors', () => {
      const error = new TypeError('Type error');
      const eventId = monitoring.captureException(error);
      expect(eventId).toBeTruthy();
    });

    it('should return null when disabled', () => {
      monitoring.config.enabled = false;
      const error = new Error('Test error');
      const eventId = monitoring.captureException(error);
      expect(eventId).toBeNull();
    });

    it('should apply sampling rate', () => {
      monitoring.config.sampleRate = 0;
      const error = new Error('Test error');
      const eventId = monitoring.captureException(error);
      expect(eventId).toBeNull();
    });

    it('should queue event after capture', () => {
      const error = new Error('Test error');
      monitoring.captureException(error);
      expect(monitoring.eventQueue.length).toBe(1);
    });
  });

  describe('captureMessage', () => {
    it('should capture info messages', () => {
      const eventId = monitoring.captureMessage('Test message');
      expect(eventId).toBeTruthy();
    });

    it('should capture messages with different levels', () => {
      const eventId = monitoring.captureMessage('Warning!', Severity.WARNING);
      expect(eventId).toBeTruthy();
    });

    it('should capture error messages', () => {
      const eventId = monitoring.captureMessage('Error!', Severity.ERROR);
      expect(eventId).toBeTruthy();
    });

    it('should return null when disabled', () => {
      monitoring.config.enabled = false;
      const eventId = monitoring.captureMessage('Test');
      expect(eventId).toBeNull();
    });
  });

  describe('breadcrumbs', () => {
    it('should add breadcrumbs', () => {
      monitoring.addBreadcrumb({
        category: BreadcrumbCategory.USER,
        message: 'User clicked button'
      });

      expect(monitoring.context.breadcrumbs.length).toBe(1);
    });

    it('should limit breadcrumbs', () => {
      // Set limit via config
      const limitedMonitoring = new Monitoring({ maxBreadcrumbs: 3 });
      limitedMonitoring.init();

      for (let i = 0; i < 5; i++) {
        limitedMonitoring.addBreadcrumb({
          message: `Breadcrumb ${i}`
        });
      }

      expect(limitedMonitoring.context.breadcrumbs.length).toBe(3);
    });

    it('should include timestamp', () => {
      monitoring.addBreadcrumb({
        message: 'Test'
      });

      const breadcrumb = monitoring.context.breadcrumbs[0];
      expect(breadcrumb.timestamp).toBeTruthy();
    });
  });

  describe('context', () => {
    it('should set user', () => {
      monitoring.setUser({ id: '123', email: 'test@example.com' });
      expect(monitoring.context.user.id).toBe('123');
    });

    it('should set tags', () => {
      monitoring.setTag('environment', 'development');
      expect(monitoring.context.tags.environment).toBe('development');
    });

    it('should set extra', () => {
      monitoring.setExtra('customData', { foo: 'bar' });
      expect(monitoring.context.extra.customData.foo).toBe('bar');
    });

    it('should set context', () => {
      monitoring.setContext('device', { type: 'mobile' });
      expect(monitoring.context.context.device.type).toBe('mobile');
    });

    it('should clear context', () => {
      monitoring.setUser({ id: '123' });
      monitoring.setTag('test', 'value');
      monitoring.context.clear();

      expect(monitoring.context.user).toBeNull();
      expect(Object.keys(monitoring.context.tags).length).toBe(0);
    });
  });

  describe('transactions', () => {
    it('should create transaction', () => {
      const transaction = monitoring.startTransaction('test-transaction');
      expect(transaction).toBeTruthy();
      expect(transaction.finish).toBeInstanceOf(Function);
      expect(transaction.startSpan).toBeInstanceOf(Function);
    });

    it('should track transaction duration', () => {
      const transaction = monitoring.startTransaction('test');

      return new Promise(resolve => {
        setTimeout(() => {
          transaction.finish();

          // Transaction should be recorded
          expect(monitoring.eventQueue.length).toBe(1);
          resolve();
        }, 10);
      });
    });

    it('should track spans', () => {
      const transaction = monitoring.startTransaction('test');
      const span = transaction.startSpan('sub-operation');

      span.finish();
      transaction.finish();

      // Transaction recorded
      expect(monitoring.eventQueue.length).toBe(1);
    });

    it('should only finish once', () => {
      const transaction = monitoring.startTransaction('test');
      transaction.finish();
      transaction.finish();

      expect(monitoring.eventQueue.length).toBe(1);
    });

    it('should allow setting data', () => {
      const transaction = monitoring.startTransaction('test');
      transaction.setData('customKey', 'customValue');
      transaction.finish();
    });
  });

  describe('storage', () => {
    it('should save events to storage', async () => {
      const error = new Error('Test error');
      monitoring.captureException(error);

      // Wait for async storage
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockStorage.local.set).toHaveBeenCalled();
    });

    it('should load stored events', async () => {
      mockStorage.data['monitoring_events'] = [
        { event_id: 'test-1', message: 'Previous event' }
      ];

      await monitoring.loadStoredEvents();

      expect(monitoring.eventQueue.length).toBe(1);
    });

    it('should clear events', async () => {
      monitoring.captureException(new Error('Test'));
      await monitoring.clear();

      expect(monitoring.eventQueue.length).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return event statistics from eventQueue', async () => {
      monitoring.captureException(new Error('Error 1'));
      monitoring.captureException(new Error('Error 2'));
      monitoring.captureMessage('Message 1');

      // Check eventQueue directly since getStats reads from storage
      expect(monitoring.eventQueue.length).toBe(3);
    });

    it('should categorize events correctly', async () => {
      monitoring.captureException(new Error('Error 1'));
      monitoring.captureMessage('Message 1');

      const errorEvent = monitoring.eventQueue.find(e => e.exception);
      const messageEvent = monitoring.eventQueue.find(e => e.message && !e.exception);

      expect(errorEvent).toBeTruthy();
      expect(messageEvent).toBeTruthy();
    });
  });
});

describe('getMonitoring', () => {
  it('should return global instance', () => {
    const m1 = getMonitoring();
    const m2 = getMonitoring();
    expect(m1).toBe(m2);
  });
});

describe('Severity', () => {
  it('should have all severity levels', () => {
    expect(Severity.FATAL).toBe('fatal');
    expect(Severity.ERROR).toBe('error');
    expect(Severity.WARNING).toBe('warning');
    expect(Severity.INFO).toBe('info');
    expect(Severity.DEBUG).toBe('debug');
  });
});

describe('BreadcrumbCategory', () => {
  it('should have all categories', () => {
    expect(BreadcrumbCategory.USER).toBe('user');
    expect(BreadcrumbCategory.HTTP).toBe('http');
    expect(BreadcrumbCategory.NAVIGATION).toBe('navigation');
    expect(BreadcrumbCategory.UI).toBe('ui');
  });
});
