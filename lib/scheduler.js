// lib/scheduler.js - Task scheduling and automation system

import { logger } from './logger.js';

/**
 * ScheduleType - Types of scheduling
 */
export const ScheduleType = {
  ONCE: 'once', // Run once at specific time
  RECURRING: 'recurring', // Run on schedule (cron-like)
  INTERVAL: 'interval', // Run every X minutes/hours
  ON_LOAD: 'on_load', // Run when page loads
  ON_CHANGE: 'on_change' // Run when page changes
};

/**
 * ScheduleStatus - Schedule status
 */
export const ScheduleStatus = {
  ACTIVE: 'active',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  FAILED: 'failed'
};

/**
 * TaskScheduler - Manages scheduled tasks
 */
export class TaskScheduler {
  constructor(options = {}) {
    this.options = {
      maxConcurrent: options.maxConcurrent || 3,
      checkInterval: options.checkInterval || 60000, // 1 minute
      retentionDays: options.retentionDays || 30,
      ...options
    };

    this.schedules = new Map();
    this.timers = new Map();
    this.runningTasks = new Set();
    this.isRunning = false;
    this.checkTimer = null;

    // Initialize
    this.init();
  }

  /**
   * Initialize scheduler
   */
  async init() {
    await this.loadSchedules();
    this.startCheckTimer();
    logger.info('Task scheduler initialized', {
      schedules: this.schedules.size,
      checkInterval: this.options.checkInterval
    });
  }

  /**
   * Create a new schedule
   * @param {Object} config - Schedule configuration
   * @returns {Promise<Object>}
   */
  async createSchedule(config) {
    const schedule = {
      id: this.generateId(),
      taskId: config.taskId,
      name: config.name,
      type: config.type,
      config: config.config,
      status: ScheduleStatus.ACTIVE,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastRun: null,
      nextRun: null,
      runCount: 0,
      errorCount: 0,
      metadata: config.metadata || {}
    };

    // Calculate next run time
    schedule.nextRun = this.calculateNextRun(schedule);

    // Store schedule
    this.schedules.set(schedule.id, schedule);
    await this.saveSchedules();

    // Set up timer if needed
    this.setupTimer(schedule);

    logger.info('Schedule created', { id: schedule.id, name: schedule.name, type: schedule.type });
    return schedule;
  }

  /**
   * Update schedule
   * @param {string} scheduleId - Schedule ID
   * @param {Object} updates - Updates to apply
   * @returns {Promise<Object>}
   */
  async updateSchedule(scheduleId, updates) {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    // Apply updates
    Object.assign(schedule, updates, {
      updatedAt: Date.now()
    });

    // Recalculate next run
    if (updates.config || updates.status) {
      schedule.nextRun = this.calculateNextRun(schedule);
      this.setupTimer(schedule);
    }

    await this.saveSchedules();
    logger.info('Schedule updated', { id: scheduleId });
    return schedule;
  }

  /**
   * Delete schedule
   * @param {string} scheduleId - Schedule ID
   * @returns {Promise<boolean>}
   */
  async deleteSchedule(scheduleId) {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule) {
      return false;
    }

    // Clear timer
    this.clearTimer(scheduleId);

    // Remove schedule
    this.schedules.delete(scheduleId);
    await this.saveSchedules();

    logger.info('Schedule deleted', { id: scheduleId });
    return true;
  }

  /**
   * Pause schedule
   * @param {string} scheduleId - Schedule ID
   * @returns {Promise<Object>}
   */
  async pauseSchedule(scheduleId) {
    return this.updateSchedule(scheduleId, { status: ScheduleStatus.PAUSED });
  }

  /**
   * Resume schedule
   * @param {string} scheduleId - Schedule ID
   * @returns {Promise<Object>}
   */
  async resumeSchedule(scheduleId) {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    schedule.status = ScheduleStatus.ACTIVE;
    schedule.nextRun = this.calculateNextRun(schedule);
    this.setupTimer(schedule);

    await this.saveSchedules();
    return schedule;
  }

  /**
   * Execute a scheduled task
   * @param {string} scheduleId - Schedule ID
   * @returns {Promise<void>}
   */
  async executeSchedule(scheduleId) {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule) {
      logger.error('Schedule not found for execution', { id: scheduleId });
      return;
    }

    // Check if already running
    if (this.runningTasks.has(scheduleId)) {
      logger.warn('Schedule already running', { id: scheduleId });
      return;
    }

    // Check concurrency limit
    if (this.runningTasks.size >= this.options.maxConcurrent) {
      logger.warn('Max concurrent tasks reached, skipping execution', {
        id: scheduleId,
        running: this.runningTasks.size,
        max: this.options.maxConcurrent
      });
      return;
    }

    this.runningTasks.add(scheduleId);

    try {
      logger.info('Executing scheduled task', {
        id: scheduleId,
        name: schedule.name,
        taskId: schedule.taskId
      });

      // Send message to background to execute task
      const response = await chrome.runtime.sendMessage({
        action: 'execute_task',
        taskId: schedule.taskId
      });

      // Update schedule
      schedule.lastRun = Date.now();
      schedule.runCount++;

      if (!response.success) {
        schedule.errorCount++;
      }

      // Calculate next run
      schedule.nextRun = this.calculateNextRun(schedule);

      // Check if one-time schedule completed
      if (schedule.type === ScheduleType.ONCE) {
        schedule.status = ScheduleStatus.COMPLETED;
      }

      await this.saveSchedules();

      logger.info('Scheduled task executed', {
        id: scheduleId,
        success: response.success,
        runCount: schedule.runCount
      });
    } catch (error) {
      schedule.errorCount++;
      schedule.lastRun = Date.now();
      await this.saveSchedules();

      logger.error('Scheduled task execution failed', {
        id: scheduleId,
        error: error.message
      });
    } finally {
      this.runningTasks.delete(scheduleId);
      this.setupTimer(schedule);
    }
  }

  /**
   * Calculate next run time
   * @param {Object} schedule - Schedule object
   * @returns {number|null}
   */
  calculateNextRun(schedule) {
    if (schedule.status !== ScheduleStatus.ACTIVE) {
      return null;
    }

    const now = Date.now();

    switch (schedule.type) {
      case ScheduleType.ONCE:
        return schedule.config.runAt || null;

      case ScheduleType.INTERVAL: {
        const intervalMs = this.parseInterval(schedule.config.interval);
        if (!intervalMs) return null;

        const lastRun = schedule.lastRun || now;
        return lastRun + intervalMs;
      }

      case ScheduleType.RECURRING:
        return this.calculateNextCronRun(schedule.config.cron);

      case ScheduleType.ON_LOAD:
      case ScheduleType.ON_CHANGE:
        // These are event-based, not time-based
        return null;

      default:
        return null;
    }
  }

  /**
   * Parse interval string to milliseconds
   * @param {string} interval - Interval string (e.g., "5m", "1h", "1d")
   * @returns {number|null}
   */
  parseInterval(interval) {
    if (!interval || typeof interval !== 'string') return null;

    const match = interval.match(/^(\d+)([mhd])$/);
    if (!match) return null;

    const value = parseInt(match[1]);
    const unit = match[2];

    const multipliers = {
      m: 60 * 1000, // minutes
      h: 60 * 60 * 1000, // hours
      d: 24 * 60 * 60 * 1000 // days
    };

    return value * multipliers[unit];
  }

  /**
   * Calculate next cron run time (simplified)
   * @param {string} cron - Cron expression
   * @returns {number|null}
   */
  calculateNextCronRun(cron) {
    // Simplified cron parsing - only supports basic patterns
    // Format: "*/5 * * * *" (every 5 minutes)
    if (!cron) return null;

    const parts = cron.split(' ');
    if (parts.length !== 5) return null;

    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

    // Handle simple interval patterns like "*/5 * * * *"
    if (
      minute.startsWith('*/') &&
      hour === '*' &&
      dayOfMonth === '*' &&
      month === '*' &&
      dayOfWeek === '*'
    ) {
      const interval = parseInt(minute.substring(2));
      if (isNaN(interval)) return null;

      const now = new Date();
      const currentMinute = now.getMinutes();
      const nextMinute = Math.ceil(currentMinute / interval) * interval;

      now.setMinutes(nextMinute, 0, 0);
      if (nextMinute >= 60) {
        now.setHours(now.getHours() + 1);
        now.setMinutes(0, 0, 0);
      }

      return now.getTime();
    }

    // For more complex cron patterns, you'd need a cron parser library
    return null;
  }

  /**
   * Setup timer for schedule
   * @param {Object} schedule - Schedule object
   */
  setupTimer(schedule) {
    this.clearTimer(schedule.id);

    if (!schedule.nextRun || schedule.status !== ScheduleStatus.ACTIVE) {
      return;
    }

    const delay = schedule.nextRun - Date.now();
    if (delay <= 0) {
      // Execute immediately if time has passed
      this.executeSchedule(schedule.id);
      return;
    }

    const timerId = setTimeout(() => {
      this.executeSchedule(schedule.id);
    }, delay);

    this.timers.set(schedule.id, timerId);

    logger.debug('Timer set for schedule', {
      id: schedule.id,
      nextRun: new Date(schedule.nextRun).toISOString(),
      delay: Math.round(delay / 1000) + 's'
    });
  }

  /**
   * Clear timer for schedule
   * @param {string} scheduleId - Schedule ID
   */
  clearTimer(scheduleId) {
    const timerId = this.timers.get(scheduleId);
    if (timerId) {
      clearTimeout(timerId);
      this.timers.delete(scheduleId);
    }
  }

  /**
   * Start periodic check timer
   */
  startCheckTimer() {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
    }

    this.checkTimer = setInterval(() => {
      this.checkSchedules();
    }, this.options.checkInterval);

    this.isRunning = true;
  }

  /**
   * Stop scheduler
   */
  stop() {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }

    // Clear all timers
    for (const scheduleId of this.timers.keys()) {
      this.clearTimer(scheduleId);
    }

    this.isRunning = false;
    logger.info('Task scheduler stopped');
  }

  /**
   * Check schedules for due executions
   */
  checkSchedules() {
    const now = Date.now();

    for (const [id, schedule] of this.schedules) {
      if (schedule.status !== ScheduleStatus.ACTIVE) continue;
      if (!schedule.nextRun) continue;

      if (schedule.nextRun <= now) {
        this.executeSchedule(id);
      }
    }
  }

  /**
   * Load schedules from storage
   */
  async loadSchedules() {
    try {
      const result = await chrome.storage.local.get('schedules');
      const schedules = result.schedules || [];

      for (const schedule of schedules) {
        // Filter out old completed schedules
        if (schedule.status === ScheduleStatus.COMPLETED) {
          const age = Date.now() - schedule.lastRun;
          const maxAge = this.options.retentionDays * 24 * 60 * 60 * 1000;
          if (age > maxAge) continue;
        }

        this.schedules.set(schedule.id, schedule);

        // Restart timers for active schedules
        if (schedule.status === ScheduleStatus.ACTIVE) {
          this.setupTimer(schedule);
        }
      }
    } catch (error) {
      logger.error('Failed to load schedules', error);
    }
  }

  /**
   * Save schedules to storage
   */
  async saveSchedules() {
    try {
      const schedules = Array.from(this.schedules.values());
      await chrome.storage.local.set({ schedules });
    } catch (error) {
      logger.error('Failed to save schedules', error);
    }
  }

  /**
   * Get all schedules
   * @param {Object} filter - Optional filter
   * @returns {Array}
   */
  getSchedules(filter = {}) {
    let schedules = Array.from(this.schedules.values());

    if (filter.taskId) {
      schedules = schedules.filter(s => s.taskId === filter.taskId);
    }

    if (filter.status) {
      schedules = schedules.filter(s => s.status === filter.status);
    }

    if (filter.type) {
      schedules = schedules.filter(s => s.type === filter.type);
    }

    return schedules.sort((a, b) => (a.nextRun || 0) - (b.nextRun || 0));
  }

  /**
   * Get schedule by ID
   * @param {string} scheduleId - Schedule ID
   * @returns {Object|null}
   */
  getSchedule(scheduleId) {
    return this.schedules.get(scheduleId) || null;
  }

  /**
   * Get scheduler statistics
   * @returns {Object}
   */
  getStats() {
    const schedules = Array.from(this.schedules.values());

    return {
      total: schedules.length,
      active: schedules.filter(s => s.status === ScheduleStatus.ACTIVE).length,
      paused: schedules.filter(s => s.status === ScheduleStatus.PAUSED).length,
      completed: schedules.filter(s => s.status === ScheduleStatus.COMPLETED).length,
      running: this.runningTasks.size,
      timers: this.timers.size
    };
  }

  /**
   * Generate unique ID
   * @returns {string}
   */
  generateId() {
    return `schedule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Export singleton
export const taskScheduler = new TaskScheduler();
