/**
 * Task Scheduler - Schedule tasks to run at specific times or intervals
 * Uses Chrome Alarms API for reliable background scheduling
 */

import { StorageManager } from './storage.js';
import { logger } from './logger.js';

/**
 * Schedule types
 */
export const ScheduleType = {
  ONCE: 'once', // Run once at specific time
  INTERVAL: 'interval', // Run repeatedly at interval
  DAILY: 'daily', // Run daily at specific time
  WEEKLY: 'weekly', // Run weekly on specific days
  ON_PAGE_LOAD: 'on_page_load' // Run when page loads (URL pattern match)
};

/**
 * Schedule status
 */
export const ScheduleStatus = {
  ACTIVE: 'active',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  FAILED: 'failed'
};

/**
 * Days of week
 */
export const DaysOfWeek = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6
};

/**
 * Default interval options (in minutes)
 */
export const IntervalOptions = {
  MINUTE_1: 1,
  MINUTES_5: 5,
  MINUTES_15: 15,
  MINUTES_30: 30,
  HOUR_1: 60,
  HOURS_6: 360,
  HOURS_12: 720,
  HOUR_24: 1440
};

/**
 * Task schedule definition
 * @typedef {Object} TaskSchedule
 * @property {string} id - Unique schedule ID
 * @property {string} taskId - Associated task ID
 * @property {string} type - Schedule type
 * @property {string} status - Schedule status
 * @property {Object} config - Schedule configuration
 * @property {number} createdAt - Creation timestamp
 * @property {number} updatedAt - Last update timestamp
 * @property {number} lastRunAt - Last run timestamp
 * @property {number} nextRunAt - Next scheduled run
 * @property {number} runCount - Number of times run
 * @property {Object} metadata - Additional metadata
 */

/**
 * Schedule configuration
 * @typedef {Object} ScheduleConfig
 * @property {number} [runAt] - Timestamp for ONCE type
 * @property {number} [interval] - Interval in minutes for INTERVAL type
 * @property {string} [time] - Time string (HH:MM) for DAILY type
 * @property {number[]} [days] - Days of week for WEEKLY type
 * @property {string} [urlPattern] - URL pattern for ON_PAGE_LOAD type
 * @property {number} [maxRuns] - Maximum number of runs
 * @property {boolean} [runOnMissed] - Run if schedule was missed
 */

/**
 * TaskScheduler - Manage scheduled tasks
 */
export class TaskScheduler {
  constructor() {
    this.schedules = new Map();
    this.initialized = false;
    this.ALARM_PREFIX = 'task_schedule_';
    this.STORAGE_KEY = 'scheduled_tasks';
  }

  /**
   * Initialize scheduler - load schedules and set up alarms
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // Load existing schedules from storage
      await this.loadSchedules();

      // Set up alarm listener
      chrome.alarms.onAlarm.addListener(this.handleAlarm.bind(this));

      // Re-register all active schedules
      await this.registerAllAlarms();

      this.initialized = true;
      logger.info('Task scheduler initialized', { scheduleCount: this.schedules.size });
    } catch (error) {
      logger.error('Failed to initialize task scheduler', { error: error.message });
      throw error;
    }
  }

  /**
   * Load schedules from storage
   */
  async loadSchedules() {
    try {
      const data = await chrome.storage.local.get(this.STORAGE_KEY);
      const schedules = data[this.STORAGE_KEY] || [];

      this.schedules.clear();
      for (const schedule of schedules) {
        this.schedules.set(schedule.id, schedule);
      }

      logger.debug('Loaded schedules from storage', { count: schedules.length });
    } catch (error) {
      logger.error('Failed to load schedules', { error: error.message });
      throw error;
    }
  }

  /**
   * Save schedules to storage
   */
  async saveSchedules() {
    try {
      const schedules = Array.from(this.schedules.values());
      await chrome.storage.local.set({ [this.STORAGE_KEY]: schedules });
      logger.debug('Saved schedules to storage', { count: schedules.length });
    } catch (error) {
      logger.error('Failed to save schedules', { error: error.message });
      throw error;
    }
  }

  /**
   * Create a new schedule
   * @param {string} taskId - Task ID to schedule
   * @param {string} type - Schedule type
   * @param {ScheduleConfig} config - Schedule configuration
   * @returns {Promise<TaskSchedule>}
   */
  async createSchedule(taskId, type, config) {
    // Validate
    if (!taskId) {
      throw new Error('Task ID is required');
    }

    if (!Object.values(ScheduleType).includes(type)) {
      throw new Error(`Invalid schedule type: ${type}`);
    }

    // Verify task exists
    const tasks = await StorageManager.getTasks();
    const task = tasks.find(t => t.id === taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    // Create schedule object
    const schedule = {
      id: this.generateId(),
      taskId,
      type,
      status: ScheduleStatus.ACTIVE,
      config: this.validateConfig(type, config),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastRunAt: null,
      nextRunAt: this.calculateNextRun(type, config),
      runCount: 0,
      metadata: {
        taskName: task.name,
        taskType: task.type
      }
    };

    // Store schedule
    this.schedules.set(schedule.id, schedule);
    await this.saveSchedules();

    // Create alarm
    await this.createAlarm(schedule);

    logger.info('Schedule created', {
      scheduleId: schedule.id,
      taskId,
      type,
      nextRunAt: new Date(schedule.nextRunAt).toISOString()
    });

    return schedule;
  }

  /**
   * Validate schedule configuration
   */
  validateConfig(type, config) {
    const validated = { ...config };

    switch (type) {
      case ScheduleType.ONCE:
        if (!config.runAt || config.runAt <= Date.now()) {
          throw new Error('runAt must be a future timestamp for ONCE schedule');
        }
        break;

      case ScheduleType.INTERVAL:
        if (!config.interval || config.interval < 1) {
          throw new Error('interval must be at least 1 minute');
        }
        // Chrome alarms minimum is 1 minute
        validated.interval = Math.max(1, config.interval);
        break;

      case ScheduleType.DAILY:
        if (!config.time || !/^\d{2}:\d{2}$/.test(config.time)) {
          throw new Error('time must be in HH:MM format for DAILY schedule');
        }
        break;

      case ScheduleType.WEEKLY:
        if (!config.days || !Array.isArray(config.days) || config.days.length === 0) {
          throw new Error('days must be an array of day numbers (0-6) for WEEKLY schedule');
        }
        validated.days = config.days.filter(d => d >= 0 && d <= 6);
        if (validated.days.length === 0) {
          throw new Error('At least one valid day is required for WEEKLY schedule');
        }
        break;

      case ScheduleType.ON_PAGE_LOAD:
        if (!config.urlPattern) {
          throw new Error('urlPattern is required for ON_PAGE_LOAD schedule');
        }
        // Validate pattern is a valid regex or glob
        try {
          if (config.urlPattern.startsWith('/') && config.urlPattern.endsWith('/')) {
            // Regex pattern
            new RegExp(config.urlPattern.slice(1, -1));
          }
        } catch (e) {
          throw new Error('Invalid urlPattern regex');
        }
        break;
    }

    return validated;
  }

  /**
   * Calculate next run time
   */
  calculateNextRun(type, config) {
    const now = Date.now();

    switch (type) {
      case ScheduleType.ONCE:
        return config.runAt;

      case ScheduleType.INTERVAL:
        return now + config.interval * 60 * 1000;

      case ScheduleType.DAILY: {
        const [hours, minutes] = config.time.split(':').map(Number);
        const next = new Date();
        next.setHours(hours, minutes, 0, 0);
        if (next.getTime() <= now) {
          next.setDate(next.getDate() + 1);
        }
        return next.getTime();
      }

      case ScheduleType.WEEKLY: {
        const [hours, minutes] = (config.time || '00:00').split(':').map(Number);
        const now2 = new Date();
        let nextRun = null;

        for (const day of config.days.sort()) {
          const candidate = new Date();
          candidate.setHours(hours, minutes, 0, 0);
          candidate.setDate(candidate.getDate() + ((day - candidate.getDay() + 7) % 7));

          if (candidate.getTime() > now2) {
            if (!nextRun || candidate < nextRun) {
              nextRun = candidate;
            }
          }
        }

        if (!nextRun) {
          // All days have passed this week, pick first day next week
          const firstDay = Math.min(...config.days);
          nextRun = new Date();
          nextRun.setHours(hours, minutes, 0, 0);
          nextRun.setDate(nextRun.getDate() + ((firstDay - nextRun.getDay() + 7) % 7) + 7);
        }

        return nextRun.getTime();
      }

      case ScheduleType.ON_PAGE_LOAD:
        // No fixed next run - triggered by page load
        return null;

      default:
        return null;
    }
  }

  /**
   * Create Chrome alarm for schedule
   */
  async createAlarm(schedule) {
    const alarmName = `${this.ALARM_PREFIX}${schedule.id}`;

    switch (schedule.type) {
      case ScheduleType.ONCE:
        await chrome.alarms.create(alarmName, {
          when: schedule.nextRunAt
        });
        break;

      case ScheduleType.INTERVAL:
        await chrome.alarms.create(alarmName, {
          delayInMinutes: schedule.config.interval,
          periodInMinutes: schedule.config.interval
        });
        break;

      case ScheduleType.DAILY:
        await chrome.alarms.create(alarmName, {
          when: schedule.nextRunAt,
          periodInMinutes: 24 * 60
        });
        break;

      case ScheduleType.WEEKLY:
        await chrome.alarms.create(alarmName, {
          when: schedule.nextRunAt
        });
        break;

      case ScheduleType.ON_PAGE_LOAD:
        // No alarm needed - handled by tab events
        break;
    }

    logger.debug('Alarm created', { scheduleId: schedule.id, type: schedule.type });
  }

  /**
   * Handle alarm trigger
   */
  async handleAlarm(alarm) {
    if (!alarm.name.startsWith(this.ALARM_PREFIX)) return;

    const scheduleId = alarm.name.slice(this.ALARM_PREFIX.length);
    const schedule = this.schedules.get(scheduleId);

    if (!schedule || schedule.status !== ScheduleStatus.ACTIVE) {
      logger.warn('Alarm triggered for inactive schedule', { scheduleId });
      return;
    }

    logger.info('Executing scheduled task', {
      scheduleId,
      taskId: schedule.taskId,
      type: schedule.type
    });

    try {
      // Execute the task
      await this.executeScheduledTask(schedule);

      // Update schedule
      schedule.lastRunAt = Date.now();
      schedule.runCount++;

      // Update next run time for repeating schedules
      if (schedule.type !== ScheduleType.ONCE) {
        schedule.nextRunAt = this.calculateNextRun(schedule.type, schedule.config);

        // Recreate alarm for next run
        await this.createAlarm(schedule);
      } else {
        // One-time schedule is complete
        schedule.status = ScheduleStatus.COMPLETED;
        await chrome.alarms.clear(alarm.name);
      }

      // Check max runs
      if (schedule.config.maxRuns && schedule.runCount >= schedule.config.maxRuns) {
        schedule.status = ScheduleStatus.COMPLETED;
        await chrome.alarms.clear(alarm.name);
      }

      schedule.updatedAt = Date.now();
      this.schedules.set(scheduleId, schedule);
      await this.saveSchedules();
    } catch (error) {
      logger.error('Scheduled task execution failed', {
        scheduleId,
        taskId: schedule.taskId,
        error: error.message
      });

      schedule.status = ScheduleStatus.FAILED;
      schedule.updatedAt = Date.now();
      this.schedules.set(scheduleId, schedule);
      await this.saveSchedules();
    }
  }

  /**
   * Execute a scheduled task
   */
  async executeScheduledTask(schedule) {
    // Get the task
    const tasks = await StorageManager.getTasks();
    const task = tasks.find(t => t.id === schedule.taskId);

    if (!task) {
      throw new Error(`Task not found: ${schedule.taskId}`);
    }

    // Get active tab or create one
    let tab;
    if (schedule.config.tabId) {
      tab = await chrome.tabs.get(schedule.config.tabId).catch(() => null);
    }

    if (!tab) {
      // Get current active tab
      [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    }

    if (!tab) {
      throw new Error('No active tab to run task');
    }

    // Send message to background to execute
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          action: 'execute_task',
          taskId: task.id
        },
        response => {
          if (response?.success) {
            resolve(response);
          } else {
            reject(new Error(response?.error || 'Task execution failed'));
          }
        }
      );
    });
  }

  /**
   * Update a schedule
   */
  async updateSchedule(scheduleId, updates) {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    // Apply updates
    Object.assign(schedule, updates);
    schedule.updatedAt = Date.now();

    // Recalculate next run if config changed
    if (updates.config) {
      schedule.nextRunAt = this.calculateNextRun(schedule.type, schedule.config);
      await this.createAlarm(schedule);
    }

    this.schedules.set(scheduleId, schedule);
    await this.saveSchedules();

    logger.info('Schedule updated', { scheduleId, updates });
    return schedule;
  }

  /**
   * Pause a schedule
   */
  async pauseSchedule(scheduleId) {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    schedule.status = ScheduleStatus.PAUSED;
    schedule.updatedAt = Date.now();

    await chrome.alarms.clear(`${this.ALARM_PREFIX}${scheduleId}`);
    this.schedules.set(scheduleId, schedule);
    await this.saveSchedules();

    logger.info('Schedule paused', { scheduleId });
    return schedule;
  }

  /**
   * Resume a schedule
   */
  async resumeSchedule(scheduleId) {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    schedule.status = ScheduleStatus.ACTIVE;
    schedule.nextRunAt = this.calculateNextRun(schedule.type, schedule.config);
    schedule.updatedAt = Date.now();

    await this.createAlarm(schedule);
    this.schedules.set(scheduleId, schedule);
    await this.saveSchedules();

    logger.info('Schedule resumed', { scheduleId });
    return schedule;
  }

  /**
   * Delete a schedule
   */
  async deleteSchedule(scheduleId) {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    await chrome.alarms.clear(`${this.ALARM_PREFIX}${scheduleId}`);
    this.schedules.delete(scheduleId);
    await this.saveSchedules();

    logger.info('Schedule deleted', { scheduleId });
    return true;
  }

  /**
   * Get all schedules
   */
  getAllSchedules() {
    return Array.from(this.schedules.values());
  }

  /**
   * Get schedule by ID
   */
  getSchedule(scheduleId) {
    return this.schedules.get(scheduleId);
  }

  /**
   * Get schedules for a task
   */
  getSchedulesForTask(taskId) {
    return this.getAllSchedules().filter(s => s.taskId === taskId);
  }

  /**
   * Get upcoming schedules
   */
  getUpcomingSchedules(limit = 10) {
    const now = Date.now();
    return this.getAllSchedules()
      .filter(s => s.status === ScheduleStatus.ACTIVE && s.nextRunAt && s.nextRunAt > now)
      .sort((a, b) => a.nextRunAt - b.nextRunAt)
      .slice(0, limit);
  }

  /**
   * Register all active schedules
   */
  async registerAllAlarms() {
    for (const schedule of this.schedules.values()) {
      if (schedule.status === ScheduleStatus.ACTIVE && schedule.type !== ScheduleType.ON_PAGE_LOAD) {
        await this.createAlarm(schedule);
      }
    }
  }

  /**
   * Check URL pattern for page load schedules
   */
  matchesUrlPattern(url, pattern) {
    if (pattern.startsWith('/') && pattern.endsWith('/')) {
      // Regex pattern
      const regex = new RegExp(pattern.slice(1, -1));
      return regex.test(url);
    }
    // Glob pattern
    const globPattern = pattern.replace(/\*/g, '.*');
    const regex = new RegExp(`^${globPattern}$`);
    return regex.test(url);
  }

  /**
   * Handle page load for URL-triggered schedules
   */
  async handlePageLoad(tabId, url) {
    const schedules = this.getAllSchedules().filter(
      s => s.status === ScheduleStatus.ACTIVE && s.type === ScheduleType.ON_PAGE_LOAD
    );

    for (const schedule of schedules) {
      if (this.matchesUrlPattern(url, schedule.config.urlPattern)) {
        logger.info('Executing page-load schedule', {
          scheduleId: schedule.id,
          url,
          pattern: schedule.config.urlPattern
        });

        try {
          await this.executeScheduledTask(schedule);
          schedule.lastRunAt = Date.now();
          schedule.runCount++;
          schedule.updatedAt = Date.now();
          this.schedules.set(schedule.id, schedule);
        } catch (error) {
          logger.error('Page-load schedule execution failed', {
            scheduleId: schedule.id,
            error: error.message
          });
        }
      }
    }

    await this.saveSchedules();
  }

  /**
   * Generate unique ID
   */
  generateId() {
    return `sched_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get statistics
   */
  getStats() {
    const schedules = this.getAllSchedules();
    return {
      total: schedules.length,
      active: schedules.filter(s => s.status === ScheduleStatus.ACTIVE).length,
      paused: schedules.filter(s => s.status === ScheduleStatus.PAUSED).length,
      completed: schedules.filter(s => s.status === ScheduleStatus.COMPLETED).length,
      failed: schedules.filter(s => s.status === ScheduleStatus.FAILED).length
    };
  }
}

// Export singleton instance
export const taskScheduler = new TaskScheduler();
