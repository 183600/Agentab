/**
 * Service Worker Lifecycle Manager
 * Manages Chrome Extension Service Worker lifecycle in Manifest V3
 *
 * Key features:
 * - Keep-alive during active tasks
 * - State persistence across wake cycles
 * - Efficient resource management
 * - Graceful shutdown handling
 */

/**
 * Lifecycle states
 */
const LifecycleState = {
  ACTIVE: 'active',
  IDLE: 'idle',
  SUSPENDED: 'suspended',
  WAKING: 'waking'
};

/**
 * Configuration
 */
const LIFECYCLE_CONFIG = {
  // Keep-alive interval (ms) - must be < 30 seconds (Chrome's idle timeout)
  keepAliveInterval: 25000,

  // Idle timeout before allowing suspension (ms)
  idleTimeout: 60000,

  // Maximum time to keep alive during task (ms) - 5 minutes
  maxKeepAliveDuration: 300000,

  // State persistence key
  stateKey: 'lifecycle_state',

  // Enable debug logging
  debug: false
};

/**
 * Task state for persistence
 */
class TaskState {
  constructor() {
    this.activeTaskId = null;
    this.taskStartTime = null;
    this.taskProgress = 0;
    this.taskData = {};
  }

  start(taskId, data = {}) {
    this.activeTaskId = taskId;
    this.taskStartTime = Date.now();
    this.taskProgress = 0;
    this.taskData = data;
  }

  update(progress, data = {}) {
    this.taskProgress = progress;
    Object.assign(this.taskData, data);
  }

  finish() {
    this.activeTaskId = null;
    this.taskStartTime = null;
    this.taskProgress = 0;
    this.taskData = {};
  }

  toJSON() {
    return {
      activeTaskId: this.activeTaskId,
      taskStartTime: this.taskStartTime,
      taskProgress: this.taskProgress,
      taskData: this.taskData
    };
  }

  static fromJSON(data) {
    const state = new TaskState();
    if (data) {
      state.activeTaskId = data.activeTaskId;
      state.taskStartTime = data.taskStartTime;
      state.taskProgress = data.taskProgress || 0;
      state.taskData = data.taskData || {};
    }
    return state;
  }
}

/**
 * Service Worker Lifecycle Manager
 */
export class ServiceWorkerLifecycle {
  constructor(config = {}) {
    this.config = { ...LIFECYCLE_CONFIG, ...config };
    this.state = LifecycleState.IDLE;
    this.taskState = new TaskState();
    this.keepAliveTimer = null;
    this.idleTimer = null;
    this.lastActivityTime = Date.now();
    this.listeners = new Map();
    this.persistedState = null;
    this.initialized = false;
  }

  /**
   * Initialize lifecycle manager
   */
  async init() {
    if (this.initialized) return;

    // Load persisted state
    await this.loadState();

    // Set up Chrome alarms for reliable wake-up
    this.setupAlarms();

    // Set up event listeners
    this.setupEventListeners();

    this.initialized = true;
    this.state = LifecycleState.ACTIVE;

    if (this.config.debug) {
      console.log('[Lifecycle] Initialized, state:', this.state);
    }

    // Resume any interrupted task
    if (this.taskState.activeTaskId) {
      this.emit('task_resume', this.taskState.toJSON());
    }
  }

  /**
   * Load persisted state from storage
   */
  async loadState() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        const result = await chrome.storage.local.get(this.config.stateKey);
        if (result[this.config.stateKey]) {
          this.persistedState = result[this.config.stateKey];
          this.taskState = TaskState.fromJSON(this.persistedState.taskState);

          if (this.config.debug) {
            console.log('[Lifecycle] Loaded persisted state:', this.persistedState);
          }
        }
      }
    } catch (e) {
      console.warn('[Lifecycle] Failed to load state:', e);
    }
  }

  /**
   * Save state to storage
   */
  async saveState() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        await chrome.storage.local.set({
          [this.config.stateKey]: {
            taskState: this.taskState.toJSON(),
            lastSaveTime: Date.now(),
            state: this.state
          }
        });
      }
    } catch (e) {
      console.warn('[Lifecycle] Failed to save state:', e);
    }
  }

  /**
   * Set up Chrome alarms for reliable timing
   */
  setupAlarms() {
    if (typeof chrome === 'undefined' || !chrome.alarms) return;

    // Create keep-alive alarm
    chrome.alarms.create('lifecycle-keepalive', {
      periodInMinutes: Math.floor(this.config.keepAliveInterval / 60000)
    });

    // Alarm listener
    chrome.alarms.onAlarm.addListener(alarm => {
      if (alarm.name === 'lifecycle-keepalive') {
        this.handleKeepAlive();
      }
    });
  }

  /**
   * Set up Chrome event listeners
   */
  setupEventListeners() {
    if (typeof chrome === 'undefined') return;

    // Track tab updates
    chrome.tabs?.onUpdated?.addListener((tabId, changeInfo) => {
      if (changeInfo.status === 'complete') {
        this.recordActivity();
      }
    });

    // Track tab removal
    chrome.tabs?.onRemoved?.addListener(tabId => {
      this.recordActivity();
    });

    // Track window focus
    chrome.windows?.onFocusChanged?.addListener(windowId => {
      if (windowId !== chrome.windows.WINDOW_ID_NONE) {
        this.recordActivity();
      }
    });
  }

  /**
   * Handle keep-alive alarm
   */
  handleKeepAlive() {
    const now = Date.now();
    const taskDuration = this.taskState.taskStartTime
      ? now - this.taskState.taskStartTime
      : 0;

    // Check if we should stop keep-alive
    if (
      this.taskState.activeTaskId &&
      taskDuration > this.config.maxKeepAliveDuration
    ) {
      if (this.config.debug) {
        console.log('[Lifecycle] Max keep-alive duration reached');
      }
      this.emit('max_duration', { taskId: this.taskState.activeTaskId });
      return;
    }

    // Keep service worker alive
    if (this.state === LifecycleState.ACTIVE && this.taskState.activeTaskId) {
      // Ping Chrome API to prevent suspension
      chrome.runtime.getPlatformInfo(() => {});

      // Save state periodically during active task
      this.saveState();

      if (this.config.debug) {
        console.log('[Lifecycle] Keep-alive ping, task:', this.taskState.activeTaskId);
      }
    }
  }

  /**
   * Start a task
   */
  async startTask(taskId, data = {}) {
    this.taskState.start(taskId, data);
    this.state = LifecycleState.ACTIVE;
    this.lastActivityTime = Date.now();

    await this.saveState();

    if (this.config.debug) {
      console.log('[Lifecycle] Started task:', taskId);
    }

    this.emit('task_start', { taskId, data });
  }

  /**
   * Update task progress
   */
  async updateTask(progress, data = {}) {
    this.taskState.update(progress, data);
    this.lastActivityTime = Date.now();

    // Save state every 10% progress
    if (Math.floor(progress / 10) > Math.floor(this.taskState.taskProgress / 10)) {
      await this.saveState();
    }
  }

  /**
   * Finish current task
   */
  async finishTask(result = {}) {
    const taskId = this.taskState.activeTaskId;

    this.taskState.finish();
    this.lastActivityTime = Date.now();

    await this.saveState();

    if (this.config.debug) {
      console.log('[Lifecycle] Finished task:', taskId);
    }

    this.emit('task_finish', { taskId, result });

    // Start idle timer
    this.startIdleTimer();
  }

  /**
   * Record user activity
   */
  recordActivity() {
    this.lastActivityTime = Date.now();
    this.state = LifecycleState.ACTIVE;

    // Clear idle timer
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  /**
   * Start idle timer
   */
  startIdleTimer() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }

    this.idleTimer = setTimeout(() => {
      if (!this.taskState.activeTaskId) {
        this.state = LifecycleState.IDLE;
        this.emit('idle');

        if (this.config.debug) {
          console.log('[Lifecycle] Entered idle state');
        }
      }
    }, this.config.idleTimeout);
  }

  /**
   * Force wake-up
   */
  async wakeUp() {
    this.state = LifecycleState.WAKING;

    // Perform wake-up tasks
    await this.loadState();

    this.state = LifecycleState.ACTIVE;
    this.lastActivityTime = Date.now();

    if (this.config.debug) {
      console.log('[Lifecycle] Woke up');
    }

    this.emit('wake');
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      state: this.state,
      activeTask: this.taskState.activeTaskId,
      taskProgress: this.taskState.taskProgress,
      taskDuration: this.taskState.taskStartTime
        ? Date.now() - this.taskState.taskStartTime
        : 0,
      lastActivityTime: this.lastActivityTime,
      idleTime: Date.now() - this.lastActivityTime
    };
  }

  /**
   * Check if there's an active task
   */
  hasActiveTask() {
    return !!this.taskState.activeTaskId;
  }

  /**
   * Get active task info
   */
  getActiveTask() {
    if (!this.taskState.activeTaskId) return null;

    return {
      id: this.taskState.activeTaskId,
      progress: this.taskState.taskProgress,
      data: this.taskState.taskData,
      startTime: this.taskState.taskStartTime,
      duration: Date.now() - this.taskState.taskStartTime
    };
  }

  /**
   * Event emitter methods
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      const callbacks = this.listeners.get(event);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      for (const callback of this.listeners.get(event)) {
        callback(data);
      }
    }
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }

    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }

    if (typeof chrome !== 'undefined' && chrome.alarms) {
      chrome.alarms.clear('lifecycle-keepalive');
    }

    this.listeners.clear();
    this.initialized = false;

    if (this.config.debug) {
      console.log('[Lifecycle] Cleaned up');
    }
  }
}

// Global instance
let globalLifecycle = null;

/**
 * Get global lifecycle manager
 */
export function getLifecycle() {
  if (!globalLifecycle) {
    globalLifecycle = new ServiceWorkerLifecycle();
    globalLifecycle.init();
  }
  return globalLifecycle;
}

/**
 * Initialize lifecycle with options
 */
export function initLifecycle(options = {}) {
  globalLifecycle = new ServiceWorkerLifecycle(options);
  globalLifecycle.init();
  return globalLifecycle;
}

// Export constants
export { LifecycleState, LIFECYCLE_CONFIG };
