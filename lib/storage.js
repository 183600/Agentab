// lib/storage.js - Unified storage facade (backward compatible)

import { TaskStorage, taskStorage } from './task-storage.js';
import { SettingsStorage, settingsStorage } from './settings-storage.js';
import { HistoryStorage, historyStorage } from './history-storage.js';
import { logger } from './logger.js';

/**
 * StorageManager - Unified facade for all storage operations
 * Provides backward compatibility while delegating to specialized storage classes
 */
const StorageManager = {
  // Expose specialized storages
  tasks: taskStorage,
  settings: settingsStorage,
  history: historyStorage,

  // === Task Methods (delegated) ===

  /**
   * Get all saved tasks
   * @returns {Promise<Array>}
   */
  async getTasks() {
    return taskStorage.getAll();
  },

  /**
   * Save a new task
   * @param {Object} task - Task object
   * @returns {Promise<Object>} The saved task with id
   */
  async saveTask(task) {
    return taskStorage.save(task);
  },

  /**
   * Update an existing task
   * @param {string} id - Task ID
   * @param {Object} updates - Fields to update
   * @param {Object} options - Update options
   * @returns {Promise<Object|null>}
   */
  async updateTask(id, updates, options) {
    return taskStorage.update(id, updates, options);
  },

  /**
   * Delete a task
   * @param {string} id - Task ID
   * @returns {Promise<boolean>}
   */
  async deleteTask(id) {
    return taskStorage.delete(id);
  },

  /**
   * Record task execution
   * @param {string} id - Task ID
   */
  async recordExecution(id) {
    return taskStorage.recordExecution(id);
  },

  /**
   * Get task version history
   * @param {string} id - Task ID
   * @returns {Promise<Array>}
   */
  async getTaskHistory(id) {
    return taskStorage.getHistory(id);
  },

  /**
   * Restore task to a specific version
   * @param {string} id - Task ID
   * @param {number} version - Version number
   * @returns {Promise<Object|null>}
   */
  async restoreTaskVersion(id, version) {
    return taskStorage.restoreVersion(id, version);
  },

  /**
   * Compare two versions of a task
   * @param {string} id - Task ID
   * @param {number} version1 - First version
   * @param {number} version2 - Second version
   * @returns {Promise<Object|null>}
   */
  async compareTaskVersions(id, version1, version2) {
    const tasks = await taskStorage.getAll();
    const task = tasks.find(t => t.id === id);
    if (!task) return null;

    const getEntry = version => {
      if (version === task.version) {
        return { content: task.content, name: task.name, description: task.description };
      }
      return task.history?.find(h => h.version === version);
    };

    const entry1 = getEntry(version1);
    const entry2 = getEntry(version2);

    if (!entry1 || !entry2) return null;

    return {
      version1: { version: version1, ...entry1 },
      version2: { version: version2, ...entry2 },
      diff: {
        contentChanged: entry1.content !== entry2.content,
        nameChanged: entry1.name !== entry2.name,
        descriptionChanged: entry1.description !== entry2.description
      }
    };
  },

  // === API Settings Methods (delegated) ===

  /**
   * Get API key (decrypt if encrypted)
   * @returns {Promise<string>}
   */
  async getApiKey() {
    return settingsStorage.getApiKey();
  },

  /**
   * Save API key (encrypted)
   * @param {string} key
   */
  async saveApiKey(key) {
    return settingsStorage.saveApiKey(key);
  },

  /**
   * Get API base URL
   * @returns {Promise<string>}
   */
  async getApiBaseUrl() {
    return settingsStorage.getApiBaseUrl();
  },

  /**
   * Save API base URL
   * @param {string} url
   */
  async saveApiBaseUrl(url) {
    return settingsStorage.saveApiBaseUrl(url);
  },

  /**
   * Get model name
   * @returns {Promise<string>}
   */
  async getModel() {
    return settingsStorage.getModel();
  },

  /**
   * Save model name
   * @param {string} model
   */
  async saveModel(model) {
    return settingsStorage.saveModel(model);
  },

  // === History Methods (delegated) ===

  /**
   * Get execution history
   * @returns {Promise<Array>}
   */
  async getHistory() {
    return historyStorage.getAll();
  },

  /**
   * Add to execution history
   * @param {Object} entry
   */
  async addHistory(entry) {
    return historyStorage.add(entry);
  },

  /**
   * Clear history
   */
  async clearHistory() {
    return historyStorage.clear();
  },

  // === Theme Methods (delegated) ===

  /**
   * Get theme preference
   * @returns {Promise<string>}
   */
  async getTheme() {
    return settingsStorage.getTheme();
  },

  /**
   * Save theme preference
   * @param {string} theme - 'light' or 'dark'
   */
  async saveTheme(theme) {
    return settingsStorage.saveTheme(theme);
  }
};

// Make available globally
if (typeof globalThis !== 'undefined') {
  globalThis.StorageManager = StorageManager;
}

// Export for ES module
export { StorageManager, TaskStorage, SettingsStorage, HistoryStorage, taskStorage, settingsStorage, historyStorage };