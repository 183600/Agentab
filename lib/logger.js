// lib/logger.js - Centralized logging system for debugging and monitoring

/**
 * LogLevel - Logging severity levels
 */
export const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  NONE: 4
};

/**
 * Environment detection
 */
export function detectEnvironment() {
  // Check for development indicators
  const isDev = 
    // Check if running in unpacked extension
    (typeof chrome !== 'undefined' && chrome.runtime?.id?.length === 32) ||
    // Check for localhost
    (typeof window !== 'undefined' && window.location?.hostname === 'localhost') ||
    // Check for development flag in localStorage
    (typeof localStorage !== 'undefined' && localStorage.getItem('agentab_dev') === 'true') ||
    // Check NODE_ENV
    (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development');

  return isDev ? 'development' : 'production';
}

/**
 * Get default log level based on environment
 */
export function getDefaultLogLevel() {
  const env = detectEnvironment();
  return env === 'development' ? LogLevel.DEBUG : LogLevel.INFO;
}

/**
 * Logger - Centralized logging with context and persistence
 */
export class Logger {
  constructor(options = {}) {
    // Auto-detect environment and set appropriate log level
    const defaultLevel = getDefaultLogLevel();
    
    this.options = {
      name: options.name || 'Agentab',
      level: options.level ?? defaultLevel,
      persist: options.persist ?? true,
      maxEntries: options.maxEntries || 100,
      persistKey: options.persistKey || 'agentab_logs',
      colors: options.colors ?? true,
      timestamp: options.timestamp ?? true,
      environment: detectEnvironment(),
      ...options
    };

    this.entries = [];
    this.listeners = new Set();
  }

  /**
   * Check if debug logging is enabled
   * @returns {boolean}
   */
  isDebugEnabled() {
    return this.options.level <= LogLevel.DEBUG;
  }

  /**
   * Get current environment
   * @returns {string}
   */
  getEnvironment() {
    return this.options.environment;
  }

  /**
   * Set log level
   * @param {number} level - Log level from LogLevel enum
   */
  setLevel(level) {
    this.options.level = level;
  }

  /**
   * Enable/disable debug mode
   * @param {boolean} enabled
   */
  setDebugMode(enabled) {
    this.options.level = enabled ? LogLevel.DEBUG : LogLevel.INFO;
  }

  /**
   * Get current timestamp
   * @returns {string}
   */
  getTimestamp() {
    return new Date().toISOString();
  }

  /**
   * Format log entry
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {Object} data - Additional data
   * @returns {Object}
   */
  formatEntry(level, message, data = null) {
    return {
      timestamp: this.getTimestamp(),
      level,
      message,
      data,
      source: this.options.name
    };
  }

  /**
   * Get console style for level
   * @param {string} level - Log level
   * @returns {string}
   */
  getStyle(level) {
    if (!this.options.colors) return '';

    const styles = {
      DEBUG: 'color: #8b949e; font-style: italic;',
      INFO: 'color: #58a6ff;',
      WARN: 'color: #d29922;',
      ERROR: 'color: #f85149; font-weight: bold;'
    };

    return styles[level] || '';
  }

  /**
   * Get level prefix
   * @param {string} level - Log level
   * @returns {string}
   */
  getPrefix(level) {
    const icons = {
      DEBUG: '🔍',
      INFO: 'ℹ️',
      WARN: '⚠️',
      ERROR: '❌'
    };
    return `${icons[level] || ''} [${this.options.name}]`;
  }

  /**
   * Log a message
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {Object} data - Additional data
   */
  log(level, message, data = null) {
    const levelValue = LogLevel[level];
    if (levelValue < this.options.level) return;

    const entry = this.formatEntry(level, message, data);

    // Console output
    const prefix = this.getPrefix(level);
    const style = this.getStyle(level);
    const timestamp = this.options.timestamp ? `[${entry.timestamp}]` : '';

    if (data !== null) {
      console[level.toLowerCase()](`%c${timestamp}${prefix} ${message}`, style, data);
    } else {
      console[level.toLowerCase()](`%c${timestamp}${prefix} ${message}`, style);
    }

    // Store entry
    this.entries.push(entry);
    if (this.entries.length > this.options.maxEntries) {
      this.entries.shift();
    }

    // Notify listeners
    this.notifyListeners(entry);

    // Persist if enabled
    if (this.options.persist) {
      this.persist();
    }
  }

  /**
   * Log debug message
   * @param {string} message
   * @param {Object} data
   */
  debug(message, data = null) {
    this.log('DEBUG', message, data);
  }

  /**
   * Log info message
   * @param {string} message
   * @param {Object} data
   */
  info(message, data = null) {
    this.log('INFO', message, data);
  }

  /**
   * Log warning message
   * @param {string} message
   * @param {Object} data
   */
  warn(message, data = null) {
    this.log('WARN', message, data);
  }

  /**
   * Log error message
   * @param {string} message
   * @param {Object} data
   */
  error(message, data = null) {
    this.log('ERROR', message, data);
  }

  /**
   * Log with timing
   * @param {string} label - Timer label
   * @returns {Function} End timer function
   */
  time(label) {
    const start = performance.now();
    this.debug(`⏱️ ${label} started`);

    return () => {
      const duration = performance.now() - start;
      this.debug(`⏱️ ${label} completed in ${duration.toFixed(2)}ms`);
      return duration;
    };
  }

  /**
   * Log function execution
   * @param {string} name - Function name
   * @param {Function} fn - Function to execute
   * @returns {Promise<any>}
   */
  async trace(name, fn) {
    const endTimer = this.time(name);
    try {
      const result = await fn();
      endTimer();
      return result;
    } catch (error) {
      endTimer();
      this.error(`${name} failed`, { error: error.message, stack: error.stack });
      throw error;
    }
  }

  /**
   * Add log listener
   * @param {Function} listener
   * @returns {Function} Unsubscribe function
   */
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Notify all listeners
   * @param {Object} entry
   */
  notifyListeners(entry) {
    for (const listener of this.listeners) {
      try {
        listener(entry);
      } catch (e) {
        console.error('Logger listener error:', e);
      }
    }
  }

  /**
   * Persist logs to storage
   */
  async persist() {
    if (typeof chrome === 'undefined' || !chrome.storage) return;

    try {
      await chrome.storage.local.set({
        [this.options.persistKey]: this.entries.slice(-50)
      });
    } catch (e) {
      // Storage may be unavailable in some contexts
    }
  }

  /**
   * Load persisted logs
   * @returns {Promise<Array>}
   */
  async load() {
    if (typeof chrome === 'undefined' || !chrome.storage) return [];

    try {
      const result = await chrome.storage.local.get(this.options.persistKey);
      return result[this.options.persistKey] || [];
    } catch (e) {
      return [];
    }
  }

  /**
   * Clear all logs
   */
  clear() {
    this.entries = [];
    if (this.options.persist && typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.remove(this.options.persistKey);
    }
  }

  /**
   * Get all entries
   * @param {string} level - Optional filter by level
   * @returns {Array}
   */
  getEntries(level = null) {
    if (!level) return [...this.entries];
    return this.entries.filter(e => e.level === level);
  }

  /**
   * Export logs as JSON
   * @returns {string}
   */
  export() {
    return JSON.stringify({
      exportedAt: this.getTimestamp(),
      source: this.options.name,
      entries: this.entries
    }, null, 2);
  }

  /**
   * Create child logger with inherited options
   * @param {string} name - Child logger name
   * @returns {Logger}
   */
  child(name) {
    return new Logger({
      ...this.options,
      name: `${this.options.name}:${name}`
    });
  }
}

// Create default logger instance
export const logger = new Logger();

// Create specialized loggers
export const agentLogger = logger.child('Agent');
export const apiLogger = logger.child('API');
export const storageLogger = logger.child('Storage');
export const uiLogger = logger.child('UI');

/**
 * Debug helper - pretty print object
 * @param {Object} obj
 * @returns {string}
 */
export function prettyPrint(obj) {
  return JSON.stringify(obj, null, 2);
}

/**
 * Debug helper - log DOM element info
 * @param {Element} element
 */
export function logElement(element) {
  if (!element) {
    logger.debug('Element: null');
    return;
  }

  logger.debug('Element info', {
    tag: element.tagName,
    id: element.id,
    classes: element.className,
    text: element.textContent?.substring(0, 50)
  });
}

/**
 * Debug helper - measure function performance
 * @param {string} name
 * @param {Function} fn
 * @param {number} iterations
 * @returns {Object}
 */
export async function benchmark(name, fn, iterations = 10) {
  const times = [];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    times.push(performance.now() - start);
  }

  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);

  logger.info(`Benchmark: ${name}`, { avg: avg.toFixed(2), min: min.toFixed(2), max: max.toFixed(2), iterations });

  return { name, avg, min, max, iterations, times };
}
