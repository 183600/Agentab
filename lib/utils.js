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
 * @returns {string} Formatted date string
 */
function formatDate(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return i18n('justNow');
  if (minutes < 60) return i18n('minutesAgo', [minutes]);
  if (hours < 24) return i18n('hoursAgo', [hours]);
  if (days < 7) return i18n('daysAgo', [days]);
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
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
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

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    escapeHtml,
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
