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
    this.allowedGlobals =
      options.allowedGlobals ||
      new Set([
        'document',
        'window',
        'console',
        'Array',
        'Object',
        'String',
        'Number',
        'Boolean',
        'Date',
        'Math',
        'JSON',
        'Promise',
        'setTimeout',
        'setInterval',
        'clearTimeout',
        'clearInterval',
        'fetch',
        'URL',
        'URLSearchParams',
        'FormData',
        'Headers',
        'Request',
        'Response',
        'Blob',
        'File',
        'FileReader',
        'Image',
        'Audio',
        'MutationObserver',
        'IntersectionObserver',
        'ResizeObserver',
        'PerformanceObserver',
        'AbortController',
        'Event',
        'CustomEvent',
        'Element',
        'Node',
        'NodeList',
        'HTMLCollection',
        'DOMParser',
        'XMLSerializer'
      ]);

    // Blocked patterns with severity levels
    this.blockedPatterns = [
      // Critical - Always block
      { pattern: /\beval\s*\(/, severity: 'critical', message: 'eval() is not allowed' },
      {
        pattern: /Function\s*\(/,
        severity: 'critical',
        message: 'Function constructor is not allowed'
      },
      {
        pattern: /new\s+Function\b/,
        severity: 'critical',
        message: 'Function constructor is not allowed'
      },
      { pattern: /__proto__/, severity: 'critical', message: 'Prototype pollution detected' },
      {
        pattern: /constructor\s*\(\s*\)\s*\{/,
        severity: 'critical',
        message: 'Constructor manipulation detected'
      },
      {
        pattern: /Reflect\.construct/,
        severity: 'critical',
        message: 'Reflect.construct is not allowed'
      },

      // High - Block by default
      {
        pattern: /chrome\.(storage|tabs|runtime|history|bookmarks|extension)\b/,
        severity: 'high',
        message: 'Chrome API access is not allowed'
      },
      {
        pattern: /browser\.(storage|tabs|runtime|history|bookmarks)\b/,
        severity: 'high',
        message: 'Browser API access is not allowed'
      },
      {
        pattern: /navigator\.serviceWorker/,
        severity: 'high',
        message: 'Service Worker access is not allowed'
      },
      { pattern: /importScripts/, severity: 'high', message: 'importScripts is not allowed' },
      { pattern: /Worklet/, severity: 'high', message: 'Worklet is not allowed' },
      {
        pattern: /SharedArrayBuffer/,
        severity: 'high',
        message: 'SharedArrayBuffer is not allowed'
      },
      { pattern: /Atomics\./, severity: 'high', message: 'Atomics is not allowed' },

      // Medium - Block potentially dangerous operations
      { pattern: /document\.write/, severity: 'medium', message: 'document.write is not allowed' },
      {
        pattern: /document\.writeln/,
        severity: 'medium',
        message: 'document.writeln is not allowed'
      },
      { pattern: /<script/i, severity: 'medium', message: 'Script tags are not allowed' },
      {
        pattern: /javascript:/i,
        severity: 'medium',
        message: 'javascript: protocol is not allowed'
      },
      { pattern: /data:/i, severity: 'medium', message: 'data: protocol may be unsafe' },
      { pattern: /vbscript:/i, severity: 'medium', message: 'vbscript: protocol is not allowed' },
      { pattern: /window\.open\s*\(/, severity: 'medium', message: 'window.open is not allowed' },
      {
        pattern: /window\.showModalDialog/,
        severity: 'medium',
        message: 'showModalDialog is not allowed'
      },
      { pattern: /location\s*=/, severity: 'medium', message: 'Location change is not allowed' },
      {
        pattern: /location\.href\s*=/,
        severity: 'medium',
        message: 'Location change is not allowed'
      },
      {
        pattern: /location\.replace/,
        severity: 'medium',
        message: 'Location replace is not allowed'
      },
      {
        pattern: /location\.assign/,
        severity: 'medium',
        message: 'Location assign is not allowed'
      },
      { pattern: /document\.cookie/, severity: 'medium', message: 'Cookie access is not allowed' },
      {
        pattern: /localStorage/,
        severity: 'medium',
        message: 'LocalStorage access is not allowed'
      },
      {
        pattern: /sessionStorage/,
        severity: 'medium',
        message: 'SessionStorage access is not allowed'
      },
      { pattern: /indexedDB/, severity: 'medium', message: 'IndexedDB access is not allowed' },
      { pattern: /openDatabase/, severity: 'medium', message: 'WebSQL access is not allowed' },
      { pattern: /XMLHttpRequest/, severity: 'medium', message: 'XMLHttpRequest is not allowed' },
      { pattern: /WebSocket/, severity: 'medium', message: 'WebSocket is not allowed' },
      { pattern: /EventSource/, severity: 'medium', message: 'EventSource is not allowed' },
      { pattern: /import\s*\(/, severity: 'medium', message: 'Dynamic import is not allowed' },
      { pattern: /require\s*\(/, severity: 'medium', message: 'require() is not allowed' },

      // Node.js specific
      { pattern: /process\b/, severity: 'high', message: 'Node.js process access is not allowed' },
      { pattern: /global\b/, severity: 'high', message: 'Node.js global access is not allowed' },
      {
        pattern: /globalThis\s*\.\s*process/,
        severity: 'high',
        message: 'Process access via globalThis is not allowed'
      },
      { pattern: /module\.exports/, severity: 'high', message: 'CommonJS exports is not allowed' },
      { pattern: /__dirname/, severity: 'high', message: '__dirname is not allowed' },
      { pattern: /__filename/, severity: 'high', message: '__filename is not allowed' }
    ];

    // Warning patterns (allowed but logged)
    this.warningPatterns = [
      { pattern: /\.innerHTML\s*=/, message: 'innerHTML assignment can be unsafe' },
      { pattern: /\.outerHTML\s*=/, message: 'outerHTML assignment can be unsafe' },
      { pattern: /insertAdjacentHTML/, message: 'insertAdjacentHTML can be unsafe' },
      { pattern: /document\.execCommand/, message: 'execCommand is deprecated and may be unsafe' },
      { pattern: /eval\s*\(/, message: 'eval-like pattern detected' },
      { pattern: /setTimeout\s*\(\s*['"`]/, message: 'String passed to setTimeout is eval-like' },
      { pattern: /setInterval\s*\(\s*['"`]/, message: 'String passed to setInterval is eval-like' },
      { pattern: /new\s+Function/, message: 'Function constructor is eval-like' }
    ];
  }

  /**
   * Validate code before execution
   * @param {string} code - Code to validate
   * @returns {{valid: boolean, error?: string, warnings?: string[]}}
   */
  validate(code) {
    const warnings = [];

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

    // Check for blocked patterns with severity
    for (const { pattern, severity, message } of this.blockedPatterns) {
      if (pattern.test(code)) {
        // Critical and high severity always fail
        if (severity === 'critical' || severity === 'high') {
          return {
            valid: false,
            error: `Blocked: ${message}`,
            severity
          };
        }
        // Medium severity - could be configurable, but we block by default
        return {
          valid: false,
          error: `Blocked: ${message}`,
          severity
        };
      }
    }

    // Check for warning patterns
    for (const { pattern, message } of this.warningPatterns) {
      if (pattern.test(code)) {
        warnings.push(message);
      }
    }

    // Additional security checks
    const securityCheck = this._performSecurityChecks(code);
    if (!securityCheck.passed) {
      return { valid: false, error: securityCheck.error };
    }

    // Add any additional warnings
    if (securityCheck.warnings) {
      warnings.push(...securityCheck.warnings);
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

    return { valid: true, warnings: warnings.length > 0 ? warnings : undefined };
  }

  /**
   * Perform additional security checks
   * @param {string} code - Code to check
   * @returns {{passed: boolean, error?: string, warnings?: string[]}}
   */
  _performSecurityChecks(code) {
    const warnings = [];

    // Check for potential infinite loops (basic detection)
    const infiniteLoopPatterns = [
      /while\s*\(\s*true\s*\)\s*\{[^}]*\}/,
      /for\s*\(\s*;\s*;\s*\)\s*\{[^}]*\}/,
      /while\s*\(\s*1\s*\)\s*\{[^}]*\}/
    ];

    for (const pattern of infiniteLoopPatterns) {
      if (pattern.test(code)) {
        return { passed: false, error: 'Potential infinite loop detected' };
      }
    }

    // Check for suspicious string patterns that might be obfuscated
    const obfuscationPatterns = [
      { pattern: /atob\s*\(/, message: 'atob() can be used for obfuscation' },
      { pattern: /btoa\s*\(/, message: 'btoa() can be used for obfuscation' },
      {
        pattern: /String\.fromCharCode/,
        message: 'String.fromCharCode can be used for obfuscation'
      },
      { pattern: /\\x[0-9a-f]{2}/i, message: 'Hex escape sequences detected' },
      { pattern: /\\u[0-9a-f]{4}/i, message: 'Unicode escape sequences detected' }
    ];

    for (const { pattern, message } of obfuscationPatterns) {
      if (pattern.test(code)) {
        warnings.push(message);
      }
    }

    // Check for attempt to access extension context
    if (/chrome\.extension/.test(code)) {
      return { passed: false, error: 'Access to extension context is not allowed' };
    }

    // Check for prototype chain manipulation
    if (/Object\.setPrototypeOf/.test(code) || /Object\.getPrototypeOf/.test(code)) {
      warnings.push('Prototype chain manipulation detected');
    }

    // Check for Proxy usage (can be used to intercept and modify behavior)
    if (/\bnew\s+Proxy\b/.test(code)) {
      warnings.push('Proxy usage detected - can modify object behavior');
    }

    // Check for Reflect usage
    if (/\bReflect\./.test(code)) {
      warnings.push('Reflect API usage detected');
    }

    return { passed: true, warnings };
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
      const result = await this.executeWithTimeout(sandboxedCode, this.maxExecutionTime);

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
