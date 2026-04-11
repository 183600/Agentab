/**
 * Task Scheduler Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  TaskScheduler,
  taskScheduler,
  ScheduleType,
  ScheduleStatus,
  IntervalOptions
} from '../lib/task-scheduler.js';

// Mock Chrome APIs
const mockAlarms = {
  alarms: new Map(),
  listeners: [],
  create: vi.fn((name, options) => {
    mockAlarms.alarms.set(name, options);
    return Promise.resolve();
  }),
  clear: vi.fn(name => {
    mockAlarms.alarms.delete(name);
    return Promise.resolve(true);
  }),
  get: vi.fn(name => {
    return Promise.resolve(mockAlarms.alarms.get(name));
  }),
  getAll: vi.fn(() => {
    return Promise.resolve(Array.from(mockAlarms.alarms.entries()));
  }),
  onAlarm: {
    addListener: vi.fn(callback => {
      mockAlarms.listeners.push(callback);
    }),
    removeListener: vi.fn(callback => {
      const index = mockAlarms.listeners.indexOf(callback);
      if (index > -1) mockAlarms.listeners.splice(index, 1);
    }),
    hasListener: vi.fn(callback => {
      return mockAlarms.listeners.includes(callback);
    })
  }
};

const mockStorage = {
  data: {},
  local: {
    get: vi.fn(keys => {
      if (typeof keys === 'string') {
        return Promise.resolve({ [keys]: mockStorage.data[keys] });
      }
      const result = {};
      for (const key of keys || Object.keys(mockStorage.data)) {
        if (mockStorage.data[key] !== undefined) {
          result[key] = mockStorage.data[key];
        }
      }
      return Promise.resolve(result);
    }),
    set: vi.fn(items => {
      Object.assign(mockStorage.data, items);
      return Promise.resolve();
    }),
    remove: vi.fn(keys => {
      const keysArray = Array.isArray(keys) ? keys : [keys];
      for (const key of keysArray) {
        delete mockStorage.data[key];
      }
      return Promise.resolve();
    })
  }
};

const mockRuntime = {
  sendMessage: vi.fn((message, callback) => {
    callback({ success: true });
  }),
  onMessage: {
    addListener: vi.fn(),
    removeListener: vi.fn()
  }
};

const mockTabs = {
  query: vi.fn(() => Promise.resolve([{ id: 1, url: 'https://example.com' }])),
  get: vi.fn(id => Promise.resolve({ id, url: 'https://example.com' }))
};

// Setup mocks
beforeEach(() => {
  global.chrome = {
    alarms: mockAlarms,
    storage: mockStorage,
    runtime: mockRuntime,
    tabs: mockTabs
  };

  mockAlarms.alarms.clear();
  mockAlarms.listeners.length = 0;
  mockStorage.data = {};

  vi.clearAllMocks();
});

describe('TaskScheduler', () => {
  describe('ScheduleType', () => {
    it('should define all schedule types', () => {
      expect(ScheduleType.ONCE).toBe('once');
      expect(ScheduleType.INTERVAL).toBe('interval');
      expect(ScheduleType.DAILY).toBe('daily');
      expect(ScheduleType.WEEKLY).toBe('weekly');
      expect(ScheduleType.ON_PAGE_LOAD).toBe('on_page_load');
    });
  });

  describe('ScheduleStatus', () => {
    it('should define all statuses', () => {
      expect(ScheduleStatus.ACTIVE).toBe('active');
      expect(ScheduleStatus.PAUSED).toBe('paused');
      expect(ScheduleStatus.COMPLETED).toBe('completed');
      expect(ScheduleStatus.FAILED).toBe('failed');
    });
  });

  describe('IntervalOptions', () => {
    it('should define common intervals', () => {
      expect(IntervalOptions.MINUTE_1).toBe(1);
      expect(IntervalOptions.MINUTES_5).toBe(5);
      expect(IntervalOptions.MINUTES_15).toBe(15);
      expect(IntervalOptions.MINUTES_30).toBe(30);
      expect(IntervalOptions.HOUR_1).toBe(60);
      expect(IntervalOptions.HOUR_24).toBe(1440);
    });
  });

  describe('constructor', () => {
    it('should create scheduler instance', () => {
      const scheduler = new TaskScheduler();
      expect(scheduler).toBeDefined();
      expect(scheduler.schedules).toBeInstanceOf(Map);
      expect(scheduler.initialized).toBe(false);
    });
  });

  describe('initialize', () => {
    it('should initialize scheduler', async () => {
      const scheduler = new TaskScheduler();
      await scheduler.initialize();

      expect(scheduler.initialized).toBe(true);
      expect(mockAlarms.onAlarm.addListener).toHaveBeenCalled();
    });

    it('should not reinitialize if already initialized', async () => {
      const scheduler = new TaskScheduler();
      await scheduler.initialize();
      await scheduler.initialize();

      expect(mockAlarms.onAlarm.addListener).toHaveBeenCalledTimes(1);
    });

    it('should load existing schedules from storage', async () => {
      const existingSchedules = [
        {
          id: 'sched_1',
          taskId: 'task_1',
          type: ScheduleType.INTERVAL,
          status: ScheduleStatus.ACTIVE,
          config: { interval: 5 }
        }
      ];

      mockStorage.data.scheduled_tasks = existingSchedules;

      const scheduler = new TaskScheduler();
      await scheduler.initialize();

      expect(scheduler.schedules.size).toBe(1);
      expect(scheduler.schedules.get('sched_1')).toEqual(existingSchedules[0]);
    });
  });

  describe('createSchedule', () => {
    let scheduler;

    beforeEach(async () => {
      scheduler = new TaskScheduler();
      await scheduler.initialize();

      // Mock task exists
      mockStorage.data.tasks = [
        { id: 'task_1', name: 'Test Task', type: 'prompt', content: 'test' }
      ];
    });

    it('should create interval schedule', async () => {
      const schedule = await scheduler.createSchedule('task_1', ScheduleType.INTERVAL, {
        interval: 5
      });

      expect(schedule).toBeDefined();
      expect(schedule.taskId).toBe('task_1');
      expect(schedule.type).toBe(ScheduleType.INTERVAL);
      expect(schedule.status).toBe(ScheduleStatus.ACTIVE);
      expect(schedule.config.interval).toBe(5);
      expect(mockAlarms.create).toHaveBeenCalled();
    });

    it('should create daily schedule', async () => {
      const schedule = await scheduler.createSchedule('task_1', ScheduleType.DAILY, {
        time: '09:30'
      });

      expect(schedule).toBeDefined();
      expect(schedule.type).toBe(ScheduleType.DAILY);
      expect(schedule.config.time).toBe('09:30');
    });

    it('should create weekly schedule', async () => {
      const schedule = await scheduler.createSchedule('task_1', ScheduleType.WEEKLY, {
        days: [1, 3, 5], // Mon, Wed, Fri
        time: '10:00'
      });

      expect(schedule).toBeDefined();
      expect(schedule.type).toBe(ScheduleType.WEEKLY);
      expect(schedule.config.days).toEqual([1, 3, 5]);
    });

    it('should create page load schedule', async () => {
      const schedule = await scheduler.createSchedule('task_1', ScheduleType.ON_PAGE_LOAD, {
        urlPattern: 'https://example.com/*'
      });

      expect(schedule).toBeDefined();
      expect(schedule.type).toBe(ScheduleType.ON_PAGE_LOAD);
      expect(schedule.config.urlPattern).toBe('https://example.com/*');
    });

    it('should throw for invalid schedule type', async () => {
      await expect(scheduler.createSchedule('task_1', 'invalid', {})).rejects.toThrow();
    });

    it('should throw for invalid interval', async () => {
      await expect(
        scheduler.createSchedule('task_1', ScheduleType.INTERVAL, { interval: 0 })
      ).rejects.toThrow();
    });

    it('should throw for invalid time format', async () => {
      await expect(
        scheduler.createSchedule('task_1', ScheduleType.DAILY, { time: '9:30' })
      ).rejects.toThrow();
    });

    it('should throw for missing task', async () => {
      await expect(
        scheduler.createSchedule('nonexistent', ScheduleType.INTERVAL, { interval: 5 })
      ).rejects.toThrow('Task not found');
    });
  });

  describe('updateSchedule', () => {
    let scheduler;

    beforeEach(async () => {
      scheduler = new TaskScheduler();
      await scheduler.initialize();
      mockStorage.data.tasks = [{ id: 'task_1', name: 'Test', type: 'prompt', content: 'test' }];
    });

    it('should update schedule', async () => {
      const schedule = await scheduler.createSchedule('task_1', ScheduleType.INTERVAL, {
        interval: 5
      });

      // Ensure time difference
      await new Promise(resolve => setTimeout(resolve, 10));

      const updated = await scheduler.updateSchedule(schedule.id, {
        config: { interval: 10 }
      });

      expect(updated.config.interval).toBe(10);
      expect(updated.updatedAt).toBeGreaterThanOrEqual(schedule.updatedAt);
    });

    it('should throw for nonexistent schedule', async () => {
      await expect(scheduler.updateSchedule('nonexistent', {})).rejects.toThrow('Schedule not found');
    });
  });

  describe('pauseSchedule', () => {
    let scheduler;

    beforeEach(async () => {
      scheduler = new TaskScheduler();
      await scheduler.initialize();
      mockStorage.data.tasks = [{ id: 'task_1', name: 'Test', type: 'prompt', content: 'test' }];
    });

    it('should pause schedule', async () => {
      const schedule = await scheduler.createSchedule('task_1', ScheduleType.INTERVAL, {
        interval: 5
      });

      const paused = await scheduler.pauseSchedule(schedule.id);

      expect(paused.status).toBe(ScheduleStatus.PAUSED);
      expect(mockAlarms.clear).toHaveBeenCalled();
    });
  });

  describe('resumeSchedule', () => {
    let scheduler;

    beforeEach(async () => {
      scheduler = new TaskScheduler();
      await scheduler.initialize();
      mockStorage.data.tasks = [{ id: 'task_1', name: 'Test', type: 'prompt', content: 'test' }];
    });

    it('should resume paused schedule', async () => {
      const schedule = await scheduler.createSchedule('task_1', ScheduleType.INTERVAL, {
        interval: 5
      });

      await scheduler.pauseSchedule(schedule.id);
      const resumed = await scheduler.resumeSchedule(schedule.id);

      expect(resumed.status).toBe(ScheduleStatus.ACTIVE);
      expect(mockAlarms.create).toHaveBeenCalled();
    });
  });

  describe('deleteSchedule', () => {
    let scheduler;

    beforeEach(async () => {
      scheduler = new TaskScheduler();
      await scheduler.initialize();
      mockStorage.data.tasks = [{ id: 'task_1', name: 'Test', type: 'prompt', content: 'test' }];
    });

    it('should delete schedule', async () => {
      const schedule = await scheduler.createSchedule('task_1', ScheduleType.INTERVAL, {
        interval: 5
      });

      await scheduler.deleteSchedule(schedule.id);

      expect(scheduler.schedules.has(schedule.id)).toBe(false);
      expect(mockAlarms.clear).toHaveBeenCalled();
    });
  });

  describe('getSchedulesForTask', () => {
    let scheduler;

    beforeEach(async () => {
      scheduler = new TaskScheduler();
      await scheduler.initialize();
      mockStorage.data.tasks = [
        { id: 'task_1', name: 'Test1', type: 'prompt', content: 'test' },
        { id: 'task_2', name: 'Test2', type: 'prompt', content: 'test' }
      ];
    });

    it('should return schedules for specific task', async () => {
      await scheduler.createSchedule('task_1', ScheduleType.INTERVAL, { interval: 5 });
      await scheduler.createSchedule('task_1', ScheduleType.DAILY, { time: '10:00' });
      await scheduler.createSchedule('task_2', ScheduleType.INTERVAL, { interval: 10 });

      const schedules = scheduler.getSchedulesForTask('task_1');

      expect(schedules).toHaveLength(2);
      expect(schedules.every(s => s.taskId === 'task_1')).toBe(true);
    });
  });

  describe('getUpcomingSchedules', () => {
    let scheduler;

    beforeEach(async () => {
      scheduler = new TaskScheduler();
      await scheduler.initialize();
      mockStorage.data.tasks = [{ id: 'task_1', name: 'Test', type: 'prompt', content: 'test' }];
    });

    it('should return upcoming schedules sorted by next run time', async () => {
      const schedule1 = await scheduler.createSchedule('task_1', ScheduleType.INTERVAL, {
        interval: 60
      });
      const schedule2 = await scheduler.createSchedule('task_1', ScheduleType.INTERVAL, {
        interval: 30
      });

      // Manually set nextRunAt to ensure order
      schedule1.nextRunAt = Date.now() + 60 * 60 * 1000;
      schedule2.nextRunAt = Date.now() + 30 * 60 * 1000;
      scheduler.schedules.set(schedule1.id, schedule1);
      scheduler.schedules.set(schedule2.id, schedule2);

      const upcoming = scheduler.getUpcomingSchedules();

      expect(upcoming.length).toBeGreaterThanOrEqual(2);
      // Should be sorted by nextRunAt
      for (let i = 1; i < upcoming.length; i++) {
        expect(upcoming[i].nextRunAt).toBeGreaterThanOrEqual(upcoming[i - 1].nextRunAt);
      }
    });
  });

  describe('getStats', () => {
    let scheduler;

    beforeEach(async () => {
      scheduler = new TaskScheduler();
      await scheduler.initialize();
      mockStorage.data.tasks = [{ id: 'task_1', name: 'Test', type: 'prompt', content: 'test' }];
    });

    it('should return schedule statistics', async () => {
      await scheduler.createSchedule('task_1', ScheduleType.INTERVAL, { interval: 5 });
      const schedule = await scheduler.createSchedule('task_1', ScheduleType.INTERVAL, { interval: 10 });
      await scheduler.pauseSchedule(schedule.id);

      const stats = scheduler.getStats();

      expect(stats.total).toBe(2);
      expect(stats.active).toBe(1);
      expect(stats.paused).toBe(1);
    });
  });

  describe('matchesUrlPattern', () => {
    let scheduler;

    beforeEach(async () => {
      scheduler = new TaskScheduler();
    });

    it('should match glob pattern', () => {
      expect(scheduler.matchesUrlPattern('https://example.com/page', 'https://example.com/*')).toBe(
        true
      );
      expect(scheduler.matchesUrlPattern('https://other.com/page', 'https://example.com/*')).toBe(
        false
      );
    });

    it('should match regex pattern', () => {
      // Regex pattern should match the full URL
      expect(
        scheduler.matchesUrlPattern('https://example.com/users/123', '/.*\\/users\\/\\d+$/')
      ).toBe(true);
      expect(
        scheduler.matchesUrlPattern('https://example.com/users/abc', '/.*\\/users\\/\\d+$/')
      ).toBe(false);
      // Also test simpler pattern
      expect(
        scheduler.matchesUrlPattern('https://example.com/users/123', '/\\d+$/')
      ).toBe(true);
    });
  });

  describe('calculateNextRun', () => {
    let scheduler;

    beforeEach(async () => {
      scheduler = new TaskScheduler();
    });

    it('should calculate next run for interval', () => {
      const nextRun = scheduler.calculateNextRun(ScheduleType.INTERVAL, { interval: 5 });
      const expected = Date.now() + 5 * 60 * 1000;

      // Allow 100ms tolerance
      expect(Math.abs(nextRun - expected)).toBeLessThan(100);
    });

    it('should calculate next run for daily', () => {
      const now = new Date();
      const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      const nextRun = scheduler.calculateNextRun(ScheduleType.DAILY, { time });

      // Should be tomorrow at the same time
      const next = new Date(nextRun);
      expect(next.getHours()).toBe(now.getHours());
      expect(next.getMinutes()).toBe(now.getMinutes());
    });
  });
});

describe('taskScheduler singleton', () => {
  it('should export TaskScheduler instance', () => {
    expect(taskScheduler).toBeInstanceOf(TaskScheduler);
  });
});
