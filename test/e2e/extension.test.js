/**
 * E2E Tests - Extension Loading and Basic Functionality
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { e2e } from './setup.js';

describe('Extension Loading', () => {
  let browser;
  let page;
  let extensionId;

  beforeAll(async () => {
    const setup = await e2e.setupBrowser();
    browser = setup.browser;
    page = setup.page;
    extensionId = setup.extensionId;
  }, 30000);

  afterAll(async () => {
    await e2e.cleanup();
  });

  it('should load extension successfully', () => {
    expect(browser).toBeDefined();
    expect(extensionId).toBeDefined();
    expect(extensionId).toMatch(/^[a-z]{32}$/);
  });

  it('should have correct manifest', async () => {
    const targets = await browser.targets();
    const serviceWorker = targets.find(t => t.type() === 'service_worker');
    expect(serviceWorker).toBeDefined();
  });

  it('should inject content script on navigation', async () => {
    await page.goto('https://example.com', { waitUntil: 'networkidle2' });

    // Wait for content script to be injected
    await page.waitForFunction(() => {
      return typeof window.__chromeAgent !== 'undefined';
    }, { timeout: 10000 });

    const hasAgent = await page.evaluate(() => {
      return typeof window.__chromeAgent !== 'undefined';
    });

    expect(hasAgent).toBe(true);
  });
});

describe('Content Script Helpers', () => {
  let page;

  beforeAll(async () => {
    const setup = await e2e.setupBrowser();
    page = setup.page;
    await page.goto('https://example.com', { waitUntil: 'networkidle2' });

    // Wait for content script
    await page.waitForFunction(() => {
      return typeof window.__chromeAgent !== 'undefined';
    }, { timeout: 10000 });
  }, 30000);

  afterAll(async () => {
    await e2e.cleanup();
  });

  it('should have all required helpers', async () => {
    const helpers = await page.evaluate(() => {
      return Object.keys(window.__chromeAgent || {});
    });

    const expectedHelpers = [
      'waitForElement',
      'typeText',
      'clickElement',
      'getVisibleText',
      'sleep',
      'extractTable',
      'fillForm'
    ];

    for (const helper of expectedHelpers) {
      expect(helpers).toContain(helper);
    }
  });

  it('should get visible text correctly', async () => {
    const text = await page.evaluate(async () => {
      return window.__chromeAgent.getVisibleText('body');
    });

    expect(text).toBeDefined();
    expect(typeof text).toBe('string');
    expect(text.length).toBeGreaterThan(0);
  });

  it('should handle sleep correctly', async () => {
    const start = Date.now();
    await page.evaluate(async () => {
      await window.__chromeAgent.sleep(100);
    });
    const elapsed = Date.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(90);
    expect(elapsed).toBeLessThan(200);
  });
});

describe('DOM Manipulation', () => {
  let page;

  beforeAll(async () => {
    const setup = await e2e.setupBrowser();
    page = setup.page;

    // Create a test page with interactive elements
    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <body>
          <form id="test-form">
            <input type="text" id="username" name="username">
            <input type="password" id="password" name="password">
            <button type="submit" id="submit-btn">Submit</button>
          </form>
          <div id="output"></div>
          <table id="test-table">
            <tr><th>Name</th><th>Value</th></tr>
            <tr><td>Test1</td><td>100</td></tr>
            <tr><td>Test2</td><td>200</td></tr>
          </table>
        </body>
      </html>
    `);

    // Wait for content script
    await page.waitForFunction(() => {
      return typeof window.__chromeAgent !== 'undefined';
    }, { timeout: 10000 });
  }, 30000);

  afterAll(async () => {
    await e2e.cleanup();
  });

  it('should fill form fields', async () => {
    await page.evaluate(async () => {
      window.__chromeAgent.fillForm({
        '#username': 'testuser',
        '#password': 'testpass123'
      });
    });

    const username = await page.$eval('#username', el => el.value);
    const password = await page.$eval('#password', el => el.value);

    expect(username).toBe('testuser');
    expect(password).toBe('testpass123');
  });

  it('should type text with delay', async () => {
    await page.evaluate(async () => {
      const input = document.querySelector('#username');
      input.value = '';
      await window.__chromeAgent.typeText('#username', 'hello', 10);
    });

    const value = await page.$eval('#username', el => el.value);
    expect(value).toBe('hello');
  });

  it('should extract table data', async () => {
    const tableData = await page.evaluate(() => {
      return window.__chromeAgent.extractTable('#test-table');
    });

    expect(tableData).toBeDefined();
    expect(tableData).toHaveLength(3); // header + 2 rows
    expect(tableData[0]).toEqual(['Name', 'Value']);
    expect(tableData[1]).toEqual(['Test1', '100']);
    expect(tableData[2]).toEqual(['Test2', '200']);
  });

  it('should wait for element', async () => {
    const element = await page.evaluate(async () => {
      return await window.__chromeAgent.waitForElement('#submit-btn', 5000);
    });

    expect(element).toBeDefined();
  });
});

describe('Form Interaction Flow', () => {
  let page;

  beforeAll(async () => {
    const setup = await e2e.setupBrowser();
    page = setup.page;

    // Create a complex form page
    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <body>
          <form id="signup-form">
            <input type="text" id="name" placeholder="Full Name">
            <input type="email" id="email" placeholder="Email">
            <input type="tel" id="phone" placeholder="Phone">
            <select id="country">
              <option value="">Select Country</option>
              <option value="us">United States</option>
              <option value="uk">United Kingdom</option>
              <option value="ca">Canada</option>
            </select>
            <textarea id="bio" placeholder="Bio"></textarea>
            <input type="checkbox" id="terms">
            <input type="radio" name="gender" value="male"> Male
            <input type="radio" name="gender" value="female"> Female
            <button type="submit" id="submit">Sign Up</button>
          </form>
          <div id="result"></div>
        </body>
      </html>
    `);

    await page.waitForFunction(() => {
      return typeof window.__chromeAgent !== 'undefined';
    }, { timeout: 10000 });
  }, 30000);

  afterAll(async () => {
    await e2e.cleanup();
  });

  it('should fill complex form', async () => {
    await page.evaluate(async () => {
      // Fill text inputs
      await window.__chromeAgent.typeText('#name', 'John Doe');
      await window.__chromeAgent.typeText('#email', 'john@example.com');
      await window.__chromeAgent.typeText('#phone', '1234567890');

      // Select dropdown
      const select = document.querySelector('#country');
      select.value = 'us';

      // Fill textarea
      await window.__chromeAgent.typeText('#bio', 'Software developer');

      // Check checkbox
      document.querySelector('#terms').checked = true;
    });

    const name = await page.$eval('#name', el => el.value);
    const email = await page.$eval('#email', el => el.value);
    const country = await page.$eval('#country', el => el.value);
    const terms = await page.$eval('#terms', el => el.checked);

    expect(name).toBe('John Doe');
    expect(email).toBe('john@example.com');
    expect(country).toBe('us');
    expect(terms).toBe(true);
  });

  it('should submit form and handle result', async () => {
    // Set up result handler
    await page.evaluate(() => {
      document.getElementById('signup-form').addEventListener('submit', e => {
        e.preventDefault();
        document.getElementById('result').textContent = 'Form submitted!';
      });
    });

    // Click submit
    await page.evaluate(async () => {
      await window.__chromeAgent.clickElement('#submit');
    });

    // Wait for result
    await page.waitForFunction(() => {
      return document.getElementById('result').textContent === 'Form submitted!';
    }, { timeout: 5000 });

    const result = await page.$eval('#result', el => el.textContent);
    expect(result).toBe('Form submitted!');
  });
});

describe('Dynamic Content Handling', () => {
  let page;

  beforeAll(async () => {
    const setup = await e2e.setupBrowser();
    page = setup.page;

    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <body>
          <button id="load-more">Load More</button>
          <div id="content">
            <div class="item" id="item-1">Item 1</div>
          </div>
        </body>
      </html>
    `);

    await page.waitForFunction(() => {
      return typeof window.__chromeAgent !== 'undefined';
    }, { timeout: 10000 });
  }, 30000);

  afterAll(async () => {
    await e2e.cleanup();
  });

  it('should handle dynamically added elements', async () => {
    // Set up dynamic content handler
    await page.evaluate(() => {
      document.getElementById('load-more').addEventListener('click', () => {
        setTimeout(() => {
          const content = document.getElementById('content');
          const newItem = document.createElement('div');
          newItem.className = 'item';
          newItem.id = 'item-2';
          newItem.textContent = 'Item 2';
          content.appendChild(newItem);
        }, 100);
      });
    });

    // Click load more
    await page.evaluate(async () => {
      await window.__chromeAgent.clickElement('#load-more');
    });

    // Wait for new element
    const element = await page.evaluate(async () => {
      return await window.__chromeAgent.waitForElement('#item-2', 5000);
    });

    expect(element).toBeDefined();

    const text = await page.$eval('#item-2', el => el.textContent);
    expect(text).toBe('Item 2');
  });

  it('should wait for element timeout', async () => {
    const result = await page.evaluate(async () => {
      try {
        await window.__chromeAgent.waitForElement('#non-existent', 1000);
        return 'found';
      } catch (e) {
        return 'timeout';
      }
    });

    expect(result).toBe('timeout');
  });
});

describe('Data Extraction', () => {
  let page;

  beforeAll(async () => {
    const setup = await e2e.setupBrowser();
    page = setup.page;

    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <body>
          <table id="data-table">
            <thead>
              <tr><th>ID</th><th>Name</th><th>Price</th><th>Stock</th></tr>
            </thead>
            <tbody>
              <tr><td>1</td><td>Product A</td><td>$10.00</td><td>100</td></tr>
              <tr><td>2</td><td>Product B</td><td>$20.00</td><td>50</td></tr>
              <tr><td>3</td><td>Product C</td><td>$30.00</td><td>200</td></tr>
            </tbody>
          </table>
          <ul id="list">
            <li>Item 1</li>
            <li>Item 2</li>
            <li>Item 3</li>
          </ul>
        </body>
      </html>
    `);

    await page.waitForFunction(() => {
      return typeof window.__chromeAgent !== 'undefined';
    }, { timeout: 10000 });
  }, 30000);

  afterAll(async () => {
    await e2e.cleanup();
  });

  it('should extract complete table', async () => {
    const table = await page.evaluate(() => {
      return window.__chromeAgent.extractTable('#data-table');
    });

    expect(table).toHaveLength(4); // header + 3 rows
    expect(table[0]).toEqual(['ID', 'Name', 'Price', 'Stock']);
    expect(table[1]).toEqual(['1', 'Product A', '$10.00', '100']);
  });

  it('should extract list items', async () => {
    const items = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('#list li'))
        .map(li => li.textContent);
    });

    expect(items).toHaveLength(3);
    expect(items).toEqual(['Item 1', 'Item 2', 'Item 3']);
  });

  it('should get visible text from specific selector', async () => {
    const text = await page.evaluate(() => {
      return window.__chromeAgent.getVisibleText('#data-table');
    });

    expect(text).toContain('Product A');
    expect(text).toContain('Product B');
    expect(text).toContain('Product C');
  });
});

describe('Error Handling', () => {
  let page;

  beforeAll(async () => {
    const setup = await e2e.setupBrowser();
    page = setup.page;

    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <body>
          <div id="container"></div>
          <button id="error-btn">Trigger Error</button>
        </body>
      </html>
    `);

    await page.waitForFunction(() => {
      return typeof window.__chromeAgent !== 'undefined';
    }, { timeout: 10000 });
  }, 30000);

  afterAll(async () => {
    await e2e.cleanup();
  });

  it('should handle click on non-existent element', async () => {
    const result = await page.evaluate(async () => {
      try {
        await window.__chromeAgent.clickElement('#non-existent');
        return 'success';
      } catch (e) {
        return 'error';
      }
    });

    expect(result).toBe('error');
  });

  it('should handle type on non-existent element', async () => {
    const result = await page.evaluate(async () => {
      try {
        await window.__chromeAgent.typeText('#non-existent', 'test');
        return 'success';
      } catch (e) {
        return 'error';
      }
    });

    expect(result).toBe('error');
  });

  it('should handle empty form data', async () => {
    const result = await page.evaluate(() => {
      try {
        window.__chromeAgent.fillForm({});
        return 'success';
      } catch (e) {
        return 'error';
      }
    });

    expect(result).toBe('success');
  });
});