/**
 * Error Monitoring System
 * Provides Sentry-style error tracking and reporting for Chrome Extensions
 */

import { AgentabError, ErrorHandler } from './errors.js';

/**
 * Configuration for monitoring
 */
const MONITORING_CONFIG = {
  // Enable/disable monitoring
  enabled: true,

  // Maximum events to store locally
  maxEvents: 100,

  // Sampling rate (1.0 = 100%)
  sampleRate: 1.0,

  // Environment
  environment: 'production',

  // Release version
  release: '1.0.0',

  // Server endpoint (if external monitoring is configured)
  endpoint: null,

  // Tags to attach to all events
  tags: {},

  // User context
  user: null,

  // Breadcrumb limit
  maxBreadcrumbs: 50,

  // Enable debug mode
  debug: false
};

/**
 * Event types
 */
const EventType = {
  ERROR: 'error',
  MESSAGE: 'message',
  TRANSACTION: 'transaction',
  BREADCRUMB: 'breadcrumb'
};

/**
 * Breadcrumb categories
 */
const BreadcrumbCategory = {
  USER: 'user',
  NAVIGATION: 'navigation',
  HTTP: 'http',
  CONSOLE: 'console',
  UI: 'ui',
  SYSTEM: 'system'
};

/**
 * Severity levels
 */
const Severity = {
  FATAL: 'fatal',
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info',
  DEBUG: 'debug'
};

/**
 * Monitoring context storage
 */
class MonitoringContext {
  constructor(config = {}) {
    this.breadcrumbs = [];
    this.context = {};
    this.tags = {};
    this.user = null;
    this.extra = {};
    this.maxBreadcrumbs = config.maxBreadcrumbs || MONITORING_CONFIG.maxBreadcrumbs;
  }

  addBreadcrumb(breadcrumb) {
    this.breadcrumbs.push({
      timestamp: new Date().toISOString(),
      ...breadcrumb
    });

    // Limit breadcrumbs
    if (this.breadcrumbs.length > this.maxBreadcrumbs) {
      this.breadcrumbs.shift();
    }
  }

  setContext(key, value) {
    this.context[key] = value;
  }

  setTag(key, value) {
    this.tags[key] = value;
  }

  setUser(user) {
    this.user = user;
  }

  setExtra(key, value) {
    this.extra[key] = value;
  }

  clear() {
    this.breadcrumbs = [];
    this.context = {};
    this.tags = {};
    this.user = null;
    this.extra = {};
  }

  toJSON() {
    return {
      breadcrumbs: this.breadcrumbs,
      context: this.context,
      tags: this.tags,
      user: this.user,
      extra: this.extra
    };
  }
}

/**
 * Event builder
 */
class EventBuilder {
  constructor() {
    this.eventId = this.generateId();
    this.timestamp = new Date().toISOString();
    this.platform = 'javascript';
    this.environment = MONITORING_CONFIG.environment;
    this.release = MONITORING_CONFIG.release;
  }

  generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  buildErrorEvent(error, context) {
    const normalized = ErrorHandler.normalize(error);

    return {
      event_id: this.eventId,
      timestamp: this.timestamp,
      platform: this.platform,
      environment: this.environment,
      release: this.release,
      level: this.getSeverity(normalized),
      logger: 'javascript',
      fingerprint: this.getFingerprint(normalized),
      exception: {
        values: [{
          type: normalized.name,
          value: normalized.message,
          module: 'agentab',
          stacktrace: this.parseStacktrace(normalized.stack),
          mechanisms: {
            handled: true,
            type: 'generic'
          }
        }]
      },
      tags: {
        ...MONITORING_CONFIG.tags,
        ...context.tags,
        error_code: normalized.code
      },
      user: context.user || MONITORING_CONFIG.user,
      contexts: {
        ...context.context,
        runtime: {
          name: 'Chrome Extension',
          version: navigator.userAgent
        }
      },
      breadcrumbs: context.breadcrumbs,
      extra: {
        ...context.extra,
        error_details: normalized.details
      }
    };
  }

  buildMessageEvent(message, level, context) {
    return {
      event_id: this.eventId,
      timestamp: this.timestamp,
      platform: this.platform,
      environment: this.environment,
      release: this.release,
      level: level || Severity.INFO,
      logger: 'javascript',
      message,
      tags: {
        ...MONITORING_CONFIG.tags,
        ...context.tags
      },
      user: context.user || MONITORING_CONFIG.user,
      breadcrumbs: context.breadcrumbs,
      extra: context.extra
    };
  }

  getSeverity(error) {
    if (error.code === 'EXECUTION_ERROR') return Severity.ERROR;
    if (error.code === 'API_ERROR') return Severity.ERROR;
    if (error.code === 'VALIDATION_ERROR') return Severity.WARNING;
    if (error.code === 'TIMEOUT_ERROR') return Severity.WARNING;
    if (error.code === 'ABORT_ERROR') return Severity.INFO;
    return Severity.ERROR;
  }

  getFingerprint(error) {
    // Generate fingerprint for grouping similar errors
    const parts = [error.code, error.name];

    if (error instanceof AgentabError && error.details) {
      if (error.details.field) parts.push(error.details.field);
    }

    return parts;
  }

  parseStacktrace(stack) {
    if (!stack) return null;

    const frames = [];
    const lines = stack.split('\n');

    for (const line of lines) {
      const match = line.match(/at\s+(?:(.+)\s+\()?(.+):(\d+):(\d+)\)?/);
      if (match) {
        frames.push({
          filename: match[2] || '',
          function: match[1] || '<anonymous>',
          lineno: parseInt(match[3], 10) || 0,
          colno: parseInt(match[4], 10) || 0,
          in_app: !match[2]?.includes('node_modules')
        });
      }
    }

    return { frames: frames.reverse() };
  }
}

/**
 * Event storage for offline support
 */
class EventStorage {
  constructor() {
    this.storageKey = 'monitoring_events';
  }

  async save(event) {
    try {
      const events = await this.getAll();
      events.push(event);

      // Limit stored events
      if (events.length > MONITORING_CONFIG.maxEvents) {
        events.splice(0, events.length - MONITORING_CONFIG.maxEvents);
      }

      await chrome.storage.local.set({ [this.storageKey]: events });
    } catch (e) {
      console.warn('Failed to save monitoring event:', e);
    }
  }

  async getAll() {
    try {
      const result = await chrome.storage.local.get(this.storageKey);
      return result[this.storageKey] || [];
    } catch (e) {
      return [];
    }
  }

  async clear() {
    try {
      await chrome.storage.local.remove(this.storageKey);
    } catch (e) {
      console.warn('Failed to clear monitoring events:', e);
    }
  }

  async remove(eventId) {
    try {
      const events = await this.getAll();
      const filtered = events.filter(e => e.event_id !== eventId);
      await chrome.storage.local.set({ [this.storageKey]: filtered });
    } catch (e) {
      console.warn('Failed to remove monitoring event:', e);
    }
  }
}

/**
 * Main Monitoring class
 */
export class Monitoring {
  constructor(options = {}) {
    this.config = { ...MONITORING_CONFIG, ...options };
    this.context = new MonitoringContext(this.config);
    this.builder = new EventBuilder();
    this.storage = new EventStorage();
    this.eventQueue = [];
    this.flushTimeout = null;
    this.initialized = false;
  }

  /**
   * Initialize monitoring
   */
  init() {
    if (this.initialized) return;

    // Set up global error handlers
    this.setupGlobalHandlers();

    // Load stored events
    this.loadStoredEvents();

    this.initialized = true;

    if (this.config.debug) {
      console.log('[Monitoring] Initialized');
    }
  }

  /**
   * Set up global error handlers
   */
  setupGlobalHandlers() {
    // Handle uncaught errors
    self.addEventListener('error', event => {
      this.captureException(event.error, {
        mechanism: {
          handled: false,
          type: 'onerror'
        }
      });
    });

    // Handle unhandled promise rejections
    self.addEventListener('unhandledrejection', event => {
      this.captureException(event.reason, {
        mechanism: {
          handled: false,
          type: 'onunhandledrejection'
        }
      });
    });
  }

  /**
   * Load stored events from previous sessions
   */
  async loadStoredEvents() {
    const events = await this.storage.getAll();
    this.eventQueue = events;

    if (events.length > 0 && this.config.debug) {
      console.log(`[Monitoring] Loaded ${events.length} stored events`);
    }
  }

  /**
   * Capture an exception
   */
  captureException(error, hints = {}) {
    if (!this.config.enabled) return null;

    // Apply sampling
    if (Math.random() > this.config.sampleRate) return null;

    try {
      const event = this.builder.buildErrorEvent(error, this.context);

      // Add hints to extra
      if (hints.mechanism) {
        event.extra.mechanism = hints.mechanism;
      }

      this.queueEvent(event);

      if (this.config.debug) {
        console.log('[Monitoring] Captured exception:', event);
      }

      return event.event_id;
    } catch (e) {
      console.error('[Monitoring] Failed to capture exception:', e);
      return null;
    }
  }

  /**
   * Capture a message
   */
  captureMessage(message, level = Severity.INFO, hints = {}) {
    if (!this.config.enabled) return null;

    // Apply sampling
    if (Math.random() > this.config.sampleRate) return null;

    try {
      const event = this.builder.buildMessageEvent(message, level, this.context);

      this.queueEvent(event);

      if (this.config.debug) {
        console.log('[Monitoring] Captured message:', event);
      }

      return event.event_id;
    } catch (e) {
      console.error('[Monitoring] Failed to capture message:', e);
      return null;
    }
  }

  /**
   * Add breadcrumb
   */
  addBreadcrumb(breadcrumb) {
    this.context.addBreadcrumb({
      category: breadcrumb.category || BreadcrumbCategory.USER,
      message: breadcrumb.message,
      data: breadcrumb.data,
      level: breadcrumb.level || Severity.INFO
    });
  }

  /**
   * Set user context
   */
  setUser(user) {
    this.context.setUser(user);
    MONITORING_CONFIG.user = user;
  }

  /**
   * Set tag
   */
  setTag(key, value) {
    this.context.setTag(key, value);
    MONITORING_CONFIG.tags[key] = value;
  }

  /**
   * Set extra context
   */
  setExtra(key, value) {
    this.context.setExtra(key, value);
  }

  /**
   * Set context
   */
  setContext(key, value) {
    this.context.setContext(key, value);
  }

  /**
   * Queue event for sending
   */
  queueEvent(event) {
    this.eventQueue.push(event);

    // Save to storage for persistence
    this.storage.save(event);

    // Schedule flush
    this.scheduleFlush();
  }

  /**
   * Schedule event flush
   */
  scheduleFlush() {
    if (this.flushTimeout) return;

    this.flushTimeout = setTimeout(() => {
      this.flush();
      this.flushTimeout = null;
    }, 5000);
  }

  /**
   * Flush events to endpoint
   */
  async flush() {
    if (!this.config.endpoint || this.eventQueue.length === 0) {
      return;
    }

    const events = [...this.eventQueue];
    this.eventQueue = [];

    try {
      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ events })
      });

      if (response.ok) {
        // Clear stored events on success
        await this.storage.clear();

        if (this.config.debug) {
          console.log(`[Monitoring] Flushed ${events.length} events`);
        }
      } else {
        // Re-queue on failure
        this.eventQueue.unshift(...events);
      }
    } catch (e) {
      // Re-queue on failure
      this.eventQueue.unshift(...events);

      if (this.config.debug) {
        console.warn('[Monitoring] Failed to flush events:', e);
      }
    }
  }

  /**
   * Get event statistics
   */
  async getStats() {
    const events = await this.storage.getAll();

    const stats = {
      total: events.length,
      byType: {},
      byLevel: {},
      recent: events.slice(-10)
    };

    for (const event of events) {
      const type = event.exception ? 'error' : 'message';
      stats.byType[type] = (stats.byType[type] || 0) + 1;
      stats.byLevel[event.level] = (stats.byLevel[event.level] || 0) + 1;
    }

    return stats;
  }

  /**
   * Clear all events
   */
  async clear() {
    this.eventQueue = [];
    await this.storage.clear();
  }

  /**
   * Create a transaction for performance monitoring
   */
  startTransaction(name, data = {}) {
    const transaction = {
      name,
      startTime: Date.now(),
      data,
      spans: [],
      finished: false
    };

    return {
      finish: () => {
        if (transaction.finished) return;

        transaction.finished = true;
        transaction.endTime = Date.now();
        transaction.duration = transaction.endTime - transaction.startTime;

        // Record as a message event
        this.captureMessage(`Transaction: ${name}`, Severity.INFO, {
          transaction
        });
      },

      startSpan: spanName => {
        const span = {
          name: spanName,
          startTime: Date.now()
        };

        return {
          finish: () => {
            span.endTime = Date.now();
            span.duration = span.endTime - span.startTime;
            transaction.spans.push(span);
          }
        };
      },

      setData: (key, value) => {
        transaction.data[key] = value;
      }
    };
  }
}

// Global instance
let globalMonitoring = null;

/**
 * Get global monitoring instance
 */
export function getMonitoring() {
  if (!globalMonitoring) {
    globalMonitoring = new Monitoring();
    globalMonitoring.init();
  }
  return globalMonitoring;
}

/**
 * Initialize monitoring with options
 */
export function initMonitoring(options = {}) {
  globalMonitoring = new Monitoring(options);
  globalMonitoring.init();
  return globalMonitoring;
}

/**
 * Convenience functions
 */
export const captureException = (error, hints) => getMonitoring().captureException(error, hints);
export const captureMessage = (message, level, hints) => getMonitoring().captureMessage(message, level, hints);
export const addBreadcrumb = breadcrumb => getMonitoring().addBreadcrumb(breadcrumb);
export const setUser = user => getMonitoring().setUser(user);
export const setTag = (key, value) => getMonitoring().setTag(key, value);
export const setExtra = (key, value) => getMonitoring().setExtra(key, value);
export const startTransaction = (name, data) => getMonitoring().startTransaction(name, data);

/**
 * Monitoring decorator for methods
 */
export function monitored(name) {
  return function(target, propertyKey, descriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function(...args) {
      const transaction = startTransaction(name || propertyKey);

      try {
        addBreadcrumb({
          category: BreadcrumbCategory.USER,
          message: `Called ${propertyKey}`,
          level: Severity.INFO
        });

        const result = await originalMethod.apply(this, args);
        transaction.finish();
        return result;
      } catch (error) {
        captureException(error);
        transaction.finish();
        throw error;
      }
    };

    return descriptor;
  };
}

// Export constants
export { EventType, BreadcrumbCategory, Severity, MONITORING_CONFIG };
