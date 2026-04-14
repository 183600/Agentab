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
      autoRunSites: task.autoRunSites || [], // URLs for auto execution
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
  },

  // ===== MCP Server Configuration =====

  /**
   * Get all MCP servers
   * @returns {Promise<Array>}
   */
  async getMCPServers() {
    const result = await chrome.storage.local.get('mcpServers');
    return result.mcpServers || [];
  },

  /**
   * Save a new MCP server
   * @param {Object} server - Server configuration
   * @param {string} server.name - Server name
   * @param {string} server.url - Server URL
   * @param {string} [server.transport] - Transport type: 'http' | 'websocket'
   * @param {Object} [server.headers] - Custom headers
   * @param {number} [server.timeout] - Request timeout in ms
   * @param {boolean} [server.enabled] - Whether server is enabled
   * @returns {Promise<Object>} The saved server with id
   */
  async saveMCPServer(server) {
    const servers = await this.getMCPServers();
    const newServer = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      name: server.name,
      url: server.url,
      transport: server.transport || 'http',
      headers: server.headers || {},
      timeout: server.timeout || 30000,
      enabled: server.enabled !== false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    servers.push(newServer);
    await chrome.storage.local.set({ mcpServers: servers });
    return newServer;
  },

  /**
   * Update an existing MCP server
   * @param {string} id - Server ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object|null>}
   */
  async updateMCPServer(id, updates) {
    const servers = await this.getMCPServers();
    const index = servers.findIndex(s => s.id === id);
    if (index === -1) return null;
    
    servers[index] = {
      ...servers[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    await chrome.storage.local.set({ mcpServers: servers });
    return servers[index];
  },

  /**
   * Delete an MCP server
   * @param {string} id - Server ID
   * @returns {Promise<boolean>}
   */
  async deleteMCPServer(id) {
    const servers = await this.getMCPServers();
    const filtered = servers.filter(s => s.id !== id);
    if (filtered.length === servers.length) return false;
    await chrome.storage.local.set({ mcpServers: filtered });
    return true;
  },

  /**
   * Get enabled MCP servers
   * @returns {Promise<Array>}
   */
  async getEnabledMCPServers() {
    const servers = await this.getMCPServers();
    return servers.filter(s => s.enabled);
  }
};

// Make available globally
if (typeof globalThis !== 'undefined') {
  globalThis.StorageManager = StorageManager;
}

// Export for ES module
export { StorageManager };
