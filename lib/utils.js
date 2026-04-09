// lib/utils.js - Common utility functions

/**
 * Escape HTML special characters to prevent XSS
 * @param {string|null|undefined} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}

/**
 * Allowed HTML tags for sanitization
 */
const ALLOWED_TAGS = new Set([
  'div', 'span', 'p', 'br', 'hr',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
  'a', 'strong', 'b', 'em', 'i', 'u', 's', 'del', 'ins',
  'code', 'pre', 'kbd', 'samp', 'var',
  'blockquote', 'cite', 'q',
  'img', 'figure', 'figcaption',
  'button', 'input', 'select', 'textarea', 'label',
  'svg', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'g', 'text', 'tspan',
  'details', 'summary',
  'section', 'article', 'aside', 'header', 'footer', 'nav', 'main'
]);

/**
 * Allowed HTML attributes for sanitization
 */
const ALLOWED_ATTRS = new Set([
  'class', 'id', 'title', 'alt', 'aria-label', 'aria-describedby', 'aria-hidden',
  'role', 'tabindex', 'disabled', 'readonly', 'placeholder', 'value', 'type', 'name',
  'href', 'target', 'rel', 'download',
  'src', 'width', 'height', 'loading', 'decoding',
  'data-id', 'data-type', 'data-value', 'data-action',
  'viewBox', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
  'd', 'cx', 'cy', 'r', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'points',
  'transform', 'opacity', 'fill-opacity', 'stroke-opacity',
  'open', 'for', 'checked', 'selected', 'multiple', 'min', 'max', 'step',
  'autocomplete', 'autofocus', 'required', 'pattern', 'maxlength', 'minlength'
]);

/**
 * Sanitize HTML string, removing dangerous tags and attributes
 * @param {string} html - HTML string to sanitize
 * @param {Object} [options] - Sanitization options
 * @param {Set<string>} [options.allowedTags] - Additional allowed tags
 * @param {Set<string>} [options.allowedAttrs] - Additional allowed attributes
 * @returns {string} Sanitized HTML
 */
function sanitizeHtml(html, options = {}) {
  if (!html || typeof html !== 'string') return '';

  const allowedTags = new Set([...ALLOWED_TAGS, ...(options.allowedTags || [])]);
  const allowedAttrs = new Set([...ALLOWED_ATTRS, ...(options.allowedAttrs || [])]);

  // Remove script tags and content
  let sanitized = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

  // Remove style tags and content
  sanitized = sanitized.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

  // Remove event handlers and javascript: URLs
  sanitized = sanitized.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '');
  sanitized = sanitized.replace(/javascript\s*:/gi, '');
  sanitized = sanitized.replace(/data\s*:\s*text\/html/gi, '');

  // Remove dangerous attributes
  sanitized = sanitized.replace(/\s*(srcdoc|formaction|action|xlink:href)\s*=\s*["'][^"']*["']/gi, '');

  // Parse and filter
  const parser = new DOMParser();
  const doc = parser.parseFromString(sanitized, 'text/html');

  function cleanNode(node) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const tagName = node.tagName.toLowerCase();

      // Remove disallowed tags
      if (!allowedTags.has(tagName)) {
        node.remove();
        return;
      }

      // Filter attributes
      const attrs = Array.from(node.attributes);
      for (const attr of attrs) {
        const attrName = attr.name.toLowerCase();

        // Remove disallowed attributes
        if (!allowedAttrs.has(attrName)) {
          node.removeAttribute(attrName);
          continue;
        }

        // Validate href/src values
        if (attrName === 'href' || attrName === 'src') {
          const value = attr.value.trim();
          if (value.startsWith('javascript:') || value.startsWith('data:text/html')) {
            node.removeAttribute(attrName);
          }
        }
      }

      // Recursively clean children
      Array.from(node.children).forEach(cleanNode);
    }
  }

  Array.from(doc.body.children).forEach(cleanNode);

  return doc.body.innerHTML;
}

/**
 * Template literal tag for safe HTML with automatic escaping
 * @param {TemplateStringsArray} strings - Template strings
 * @param {...*} values - Interpolated values
 * @returns {string} Safe HTML string with escaped values
 * @example
 * const name = '<script>alert("xss")</script>';
 * const html = safeHtml`<div>${name}</div>`; // <div>&lt;script&gt;alert("xss")&lt;/script&gt;</div>
 */
function safeHtml(strings, ...values) {
  let result = strings[0];

  for (let i = 0; i < values.length; i++) {
    const value = values[i];

    // Check if previous string ends with a safe marker
    const prevString = strings[i];
    const safeMarkerMatch = prevString.match(/\[SAFE\]$/);

    if (safeMarkerMatch) {
      // Remove the [SAFE] marker and use value as-is (already sanitized)
      result = result.slice(0, -6) + String(value);
    } else if (value == null) {
      result += '';
    } else if (typeof value === 'string') {
      result += escapeHtml(value);
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      result += String(value);
    } else if (Array.isArray(value)) {
      result += value.map(v => escapeHtml(String(v))).join('');
    } else {
      result += escapeHtml(String(value));
    }

    result += strings[i + 1];
  }

  return result;
}

/**
 * Mark a string as safe (already sanitized) for use in safeHtml template
 * @param {string} html - Pre-sanitized HTML string
 * @returns {string} String with safe marker
 * @example
 * const safeIcon = markSafe('<svg>...</svg>');
 * const html = safeHtml`<div>${safeIcon}</div>`;
 */
function markSafe(html) {
  return html;
}

/**
 * Safely set innerHTML with sanitization
 * @param {HTMLElement} element - Target element
 * @param {string} html - HTML string to insert
 * @param {Object} [options] - Sanitization options (see sanitizeHtml)
 */
function setSafeHtml(element, html, options = {}) {
  if (!element) return;
  const sanitized = sanitizeHtml(html, options);
  element.innerHTML = sanitized;
}

/**
 * Create DOM element from HTML string with sanitization
 * @param {string} html - HTML string
 * @param {Object} [options] - Sanitization options (see sanitizeHtml)
 * @returns {DocumentFragment} Document fragment with sanitized content
 */
function createElementFromHtml(html, options = {}) {
  const template = document.createElement('template');
  const sanitized = sanitizeHtml(html, options);
  template.innerHTML = sanitized;
  return template.content.cloneNode(true);
}

/**
 * Show a toast notification
 * @param {string} message - Message to display
 * @param {string} [type='info'] - Toast type: 'success', 'error', 'info', 'warning'
 * @param {number} [duration=3000] - Duration in milliseconds
 */
function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toast-container');
  if (!container) {
    console.warn('Toast container not found');
    return;
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icons = {
    success: '✅',
    error: '❌',
    info: 'ℹ️',
    warning: '⚠️'
  };

  toast.innerHTML = `<span>${icons[type] || ''}</span><span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/**
 * Format a date string to relative time
 * @param {string|Date} dateStr - Date to format
 * @param {Function} [i18nFn] - Optional i18n function for localization
 * @returns {string} Formatted date string
 */
function formatDate(dateStr, i18nFn) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  // Use provided i18n function or fallback to simple format
  const t = i18nFn || ((key, args) => {
    const fallbacks = {
      justNow: 'just now',
      minutesAgo: args ? `${args[0]} minutes ago` : 'minutes ago',
      hoursAgo: args ? `${args[0]} hours ago` : 'hours ago',
      daysAgo: args ? `${args[0]} days ago` : 'days ago'
    };
    return fallbacks[key] || key;
  });

  if (minutes < 1) return t('justNow');
  if (minutes < 60) return t('minutesAgo', [minutes]);
  if (hours < 24) return t('hoursAgo', [hours]);
  if (days < 7) return t('daysAgo', [days]);
  return date.toLocaleDateString();
}

/**
 * Create a debounced version of a function
 * @param {Function} func - Function to debounce
 * @param {number} [wait=300] - Wait time in milliseconds
 * @returns {Function} Debounced function
 */
function debounce(func, wait = 300) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Create a throttled version of a function
 * @param {Function} func - Function to throttle
 * @param {number} [limit=100] - Limit in milliseconds
 * @returns {Function} Throttled function
 */
function throttle(func, limit = 100) {
  let inThrottle;
  return function executedFunction(...args) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * Copy text to clipboard
 * @param {string} text - Text to copy
 * @returns {Promise<boolean>} Success status
 */
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const success = document.execCommand('copy');
    document.body.removeChild(textarea);
    return success;
  }
}

/**
 * Download data as a file
 * @param {string} data - Data to download
 * @param {string} filename - Filename
 * @param {string} [type='application/json'] - MIME type
 */
function downloadFile(data, filename, type = 'application/json') {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Read a file as text
 * @param {File} file - File to read
 * @returns {Promise<string>} File contents
 */
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

/**
 * Generate a unique ID
 * @returns {string} Unique ID
 */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 11);
}

/**
 * Safely parse JSON
 * @param {string} str - JSON string
 * @param {*} fallback - Fallback value if parsing fails
 * @returns {*} Parsed JSON or fallback
 */
function safeJsonParse(str, fallback = null) {
  try {
    return JSON.parse(str);
  } catch (e) {
    return fallback;
  }
}

/**
 * Truncate text to a maximum length
 * @param {string} text - Text to truncate
 * @param {number} [maxLength=100] - Maximum length
 * @returns {string} Truncated text
 */
function truncate(text, maxLength = 100) {
  if (!text || text.length <= maxLength) return text || '';
  return text.substring(0, maxLength) + '...';
}

/**
 * Initialize theme from storage
 */
async function initTheme() {
  const result = await chrome.storage.local.get('theme');
  const theme = result.theme || 'light';
  document.documentElement.setAttribute('data-theme', theme);
}

/**
 * Set theme and save to storage
 * @param {string} theme - 'light' or 'dark'
 */
async function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  await chrome.storage.local.set({ theme });
}

/**
 * Toggle theme between light and dark
 */
async function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  await setTheme(current === 'light' ? 'dark' : 'light');
}

// Export for use in other scripts (CommonJS compatibility for testing)
// eslint-disable-next-line no-undef
if (typeof module !== 'undefined' && module.exports) {
  // eslint-disable-next-line no-undef
  module.exports = {
    escapeHtml,
    sanitizeHtml,
    safeHtml,
    markSafe,
    setSafeHtml,
    createElementFromHtml,
    ALLOWED_TAGS,
    ALLOWED_ATTRS,
    showToast,
    formatDate,
    debounce,
    throttle,
    copyToClipboard,
    downloadFile,
    readFileAsText,
    generateId,
    safeJsonParse,
    truncate,
    initTheme,
    setTheme,
    toggleTheme
  };
}
