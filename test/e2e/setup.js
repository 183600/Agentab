/**
 * E2E Test Setup
 * Sets up Puppeteer with Chrome Extension
 */

import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.resolve(__dirname, '../../');

let browser = null;
let page = null;
let extensionId = null;

/**
 * Setup browser with extension loaded
 */
export async function setupBrowser() {
  browser = await puppeteer.launch({
    headless: 'new',
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ]
  });

  // Get extension ID
  const targets = await browser.targets();
  const extensionTarget = targets.find(target => target.type() === 'service_worker');
  
  if (extensionTarget) {
    const extensionUrl = extensionTarget.url();
    const matches = extensionUrl.match(/chrome-extension:\/\/([^/]+)/);
    if (matches) {
      extensionId = matches[1];
    }
  }

  page = await browser.newPage();
  
  return { browser, page, extensionId };
}

/**
 * Get extension page (popup or sidepanel)
 */
export async function getExtensionPage(pageName = 'popup') {
  const pages = await browser.pages();
  
  // Find extension page
  for (const p of pages) {
    const url = p.url();
    if (url.includes(extensionId)) {
      if (pageName === 'popup' && url.includes('popup.html')) {
        return p;
      }
      if (pageName === 'sidepanel' && url.includes('sidepanel.html')) {
        return p;
      }
    }
  }
  
  return null;
}

/**
 * Open extension popup
 */
export async function openPopup() {
  const targets = await browser.targets();
  const extensionTarget = targets.find(target => 
    target.type() === 'page' && 
    target.url().includes('chrome-extension://') &&
    target.url().includes('popup.html')
  );
  
  if (extensionTarget) {
    return await extensionTarget.page();
  }
  
  return null;
}

/**
 * Navigate to test page
 */
export async function navigateToTestPage(url = 'https://example.com') {
  await page.goto(url, { waitUntil: 'networkidle2' });
  return page;
}

/**
 * Execute content script helper
 */
export async function executeHelper(helperName, ...args) {
  return await page.evaluate(async (name, arguments_) => {
    if (typeof window.__chromeAgent !== 'undefined') {
      const helper = window.__chromeAgent[name];
      if (typeof helper === 'function') {
        return await helper(...arguments_);
      }
    }
    return null;
  }, helperName, args);
}

/**
 * Cleanup
 */
export async function cleanup() {
  if (browser) {
    await browser.close();
    browser = null;
    page = null;
    extensionId = null;
  }
}

/**
 * Get browser instance
 */
export function getBrowser() {
  return browser;
}

/**
 * Get page instance
 */
export function getPage() {
  return page;
}

/**
 * Get extension ID
 */
export function getExtensionId() {
  return extensionId;
}

// Export for use in tests
export const e2e = {
  setupBrowser,
  getExtensionPage,
  openPopup,
  navigateToTestPage,
  executeHelper,
  cleanup,
  getBrowser,
  getPage,
  getExtensionId
};
