// content/content.js - Content script for page interaction

(() => {
  // Listen for messages from background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'get_page_info') {
      sendResponse({
        url: window.location.href,
        title: document.title,
        html: document.documentElement.outerHTML.substring(0, 50000),
        text: document.body?.innerText?.substring(0, 5000) || ''
      });
    }

    if (message.action === 'highlight_element') {
      try {
        const el = document.querySelector(message.selector);
        if (el) {
          const originalOutline = el.style.outline;
          el.style.outline = '3px solid #ff4444';
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setTimeout(() => {
            el.style.outline = originalOutline;
          }, 3000);
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: 'Element not found' });
        }
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    }

    return true;
  });

  // Inject utility functions into the page
  const script = document.createElement('script');
  script.textContent = `
    // Chrome Agent helper utilities available in the page context
    window.__chromeAgent = {
      // Wait for an element to appear
      waitForElement: (selector, timeout = 10000) => {
        return new Promise((resolve, reject) => {
          const el = document.querySelector(selector);
          if (el) return resolve(el);
          
          const observer = new MutationObserver(() => {
            const el = document.querySelector(selector);
            if (el) {
              observer.disconnect();
              resolve(el);
            }
          });
          
          observer.observe(document.body, { childList: true, subtree: true });
          
          setTimeout(() => {
            observer.disconnect();
            reject(new Error('Timeout waiting for: ' + selector));
          }, timeout);
        });
      },
      
      // Simulate human-like typing
      typeText: async (selector, text, delay = 50) => {
        const el = document.querySelector(selector);
        if (!el) throw new Error('Element not found: ' + selector);
        el.focus();
        el.value = '';
        for (const char of text) {
          el.value += char;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          await new Promise(r => setTimeout(r, delay + Math.random() * 30));
        }
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return el.value;
      },
      
      // Click element with retry
      clickElement: async (selector, retries = 3) => {
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
        throw new Error('Element not found after retries: ' + selector);
      },
      
      // Get visible text content
      getVisibleText: (selector) => {
        const el = selector ? document.querySelector(selector) : document.body;
        if (!el) return null;
        return el.innerText;
      },
      
      // Sleep utility
      sleep: (ms) => new Promise(r => setTimeout(r, ms)),
      
      // Extract table data
      extractTable: (selector) => {
        const table = document.querySelector(selector || 'table');
        if (!table) return null;
        const rows = Array.from(table.querySelectorAll('tr'));
        return rows.map(row => 
          Array.from(row.querySelectorAll('td, th')).map(cell => cell.textContent.trim())
        );
      },
      
      // Fill form
      fillForm: (formData) => {
        Object.entries(formData).forEach(([selector, value]) => {
          const el = document.querySelector(selector);
          if (el) {
            if (el.type === 'checkbox' || el.type === 'radio') {
              el.checked = !!value;
            } else if (el.tagName === 'SELECT') {
              el.value = value;
            } else {
              el.value = value;
            }
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });
      }
    };
  `;
  document.documentElement.appendChild(script);
  script.remove();
})();
