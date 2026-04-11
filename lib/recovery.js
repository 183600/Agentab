// lib/recovery.js - Error recovery and automatic retry mechanism

import { logger } from './logger.js';

/**
 * RecoveryStrategy - Defines retry behavior for different error types
 */
export const RecoveryStrategy = {
  NETWORK: {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2,
    retryableErrors: ['NetworkError', 'TimeoutError', 'ECONNREFUSED', 'ENOTFOUND']
  },
  API: {
    maxRetries: 3,
    baseDelay: 2000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    retryableStatusCodes: [429, 500, 502, 503, 504]
  },
  EXECUTION: {
    maxRetries: 2,
    baseDelay: 500,
    maxDelay: 5000,
    backoffMultiplier: 1.5,
    retryableErrors: ['TimeoutError', 'ScriptExecutionError']
  },
  DEFAULT: {
    maxRetries: 1,
    baseDelay: 1000,
    maxDelay: 5000,
    backoffMultiplier: 1
  }
};

/**
 * RecoveryManager - Handles automatic error recovery and retry logic
 */
export class RecoveryManager {
  constructor(options = {}) {
    this.options = {
      enableRecovery: options.enableRecovery ?? true,
      enableLogging: options.enableLogging ?? true,
      ...options
    };

    this.activeRecoveries = new Map();
    this.recoveryHistory = [];
    this.maxHistorySize = 100;
  }

  /**
   * Execute function with automatic recovery
   * @param {Function} fn - Function to execute
   * @param {Object} strategy - Recovery strategy
   * @param {Object} context - Execution context
   * @returns {Promise<any>}
   */
  async executeWithRecovery(fn, strategy = RecoveryStrategy.DEFAULT, context = {}) {
    if (!this.options.enableRecovery) {
      return fn();
    }

    const recoveryId = this.generateId();
    const recovery = {
      id: recoveryId,
      attempts: 0,
      startTime: Date.now(),
      context,
      strategy
    };

    this.activeRecoveries.set(recoveryId, recovery);

    try {
      const result = await this.attemptExecution(fn, recovery);
      this.recordSuccess(recovery);
      return result;
    } finally {
      this.activeRecoveries.delete(recoveryId);
    }
  }

  /**
   * Attempt execution with retry logic
   * @param {Function} fn - Function to execute
   * @param {Object} recovery - Recovery state
   * @returns {Promise<any>}
   */
  async attemptExecution(fn, recovery) {
    let lastError;

    for (let attempt = 1; attempt <= recovery.strategy.maxRetries + 1; attempt++) {
      recovery.attempts = attempt;

      try {
        const result = await fn();

        if (attempt > 1) {
          this.logRecovery(recovery, attempt, true);
        }

        return result;
      } catch (error) {
        lastError = error;

        // Check if error is retryable
        if (!this.isRetryable(error, recovery.strategy)) {
          if (this.options.enableLogging) {
            logger.warn('Non-retryable error encountered', {
              error: error.message,
              type: error.name,
              attempt
            });
          }
          throw error;
        }

        // Check if we have retries left
        if (attempt > recovery.strategy.maxRetries) {
          this.logRecovery(recovery, attempt, false, error);
          throw error;
        }

        // Calculate delay and wait
        const delay = this.calculateDelay(attempt, recovery.strategy);
        if (this.options.enableLogging) {
          logger.info(`Retry attempt ${attempt}/${recovery.strategy.maxRetries} in ${delay}ms`, {
            error: error.message,
            recoveryId: recovery.id
          });
        }

        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  /**
   * Check if an error is retryable
   * @param {Error} error - Error to check
   * @param {Object} strategy - Recovery strategy
   * @returns {boolean}
   */
  isRetryable(error, strategy) {
    // Check by error name
    if (strategy.retryableErrors?.includes(error.name)) {
      return true;
    }

    // Check by error message
    if (strategy.retryableErrors?.some(msg => error.message.includes(msg))) {
      return true;
    }

    // Check by status code (for API errors)
    if (error.statusCode && strategy.retryableStatusCodes?.includes(error.statusCode)) {
      return true;
    }

    return false;
  }

  /**
   * Calculate retry delay with exponential backoff and jitter
   * @param {number} attempt - Current attempt number
   * @param {Object} strategy - Recovery strategy
   * @returns {number}
   */
  calculateDelay(attempt, strategy) {
    const baseDelay = strategy.baseDelay;
    const backoffMultiplier = strategy.backoffMultiplier;
    const maxDelay = strategy.maxDelay;

    // Exponential backoff
    let delay = baseDelay * Math.pow(backoffMultiplier, attempt - 1);

    // Cap at max delay
    delay = Math.min(delay, maxDelay);

    // Add jitter (±25%) to prevent thundering herd
    const jitter = delay * 0.25 * (Math.random() * 2 - 1);
    delay = delay + jitter;

    return Math.round(delay);
  }

  /**
   * Record successful recovery
   * @param {Object} recovery - Recovery state
   */
  recordSuccess(recovery) {
    const duration = Date.now() - recovery.startTime;

    const record = {
      id: recovery.id,
      success: true,
      attempts: recovery.attempts,
      duration,
      context: recovery.context,
      timestamp: Date.now()
    };

    this.addToHistory(record);
  }

  /**
   * Log recovery attempt
   * @param {Object} recovery - Recovery state
   * @param {number} attempt - Attempt number
   * @param {boolean} success - Whether recovery succeeded
   * @param {Error} error - Error if failed
   */
  logRecovery(recovery, attempt, success, error = null) {
    const duration = Date.now() - recovery.startTime;

    if (this.options.enableLogging) {
      if (success) {
        logger.info(`Recovery successful after ${attempt} attempts`, {
          recoveryId: recovery.id,
          attempts: attempt,
          duration,
          context: recovery.context
        });
      } else {
        logger.error(`Recovery failed after ${attempt} attempts`, {
          recoveryId: recovery.id,
          attempts: attempt,
          duration,
          error: error?.message,
          context: recovery.context
        });
      }
    }
  }

  /**
   * Add record to history
   * @param {Object} record - Recovery record
   */
  addToHistory(record) {
    this.recoveryHistory.push(record);

    // Maintain history size
    if (this.recoveryHistory.length > this.maxHistorySize) {
      this.recoveryHistory.shift();
    }
  }

  /**
   * Get recovery statistics
   * @returns {Object}
   */
  getStats() {
    const total = this.recoveryHistory.length;
    const successful = this.recoveryHistory.filter(r => r.success).length;
    const failed = total - successful;

    const avgAttempts =
      total > 0 ? this.recoveryHistory.reduce((sum, r) => sum + r.attempts, 0) / total : 0;

    const avgDuration =
      total > 0 ? this.recoveryHistory.reduce((sum, r) => sum + r.duration, 0) / total : 0;

    return {
      total,
      successful,
      failed,
      successRate: total > 0 ? ((successful / total) * 100).toFixed(2) : 0,
      avgAttempts: avgAttempts.toFixed(2),
      avgDuration: avgDuration.toFixed(2),
      activeRecoveries: this.activeRecoveries.size
    };
  }

  /**
   * Clear recovery history
   */
  clearHistory() {
    this.recoveryHistory = [];
  }

  /**
   * Sleep utility
   * @param {number} ms - Milliseconds
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generate unique ID
   * @returns {string}
   */
  generateId() {
    return `recovery_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * CircuitBreaker - Prevents cascading failures with state persistence
 */
export class CircuitBreaker {
  /**
   * @param {Object} options
   * @param {number} options.failureThreshold - Failures before opening
   * @param {number} options.recoveryTimeout - Time before retry (ms)
   * @param {number} options.monitoringPeriod - Monitoring window (ms)
   * @param {string} options.storageKey - Key for persistence
   * @param {boolean} options.persistState - Enable state persistence
   */
  constructor(options = {}) {
    this.options = {
      failureThreshold: options.failureThreshold || 5,
      recoveryTimeout: options.recoveryTimeout || 30000,
      monitoringPeriod: options.monitoringPeriod || 60000,
      storageKey: options.storageKey || 'circuitBreakerState',
      persistState: options.persistState ?? true,
      ...options
    };

    this.failures = [];
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
    this.initialized = false;
  }

  /**
   * Initialize from persisted state
   * @returns {Promise<void>}
   */
  async init() {
    if (!this.options.persistState || this.initialized) {
      return;
    }

    try {
      const result = await chrome.storage.local.get(this.options.storageKey);
      const persisted = result[this.options.storageKey];

      if (persisted) {
        // Restore state
        this.state = persisted.state || 'CLOSED';
        this.failures = persisted.failures || [];
        this.lastFailureTime = persisted.lastFailureTime || null;
        this.nextAttemptTime = persisted.nextAttemptTime || null;

        // Clean old failures on restore
        const threshold = Date.now() - this.options.monitoringPeriod;
        this.failures = this.failures.filter(t => t > threshold);

        // If state was OPEN but recovery time has passed, set to HALF_OPEN
        if (this.state === 'OPEN' && this.nextAttemptTime && Date.now() >= this.nextAttemptTime) {
          this.state = 'HALF_OPEN';
        }

        logger.info('Circuit breaker state restored from storage', {
          state: this.state,
          failures: this.failures.length
        });
      }
    } catch (error) {
      logger.warn('Failed to restore circuit breaker state', { error: error.message });
    }

    this.initialized = true;
  }

  /**
   * Persist current state
   * @returns {Promise<void>}
   */
  async persist() {
    if (!this.options.persistState) {
      return;
    }

    try {
      await chrome.storage.local.set({
        [this.options.storageKey]: {
          state: this.state,
          failures: this.failures,
          lastFailureTime: this.lastFailureTime,
          nextAttemptTime: this.nextAttemptTime,
          timestamp: Date.now()
        }
      });
    } catch (error) {
      logger.warn('Failed to persist circuit breaker state', { error: error.message });
    }
  }

  /**
   * Execute function through circuit breaker
   * @param {Function} fn - Function to execute
   * @returns {Promise<any>}
   */
  async execute(fn) {
    // Ensure initialized
    await this.init();

    if (this.state === 'OPEN') {
      if (Date.now() >= this.nextAttemptTime) {
        this.state = 'HALF_OPEN';
        logger.info('Circuit breaker entering HALF_OPEN state');
        await this.persist();
      } else {
        throw new Error('Circuit breaker is OPEN. Too many recent failures.');
      }
    }

    try {
      const result = await fn();
      await this.onSuccess();
      return result;
    } catch (error) {
      await this.onFailure();
      throw error;
    }
  }

  /**
   * Handle successful execution
   */
  async onSuccess() {
    this.failures = [];

    if (this.state === 'HALF_OPEN') {
      this.state = 'CLOSED';
      logger.info('Circuit breaker recovered, now CLOSED');
    }

    await this.persist();
  }

  /**
   * Handle failed execution
   */
  async onFailure() {
    const now = Date.now();
    this.failures.push(now);
    this.lastFailureTime = now;

    // If in HALF_OPEN state, immediately open again
    if (this.state === 'HALF_OPEN') {
      this.state = 'OPEN';
      this.nextAttemptTime = now + this.options.recoveryTimeout;
      logger.warn('Circuit breaker re-OPENED from HALF_OPEN state');
      await this.persist();
      return;
    }

    // Clean old failures outside monitoring period
    const threshold = now - this.options.monitoringPeriod;
    this.failures = this.failures.filter(t => t > threshold);

    // Check if we should open the circuit
    if (this.failures.length >= this.options.failureThreshold) {
      this.state = 'OPEN';
      this.nextAttemptTime = now + this.options.recoveryTimeout;
      logger.warn('Circuit breaker OPENED due to excessive failures', {
        failures: this.failures.length,
        threshold: this.options.failureThreshold,
        recoveryTimeout: this.options.recoveryTimeout
      });
    }

    await this.persist();
  }

  /**
   * Get current state
   * @returns {Object}
   */
  getState() {
    return {
      state: this.state,
      failures: this.failures.length,
      threshold: this.options.failureThreshold,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime
    };
  }

  /**
   * Reset circuit breaker
   */
  async reset() {
    this.failures = [];
    this.state = 'CLOSED';
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
    await this.persist();
  }
}

// Export singleton instances
export const recoveryManager = new RecoveryManager();
export const circuitBreaker = new CircuitBreaker();

/**
 * Initialize circuit breaker from persisted state
 * Call this on service worker startup
 * @returns {Promise<void>}
 */
export async function initCircuitBreaker() {
  await circuitBreaker.init();
}

/**
 * Decorator for automatic recovery
 * @param {Object} strategy - Recovery strategy
 * @returns {Function}
 */
export function withRecovery(strategy = RecoveryStrategy.DEFAULT) {
  return function (target, propertyKey, descriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args) {
      return recoveryManager.executeWithRecovery(() => originalMethod.apply(this, args), strategy, {
        method: propertyKey
      });
    };

    return descriptor;
  };
}
