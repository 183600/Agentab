// lib/page-analyzer.js - Page structure analysis

/**
 * PageAnalyzer - Analyzes web page structure
 */
export class PageAnalyzer {
  /**
   * Analyze current page structure
   * @param {number} tabId - Tab ID
   * @returns {Promise<Object>}
   */
  static async analyze(tabId) {
    try {
      const tab = await chrome.tabs.get(tabId);
      
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

      return analysis;
    } catch (error) {
      // Return basic info if analysis fails
      const tab = await chrome.tabs.get(tabId).catch(() => null);
      
      return {
        tabId,
        tabUrl: tab?.url || 'unknown',
        tabTitle: tab?.title || 'unknown',
        error: error.message,
        url: tab?.url || 'unknown',
        title: tab?.title || 'unknown'
      };
    }
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
        func: (sel) => {
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
        func: (sel) => {
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
