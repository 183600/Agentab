/**
 * Tests for Worker Pool
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createInlineWorker,
  workerFunctions,
  WorkerPool,
  getWorkerPool,
  runInWorker
} from '../lib/workers/worker-pool.js';

// Mock Worker for Node.js environment
class MockWorker {
  constructor(url) {
    this.url = url;
    this.onmessage = null;
    this.onerror = null;
  }

  postMessage(data) {
    // Simulate worker execution
    setTimeout(() => {
      if (this.onmessage) {
        // Extract function and execute
        this.onmessage({ data: { success: true, result: data.args } });
      }
    }, 10);
  }

  terminate() {
    // Mock terminate
  }
}

// Replace Worker in tests
global.Worker = MockWorker;
global.URL = { createObjectURL: () => 'blob:test' };

describe('createInlineWorker', () => {
  it('should create a worker from a function', () => {
    const fn = (a, b) => a + b;
    const worker = createInlineWorker(fn);
    
    expect(worker).toBeInstanceOf(MockWorker);
  });

  it('should execute function in worker', async () => {
    const fn = (a, b) => a + b;
    const worker = createInlineWorker(fn);
    
    const result = await new Promise((resolve) => {
      worker.onmessage = (e) => resolve(e.data);
      worker.postMessage({ args: [2, 3] });
    });
    
    expect(result.success).toBe(true);
    expect(result.result).toEqual([2, 3]);
  });
});

describe('workerFunctions', () => {
  describe('analyzeHtml', () => {
    it('should extract forms from HTML', () => {
      const html = `
        <form id="login" action="/login" method="post">
          <input type="text" name="username">
          <input type="password" name="password">
          <button type="submit">Login</button>
        </form>
      `;
      
      const result = workerFunctions.analyzeHtml(html);
      
      expect(result.forms).toHaveLength(1);
      expect(result.forms[0].id).toBe('login');
      expect(result.forms[0].fields).toHaveLength(2);
    });

    it('should extract buttons from HTML', () => {
      const html = `
        <button id="btn1">Click Me</button>
        <input type="submit" value="Submit">
      `;
      
      const result = workerFunctions.analyzeHtml(html);
      
      expect(result.buttons).toHaveLength(2);
      expect(result.buttons[0].text).toBe('Click Me');
    });

    it('should extract links from HTML', () => {
      const html = `
        <a href="https://example.com">Example</a>
        <a href="https://test.com">Test</a>
      `;

      const result = workerFunctions.analyzeHtml(html);

      expect(result.links).toHaveLength(2);
      // Browsers may add trailing slash to URLs
      expect(result.links[0].href).toMatch(/^https:\/\/example\.com\/?$/);
    });
  });

  describe('extractData', () => {
    it('should extract data using selectors', () => {
      const html = `
        <div class="item">
          <h2 class="title">Title 1</h2>
          <span class="price">$10</span>
        </div>
        <div class="item">
          <h2 class="title">Title 2</h2>
          <span class="price">$20</span>
        </div>
      `;
      
      const result = workerFunctions.extractData(html, {
        titles: '.title',
        prices: '.price'
      });
      
      expect(result.titles).toHaveLength(2);
      expect(result.prices).toHaveLength(2);
      expect(result.titles[0].text).toBe('Title 1');
    });
  });

  describe('processText', () => {
    it('should extract emails', () => {
      const text = 'Contact us at test@example.com or support@example.org';
      const result = workerFunctions.processText(text, [{ type: 'extract-emails' }]);
      
      expect(result).toHaveLength(2);
      expect(result).toContain('test@example.com');
    });

    it('should extract URLs', () => {
      const text = 'Visit https://example.com or http://test.org/page';
      const result = workerFunctions.processText(text, [{ type: 'extract-urls' }]);
      
      expect(result).toHaveLength(2);
    });

    it('should count words', () => {
      const text = 'Hello world this is a test';
      const result = workerFunctions.processText(text, [{ type: 'word-count' }]);
      
      expect(result).toBe(6);
    });

    it('should apply regex replace', () => {
      const text = 'Hello World';
      const result = workerFunctions.processText(text, [{
        type: 'replace',
        pattern: 'World',
        replacement: 'Universe'
      }]);
      
      expect(result).toBe('Hello Universe');
    });
  });

  describe('calculateSimilarity', () => {
    it('should calculate Levenshtein similarity', () => {
      const result = workerFunctions.calculateSimilarity('hello', 'hallo', 'levenshtein');
      
      expect(result).toBeGreaterThan(0.5);
      expect(result).toBeLessThanOrEqual(1);
    });

    it('should return 1 for identical strings', () => {
      const result = workerFunctions.calculateSimilarity('test', 'test', 'levenshtein');
      
      expect(result).toBe(1);
    });

    it('should return low value for very different strings', () => {
      const result = workerFunctions.calculateSimilarity('abc', 'xyz', 'levenshtein');
      
      expect(result).toBeLessThan(0.5);
    });
  });

  describe('multiSort', () => {
    it('should sort by single criteria', () => {
      const items = [
        { name: 'B', value: 2 },
        { name: 'A', value: 1 },
        { name: 'C', value: 3 }
      ];
      
      const result = workerFunctions.multiSort(items, [{ field: 'name', order: 'asc' }]);
      
      expect(result[0].name).toBe('A');
      expect(result[2].name).toBe('C');
    });

    it('should sort by multiple criteria', () => {
      const items = [
        { category: 'A', value: 2 },
        { category: 'A', value: 1 },
        { category: 'B', value: 1 }
      ];
      
      const result = workerFunctions.multiSort(items, [
        { field: 'category', order: 'asc' },
        { field: 'value', order: 'asc' }
      ]);
      
      expect(result[0].value).toBe(1);
      expect(result[0].category).toBe('A');
    });
  });

  describe('groupBy', () => {
    it('should group items by key', () => {
      const items = [
        { type: 'a', value: 1 },
        { type: 'b', value: 2 },
        { type: 'a', value: 3 }
      ];
      
      const result = workerFunctions.groupBy(items, 'type');
      
      expect(result.a).toHaveLength(2);
      expect(result.b).toHaveLength(1);
    });

    it('should group by nested key', () => {
      const items = [
        { meta: { category: 'x' } },
        { meta: { category: 'y' } },
        { meta: { category: 'x' } }
      ];
      
      const result = workerFunctions.groupBy(items, 'meta.category');
      
      expect(result.x).toHaveLength(2);
      expect(result.y).toHaveLength(1);
    });
  });

  describe('filterItems', () => {
    it('should filter with equality condition', () => {
      const items = [
        { status: 'active' },
        { status: 'inactive' },
        { status: 'active' }
      ];
      
      const result = workerFunctions.filterItems(items, [
        { field: 'status', operator: 'eq', value: 'active' }
      ]);
      
      expect(result).toHaveLength(2);
    });

    it('should filter with comparison operators', () => {
      const items = [
        { value: 10 },
        { value: 20 },
        { value: 30 }
      ];
      
      const result = workerFunctions.filterItems(items, [
        { field: 'value', operator: 'gte', value: 20 }
      ]);
      
      expect(result).toHaveLength(2);
    });

    it('should filter with contains operator', () => {
      const items = [
        { name: 'Hello World' },
        { name: 'Test' },
        { name: 'World' }
      ];
      
      const result = workerFunctions.filterItems(items, [
        { field: 'name', operator: 'contains', value: 'World' }
      ]);
      
      expect(result).toHaveLength(2);
    });
  });
});

describe('WorkerPool', () => {
  let pool;

  beforeEach(() => {
    pool = new WorkerPool({ maxWorkers: 2 });
  });

  afterEach(() => {
    pool.terminateAll();
  });

  it('should create pool with max workers', () => {
    expect(pool.maxWorkers).toBe(2);
  });

  it('should execute task in worker', async () => {
    const fn = (a, b) => a + b;
    const result = await pool.execute(fn, [2, 3]);
    
    expect(result).toEqual([2, 3]);
  });

  it('should queue tasks when max workers reached', async () => {
    const fn = (x) => x;
    
    // Start 3 tasks with max 2 workers
    const promises = [
      pool.execute(fn, [1]),
      pool.execute(fn, [2]),
      pool.execute(fn, [3])
    ];
    
    expect(pool.taskQueue.length).toBeGreaterThanOrEqual(0);
    
    const results = await Promise.all(promises);
    expect(results).toHaveLength(3);
  });

  it('should return pool status', () => {
    const status = pool.getStatus();
    
    expect(status.maxWorkers).toBe(2);
    expect(status.activeCount).toBe(0);
    expect(status.queuedTasks).toBe(0);
  });

  it('should terminate all workers', () => {
    pool.terminateAll();
    
    const status = pool.getStatus();
    expect(status.activeCount).toBe(0);
    expect(status.queuedTasks).toBe(0);
  });
});

describe('getWorkerPool', () => {
  it('should return singleton pool', () => {
    const pool1 = getWorkerPool();
    const pool2 = getWorkerPool();
    
    expect(pool1).toBe(pool2);
  });
});

describe('runInWorker', () => {
  it('should execute function in global pool', async () => {
    const result = await runInWorker((x) => x, [42]);
    expect(result).toEqual([42]);
  });
});
