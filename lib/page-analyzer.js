// lib/page-analyzer.js - Page structure analysis

import { pageCache } from './smart-cache.js';
import { logger } from './logger.js';
import { metrics } from './performance.js';

/**
 * PageAnalyzer - Analyzes web page structure with intelligent caching
 */
export class PageAnalyzer {
  // Use SmartCache for better performance
  static _cleanupInterval = null;
  static _cacheHits = 0;
  static _cacheMisses = 0;

  /**
   * Initialize cache cleanup - should be called once from background script
   */
  static initCleanup() {
    if (this._cleanupInterval) return;

    // Listen for tab removal to clean up cache
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.onRemoved.addListener(tabId => {
        this.invalidateTabSync(tabId);
      });

      // Also clean on navigation
      chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
        if (changeInfo.url) {
          this.invalidateTabSync(tabId);
        }
      });
    }

    logger.info('PageAnalyzer initialized with SmartCache');
  }

  /**
   * Stop cleanup interval
   */
  static stopCleanup() {
    if (this._cleanupInterval) {
      clearInterval(this._cleanupInterval);
      this._cleanupInterval = null;
    }
  }

  /**
   * Invalidate cache for a tab synchronously (for event listeners)
   * @param {number} tabId - Tab ID
   */
  static invalidateTabSync(tabId) {
    // Clear all cache entries starting with tabId
    const keysToDelete = [];
    for (const key of pageCache.cache.keys()) {
      if (key.startsWith(`page:${tabId}:`)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => pageCache.delete(key));
  }

  /**
   * Get cache key for tab
   * @param {number} tabId - Tab ID
   * @returns {Promise<string>}
   */
  static async _getCacheKey(tabId) {
    try {
      const tab = await chrome.tabs.get(tabId);
      return pageCache.generateKey('page', tabId, tab.url);
    } catch {
      return pageCache.generateKey('page', tabId, 'unknown');
    }
  }

  /**
   * Get cache statistics
   * @returns {Object}
   */
  static getCacheStats() {
    const cacheStats = pageCache.getStats();
    return {
      ...cacheStats,
      analyzerHits: this._cacheHits,
      analyzerMisses: this._cacheMisses,
      hitRate: this._cacheHits + this._cacheMisses > 0
        ? ((this._cacheHits / (this._cacheHits + this._cacheMisses)) * 100).toFixed(2) + '%'
        : '0%'
    };
  }

  /**
   * Clear cache
   */
  static clearCache() {
    pageCache.clear();
    this._cacheHits = 0;
    this._cacheMisses = 0;
  }

  /**
   * Invalidate cache for specific tab
   * @param {number} tabId - Tab ID
   */
  static async invalidateTab(tabId) {
    const key = await this._getCacheKey(tabId);
    pageCache.delete(key);
  }

  /**
   * Analyze current page structure
   * @param {number} tabId - Tab ID
   * @param {boolean} useCache - Whether to use cache (default true)
   * @param {Object} options - Additional options
   * @returns {Promise<Object>}
   */
  static async analyze(tabId, useCache = true, options = {}) {
    const startTime = Date.now();
    const { forceRefresh = false, ttl = null } = options;

    // Check cache
    if (useCache && !forceRefresh) {
      const cacheKey = await this._getCacheKey(tabId);
      const cached = pageCache.get(cacheKey);
      if (cached) {
        this._cacheHits++;
        metrics.increment('page_analyzer.cache_hit');
        logger.debug('Page analysis cache hit', { tabId });
        return { ...cached, cached: true };
      }
      this._cacheMisses++;
    }

    metrics.increment('page_analyzer.cache_miss');

    try {
      const tab = await chrome.tabs.get(tabId);

      // Check if this is a restricted page
      if (tab.url.startsWith('chrome://') || 
          tab.url.startsWith('chrome-extension://') ||
          tab.url.startsWith('about:') ||
          tab.url.startsWith('edge://')) {
        return {
          tabId,
          tabUrl: tab.url,
          tabTitle: tab.title,
          url: tab.url,
          title: tab.title,
          error: 'Cannot analyze restricted pages',
          restricted: true,
          forms: [],
          buttons: [],
          links: [],
          inputs: [],
          images: [],
          tables: [],
          meta: {},
          bodyText: ''
        };
      }

      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          return {
            // Basic info
            url: window.location.href,
            title: document.title,

            // Page content
            bodyText: document.body?.innerText?.substring(0, 2000) || '',

            // Forms
            forms: Array.from(document.forms).map(form => ({
              action: form.action,
              method: form.method,
              id: form.id,
              name: form.name,
              inputs: Array.from(form.elements)
                .filter(el => el.name || el.id || el.placeholder)
                .map(el => ({
                  type: el.type,
                  name: el.name,
                  id: el.id,
                  placeholder: el.placeholder,
                  value: el.value?.substring(0, 100) || '',
                  required: el.required
                }))
            })),

            // Links
            links: Array.from(document.querySelectorAll('a[href]'))
              .slice(0, 30)
              .map(link => ({
                text: link.textContent?.trim().substring(0, 50) || '',
                href: link.href,
                title: link.title,
                id: link.id
              })),

            // Buttons
            buttons: Array.from(document.querySelectorAll(
              'button, input[type="submit"], input[type="button"], [role="button"]'
            ))
              .slice(0, 20)
              .map(btn => ({
                text: btn.textContent?.trim().substring(0, 50) || btn.value || '',
                id: btn.id,
                type: btn.type || 'button',
                className: btn.className,
                disabled: btn.disabled
              })),

            // Input fields
            inputs: Array.from(document.querySelectorAll(
              'input:not([type="hidden"]), textarea, select'
            ))
              .slice(0, 30)
              .map(input => ({
                type: input.type || input.tagName.toLowerCase(),
                name: input.name,
                id: input.id,
                placeholder: input.placeholder,
                value: input.value?.substring(0, 50) || '',
                required: input.required
              })),

            // Images
            images: Array.from(document.querySelectorAll('img[src]'))
              .slice(0, 20)
              .map(img => ({
                src: img.src,
                alt: img.alt,
                width: img.width,
                height: img.height
              })),

            // Tables
            tables: Array.from(document.querySelectorAll('table'))
              .slice(0, 10)
              .map((table, index) => ({
                index,
                id: table.id,
                className: table.className,
                rows: table.rows.length,
                headers: Array.from(table.querySelectorAll('th'))
                  .map(th => th.textContent?.trim())
              })),

            // Metadata
            meta: {
              description: document.querySelector('meta[name="description"]')?.content || '',
              keywords: document.querySelector('meta[name="keywords"]')?.content || '',
              viewport: document.querySelector('meta[name="viewport"]')?.content || ''
            },

            // Page state indicators for smart caching
            _state: {
              documentSize: document.documentElement.outerHTML.length,
              elementCount: document.querySelectorAll('*').length,
              timestamp: Date.now()
            }
          };
        },
        world: 'MAIN'
      });

      const analysis = results[0]?.result || {};

      // Add tab info
      analysis.tabUrl = tab.url;
      analysis.tabTitle = tab.title;
      analysis.tabId = tabId;
      analysis.cached = false;

      // Calculate dynamic TTL based on page characteristics
      const dynamicTtl = ttl || this._calculateDynamicTTL(analysis);
      
      // Store in cache with dynamic TTL
      if (useCache) {
        const cacheKey = await this._getCacheKey(tabId);
        pageCache.set(cacheKey, analysis, dynamicTtl);
        analysis.cached = false;
        analysis._ttl = dynamicTtl;
      }

      // Record metrics
      const duration = Date.now() - startTime;
      metrics.record('page_analyzer.analyze_duration', duration);
      logger.debug('Page analyzed', { tabId, duration, cached: false, ttl: dynamicTtl });

      return analysis;
    } catch (error) {
      logger.warn('Page analysis failed', { tabId, error: error.message });
      
      // Return basic info if analysis fails
      const tab = await chrome.tabs.get(tabId).catch(() => null);

      return {
        tabId,
        tabUrl: tab?.url || 'unknown',
        tabTitle: tab?.title || 'unknown',
        error: error.message,
        url: tab?.url || 'unknown',
        title: tab?.title || 'unknown',
        forms: [],
        buttons: [],
        links: [],
        inputs: [],
        images: [],
        tables: [],
        meta: {},
        bodyText: ''
      };
    }
  }

  /**
   * Calculate dynamic TTL based on page characteristics
   * @param {Object} analysis - Page analysis result
   * @returns {number} TTL in milliseconds
   */
  static _calculateDynamicTTL(analysis) {
    const baseTTL = 10000; // 10 seconds base
    const maxTTL = 60000;  // 60 seconds max
    const minTTL = 5000;   // 5 seconds min

    let ttl = baseTTL;

    // Adjust based on page size - larger pages change less often
    const state = analysis._state || {};
    if (state.documentSize) {
      const sizeFactor = Math.min(state.documentSize / 50000, 2); // Cap at 2x
      ttl *= (1 + sizeFactor * 0.5);
    }

    // Adjust based on element count
    if (state.elementCount) {
      const elementFactor = Math.min(state.elementCount / 500, 1.5);
      ttl *= (1 + elementFactor * 0.3);
    }

    // Reduce TTL for dynamic pages (SPAs, etc.)
    const dynamicIndicators = [
      analysis.url.includes('#'),
      analysis.meta?.viewport?.includes('app'),
      (analysis.forms || []).length > 5,
      (analysis.inputs || []).length > 10
    ];
    const dynamicFactor = dynamicIndicators.filter(Boolean).length;
    if (dynamicFactor > 2) {
      ttl *= 0.5; // Reduce TTL for dynamic pages
    }

    // Ensure TTL is within bounds
    return Math.max(minTTL, Math.min(maxTTL, Math.round(ttl)));
  }

  /**
   * Get page info in a simplified format for prompts
   * @param {number} tabId - Tab ID
   * @returns {Promise<Object>}
   */
  static async getPromptContext(tabId) {
    const analysis = await this.analyze(tabId);

    return {
      url: analysis.url,
      title: analysis.title,
      summary: {
        forms: (analysis.forms || []).length,
        links: (analysis.links || []).length,
        buttons: (analysis.buttons || []).length,
        inputs: (analysis.inputs || []).length,
        images: (analysis.images || []).length
      },
      forms: analysis.forms || [],
      buttons: analysis.buttons || [],
      links: (analysis.links || []).slice(0, 20),
      inputs: analysis.inputs || [],
      bodyText: analysis.bodyText?.substring(0, 2000) || ''
    };
  }

  /**
   * Find element by various selectors
   * @param {number} tabId - Tab ID
   * @param {string} selector - CSS selector
   * @returns {Promise<{found: boolean, element?: Object}>}
   */
  static async findElement(tabId, selector) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: sel => {
          const el = document.querySelector(sel);
          if (!el) return { found: false };

          const rect = el.getBoundingClientRect();
          return {
            found: true,
            element: {
              tagName: el.tagName,
              id: el.id,
              className: el.className,
              text: el.textContent?.substring(0, 100) || '',
              value: el.value?.substring(0, 100) || '',
              visible: rect.width > 0 && rect.height > 0,
              rect: {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height
              }
            }
          };
        },
        args: [selector],
        world: 'MAIN'
      });

      return results[0]?.result || { found: false };
    } catch {
      return { found: false };
    }
  }

  /**
   * Highlight element on page
   * @param {number} tabId - Tab ID
   * @param {string} selector - CSS selector
   * @param {number} duration - Highlight duration in ms
   * @returns {Promise<boolean>}
   */
  static async highlightElement(tabId, selector, duration = 3000) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: (sel, dur) => {
          const el = document.querySelector(sel);
          if (!el) return false;

          const original = {
            outline: el.style.outline,
            backgroundColor: el.style.backgroundColor
          };

          el.style.outline = '3px solid #ff4444';
          el.style.backgroundColor = 'rgba(255, 68, 68, 0.1)';
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });

          setTimeout(() => {
            el.style.outline = original.outline;
            el.style.backgroundColor = original.backgroundColor;
          }, dur);

          return true;
        },
        args: [selector, duration],
        world: 'MAIN'
      });

      return results[0]?.result || false;
    } catch {
      return false;
    }
  }

  /**
   * Get visible text from page
   * @param {number} tabId - Tab ID
   * @param {string} selector - Optional selector
   * @returns {Promise<string>}
   */
  static async getVisibleText(tabId, selector = null) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: sel => {
          const el = sel ? document.querySelector(sel) : document.body;
          return el?.innerText || '';
        },
        args: [selector],
        world: 'MAIN'
      });

      return results[0]?.result || '';
    } catch {
      return '';
    }
  }

  /**
   * Take screenshot of page
   * @param {number} tabId - Tab ID
   * @returns {Promise<string>} Base64 image data
   */
  static async takeScreenshot(tabId) {
    try {
      // Focus the tab first
      await chrome.tabs.update(tabId, { active: true });

      // Capture visible tab
      const dataUrl = await chrome.tabs.captureVisibleTab(null, {
        format: 'png',
        quality: 90
      });

      return dataUrl;
    } catch (error) {
      console.error('Failed to take screenshot:', error);
      return null;
    }
  }
}
