/**
 * State Sync - Cross-view state synchronization
 * Provides real-time state updates across extension views (popup, sidepanel, settings, etc.)
 */

import { logger } from './logger.js';

/**
 * State change types
 */
export const StateChangeType = {
  SET: 'set',
  DELETE: 'delete',
  CLEAR: 'clear',
  MERGE: 'merge'
};

/**
 * StateSync - Main state synchronization class
 */
export class StateSync {
  /**
   * @param {Object} options
   * @param {string} options.namespace - Namespace for this state
   * @param {Object} [options.initialState] - Initial state
   * @param {Function} [options.onStateChange] - Callback for state changes
   * @param {number} [options.debounceMs] - Debounce time for sync
   * @param {boolean} [options.persist] - Whether to persist to storage
   */
  constructor(options = {}) {
    this.namespace = options.namespace || 'default';
    this.options = {
      debounceMs: 100,
      persist: true,
      ...options
    };

    this.state = {};
    this.subscribers = new Map();
    this.pendingSync = null;
    this.isInitialized = false;

    // Bind message handler
    this.handleMessage = this.handleMessage.bind(this);

    // Initialize
    this.init();
  }

  /**
   * Initialize state sync
   */
  async init() {
    // Load persisted state
    if (this.options.persist) {
      await this.loadPersistedState();
    }

    // Set up message listener
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.onMessage.addListener(this.handleMessage);
    }

    // Apply initial state
    if (this.options.initialState) {
      this.merge(this.options.initialState, { sync: false, persist: false });
    }

    this.isInitialized = true;
    logger.info('StateSync initialized', { namespace: this.namespace });
  }

  /**
   * Load persisted state from storage
   */
  async loadPersistedState() {
    try {
      if (typeof chrome === 'undefined' || !chrome.storage) {
        return;
      }

      const key = this.getStorageKey();
      const result = await chrome.storage.local.get(key);
      const persistedState = result[key];

      if (persistedState && typeof persistedState === 'object') {
        this.state = { ...persistedState };
        logger.debug('Loaded persisted state', { namespace: this.namespace });
      }
    } catch (error) {
      logger.error('Failed to load persisted state', {
        namespace: this.namespace,
        error: error.message
      });
    }
  }

  /**
   * Get storage key for this namespace
   */
  getStorageKey() {
    return `state_sync_${this.namespace}`;
  }

  /**
   * Handle incoming messages
   */
  handleMessage(message, sender, sendResponse) {
    if (!message.type || !message.type.startsWith('state_sync:')) {
      return false;
    }

    if (message.namespace !== this.namespace) {
      return false;
    }

    switch (message.type) {
      case 'state_sync:update':
        this.applyRemoteUpdate(message.changes, message.source);
        sendResponse({ success: true });
        break;

      case 'state_sync:request':
        sendResponse({ state: this.state });
        break;

      case 'state_sync:reset':
        this.state = {};
        this.notifySubscribers(null, StateChangeType.CLEAR);
        sendResponse({ success: true });
        break;
    }

    return true;
  }

  /**
   * Apply update from remote source
   */
  applyRemoteUpdate(changes, source) {
    for (const change of changes) {
      switch (change.type) {
        case StateChangeType.SET:
          this.setValue(change.key, change.value, { sync: false, persist: false });
          break;

        case StateChangeType.DELETE:
          this.deleteValue(change.key, { sync: false, persist: false });
          break;

        case StateChangeType.CLEAR:
          this.state = {};
          this.notifySubscribers(null, StateChangeType.CLEAR);
          break;

        case StateChangeType.MERGE:
          this.state = { ...this.state, ...change.value };
          this.notifySubscribers(null, StateChangeType.MERGE);
          break;
      }
    }

    // Persist the merged state
    if (this.options.persist) {
      this.schedulePersist();
    }
  }

  /**
   * Get a value from state
   * @param {string} key - Dot-notation key (e.g., 'user.name')
   * @param {*} defaultValue - Default value if not found
   * @returns {*}
   */
  get(key, defaultValue = undefined) {
    const keys = key.split('.');
    let value = this.state;

    for (const k of keys) {
      if (value === null || value === undefined || typeof value !== 'object') {
        return defaultValue;
      }
      value = value[k];
    }

    return value !== undefined ? value : defaultValue;
  }

  /**
   * Set a value in state
   * @param {string} key - Dot-notation key
   * @param {*} value - Value to set
   * @param {Object} [options] - Options
   */
  set(key, value, options = {}) {
    const { sync = true, persist = true } = options;

    this.setValue(key, value, { sync, persist });

    if (sync) {
      this.broadcastChange({
        type: StateChangeType.SET,
        key,
        value
      });
    }
  }

  /**
   * Internal set value
   */
  setValue(key, value, options = {}) {
    const keys = key.split('.');
    const lastKey = keys.pop();
    let target = this.state;

    // Navigate to target object
    for (const k of keys) {
      if (!target[k] || typeof target[k] !== 'object') {
        target[k] = {};
      }
      target = target[k];
    }

    // Set value
    const oldValue = target[lastKey];
    target[lastKey] = value;

    // Notify subscribers
    this.notifySubscribers(key, StateChangeType.SET, { oldValue, newValue: value });

    // Persist
    if (options.persist !== false && this.options.persist) {
      this.schedulePersist();
    }
  }

  /**
   * Delete a value from state
   * @param {string} key - Dot-notation key
   */
  delete(key, options = {}) {
    const { sync = true, persist = true } = options;

    this.deleteValue(key, { sync, persist });

    if (sync) {
      this.broadcastChange({
        type: StateChangeType.DELETE,
        key
      });
    }
  }

  /**
   * Internal delete value
   */
  deleteValue(key, options = {}) {
    const keys = key.split('.');
    const lastKey = keys.pop();
    let target = this.state;

    // Navigate to target object
    for (const k of keys) {
      if (!target[k] || typeof target[k] !== 'object') {
        return;
      }
      target = target[k];
    }

    // Delete value
    const oldValue = target[lastKey];
    delete target[lastKey];

    // Notify subscribers
    this.notifySubscribers(key, StateChangeType.DELETE, { oldValue });

    // Persist
    if (options.persist !== false && this.options.persist) {
      this.schedulePersist();
    }
  }

  /**
   * Merge object into state
   * @param {Object} obj - Object to merge
   */
  merge(obj, options = {}) {
    const { sync = true, persist = true } = options;

    this.state = { ...this.state, ...obj };

    this.notifySubscribers(null, StateChangeType.MERGE, { value: obj });

    if (sync) {
      this.broadcastChange({
        type: StateChangeType.MERGE,
        value: obj
      });
    }

    if (persist && this.options.persist) {
      this.schedulePersist();
    }
  }

  /**
   * Clear all state
   */
  clear(options = {}) {
    const { sync = true, persist = true } = options;

    this.state = {};

    this.notifySubscribers(null, StateChangeType.CLEAR);

    if (sync) {
      this.broadcastChange({
        type: StateChangeType.CLEAR
      });
    }

    if (persist && this.options.persist) {
      this.schedulePersist();
    }
  }

  /**
   * Subscribe to state changes
   * @param {string|Function} keyOrHandler - Key pattern or handler function
   * @param {Function} [handler] - Handler function if key provided
   * @returns {Function} Unsubscribe function
   */
  subscribe(keyOrHandler, handler) {
    // If only one argument, it's a global handler
    if (typeof keyOrHandler === 'function') {
      const id = Symbol();
      this.subscribers.set(id, { handler: keyOrHandler, global: true });
      return () => this.subscribers.delete(id);
    }

    // Otherwise, it's a key-specific subscription
    const id = Symbol();
    this.subscribers.set(id, { key: keyOrHandler, handler });
    return () => this.subscribers.delete(id);
  }

  /**
   * Notify all subscribers of a change
   */
  notifySubscribers(key, type, data = {}) {
    for (const [, subscriber] of this.subscribers) {
      // Global subscribers get all updates
      if (subscriber.global) {
        subscriber.handler({ key, type, ...data, state: this.state });
        continue;
      }

      // Key-specific subscribers
      if (key && this.matchesKey(key, subscriber.key)) {
        subscriber.handler({
          key,
          type,
          ...data,
          value: this.get(key)
        });
      }
    }

    // Call the onStateChange callback
    if (this.options.onStateChange) {
      this.options.onStateChange({ key, type, ...data, state: this.state });
    }
  }

  /**
   * Check if key matches pattern
   */
  matchesKey(key, pattern) {
    if (pattern === key) return true;
    if (pattern.endsWith('.*')) {
      const prefix = pattern.slice(0, -2);
      return key.startsWith(prefix);
    }
    return false;
  }

  /**
   * Broadcast change to other views
   */
  broadcastChange(change) {
    if (typeof chrome === 'undefined' || !chrome.runtime) {
      return;
    }

    chrome.runtime
      .sendMessage({
        type: 'state_sync:update',
        namespace: this.namespace,
        changes: [change],
        source: 'broadcast'
      })
      .catch(() => {
        // Ignore if no listeners
      });
  }

  /**
   * Schedule persist operation
   */
  schedulePersist() {
    if (this.pendingSync) {
      clearTimeout(this.pendingSync);
    }

    this.pendingSync = setTimeout(() => {
      this.persist();
    }, this.options.debounceMs);
  }

  /**
   * Persist state to storage
   */
  async persist() {
    if (!this.options.persist) return;

    try {
      if (typeof chrome === 'undefined' || !chrome.storage) {
        return;
      }

      const key = this.getStorageKey();
      await chrome.storage.local.set({ [key]: this.state });
      logger.debug('State persisted', { namespace: this.namespace });
    } catch (error) {
      logger.error('Failed to persist state', {
        namespace: this.namespace,
        error: error.message
      });
    }
  }

  /**
   * Request current state from another view
   */
  async requestState() {
    if (typeof chrome === 'undefined' || !chrome.runtime) {
      return this.state;
    }

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'state_sync:request',
        namespace: this.namespace
      });

      if (response && response.state) {
        this.state = response.state;
        return this.state;
      }
    } catch (error) {
      logger.debug('Failed to request state', { error: error.message });
    }

    return this.state;
  }

  /**
   * Get entire state object
   * @returns {Object}
   */
  getState() {
    return { ...this.state };
  }

  /**
   * Set entire state object
   * @param {Object} newState
   */
  setState(newState) {
    this.state = { ...newState };
    this.notifySubscribers(null, StateChangeType.MERGE);
    this.broadcastChange({ type: StateChangeType.MERGE, value: newState });
    this.schedulePersist();
  }

  /**
   * Create a scoped state sync for a sub-section
   * @param {string} scope - Scope prefix
   * @returns {ScopedStateSync}
   */
  scope(scope) {
    return new ScopedStateSync(this, scope);
  }

  /**
   * Destroy state sync
   */
  destroy() {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.onMessage.removeListener(this.handleMessage);
    }

    if (this.pendingSync) {
      clearTimeout(this.pendingSync);
      this.persist(); // Final persist
    }

    this.subscribers.clear();
  }
}

/**
 * ScopedStateSync - State sync for a sub-section
 */
class ScopedStateSync {
  constructor(parent, scope) {
    this.parent = parent;
    this.scope = scope;
  }

  get keyPrefix() {
    return this.scope;
  }

  get(key, defaultValue) {
    return this.parent.get(`${this.scope}.${key}`, defaultValue);
  }

  set(key, value, options) {
    this.parent.set(`${this.scope}.${key}`, value, options);
  }

  delete(key, options) {
    this.parent.delete(`${this.scope}.${key}`, options);
  }

  subscribe(key, handler) {
    return this.parent.subscribe(`${this.scope}.${key}`, handler);
  }

  getState() {
    return this.parent.get(this.scope, {});
  }

  setState(state) {
    this.parent.set(this.scope, state);
  }
}

/**
 * Create a global state sync instance
 */
let globalStateSync = null;

/**
 * Get or create global state sync
 */
export function getGlobalStateSync(options = {}) {
  if (!globalStateSync) {
    globalStateSync = new StateSync({
      namespace: 'global',
      ...options
    });
  }
  return globalStateSync;
}

/**
 * State keys for the extension
 */
export const StateKeys = {
  // UI State
  UI_THEME: 'ui.theme',
  UI_SIDEBAR_OPEN: 'ui.sidebarOpen',
  UI_ACTIVE_TAB: 'ui.activeTab',

  // Agent State
  AGENT_RUNNING: 'agent.running',
  AGENT_ITERATION: 'agent.iteration',
  AGENT_MAX_ITERATIONS: 'agent.maxIterations',

  // API State
  API_CONFIGURED: 'api.configured',
  API_MODEL: 'api.model',

  // Task State
  TASK_ACTIVE: 'task.active',
  TASK_COUNT: 'task.count',

  // Editor State
  EDITOR_PROMPT: 'editor.prompt',
  EDITOR_CODE: 'editor.code',

  // Settings
  SETTINGS_SYNTAX_HIGHLIGHT: 'settings.syntaxHighlight',
  SETTINGS_ANIMATIONS: 'settings.animations'
};

/**
 * React-like useState hook for vanilla JS
 */
export function useState(stateSync, key, initialValue) {
  // Initialize if not set
  if (stateSync.get(key) === undefined && initialValue !== undefined) {
    stateSync.set(key, initialValue, { sync: false });
  }

  const getValue = () => stateSync.get(key);
  const setValue = value => {
    if (typeof value === 'function') {
      stateSync.set(key, value(stateSync.get(key)));
    } else {
      stateSync.set(key, value);
    }
  };

  return [getValue, setValue];
}
