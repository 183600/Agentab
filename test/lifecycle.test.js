// test/lifecycle.test.js - Tests for Service Worker Lifecycle Manager

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock logger before importing any modules that use it
vi.mock('../lib/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

import { ServiceWorkerLifecycle, LifecycleState, getLifecycle } from '../lib/lifecycle.js';

// Mock chrome APIs
const mockAlarms = {
  create: vi.fn(),
  onAlarm: { addListener: vi.fn() },
  clear: vi.fn()
};

const mockStorage = {
  data: {},
  local: {
    get: vi.fn(key => Promise.resolve({ [key]: mockStorage.data[key] })),
    set: vi.fn(obj => {
      Object.assign(mockStorage.data, obj);
      return Promise.resolve();
    })
  }
};

const mockRuntime = {
  getPlatformInfo: vi.fn(cb => cb && cb({ os: 'linux' }))
};

global.chrome = {
  alarms: mockAlarms,
  storage: mockStorage,
  runtime: mockRuntime,
  tabs: {
    onUpdated: { addListener: vi.fn() },
    onRemoved: { addListener: vi.fn() }
  },
  windows: {
    onFocusChanged: { addListener: vi.fn() },
    WINDOW_ID_NONE: -1
  }
};

describe('ServiceWorkerLifecycle', () => {
  let lifecycle;

  beforeEach(() => {
    mockStorage.data = {};
    lifecycle = new ServiceWorkerLifecycle({ debug: false });
  });

  afterEach(() => {
    lifecycle.cleanup();
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      await lifecycle.init();
      expect(lifecycle.initialized).toBe(true);
      expect(lifecycle.state).toBe(LifecycleState.ACTIVE);
    });

    it('should not reinitialize', async () => {
      await lifecycle.init();
      await lifecycle.init();
      expect(lifecycle.initialized).toBe(true);
    });

    it('should set up alarms', async () => {
      await lifecycle.init();
      expect(mockAlarms.create).toHaveBeenCalledWith('lifecycle-keepalive', expect.any(Object));
    });
  });

  describe('task management', () => {
    beforeEach(async () => {
      await lifecycle.init();
    });

    it('should start a task', async () => {
      await lifecycle.startTask('task-1', { url: 'https://example.com' });

      expect(lifecycle.taskState.activeTaskId).toBe('task-1');
      expect(lifecycle.hasActiveTask()).toBe(true);
    });

    it('should update task progress', async () => {
      await lifecycle.startTask('task-1');
      await lifecycle.updateTask(50, { step: 'processing' });

      expect(lifecycle.taskState.taskProgress).toBe(50);
      expect(lifecycle.taskState.taskData.step).toBe('processing');
    });

    it('should finish task', async () => {
      await lifecycle.startTask('task-1');
      await lifecycle.finishTask({ success: true });

      expect(lifecycle.taskState.activeTaskId).toBeNull();
      expect(lifecycle.hasActiveTask()).toBe(false);
    });

    it('should get active task info', async () => {
      await lifecycle.startTask('task-1', { type: 'scrape' });

      const task = lifecycle.getActiveTask();

      expect(task).toBeTruthy();
      expect(task.id).toBe('task-1');
      expect(task.data.type).toBe('scrape');
    });

    it('should return null for no active task', () => {
      const task = lifecycle.getActiveTask();
      expect(task).toBeNull();
    });
  });

  describe('status', () => {
    beforeEach(async () => {
      await lifecycle.init();
    });

    it('should return status', () => {
      const status = lifecycle.getStatus();

      expect(status.state).toBe(LifecycleState.ACTIVE);
      expect(status.activeTask).toBeNull();
      expect(status.idleTime).toBeGreaterThanOrEqual(0);
    });

    it('should include task info in status', async () => {
      await lifecycle.startTask('task-1');

      const status = lifecycle.getStatus();

      expect(status.activeTask).toBe('task-1');
      expect(status.taskProgress).toBe(0);
    });
  });

  describe('activity tracking', () => {
    beforeEach(async () => {
      await lifecycle.init();
    });

    it('should record activity', () => {
      const before = lifecycle.lastActivityTime;
      lifecycle.recordActivity();
      expect(lifecycle.lastActivityTime).toBeGreaterThanOrEqual(before);
    });
  });

  describe('events', () => {
    beforeEach(async () => {
      await lifecycle.init();
    });

    it('should emit task_start event', async () => {
      const callback = vi.fn();
      lifecycle.on('task_start', callback);

      await lifecycle.startTask('task-1');

      expect(callback).toHaveBeenCalledWith({
        taskId: 'task-1',
        data: {}
      });
    });

    it('should emit task_finish event', async () => {
      const callback = vi.fn();
      lifecycle.on('task_finish', callback);

      await lifecycle.startTask('task-1');
      await lifecycle.finishTask({ success: true });

      expect(callback).toHaveBeenCalled();
    });

    it('should remove event listener', async () => {
      const callback = vi.fn();
      lifecycle.on('task_start', callback);
      lifecycle.off('task_start', callback);

      await lifecycle.startTask('task-1');

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('state persistence', () => {
    it('should save state', async () => {
      await lifecycle.init();
      await lifecycle.startTask('task-1');

      // Wait for async storage
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockStorage.local.set).toHaveBeenCalled();
    });

    it('should load persisted state', async () => {
      mockStorage.data['lifecycle_state'] = {
        taskState: {
          activeTaskId: 'persisted-task',
          taskProgress: 50,
          taskData: {}
        },
        state: 'active'
      };

      const newLifecycle = new ServiceWorkerLifecycle();
      await newLifecycle.init();

      expect(newLifecycle.taskState.activeTaskId).toBe('persisted-task');
      newLifecycle.cleanup();
    });
  });

  describe('cleanup', () => {
    it('should cleanup resources', async () => {
      await lifecycle.init();
      lifecycle.cleanup();

      expect(lifecycle.initialized).toBe(false);
      expect(lifecycle.listeners.size).toBe(0);
    });
  });
});

describe('getLifecycle', () => {
  it('should return global instance', () => {
    const l1 = getLifecycle();
    const l2 = getLifecycle();
    expect(l1).toBe(l2);
  });
});

describe('LifecycleState', () => {
  it('should have all states', () => {
    expect(LifecycleState.ACTIVE).toBe('active');
    expect(LifecycleState.IDLE).toBe('idle');
    expect(LifecycleState.SUSPENDED).toBe('suspended');
    expect(LifecycleState.WAKING).toBe('waking');
  });
});
