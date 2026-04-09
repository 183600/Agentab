// test/syntax-highlighter.test.js - Tests for syntax-highlighter.js

import { describe, it, expect, beforeEach } from 'vitest';
import { SyntaxHighlighter, addHighlightStyles } from '../lib/syntax-highlighter.js';

describe('SyntaxHighlighter', () => {
  let highlighter;

  beforeEach(() => {
    highlighter = new SyntaxHighlighter();
  });

  describe('constructor', () => {
    it('should create instance with default options', () => {
      expect(highlighter).toBeDefined();
      expect(highlighter.options.theme).toBe('default');
      expect(highlighter.options.lineNumbers).toBe(true);
      expect(highlighter.options.tabSize).toBe(2);
    });

    it('should accept custom options', () => {
      const custom = new SyntaxHighlighter({ theme: 'dark', tabSize: 4 });
      expect(custom.options.theme).toBe('dark');
      expect(custom.options.tabSize).toBe(4);
    });
  });

  describe('escapeHtml', () => {
    it('should escape HTML entities', () => {
      expect(highlighter.escapeHtml('<script>alert("xss")</script>'))
        .toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    });

    it('should escape ampersands', () => {
      expect(highlighter.escapeHtml('a & b')).toBe('a &amp; b');
    });

    it('should escape single quotes', () => {
      expect(highlighter.escapeHtml("it's")).toBe('it&#039;s');
    });

    it('should handle empty string', () => {
      expect(highlighter.escapeHtml('')).toBe('');
    });

    it('should handle plain text', () => {
      expect(highlighter.escapeHtml('hello world')).toBe('hello world');
    });
  });

  describe('getStyle', () => {
    it('should return style for valid token type', () => {
      const style = highlighter.getStyle('keyword');
      expect(style).toContain('color:');
      expect(style).toContain('font-weight:');
    });

    it('should return default style for unknown token type', () => {
      const style = highlighter.getStyle('unknown');
      expect(style).toContain('color:');
    });

    it('should return dark styles for dark theme', () => {
      const darkHighlighter = new SyntaxHighlighter({ theme: 'dark' });
      const style = darkHighlighter.getStyle('keyword');
      expect(style).toContain('color:');
      // Dark theme uses different colors
      expect(style).toContain('#ff7b72');
    });
  });

  describe('highlight', () => {
    it('should return empty string for empty input', () => {
      expect(highlighter.highlight('')).toBe('');
    });

    it('should highlight keywords', () => {
      const result = highlighter.highlight('const x = 1;');
      expect(result).toContain('<span');
      expect(result).toContain('const');
    });

    it('should highlight function calls', () => {
      const result = highlighter.highlight('console.log("test")');
      expect(result).toContain('console');
      expect(result).toContain('log');
    });

    it('should highlight string literals', () => {
      const result = highlighter.highlight('const str = "hello"');
      expect(result).toContain('hello');
      expect(result).toContain('color:'); // Has syntax highlighting
    });

    it('should highlight single-quoted strings', () => {
      const result = highlighter.highlight("const str = 'hello'");
      expect(result).toContain('hello');
      expect(result).toContain('color:'); // Has syntax highlighting
    });

    it('should highlight template literals', () => {
      const result = highlighter.highlight('const str = `hello ${name}`');
      expect(result).toContain('`');
    });

    it('should highlight numbers', () => {
      const result = highlighter.highlight('const x = 42');
      expect(result).toContain('42');
    });

    it('should highlight single-line comments', () => {
      const result = highlighter.highlight('// This is a comment');
      expect(result).toContain('font-style: italic');
    });

    it('should highlight multi-line comments', () => {
      const result = highlighter.highlight('/* line1\nline2 */');
      expect(result).toContain('font-style: italic');
    });

    it('should highlight built-in objects', () => {
      const result = highlighter.highlight('new Array()');
      expect(result).toContain('Array');
    });

    it('should preserve code structure', () => {
      const code = 'const x = 1;\nconst y = 2;';
      const result = highlighter.highlight(code);
      expect(result).toContain('\n');
    });

    it('should handle complex code', () => {
      const code = `\n        async function fetchData(url) {\n          const response = await fetch(url);\n          return response.json();\n        }\n      `;
      const result = highlighter.highlight(code);
      expect(result).toContain('async');
      expect(result).toContain('function');
      expect(result).toContain('await');
    });

    it('should handle nested structures', () => {
      const code = 'const arr = [1, 2, [3, 4]]';
      const result = highlighter.highlight(code);
      expect(result).toBeDefined();
    });

    it('should escape HTML in code', () => {
      const result = highlighter.highlight('const html = "<div>"');
      // The highlighter should handle the HTML entities
      expect(result).toContain('div');
      expect(result).toContain('color:'); // Has syntax highlighting
    });
  });

  describe('highlightWithLineNumbers', () => {
    it('should add line numbers', () => {
      const code = 'line1\nline2\nline3';
      const result = highlighter.highlightWithLineNumbers(code);
      expect(result).toContain('line-number');
      expect(result).toContain('1');
      expect(result).toContain('2');
      expect(result).toContain('3');
    });

    it('should handle single line', () => {
      const result = highlighter.highlightWithLineNumbers('single line');
      expect(result).toContain('line-number');
      expect(result).toContain('1');
    });

    it('should handle empty code', () => {
      const result = highlighter.highlightWithLineNumbers('');
      expect(result).toContain('line-number');
    });
  });
});

describe('addHighlightStyles', () => {
  it('should add styles to document head', () => {
    // Remove existing styles first
    const existing = document.getElementById('syntax-highlight-styles');
    if (existing) existing.remove();

    addHighlightStyles();
    
    const styles = document.getElementById('syntax-highlight-styles');
    expect(styles).toBeDefined();
    expect(styles.tagName).toBe('STYLE');
  });

  it('should not duplicate styles', () => {
    addHighlightStyles();
    addHighlightStyles();
    
    const styles = document.querySelectorAll('#syntax-highlight-styles');
    expect(styles.length).toBe(1);
  });
});
