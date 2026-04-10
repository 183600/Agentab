/**
 * Worker Manager for Chrome Extensions
 * Manages multiple workers for different CPU-intensive tasks
 */

import { WorkerPool } from './worker-pool.js';

/**
 * Worker types and their configurations
 */
const WORKER_TYPES = {
  SYNTAX: {
    name: 'syntax',
    maxWorkers: 2,
    timeout: 5000
  },
  ANALYSIS: {
    name: 'analysis',
    maxWorkers: 2,
    timeout: 10000
  },
  PROCESSING: {
    name: 'processing',
    maxWorkers: 4,
    timeout: 15000
  }
};

/**
 * Syntax Worker Functions (inline, no separate file needed)
 */
const syntaxWorkerFunctions = {
  /**
   * Highlight code syntax
   */
  highlight: (code, lang = 'javascript') => {
    const patterns = {
      javascript: [
        { regex: /(\/\/.*$)/gm, class: 'comment' },
        { regex: /(\/\*[\s\S]*?\*\/)/g, class: 'comment' },
        { regex: /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g, class: 'string' },
        {
          regex:
            /\b(const|let|var|function|return|if|else|for|while|class|import|export|async|await|try|catch)\b/g,
          class: 'keyword'
        },
        { regex: /\b(true|false|null|undefined)\b/g, class: 'literal' },
        { regex: /\b(\d+\.?\d*)\b/g, class: 'number' }
      ],
      html: [
        { regex: /(&lt;!--[\s\S]*?--&gt;)/g, class: 'comment' },
        { regex: /(&lt;\/?[a-zA-Z][a-zA-Z0-9]*)/g, class: 'tag' },
        { regex: /(&gt;)/g, class: 'tag' }
      ],
      css: [
        { regex: /(\/\*[\s\S]*?\*\/)/g, class: 'comment' },
        { regex: /([.#][a-zA-Z_-][a-zA-Z0-9_-]*)/g, class: 'selector' },
        { regex: /\b([a-z-]+)\s*:/g, class: 'property' }
      ],
      json: [
        { regex: /("(?:[^"\\]|\\.)*")\s*:/g, class: 'key' },
        { regex: /:\s*("(?:[^"\\]|\\.)*")/g, class: 'string' },
        { regex: /\b(true|false|null)\b/g, class: 'literal' },
        { regex: /\b(-?\d+\.?\d*)\b/g, class: 'number' }
      ]
    };

    const escapeHtml = str =>
      str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    let escaped = escapeHtml(code);
    const tokenPatterns = patterns[lang] || patterns.javascript;

    for (const { regex, class: className } of tokenPatterns) {
      escaped = escaped.replace(regex, `<span class="token ${className}">$&</span>`);
    }

    return escaped;
  },

  /**
   * Analyze code structure
   */
  analyze: (code, lang = 'javascript') => {
    const analysis = {
      lines: code.split('\n').length,
      characters: code.length,
      functions: [],
      classes: [],
      imports: [],
      exports: [],
      complexity: 1
    };

    if (lang === 'javascript') {
      // Extract functions
      const funcMatches =
        code.match(/(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\()/g) || [];
      analysis.functions = funcMatches.map(m => m.replace(/.*?(\w+).*/, '$1'));

      // Extract classes
      const classMatches = code.match(/class\s+(\w+)/g) || [];
      analysis.classes = classMatches.map(m => m.replace('class ', ''));

      // Calculate complexity
      const complexityKeywords = ['if', 'else', 'for', 'while', 'case', 'catch', '&&', '||', '?'];
      for (const keyword of complexityKeywords) {
        const matches = code.match(new RegExp(`\\b${keyword}\\b`, 'g'));
        if (matches) analysis.complexity += matches.length;
      }
    }

    return analysis;
  },

  /**
   * Detect language
   */
  detectLanguage: code => {
    if (/^\s*[{[]/.test(code) && /"\w+"\s*:/.test(code)) return 'json';
    if (/<(!DOCTYPE|html|head|body|div|span|p|a)/i.test(code)) return 'html';
    if (/[.#][\w-]+\s*\{/.test(code) || /@media|@keyframes/.test(code)) return 'css';
    if (/\bdef\s+\w+\s*\(/.test(code) || /\bimport\s+\w+/.test(code)) return 'python';
    if (/\b(const|let|var|function)\s+\w+/.test(code)) return 'javascript';
    return 'text';
  }
};

/**
 * Analysis Worker Functions
 */
const analysisWorkerFunctions = {
  /**
   * Parse DOM structure
   */
  parseDomStructure: html => {
    // Using regex-based parsing (DOMParser not available in worker context without DOM)
    const structure = {
      forms: [],
      buttons: [],
      links: [],
      inputs: [],
      images: [],
      scripts: []
    };

    // Extract forms
    const formRegex = /<form[^>]*>([\s\S]*?)<\/form>/gi;
    let match;
    while ((match = formRegex.exec(html)) !== null) {
      structure.forms.push({
        html: match[0].substring(0, 200),
        action: (match[0].match(/action=["']([^"']*)["']/i) || [])[1] || '',
        method: (match[0].match(/method=["']([^"']*)["']/i) || [])[1] || 'get'
      });
    }

    // Extract buttons
    const buttonRegex =
      /<button[^>]*>([\s\S]*?)<\/button>|<input[^>]*type=["'](?:submit|button)["'][^>]*>/gi;
    while ((match = buttonRegex.exec(html)) !== null) {
      structure.buttons.push({
        html: match[0].substring(0, 100),
        text: (match[1] || match[0]).replace(/<[^>]+>/g, '').trim()
      });
    }

    // Extract links
    const linkRegex = /<a[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
    while ((match = linkRegex.exec(html)) !== null) {
      structure.links.push({
        href: match[1],
        text: match[2].replace(/<[^>]+>/g, '').trim()
      });
    }

    // Extract inputs
    const inputRegex = /<input[^>]*>/gi;
    while ((match = inputRegex.exec(html)) !== null) {
      structure.inputs.push({
        type: (match[0].match(/type=["']([^"']*)["']/i) || [])[1] || 'text',
        name: (match[0].match(/name=["']([^"']*)["']/i) || [])[1] || '',
        id: (match[0].match(/id=["']([^"']*)["']/i) || [])[1] || ''
      });
    }

    // Extract images
    const imgRegex = /<img[^>]*src=["']([^"']*)["'][^>]*>/gi;
    while ((match = imgRegex.exec(html)) !== null) {
      structure.images.push({
        src: match[1],
        alt: (match[0].match(/alt=["']([^"']*)["']/i) || [])[1] || ''
      });
    }

    return structure;
  },

  /**
   * Extract text content
   */
  extractText: html => {
    // Remove script and style content
    let text = html.replace(/<script[\s\S]*?<\/script>/gi, '');
    text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
    // Remove tags
    text = text.replace(/<[^>]+>/g, ' ');
    // Clean up whitespace
    text = text.replace(/\s+/g, ' ').trim();
    return text;
  },

  /**
   * Find elements by selector (regex-based)
   */
  findElements: (html, tagPattern) => {
    const regex = new RegExp(
      `<${tagPattern}[^>]*>[\\s\\S]*?<\\/${tagPattern}>|<${tagPattern}[^>]*\\/?>`,
      'gi'
    );
    const matches = [];
    let match;
    while ((match = regex.exec(html)) !== null) {
      matches.push({
        html: match[0],
        index: match.index
      });
    }
    return matches;
  },

  /**
   * Extract metadata
   */
  extractMetadata: html => {
    const metadata = {
      title: '',
      description: '',
      keywords: [],
      ogTags: {},
      links: []
    };

    // Title
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titleMatch) metadata.title = titleMatch[1].trim();

    // Meta description
    const descMatch = html.match(
      /<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i
    );
    if (descMatch) metadata.description = descMatch[1];

    // Meta keywords
    const keywordsMatch = html.match(
      /<meta[^>]*name=["']keywords["'][^>]*content=["']([^"']*)["']/i
    );
    if (keywordsMatch) {
      metadata.keywords = keywordsMatch[1].split(',').map(k => k.trim());
    }

    // OG tags
    const ogRegex = /<meta[^>]*property=["']og:([^"']*)["'][^>]*content=["']([^"']*)["']/gi;
    let ogMatch;
    while ((ogMatch = ogRegex.exec(html)) !== null) {
      metadata.ogTags[ogMatch[1]] = ogMatch[2];
    }

    return metadata;
  }
};

/**
 * Processing Worker Functions
 */
const processingWorkerFunctions = {
  /**
   * Batch process array items
   */
  batchMap: (items, fn) => {
    const results = [];
    for (let i = 0; i < items.length; i++) {
      try {
        results.push({ index: i, success: true, result: fn(items[i]) });
      } catch (e) {
        results.push({ index: i, success: false, error: e.message });
      }
    }
    return results;
  },

  /**
   * Filter and transform
   */
  filterTransform: (items, filterFn, transformFn) => {
    return items.filter(filterFn).map(transformFn);
  },

  /**
   * Aggregate data
   */
  aggregate: (items, groupKey, aggregations) => {
    const groups = {};

    for (const item of items) {
      const key = item[groupKey];
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(item);
    }

    const result = {};
    for (const [key, group] of Object.entries(groups)) {
      result[key] = {};
      for (const [aggKey, aggFn] of Object.entries(aggregations)) {
        result[key][aggKey] = aggFn(group);
      }
    }

    return result;
  },

  /**
   * Sort with custom comparator
   */
  sortItems: (items, key, order = 'asc', type = 'string') => {
    return [...items].sort((a, b) => {
      let valA = a[key];
      let valB = b[key];

      if (type === 'number') {
        valA = parseFloat(valA) || 0;
        valB = parseFloat(valB) || 0;
      } else {
        valA = String(valA).toLowerCase();
        valB = String(valB).toLowerCase();
      }

      if (valA < valB) return order === 'asc' ? -1 : 1;
      if (valA > valB) return order === 'asc' ? 1 : -1;
      return 0;
    });
  },

  /**
   * Text processing pipeline
   */
  processText: (text, operations) => {
    let result = text;
    for (const op of operations) {
      switch (op.type) {
        case 'extract-regex': {
          const regex = new RegExp(op.pattern, op.flags || 'g');
          result = result.match(regex) || [];
          break;
        }
        case 'replace': {
          result = result.replace(new RegExp(op.pattern, op.flags || 'g'), op.replacement);
          break;
        }
        case 'split': {
          result = result.split(new RegExp(op.pattern, op.flags));
          break;
        }
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
      }
    }
    return result;
  }
};

/**
 * Worker Manager Class
 */
export class WorkerManager {
  constructor() {
    this.pools = new Map();
    this.pending = new Map();
    this.taskId = 0;
    this.initialized = false;
  }

  /**
   * Initialize worker pools
   */
  init() {
    if (this.initialized) return;

    // Create pools for each worker type
    for (const [type, config] of Object.entries(WORKER_TYPES)) {
      this.pools.set(type, {
        pool: new WorkerPool({ maxWorkers: config.maxWorkers }),
        config
      });
    }

    this.initialized = true;
  }

  /**
   * Execute task in appropriate worker
   */
  async execute(type, fn, args, options = {}) {
    if (!this.initialized) this.init();

    const poolConfig = this.pools.get(type);
    if (!poolConfig) {
      throw new Error(`Unknown worker type: ${type}`);
    }

    const { pool, config } = poolConfig;
    const timeout = options.timeout || config.timeout;

    const taskPromise = pool.execute(fn, args);

    // Add timeout handling
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Task timeout after ${timeout}ms`)), timeout);
    });

    return Promise.race([taskPromise, timeoutPromise]);
  }

  /**
   * Highlight code syntax
   */
  async highlightCode(code, lang = 'javascript') {
    return this.execute('SYNTAX', syntaxWorkerFunctions.highlight, [code, lang]);
  }

  /**
   * Analyze code structure
   */
  async analyzeCode(code, lang = 'javascript') {
    return this.execute('SYNTAX', syntaxWorkerFunctions.analyze, [code, lang]);
  }

  /**
   * Detect code language
   */
  async detectLanguage(code) {
    return this.execute('SYNTAX', syntaxWorkerFunctions.detectLanguage, [code]);
  }

  /**
   * Parse DOM structure
   */
  async parseDomStructure(html) {
    return this.execute('ANALYSIS', analysisWorkerFunctions.parseDomStructure, [html]);
  }

  /**
   * Extract text from HTML
   */
  async extractText(html) {
    return this.execute('ANALYSIS', analysisWorkerFunctions.extractText, [html]);
  }

  /**
   * Extract metadata from HTML
   */
  async extractMetadata(html) {
    return this.execute('ANALYSIS', analysisWorkerFunctions.extractMetadata, [html]);
  }

  /**
   * Batch process items
   */
  async batchProcess(items, fn) {
    return this.execute('PROCESSING', processingWorkerFunctions.batchMap, [items, fn]);
  }

  /**
   * Process text
   */
  async processText(text, operations) {
    return this.execute('PROCESSING', processingWorkerFunctions.processText, [text, operations]);
  }

  /**
   * Get pool status
   */
  getStatus() {
    const status = {};
    for (const [type, { pool, config }] of this.pools) {
      status[type] = {
        ...pool.getStatus(),
        config
      };
    }
    return status;
  }

  /**
   * Terminate all workers
   */
  terminate() {
    for (const { pool } of this.pools.values()) {
      pool.terminateAll();
    }
    this.pools.clear();
    this.initialized = false;
  }
}

// Global instance
let globalManager = null;

/**
 * Get global worker manager
 */
export function getWorkerManager() {
  if (!globalManager) {
    globalManager = new WorkerManager();
    globalManager.init();
  }
  return globalManager;
}

/**
 * Convenience functions
 */
export const highlightCode = (code, lang) => getWorkerManager().highlightCode(code, lang);
export const analyzeCode = (code, lang) => getWorkerManager().analyzeCode(code, lang);
export const detectLanguage = code => getWorkerManager().detectLanguage(code);
export const parseDomStructure = html => getWorkerManager().parseDomStructure(html);
export const extractText = html => getWorkerManager().extractText(html);
export const extractMetadata = html => getWorkerManager().extractMetadata(html);
export const batchProcess = (items, fn) => getWorkerManager().batchProcess(items, fn);
export const processText = (text, ops) => getWorkerManager().processText(text, ops);
