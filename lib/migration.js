// lib/migration.js - Data version migration system

import { logger } from './logger.js';

/**
 * Current data schema version
 * Increment this when making breaking changes to stored data
 */
export const CURRENT_SCHEMA_VERSION = 2;

/**
 * Migration history
 * Each migration transforms data from version N to N+1
 */
const migrations = {
  // Version 0 -> 1: Initial versioning, encrypt API keys
  1: async (data) => {
    logger.info('Migration v1: Adding versioning and encrypting API keys');

    // Initialize version if not present
    if (!data.schemaVersion) {
      data.schemaVersion = 1;
    }

    // Migrate tasks: ensure all required fields exist
    if (data.tasks && Array.isArray(data.tasks)) {
      data.tasks = data.tasks.map(task => ({
        id: task.id || Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
        name: task.name || 'Untitled Task',
        type: task.type || 'prompt',
        content: task.content || '',
        description: task.description || '',
        createdAt: task.createdAt || new Date().toISOString(),
        updatedAt: task.updatedAt || new Date().toISOString(),
        executionCount: task.executionCount || 0,
        lastExecuted: task.lastExecuted || null,
        ...task
      }));
    }

    return data;
  },

  // Version 1 -> 2: Add settings structure and history metadata
  2: async (data) => {
    logger.info('Migration v2: Adding settings structure and history metadata');

    // Ensure tasks array exists
    if (!data.tasks) {
      data.tasks = [];
    }

    // Ensure history array exists with proper structure
    if (!data.history) {
      data.history = [];
    } else if (Array.isArray(data.history)) {
      data.history = data.history.map(entry => ({
        timestamp: entry.timestamp || new Date().toISOString(),
        type: entry.type || 'unknown',
        prompt: entry.prompt || '',
        result: entry.result || '',
        success: entry.success !== false,
        duration: entry.duration || 0,
        ...entry
      }));
    }

    // Add settings structure if not present
    if (!data.settings) {
      data.settings = {
        ui: {
          theme: data.theme || 'light',
          animationEnabled: true,
          syntaxHighlightEnabled: true
        },
        features: {},
        agent: {
          maxIterations: 10
        }
      };
    }

    // Remove old theme key if migrated to settings
    if (data.theme && data.settings?.ui?.theme) {
      delete data.theme;
    }

    data.schemaVersion = 2;
    return data;
  }
};

/**
 * MigrationManager - Handles data schema migrations
 */
export class MigrationManager {
  /**
   * Get current schema version from storage
   * @returns {Promise<number>}
   */
  static async getStoredVersion() {
    const result = await chrome.storage.local.get('schemaVersion');
    return result.schemaVersion || 0;
  }

  /**
   * Get all stored data
   * @returns {Promise<Object>}
   */
  static async getAllData() {
    return await chrome.storage.local.get(null);
  }

  /**
   * Check if migration is needed
   * @returns {Promise<boolean>}
   */
  static async needsMigration() {
    const storedVersion = await this.getStoredVersion();
    return storedVersion < CURRENT_SCHEMA_VERSION;
  }

  /**
   * Run all pending migrations
   * @param {Object} options - Migration options
   * @param {boolean} options.backup - Create backup before migration
   * @returns {Promise<{success: boolean, fromVersion: number, toVersion: number, errors: string[]}>}
   */
  static async migrate(options = {}) {
    const result = {
      success: true,
      fromVersion: 0,
      toVersion: CURRENT_SCHEMA_VERSION,
      errors: [],
      backupCreated: false
    };

    try {
      const storedVersion = await this.getStoredVersion();
      result.fromVersion = storedVersion;

      // Check if migration is needed
      if (storedVersion >= CURRENT_SCHEMA_VERSION) {
        logger.info('No migration needed, already at latest version');
        return result;
      }

      logger.info(`Starting migration from v${storedVersion} to v${CURRENT_SCHEMA_VERSION}`);

      // Get all data
      let data = await this.getAllData();

      // Create backup if requested
      if (options.backup !== false) {
        await this.createBackup(data, storedVersion);
        result.backupCreated = true;
      }

      // Run migrations sequentially
      for (let version = storedVersion + 1; version <= CURRENT_SCHEMA_VERSION; version++) {
        const migration = migrations[version];

        if (migration) {
          logger.info(`Running migration to v${version}`);

          try {
            data = await migration(data);
            data.schemaVersion = version;

            // Save intermediate state
            await chrome.storage.local.set(data);

            logger.info(`Migration to v${version} completed`);
          } catch (error) {
            logger.error(`Migration to v${version} failed:`, error);
            result.errors.push(`v${version}: ${error.message}`);

            // Attempt to restore from backup
            if (result.backupCreated) {
              await this.restoreFromBackup(storedVersion);
            }

            result.success = false;
            return result;
          }
        }
      }

      logger.info(`Migration completed successfully to v${CURRENT_SCHEMA_VERSION}`);
      return result;
    } catch (error) {
      logger.error('Migration failed:', error);
      result.success = false;
      result.errors.push(error.message);
      return result;
    }
  }

  /**
   * Create a backup of current data
   * @param {Object} data - Data to backup
   * @param {number} version - Current version
   * @returns {Promise<void>}
   */
  static async createBackup(data, version) {
    const backupKey = `backup_v${version}_${Date.now()}`;

    // Store backup
    await chrome.storage.local.set({
      [backupKey]: {
        data,
        version,
        timestamp: new Date().toISOString()
      }
    });

    // Also store reference to latest backup
    await chrome.storage.local.set({
      _latestBackup: backupKey
    });

    logger.info(`Backup created: ${backupKey}`);
  }

  /**
   * Restore from backup
   * @param {number} targetVersion - Version to restore
   * @returns {Promise<boolean>}
   */
  static async restoreFromBackup(targetVersion) {
    try {
      // Find backup for target version
      const allData = await chrome.storage.local.get(null);
      const backupKeys = Object.keys(allData)
        .filter(key => key.startsWith(`backup_v${targetVersion}_`))
        .sort()
        .reverse();

      if (backupKeys.length === 0) {
        logger.error('No backup found for version', targetVersion);
        return false;
      }

      const latestBackupKey = backupKeys[0];
      const backup = allData[latestBackupKey];

      if (!backup || !backup.data) {
        logger.error('Invalid backup data');
        return false;
      }

      // Restore data
      await chrome.storage.local.clear();
      await chrome.storage.local.set(backup.data);

      logger.info(`Restored from backup: ${latestBackupKey}`);
      return true;
    } catch (error) {
      logger.error('Failed to restore from backup:', error);
      return false;
    }
  }

  /**
   * Get backup info
   * @returns {Promise<Array<{key: string, version: number, timestamp: string, size: number}>>}
   */
  static async getBackups() {
    const allData = await chrome.storage.local.get(null);
    const backups = [];

    for (const key of Object.keys(allData)) {
      if (key.startsWith('backup_v')) {
        const match = key.match(/backup_v(\d+)_(\d+)/);
        if (match) {
          const backup = allData[key];
          backups.push({
            key,
            version: parseInt(match[1]),
            timestamp: backup.timestamp,
            size: JSON.stringify(backup.data).length
          });
        }
      }
    }

    return backups.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  /**
   * Delete old backups, keep only the most recent N
   * @param {number} keepCount - Number of backups to keep
   * @returns {Promise<number>} Number of deleted backups
   */
  static async cleanupBackups(keepCount = 3) {
    const backups = await this.getBackups();

    if (backups.length <= keepCount) {
      return 0;
    }

    const toDelete = backups.slice(keepCount);
    const keysToDelete = toDelete.map(b => b.key);

    await chrome.storage.local.remove(keysToDelete);

    logger.info(`Cleaned up ${toDelete.length} old backups`);
    return toDelete.length;
  }

  /**
   * Validate data integrity
   * @param {Object} data - Data to validate
   * @returns {{valid: boolean, errors: string[]}}
   */
  static validateData(data) {
    const errors = [];

    // Check required structures
    if (data.tasks !== undefined && !Array.isArray(data.tasks)) {
      errors.push('tasks must be an array');
    }

    if (data.history !== undefined && !Array.isArray(data.history)) {
      errors.push('history must be an array');
    }

    // Check task structure
    if (Array.isArray(data.tasks)) {
      data.tasks.forEach((task, index) => {
        if (!task.id) errors.push(`tasks[${index}]: missing id`);
        if (!task.type) errors.push(`tasks[${index}]: missing type`);
        if (!['prompt', 'code'].includes(task.type)) {
          errors.push(`tasks[${index}]: invalid type "${task.type}"`);
        }
      });
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Repair corrupted data
   * @returns {Promise<{success: boolean, repairs: string[]}>}
   */
  static async repairData() {
    const result = {
      success: true,
      repairs: []
    };

    try {
      const data = await this.getAllData();

      // Repair tasks array
      if (data.tasks && Array.isArray(data.tasks)) {
        const validTasks = data.tasks.filter(task => {
          if (!task.id || !task.type) {
            result.repairs.push(`Removed invalid task: ${task.name || 'unnamed'}`);
            return false;
          }
          return true;
        });

        if (validTasks.length !== data.tasks.length) {
          data.tasks = validTasks;
          result.repairs.push(`Fixed tasks array: ${data.tasks.length - validTasks.length} removed`);
        }
      }

      // Repair history array
      if (data.history && Array.isArray(data.history)) {
        const validHistory = data.history.filter(entry => {
          if (!entry.timestamp) {
            result.repairs.push('Removed history entry without timestamp');
            return false;
          }
          return true;
        });

        if (validHistory.length !== data.history.length) {
          data.history = validHistory;
        }
      }

      // Save repaired data
      if (result.repairs.length > 0) {
        await chrome.storage.local.set(data);
        logger.info('Data repaired:', result.repairs);
      }

      return result;
    } catch (error) {
      result.success = false;
      result.repairs.push(error.message);
      return result;
    }
  }
}

/**
 * Initialize migration on extension install/update
 */
export async function initMigration() {
  try {
    // Check if migration is needed
    const needsMigration = await MigrationManager.needsMigration();

    if (needsMigration) {
      logger.info('Running automatic migration...');
      const result = await MigrationManager.migrate({ backup: true });

      if (result.success) {
        logger.info(`Migration completed: v${result.fromVersion} -> v${result.toVersion}`);
      } else {
        logger.error('Migration failed:', result.errors);
      }

      return result;
    }

    // Cleanup old backups
    await MigrationManager.cleanupBackups(3);

    return { success: true, migrated: false };
  } catch (error) {
    logger.error('Migration initialization failed:', error);
    return { success: false, error: error.message };
  }
}

export default MigrationManager;
