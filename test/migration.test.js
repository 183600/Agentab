// test/migration.test.js - Tests for Migration System

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  MigrationManager,
  initMigration,
  CURRENT_SCHEMA_VERSION
} from '../lib/migration.js';
import { mockChromeStorage } from './setup.js';

describe('CURRENT_SCHEMA_VERSION', () => {
  it('should be a positive number', () => {
    expect(CURRENT_SCHEMA_VERSION).toBeGreaterThan(0);
    expect(typeof CURRENT_SCHEMA_VERSION).toBe('number');
  });
});

describe('MigrationManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChromeStorage.local.data = {};
  });

  describe('getStoredVersion', () => {
    it('should return 0 if no version stored', async () => {
      const version = await MigrationManager.getStoredVersion();
      expect(version).toBe(0);
    });

    it('should return stored version', async () => {
      mockChromeStorage.local.data = { schemaVersion: 2 };
      const version = await MigrationManager.getStoredVersion();
      expect(version).toBe(2);
    });
  });

  describe('getAllData', () => {
    it('should return all stored data', async () => {
      mockChromeStorage.local.data = {
        tasks: [],
        settings: {},
        schemaVersion: 1
      };

      const data = await MigrationManager.getAllData();

      expect(data.tasks).toEqual([]);
      expect(data.settings).toEqual({});
      expect(data.schemaVersion).toBe(1);
    });
  });

  describe('needsMigration', () => {
    it('should return true if stored version is lower', async () => {
      mockChromeStorage.local.data = { schemaVersion: 0 };
      const needs = await MigrationManager.needsMigration();
      expect(needs).toBe(true);
    });

    it('should return false if at current version', async () => {
      mockChromeStorage.local.data = { schemaVersion: CURRENT_SCHEMA_VERSION };
      const needs = await MigrationManager.needsMigration();
      expect(needs).toBe(false);
    });

    it('should return false if version is higher', async () => {
      mockChromeStorage.local.data = { schemaVersion: CURRENT_SCHEMA_VERSION + 1 };
      const needs = await MigrationManager.needsMigration();
      expect(needs).toBe(false);
    });
  });

  describe('migrate', () => {
    it('should skip migration if already at latest version', async () => {
      mockChromeStorage.local.data = { schemaVersion: CURRENT_SCHEMA_VERSION };

      const result = await MigrationManager.migrate();

      expect(result.success).toBe(true);
      expect(result.fromVersion).toBe(CURRENT_SCHEMA_VERSION);
      expect(result.toVersion).toBe(CURRENT_SCHEMA_VERSION);
    });

    it('should run migration from version 0', async () => {
      mockChromeStorage.local.data = {
        tasks: [{ name: 'Test' }],
        schemaVersion: 0
      };

      const result = await MigrationManager.migrate();

      expect(result.success).toBe(true);
      expect(result.fromVersion).toBe(0);
      expect(result.toVersion).toBe(CURRENT_SCHEMA_VERSION);
    });

    it('should create backup by default', async () => {
      mockChromeStorage.local.data = { schemaVersion: 0 };

      const result = await MigrationManager.migrate();

      expect(result.backupCreated).toBe(true);
    });

    it('should skip backup if requested', async () => {
      mockChromeStorage.local.data = { schemaVersion: 0 };

      const result = await MigrationManager.migrate({ backup: false });

      expect(result.backupCreated).toBe(false);
    });

    it('should migrate tasks with proper structure', async () => {
      mockChromeStorage.local.data = {
        tasks: [{ name: 'Test Task' }],
        schemaVersion: 0
      };

      await MigrationManager.migrate();

      const data = await MigrationManager.getAllData();
      expect(data.tasks[0].id).toBeDefined();
      expect(data.tasks[0].type).toBeDefined();
      expect(data.tasks[0].createdAt).toBeDefined();
    });

    it('should create settings structure in v2', async () => {
      mockChromeStorage.local.data = {
        tasks: [],
        schemaVersion: 1
      };

      await MigrationManager.migrate();

      const data = await MigrationManager.getAllData();
      expect(data.settings).toBeDefined();
      expect(data.settings.ui).toBeDefined();
      expect(data.settings.agent).toBeDefined();
    });
  });

  describe('createBackup', () => {
    it('should create backup with version and timestamp', async () => {
      const data = { tasks: [], schemaVersion: 1 };

      await MigrationManager.createBackup(data, 1);

      // Check backup was created
      const allData = await MigrationManager.getAllData();
      const backupKeys = Object.keys(allData).filter(k => k.startsWith('backup_v1_'));
      expect(backupKeys.length).toBeGreaterThan(0);
    });

    it('should store latest backup reference', async () => {
      const data = { tasks: [], schemaVersion: 1 };

      await MigrationManager.createBackup(data, 1);

      const allData = await MigrationManager.getAllData();
      expect(allData._latestBackup).toBeDefined();
    });
  });

  describe('getBackups', () => {
    it('should return empty array if no backups', async () => {
      const backups = await MigrationManager.getBackups();
      expect(backups).toEqual([]);
    });

    it('should return backup info', async () => {
      mockChromeStorage.local.data = {
        'backup_v1_1234567890': {
          data: { tasks: [] },
          version: 1,
          timestamp: '2024-01-01T00:00:00.000Z'
        }
      };

      const backups = await MigrationManager.getBackups();

      expect(backups.length).toBe(1);
      expect(backups[0].version).toBe(1);
      expect(backups[0].key).toBe('backup_v1_1234567890');
    });

    it('should sort backups by timestamp descending', async () => {
      mockChromeStorage.local.data = {
        'backup_v1_1111111111': {
          data: {},
          version: 1,
          timestamp: '2024-01-01T00:00:00.000Z'
        },
        'backup_v1_2222222222': {
          data: {},
          version: 1,
          timestamp: '2024-01-02T00:00:00.000Z'
        }
      };

      const backups = await MigrationManager.getBackups();

      expect(backups[0].timestamp).toBe('2024-01-02T00:00:00.000Z');
      expect(backups[1].timestamp).toBe('2024-01-01T00:00:00.000Z');
    });
  });

  describe('cleanupBackups', () => {
    it('should keep only specified number of backups', async () => {
      mockChromeStorage.local.data = {
        'backup_v1_1': { data: {}, version: 1, timestamp: '2024-01-01' },
        'backup_v1_2': { data: {}, version: 1, timestamp: '2024-01-02' },
        'backup_v1_3': { data: {}, version: 1, timestamp: '2024-01-03' },
        'backup_v1_4': { data: {}, version: 1, timestamp: '2024-01-04' },
        'backup_v1_5': { data: {}, version: 1, timestamp: '2024-01-05' }
      };

      const deleted = await MigrationManager.cleanupBackups(2);

      expect(deleted).toBe(3);
    });

    it('should return 0 if no cleanup needed', async () => {
      mockChromeStorage.local.data = {
        'backup_v1_1': { data: {}, version: 1, timestamp: '2024-01-01' }
      };

      const deleted = await MigrationManager.cleanupBackups(3);

      expect(deleted).toBe(0);
    });
  });

  describe('restoreFromBackup', () => {
    it('should return false if no backup found', async () => {
      const result = await MigrationManager.restoreFromBackup(999);
      expect(result).toBe(false);
    });

    it('should restore from latest backup', async () => {
      mockChromeStorage.local.data = {
        'backup_v1_123': {
          data: { tasks: [{ id: 'restored' }], schemaVersion: 1 },
          version: 1,
          timestamp: '2024-01-01'
        }
      };

      const result = await MigrationManager.restoreFromBackup(1);

      expect(result).toBe(true);
      const data = await MigrationManager.getAllData();
      expect(data.tasks).toEqual([{ id: 'restored' }]);
    });
  });

  describe('validateData', () => {
    it('should validate correct data', () => {
      const data = {
        tasks: [{ id: '1', type: 'prompt', content: 'test' }],
        history: []
      };

      const result = MigrationManager.validateData(data);

      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('should detect invalid tasks array', () => {
      const data = { tasks: 'not an array' };

      const result = MigrationManager.validateData(data);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('tasks'))).toBe(true);
    });

    it('should detect missing task id', () => {
      const data = {
        tasks: [{ type: 'prompt', content: 'test' }]
      };

      const result = MigrationManager.validateData(data);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('missing id'))).toBe(true);
    });

    it('should detect invalid task type', () => {
      const data = {
        tasks: [{ id: '1', type: 'invalid', content: 'test' }]
      };

      const result = MigrationManager.validateData(data);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('invalid type'))).toBe(true);
    });

    it('should detect invalid history array', () => {
      const data = { history: 'not an array' };

      const result = MigrationManager.validateData(data);

      expect(result.valid).toBe(false);
    });
  });

  describe('repairData', () => {
    it('should repair invalid tasks', async () => {
      mockChromeStorage.local.data = {
        tasks: [
          { id: '1', name: 'Valid', type: 'prompt', content: 'test' },
          { name: 'Invalid - missing id and type' }
        ]
      };

      const result = await MigrationManager.repairData();

      expect(result.success).toBe(true);
      expect(result.repairs.length).toBeGreaterThan(0);
    });

    it('should repair history without timestamp', async () => {
      mockChromeStorage.local.data = {
        history: [
          { timestamp: '2024-01-01' },
          { noTimestamp: true }
        ]
      };

      const result = await MigrationManager.repairData();

      expect(result.success).toBe(true);
    });

    it('should return success if no repairs needed', async () => {
      mockChromeStorage.local.data = {
        tasks: [{ id: '1', type: 'prompt', content: 'test' }],
        history: []
      };

      const result = await MigrationManager.repairData();

      expect(result.success).toBe(true);
      expect(result.repairs.length).toBe(0);
    });
  });
});

describe('initMigration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChromeStorage.local.data = {};
  });

  it('should run migration if needed', async () => {
    mockChromeStorage.local.data = { schemaVersion: 0 };

    const result = await initMigration();

    expect(result.success).toBe(true);
  });

  it('should skip migration if not needed', async () => {
    mockChromeStorage.local.data = { schemaVersion: CURRENT_SCHEMA_VERSION };

    const result = await initMigration();

    expect(result.success).toBe(true);
    expect(result.migrated).toBe(false);
  });

  it('should cleanup old backups', async () => {
    mockChromeStorage.local.data = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      'backup_v1_old': { data: {}, version: 1, timestamp: '2020-01-01' }
    };

    await initMigration();

    // Should have cleaned up old backup
  });
});
