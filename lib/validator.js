// lib/validator.js - Input validation and sanitization

/**
 * InputValidator - Comprehensive input validation utilities
 */
export class InputValidator {
  /**
   * Validate and sanitize a prompt string
   * @param {string} prompt - User input prompt
   * @param {Object} options - Validation options
   * @returns {{valid: boolean, value?: string, error?: string}}
   */
  static validatePrompt(prompt, options = {}) {
    const {
      minLength = 1,
      maxLength = 10000,
      allowHtml = false,
      allowNewlines = true
    } = options;

    // Check if prompt exists
    if (prompt === null || prompt === undefined) {
      return { valid: false, error: 'Prompt is required' };
    }

    // Convert to string
    let value = String(prompt);

    // Trim whitespace
    value = value.trim();

    // Check length
    if (value.length < minLength) {
      return { valid: false, error: `Prompt must be at least ${minLength} characters` };
    }

    if (value.length > maxLength) {
      return { valid: false, error: `Prompt must not exceed ${maxLength} characters` };
    }

    // Check for newlines if not allowed
    if (!allowNewlines && value.includes('\n')) {
      return { valid: false, error: 'Prompt must not contain newlines' };
    }

    // Sanitize HTML if not allowed
    if (!allowHtml) {
      value = this.stripHtml(value);
    }

    // Check for potential injection patterns
    const injectionPatterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, // Script tags
      /javascript:/gi,                                        // JavaScript protocol
      /on\w+\s*=/gi,                                         // Event handlers
      /data:/gi                                              // Data URLs
    ];

    for (const pattern of injectionPatterns) {
      if (pattern.test(value)) {
        return { valid: false, error: 'Potentially unsafe content detected' };
      }
    }

    return { valid: true, value };
  }

  /**
   * Validate and sanitize code string
   * @param {string} code - User code
   * @param {Object} options - Validation options
   * @returns {{valid: boolean, value?: string, error?: string}}
   */
  static validateCode(code, options = {}) {
    const {
      minLength = 1,
      maxLength = 100000
    } = options;

    // Check if code exists
    if (code === null || code === undefined) {
      return { valid: false, error: 'Code is required' };
    }

    // Convert to string
    let value = String(code);

    // Trim whitespace
    value = value.trim();

    // Check length
    if (value.length < minLength) {
      return { valid: false, error: 'Code cannot be empty' };
    }

    if (value.length > maxLength) {
      return { valid: false, error: `Code exceeds maximum size of ${maxLength} bytes` };
    }

    // Check for balanced brackets/parentheses (basic syntax check)
    const brackets = { '(': ')', '[': ']', '{': '}' };
    const stack = [];

    for (const char of value) {
      if (brackets[char]) {
        stack.push(char);
      } else if (Object.values(brackets).includes(char)) {
        const last = stack.pop();
        if (brackets[last] !== char) {
          // Unbalanced - but might be in string/comment, so just warn
          console.warn('Potentially unbalanced brackets in code');
          break;
        }
      }
    }

    return { valid: true, value };
  }

  /**
   * Validate task object
   * @param {Object} task - Task object
   * @returns {{valid: boolean, value?: Object, error?: string}}
   */
  static validateTask(task) {
    if (!task || typeof task !== 'object') {
      return { valid: false, error: 'Task must be an object' };
    }

    // Validate name
    const nameResult = this.validateTaskName(task.name);
    if (!nameResult.valid) {
      return { valid: false, error: `Invalid name: ${nameResult.error}` };
    }

    // Validate type
    const typeResult = this.validateTaskType(task.type);
    if (!typeResult.valid) {
      return { valid: false, error: `Invalid type: ${typeResult.error}` };
    }

    // Validate content based on type
    const contentResult = task.type === 'prompt'
      ? this.validatePrompt(task.content)
      : this.validateCode(task.content);

    if (!contentResult.valid) {
      return { valid: false, error: `Invalid content: ${contentResult.error}` };
    }

    // Validate description if provided
    if (task.description) {
      const descResult = this.validateDescription(task.description);
      if (!descResult.valid) {
        return { valid: false, error: `Invalid description: ${descResult.error}` };
      }
    }

    return {
      valid: true,
      value: {
        name: nameResult.value,
        type: typeResult.value,
        content: contentResult.value,
        description: task.description ? this.validateDescription(task.description).value : ''
      }
    };
  }

  /**
   * Validate task name
   * @param {string} name - Task name
   * @returns {{valid: boolean, value?: string, error?: string}}
   */
  static validateTaskName(name) {
    if (!name || typeof name !== 'string') {
      return { valid: false, error: 'Name is required' };
    }

    const value = name.trim();

    if (value.length === 0) {
      return { valid: false, error: 'Name cannot be empty' };
    }

    if (value.length > 100) {
      return { valid: false, error: 'Name must not exceed 100 characters' };
    }

    // Check for invalid characters
    if (/[<>:"/\\|?*]/.test(value)) {
      return { valid: false, error: 'Name contains invalid characters' };
    }

    return { valid: true, value };
  }

  /**
   * Validate task type
   * @param {string} type - Task type
   * @returns {{valid: boolean, value?: string, error?: string}}
   */
  static validateTaskType(type) {
    const validTypes = ['prompt', 'code'];

    if (!type || typeof type !== 'string') {
      return { valid: false, error: 'Type is required' };
    }

    const value = type.toLowerCase().trim();

    if (!validTypes.includes(value)) {
      return { valid: false, error: `Type must be one of: ${validTypes.join(', ')}` };
    }

    return { valid: true, value };
  }

  /**
   * Validate description
   * @param {string} description - Description
   * @returns {{valid: boolean, value?: string, error?: string}}
   */
  static validateDescription(description) {
    if (description === null || description === undefined) {
      return { valid: true, value: '' };
    }

    const value = String(description).trim();

    if (value.length > 500) {
      return { valid: false, error: 'Description must not exceed 500 characters' };
    }

    return { valid: true, value: this.stripHtml(value) };
  }

  /**
   * Validate API key format
   * @param {string} apiKey - API key
   * @returns {{valid: boolean, value?: string, error?: string}}
   */
  static validateApiKey(apiKey) {
    if (!apiKey || typeof apiKey !== 'string') {
      return { valid: false, error: 'API key is required' };
    }

    const value = apiKey.trim();

    if (value.length === 0) {
      return { valid: false, error: 'API key cannot be empty' };
    }

    // Basic format check (most API keys are alphanumeric with possible dashes/underscores)
    if (!/^[a-zA-Z0-9\-_]+$/.test(value)) {
      return { valid: false, error: 'API key contains invalid characters' };
    }

    return { valid: true, value };
  }

  /**
   * Validate URL
   * @param {string} url - URL to validate
   * @returns {{valid: boolean, value?: string, error?: string}}
   */
  static validateUrl(url) {
    if (!url || typeof url !== 'string') {
      return { valid: false, error: 'URL is required' };
    }

    const value = url.trim();

    try {
      const parsed = new URL(value);

      // Only allow http and https
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return { valid: false, error: 'Only HTTP and HTTPS URLs are allowed' };
      }

      return { valid: true, value };
    } catch (e) {
      return { valid: false, error: 'Invalid URL format' };
    }
  }

  /**
   * Strip HTML tags from string
   * @param {string} str - Input string
   * @returns {string}
   */
  static stripHtml(str) {
    if (!str || typeof str !== 'string') return '';

    // Create a temporary element
    const temp = document.createElement('div');
    temp.textContent = str;
    return temp.innerHTML;
  }

  /**
   * Escape HTML entities
   * @param {string} str - Input string
   * @returns {string}
   */
  static escapeHtml(str) {
    if (!str || typeof str !== 'string') return '';

    const escapeMap = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };

    return str.replace(/[&<>"']/g, char => escapeMap[char]);
  }

  /**
   * Sanitize object by removing undefined/null values and trimming strings
   * @param {Object} obj - Object to sanitize
   * @returns {Object}
   */
  static sanitizeObject(obj) {
    if (!obj || typeof obj !== 'object') return {};

    const result = {};

    for (const [key, value] of Object.entries(obj)) {
      if (value === undefined || value === null) continue;

      if (typeof value === 'string') {
        result[key] = value.trim();
      } else if (typeof value === 'object' && !Array.isArray(value)) {
        result[key] = this.sanitizeObject(value);
      } else {
        result[key] = value;
      }
    }

    return result;
  }
}

/**
 * Convenience validation functions
 */
export function validatePrompt(prompt, options) {
  return InputValidator.validatePrompt(prompt, options);
}

export function validateCode(code, options) {
  return InputValidator.validateCode(code, options);
}

export function validateTask(task) {
  return InputValidator.validateTask(task);
}

export function validateApiKey(apiKey) {
  return InputValidator.validateApiKey(apiKey);
}

export function validateUrl(url) {
  return InputValidator.validateUrl(url);
}
