/**
 * Error Boundary Module
 * Provides unified error handling and recovery mechanisms
 */

import { ErrorHandler, AgentabError } from './errors.js';
import { logger } from './logger.js';
import { escapeHtml } from './utils.js';

/**
 * ErrorBoundary - Wraps operations with error handling and recovery
 */
export class ErrorBoundary {
  /**
   * @param {Object} options
   * @param {Function} [options.onCatch] - Callback when error is caught
   * @param {Function} [options.onRetry] - Callback before retry
   * @param {number} [options.maxRetries] - Maximum retry attempts
   * @param {number} [options.retryDelay] - Delay between retries (ms)
   * @param {HTMLElement} [options.container] - Container for error display
   */
  constructor(options = {}) {
    this.options = {
      maxRetries: 3,
      retryDelay: 1000,
      ...options
    };
    this.retryCount = 0;
  }

  /**
   * Wrap async function with error boundary
   * @param {Function} fn - Function to wrap
   * @param {Object} context - Error context
   * @returns {Promise<{success: boolean, result?: *, error?: Error}>}
   */
  async wrap(fn, context = {}) {
    try {
      const result = await fn();
      this.retryCount = 0; // Reset on success
      return { success: true, result };
    } catch (error) {
      const normalized = ErrorHandler.normalize(error);
      
      logger.error('Error boundary caught', {
        code: normalized.code,
        message: normalized.message,
        context,
        retryCount: this.retryCount
      });

      this.options.onCatch?.(normalized, context);

      // Auto-retry for recoverable errors
      if (ErrorHandler.isRecoverable(error) && this.retryCount < this.options.maxRetries) {
        this.retryCount++;
        
        logger.info('Auto-retrying', { attempt: this.retryCount, delay: this.options.retryDelay });
        
        await new Promise(resolve => setTimeout(resolve, this.options.retryDelay));
        this.options.onRetry?.(this.retryCount);
        
        return this.wrap(fn, context);
      }

      return { success: false, error: normalized };
    }
  }

  /**
   * Wrap function with fallback
   * @param {Function} fn - Main function
   * @param {Function} fallback - Fallback function
   * @returns {Promise<*>}
   */
  async wrapWithFallback(fn, fallback) {
    const { success, result, error } = await this.wrap(fn);
    
    if (success) {
      return result;
    }
    
    logger.info('Using fallback due to error', { error: error.message });
    return fallback(error);
  }

  /**
   * Reset retry count
   */
  reset() {
    this.retryCount = 0;
  }
}

/**
 * GlobalErrorBoundary - Application-wide error handling
 */
export class GlobalErrorBoundary {
  constructor() {
    this.boundaries = new Map();
    this.errorLog = [];
    this.maxLogSize = 100;
    this.listeners = new Set();
  }

  /**
   * Create or get named error boundary
   * @param {string} name - Boundary name
   * @param {Object} options - Boundary options
   * @returns {ErrorBoundary}
   */
  getBoundary(name, options = {}) {
    if (!this.boundaries.has(name)) {
      const boundary = new ErrorBoundary({
        ...options,
        onCatch: (error, context) => {
          this.logError(name, error, context);
          options.onCatch?.(error, context);
        }
      });
      this.boundaries.set(name, boundary);
    }
    return this.boundaries.get(name);
  }

  /**
   * Log error with context
   */
  logError(boundaryName, error, context) {
    const entry = {
      boundary: boundaryName,
      error: {
        code: error.code,
        message: error.message,
        timestamp: new Date().toISOString()
      },
      context
    };

    this.errorLog.push(entry);
    
    // Trim log if too large
    if (this.errorLog.length > this.maxLogSize) {
      this.errorLog = this.errorLog.slice(-this.maxLogSize);
    }

    // Notify listeners
    this.notifyListeners(entry);
  }

  /**
   * Subscribe to error events
   * @param {Function} listener
   * @returns {Function} Unsubscribe function
   */
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Notify all listeners
   */
  notifyListeners(entry) {
    for (const listener of this.listeners) {
      try {
        listener(entry);
      } catch (e) {
        logger.error('Error in error listener', { error: e.message });
      }
    }
  }

  /**
   * Get error log
   * @returns {Array}
   */
  getErrorLog() {
    return [...this.errorLog];
  }

  /**
   * Clear error log
   */
  clearLog() {
    this.errorLog = [];
  }

  /**
   * Get error statistics
   * @returns {Object}
   */
  getStats() {
    const byCode = {};
    const byBoundary = {};

    for (const entry of this.errorLog) {
      const code = entry.error.code;
      const boundary = entry.boundary;

      byCode[code] = (byCode[code] || 0) + 1;
      byBoundary[boundary] = (byBoundary[boundary] || 0) + 1;
    }

    return {
      total: this.errorLog.length,
      byCode,
      byBoundary
    };
  }
}

// Singleton instance
let globalBoundary = null;

/**
 * Get global error boundary
 * @returns {GlobalErrorBoundary}
 */
export function getGlobalErrorBoundary() {
  if (!globalBoundary) {
    globalBoundary = new GlobalErrorBoundary();
  }
  return globalBoundary;
}

/**
 * Error Display Component
 */
export class ErrorDisplay {
  /**
   * @param {HTMLElement} container
   * @param {Object} options
   */
  constructor(container, options = {}) {
    this.container = container;
    this.options = {
      showRetry: true,
      showDismiss: true,
      showDetails: false,
      ...options
    };
  }

  /**
   * Show error
   * @param {Error} error
   */
  show(error) {
    const info = ErrorHandler.getDisplayInfo(error);
    
    const html = `
      <div class="error-display" role="alert" aria-live="assertive">
        <div class="error-icon">${info.icon}</div>
        <div class="error-content">
          <div class="error-message">${escapeHtml(info.message)}</div>
          ${info.suggestion ? `<div class="error-suggestion">${escapeHtml(info.suggestion)}</div>` : ''}
        </div>
        <div class="error-actions">
          ${this.options.showRetry && info.canRetry ? '<button class="btn-retry" data-action="retry">Retry</button>' : ''}
          ${this.options.showDismiss ? '<button class="btn-dismiss" data-action="dismiss">✕</button>' : ''}
        </div>
      </div>
    `;

    this.container.innerHTML = html;
    this.currentError = error;

    // Setup event handlers
    this.container.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', e => {
        const action = e.target.dataset.action;
        if (action === 'retry') {
          this.options.onRetry?.(error);
        } else if (action === 'dismiss') {
          this.hide();
        }
      });
    });
  }

  /**
   * Hide error
   */
  hide() {
    this.container.innerHTML = '';
    this.currentError = null;
  }

  /**
   * Get current error
   * @returns {Error|null}
   */
  getError() {
    return this.currentError;
  }
}

/**
 * Async operation wrapper with loading state
 */
export class AsyncOperation {
  /**
   * @param {Object} options
   * @param {HTMLElement} [options.loadingElement]
   * @param {HTMLElement} [options.errorElement]
   * @param {Function} [options.onLoading]
   * @param {Function} [options.onComplete]
   * @param {Function} [options.onError]
   */
  constructor(options = {}) {
    this.options = options;
    this.errorBoundary = new ErrorBoundary({
      onCatch: error => {
        this.showError(error);
        options.onError?.(error);
      }
    });
    this.isLoading = false;
  }

  /**
   * Execute async operation with loading state
   * @param {Function} fn
   * @returns {Promise<{success: boolean, result?: *, error?: Error}>}
   */
  async execute(fn) {
    this.setLoading(true);
    
    const result = await this.errorBoundary.wrap(fn);
    
    this.setLoading(false);
    
    if (result.success) {
      this.options.onComplete?.(result.result);
    }
    
    return result;
  }

  /**
   * Set loading state
   */
  setLoading(loading) {
    this.isLoading = loading;
    
    if (this.options.loadingElement) {
      this.options.loadingElement.classList.toggle('loading', loading);
    }
    
    this.options.onLoading?.(loading);
  }

  /**
   * Show error
   */
  showError(error) {
    if (this.options.errorElement) {
      const display = new ErrorDisplay(this.options.errorElement, {
        onRetry: () => this.retry()
      });
      display.show(error);
    }
  }

  /**
   * Retry last operation
   */
  retry() {
    // Override this to implement retry logic
  }
}

/**
 * Quick wrapper functions
 */

/**
 * Wrap function with error boundary
 * @param {Function} fn
 * @param {Object} options
 * @returns {Promise<{success: boolean, result?: *, error?: Error}>}
 */
export async function withBoundary(fn, options = {}) {
  const boundary = new ErrorBoundary(options);
  return boundary.wrap(fn);
}

/**
 * Wrap function with fallback
 * @param {Function} fn
 * @param {Function} fallback
 * @returns {Promise<*>}
 */
export async function withFallback(fn, fallback) {
  const boundary = new ErrorBoundary();
  return boundary.wrapWithFallback(fn, fallback);
}

/**
 * Create safe async handler
 * @param {Function} handler
 * @param {Object} options
 * @returns {Function}
 */
export function safeAsync(handler, options = {}) {
  const boundary = new ErrorBoundary(options);
  
  return async (...args) => {
    const { success, result, error } = await boundary.wrap(() => handler(...args));
    
    if (!success && options.onError) {
      options.onError(error);
    }
    
    return success ? result : null;
  };
}

// Add CSS for error display
export function addErrorBoundaryStyles() {
  if (document.getElementById('error-boundary-styles')) return;

  const style = document.createElement('style');
  style.id = 'error-boundary-styles';
  style.textContent = `
    .error-display {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 16px;
      background: var(--color-error-bg, #fef2f2);
      border: 1px solid var(--color-error-border, #fecaca);
      border-radius: 8px;
      margin: 8px 0;
    }

    .error-icon {
      font-size: 24px;
      flex-shrink: 0;
    }

    .error-content {
      flex: 1;
      min-width: 0;
    }

    .error-message {
      font-weight: 500;
      color: var(--color-error-text, #dc2626);
      margin-bottom: 4px;
    }

    .error-suggestion {
      font-size: 14px;
      color: var(--color-text-secondary, #666);
    }

    .error-actions {
      display: flex;
      gap: 8px;
      flex-shrink: 0;
    }

    .error-actions button {
      padding: 6px 12px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      transition: background-color 0.2s;
    }

    .btn-retry {
      background: var(--color-primary, #3b82f6);
      color: white;
    }

    .btn-retry:hover {
      background: var(--color-primary-hover, #2563eb);
    }

    .btn-dismiss {
      background: transparent;
      color: var(--color-text-secondary, #666);
    }

    .btn-dismiss:hover {
      background: var(--color-bg-hover, #f3f4f6);
    }
  `;

  document.head.appendChild(style);
}
