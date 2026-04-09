// lib/performance.js - Performance monitoring and metrics collection

import { logger } from './logger.js';

/**
 * PerformanceMetrics - Collect and analyze performance metrics
 */
export class PerformanceMetrics {
  constructor(options = {}) {
    this.options = {
      maxSamples: options.maxSamples || 100,
      reportInterval: options.reportInterval || 60000, // 1 minute
      ...options
    };

    this.metrics = new Map();
    this.counters = new Map();
    this.timers = new Map();
    this.listeners = new Set();

    // Start periodic reporting
    if (this.options.reportInterval > 0) {
      this.reportTimer = setInterval(() => this.report(), this.options.reportInterval);
    }
  }

  /**
   * Start a timer
   * @param {string} name - Timer name
   * @param {Object} metadata - Optional metadata
   * @returns {string} Timer ID
   */
  startTimer(name, metadata = {}) {
    const id = `${name}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    this.timers.set(id, {
      name,
      startTime: performance.now(),
      startTimestamp: Date.now(),
      metadata
    });

    return id;
  }

  /**
   * End a timer and record the duration
   * @param {string} id - Timer ID
   * @returns {number} Duration in milliseconds
   */
  endTimer(id) {
    const timer = this.timers.get(id);
    if (!timer) {
      logger.warn(`Timer not found: ${id}`);
      return 0;
    }

    const duration = performance.now() - timer.startTime;
    this.timers.delete(id);

    this.record(timer.name, duration, timer.metadata);

    return duration;
  }

  /**
   * Record a metric value
   * @param {string} name - Metric name
   * @param {number} value - Metric value
   * @param {Object} metadata - Optional metadata
   */
  record(name, value, metadata = {}) {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, {
        values: [],
        count: 0,
        sum: 0,
        min: Infinity,
        max: -Infinity,
        metadata
      });
    }

    const metric = this.metrics.get(name);
    metric.values.push({ value, timestamp: Date.now() });

    // Maintain max samples
    if (metric.values.length > this.options.maxSamples) {
      metric.values.shift();
    }

    // Update statistics
    metric.count++;
    metric.sum += value;
    metric.min = Math.min(metric.min, value);
    metric.max = Math.max(metric.max, value);

    // Notify listeners
    this.notifyListeners({
      type: 'metric',
      name,
      value,
      metadata
    });
  }

  /**
   * Increment a counter
   * @param {string} name - Counter name
   * @param {number} amount - Amount to increment
   */
  increment(name, amount = 1) {
    const current = this.counters.get(name) || 0;
    this.counters.set(name, current + amount);

    this.notifyListeners({
      type: 'counter',
      name,
      value: current + amount,
      delta: amount
    });
  }

  /**
   * Get metric statistics
   * @param {string} name - Metric name
   * @returns {Object|null}
   */
  getStats(name) {
    const metric = this.metrics.get(name);
    if (!metric) return null;

    const avg = metric.sum / metric.count;

    // Calculate median and percentiles
    const sorted = metric.values.map(v => v.value).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const p99 = sorted[Math.floor(sorted.length * 0.99)];

    return {
      name,
      count: metric.count,
      sum: metric.sum,
      avg,
      min: metric.min,
      max: metric.max,
      median,
      p95,
      p99,
      lastValue: metric.values[metric.values.length - 1]?.value
    };
  }

  /**
   * Get all metric statistics
   * @returns {Object}
   */
  getAllStats() {
    const stats = {};
    for (const name of this.metrics.keys()) {
      stats[name] = this.getStats(name);
    }
    return stats;
  }

  /**
   * Get counter value
   * @param {string} name - Counter name
   * @returns {number}
   */
  getCounter(name) {
    return this.counters.get(name) || 0;
  }

  /**
   * Get all counters
   * @returns {Object}
   */
  getAllCounters() {
    return Object.fromEntries(this.counters);
  }

  /**
   * Add listener for metric events
   * @param {Function} listener
   * @returns {Function} Unsubscribe function
   */
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Notify all listeners
   * @param {Object} event
   */
  notifyListeners(event) {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (e) {
        logger.error('Metrics listener error:', e);
      }
    }
  }

  /**
   * Generate performance report
   * @returns {Object}
   */
  report() {
    const stats = this.getAllStats();
    const counters = this.getAllCounters();

    // Calculate memory usage if available
    const memory = performance.memory ? {
      usedJSHeapSize: performance.memory.usedJSHeapSize,
      totalJSHeapSize: performance.memory.totalJSHeapSize,
      jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
    } : null;

    const report = {
      timestamp: new Date().toISOString(),
      metrics: stats,
      counters,
      memory,
      timers: {
        active: this.timers.size
      }
    };

    logger.info('Performance report generated', {
      metrics: Object.keys(stats).length,
      counters: Object.keys(counters).length,
      activeTimers: this.timers.size
    });

    this.notifyListeners({
      type: 'report',
      report
    });

    return report;
  }

  /**
   * Clear all metrics
   */
  clear() {
    this.metrics.clear();
    this.counters.clear();
    this.timers.clear();
  }

  /**
   * Stop periodic reporting
   */
  destroy() {
    if (this.reportTimer) {
      clearInterval(this.reportTimer);
    }
    this.clear();
  }
}

/**
 * PerformanceTracker - High-level performance tracking utilities
 */
export class PerformanceTracker {
  constructor(metrics = new PerformanceMetrics()) {
    this.metrics = metrics;
  }

  /**
   * Track async function execution
   * @param {string} name - Operation name
   * @param {Function} fn - Async function to track
   * @returns {Promise<any>}
   */
  async track(name, fn) {
    const timerId = this.metrics.startTimer(name);
    try {
      const result = await fn();
      this.metrics.endTimer(timerId);
      return result;
    } catch (error) {
      this.metrics.endTimer(timerId);
      this.metrics.increment(`errors.${name}`);
      throw error;
    }
  }

  /**
   * Track sync function execution
   * @param {string} name - Operation name
   * @param {Function} fn - Sync function to track
   * @returns {any}
   */
  trackSync(name, fn) {
    const timerId = this.metrics.startTimer(name);
    try {
      const result = fn();
      this.metrics.endTimer(timerId);
      return result;
    } catch (error) {
      this.metrics.endTimer(timerId);
      this.metrics.increment(`errors.${name}`);
      throw error;
    }
  }

  /**
   * Track API call
   * @param {string} endpoint - API endpoint
   * @param {Function} fn - API call function
   * @returns {Promise<any>}
   */
  async trackApi(endpoint, fn) {
    return this.track(`api.${endpoint}`, fn);
  }

  /**
   * Track DOM operation
   * @param {string} operation - Operation name
   * @param {Function} fn - DOM operation function
   * @returns {any}
   */
  trackDom(operation, fn) {
    return this.trackSync(`dom.${operation}`, fn);
  }

  /**
   * Track user interaction
   * @param {string} action - Action name
   */
  trackInteraction(action) {
    this.metrics.increment(`interaction.${action}`);
    this.metrics.record('interaction.timestamp', Date.now());
  }
}

/**
 * PerformanceObserver - Monitor browser performance events
 */
export class PerformanceObserverWrapper {
  constructor(onMeasure) {
    this.onMeasure = onMeasure;
    this.observers = [];
  }

  /**
   * Start observing performance entries
   */
  start() {
    // Observe marks and measures
    if (typeof PerformanceObserver !== 'undefined') {
      try {
        const observer = new PerformanceObserver(list => {
          for (const entry of list.getEntries()) {
            this.onMeasure?.({
              name: entry.name,
              duration: entry.duration,
              startTime: entry.startTime,
              type: entry.entryType
            });
          }
        });

        observer.observe({ entryTypes: ['measure', 'mark'] });
        this.observers.push(observer);
      } catch (e) {
        // PerformanceObserver may not be available
      }
    }
  }

  /**
   * Stop all observers
   */
  stop() {
    for (const observer of this.observers) {
      observer.disconnect();
    }
    this.observers = [];
  }
}

/**
 * Performance utilities
 */
export const perf = {
  /**
   * Create a performance mark
   * @param {string} name
   */
  mark(name) {
    performance.mark?.(name);
  },

  /**
   * Create a performance measure
   * @param {string} name
   * @param {string} startMark
   * @param {string} endMark
   */
  measure(name, startMark, endMark) {
    try {
      performance.measure?.(name, startMark, endMark);
    } catch (e) {
      // Ignore if marks don't exist
    }
  },

  /**
   * Get all performance entries
   * @returns {Array}
   */
  getEntries() {
    return performance.getEntries?.() || [];
  },

  /**
   * Get entries by type
   * @param {string} type
   * @returns {Array}
   */
  getEntriesByType(type) {
    return performance.getEntriesByType?.(type) || [];
  },

  /**
   * Clear all performance entries
   */
  clear() {
    performance.clearResourceTimings?.();
    performance.clearMarks?.();
    performance.clearMeasures?.();
  }
};

// Create default instances
export const metrics = new PerformanceMetrics();
export const tracker = new PerformanceTracker(metrics);

/**
 * Decorator for tracking method performance
 * @param {string} name - Optional name (defaults to method name)
 */
export function trackPerformance(name) {
  return function(target, propertyKey, descriptor) {
    const originalMethod = descriptor.value;
    const metricName = name || propertyKey;

    descriptor.value = async function(...args) {
      return tracker.track(metricName, () => originalMethod.apply(this, args));
    };

    return descriptor;
  };
}
