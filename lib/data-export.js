// lib/data-export.js - Data export and import utilities

import { StorageManager } from './storage.js';
import { logger } from './logger.js';
import { CURRENT_SCHEMA_VERSION } from './migration.js';

/**
 * Export format version
 */
const EXPORT_FORMAT_VERSION = '1.0';

/**
 * DataExporter - Export and import user data
 */
export class DataExporter {
  /**
   * Export all user data
   * @param {Object} options - Export options
   * @param {boolean} options.includeHistory - Include execution history
   * @param {boolean} options.includeSettings - Include settings
   * @param {boolean} options.includeTasks - Include saved tasks
   * @param {boolean} options.sensitive - Include sensitive data (API keys)
   * @returns {Promise<Object>}
   */
  static async exportAll(options = {}) {
    const {
      includeHistory = true,
      includeSettings = true,
      includeTasks = true,
      sensitive = false
    } = options;

    const exportData = {
      version: EXPORT_FORMAT_VERSION,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      exportedBy: 'Agentab',
      data: {}
    };

    try {
      // Export tasks
      if (includeTasks) {
        exportData.data.tasks = await StorageManager.getTasks();
        logger.info(`Exported ${exportData.data.tasks.length} tasks`);
      }

      // Export history
      if (includeHistory) {
        exportData.data.history = await StorageManager.getHistory();
        logger.info(`Exported ${exportData.data.history.length} history entries`);
      }

      // Export settings
      if (includeSettings) {
        const allData = await chrome.storage.local.get('settings');
        exportData.data.settings = allData.settings || {};

        // Include theme
        const theme = await StorageManager.getTheme();
        exportData.data.settings.theme = theme;

        // Include API config (without sensitive data unless explicitly requested)
        if (sensitive) {
          exportData.data.settings.apiBaseUrl = await StorageManager.getApiBaseUrl();
          exportData.data.settings.model = await StorageManager.getModel();
          // Note: API key is intentionally NOT exported even with sensitive=true
          // for security reasons. Users must re-enter API keys after import.
          exportData.data.settings.hasApiKey = !!(await StorageManager.getApiKey());
        } else {
          exportData.data.settings.apiBaseUrl = await StorageManager.getApiBaseUrl();
          exportData.data.settings.model = await StorageManager.getModel();
        }

        logger.info('Exported settings');
      }

      // Add checksum for integrity verification
      exportData.checksum = await this.generateChecksum(exportData.data);

      return exportData;
    } catch (error) {
      logger.error('Export failed:', error);
      throw error;
    }
  }

  /**
   * Export only tasks
   * @returns {Promise<Object>}
   */
  static async exportTasks() {
    const tasks = await StorageManager.getTasks();

    return {
      version: EXPORT_FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      type: 'tasks-only',
      data: { tasks },
      checksum: await this.generateChecksum({ tasks })
    };
  }

  /**
   * Import data from export file
   * @param {Object} importData - Data to import
   * @param {Object} options - Import options
   * @param {boolean} options.merge - Merge with existing data (vs replace)
   * @param {boolean} options.skipDuplicates - Skip duplicate tasks
   * @returns {Promise<{success: boolean, imported: Object, errors: string[]}>}
   */
  static async importAll(importData, options = {}) {
    const { merge = true, skipDuplicates = true } = options;

    const result = {
      success: true,
      imported: {
        tasks: 0,
        history: 0,
        settings: false
      },
      errors: [],
      warnings: []
    };

    try {
      // Validate import data structure
      const validation = this.validateImportData(importData);
      if (!validation.valid) {
        result.success = false;
        result.errors = validation.errors;
        return result;
      }

      // Check version compatibility
      if (importData.schemaVersion > CURRENT_SCHEMA_VERSION) {
        result.warnings.push(
          `Data was exported from a newer version (v${importData.schemaVersion}). ` +
            `Some features may not work correctly.`
        );
      }

      // Verify checksum
      if (importData.checksum) {
        const computedChecksum = await this.generateChecksum(importData.data);
        if (computedChecksum !== importData.checksum) {
          result.warnings.push('Data integrity check failed - file may be corrupted');
        }
      }

      // Import tasks
      if (importData.data.tasks && Array.isArray(importData.data.tasks)) {
        const importResult = await this.importTasks(importData.data.tasks, {
          merge,
          skipDuplicates
        });
        result.imported.tasks = importResult.imported;
        result.errors.push(...importResult.errors);
        result.warnings.push(...importResult.warnings);
      }

      // Import history
      if (importData.data.history && Array.isArray(importData.data.history)) {
        if (merge) {
          const existingHistory = await StorageManager.getHistory();
          const mergedHistory = this.mergeHistory(existingHistory, importData.data.history);
          await chrome.storage.local.set({ history: mergedHistory });
          result.imported.history = importData.data.history.length;
        } else {
          await chrome.storage.local.set({ history: importData.data.history });
          result.imported.history = importData.data.history.length;
        }
      }

      // Import settings
      if (importData.data.settings) {
        await this.importSettings(importData.data.settings, merge);
        result.imported.settings = true;
      }

      logger.info('Import completed:', result);
      return result;
    } catch (error) {
      logger.error('Import failed:', error);
      result.success = false;
      result.errors.push(error.message);
      return result;
    }
  }

  /**
   * Import tasks
   * @param {Array} tasks - Tasks to import
   * @param {Object} options - Import options
   * @returns {Promise<{imported: number, errors: string[], warnings: string[]}>}
   */
  static async importTasks(tasks, options = {}) {
    const { merge = true, skipDuplicates = true } = options;
    const result = { imported: 0, errors: [], warnings: [] };

    try {
      const existingTasks = merge ? await StorageManager.getTasks() : [];
      const existingIds = new Set(existingTasks.map(t => t.id));
      const existingNames = new Set(existingTasks.map(t => t.name.toLowerCase()));

      for (const task of tasks) {
        // Validate task
        if (!task.name || !task.type || !task.content) {
          result.errors.push(`Skipped invalid task: ${task.name || 'unnamed'}`);
          continue;
        }

        // Check for duplicates
        if (skipDuplicates) {
          if (task.id && existingIds.has(task.id)) {
            result.warnings.push(`Skipped duplicate task (same ID): ${task.name}`);
            continue;
          }
          if (existingNames.has(task.name.toLowerCase())) {
            result.warnings.push(`Skipped duplicate task (same name): ${task.name}`);
            continue;
          }
        }

        // Generate new ID to avoid conflicts
        const newTask = {
          ...task,
          id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
          importedAt: new Date().toISOString(),
          originalId: task.id
        };

        existingTasks.push(newTask);
        result.imported++;
      }

      // Save all tasks
      await chrome.storage.local.set({ tasks: existingTasks });

      return result;
    } catch (error) {
      result.errors.push(error.message);
      return result;
    }
  }

  /**
   * Import settings
   * @param {Object} settings - Settings to import
   * @param {boolean} merge - Merge with existing
   */
  static async importSettings(settings, merge = true) {
    if (merge) {
      const existingSettings = await chrome.storage.local.get('settings');
      const merged = this.deepMerge(existingSettings.settings || {}, settings);
      await chrome.storage.local.set({ settings: merged });
    } else {
      await chrome.storage.local.set({ settings });
    }

    // Apply specific settings
    if (settings.theme) {
      await StorageManager.saveTheme(settings.theme);
    }
    if (settings.apiBaseUrl) {
      await StorageManager.saveApiBaseUrl(settings.apiBaseUrl);
    }
    if (settings.model) {
      await StorageManager.saveModel(settings.model);
    }
  }

  /**
   * Merge history entries
   * @param {Array} existing - Existing history
   * @param {Array} imported - Imported history
   * @returns {Array}
   */
  static mergeHistory(existing, imported) {
    const merged = [...existing];
    const existingTimestamps = new Set(existing.map(h => h.timestamp));

    for (const entry of imported) {
      if (!existingTimestamps.has(entry.timestamp)) {
        merged.push(entry);
      }
    }

    // Sort by timestamp descending
    merged.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));

    // Keep only last 100 entries
    return merged.slice(0, 100);
  }

  /**
   * Validate import data structure
   * @param {Object} data - Data to validate
   * @returns {{valid: boolean, errors: string[]}}
   */
  static validateImportData(data) {
    const errors = [];

    if (!data || typeof data !== 'object') {
      errors.push('Invalid data: not an object');
      return { valid: false, errors };
    }

    if (!data.version) {
      errors.push('Missing version field');
    }

    if (!data.data || typeof data.data !== 'object') {
      errors.push('Missing or invalid data field');
    }

    // Validate tasks if present
    if (data.data?.tasks && !Array.isArray(data.data.tasks)) {
      errors.push('tasks must be an array');
    }

    // Validate history if present
    if (data.data?.history && !Array.isArray(data.data.history)) {
      errors.push('history must be an array');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Generate checksum for data integrity
   * @param {Object} data - Data to checksum
   * @returns {Promise<string>}
   */
  static async generateChecksum(data) {
    const text = JSON.stringify(data);
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(text);

    // Use Web Crypto API for SHA-256
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    return hashHex.substring(0, 16); // Use first 16 chars
  }

  /**
   * Deep merge objects
   * @param {Object} target
   * @param {Object} source
   * @returns {Object}
   */
  static deepMerge(target, source) {
    const result = { ...target };

    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }

    return result;
  }

  /**
   * Convert export data to downloadable blob
   * @param {Object} data - Export data
   * @returns {Blob}
   */
  static toBlob(data) {
    const json = JSON.stringify(data, null, 2);
    return new Blob([json], { type: 'application/json' });
  }

  /**
   * Generate filename for export
   * @param {string} type - Export type
   * @returns {string}
   */
  static generateFilename(type = 'full') {
    const date = new Date().toISOString().split('T')[0];
    const time = new Date().toTimeString().split(' ')[0].replace(/:/g, '-');
    return `agentab-${type}-export-${date}-${time}.json`;
  }

  /**
   * Parse import file
   * @param {File} file - File to parse
   * @returns {Promise<Object>}
   */
  static async parseFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = event => {
        try {
          const data = JSON.parse(event.target.result);
          resolve(data);
        } catch (error) {
          reject(new Error('Invalid JSON file'));
        }
      };

      reader.onerror = () => {
        reject(new Error('Failed to read file'));
      };

      reader.readAsText(file);
    });
  }

  /**
   * Get storage usage statistics
   * @returns {Promise<{used: number, available: number, percent: number, breakdown: Object}>}
   */
  static async getStorageStats() {
    const allData = await chrome.storage.local.get(null);

    const breakdown = {
      tasks: 0,
      history: 0,
      settings: 0,
      other: 0
    };

    // Calculate sizes
    for (const [key, value] of Object.entries(allData)) {
      const size = JSON.stringify(value).length;

      if (key === 'tasks') {
        breakdown.tasks = size;
      } else if (key === 'history') {
        breakdown.history = size;
      } else if (key === 'settings') {
        breakdown.settings = size;
      } else {
        breakdown.other += size;
      }
    }

    const used = Object.values(breakdown).reduce((a, b) => a + b, 0);
    const available = chrome.storage.local.QUOTA_BYTES || 5242880; // 5MB default
    const percent = (used / available) * 100;

    return {
      used,
      available,
      percent: Math.round(percent * 100) / 100,
      breakdown
    };
  }
}

export default DataExporter;
