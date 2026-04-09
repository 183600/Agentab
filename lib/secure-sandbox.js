// lib/secure-sandbox.js - Enhanced secure code execution with iframe isolation

import { logger } from './logger.js';

/**
 * SecureSandbox - Provides enhanced security through iframe isolation
 * Creates a separate execution context with restricted capabilities
 */
export class SecureSandbox {
  constructor(options = {}) {
    this.options = {
      maxCodeSize: options.maxCodeSize || 100000, // 100KB
      maxExecutionTime: options.maxExecutionTime || 30000, // 30s
      enableTimeout: options.enableTimeout ?? true,
      restrictGlobals: options.restrictGlobals ?? true,
      ...options
    };

    this.blockedPatterns = [
      /\beval\s*\(/,
      /Function\s*\(/,
      /document\.write/,
      /<script/i,
      /javascript:/i,
      /__proto__/,
      /constructor\s*\(\s*\)\s*\{/,
      /chrome\s*\.\s*storage/,  // Block Chrome storage access
      /chrome\s*\.\s*runtime/,  // Block Chrome runtime access
      /window\s*\.\s*open/,
      /window\s*\.\s*location\s*=/,
      /XMLHttpRequest/,
      /WebSocket/
    ];

    this.allowedGlobals = new Set([
      'document', 'window', 'console', 'Array', 'Object', 'String',
      'Number', 'Boolean', 'Date', 'Math', 'JSON', 'Promise',
      'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
      'fetch', 'URL', 'URLSearchParams', 'FormData', 'Headers',
      'Request', 'Response', 'Element', 'Node', 'NodeList',
      'HTMLCollection', 'Event', 'CustomEvent', 'Error',
      'document', 'navigator', 'location'  // Read-only location
    ]);
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
    if (code.length > this.options.maxCodeSize) {
      return {
        valid: false,
        error: `Code too large: ${code.length} bytes (max: ${this.options.maxCodeSize})`
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

    // Warn about potentially dangerous operations
    const warningPatterns = [
      { pattern: /innerHTML\s*=/, message: 'Direct innerHTML assignment detected' },
      { pattern: /outerHTML\s*=/, message: 'Direct outerHTML assignment detected' },
      { pattern: /insertAdjacentHTML/, message: 'insertAdjacentHTML detected' },
      { pattern: /document\.cookie/, message: 'Cookie access detected' }
    ];

    for (const { pattern, message } of warningPatterns) {
      if (pattern.test(code)) {
        warnings.push(message);
      }
    }

    // Basic syntax check
    try {
      new Function('return (async () => { ' + code + ' })');
    } catch (e) {
      return {
        valid: false,
        error: `Syntax error: ${e.message}`
      };
    }

    return { valid: true, warnings };
  }

  /**
   * Execute code in an isolated iframe sandbox
   * @param {string} code - Code to execute
   * @param {Object} context - Execution context
   * @returns {Promise<{success: boolean, result?: any, error?: string, warnings?: string[], executionTime?: number}>}
   */
  async executeInIframe(code, context = {}) {
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

    return new Promise(resolve => {
      // Create sandbox iframe
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.sandbox = 'allow-scripts'; // Minimal sandbox permissions

      // Generate unique ID for this execution
      const executionId = `sandbox_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Create HTML content for sandbox
      const sandboxHtml = this.createSandboxHtml(code, context, executionId);

      // Set up message listener for results
      const messageHandler = event => {
        if (event.data.executionId === executionId) {
          window.removeEventListener('message', messageHandler);
          cleanup();

          resolve({
            success: event.data.success,
            result: event.data.result,
            error: event.data.error,
            warnings: validation.warnings,
            executionTime: Date.now() - startTime
          });
        }
      };

      // Cleanup function
      const cleanup = () => {
        if (iframe.parentNode) {
          iframe.parentNode.removeChild(iframe);
        }
        clearTimeout(timeoutId);
      };

      // Set up timeout
      const timeoutId = setTimeout(() => {
        window.removeEventListener('message', messageHandler);
        cleanup();
        resolve({
          success: false,
          error: `Execution timeout after ${this.options.maxExecutionTime}ms`,
          executionTime: Date.now() - startTime
        });
      }, this.options.maxExecutionTime);

      // Add message listener
      window.addEventListener('message', messageHandler);

      // Inject HTML into iframe
      document.body.appendChild(iframe);
      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
      iframeDoc.open();
      iframeDoc.write(sandboxHtml);
      iframeDoc.close();
    });
  }

  /**
   * Create sandbox HTML content
   * @param {string} code - Code to execute
   * @param {Object} context - Context variables
   * @param {string} executionId - Execution ID
   * @returns {string}
   */
  createSandboxHtml(code, context, executionId) {
    // Build context setup code
    const contextSetup = Object.entries(context)
      .map(([key, value]) => `const ${key} = ${JSON.stringify(value)};`)
      .join('\n');

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="
    default-src 'none';
    script-src 'unsafe-inline';
    style-src 'unsafe-inline';
  ">
</head>
<body>
<script>
(function() {
  'use strict';

  // Context variables
  ${contextSetup}

  // Execute code and send result
  async function execute() {
    try {
      const result = await (async () => {
        ${code}
      })();

      parent.postMessage({
        executionId: '${executionId}',
        success: true,
        result: result
      }, location.origin);
    } catch (error) {
      parent.postMessage({
        executionId: '${executionId}',
        success: false,
        error: error.message,
        stack: error.stack
      }, location.origin);
    }
  }

  execute();
})();
</script>
</body>
</html>
    `;
  }

  /**
   * Execute code with fallback to Function constructor if iframe fails
   * @param {string} code - Code to execute
   * @param {Object} context - Execution context
   * @returns {Promise<{success: boolean, result?: any, error?: string, warnings?: string[], executionTime?: number}>}
   */
  async execute(code, context = {}) {
    // Try iframe sandbox first (most secure)
    try {
      const result = await this.executeInIframe(code, context);
      return result;
    } catch (error) {
      logger.warn('Iframe sandbox failed, falling back to Function constructor', error);

      // Fallback to Function constructor (less secure but more compatible)
      return this.executeWithFunction(code, context);
    }
  }

  /**
   * Execute using Function constructor (fallback)
   * @param {string} code - Code to execute
   * @param {Object} context - Execution context
   * @returns {Promise<{success: boolean, result?: any, error?: string, warnings?: string[], executionTime?: number}>}
   */
  async executeWithFunction(code, context = {}) {
    const startTime = Date.now();

    const validation = this.validate(code);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.error,
        executionTime: Date.now() - startTime
      };
    }

    try {
      const contextKeys = Object.keys(context);
      const contextValues = Object.values(context);

      const wrappedCode = `
        "use strict";
        return (async () => {
          ${code}
        })();
      `;

      const fn = new Function(...contextKeys, wrappedCode);
      const result = await fn(...contextValues);

      return {
        success: true,
        result,
        warnings: validation.warnings || [],
        executionTime: Date.now() - startTime
      };
    } catch (error) {
      return {
        success: false,
        error: this.formatError(error),
        warnings: validation.warnings || [],
        executionTime: Date.now() - startTime
      };
    }
  }

  /**
   * Format error for display
   * @param {Error} error - Error object
   * @returns {string}
   */
  formatError(error) {
    if (error.name === 'AbortError' || error.message.includes('timeout')) {
      return 'Execution timed out. The code took too long to run.';
    }

    if (error instanceof SyntaxError || error.name === 'SyntaxError' || error.message.includes('SyntaxError')) {
      return `Syntax error: ${error.message}`;
    }

    if (error instanceof ReferenceError || error.name === 'ReferenceError' || error.message.includes('ReferenceError')) {
      return `Reference error: ${error.message}. Check if all variables are defined.`;
    }

    return `Execution failed: ${error.message}`;
  }

  /**
   * Create safe page manipulation context
   * @returns {Object}
   */
  static createPageContext() {
    return {
      $: selector => document.querySelector(selector),
      $$: selector => document.querySelectorAll(selector),
      console: {
        log: (...args) => console.log(...args),
        warn: (...args) => console.warn(...args),
        error: (...args) => console.error(...args)
      }
    };
  }
}

/**
 * Quick validation function
 * @param {string} code - Code to validate
 * @returns {boolean}
 */
export function isSecureCode(code) {
  const sandbox = new SecureSandbox();
  return sandbox.validate(code).valid;
}

/**
 * Quick execution function
 * @param {string} code - Code to execute
 * @param {Object} context - Execution context
 * @returns {Promise<any>}
 */
export async function secureExecute(code, context = {}) {
  const sandbox = new SecureSandbox();
  const result = await sandbox.execute(code, context);

  if (!result.success) {
    throw new Error(result.error);
  }

  return result.result;
}

// Export singleton
export const secureSandbox = new SecureSandbox();
