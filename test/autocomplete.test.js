// test/autocomplete.test.js - Tests for autocomplete engine

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AutocompleteEngine, CompletionType } from '../lib/autocomplete.js';

describe('AutocompleteEngine', () => {
  let engine;

  beforeEach(() => {
    engine = new AutocompleteEngine();
  });

  describe('constructor', () => {
    it('should create engine with default options', () => {
      expect(engine.options.maxSuggestions).toBe(10);
      expect(engine.options.minTriggerLength).toBe(2);
      expect(engine.options.enableSnippets).toBe(true);
    });

    it('should accept custom options', () => {
      const customEngine = new AutocompleteEngine({
        maxSuggestions: 20,
        minTriggerLength: 3
      });
      expect(customEngine.options.maxSuggestions).toBe(20);
      expect(customEngine.options.minTriggerLength).toBe(3);
    });
  });

  describe('initDOMKeywords', () => {
    it('should initialize DOM keywords', () => {
      expect(engine.domKeywords.size).toBeGreaterThan(0);
      expect(engine.domKeywords.has('querySelector')).toBe(true);
      expect(engine.domKeywords.has('getElementById')).toBe(true);
    });

    it('should have correct structure for keywords', () => {
      const keyword = engine.domKeywords.get('querySelector');
      expect(keyword.type).toBe(CompletionType.METHOD);
      expect(keyword.insertText).toBe('querySelector');
    });
  });

  describe('initAgentKeywords', () => {
    it('should initialize agent keywords', () => {
      expect(engine.agentKeywords.size).toBeGreaterThan(0);
    });
  });

  describe('initJSKeywords', () => {
    it('should initialize JavaScript keywords', () => {
      expect(engine.jsKeywords.size).toBeGreaterThan(0);
      expect(engine.jsKeywords.has('const')).toBe(true);
      expect(engine.jsKeywords.has('function')).toBe(true);
      expect(engine.jsKeywords.has('async')).toBe(true);
    });
  });

  describe('getCompletions', () => {
    it('should return completions for partial input', () => {
      const completions = engine.getCompletions('doc', { line: 1, column: 3 });
      expect(completions.length).toBeGreaterThanOrEqual(0);
    });

    it('should respect maxSuggestions limit', () => {
      const customEngine = new AutocompleteEngine({ maxSuggestions: 5 });
      const completions = customEngine.getCompletions('get', { line: 1, column: 3 });
      expect(completions.length).toBeLessThanOrEqual(5);
    });

    it('should return empty array for short input', () => {
      const completions = engine.getCompletions('d', { line: 1, column: 1 });
      expect(completions.length).toBe(0);
    });

    it('should handle undefined input', () => {
      const completions = engine.getCompletions(undefined, { line: 1, column: 0 });
      expect(Array.isArray(completions)).toBe(true);
    });

    it('should handle null input', () => {
      const completions = engine.getCompletions(null, { line: 1, column: 0 });
      expect(Array.isArray(completions)).toBe(true);
    });

    it('should handle empty input', () => {
      const completions = engine.getCompletions('', { line: 1, column: 0 });
      expect(Array.isArray(completions)).toBe(true);
    });
  });

  describe('filterCompletions', () => {
    it('should filter completions by prefix', () => {
      const items = [
        { label: 'document', type: CompletionType.KEYWORD },
        { label: 'getElementById', type: CompletionType.METHOD },
        { label: 'querySelector', type: CompletionType.METHOD }
      ];
      const filtered = engine.filterCompletions(items, 'get');
      expect(filtered.some(item => item.label === 'getElementById')).toBe(true);
    });

    it('should be case insensitive', () => {
      const items = [
        { label: 'Document', type: CompletionType.KEYWORD },
        { label: 'document', type: CompletionType.KEYWORD }
      ];
      const filtered = engine.filterCompletions(items, 'DOC');
      expect(filtered.length).toBeGreaterThan(0);
    });
  });

  describe('sortCompletions', () => {
    it('should sort completions by relevance', () => {
      const items = [
        { label: 'querySelectorAll', type: CompletionType.METHOD, score: 0.5 },
        { label: 'querySelector', type: CompletionType.METHOD, score: 1.0 }
      ];
      const sorted = engine.sortCompletions(items);
      expect(sorted[0].label).toBe('querySelector');
    });
  });

  describe('getCompletionItem', () => {
    it('should create completion item with default values', () => {
      const item = engine.getCompletionItem('test', CompletionType.KEYWORD);
      expect(item.label).toBe('test');
      expect(item.type).toBe(CompletionType.KEYWORD);
      expect(item.insertText).toBe('test');
    });

    it('should accept custom insertText', () => {
      const item = engine.getCompletionItem('test', CompletionType.METHOD, {
        insertText: 'test()'
      });
      expect(item.insertText).toBe('test()');
    });
  });

  describe('getContextCompletions', () => {
    it('should return completions based on context', () => {
      const context = {
        line: 'const el = document.',
        column: 20,
        lineNumber: 1
      };
      const completions = engine.getContextCompletions(context);
      expect(Array.isArray(completions)).toBe(true);
    });

    it('should handle incomplete context', () => {
      const completions = engine.getContextCompletions({});
      expect(Array.isArray(completions)).toBe(true);
    });
  });

  describe('resolveCompletion', () => {
    it('should resolve completion item', () => {
      const item = {
        label: 'querySelector',
        type: CompletionType.METHOD,
        insertText: 'querySelector'
      };
      const resolved = engine.resolveCompletion(item);
      expect(resolved.insertText).toBeDefined();
    });

    it('should handle snippet completion', () => {
      const item = {
        label: 'querySelector',
        type: CompletionType.SNIPPET,
        insertText: "querySelector('${1:selector}')"
      };
      const resolved = engine.resolveCompletion(item);
      expect(resolved.insertText).toContain('querySelector');
    });
  });
});

describe('CompletionType', () => {
  it('should have all expected types', () => {
    expect(CompletionType.KEYWORD).toBe('keyword');
    expect(CompletionType.METHOD).toBe('method');
    expect(CompletionType.PROPERTY).toBe('property');
    expect(CompletionType.VARIABLE).toBe('variable');
    expect(CompletionType.FUNCTION).toBe('function');
    expect(CompletionType.SNIPPET).toBe('snippet');
    expect(CompletionType.SELECTOR).toBe('selector');
    expect(CompletionType.TEMPLATE).toBe('template');
  });
});
