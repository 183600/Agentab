// content/content.js - Content script for page interaction

(() => {
  'use strict';

  // Extension ID for message validation
  const EXTENSION_ID = chrome.runtime.id;

  // Maximum sizes to prevent memory issues
  const MAX_HTML_SIZE = 50000;
  const MAX_TEXT_SIZE = 5000;

  // Validate message sender
  function isValidSender(sender) {
    // Must come from our extension
    if (sender.id !== EXTENSION_ID) {
      console.warn('[Content] Rejected message from unknown sender:', sender.id);
      return false;
    }
    return true;
  }

  // Sanitize text to prevent potential issues
  function sanitizeText(text, maxLength) {
    if (!text) return '';
    // Remove null bytes and other control characters
    const sanitized = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
    return sanitized.substring(0, maxLength);
  }

  // Listen for messages from background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Security: Validate sender
    if (!isValidSender(sender)) {
      sendResponse({ error: 'Unauthorized sender', code: 'SECURITY_ERROR' });
      return false;
    }

    // Handle different actions
    try {
      switch (message.action) {
        case 'get_page_info':
          handleGetPageInfo(sendResponse);
          break;

        case 'highlight_element':
          handleHighlightElement(message.selector, sendResponse);
          break;

        case 'ping':
          // Health check
          sendResponse({ success: true, timestamp: Date.now() });
          break;

        default:
          sendResponse({ error: 'Unknown action', code: 'UNKNOWN_ACTION' });
      }
    } catch (error) {
      console.error('[Content] Error handling message:', error);
      sendResponse({ error: error.message, code: 'HANDLER_ERROR' });
    }

    return true; // Keep channel open for async
  });

  /**
   * Handle get_page_info request
   */
  function handleGetPageInfo(sendResponse) {
    try {
      // Check if we can access the page
      if (!document.body) {
        sendResponse({
          url: window.location.href,
          title: document.title,
          error: 'Page not fully loaded',
          html: '',
          text: ''
        });
        return;
      }

      // Get sanitized content
      const html = sanitizeText(
        document.documentElement.outerHTML,
        MAX_HTML_SIZE
      );
      const text = sanitizeText(
        document.body?.innerText || '',
        MAX_TEXT_SIZE
      );

      sendResponse({
        url: window.location.href,
        title: document.title,
        html,
        text,
        // Add metadata for smarter processing
        meta: {
          documentSize: document.documentElement.outerHTML.length,
          hasForms: document.forms.length > 0,
          hasInputs: document.querySelectorAll('input, textarea, select').length > 0
        }
      });
    } catch (error) {
      sendResponse({
        url: window.location.href,
        title: document.title,
        error: error.message,
        html: '',
        text: ''
      });
    }
  }

  /**
   * Handle highlight_element request
   */
  function handleHighlightElement(selector, sendResponse) {
    try {
      // Validate selector
      if (!selector || typeof selector !== 'string') {
        sendResponse({ success: false, error: 'Invalid selector' });
        return;
      }

      // Security: Limit selector length
      if (selector.length > 500) {
        sendResponse({ success: false, error: 'Selector too long' });
        return;
      }

      const el = document.querySelector(selector);
      if (el) {
        // Store original styles
        const originalStyles = {
          outline: el.style.outline,
          backgroundColor: el.style.backgroundColor
        };

        // Apply highlight
        el.style.outline = '3px solid #ff4444';
        el.style.backgroundColor = 'rgba(255, 68, 68, 0.1)';
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Restore after delay
        setTimeout(() => {
          el.style.outline = originalStyles.outline;
          el.style.backgroundColor = originalStyles.backgroundColor;
        }, 3000);

        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: 'Element not found' });
      }
    } catch (error) {
      // Handle invalid selector syntax
      if (error.name === 'SyntaxError') {
        sendResponse({ success: false, error: 'Invalid selector syntax' });
      } else {
        sendResponse({ success: false, error: error.message });
      }
    }
  }

  // Inject utility functions into the page
  function injectPageHelpers() {
    const script = document.createElement('script');
    script.textContent = `
      'use strict';

      // Chrome Agent helper utilities available in the page context
      (function() {
        const MAX_TEXT_LENGTH = 10000;
        const MAX_SELECTOR_LENGTH = 500;
        const MAX_RETRIES = 10;
        const MAX_DELAY = 10000;

        // Validate selector
        function validateSelector(selector) {
          if (!selector || typeof selector !== 'string') {
            throw new Error('Invalid selector: must be a non-empty string');
          }
          if (selector.length > MAX_SELECTOR_LENGTH) {
            throw new Error('Selector too long');
          }
          return selector;
        }

        // Safe timeout wrapper
        function safeTimeout(ms) {
          return Math.min(Math.max(0, ms), MAX_DELAY);
        }

        // Create __chromeAgent object
        const agent = {
          // Version for compatibility checking
          version: '2.0.0',

          // Wait for an element to appear
          waitForElement: (selector, timeout = 10000) => {
            return new Promise((resolve, reject) => {
              try {
                validateSelector(selector);
                timeout = safeTimeout(timeout);

                const el = document.querySelector(selector);
                if (el) return resolve(el);

                const observer = new MutationObserver(() => {
                  const el = document.querySelector(selector);
                  if (el) {
                    observer.disconnect();
                    resolve(el);
                  }
                });

                observer.observe(document.body, {
                  childList: true,
                  subtree: true
                });

                setTimeout(() => {
                  observer.disconnect();
                  reject(new Error('Timeout waiting for: ' + selector));
                }, timeout);
              } catch (error) {
                reject(error);
              }
            });
          },

          // Simulate human-like typing
          typeText: async (selector, text, delay = 50) => {
            try {
              validateSelector(selector);
              delay = safeTimeout(delay);

              const el = document.querySelector(selector);
              if (!el) throw new Error('Element not found: ' + selector);

              // Truncate text if too long
              const safeText = String(text).substring(0, MAX_TEXT_LENGTH);

              el.focus();
              el.value = '';

              for (const char of safeText) {
                el.value += char;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                await new Promise(r => setTimeout(r, delay + Math.random() * 30));
              }

              el.dispatchEvent(new Event('change', { bubbles: true }));
              return el.value;
            } catch (error) {
              console.error('[ChromeAgent] typeText error:', error);
              throw error;
            }
          },

          // Click element with retry
          clickElement: async (selector, retries = 3) => {
            try {
              validateSelector(selector);
              retries = Math.min(Math.max(1, retries), MAX_RETRIES);

              for (let i = 0; i < retries; i++) {
                const el = document.querySelector(selector);
                if (el) {
                  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  await new Promise(r => setTimeout(r, 300));
                  el.click();
                  return true;
                }
                await new Promise(r => setTimeout(r, 500));
              }

              throw new Error('Element not found after ' + retries + ' retries: ' + selector);
            } catch (error) {
              console.error('[ChromeAgent] clickElement error:', error);
              throw error;
            }
          },

          // Get visible text content
          getVisibleText: (selector) => {
            try {
              const el = selector ? document.querySelector(validateSelector(selector)) : document.body;
              if (!el) return null;

              const text = el.innerText || '';
              return text.substring(0, MAX_TEXT_LENGTH);
            } catch (error) {
              console.error('[ChromeAgent] getVisibleText error:', error);
              return null;
            }
          },

          // Sleep utility
          sleep: (ms) => {
            ms = safeTimeout(ms);
            return new Promise(r => setTimeout(r, ms));
          },

          // Extract table data
          extractTable: (selector) => {
            try {
              const table = selector
                ? document.querySelector(validateSelector(selector))
                : document.querySelector('table');

              if (!table) return null;

              const rows = Array.from(table.querySelectorAll('tr'));
              return rows.map(row =>
                Array.from(row.querySelectorAll('td, th')).map(cell =>
                  cell.textContent.trim().substring(0, 500)
                )
              );
            } catch (error) {
              console.error('[ChromeAgent] extractTable error:', error);
              return null;
            }
          },

          // Fill form
          fillForm: (formData) => {
            try {
              if (!formData || typeof formData !== 'object') {
                throw new Error('Invalid form data');
              }

              const entries = Object.entries(formData);
              if (entries.length > 50) {
                throw new Error('Too many form fields (max 50)');
              }

              entries.forEach(([selector, value]) => {
                try {
                  validateSelector(selector);
                  const el = document.querySelector(selector);

                  if (el) {
                    const safeValue = String(value).substring(0, MAX_TEXT_LENGTH);

                    if (el.type === 'checkbox' || el.type === 'radio') {
                      el.checked = !!value;
                    } else if (el.tagName === 'SELECT') {
                      el.value = safeValue;
                    } else {
                      el.value = safeValue;
                    }

                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                  }
                } catch (err) {
                  console.warn('[ChromeAgent] Failed to fill field:', selector, err);
                }
              });
            } catch (error) {
              console.error('[ChromeAgent] fillForm error:', error);
              throw error;
            }
          },

          // Helper to check if element exists
          elementExists: (selector) => {
            try {
              validateSelector(selector);
              return document.querySelector(selector) !== null;
            } catch {
              return false;
            }
          },

          // Helper to get element count
          countElements: (selector) => {
            try {
              validateSelector(selector);
              return document.querySelectorAll(selector).length;
            } catch {
              return 0;
            }
          },

          // Helper to scroll to element
          scrollToElement: (selector, behavior = 'smooth') => {
            try {
              validateSelector(selector);
              const el = document.querySelector(selector);
              if (el) {
                el.scrollIntoView({ behavior, block: 'center' });
                return true;
              }
              return false;
            } catch {
              return false;
            }
          }
        };

        // Expose to window
        window.__chromeAgent = agent;

        // Log initialization
        console.log('[ChromeAgent] Initialized v' + agent.version);
      })();
    `;

    document.documentElement.appendChild(script);
    script.remove();
  }

  // Initialize
  function init() {
    // Only inject on valid pages
    const url = window.location.href;

    // Skip restricted pages
    if (url.startsWith('chrome://') ||
        url.startsWith('chrome-extension://') ||
        url.startsWith('about:') ||
        url.startsWith('edge://') ||
        url.startsWith('brave://')) {
      console.log('[Content] Skipping restricted page:', url);
      return;
    }

    // Inject page helpers
    injectPageHelpers();

    console.log('[Content] Agentab content script initialized');
  }

  // Run initialization
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
