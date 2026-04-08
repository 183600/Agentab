// lib/i18n.js - Internationalization utilities

/**
 * Get a localized message
 * @param {string} key - Message key
 * @param {string|string[]} [substitutions] - Substitutions for placeholders
 * @returns {string} Localized message
 */
function i18n(key, substitutions) {
  return chrome.i18n.getMessage(key, substitutions) || key;
}

/**
 * Localize all elements with data-i18n attribute
 * Should be called after DOM is loaded
 */
function localizeDocument() {
  // Localize text content
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const subs = el.getAttribute('data-i18n-subs');
    const substitutions = subs ? subs.split(',') : undefined;
    el.textContent = i18n(key, substitutions);
  });

  // Localize placeholder attributes
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    el.placeholder = i18n(key);
  });

  // Localize title attributes
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    el.title = i18n(key);
  });

  // Localize aria-label attributes
  document.querySelectorAll('[data-i18n-aria]').forEach(el => {
    const key = el.getAttribute('data-i18n-aria');
    el.setAttribute('aria-label', i18n(key));
  });
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { i18n, localizeDocument };
}
