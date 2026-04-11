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
      // Using console directly in content script - logger module not available here
      console.warn('[Agentab][Content][Security] Rejected message from unknown sender:', sender.id);
      return false;
    }
    return true;
  }

  // Sanitize text to prevent potential issues
  function sanitizeText(text, maxLength) {
    if (!text) return '';
    // Remove null bytes and other control characters
    // Using Array.from and filter to avoid no-control-regex ESLint rule
    const sanitized = Array.from(text)
      .filter(char => {
        const code = char.charCodeAt(0);
        // Allow printable characters and common whitespace (tab, newline, carriage return)
        return code >= 32 || code === 9 || code === 10 || code === 13;
      })
      .join('');
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

        case 'start_element_selector':
          handleStartElementSelector(message.options, sendResponse);
          break;

        case 'stop_element_selector':
          handleStopElementSelector(sendResponse);
          break;

        case 'get_interactive_elements':
          handleGetInteractiveElements(sendResponse);
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
      const html = sanitizeText(document.documentElement.outerHTML, MAX_HTML_SIZE);
      const text = sanitizeText(document.body?.innerText || '', MAX_TEXT_SIZE);

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
              console.error('[Agentab][ChromeAgent] extractTable error:', error);
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

  // === Element Selector State ===
  let elementSelectorActive = false;
  let elementSelectorOverlay = null;
  let elementSelectorInfoPanel = null;
  let elementSelectorTooltip = null;
  let elementSelectorCallback = null;

  /**
   * Generate CSS selector for an element
   */
  function generateElementSelector(element) {
    if (element.id) {
      return `#${CSS.escape(element.id)}`;
    }

    if (element.className && typeof element.className === 'string') {
      const classes = element.className.split(/\s+/).filter(c => c && !c.startsWith(':'));
      if (classes.length > 0) {
        const classSelector = classes.map(c => `.${CSS.escape(c)}`).join('');
        const matches = document.querySelectorAll(classSelector);
        if (matches.length === 1) {
          return classSelector;
        }
      }
    }

    if (element.name) {
      const nameSelector = `${element.tagName.toLowerCase()}[name="${CSS.escape(element.name)}"]`;
      const matches = document.querySelectorAll(nameSelector);
      if (matches.length === 1) {
        return nameSelector;
      }
    }

    const path = [];
    let current = element;
    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(c => c.tagName === current.tagName);
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          selector += `:nth-child(${index})`;
        }
      }
      path.unshift(selector);
      current = parent;
    }
    return path.join(' > ');
  }

  /**
   * Get element info
   */
  function getElementInfo(element) {
    const rect = element.getBoundingClientRect();
    return {
      tagName: element.tagName.toLowerCase(),
      selector: generateElementSelector(element),
      id: element.id || null,
      className: element.className || null,
      name: element.name || null,
      type: element.type || null,
      value: element.value || null,
      placeholder: element.placeholder || null,
      text: element.textContent?.slice(0, 100) || null,
      href: element.href || null,
      src: element.src || null,
      boundingBox: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      },
      isVisible: rect.width > 0 && rect.height > 0,
      isInteractive: ['a', 'button', 'input', 'select', 'textarea'].includes(element.tagName.toLowerCase()) ||
                     element.onclick !== null ||
                     element.hasAttribute('onclick') ||
                     element.getAttribute('role') === 'button'
    };
  }

  /**
   * Handle start element selector
   */
  function handleStartElementSelector(options, sendResponse) {
    if (elementSelectorActive) {
      sendResponse({ success: false, error: 'Selector already active' });
      return;
    }

    elementSelectorActive = true;
    elementSelectorCallback = sendResponse;

    // Inject styles for element selector (CSP compliant)
    const styleEl = document.createElement('style');
    styleEl.id = '__agentab_selector_styles__';
    styleEl.textContent = `
      .__agentab-selector-overlay__ {
        position: fixed;
        pointer-events: none;
        z-index: 2147483646;
        border: 2px solid #007acc;
        background: rgba(0, 122, 204, 0.1);
        transition: all 0.1s ease;
        display: none;
      }
      .__agentab-selector-tooltip__ {
        position: fixed;
        top: 16px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 2147483647;
        padding: 8px 16px;
        background: #333;
        color: #fff;
        border-radius: 6px;
        font-size: 13px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      }
    `;
    document.head.appendChild(styleEl);

    // Create overlay
    elementSelectorOverlay = document.createElement('div');
    elementSelectorOverlay.className = '__agentab-selector-overlay__';
    document.body.appendChild(elementSelectorOverlay);

    // Show tooltip
    elementSelectorTooltip = document.createElement('div');
    elementSelectorTooltip.className = '__agentab-selector-tooltip__';
    elementSelectorTooltip.textContent = 'Click an element to select it, or press Esc to cancel';
    document.body.appendChild(elementSelectorTooltip);

    // Add event listeners
    document.addEventListener('mouseover', handleElementHover, true);
    document.addEventListener('click', handleElementClick, true);
    document.addEventListener('keydown', handleElementKeydown, true);
    document.body.style.cursor = 'crosshair';

    console.log('[Content] Element selector started');
    sendResponse({ success: true });
  }

  /**
   * Handle stop element selector
   */
  function handleStopElementSelector(sendResponse) {
    if (!elementSelectorActive) {
      sendResponse({ success: false, error: 'Selector not active' });
      return;
    }

    cleanupElementSelector();
    sendResponse({ success: true });
  }

  /**
   * Cleanup element selector
   */
  function cleanupElementSelector() {
    elementSelectorActive = false;
    document.removeEventListener('mouseover', handleElementHover, true);
    document.removeEventListener('click', handleElementClick, true);
    document.removeEventListener('keydown', handleElementKeydown, true);
    document.body.style.cursor = '';

    if (elementSelectorOverlay) {
      elementSelectorOverlay.remove();
      elementSelectorOverlay = null;
    }
    if (elementSelectorTooltip) {
      elementSelectorTooltip.remove();
      elementSelectorTooltip = null;
    }
    // Remove injected styles
    const styleEl = document.getElementById('__agentab_selector_styles__');
    if (styleEl) {
      styleEl.remove();
    }
    if (elementSelectorInfoPanel) {
      elementSelectorInfoPanel.remove();
      elementSelectorInfoPanel = null;
    }

    console.debug('[Agentab][Content] Element selector stopped');
  }

  /**
   * Handle element hover
   */
  function handleElementHover(e) {
    if (!elementSelectorActive || !elementSelectorOverlay) return;

    const element = e.target;
    if (element === elementSelectorOverlay || element === elementSelectorTooltip) return;

    const rect = element.getBoundingClientRect();
    elementSelectorOverlay.style.top = `${rect.top}px`;
    elementSelectorOverlay.style.left = `${rect.left}px`;
    elementSelectorOverlay.style.width = `${rect.width}px`;
    elementSelectorOverlay.style.height = `${rect.height}px`;
    elementSelectorOverlay.style.display = 'block';
  }

  /**
   * Handle element click
   */
  function handleElementClick(e) {
    if (!elementSelectorActive) return;

    e.preventDefault();
    e.stopPropagation();

    const element = e.target;
    if (element === elementSelectorOverlay || element === elementSelectorTooltip) return;

    const info = getElementInfo(element);
    cleanupElementSelector();

    // Send response
    if (elementSelectorCallback) {
      elementSelectorCallback({ success: true, element: info });
      elementSelectorCallback = null;
    }

    console.debug('[Agentab][Content] Element selected:', info.selector);
  }

  /**
   * Handle element keydown
   */
  function handleElementKeydown(e) {
    if (!elementSelectorActive) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      cleanupElementSelector();

      if (elementSelectorCallback) {
        elementSelectorCallback({ success: false, error: 'Cancelled' });
        elementSelectorCallback = null;
      }
    }
  }

  /**
   * Handle get interactive elements
   */
  function handleGetInteractiveElements(sendResponse) {
    const selectors = [
      'a[href]',
      'button',
      'input',
      'select',
      'textarea',
      '[onclick]',
      '[role="button"]',
      '[role="link"]',
      '[tabindex]'
    ];

    const elements = document.querySelectorAll(selectors.join(', '));
    const results = [];

    for (const element of elements) {
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        results.push(getElementInfo(element));
      }
    }

    sendResponse({ success: true, elements: results });
  }

  // Initialize
  function init() {
    // Only inject on valid pages
    const url = window.location.href;

    // Skip restricted pages
    if (
      url.startsWith('chrome://') ||
      url.startsWith('chrome-extension://') ||
      url.startsWith('about:') ||
      url.startsWith('edge://') ||
      url.startsWith('brave://')
    ) {
      console.log('[Content] Skipping restricted page:', url);
      return;
    }

    // Inject page helpers
    injectPageHelpers();

    console.debug('[Agentab][Content] Agentab content script initialized');
  }

  // Run initialization
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
