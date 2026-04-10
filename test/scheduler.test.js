import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TaskScheduler, ScheduleType, ScheduleStatus, taskScheduler } from '../lib/scheduler.js';

// Mock Chrome APIs
vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn().mockResolvedValue({ schedules: [] }),
      set: vi.fn().mockResolvedValue(undefined)
    }
  },
  runtime: {
    sendMessage: vi.fn().mockResolvedValue({ success: true })
  }
});

describe('TaskScheduler', () => {
  let scheduler;

  beforeEach(() => {
    scheduler = new TaskScheduler({ checkInterval: 1000 });
    vi.clearAllMocks();
  });

  afterEach(() => {
    scheduler.stop();
  });

  describe('createSchedule()', () => {
    it('should create once schedule', async () => {
      const schedule = await scheduler.createSchedule({
        taskId: 'task-1',
        name: 'Test Schedule',
        type: ScheduleType.ONCE,
        config: {
          runAt: Date.now() + 10000
        }
      });

      expect(schedule.id).toBeDefined();
      expect(schedule.taskId).toBe('task-1');
      expect(schedule.type).toBe(ScheduleType.ONCE);
      expect(schedule.status).toBe(ScheduleStatus.ACTIVE);
      expect(schedule.nextRun).toBeDefined();
    });

    it('should create interval schedule', async () => {
      const schedule = await scheduler.createSchedule({
        taskId: 'task-1',
        name: 'Interval Schedule',
        type: ScheduleType.INTERVAL,
        config: {
          interval: '5m'
        }
      });

      expect(schedule.type).toBe(ScheduleType.INTERVAL);
      expect(schedule.nextRun).toBeDefined();
    });

    it('should store schedule', async () => {
      await scheduler.createSchedule({
        taskId: 'task-1',
        name: 'Test',
        type: ScheduleType.ONCE,
        config: { runAt: Date.now() + 10000 }
      });

      expect(chrome.storage.local.set).toHaveBeenCalled();
    });
  });

  describe('updateSchedule()', () => {
    it('should update schedule', async () => {
      const schedule = await scheduler.createSchedule({
        taskId: 'task-1',
        name: 'Test',
        type: ScheduleType.ONCE,
        config: { runAt: Date.now() + 10000 }
      });

      const updated = await scheduler.updateSchedule(schedule.id, {
        name: 'Updated Name'
      });

      expect(updated.name).toBe('Updated Name');
    });

    it('should throw for non-existent schedule', async () => {
      await expect(scheduler.updateSchedule('non-existent', { name: 'Test' })).rejects.toThrow(
        'Schedule not found'
      );
    });
  });

  describe('deleteSchedule()', () => {
    it('should delete schedule', async () => {
      const schedule = await scheduler.createSchedule({
        taskId: 'task-1',
        name: 'Test',
        type: ScheduleType.ONCE,
        config: { runAt: Date.now() + 10000 }
      });

      const deleted = await scheduler.deleteSchedule(schedule.id);
      expect(deleted).toBe(true);
      expect(scheduler.getSchedule(schedule.id)).toBeNull();
    });

    it('should return false for non-existent schedule', async () => {
      const deleted = await scheduler.deleteSchedule('non-existent');
      expect(deleted).toBe(false);
    });
  });

  describe('pauseSchedule()', () => {
    it('should pause schedule', async () => {
      const schedule = await scheduler.createSchedule({
        taskId: 'task-1',
        name: 'Test',
        type: ScheduleType.INTERVAL,
        config: { interval: '5m' }
      });

      const paused = await scheduler.pauseSchedule(schedule.id);
      expect(paused.status).toBe(ScheduleStatus.PAUSED);
      expect(paused.nextRun).toBeNull();
    });
  });

  describe('resumeSchedule()', () => {
    it('should resume paused schedule', async () => {
      const schedule = await scheduler.createSchedule({
        taskId: 'task-1',
        name: 'Test',
        type: ScheduleType.INTERVAL,
        config: { interval: '5m' }
      });

      await scheduler.pauseSchedule(schedule.id);
      const resumed = await scheduler.resumeSchedule(schedule.id);

      expect(resumed.status).toBe(ScheduleStatus.ACTIVE);
      expect(resumed.nextRun).toBeDefined();
    });
  });

  describe('parseInterval()', () => {
    it('should parse minutes', () => {
      const ms = scheduler.parseInterval('5m');
      expect(ms).toBe(5 * 60 * 1000);
    });

    it('should parse hours', () => {
      const ms = scheduler.parseInterval('2h');
      expect(ms).toBe(2 * 60 * 60 * 1000);
    });

    it('should parse days', () => {
      const ms = scheduler.parseInterval('1d');
      expect(ms).toBe(24 * 60 * 60 * 1000);
    });

    it('should return null for invalid format', () => {
      expect(scheduler.parseInterval('invalid')).toBeNull();
      expect(scheduler.parseInterval('')).toBeNull();
    });
  });

  describe('getSchedules()', () => {
    it('should get all schedules', async () => {
      await scheduler.createSchedule({
        taskId: 'task-1',
        name: 'Test 1',
        type: ScheduleType.ONCE,
        config: { runAt: Date.now() + 10000 }
      });

      await scheduler.createSchedule({
        taskId: 'task-2',
        name: 'Test 2',
        type: ScheduleType.INTERVAL,
        config: { interval: '5m' }
      });

      const schedules = scheduler.getSchedules();
      expect(schedules).toHaveLength(2);
    });

    it('should filter by taskId', async () => {
      await scheduler.createSchedule({
        taskId: 'task-1',
        name: 'Test 1',
        type: ScheduleType.ONCE,
        config: { runAt: Date.now() + 10000 }
      });

      await scheduler.createSchedule({
        taskId: 'task-2',
        name: 'Test 2',
        type: ScheduleType.ONCE,
        config: { runAt: Date.now() + 10000 }
      });

      const filtered = scheduler.getSchedules({ taskId: 'task-1' });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].taskId).toBe('task-1');
    });

    it('should filter by status', async () => {
      const schedule = await scheduler.createSchedule({
        taskId: 'task-1',
        name: 'Test',
        type: ScheduleType.ONCE,
        config: { runAt: Date.now() + 10000 }
      });

      await scheduler.pauseSchedule(schedule.id);

      const active = scheduler.getSchedules({ status: ScheduleStatus.ACTIVE });
      const paused = scheduler.getSchedules({ status: ScheduleStatus.PAUSED });

      expect(active).toHaveLength(0);
      expect(paused).toHaveLength(1);
    });
  });

  describe('getStats()', () => {
    it('should return scheduler statistics', async () => {
      await scheduler.createSchedule({
        taskId: 'task-1',
        name: 'Test 1',
        type: ScheduleType.ONCE,
        config: { runAt: Date.now() + 10000 }
      });

      await scheduler.createSchedule({
        taskId: 'task-2',
        name: 'Test 2',
        type: ScheduleType.INTERVAL,
        config: { interval: '5m' }
      });

      const stats = scheduler.getStats();
      expect(stats.total).toBe(2);
      expect(stats.active).toBe(2);
      expect(stats.paused).toBe(0);
    });
  });

  describe('stop()', () => {
    it('should stop scheduler', () => {
      scheduler.stop();
      expect(scheduler.isRunning).toBe(false);
    });

    it('should clear all timers', async () => {
      await scheduler.createSchedule({
        taskId: 'task-1',
        name: 'Test',
        type: ScheduleType.INTERVAL,
        config: { interval: '5m' }
      });

      scheduler.stop();
      expect(scheduler.timers.size).toBe(0);
    });
  });
});

describe('ScheduleType', () => {
  it('should have all types', () => {
    expect(ScheduleType.ONCE).toBeDefined();
    expect(ScheduleType.RECURRING).toBeDefined();
    expect(ScheduleType.INTERVAL).toBeDefined();
    expect(ScheduleType.ON_LOAD).toBeDefined();
    expect(ScheduleType.ON_CHANGE).toBeDefined();
  });
});

describe('ScheduleStatus', () => {
  it('should have all statuses', () => {
    expect(ScheduleStatus.ACTIVE).toBeDefined();
    expect(ScheduleStatus.PAUSED).toBeDefined();
    expect(ScheduleStatus.COMPLETED).toBeDefined();
    expect(ScheduleStatus.FAILED).toBeDefined();
  });
});
