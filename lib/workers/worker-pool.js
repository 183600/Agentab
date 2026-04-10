/**
 * Worker Pool for Chrome Extensions
 * Manages Web Workers for CPU-intensive operations
 *
 * Note: Chrome Extensions use Service Workers, but we can still
 * use inline workers via Blob URLs for CPU-intensive operations
 */

/**
 * Create an inline worker from a function
 * @param {Function} fn - Worker function
 * @returns {Worker}
 */
export function createInlineWorker(fn) {
  const blob = new Blob(
    [
      `
    self.onmessage = async (e) => {
      try {
        const result = await (${fn.toString()})(...e.data.args);
        self.postMessage({ success: true, result });
      } catch (error) {
        self.postMessage({ success: false, error: error.message });
      }
    };
    `
    ],
    { type: 'application/javascript' }
  );

  return new Worker(URL.createObjectURL(blob));
}

/**
 * Common worker functions
 */
export const workerFunctions = {
  /**
   * Parse and analyze HTML content
   */
  analyzeHtml: html => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const forms = [];
    const buttons = [];
    const links = [];
    const inputs = [];

    // Extract forms
    doc.querySelectorAll('form').forEach(form => {
      forms.push({
        id: form.id,
        name: form.name,
        action: form.action,
        method: form.method,
        fields: Array.from(form.querySelectorAll('input, select, textarea')).map(f => ({
          type: f.type,
          name: f.name,
          id: f.id,
          placeholder: f.placeholder
        }))
      });
    });

    // Extract buttons
    doc.querySelectorAll('button, input[type="submit"], input[type="button"]').forEach(btn => {
      buttons.push({
        text: btn.textContent?.trim() || btn.value,
        type: btn.type,
        id: btn.id,
        className: btn.className
      });
    });

    // Extract links
    doc.querySelectorAll('a[href]').forEach(link => {
      links.push({
        text: link.textContent?.trim(),
        href: link.href,
        id: link.id
      });
    });

    // Extract inputs
    doc.querySelectorAll('input, select, textarea').forEach(input => {
      inputs.push({
        type: input.type,
        name: input.name,
        id: input.id,
        placeholder: input.placeholder,
        value: input.value
      });
    });

    return { forms, buttons, links, inputs };
  },

  /**
   * Extract data using CSS selectors
   */
  extractData: (html, selectors) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const results = {};

    for (const [key, selector] of Object.entries(selectors)) {
      const elements = doc.querySelectorAll(selector);
      results[key] = Array.from(elements).map(el => ({
        text: el.textContent?.trim(),
        html: el.innerHTML,
        attributes: Array.from(el.attributes).reduce((acc, attr) => {
          acc[attr.name] = attr.value;
          return acc;
        }, {})
      }));
    }

    return results;
  },

  /**
   * Process large text content
   */
  processText: (text, operations) => {
    let result = text;

    for (const op of operations) {
      switch (op.type) {
        case 'extract-regex': {
          const regex = new RegExp(op.pattern, op.flags || 'g');
          const matches = result.match(regex) || [];
          result = matches;
          break;
        }

        case 'replace':
          result = result.replace(new RegExp(op.pattern, op.flags || 'g'), op.replacement);
          break;

        case 'split':
          result = result.split(new RegExp(op.pattern, op.flags));
          break;

        case 'lowercase':
          result = result.toLowerCase();
          break;

        case 'uppercase':
          result = result.toUpperCase();
          break;

        case 'trim':
          result = result.trim();
          break;

        case 'extract-emails': {
          const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
          result = result.match(emailRegex) || [];
          break;
        }

        case 'extract-urls': {
          const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/g;
          result = result.match(urlRegex) || [];
          break;
        }

        case 'extract-phones': {
          const phoneRegex = /[+]?[(]?[0-9]{3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,6}/g;
          result = result.match(phoneRegex) || [];
          break;
        }

        case 'word-count':
          result = result.split(/\s+/).filter(w => w.length > 0).length;
          break;

        case 'line-count':
          result = result.split('\n').length;
          break;
      }
    }

    return result;
  },

  /**
   * Batch process items
   */
  batchProcess: (items, processor) => {
    return items.map((item, index) => {
      try {
        return {
          index,
          success: true,
          result: processor(item)
        };
      } catch (error) {
        return {
          index,
          success: false,
          error: error.message
        };
      }
    });
  },

  /**
   * Calculate similarity between strings
   */
  calculateSimilarity: (str1, str2, algorithm = 'levenshtein') => {
    if (algorithm === 'levenshtein') {
      const m = str1.length;
      const n = str2.length;
      const dp = Array(m + 1)
        .fill(null)
        .map(() => Array(n + 1).fill(0));

      for (let i = 0; i <= m; i++) dp[i][0] = i;
      for (let j = 0; j <= n; j++) dp[0][j] = j;

      for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
          if (str1[i - 1] === str2[j - 1]) {
            dp[i][j] = dp[i - 1][j - 1];
          } else {
            dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + 1);
          }
        }
      }

      const maxLen = Math.max(m, n);
      return maxLen === 0 ? 1 : 1 - dp[m][n] / maxLen;
    }

    return 0;
  },

  /**
   * Sort items by multiple criteria
   */
  multiSort: (items, criteria) => {
    return [...items].sort((a, b) => {
      for (const { field, order = 'asc', type = 'string' } of criteria) {
        let valA = a[field];
        let valB = b[field];

        if (type === 'number') {
          valA = parseFloat(valA) || 0;
          valB = parseFloat(valB) || 0;
        } else if (type === 'date') {
          valA = new Date(valA).getTime();
          valB = new Date(valB).getTime();
        } else {
          valA = String(valA).toLowerCase();
          valB = String(valB).toLowerCase();
        }

        if (valA < valB) return order === 'asc' ? -1 : 1;
        if (valA > valB) return order === 'asc' ? 1 : -1;
      }
      return 0;
    });
  },

  /**
   * Group items by key
   */
  groupBy: (items, keyPath) => {
    const groups = {};

    for (const item of items) {
      const keys = keyPath.split('.');
      let value = item;

      for (const key of keys) {
        value = value?.[key];
      }

      const groupKey = String(value ?? 'undefined');

      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(item);
    }

    return groups;
  },

  /**
   * Filter items with complex conditions
   */
  filterItems: (items, conditions) => {
    return items.filter(item => {
      for (const { field, operator, value } of conditions) {
        const itemValue = field.split('.').reduce((obj, key) => obj?.[key], item);

        switch (operator) {
          case 'eq':
            if (itemValue !== value) return false;
            break;
          case 'neq':
            if (itemValue === value) return false;
            break;
          case 'gt':
            if (!(itemValue > value)) return false;
            break;
          case 'gte':
            if (!(itemValue >= value)) return false;
            break;
          case 'lt':
            if (!(itemValue < value)) return false;
            break;
          case 'lte':
            if (!(itemValue <= value)) return false;
            break;
          case 'contains':
            if (!String(itemValue).includes(value)) return false;
            break;
          case 'startsWith':
            if (!String(itemValue).startsWith(value)) return false;
            break;
          case 'endsWith':
            if (!String(itemValue).endsWith(value)) return false;
            break;
          case 'matches':
            if (!new RegExp(value).test(String(itemValue))) return false;
            break;
          case 'in':
            if (!value.includes(itemValue)) return false;
            break;
          case 'notIn':
            if (value.includes(itemValue)) return false;
            break;
        }
      }
      return true;
    });
  }
};

/**
 * WorkerPool - Manages multiple workers
 */
export class WorkerPool {
  constructor(options = {}) {
    this.maxWorkers = options.maxWorkers || navigator.hardwareConcurrency || 4;
    this.workers = [];
    this.taskQueue = [];
    this.activeCount = 0;
  }

  /**
   * Execute a task in a worker
   * @param {Function} fn - Function to execute
   * @param {Array} args - Arguments to pass
   * @returns {Promise}
   */
  async execute(fn, args = []) {
    return new Promise((resolve, reject) => {
      const task = { fn, args, resolve, reject };

      if (this.activeCount < this.maxWorkers) {
        this._runTask(task);
      } else {
        this.taskQueue.push(task);
      }
    });
  }

  /**
   * Run a task in a worker
   */
  _runTask(task) {
    this.activeCount++;
    const worker = createInlineWorker(task.fn);

    worker.onmessage = e => {
      worker.terminate();
      this.activeCount--;

      if (e.data.success) {
        task.resolve(e.data.result);
      } else {
        task.reject(new Error(e.data.error));
      }

      this._nextTask();
    };

    worker.onerror = error => {
      worker.terminate();
      this.activeCount--;
      task.reject(error);
      this._nextTask();
    };

    worker.postMessage({ args: task.args });
  }

  /**
   * Run next queued task
   */
  _nextTask() {
    if (this.taskQueue.length > 0 && this.activeCount < this.maxWorkers) {
      const task = this.taskQueue.shift();
      this._runTask(task);
    }
  }

  /**
   * Terminate all workers
   */
  terminateAll() {
    this.workers.forEach(w => w.terminate());
    this.workers = [];
    this.taskQueue = [];
    this.activeCount = 0;
  }

  /**
   * Get pool status
   */
  getStatus() {
    return {
      maxWorkers: this.maxWorkers,
      activeCount: this.activeCount,
      queuedTasks: this.taskQueue.length
    };
  }
}

/**
 * OffscreenWorker - Use Chrome's offscreen API for persistent workers
 * Only available in Manifest V3
 */
export class OffscreenWorker {
  constructor() {
    this.offscreenDocument = null;
    this.ready = false;
  }

  /**
   * Create offscreen document
   */
  async create() {
    if (typeof chrome === 'undefined' || !chrome.offscreen) {
      throw new Error('Offscreen API not available');
    }

    try {
      await chrome.offscreen.createDocument({
        url: 'offscreen/offscreen.html',
        reasons: ['WORKERS'],
        justification: 'CPU-intensive operations for page analysis'
      });
      this.ready = true;
    } catch (error) {
      if (!error.message.includes('already exists')) {
        throw error;
      }
      this.ready = true;
    }
  }

  /**
   * Send message to offscreen document
   */
  async execute(action, data) {
    if (!this.ready) {
      await this.create();
    }

    const response = await chrome.runtime.sendMessage({
      target: 'offscreen',
      action,
      data
    });

    return response;
  }

  /**
   * Close offscreen document
   */
  async close() {
    if (this.ready && typeof chrome !== 'undefined' && chrome.offscreen) {
      await chrome.offscreen.closeDocument();
      this.ready = false;
    }
  }
}

// Global worker pool instance
let globalPool = null;

/**
 * Get global worker pool
 */
export function getWorkerPool() {
  if (!globalPool) {
    globalPool = new WorkerPool();
  }
  return globalPool;
}

/**
 * Quick execution helper
 */
export async function runInWorker(fn, args) {
  return getWorkerPool().execute(fn, args);
}
