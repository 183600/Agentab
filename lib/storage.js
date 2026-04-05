// lib/storage.js - Task storage utilities

const StorageManager = {
  /**
   * Get all saved tasks
   * @returns {Promise<Array>}
   */
  async getTasks() {
    const result = await chrome.storage.local.get('tasks');
    return result.tasks || [];
  },

  /**
   * Save a new task
   * @param {Object} task - Task object
   * @param {string} task.name - Task name
   * @param {string} task.type - 'prompt' or 'code'
   * @param {string} task.content - The prompt or JS code
   * @param {string} [task.description] - Optional description
   * @returns {Promise<Object>} The saved task with id
   */
  async saveTask(task) {
    const tasks = await this.getTasks();
    const newTask = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      name: task.name,
      type: task.type, // 'prompt' or 'code'
      content: task.content,
      description: task.description || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      executionCount: 0,
      lastExecuted: null
    };
    tasks.push(newTask);
    await chrome.storage.local.set({ tasks });
    return newTask;
  },

  /**
   * Update an existing task
   * @param {string} id - Task ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object|null>}
   */
  async updateTask(id, updates) {
    const tasks = await this.getTasks();
    const index = tasks.findIndex(t => t.id === id);
    if (index === -1) return null;
    
    tasks[index] = {
      ...tasks[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    await chrome.storage.local.set({ tasks });
    return tasks[index];
  },

  /**
   * Delete a task
   * @param {string} id - Task ID
   * @returns {Promise<boolean>}
   */
  async deleteTask(id) {
    const tasks = await this.getTasks();
    const filtered = tasks.filter(t => t.id !== id);
    if (filtered.length === tasks.length) return false;
    await chrome.storage.local.set({ tasks: filtered });
    return true;
  },

  /**
   * Record task execution
   * @param {string} id - Task ID
   */
  async recordExecution(id) {
    const tasks = await this.getTasks();
    const index = tasks.findIndex(t => t.id === id);
    if (index !== -1) {
      tasks[index].executionCount += 1;
      tasks[index].lastExecuted = new Date().toISOString();
      await chrome.storage.local.set({ tasks });
    }
  },

  /**
   * Get API key
   * @returns {Promise<string>}
   */
  async getApiKey() {
    const result = await chrome.storage.local.get('apiKey');
    return result.apiKey || '';
  },

  /**
   * Save API key
   * @param {string} key
   */
  async saveApiKey(key) {
    await chrome.storage.local.set({ apiKey: key });
  },

  /**
   * Get API base URL
   * @returns {Promise<string>}
   */
  async getApiBaseUrl() {
    const result = await chrome.storage.local.get('apiBaseUrl');
    return result.apiBaseUrl || 'https://api.openai.com/v1';
  },

  /**
   * Save API base URL
   * @param {string} url
   */
  async saveApiBaseUrl(url) {
    await chrome.storage.local.set({ apiBaseUrl: url });
  },

  /**
   * Get model name
   * @returns {Promise<string>}
   */
  async getModel() {
    const result = await chrome.storage.local.get('model');
    return result.model || 'gpt-4';
  },

  /**
   * Save model name
   * @param {string} model
   */
  async saveModel(model) {
    await chrome.storage.local.set({ model });
  },

  /**
   * Get execution history
   * @returns {Promise<Array>}
   */
  async getHistory() {
    const result = await chrome.storage.local.get('history');
    return result.history || [];
  },

  /**
   * Add to execution history
   * @param {Object} entry
   */
  async addHistory(entry) {
    const history = await this.getHistory();
    history.unshift({
      ...entry,
      timestamp: new Date().toISOString()
    });
    // Keep last 100 entries
    if (history.length > 100) history.length = 100;
    await chrome.storage.local.set({ history });
  },

  /**
   * Clear history
   */
  async clearHistory() {
    await chrome.storage.local.set({ history: [] });
  }
};

// Make available globally
if (typeof globalThis !== 'undefined') {
  globalThis.StorageManager = StorageManager;
}
