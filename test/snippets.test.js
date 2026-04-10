// test/snippets.test.js - Tests for code snippets

import { describe, it, expect } from 'vitest';
import { SnippetLibrary, CodeSnippet, snippetLibrary } from '../lib/snippets.js';

describe('CodeSnippet', () => {
  it('should create snippet with variables', () => {
    const snippet = new CodeSnippet({
      id: 'test',
      name: 'Test Snippet',
      description: 'A test snippet',
      category: 'Test',
      code: 'Hello ${name}!',
      variables: [{ name: 'name', default: 'World' }]
    });

    expect(snippet.id).toBe('test');
    expect(snippet.variables).toHaveLength(1);
  });

  it('should apply variables to code', () => {
    const snippet = new CodeSnippet({
      id: 'test',
      name: 'Test',
      description: 'Test',
      category: 'Test',
      code: 'Hello ${name}! You are ${age} years old.',
      variables: [
        { name: 'name', default: 'World' },
        { name: 'age', default: '25' }
      ]
    });

    const result = snippet.apply({ name: 'Alice', age: '30' });
    expect(result).toBe('Hello Alice! You are 30 years old.');
  });

  it('should use default values', () => {
    const snippet = new CodeSnippet({
      id: 'test',
      name: 'Test',
      description: 'Test',
      category: 'Test',
      code: 'Hello ${name}!',
      variables: [{ name: 'name', default: 'World' }]
    });

    const result = snippet.apply();
    expect(result).toBe('Hello World!');
  });
});

describe('SnippetLibrary', () => {
  it('should have built-in snippets', () => {
    const snippets = snippetLibrary.getAll();
    expect(snippets.length).toBeGreaterThan(0);
  });

  it('should get snippet by id', () => {
    const snippet = snippetLibrary.get('select-element');
    expect(snippet).toBeDefined();
    expect(snippet.name).toBe('Select Element');
  });

  it('should get snippets by category', () => {
    const domSnippets = snippetLibrary.getByCategory('DOM');
    expect(domSnippets.length).toBeGreaterThan(0);
    domSnippets.forEach(snippet => {
      expect(snippet.category).toBe('DOM');
    });
  });

  it('should get all categories', () => {
    const categories = snippetLibrary.getCategories();
    expect(categories).toContain('DOM');
    expect(categories).toContain('Form');
    expect(categories).toContain('Extraction');
  });

  it('should search snippets', () => {
    const results = snippetLibrary.search('click');
    expect(results.length).toBeGreaterThan(0);
    results.forEach(snippet => {
      const matches =
        snippet.name.toLowerCase().includes('click') ||
        snippet.description.toLowerCase().includes('click') ||
        snippet.tags.some(tag => tag.toLowerCase().includes('click'));
      expect(matches).toBe(true);
    });
  });

  it('should add custom snippet', () => {
    const library = new SnippetLibrary();
    const customSnippet = new CodeSnippet({
      id: 'custom',
      name: 'Custom Snippet',
      description: 'A custom snippet',
      category: 'Custom',
      code: 'console.log("custom");'
    });

    library.add(customSnippet);
    expect(library.get('custom')).toBe(customSnippet);
    expect(library.getByCategory('Custom')).toContain(customSnippet);
  });
});
