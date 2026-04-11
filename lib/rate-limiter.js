// lib/rate-limiter.js - Rate limiting utility

/**
 * RateLimiter - Token bucket rate limiting with automatic cleanup
 * Prevents memory leaks by periodically cleaning old execution records
 */
export class RateLimiter {
  /**
   * @param {Object} options
   * @param {number} options.maxExecutions - Maximum executions per window
   * @param {number} options.windowMs - Time window in milliseconds
   * @param {boolean} options.autoCleanup - Enable automatic cleanup (default: true)
   */
  constructor(options = {}) {
    this.maxExecutions = options.maxExecutions || 30;
    this.windowMs = options.windowMs || 60000; // 1 minute
    this.executions = [];
    this._cleanupTimer = null;

    // Setup automatic cleanup to prevent memory leaks
    if (options.autoCleanup !== false) {
      this._setupAutoCleanup();
    }
  }

  /**
   * Setup automatic cleanup timer
   * @private
   */
  _setupAutoCleanup() {
    // Clean up at twice the window frequency to ensure stale entries don't accumulate
    const cleanupInterval = this.windowMs * 2;
    this._cleanupTimer = setInterval(() => this.cleanup(), cleanupInterval);
  }

  /**
   * Clean up expired execution records
   * Call this explicitly if autoCleanup is disabled
   * @returns {number} Number of entries removed
   */
  cleanup() {
    const now = Date.now();
    const originalLength = this.executions.length;
    this.executions = this.executions.filter(t => now - t < this.windowMs);
    return originalLength - this.executions.length;
  }

  /**
   * Check if execution is rate limited
   * @returns {boolean} True if limited
   */
  isLimited() {
    this.cleanup();
    return this.executions.length >= this.maxExecutions;
  }

  /**
   * Record an execution
   */
  record() {
    const now = Date.now();
    // Cleanup before adding to prevent unbounded growth
    this.executions = this.executions.filter(t => now - t < this.windowMs);
    this.executions.push(now);
  }

  /**
   * Get remaining executions in current window
   * @returns {number}
   */
  getRemaining() {
    this.cleanup();
    return Math.max(0, this.maxExecutions - this.executions.length);
  }

  /**
   * Get time until next execution is available (ms)
   * @returns {number}
   */
  getTimeUntilAvailable() {
    if (!this.isLimited()) return 0;
    const oldestExecution = Math.min(...this.executions);
    return Math.max(0, this.windowMs - (Date.now() - oldestExecution));
  }

  /**
   * Reset rate limiter
   */
  reset() {
    this.executions = [];
  }

  /**
   * Get current stats
   * @returns {Object}
   */
  getStats() {
    this.cleanup();
    return {
      current: this.executions.length,
      max: this.maxExecutions,
      remaining: this.getRemaining(),
      windowMs: this.windowMs
    };
  }

  /**
   * Destroy the rate limiter and cleanup resources
   * Call this when the rate limiter is no longer needed
   */
  destroy() {
    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer);
      this._cleanupTimer = null;
    }
    this.executions = [];
  }
}
