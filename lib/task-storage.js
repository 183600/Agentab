// lib/task-storage.js - Task-specific storage

/**
 * TaskStorage - Manages task-related storage operations
 */
export class TaskStorage {
  constructor(storageKey = 'tasks') {
    this.storageKey = storageKey;
  }

  /**
   * Get all saved tasks
   * @returns {Promise<Array>}
   */
  async getAll() {
    const result = await chrome.storage.local.get(this.storageKey);
    return result[this.storageKey] || [];
  }

  /**
   * Save a new task
   * @param {Object} task - Task object
   * @returns {Promise<Object>} The saved task with id
   */
  async save(task) {
    const tasks = await this.getAll();
    const now = new Date().toISOString();
    const newTask = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      name: task.name,
      type: task.type,
      content: task.content,
      description: task.description || '',
      createdAt: now,
      updatedAt: now,
      executionCount: 0,
      lastExecuted: null,
      version: 1,
      history: []
    };
    tasks.push(newTask);
    await chrome.storage.local.set({ [this.storageKey]: tasks });
    return newTask;
  }

  /**
   * Update an existing task
   * @param {string} id - Task ID
   * @param {Object} updates - Fields to update
   * @param {Object} options - Update options
   * @returns {Promise<Object|null>}
   */
  async update(id, updates, options = {}) {
    const { keepHistory = true } = options;
    const tasks = await this.getAll();
    const index = tasks.findIndex(t => t.id === id);
    if (index === -1) return null;

    const existingTask = tasks[index];
    const now = new Date().toISOString();

    if (keepHistory && updates.content && updates.content !== existingTask.content) {
      const historyEntry = {
        version: existingTask.version || 1,
        content: existingTask.content,
        name: existingTask.name,
        description: existingTask.description,
        updatedAt: existingTask.updatedAt,
        savedAt: now
      };

      if (!existingTask.history) {
        existingTask.history = [];
      }

      existingTask.history.push(historyEntry);
      if (existingTask.history.length > 10) {
        existingTask.history.shift();
      }
    }

    tasks[index] = {
      ...existingTask,
      ...updates,
      updatedAt: now,
      version:
        (existingTask.version || 1) +
        (updates.content && updates.content !== existingTask.content ? 1 : 0)
    };
    await chrome.storage.local.set({ [this.storageKey]: tasks });
    return tasks[index];
  }

  /**
   * Delete a task
   * @param {string} id - Task ID
   * @returns {Promise<boolean>}
   */
  async delete(id) {
    const tasks = await this.getAll();
    const filtered = tasks.filter(t => t.id !== id);
    if (filtered.length === tasks.length) return false;
    await chrome.storage.local.set({ [this.storageKey]: filtered });
    return true;
  }

  /**
   * Record task execution
   * @param {string} id - Task ID
   */
  async recordExecution(id) {
    const tasks = await this.getAll();
    const index = tasks.findIndex(t => t.id === id);
    if (index !== -1) {
      tasks[index].executionCount += 1;
      tasks[index].lastExecuted = new Date().toISOString();
      await chrome.storage.local.set({ [this.storageKey]: tasks });
    }
  }

  /**
   * Get task version history
   * @param {string} id - Task ID
   * @returns {Promise<Array>}
   */
  async getHistory(id) {
    const tasks = await this.getAll();
    const task = tasks.find(t => t.id === id);
    return task?.history || [];
  }

  /**
   * Restore task to a specific version
   * @param {string} id - Task ID
   * @param {number} version - Version number
   * @returns {Promise<Object|null>}
   */
  async restoreVersion(id, version) {
    const tasks = await this.getAll();
    const index = tasks.findIndex(t => t.id === id);
    if (index === -1) return null;

    const task = tasks[index];
    const historyEntry = task.history?.find(h => h.version === version);
    if (!historyEntry) return null;

    const now = new Date().toISOString();
    const currentEntry = {
      version: task.version,
      content: task.content,
      name: task.name,
      description: task.description,
      updatedAt: task.updatedAt,
      savedAt: now
    };

    if (!task.history) {
      task.history = [];
    }
    task.history.push(currentEntry);
    if (task.history.length > 10) {
      task.history.shift();
    }

    tasks[index] = {
      ...task,
      content: historyEntry.content,
      name: historyEntry.name,
      description: historyEntry.description,
      updatedAt: now,
      version: task.version + 1
    };

    await chrome.storage.local.set({ [this.storageKey]: tasks });
    return tasks[index];
  }
}

// Singleton instance
export const taskStorage = new TaskStorage();
