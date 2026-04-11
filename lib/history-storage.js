// lib/history-storage.js - Execution history storage

/**
 * HistoryStorage - Manages execution history
 */
export class HistoryStorage {
  /**
   * @param {Object} options
   * @param {string} options.storageKey - Storage key
   * @param {number} options.maxEntries - Maximum entries to keep
   */
  constructor(options = {}) {
    this.storageKey = options.storageKey || 'history';
    this.maxEntries = options.maxEntries || 100;
  }

  /**
   * Get all history entries
   * @returns {Promise<Array>}
   */
  async getAll() {
    const result = await chrome.storage.local.get(this.storageKey);
    return result[this.storageKey] || [];
  }

  /**
   * Add a history entry
   * @param {Object} entry - Entry data
   * @returns {Promise<Object>} The added entry
   */
  async add(entry) {
    const history = await this.getAll();
    const newEntry = {
      ...entry,
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      timestamp: new Date().toISOString()
    };

    history.unshift(newEntry);

    // Keep only max entries
    if (history.length > this.maxEntries) {
      history.length = this.maxEntries;
    }

    await chrome.storage.local.set({ [this.storageKey]: history });
    return newEntry;
  }

  /**
   * Clear all history
   */
  async clear() {
    await chrome.storage.local.set({ [this.storageKey]: [] });
  }

  /**
   * Get history by type
   * @param {string} type - Entry type
   * @returns {Promise<Array>}
   */
  async getByType(type) {
    const history = await this.getAll();
    return history.filter(entry => entry.type === type);
  }

  /**
   * Get recent history
   * @param {number} count - Number of entries
   * @returns {Promise<Array>}
   */
  async getRecent(count = 10) {
    const history = await this.getAll();
    return history.slice(0, count);
  }

  /**
   * Search history
   * @param {string} query - Search query
   * @returns {Promise<Array>}
   */
  async search(query) {
    const history = await this.getAll();
    const lowerQuery = query.toLowerCase();
    return history.filter(entry => {
      const input = (entry.input || '').toLowerCase();
      const results = JSON.stringify(entry.results || {}).toLowerCase();
      return input.includes(lowerQuery) || results.includes(lowerQuery);
    });
  }

  /**
   * Delete a specific entry
   * @param {string} id - Entry ID
   * @returns {Promise<boolean>}
   */
  async delete(id) {
    const history = await this.getAll();
    const filtered = history.filter(entry => entry.id !== id);
    if (filtered.length === history.length) return false;
    await chrome.storage.local.set({ [this.storageKey]: filtered });
    return true;
  }

  /**
   * Get history stats
   * @returns {Promise<Object>}
   */
  async getStats() {
    const history = await this.getAll();
    const byType = {};
    let successCount = 0;
    let errorCount = 0;

    for (const entry of history) {
      byType[entry.type] = (byType[entry.type] || 0) + 1;
      if (entry.results?.success) {
        successCount++;
      } else {
        errorCount++;
      }
    }

    return {
      total: history.length,
      byType,
      successCount,
      errorCount
    };
  }
}

// Singleton instance
export const historyStorage = new HistoryStorage();
