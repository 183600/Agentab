// lib/code-executor.js - Code execution logic

import { SandboxExecutor } from './sandbox.js';
import { RateLimiter } from './rate-limiter.js';
import { agentLogger as logger } from './logger.js';

/**
 * Chrome Agent helper utilities code
 * This is injected into the page context for code execution
 * Keep in sync with content.js injectPageHelpers() implementation
 * @type {string}
 */
export const CHROME_AGENT_HELPERS = `
const __chromeAgent = {
  version: '2.0.0',
  
  // Wait for an element to appear
  waitForElement: (selector, timeout = 10000) => {
    return new Promise((resolve, reject) => {
      try {
        if (!selector || typeof selector !== 'string') {
          throw new Error('Invalid selector');
        }
        if (selector.length > 500) {
          throw new Error('Selector too long');
        }
        timeout = Math.min(Math.max(0, timeout), 30000);
        
        const el = document.querySelector(selector);
        if (el) return resolve(el);
        
        const observer = new MutationObserver(() => {
          const el = document.querySelector(selector);
          if (el) {
            observer.disconnect();
            resolve(el);
          }
        });
        
        observer.observe(document.body, { childList: true, subtree: true });
        
        setTimeout(() => {
          observer.disconnect();
          reject(new Error('Timeout waiting for: ' + selector));
        }, timeout);
      } catch (error) {
        reject(error);
      }
    });
  },
  
  // Sleep utility
  sleep: (ms) => {
    ms = Math.min(Math.max(0, ms), 30000);
    return new Promise(r => setTimeout(r, ms));
  },
  
  // Click element
  click: (selector) => {
    const el = document.querySelector(selector);
    if (el) {
      el.click();
      return true;
    }
    return false;
  },
  
  // Type text into input
  type: (selector, text) => {
    const el = document.querySelector(selector);
    if (el) {
      el.focus();
      el.value = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    return false;
  },
  
  // Type text with human-like delay
  typeText: async (selector, text, delay = 50) => {
    const el = document.querySelector(selector);
    if (!el) throw new Error('Element not found: ' + selector);
    
    el.focus();
    el.value = '';
    
    const safeText = String(text).substring(0, 10000);
    for (const char of safeText) {
      el.value += char;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, delay + Math.random() * 30));
    }
    
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return el.value;
  },
  
  // Click with retry
  clickElement: async (selector, retries = 3) => {
    retries = Math.min(Math.max(1, retries), 10);
    for (let i = 0; i < retries; i++) {
      const el = document.querySelector(selector);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await new Promise(r => setTimeout(r, 300));
        el.click();
        return true;
      }
      await new Promise(r => setTimeout(r, 500));
    }
    throw new Error('Element not found after ' + retries + ' retries: ' + selector);
  },
  
  // Get visible text
  getVisibleText: (selector) => {
    const el = selector ? document.querySelector(selector) : document.body;
    if (!el) return null;
    return (el.innerText || '').substring(0, 10000);
  },
  
  // Check if element exists
  elementExists: (selector) => {
    return document.querySelector(selector) !== null;
  },
  
  // Count elements
  countElements: (selector) => {
    return document.querySelectorAll(selector).length;
  },
  
  // Scroll to element
  scrollToElement: (selector, behavior = 'smooth') => {
    const el = document.querySelector(selector);
    if (el) {
      el.scrollIntoView({ behavior, block: 'center' });
      return true;
    }
    return false;
  },
  
  // Fill form
  fillForm: (formData) => {
    if (!formData || typeof formData !== 'object') return;
    Object.entries(formData).slice(0, 50).forEach(([selector, value]) => {
      const el = document.querySelector(selector);
      if (el) {
        const safeValue = String(value).substring(0, 10000);
        if (el.type === 'checkbox' || el.type === 'radio') {
          el.checked = !!value;
        } else {
          el.value = safeValue;
        }
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  }
};
`;

/**
 * CodeExecutor - Execute JavaScript code in page context
 * Uses sandbox validation to ensure code safety before execution
 */
export class CodeExecutor {
  /**
   * @param {Object} options
   * @param {number} options.maxExecutionsPerMinute - Rate limit
   * @param {number} options.promiseTimeout - Promise resolution timeout (ms)
   */
  constructor(options = {}) {
    this.sandbox = new SandboxExecutor();
    this.rateLimiter = new RateLimiter({
      maxExecutions: options.maxExecutionsPerMinute || 30,
      windowMs: 60000
    });
    this.promiseTimeout = options.promiseTimeout || 30000;
    this._destroyed = false;

    // Suspicious patterns to warn about (not block, just warn)
    this.suspiciousPatterns = [
      /fetch\s*\(\s*['"]https?:\/\/(?!localhost|127\.0\.0\.1)/i,
      /XMLHttpRequest/i,
      /WebSocket/i
    ];
  }

  /**
   * Execute code on tab
   * @param {number} tabId - Tab ID
   * @param {string} code - Code to execute
   * @returns {Promise<{success: boolean, result?: any, error?: string}>}
   */
  async execute(tabId, code) {
    // Prevent execution after destroy
    if (this._destroyed) {
      return { success: false, error: 'CodeExecutor has been destroyed' };
    }

    // Validate input
    if (!code || typeof code !== 'string') {
      return { success: false, error: 'Code must be a non-empty string' };
    }

    // Check rate limit
    if (this.rateLimiter.isLimited()) {
      const waitTime = this.rateLimiter.getTimeUntilAvailable();
      return {
        success: false,
        error: `Rate limit exceeded. Please wait ${Math.ceil(waitTime / 1000)} seconds.`
      };
    }

    // CRITICAL: Validate code using sandbox before any execution
    // This is the security gate that prevents dangerous code execution
    const validation = this.sandbox.validate(code);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    // Log warnings if any
    if (validation.warnings?.length > 0) {
      logger.warn('Code validation warnings', { warnings: validation.warnings });
    }

    // Warn about suspicious patterns (but don't block)
    for (const pattern of this.suspiciousPatterns) {
      if (pattern.test(code)) {
        logger.warn('Code contains potentially risky pattern', { pattern: pattern.toString() });
      }
    }

    // Record execution for rate limiting
    this.rateLimiter.record();

    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: this._createExecutionWrapper(),
        args: [code],
        world: 'MAIN'
      });

      const result = results[0]?.result;

      // Check for execution errors
      if (result && typeof result === 'object' && result.__error) {
        return {
          success: false,
          error: result.message,
          stack: result.stack
        };
      }

      // Handle promise results with timeout
      if (result instanceof Promise) {
        return await this._handlePromise(result);
      }

      return { success: true, result };
    } catch (error) {
      return this._handleChromeError(error);
    }
  }

  /**
   * Create the execution wrapper function
   * Uses new Function() only for wrapping validated user code
   * @private
   * @returns {Function}
   */
  _createExecutionWrapper() {
    return codeStr => {
      try {
        // Build the wrapped code with helper utilities
        // The user code has already been validated by sandbox
        const wrappedCode = `
          "use strict";
          return (async () => {
            ${CHROME_AGENT_HELPERS}
            ${codeStr}
          })();
        `;

        // new Function() is safe here because:
        // 1. Code has been validated by SandboxExecutor for dangerous patterns
        // 2. No external input reaches this point without validation
        // 3. The wrapper provides controlled helpers via __chromeAgent
        const asyncFn = new Function(wrappedCode);
        return asyncFn();
      } catch (e) {
        return { __error: true, message: e.message, stack: e.stack };
      }
    };
  }

  /**
   * Handle promise result with timeout
   * @private
   * @param {Promise} promise
   * @returns {Promise<Object>}
   */
  async _handlePromise(promise) {
    try {
      const resolved = await Promise.race([
        promise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Promise timeout after ${this.promiseTimeout / 1000} seconds`)), this.promiseTimeout)
        )
      ]);
      return { success: true, result: resolved };
    } catch (e) {
      return { success: false, error: `Promise rejected: ${e.message}` };
    }
  }

  /**
   * Handle Chrome API errors
   * @private
   * @param {Error} error
   * @returns {Object}
   */
  _handleChromeError(error) {
    if (error.message?.includes('Cannot access')) {
      return {
        success: false,
        error: 'Cannot access this page. It may be a restricted page.'
      };
    }
    if (error.message?.includes('No tab with id')) {
      return { success: false, error: 'Tab was closed during execution' };
    }
    if (error.message?.includes('Missing host permission')) {
      return { success: false, error: 'Missing permission for this page' };
    }
    return { success: false, error: error.message };
  }

  /**
   * Get rate limiter stats
   * @returns {Object}
   */
  getRateLimitStats() {
    return this.rateLimiter.getStats();
  }

  /**
   * Check if the executor has been destroyed
   * @returns {boolean}
   */
  isDestroyed() {
    return this._destroyed;
  }

  /**
   * Destroy the executor and cleanup resources
   * Call this when the executor is no longer needed
   */
  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    this.rateLimiter.destroy();
  }
}
