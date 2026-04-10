/**
 * Multi-Tab Task Coordinator
 * Enables task execution across multiple browser tabs with synchronization
 */

import { logger } from './logger.js';

/**
 * Task execution status
 */
export const TaskStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};

/**
 * Tab connection status
 */
export const TabConnectionStatus = {
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  ERROR: 'error'
};

/**
 * MultiTabCoordinator - Coordinates tasks across multiple tabs
 */
export class MultiTabCoordinator {
  /**
   * @param {Object} options
   * @param {number} [options.maxConcurrentTabs] - Maximum tabs to execute concurrently
   * @param {number} [options.taskTimeout] - Timeout for task execution per tab
   * @param {Function} [options.onProgress] - Progress callback
   * @param {Function} [options.onComplete] - Completion callback
   */
  constructor(options = {}) {
    this.options = {
      maxConcurrentTabs: 5,
      taskTimeout: 60000, // 1 minute
      ...options
    };

    this.activeTasks = new Map();
    this.tabConnections = new Map();
    this.taskQueue = [];
    this.isRunning = false;
  }

  /**
   * Get all tabs
   * @returns {Promise<Array>}
   */
  async getAllTabs() {
    if (typeof chrome === 'undefined' || !chrome.tabs) {
      return [];
    }

    const tabs = await chrome.tabs.query({});
    return tabs.filter(tab => this.isValidTab(tab));
  }

  /**
   * Check if tab is valid for execution
   * @param {Object} tab
   * @returns {boolean}
   */
  isValidTab(tab) {
    if (!tab.id || !tab.url) return false;

    // Skip restricted pages
    const restrictedProtocols = ['chrome:', 'chrome-extension:', 'about:', 'edge:', 'brave:', 'file:'];
    return !restrictedProtocols.some(proto => tab.url.startsWith(proto));
  }

  /**
   * Execute task on multiple tabs
   * @param {Object} task
   * @param {number[]} task.tabIds - Tab IDs to execute on (or 'all' for all tabs)
   * @param {string} task.type - 'prompt' or 'code'
   * @param {string} task.content - Task content
   * @param {Object} [task.options] - Execution options
   * @returns {Promise<Object>}
   */
  async executeOnTabs(task) {
    const taskId = `multi_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const execution = {
      id: taskId,
      task,
      status: TaskStatus.PENDING,
      startTime: Date.now(),
      tabs: {},
      results: [],
      errors: []
    };

    this.activeTasks.set(taskId, execution);

    try {
      // Get target tabs
      let targetTabs = [];
      if (task.tabIds === 'all') {
        targetTabs = await this.getAllTabs();
      } else if (Array.isArray(task.tabIds)) {
        const allTabs = await this.getAllTabs();
        targetTabs = allTabs.filter(tab => task.tabIds.includes(tab.id));
      }

      if (targetTabs.length === 0) {
        throw new Error('No valid tabs to execute on');
      }

      logger.info('Starting multi-tab execution', {
        taskId,
        tabCount: targetTabs.length
      });

      execution.status = TaskStatus.RUNNING;
      this.isRunning = true;

      // Initialize tab states
      for (const tab of targetTabs) {
        execution.tabs[tab.id] = {
          id: tab.id,
          url: tab.url,
          title: tab.title,
          status: TaskStatus.PENDING
        };
      }

      // Execute in batches
      const results = await this.executeInBatches(taskId, targetTabs, task);

      execution.status = TaskStatus.COMPLETED;
      execution.results = results;
      execution.endTime = Date.now();
      execution.duration = execution.endTime - execution.startTime;

      logger.info('Multi-tab execution completed', {
        taskId,
        successCount: results.filter(r => r.success).length,
        errorCount: results.filter(r => !r.success).length,
        duration: execution.duration
      });

      if (this.options.onComplete) {
        this.options.onComplete(execution);
      }

      return execution;
    } catch (error) {
      execution.status = TaskStatus.FAILED;
      execution.errors.push({
        message: error.message,
        stack: error.stack
      });

      logger.error('Multi-tab execution failed', { taskId, error: error.message });
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Execute task in batches
   */
  async executeInBatches(taskId, tabs, task) {
    const results = [];
    const batchSize = this.options.maxConcurrentTabs;

    for (let i = 0; i < tabs.length; i += batchSize) {
      const batch = tabs.slice(i, i + batchSize);

      // Execute batch in parallel
      const batchResults = await Promise.allSettled(
        batch.map(tab => this.executeOnTab(taskId, tab, task))
      );

      // Collect results
      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        const tab = batch[j];

        if (result.status === 'fulfilled') {
          results.push({
            tabId: tab.id,
            url: tab.url,
            success: true,
            data: result.value
          });
        } else {
          results.push({
            tabId: tab.id,
            url: tab.url,
            success: false,
            error: result.reason?.message || 'Unknown error'
          });

          // Update tab status
          const execution = this.activeTasks.get(taskId);
          if (execution && execution.tabs[tab.id]) {
            execution.tabs[tab.id].status = TaskStatus.FAILED;
            execution.tabs[tab.id].error = result.reason?.message;
          }
        }

        // Notify progress
        if (this.options.onProgress) {
          this.options.onProgress({
            taskId,
            completed: results.length,
            total: tabs.length,
            currentTab: tab
          });
        }
      }
    }

    return results;
  }

  /**
   * Execute task on a single tab
   */
  async executeOnTab(taskId, tab, task) {
    const execution = this.activeTasks.get(taskId);
    if (!execution) {
      throw new Error('Task execution not found');
    }

    // Update tab status
    execution.tabs[tab.id].status = TaskStatus.RUNNING;

    // Create timeout promise
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Task timeout')), this.options.taskTimeout);
    });

    try {
      // Execute based on task type
      const executePromise = task.type === 'code' 
        ? this.executeCode(tab.id, task.content)
        : this.executePrompt(tab.id, task.content);

      const result = await Promise.race([executePromise, timeoutPromise]);

      // Update tab status
      execution.tabs[tab.id].status = TaskStatus.COMPLETED;

      return result;
    } catch (error) {
      execution.tabs[tab.id].status = TaskStatus.FAILED;
      execution.tabs[tab.id].error = error.message;
      throw error;
    }
  }

  /**
   * Execute code on tab
   */
  async executeCode(tabId, code) {
    if (typeof chrome === 'undefined' || !chrome.scripting) {
      throw new Error('Chrome scripting API not available');
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: codeStr => {
        try {
          const fn = new Function(`"use strict"; return (async () => { ${codeStr} })()`);
          return fn();
        } catch (e) {
          return { __error: true, message: e.message };
        }
      },
      args: [code],
      world: 'MAIN'
    });

    const result = results[0]?.result;

    if (result && result.__error) {
      throw new Error(result.message);
    }

    return result;
  }

  /**
   * Execute prompt on tab (via background)
   */
  async executePrompt(tabId, prompt) {
    if (typeof chrome === 'undefined' || !chrome.runtime) {
      throw new Error('Chrome runtime not available');
    }

    // Send to background for AI processing
    const response = await chrome.runtime.sendMessage({
      action: 'execute_prompt',
      tabId,
      prompt
    });

    if (!response.success) {
      throw new Error(response.error || 'Prompt execution failed');
    }

    return response.results;
  }

  /**
   * Cancel a running task
   */
  cancel(taskId) {
    const execution = this.activeTasks.get(taskId);
    if (!execution) return false;

    execution.status = TaskStatus.CANCELLED;
    execution.endTime = Date.now();

    // Mark all running tabs as cancelled
    for (const tabId of Object.keys(execution.tabs)) {
      if (execution.tabs[tabId].status === TaskStatus.RUNNING) {
        execution.tabs[tabId].status = TaskStatus.CANCELLED;
      }
    }

    logger.info('Task cancelled', { taskId });
    return true;
  }

  /**
   * Get execution status
   */
  getStatus(taskId) {
    const execution = this.activeTasks.get(taskId);
    if (!execution) return null;

    const tabs = Object.values(execution.tabs);
    const completed = tabs.filter(t => t.status === TaskStatus.COMPLETED).length;
    const failed = tabs.filter(t => t.status === TaskStatus.FAILED).length;
    const running = tabs.filter(t => t.status === TaskStatus.RUNNING).length;
    const pending = tabs.filter(t => t.status === TaskStatus.PENDING).length;

    return {
      id: execution.id,
      status: execution.status,
      startTime: execution.startTime,
      endTime: execution.endTime,
      duration: execution.endTime ? execution.endTime - execution.startTime : Date.now() - execution.startTime,
      progress: {
        total: tabs.length,
        completed,
        failed,
        running,
        pending
      },
      tabs: execution.tabs
    };
  }

  /**
   * Get all active executions
   */
  getActiveExecutions() {
    return Array.from(this.activeTasks.values())
      .filter(e => e.status === TaskStatus.RUNNING || e.status === TaskStatus.PENDING)
      .map(e => this.getStatus(e.id));
  }

  /**
   * Clean up completed executions
   */
  cleanup() {
    for (const [id, execution] of this.activeTasks) {
      if (
        execution.status === TaskStatus.COMPLETED ||
        execution.status === TaskStatus.FAILED ||
        execution.status === TaskStatus.CANCELLED
      ) {
        // Keep last 10 executions
        if (this.activeTasks.size > 10) {
          this.activeTasks.delete(id);
        }
      }
    }
  }
}

/**
 * TabGroup - Manage groups of tabs for batch operations
 */
export class TabGroup {
  /**
   * @param {Object} options
   * @param {string} options.name - Group name
   * @param {string} [options.color] - Group color
   */
  constructor(options = {}) {
    this.name = options.name;
    this.color = options.color || 'blue';
    this.tabIds = [];
    this.groupId = null;
  }

  /**
   * Create the tab group
   */
  async create() {
    if (typeof chrome === 'undefined' || !chrome.tabs) {
      throw new Error('Chrome tabs API not available');
    }

    if (this.tabIds.length === 0) {
      throw new Error('No tabs in group');
    }

    this.groupId = await chrome.tabs.group({
      tabIds: this.tabIds,
      createProperties: {
        title: this.name,
        color: this.color
      }
    });

    return this.groupId;
  }

  /**
   * Add tab to group
   */
  async addTab(tabId) {
    this.tabIds.push(tabId);

    if (this.groupId) {
      await chrome.tabs.group({
        tabIds: tabId,
        groupId: this.groupId
      });
    }
  }

  /**
   * Remove tab from group
   */
  async removeTab(tabId) {
    this.tabIds = this.tabIds.filter(id => id !== tabId);

    if (this.groupId) {
      await chrome.tabs.ungroup(tabId);
    }
  }

  /**
   * Close all tabs in group
   */
  async closeAll() {
    if (this.tabIds.length > 0) {
      await chrome.tabs.remove(this.tabIds);
      this.tabIds = [];
      this.groupId = null;
    }
  }

  /**
   * Get all tabs in group
   */
  async getTabs() {
    if (typeof chrome === 'undefined' || !chrome.tabs) {
      return [];
    }

    const tabs = await chrome.tabs.query({ groupId: this.groupId });
    return tabs;
  }
}

/**
 * TabWorkflow - Define workflows across tabs
 */
export class TabWorkflow {
  /**
   * @param {Object} definition
   * @param {string} definition.name - Workflow name
   * @param {Array} definition.steps - Workflow steps
   */
  constructor(definition) {
    this.name = definition.name;
    this.steps = definition.steps || [];
    this.currentStep = 0;
    this.isRunning = false;
    this.results = [];
  }

  /**
   * Run the workflow
   */
  async run(context = {}) {
    if (this.isRunning) {
      throw new Error('Workflow already running');
    }

    this.isRunning = true;
    this.currentStep = 0;
    this.results = [];

    try {
      for (let i = 0; i < this.steps.length; i++) {
        this.currentStep = i;
        const step = this.steps[i];

        logger.info('Executing workflow step', {
          workflow: this.name,
          step: i,
          action: step.action
        });

        const result = await this.executeStep(step, context);
        this.results.push(result);

        // Update context for next step
        context.lastResult = result;
        context.stepIndex = i;

        // Check if step should stop workflow
        if (step.stopOnError && result.error) {
          logger.warn('Workflow stopped due to error', {
            workflow: this.name,
            step: i,
            error: result.error
          });
          break;
        }
      }

      return {
        success: true,
        steps: this.results,
        context
      };
    } catch (error) {
      logger.error('Workflow failed', {
        workflow: this.name,
        step: this.currentStep,
        error: error.message
      });

      return {
        success: false,
        steps: this.results,
        error: error.message,
        context
      };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Execute a single step
   */
  async executeStep(step, context) {
    const result = {
      step: step.name || `step_${this.currentStep}`,
      action: step.action,
      startTime: Date.now()
    };

    try {
      switch (step.action) {
        case 'open_tab': {
          const tab = await chrome.tabs.create({
            url: step.url,
            active: step.active ?? false
          });
          result.tabId = tab.id;

          // Wait for page load if needed
          if (step.waitForLoad !== false) {
            await this.waitForTabLoad(tab.id);
          }
          break;
        }

        case 'close_tab': {
          await chrome.tabs.remove(step.tabId || context.lastResult?.tabId);
          break;
        }

        case 'execute_code': {
          const coordinator = new MultiTabCoordinator();
          const tabId = step.tabId || context.lastResult?.tabId;
          const execResult = await coordinator.executeCode(tabId, step.code);
          result.data = execResult;
          break;
        }

        case 'execute_prompt': {
          const coordinator = new MultiTabCoordinator();
          const tabId = step.tabId || context.lastResult?.tabId;
          const execResult = await coordinator.executePrompt(tabId, step.prompt);
          result.data = execResult;
          break;
        }

        case 'switch_tab': {
          await chrome.tabs.update(step.tabId || context.lastResult?.tabId, {
            active: true
          });
          break;
        }

        case 'wait': {
          await new Promise(resolve => setTimeout(resolve, step.duration || 1000));
          break;
        }

        case 'extract': {
          const tabId = step.tabId || context.lastResult?.tabId;
          const data = await this.extractFromTab(tabId, step.selectors);
          result.data = data;
          break;
        }

        default:
          throw new Error(`Unknown step action: ${step.action}`);
      }

      result.success = true;
    } catch (error) {
      result.success = false;
      result.error = error.message;
    }

    result.endTime = Date.now();
    result.duration = result.endTime - result.startTime;

    return result;
  }

  /**
   * Wait for tab to load
   */
  waitForTabLoad(tabId, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Tab load timeout'));
      }, timeout);

      const listener = (updatedTabId, changeInfo) => {
        if (updatedTabId === tabId && changeInfo.status === 'complete') {
          clearTimeout(timeoutId);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };

      chrome.tabs.onUpdated.addListener(listener);
    });
  }

  /**
   * Extract data from tab
   */
  async extractFromTab(tabId, selectors) {
    if (typeof chrome === 'undefined' || !chrome.scripting) {
      throw new Error('Chrome scripting API not available');
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: sels => {
        const data = {};
        for (const [key, selector] of Object.entries(sels)) {
          const elements = document.querySelectorAll(selector);
          data[key] = Array.from(elements).map(el => ({
            text: el.textContent?.trim(),
            html: el.innerHTML,
            value: el.value,
            href: el.href,
            src: el.src
          }));
        }
        return data;
      },
      args: [selectors],
      world: 'MAIN'
    });

    return results[0]?.result;
  }

  /**
   * Get workflow progress
   */
  getProgress() {
    return {
      name: this.name,
      currentStep: this.currentStep,
      totalSteps: this.steps.length,
      isRunning: this.isRunning,
      progress: ((this.currentStep + 1) / this.steps.length * 100).toFixed(1) + '%'
    };
  }
}

/**
 * Quick multi-tab execution helper
 */
export async function executeOnAllTabs(task) {
  const coordinator = new MultiTabCoordinator();
  return coordinator.executeOnTabs({
    ...task,
    tabIds: 'all'
  });
}

/**
 * Quick tab workflow helper
 */
export async function runTabWorkflow(definition, context = {}) {
  const workflow = new TabWorkflow(definition);
  return workflow.run(context);
}

// Global coordinator instance
let globalCoordinator = null;

/**
 * Get global coordinator instance
 */
export function getMultiTabCoordinator() {
  if (!globalCoordinator) {
    globalCoordinator = new MultiTabCoordinator();
  }
  return globalCoordinator;
}
