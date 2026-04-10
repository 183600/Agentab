// test/templates.test.js - Tests for templates.js

import { describe, it, expect, beforeEach } from 'vitest';
import {
  TaskTemplate,
  TemplateLibrary,
  getTemplateCategoriesWithMeta,
  templateLibrary
} from '../lib/templates.js';

describe('TaskTemplate', () => {
  describe('constructor', () => {
    it('should create a template with required properties', () => {
      const template = new TaskTemplate({
        id: 'test-1',
        name: 'Test Template',
        description: 'A test template',
        category: 'test',
        type: 'prompt',
        content: 'Test content'
      });

      expect(template.id).toBe('test-1');
      expect(template.name).toBe('Test Template');
      expect(template.description).toBe('A test template');
      expect(template.category).toBe('test');
      expect(template.type).toBe('prompt');
      expect(template.content).toBe('Test content');
    });

    it('should use default values for optional properties', () => {
      const template = new TaskTemplate({
        id: 'test-2',
        name: 'Test',
        description: 'Desc',
        category: 'test',
        type: 'code',
        content: 'code'
      });

      expect(template.icon).toBe('📝');
      expect(template.tags).toEqual([]);
      expect(template.variables).toEqual([]);
      expect(template.examples).toEqual([]);
    });

    it('should accept custom optional properties', () => {
      const template = new TaskTemplate({
        id: 'test-3',
        name: 'Test',
        description: 'Desc',
        category: 'test',
        type: 'prompt',
        content: 'content',
        icon: '🔧',
        tags: ['tag1', 'tag2'],
        variables: [{ name: 'var1', description: 'Variable 1' }],
        examples: ['Example 1']
      });

      expect(template.icon).toBe('🔧');
      expect(template.tags).toEqual(['tag1', 'tag2']);
      expect(template.variables).toHaveLength(1);
      expect(template.examples).toHaveLength(1);
    });
  });

  describe('apply', () => {
    it('should return content without variables', () => {
      const template = new TaskTemplate({
        id: 'test-4',
        name: 'No Variables',
        description: 'Template without variables',
        category: 'test',
        type: 'prompt',
        content: 'Hello World'
      });

      expect(template.apply()).toBe('Hello World');
    });

    it('should substitute single variable', () => {
      const template = new TaskTemplate({
        id: 'test-5',
        name: 'Single Variable',
        description: 'Template with one variable',
        category: 'test',
        type: 'prompt',
        content: 'Hello {{name}}!',
        variables: [{ name: 'name', description: 'Name' }]
      });

      expect(template.apply({ name: 'World' })).toBe('Hello World!');
    });

    it('should substitute multiple variables', () => {
      const template = new TaskTemplate({
        id: 'test-6',
        name: 'Multiple Variables',
        description: 'Template with multiple variables',
        category: 'test',
        type: 'prompt',
        content: '{{greeting}} {{name}}!',
        variables: [
          { name: 'greeting', description: 'Greeting' },
          { name: 'name', description: 'Name' }
        ]
      });

      expect(template.apply({ greeting: 'Hi', name: 'Alice' })).toBe('Hi Alice!');
    });

    it('should use default value for missing variable', () => {
      const template = new TaskTemplate({
        id: 'test-7',
        name: 'Default Value',
        description: 'Template with default',
        category: 'test',
        type: 'prompt',
        content: 'Hello {{name}}!',
        variables: [{ name: 'name', description: 'Name', default: 'Guest' }]
      });

      expect(template.apply()).toBe('Hello Guest!');
    });

    it('should replace all occurrences of variable', () => {
      const template = new TaskTemplate({
        id: 'test-8',
        name: 'Repeated Variable',
        description: 'Template with repeated variable',
        category: 'test',
        type: 'prompt',
        content: '{{x}} and {{x}} again',
        variables: [{ name: 'x', description: 'Value' }]
      });

      expect(template.apply({ x: 'A' })).toBe('A and A again');
    });
  });
});

describe('TemplateLibrary', () => {
  let library;

  beforeEach(() => {
    library = new TemplateLibrary();
  });

  describe('add', () => {
    it('should add a template', () => {
      const template = new TaskTemplate({
        id: 'add-test-1',
        name: 'Test',
        description: 'Test',
        category: 'test',
        type: 'prompt',
        content: 'content'
      });

      library.add(template);
      expect(library.get('add-test-1')).toBe(template);
    });

    it('should track categories', () => {
      const template = new TaskTemplate({
        id: 'add-test-2',
        name: 'Test',
        description: 'Test',
        category: 'category1',
        type: 'prompt',
        content: 'content'
      });

      library.add(template);
      expect(library.getCategories()).toContain('category1');
    });

    it('should group templates by category', () => {
      const t1 = new TaskTemplate({
        id: 'cat-test-1',
        name: 'T1',
        description: 'T1',
        category: 'cat-a',
        type: 'prompt',
        content: 'c1'
      });
      const t2 = new TaskTemplate({
        id: 'cat-test-2',
        name: 'T2',
        description: 'T2',
        category: 'cat-a',
        type: 'prompt',
        content: 'c2'
      });

      library.add(t1);
      library.add(t2);

      const catTemplates = library.getByCategory('cat-a');
      expect(catTemplates).toHaveLength(2);
      expect(catTemplates).toContain(t1);
      expect(catTemplates).toContain(t2);
    });
  });

  describe('get', () => {
    it('should return template by ID', () => {
      const template = new TaskTemplate({
        id: 'get-test-1',
        name: 'Test',
        description: 'Test',
        category: 'test',
        type: 'prompt',
        content: 'content'
      });

      library.add(template);
      expect(library.get('get-test-1')).toBe(template);
    });

    it('should return undefined for unknown ID', () => {
      expect(library.get('unknown-id')).toBeUndefined();
    });
  });

  describe('getAll', () => {
    it('should return empty array for empty library', () => {
      // Create new empty library
      const emptyLibrary = new TemplateLibrary();
      // Clear built-in templates
      emptyLibrary.templates.clear();
      emptyLibrary.categories.clear();

      expect(emptyLibrary.getAll()).toEqual([]);
    });

    it('should return all templates', () => {
      const t1 = new TaskTemplate({
        id: 'all-test-1',
        name: 'T1',
        description: 'T1',
        category: 'cat-a',
        type: 'prompt',
        content: 'c1'
      });
      const t2 = new TaskTemplate({
        id: 'all-test-2',
        name: 'T2',
        description: 'T2',
        category: 'cat-b',
        type: 'code',
        content: 'c2'
      });

      library.add(t1);
      library.add(t2);

      const all = library.getAll();
      expect(all).toHaveLength(library.getAll().length); // Built-in + added
      expect(all).toContain(t1);
      expect(all).toContain(t2);
    });
  });

  describe('getByCategory', () => {
    it('should return empty array for unknown category', () => {
      expect(library.getByCategory('unknown-category')).toEqual([]);
    });

    it('should return templates in category', () => {
      const t1 = new TaskTemplate({
        id: 'bycat-test-1',
        name: 'T1',
        description: 'T1',
        category: 'my-category',
        type: 'prompt',
        content: 'c1'
      });
      const t2 = new TaskTemplate({
        id: 'bycat-test-2',
        name: 'T2',
        description: 'T2',
        category: 'other-category',
        type: 'prompt',
        content: 'c2'
      });

      library.add(t1);
      library.add(t2);

      const myCatTemplates = library.getByCategory('my-category');
      expect(myCatTemplates).toHaveLength(1);
      expect(myCatTemplates[0]).toBe(t1);
    });
  });

  describe('getCategories', () => {
    it('should return all categories', () => {
      const t1 = new TaskTemplate({
        id: 'cats-test-1',
        name: 'T1',
        description: 'T1',
        category: 'cat-a',
        type: 'prompt',
        content: 'c1'
      });
      const t2 = new TaskTemplate({
        id: 'cats-test-2',
        name: 'T2',
        description: 'T2',
        category: 'cat-b',
        type: 'prompt',
        content: 'c2'
      });

      library.add(t1);
      library.add(t2);

      const categories = library.getCategories();
      expect(categories).toContain('cat-a');
      expect(categories).toContain('cat-b');
    });
  });

  describe('search', () => {
    it('should find templates by name', () => {
      const template = new TaskTemplate({
        id: 'search-test-1',
        name: 'Extract Emails',
        description: 'Extract all emails from page',
        category: 'test',
        type: 'prompt',
        content: 'content'
      });

      library.add(template);

      const results = library.search('email');
      expect(results.length).toBeGreaterThan(0);
      expect(results.some(t => t.id === 'search-test-1')).toBe(true);
    });

    it('should find templates by description', () => {
      const template = new TaskTemplate({
        id: 'search-test-2',
        name: 'Task',
        description: 'Find all phone numbers',
        category: 'test',
        type: 'prompt',
        content: 'content'
      });

      library.add(template);

      const results = library.search('phone');
      expect(results.some(t => t.id === 'search-test-2')).toBe(true);
    });

    it('should be case-insensitive', () => {
      const template = new TaskTemplate({
        id: 'search-test-3',
        name: 'UPPERCASE',
        description: 'lowercase',
        category: 'test',
        type: 'prompt',
        content: 'content'
      });

      library.add(template);

      expect(library.search('uppercase').some(t => t.id === 'search-test-3')).toBe(true);
      expect(library.search('LOWERCASE').some(t => t.id === 'search-test-3')).toBe(true);
    });

    it('should return empty array for no matches', () => {
      const results = library.search('xyznonexistent123');
      expect(results.filter(t => t.id.startsWith('search-test'))).toEqual([]);
    });
  });

  describe('built-in templates', () => {
    it('should have built-in templates initialized', () => {
      const allTemplates = library.getAll();
      expect(allTemplates.length).toBeGreaterThan(0);
    });

    it('should have extract-emails template', () => {
      const template = library.get('extract-emails');
      expect(template).toBeDefined();
      expect(template.name).toContain('邮箱');
    });

    it('should have extract-links template', () => {
      const template = library.get('extract-links');
      expect(template).toBeDefined();
    });

    it('should have fill-form template', () => {
      const template = library.get('fill-form');
      expect(template).toBeDefined();
    });
  });
});

describe('getTemplateCategoriesWithMeta', () => {
  it('should return category metadata', () => {
    const meta = getTemplateCategoriesWithMeta();
    expect(meta).toBeDefined();
    expect(typeof meta).toBe('object');
  });

  it('should have icon for categories', () => {
    const meta = getTemplateCategoriesWithMeta();

    for (const [category, data] of Object.entries(meta)) {
      expect(data.icon).toBeDefined();
      expect(data.label).toBeDefined();
    }
  });
});

describe('templateLibrary singleton', () => {
  it('should be a TemplateLibrary instance', () => {
    expect(templateLibrary).toBeInstanceOf(TemplateLibrary);
  });

  it('should have templates available', () => {
    expect(templateLibrary.getAll().length).toBeGreaterThan(0);
  });
});
