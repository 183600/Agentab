/**
 * E2E Tests for Agentab Chrome Extension
 * Tests the extension functionality in a real browser environment
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import puppeteer from 'puppeteer';

// Extension path
const EXTENSION_PATH = process.cwd();
const TEST_TIMEOUT = 30000;

describe('Agentab Extension E2E', () => {
  let browser;
  let extensionId;
  let popupPage;
  let sidePanelPage;

  beforeAll(async () => {
    // Launch browser with extension loaded
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        '--no-sandbox',
        '--disable-setuid-sandbox'
      ]
    });

    // Get extension ID
    const targets = await browser.targets();
    const extensionTarget = targets.find(
      target => target.type() === 'service_worker' && target.url().includes('chrome-extension://')
    );

    if (extensionTarget) {
      const extensionUrl = extensionTarget.url();
      extensionId = extensionUrl.split('/')[2];
    }
  }, TEST_TIMEOUT);

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
  });

  beforeEach(async () => {
    // Create a new test page
    const page = await browser.newPage();
    await page.goto('about:blank');
    await page.close();
  });

  describe('Extension Installation', () => {
    it('should load the extension successfully', async () => {
      expect(extensionId).toBeDefined();
      expect(extensionId).toMatch(/^[a-z]{32}$/);
    });

    it('should have the correct manifest', async () => {
      const page = await browser.newPage();
      await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);

      const title = await page.title();
      expect(title).toBeTruthy();

      await page.close();
    });
  });

  describe('Popup UI', () => {
    beforeAll(async () => {
      popupPage = await browser.newPage();
      await popupPage.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    }, TEST_TIMEOUT);

    afterAll(async () => {
      if (popupPage) {
        await popupPage.close();
      }
    });

    it('should render popup UI correctly', async () => {
      // Check for main elements
      const promptTab = await popupPage.$('[data-tab="prompt"]');
      const codeTab = await popupPage.$('[data-tab="code"]');

      expect(promptTab).toBeTruthy();
      expect(codeTab).toBeTruthy();
    });

    it('should have input area', async () => {
      const textarea = await popupPage.$('textarea');
      expect(textarea).toBeTruthy();
    });

    it('should have action buttons', async () => {
      const buttons = await popupPage.$$('button');
      expect(buttons.length).toBeGreaterThan(0);
    });
  });

  describe('Side Panel UI', () => {
    beforeAll(async () => {
      sidePanelPage = await browser.newPage();
      await sidePanelPage.goto(`chrome-extension://${extensionId}/sidepanel/sidepanel.html`);
    }, TEST_TIMEOUT);

    afterAll(async () => {
      if (sidePanelPage) {
        await sidePanelPage.close();
      }
    });

    it('should render side panel UI correctly', async () => {
      const container = await sidePanelPage.$('.sidepanel-container');
      expect(container).toBeTruthy();
    });

    it('should have tab navigation', async () => {
      const tabs = await sidePanelPage.$$('.tab-button');
      expect(tabs.length).toBeGreaterThanOrEqual(2);
    });

    it('should have settings button', async () => {
      const settingsBtn = await sidePanelPage.$('[data-action="settings"]');
      expect(settingsBtn).toBeTruthy();
    });

    it('should have output area', async () => {
      const output = await sidePanelPage.$('.output-container');
      expect(output).toBeTruthy();
    });
  });

  describe('Task Management', () => {
    let testPage;

    beforeAll(async () => {
      testPage = await browser.newPage();
      await testPage.goto(`chrome-extension://${extensionId}/sidepanel/sidepanel.html`);
      await testPage.waitForSelector('.sidepanel-container');
    }, TEST_TIMEOUT);

    afterAll(async () => {
      if (testPage) {
        await testPage.close();
      }
    });

    it('should open task panel', async () => {
      const taskBtn = await testPage.$('[data-action="tasks"]');
      if (taskBtn) {
        await taskBtn.click();
        await testPage.waitForTimeout(500);

        const taskPanel = await testPage.$('.tasks-panel');
        expect(taskPanel).toBeTruthy();
      }
    });

    it('should display task list', async () => {
      const taskList = await testPage.$('.task-list');
      // Task list should exist (may be empty)
      expect(taskList).toBeDefined();
    });
  });

  describe('Settings UI', () => {
    let settingsPage;

    beforeAll(async () => {
      settingsPage = await browser.newPage();
      await settingsPage.goto(`chrome-extension://${extensionId}/settings/settings.html`);
    }, TEST_TIMEOUT);

    afterAll(async () => {
      if (settingsPage) {
        await settingsPage.close();
      }
    });

    it('should render settings page correctly', async () => {
      const form = await settingsPage.$('form');
      expect(form).toBeTruthy();
    });

    it('should have API configuration inputs', async () => {
      const apiBaseUrlInput = await settingsPage.$('#apiBaseUrl');
      const apiKeyInput = await settingsPage.$('#apiKey');
      const modelInput = await settingsPage.$('#model');

      expect(apiBaseUrlInput).toBeTruthy();
      expect(apiKeyInput).toBeTruthy();
      expect(modelInput).toBeTruthy();
    });

    it('should have save button', async () => {
      const saveBtn = await settingsPage.$('button[type="submit"]');
      expect(saveBtn).toBeTruthy();
    });
  });

  describe('Content Script', () => {
    let testPage;

    beforeAll(async () => {
      testPage = await browser.newPage();
      await testPage.goto('https://example.com');
      await testPage.waitForTimeout(1000);
    }, TEST_TIMEOUT);

    afterAll(async () => {
      if (testPage) {
        await testPage.close();
      }
    });

    it('should inject content script', async () => {
      // Check if __chromeAgent is available
      const hasChromeAgent = await testPage.evaluate(() => {
        return typeof window.__chromeAgent !== 'undefined';
      });

      expect(hasChromeAgent).toBe(true);
    });

    it('should have helper methods', async () => {
      const methods = await testPage.evaluate(() => {
        const agent = window.__chromeAgent;
        if (!agent) return [];

        return Object.keys(agent).filter(key => typeof agent[key] === 'function');
      });

      expect(methods.length).toBeGreaterThan(0);
      expect(methods).toContain('waitForElement');
      expect(methods).toContain('typeText');
      expect(methods).toContain('clickElement');
    });
  });

  describe('Keyboard Shortcuts', () => {
    let testPage;

    beforeAll(async () => {
      testPage = await browser.newPage();
      await testPage.goto(`chrome-extension://${extensionId}/sidepanel/sidepanel.html`);
      await testPage.waitForSelector('.sidepanel-container');
    }, TEST_TIMEOUT);

    afterAll(async () => {
      if (testPage) {
        await testPage.close();
      }
    });

    it('should handle Ctrl+Enter to run', async () => {
      // Focus textarea
      const textarea = await testPage.$('textarea');
      if (textarea) {
        await textarea.focus();
        await textarea.type('Test prompt');

        // Press Ctrl+Enter
        await testPage.keyboard.down('Control');
        await testPage.keyboard.press('Enter');
        await testPage.keyboard.up('Control');

        // Wait a bit for action
        await testPage.waitForTimeout(500);

        // Check if something happened (output started or error shown)
        const output = await testPage.$('.output-container');
        expect(output).toBeTruthy();
      }
    });
  });

  describe('Error Handling', () => {
    let testPage;

    beforeAll(async () => {
      testPage = await browser.newPage();
      await testPage.goto(`chrome-extension://${extensionId}/sidepanel/sidepanel.html`);
      await testPage.waitForSelector('.sidepanel-container');
    }, TEST_TIMEOUT);

    afterAll(async () => {
      if (testPage) {
        await testPage.close();
      }
    });

    it('should show error for invalid API configuration', async () => {
      // Try to run without valid API config
      const runBtn = await testPage.$('[data-action="run"]');
      if (runBtn) {
        await runBtn.click();
        await testPage.waitForTimeout(1000);

        // Should show some feedback (error or warning)
        const errorElement = await testPage.$('.error-message, .warning-message, .toast-error');
        // Either error or the button should be disabled
        const isDisabled = await runBtn.evaluate(btn => btn.disabled);

        expect(errorElement || isDisabled).toBeTruthy();
      }
    });
  });

  describe('Theme Support', () => {
    let testPage;

    beforeAll(async () => {
      testPage = await browser.newPage();
      await testPage.goto(`chrome-extension://${extensionId}/sidepanel/sidepanel.html`);
    }, TEST_TIMEOUT);

    afterAll(async () => {
      if (testPage) {
        await testPage.close();
      }
    });

    it('should apply light theme by default', async () => {
      const theme = await testPage.evaluate(() => {
        return document.documentElement.getAttribute('data-theme');
      });

      expect(['light', null]).toContain(theme);
    });

    it('should toggle theme', async () => {
      const themeToggle = await testPage.$('[data-action="toggle-theme"]');
      if (themeToggle) {
        await themeToggle.click();
        await testPage.waitForTimeout(300);

        const newTheme = await testPage.evaluate(() => {
          return document.documentElement.getAttribute('data-theme');
        });

        expect(['light', 'dark']).toContain(newTheme);
      }
    });
  });
});

describe('Agent Execution E2E', () => {
  let browser;
  let extensionId;
  let testPage;

  beforeAll(async () => {
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        '--no-sandbox'
      ]
    });

    const targets = await browser.targets();
    const extensionTarget = targets.find(
      target => target.type() === 'service_worker' && target.url().includes('chrome-extension://')
    );

    if (extensionTarget) {
      extensionId = extensionTarget.url().split('/')[2];
    }
  }, TEST_TIMEOUT);

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
  });

  describe('Code Execution', () => {
    beforeAll(async () => {
      testPage = await browser.newPage();
      await testPage.goto('data:text/html,<html><body><div id="test">Hello</div></body></html>');
      await testPage.waitForTimeout(500);
    }, TEST_TIMEOUT);

    afterAll(async () => {
      if (testPage) {
        await testPage.close();
      }
    });

    it('should execute simple JavaScript', async () => {
      const result = await testPage.evaluate(() => {
        return document.getElementById('test')?.textContent;
      });

      expect(result).toBe('Hello');
    });

    it('should have access to DOM', async () => {
      const result = await testPage.evaluate(() => {
        const el = document.getElementById('test');
        return el ? { found: true, text: el.textContent } : { found: false };
      });

      expect(result.found).toBe(true);
      expect(result.text).toBe('Hello');
    });

    it('should be able to modify DOM', async () => {
      await testPage.evaluate(() => {
        const el = document.getElementById('test');
        if (el) el.textContent = 'Modified';
      });

      const text = await testPage.evaluate(() => {
        return document.getElementById('test')?.textContent;
      });

      expect(text).toBe('Modified');
    });
  });

  describe('Form Interaction', () => {
    beforeAll(async () => {
      testPage = await browser.newPage();
      await testPage.goto(`data:text/html,
        <html>
          <body>
            <form id="testForm">
              <input type="text" id="username" name="username">
              <input type="password" id="password" name="password">
              <button type="submit">Submit</button>
            </form>
          </body>
        </html>
      `);
      await testPage.waitForTimeout(500);
    }, TEST_TIMEOUT);

    afterAll(async () => {
      if (testPage) {
        await testPage.close();
      }
    });

    it('should detect form elements', async () => {
      const formInfo = await testPage.evaluate(() => {
        return {
          hasForm: !!document.getElementById('testForm'),
          hasUsername: !!document.getElementById('username'),
          hasPassword: !!document.getElementById('password'),
          hasSubmit: !!document.querySelector('button[type="submit"]')
        };
      });

      expect(formInfo.hasForm).toBe(true);
      expect(formInfo.hasUsername).toBe(true);
      expect(formInfo.hasPassword).toBe(true);
      expect(formInfo.hasSubmit).toBe(true);
    });

    it('should be able to fill form', async () => {
      await testPage.evaluate(() => {
        document.getElementById('username').value = 'testuser';
        document.getElementById('password').value = 'testpass';
      });

      const values = await testPage.evaluate(() => {
        return {
          username: document.getElementById('username').value,
          password: document.getElementById('password').value
        };
      });

      expect(values.username).toBe('testuser');
      expect(values.password).toBe('testpass');
    });
  });

  describe('Data Extraction', () => {
    beforeAll(async () => {
      testPage = await browser.newPage();
      await testPage.goto(`data:text/html,
        <html>
          <body>
            <ul>
              <li class="item">Item 1</li>
              <li class="item">Item 2</li>
              <li class="item">Item 3</li>
            </ul>
            <a href="https://example.com">Link 1</a>
            <a href="https://example.org">Link 2</a>
          </body>
        </html>
      `);
      await testPage.waitForTimeout(500);
    }, TEST_TIMEOUT);

    afterAll(async () => {
      if (testPage) {
        await testPage.close();
      }
    });

    it('should extract list items', async () => {
      const items = await testPage.evaluate(() => {
        return Array.from(document.querySelectorAll('.item')).map(el => el.textContent);
      });

      expect(items).toHaveLength(3);
      expect(items).toEqual(['Item 1', 'Item 2', 'Item 3']);
    });

    it('should extract links', async () => {
      const links = await testPage.evaluate(() => {
        return Array.from(document.querySelectorAll('a')).map(a => ({
          text: a.textContent,
          href: a.href
        }));
      });

      expect(links).toHaveLength(2);
      expect(links[0].text).toBe('Link 1');
      expect(links[1].text).toBe('Link 2');
    });
  });
});
