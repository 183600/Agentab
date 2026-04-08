// lib/errors.js - Custom error classes and error handling

/**
 * Base error class for Agentab
 */
export class AgentabError extends Error {
  constructor(message, code = 'UNKNOWN_ERROR', details = {}) {
    super(message);
    this.name = 'AgentabError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      details: this.details,
      timestamp: this.timestamp,
      stack: this.stack
    };
  }
}

/**
 * Validation error
 */
export class ValidationError extends AgentabError {
  constructor(message, field = null, value = null) {
    super(message, 'VALIDATION_ERROR', { field, value });
    this.name = 'ValidationError';
    this.field = field;
    this.value = value;
  }
}

/**
 * API error
 */
export class ApiError extends AgentabError {
  constructor(message, statusCode = null, responseBody = null) {
    super(message, 'API_ERROR', { statusCode, responseBody });
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.responseBody = responseBody;
  }

  static fromResponse(response, body) {
    let message = 'API request failed';
    
    if (response.status === 401) {
      message = 'Invalid API key. Please check your settings.';
    } else if (response.status === 429) {
      message = 'Rate limit exceeded. Please wait and try again.';
    } else if (response.status >= 500) {
      message = 'Server error. Please try again later.';
    } else if (body?.error?.message) {
      message = body.error.message;
    }

    return new ApiError(message, response.status, body);
  }
}

/**
 * Execution error
 */
export class ExecutionError extends AgentabError {
  constructor(message, code = null, stack = null) {
    super(message, 'EXECUTION_ERROR', { code, stack });
    this.name = 'ExecutionError';
    this.codeSnippet = code;
    this.stackTrace = stack;
  }
}

/**
 * Timeout error
 */
export class TimeoutError extends AgentabError {
  constructor(message = 'Operation timed out', duration = null) {
    super(message, 'TIMEOUT_ERROR', { duration });
    this.name = 'TimeoutError';
    this.duration = duration;
  }
}

/**
 * Abort error
 */
export class AbortError extends AgentabError {
  constructor(message = 'Operation was aborted') {
    super(message, 'ABORT_ERROR');
    this.name = 'AbortError';
  }
}

/**
 * Configuration error
 */
export class ConfigurationError extends AgentabError {
  constructor(message, field = null) {
    super(message, 'CONFIGURATION_ERROR', { field });
    this.name = 'ConfigurationError';
    this.field = field;
  }
}

/**
 * Error handler utility
 */
export class ErrorHandler {
  /**
   * Convert any error to AgentabError
   * @param {Error} error - Original error
   * @returns {AgentabError}
   */
  static normalize(error) {
    if (error instanceof AgentabError) {
      return error;
    }

    if (error.name === 'AbortError' || error instanceof DOMException) {
      return new AbortError(error.message);
    }

    if (error.name === 'TimeoutError') {
      return new TimeoutError(error.message);
    }

    // Generic error
    return new AgentabError(
      error.message || 'An unexpected error occurred',
      error.code || 'UNKNOWN_ERROR',
      { originalName: error.name }
    );
  }

  /**
   * Get user-friendly error message
   * @param {Error} error - Error object
   * @returns {string}
   */
  static getUserMessage(error) {
    const normalized = this.normalize(error);

    // Return specific user-friendly messages
    switch (normalized.code) {
      case 'VALIDATION_ERROR':
        return `Validation failed: ${normalized.message}`;
      
      case 'API_ERROR':
        return `API Error: ${normalized.message}`;
      
      case 'EXECUTION_ERROR':
        return `Execution failed: ${normalized.message}`;
      
      case 'TIMEOUT_ERROR':
        return 'The operation took too long and was cancelled.';
      
      case 'ABORT_ERROR':
        return 'The operation was cancelled by the user.';
      
      case 'CONFIGURATION_ERROR':
        return `Configuration error: ${normalized.message}. Please check your settings.`;
      
      default:
        return normalized.message;
    }
  }

  /**
   * Log error for debugging
   * @param {Error} error - Error object
   * @param {Object} context - Additional context
   */
  static log(error, context = {}) {
    const normalized = this.normalize(error);
    
    console.error('[Agentab Error]', {
      error: normalized.toJSON(),
      context,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Check if error is recoverable
   * @param {Error} error - Error object
   * @returns {boolean}
   */
  static isRecoverable(error) {
    const normalized = this.normalize(error);
    
    // Recoverable errors
    const recoverableCodes = [
      'TIMEOUT_ERROR',
      'RATE_LIMIT'
    ];

    return recoverableCodes.includes(normalized.code);
  }
}

/**
 * Global error boundary
 */
export function setupErrorBoundary() {
  // Handle uncaught errors
  self.addEventListener('error', (event) => {
    ErrorHandler.log(event.error, { type: 'uncaught' });
    
    // Prevent default error handling
    event.preventDefault();
  });

  // Handle unhandled promise rejections
  self.addEventListener('unhandledrejection', (event) => {
    ErrorHandler.log(event.reason, { type: 'unhandledrejection' });
    
    // Prevent default error handling
    event.preventDefault();
  });
}

/**
 * Try-catch wrapper with error normalization
 * @param {Function} fn - Function to wrap
 * @returns {Function}
 */
export function withErrorHandling(fn) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      throw ErrorHandler.normalize(error);
    }
  };
}
