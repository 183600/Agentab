// lib/sandbox.js - Secure code execution sandbox

import { logger } from './logger.js';

/**
 * SandboxExecutor - Provides secure JavaScript code execution
 * Replaces dangerous eval() with safer alternatives
 */
export class SandboxExecutor {
  constructor(options = {}) {
    this.maxCodeSize = options.maxCodeSize || 100000; // 100KB default
    this.maxExecutionTime = options.maxExecutionTime || 30000; // 30s default
    this.allowedGlobals = options.allowedGlobals || new Set([
      'document', 'window', 'console', 'Array', 'Object', 'String',
      'Number', 'Boolean', 'Date', 'Math', 'JSON', 'Promise',
      'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
      'fetch', 'URL', 'URLSearchParams', 'FormData', 'Headers',
      'Request', 'Response', 'Blob', 'File', 'FileReader',
      'Image', 'Audio', 'MutationObserver', 'IntersectionObserver',
      'ResizeObserver', 'PerformanceObserver', 'AbortController',
      'Event', 'CustomEvent', 'Element', 'Node', 'NodeList',
      'HTMLCollection', 'DOMParser', 'XMLSerializer'
    ]);
    this.blockedPatterns = [
      /\beval\s*\(/,                                    // Direct eval
      /Function\s*\(/,                                  // Function constructor
      /document\.write/,                                // document.write
      /<script/i,                                       // Script tags
      /javascript:/i,                                   // JavaScript protocol
      /__proto__/,                                      // Prototype pollution
      /constructor\s*\(\s*\)\s*\s*\{/,                // Constructor manipulation
      /chrome\.(storage|tabs|runtime|history|bookmarks)\b/,  // Chrome API access
      /navigator\.serviceWorker/,                       // Service Worker access
      /window\.open\s*\(/,                              // Window open
      /location\s*=/,                                   // Location change
      /location\.href\s*=/,                             // Location href change
      /location\.replace/,                              // Location replace
      /document\.cookie/,                               // Cookie access
      /localStorage/,                                   // LocalStorage access
      /sessionStorage/,                                 // SessionStorage access
      /indexedDB/,                                      // IndexedDB access
      /XMLHttpRequest/,                                 // XHR access
      /WebSocket/,                                      // WebSocket access
      /import\s*\(/,                                    // Dynamic import
      /require\s*\(/,                                   // Require (Node.js)
      /process\b/,                                      // Node.js process
      /global\b/,                                       // Node.js global
      /module\.exports/,                                // CommonJS exports
    ];
  }

  /**
   * Validate code before execution
   * @param {string} code - Code to validate
   * @returns {{valid: boolean, error?: string}}
   */
  validate(code) {
    // Check if code is a non-empty string
    if (!code || typeof code !== 'string') {
      return { valid: false, error: 'Code must be a non-empty string' };
    }

    // Check code size
    if (code.length > this.maxCodeSize) {
      return {
        valid: false,
        error: `Code too large: ${code.length} bytes (max: ${this.maxCodeSize})`
      };
    }

    // Check for blocked patterns
    for (const pattern of this.blockedPatterns) {
      if (pattern.test(code)) {
        return {
          valid: false,
          error: `Blocked pattern detected: ${pattern.toString()}`
        };
      }
    }

    // Additional security checks
    const securityCheck = this._performSecurityChecks(code);
    if (!securityCheck.passed) {
      return { valid: false, error: securityCheck.error };
    }

    // Basic syntax check (try to parse)
    try {
      // Wrap in async function to check syntax
      new Function('return (async () => { ' + code + ' })');
    } catch (e) {
      return {
        valid: false,
        error: `Syntax error: ${e.message}`
      };
    }

    return { valid: true };
  }

  /**
   * Perform additional security checks
   * @param {string} code - Code to check
   * @returns {{passed: boolean, error?: string}}
   */
  _performSecurityChecks(code) {
    // Check for potential infinite loops (basic detection)
    const infiniteLoopPatterns = [
      /while\s*\(\s*true\s*\)\s*\{[^}]*\}/,
      /for\s*\(\s*;\s*;\s*\)\s*\{[^}]*\}/,
    ];
    
    for (const pattern of infiniteLoopPatterns) {
      if (pattern.test(code)) {
        return { passed: false, error: 'Potential infinite loop detected' };
      }
    }

    // Check for suspicious string patterns that might be obfuscated
    const obfuscationPatterns = [
      /atob\s*\(/,
      /btoa\s*\(/,
      /String\.fromCharCode/,
      /\\x[0-9a-f]{2}/i,
      /\\u[0-9a-f]{4}/i,
    ];

    for (const pattern of obfuscationPatterns) {
      if (pattern.test(code)) {
        // Warning but not blocking - could be legitimate
        logger.warn(`Potentially obfuscated code detected: ${pattern.toString()}`);
      }
    }

    // Check for attempt to access extension context
    if (/chrome\.extension/.test(code)) {
      return { passed: false, error: 'Access to extension context is not allowed' };
    }

    return { passed: true };
  }

  /**
   * Execute code in a sandboxed environment
   * @param {string} code - Code to execute
   * @param {Object} context - Execution context (variables to expose)
   * @returns {Promise<{success: boolean, result?: any, error?: string, executionTime?: number}>}
   */
  async execute(code, context = {}) {
    const startTime = Date.now();

    // Validate code
    const validation = this.validate(code);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.error,
        executionTime: Date.now() - startTime
      };
    }

    try {
      // Create a sandboxed function
      const sandboxedCode = this.createSandboxedCode(code, context);

      // Execute with timeout
      const result = await this.executeWithTimeout(
        sandboxedCode,
        this.maxExecutionTime
      );

      return {
        success: true,
        result,
        executionTime: Date.now() - startTime
      };
    } catch (error) {
      return {
        success: false,
        error: this.formatError(error),
        executionTime: Date.now() - startTime
      };
    }
  }

  /**
   * Create sandboxed code with restricted globals
   * @param {string} code - Original code
   * @param {Object} context - Context variables
   * @returns {Function}
   */
  createSandboxedCode(code, context) {
    // Build context parameter names and values
    const contextKeys = Object.keys(context);
    const contextValues = Object.values(context);

    // Create a function with restricted scope
    // This is safer than eval() but not as restrictive as an iframe sandbox
    const wrappedCode = `
      "use strict";
      return (async () => {
        ${code}
      })();
    `;

    try {
      // Use Function constructor (safer than eval)
      // The function is created in global scope but we control what's exposed
      const fn = new Function(...contextKeys, wrappedCode);
      return () => fn(...contextValues);
    } catch (error) {
      throw new Error(`Failed to create sandbox: ${error.message}`);
    }
  }

  /**
   * Execute function with timeout
   * @param {Function} fn - Function to execute
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<any>}
   */
  async executeWithTimeout(fn, timeout) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Execution timeout after ${timeout}ms`));
      }, timeout);

      Promise.resolve()
        .then(() => fn())
        .then(result => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  /**
   * Format error message for user display
   * @param {Error} error - Error object
   * @returns {string}
   */
  formatError(error) {
    if (error.name === 'AbortError' || error.message.includes('timeout')) {
      return `Execution timed out. The code took too long to run.`;
    }

    if (error.message.includes('SyntaxError')) {
      return `Syntax error in code: ${error.message}`;
    }

    if (error.message.includes('ReferenceError')) {
      return `Reference error: ${error.message}. Check if all variables are defined.`;
    }

    if (error.message.includes('TypeError')) {
      return `Type error: ${error.message}`;
    }

    // Generic error
    return `Execution failed: ${error.message}`;
  }

  /**
   * Create a safe context for page manipulation
   * @returns {Object}
   */
  static createPageContext() {
    return {
      // DOM helpers
      $: selector => document.querySelector(selector),
      $$: selector => document.querySelectorAll(selector),

      // Safe console (no info/debug in production)
      console: {
        log: (...args) => console.log(...args),
        warn: (...args) => console.warn(...args),
        error: (...args) => console.error(...args)
      }
    };
  }
}

/**
 * Quick validation function for code snippets
 * @param {string} code - Code to validate
 * @returns {boolean}
 */
export function isValidCode(code) {
  const executor = new SandboxExecutor();
  return executor.validate(code).valid;
}

/**
 * Quick execution function for simple code
 * @param {string} code - Code to execute
 * @param {Object} context - Execution context
 * @returns {Promise<any>}
 */
export async function safeExecute(code, context = {}) {
  const executor = new SandboxExecutor();
  const result = await executor.execute(code, context);

  if (!result.success) {
    throw new Error(result.error);
  }

  return result.result;
}
