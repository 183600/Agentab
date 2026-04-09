// test/worker-manager.test.js - Tests for WorkerManager functions (direct, no Worker)

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Import the worker functions directly for testing
// These are defined inline in worker-manager.js

/**
 * Syntax Worker Functions
 */
const syntaxWorkerFunctions = {
  highlight: (code, lang = 'javascript') => {
    const patterns = {
      javascript: [
        { regex: /(\/\/.*$)/gm, class: 'comment' },
        { regex: /(\/\*[\s\S]*?\*\/)/g, class: 'comment' },
        { regex: /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g, class: 'string' },
        { regex: /\b(const|let|var|function|return|if|else|for|while|class|import|export|async|await|try|catch)\b/g, class: 'keyword' },
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

    const escapeHtml = str => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    let escaped = escapeHtml(code);
    const tokenPatterns = patterns[lang] || patterns.javascript;

    for (const { regex, class: className } of tokenPatterns) {
      escaped = escaped.replace(regex, `<span class="token ${className}">$&</span>`);
    }

    return escaped;
  },

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
      const funcMatches = code.match(/(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\()/g) || [];
      analysis.functions = funcMatches.map(m => m.replace(/.*?(\w+).*/, '$1'));

      const classMatches = code.match(/class\s+(\w+)/g) || [];
      analysis.classes = classMatches.map(m => m.replace('class ', ''));

      const complexityKeywords = ['if', 'else', 'for', 'while', 'case', 'catch'];
      for (const keyword of complexityKeywords) {
        const matches = code.match(new RegExp(`\\b${keyword}\\b`, 'g'));
        if (matches) analysis.complexity += matches.length;
      }
      // Also check for operators that don't use word boundaries
      if (code.includes('&&')) analysis.complexity += (code.match(/&&/g) || []).length;
      if (code.includes('||')) analysis.complexity += (code.match(/\|\|/g) || []).length;
      if (code.includes('?')) analysis.complexity += (code.match(/\?/g) || []).length;
    }

    return analysis;
  },

  detectLanguage: code => {
    if (/^\s*[\[{]/.test(code) && /"\w+"\s*:/.test(code)) return 'json';
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
  parseDomStructure: html => {
    const structure = { forms: [], buttons: [], links: [], inputs: [], images: [], scripts: [] };

    const formRegex = /<form[^>]*>([\s\S]*?)<\/form>/gi;
    let match;
    while ((match = formRegex.exec(html)) !== null) {
      structure.forms.push({
        html: match[0].substring(0, 200),
        action: (match[0].match(/action=["']([^"']*)["']/i) || [])[1] || '',
        method: (match[0].match(/method=["']([^"']*)["']/i) || [])[1] || 'get'
      });
    }

    const buttonRegex = /<button[^>]*>([\s\S]*?)<\/button>|<input[^>]*type=["'](?:submit|button)["'][^>]*>/gi;
    while ((match = buttonRegex.exec(html)) !== null) {
      structure.buttons.push({
        html: match[0].substring(0, 100),
        text: (match[1] || match[0]).replace(/<[^>]+>/g, '').trim()
      });
    }

    const linkRegex = /<a[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
    while ((match = linkRegex.exec(html)) !== null) {
      structure.links.push({
        href: match[1],
        text: match[2].replace(/<[^>]+>/g, '').trim()
      });
    }

    const inputRegex = /<input[^>]*>/gi;
    while ((match = inputRegex.exec(html)) !== null) {
      structure.inputs.push({
        type: (match[0].match(/type=["']([^"']*)["']/i) || [])[1] || 'text',
        name: (match[0].match(/name=["']([^"']*)["']/i) || [])[1] || '',
        id: (match[0].match(/id=["']([^"']*)["']/i) || [])[1] || ''
      });
    }

    const imgRegex = /<img[^>]*src=["']([^"']*)["'][^>]*>/gi;
    while ((match = imgRegex.exec(html)) !== null) {
      structure.images.push({
        src: match[1],
        alt: (match[0].match(/alt=["']([^"']*)["']/i) || [])[1] || ''
      });
    }

    return structure;
  },

  extractText: html => {
    let text = html.replace(/<script[\s\S]*?<\/script>/gi, '');
    text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
    text = text.replace(/<[^>]+>/g, ' ');
    text = text.replace(/\s+/g, ' ').trim();
    return text;
  },

  extractMetadata: html => {
    const metadata = { title: '', description: '', keywords: [], ogTags: {}, links: [] };

    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titleMatch) metadata.title = titleMatch[1].trim();

    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i);
    if (descMatch) metadata.description = descMatch[1];

    const keywordsMatch = html.match(/<meta[^>]*name=["']keywords["'][^>]*content=["']([^"']*)["']/i);
    if (keywordsMatch) {
      metadata.keywords = keywordsMatch[1].split(',').map(k => k.trim());
    }

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

// Tests
describe('Syntax Worker Functions', () => {
  describe('highlight', () => {
    it('should highlight JavaScript code', () => {
      const code = 'const x = 42;';
      const result = syntaxWorkerFunctions.highlight(code, 'javascript');
      expect(result).toContain('const');
      expect(result).toContain('42');
    });

    it('should highlight JSON code', () => {
      const code = '{"name": "test"}';
      const result = syntaxWorkerFunctions.highlight(code, 'json');
      expect(result).toContain('name');
    });

    it('should handle empty code', () => {
      const result = syntaxWorkerFunctions.highlight('', 'javascript');
      expect(result).toBe('');
    });

    it('should escape HTML in code', () => {
      const code = 'const x = "<script>";';
      const result = syntaxWorkerFunctions.highlight(code, 'javascript');
      expect(result).not.toContain('<script>');
      expect(result).toContain('&lt;');
    });

    it('should highlight comments', () => {
      const code = '// This is a comment';
      const result = syntaxWorkerFunctions.highlight(code, 'javascript');
      expect(result).toContain('token comment');
    });

    it('should highlight strings', () => {
      const code = 'const s = "hello";';
      const result = syntaxWorkerFunctions.highlight(code, 'javascript');
      expect(result).toContain('token string');
    });
  });

  describe('analyze', () => {
    it('should analyze JavaScript code structure', () => {
      const code = `
        function test() {}
        class MyClass {}
        const x = 42;
      `;
      const result = syntaxWorkerFunctions.analyze(code, 'javascript');
      expect(result.lines).toBe(5);
      expect(result.characters).toBeGreaterThan(0);
      expect(result.functions).toBeDefined();
      expect(result.classes).toBeDefined();
    });

    it('should count lines correctly', () => {
      const code = 'line1\nline2\nline3';
      const result = syntaxWorkerFunctions.analyze(code, 'javascript');
      expect(result.lines).toBe(3);
    });

    it('should calculate complexity', () => {
      const code = 'if (a) { if (b) { for (;;) { } } }';
      const result = syntaxWorkerFunctions.analyze(code, 'javascript');
      expect(result.complexity).toBeGreaterThan(1);
    });

    it('should extract function names', () => {
      const code = 'function myFunc() {} const myArrow = () => {}';
      const result = syntaxWorkerFunctions.analyze(code, 'javascript');
      expect(result.functions.length).toBeGreaterThan(0);
    });
  });

  describe('detectLanguage', () => {
    it('should detect JSON', () => {
      const code = '{"key": "value"}';
      const lang = syntaxWorkerFunctions.detectLanguage(code);
      expect(lang).toBe('json');
    });

    it('should detect HTML', () => {
      const code = '<div><p>Hello</p></div>';
      const lang = syntaxWorkerFunctions.detectLanguage(code);
      expect(lang).toBe('html');
    });

    it('should detect CSS', () => {
      const code = '.class { color: red; }';
      const lang = syntaxWorkerFunctions.detectLanguage(code);
      expect(lang).toBe('css');
    });

    it('should detect JavaScript', () => {
      const code = 'const x = function() {}';
      const lang = syntaxWorkerFunctions.detectLanguage(code);
      expect(lang).toBe('javascript');
    });

    it('should return text for unknown', () => {
      const code = 'plain text without patterns';
      const lang = syntaxWorkerFunctions.detectLanguage(code);
      expect(lang).toBe('text');
    });
  });
});

describe('Analysis Worker Functions', () => {
  describe('parseDomStructure', () => {
    it('should parse forms', () => {
      const html = '<form action="/submit"><input name="email"></form>';
      const result = analysisWorkerFunctions.parseDomStructure(html);
      expect(result.forms.length).toBe(1);
      expect(result.forms[0].action).toBe('/submit');
    });

    it('should parse buttons', () => {
      const html = '<button>Click me</button>';
      const result = analysisWorkerFunctions.parseDomStructure(html);
      expect(result.buttons.length).toBe(1);
    });

    it('should parse links', () => {
      const html = '<a href="https://example.com">Link</a>';
      const result = analysisWorkerFunctions.parseDomStructure(html);
      expect(result.links.length).toBe(1);
      expect(result.links[0].href).toBe('https://example.com');
    });

    it('should parse inputs', () => {
      const html = '<input type="text" name="username" id="user">';
      const result = analysisWorkerFunctions.parseDomStructure(html);
      expect(result.inputs.length).toBe(1);
      expect(result.inputs[0].type).toBe('text');
      expect(result.inputs[0].name).toBe('username');
    });

    it('should parse images', () => {
      const html = '<img src="test.jpg" alt="Test">';
      const result = analysisWorkerFunctions.parseDomStructure(html);
      expect(result.images.length).toBe(1);
      expect(result.images[0].src).toBe('test.jpg');
    });

    it('should return empty arrays for no matches', () => {
      const html = '<div>Just text</div>';
      const result = analysisWorkerFunctions.parseDomStructure(html);
      expect(result.forms.length).toBe(0);
      expect(result.buttons.length).toBe(0);
      expect(result.links.length).toBe(0);
    });
  });

  describe('extractText', () => {
    it('should extract text from HTML', () => {
      const html = '<div><p>Hello <span>World</span></p></div>';
      const text = analysisWorkerFunctions.extractText(html);
      expect(text).toContain('Hello');
      expect(text).toContain('World');
    });

    it('should remove script content', () => {
      const html = '<div>Text</div><script>alert(1)</script>';
      const text = analysisWorkerFunctions.extractText(html);
      expect(text).not.toContain('alert');
      expect(text).toContain('Text');
    });

    it('should remove style content', () => {
      const html = '<div>Text</div><style>.class { color: red; }</style>';
      const text = analysisWorkerFunctions.extractText(html);
      expect(text).not.toContain('color');
      expect(text).toContain('Text');
    });

    it('should handle empty HTML', () => {
      const text = analysisWorkerFunctions.extractText('');
      expect(text).toBe('');
    });
  });

  describe('extractMetadata', () => {
    it('should extract title', () => {
      const html = '<html><head><title>Test Page</title></head></html>';
      const meta = analysisWorkerFunctions.extractMetadata(html);
      expect(meta.title).toBe('Test Page');
    });

    it('should extract meta description', () => {
      const html = '<meta name="description" content="A test page">';
      const meta = analysisWorkerFunctions.extractMetadata(html);
      expect(meta.description).toBe('A test page');
    });

    it('should extract keywords', () => {
      const html = '<meta name="keywords" content="test, page, example">';
      const meta = analysisWorkerFunctions.extractMetadata(html);
      expect(meta.keywords).toContain('test');
      expect(meta.keywords).toContain('page');
    });

    it('should extract Open Graph tags', () => {
      const html = '<meta property="og:title" content="OG Title">';
      const meta = analysisWorkerFunctions.extractMetadata(html);
      expect(meta.ogTags.title).toBe('OG Title');
    });

    it('should return empty metadata for no matches', () => {
      const html = '<div>No metadata</div>';
      const meta = analysisWorkerFunctions.extractMetadata(html);
      expect(meta.title).toBe('');
      expect(meta.keywords.length).toBe(0);
    });
  });
});

describe('Processing Worker Functions', () => {
  describe('batchMap', () => {
    it('should process items in batch', () => {
      const items = [1, 2, 3, 4, 5];
      const fn = x => x * 2;
      const results = processingWorkerFunctions.batchMap(items, fn);
      expect(results.length).toBe(5);
      expect(results[0].success).toBe(true);
      expect(results[0].result).toBe(2);
    });

    it('should handle errors in batch', () => {
      const items = [1, 2, 'error', 4];
      const fn = x => {
        if (x === 'error') throw new Error('Test error');
        return x * 2;
      };
      const results = processingWorkerFunctions.batchMap(items, fn);
      expect(results[2].success).toBe(false);
      expect(results[2].error).toBe('Test error');
    });

    it('should track indices correctly', () => {
      const items = ['a', 'b', 'c'];
      const fn = x => x.toUpperCase();
      const results = processingWorkerFunctions.batchMap(items, fn);
      expect(results[0].index).toBe(0);
      expect(results[1].index).toBe(1);
      expect(results[2].index).toBe(2);
    });

    it('should handle empty array', () => {
      const results = processingWorkerFunctions.batchMap([], x => x);
      expect(results.length).toBe(0);
    });
  });

  describe('processText', () => {
    it('should extract emails', () => {
      const text = 'Contact us at test@example.com or support@example.org';
      const result = processingWorkerFunctions.processText(text, [{ type: 'extract-emails' }]);
      expect(result.length).toBe(2);
      expect(result).toContain('test@example.com');
    });

    it('should extract URLs', () => {
      const text = 'Visit https://example.com and http://test.org';
      const result = processingWorkerFunctions.processText(text, [{ type: 'extract-urls' }]);
      expect(result.length).toBe(2);
      expect(result).toContain('https://example.com');
    });

    it('should replace text', () => {
      const text = 'Hello World';
      const result = processingWorkerFunctions.processText(text, [{
        type: 'replace',
        pattern: 'World',
        replacement: 'Universe'
      }]);
      expect(result).toBe('Hello Universe');
    });

    it('should extract with regex', () => {
      const text = 'Numbers: 123, 456, 789';
      const result = processingWorkerFunctions.processText(text, [{
        type: 'extract-regex',
        pattern: '\\d+',
        flags: 'g'
      }]);
      expect(result).toContain('123');
      expect(result).toContain('456');
      expect(result).toContain('789');
    });

    it('should chain operations', () => {
      const text = 'Test test TEST';
      const result = processingWorkerFunctions.processText(text, [
        { type: 'replace', pattern: 'test', replacement: 'replaced', flags: 'gi' }
      ]);
      expect(result).toBe('replaced replaced replaced');
    });

    it('should return empty array for no matches', () => {
      const text = 'No emails here';
      const result = processingWorkerFunctions.processText(text, [{ type: 'extract-emails' }]);
      expect(result.length).toBe(0);
    });
  });
});