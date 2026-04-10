/**
 * Debug Mode - Development and troubleshooting tools
 * Provides detailed logging, performance profiling, and debugging utilities
 */

import { logger } from './logger.js';
import { metrics, tracker } from './performance.js';

/**
 * Debug mode configuration
 */
let debugConfig = {
  enabled: false,
  logLevel: 'debug', // 'debug', 'info', 'warn', 'error'
  showTimings: true,
  showMemory: false,
  profileAgent: true,
  profileApi: true,
  profileStorage: true,
  maxLogEntries: 1000
};

/**
 * Log entries storage
 */
const logEntries = [];
const performanceEntries = [];

/**
 * Enable debug mode
 * @param {Object} config
 */
export function enableDebugMode(config = {}) {
  debugConfig = { ...debugConfig, ...config, enabled: true };

  // Set logger level
  if (logger.setLevel) {
    logger.setLevel(debugConfig.logLevel);
  }

  // Override console methods to capture logs
  overrideConsole();

  // Add keyboard shortcut to toggle debug panel
  document.addEventListener('keydown', e => {
    if (e.ctrlKey && e.shiftKey && e.key === 'D') {
      e.preventDefault();
      toggleDebugPanel();
    }
  });

  logger.info('Debug mode enabled', { config: debugConfig });
}

/**
 * Disable debug mode
 */
export function disableDebugMode() {
  debugConfig.enabled = false;

  if (logger.setLevel) {
    logger.setLevel('warn');
  }

  logger.info('Debug mode disabled');
}

/**
 * Check if debug mode is enabled
 */
export function isDebugEnabled() {
  return debugConfig.enabled;
}

/**
 * Override console methods to capture logs
 */
function overrideConsole() {
  const originalMethods = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    debug: console.debug
  };

  const addLogEntry = (level, ...args) => {
    if (!debugConfig.enabled) return;

    const entry = {
      timestamp: Date.now(),
      level,
      message: args.map(arg => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg))),
      stack: new Error().stack
    };

    logEntries.push(entry);

    // Trim entries if exceeding max
    if (logEntries.length > debugConfig.maxLogEntries) {
      logEntries.shift();
    }
  };

  console.log = (...args) => {
    originalMethods.log.apply(console, args);
    addLogEntry('info', ...args);
  };

  console.info = (...args) => {
    originalMethods.info.apply(console, args);
    addLogEntry('info', ...args);
  };

  console.warn = (...args) => {
    originalMethods.warn.apply(console, args);
    addLogEntry('warn', ...args);
  };

  console.error = (...args) => {
    originalMethods.error.apply(console, args);
    addLogEntry('error', ...args);
  };

  console.debug = (...args) => {
    originalMethods.debug.apply(console, args);
    addLogEntry('debug', ...args);
  };
}

/**
 * Performance profiler
 */
export const Profiler = {
  /**
   * Start a profiling session
   */
  startSession(name) {
    const session = {
      name,
      startTime: performance.now(),
      marks: [],
      measures: []
    };

    performanceEntries.push(session);
    return session;
  },

  /**
   * Mark a point in the profiling session
   */
  mark(session, name) {
    if (!session) return;

    const mark = {
      name,
      timestamp: performance.now() - session.startTime
    };

    session.marks.push(mark);
  },

  /**
   * Measure between two marks
   */
  measure(session, name, startMark, endMark) {
    if (!session) return;

    const start = session.marks.find(m => m.name === startMark);
    const end = session.marks.find(m => m.name === endMark);

    if (!start || !end) return;

    const measure = {
      name,
      duration: end.timestamp - start.timestamp,
      start: start.timestamp,
      end: end.timestamp
    };

    session.measures.push(measure);
    return measure;
  },

  /**
   * End a profiling session
   */
  endSession(session) {
    if (!session) return;

    session.endTime = performance.now();
    session.totalDuration = session.endTime - session.startTime;

    return session;
  },

  /**
   * Get all performance entries
   */
  getEntries() {
    return [...performanceEntries];
  },

  /**
   * Clear performance entries
   */
  clear() {
    performanceEntries.length = 0;
  }
};

/**
 * Memory profiler
 */
export const MemoryProfiler = {
  /**
   * Get memory usage
   */
  getUsage() {
    if (typeof performance !== 'undefined' && performance.memory) {
      return {
        usedJSHeapSize: performance.memory.usedJSHeapSize,
        totalJSHeapSize: performance.memory.totalJSHeapSize,
        jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
        usedMB: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
        totalMB: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024)
      };
    }
    return null;
  },

  /**
   * Take a heap snapshot (if available)
   */
  async takeSnapshot() {
    // This would require DevTools protocol
    logger.warn('Heap snapshots require DevTools protocol');
    return null;
  }
};

/**
 * API Profiler
 */
export const ApiProfiler = {
  calls: [],

  /**
   * Record API call
   */
  recordCall(config) {
    const call = {
      timestamp: Date.now(),
      url: config.url,
      method: config.method || 'GET',
      duration: config.duration,
      status: config.status,
      success: config.success,
      error: config.error,
      cached: config.cached || false
    };

    this.calls.push(call);

    // Keep last 100 calls
    if (this.calls.length > 100) {
      this.calls.shift();
    }

    return call;
  },

  /**
   * Get API statistics
   */
  getStats() {
    if (this.calls.length === 0) {
      return { total: 0, success: 0, failed: 0, avgDuration: 0, cacheHitRate: 0 };
    }

    const success = this.calls.filter(c => c.success).length;
    const cached = this.calls.filter(c => c.cached).length;
    const totalDuration = this.calls.reduce((sum, c) => sum + (c.duration || 0), 0);

    return {
      total: this.calls.length,
      success,
      failed: this.calls.length - success,
      avgDuration: Math.round(totalDuration / this.calls.length),
      cacheHitRate: this.calls.length > 0 ? Math.round((cached / this.calls.length) * 100) : 0
    };
  },

  /**
   * Clear recorded calls
   */
  clear() {
    this.calls.length = 0;
  }
};

/**
 * Agent Profiler
 */
export const AgentProfiler = {
  executions: [],

  /**
   * Record agent execution
   */
  recordExecution(config) {
    const execution = {
      timestamp: Date.now(),
      prompt: config.prompt?.substring(0, 100),
      iterations: config.iterations,
      duration: config.duration,
      success: config.success,
      error: config.error,
      codeGenerated: config.codeGenerated || false,
      tokensUsed: config.tokensUsed
    };

    this.executions.push(execution);

    // Keep last 50 executions
    if (this.executions.length > 50) {
      this.executions.shift();
    }

    return execution;
  },

  /**
   * Get agent statistics
   */
  getStats() {
    if (this.executions.length === 0) {
      return { total: 0, success: 0, avgIterations: 0, avgDuration: 0 };
    }

    const success = this.executions.filter(e => e.success).length;
    const totalIterations = this.executions.reduce((sum, e) => sum + (e.iterations || 0), 0);
    const totalDuration = this.executions.reduce((sum, e) => sum + (e.duration || 0), 0);

    return {
      total: this.executions.length,
      success,
      failed: this.executions.length - success,
      avgIterations: Math.round(totalIterations / this.executions.length * 10) / 10,
      avgDuration: Math.round(totalDuration / this.executions.length)
    };
  },

  /**
   * Clear recorded executions
   */
  clear() {
    this.executions.length = 0;
  }
};

/**
 * Debug Panel UI
 */
let debugPanel = null;
let isPanelOpen = false;

/**
 * Toggle debug panel
 */
export function toggleDebugPanel() {
  if (isPanelOpen) {
    closeDebugPanel();
  } else {
    openDebugPanel();
  }
}

/**
 * Open debug panel
 */
export function openDebugPanel() {
  if (debugPanel) {
    debugPanel.classList.remove('hidden');
    isPanelOpen = true;
    updateDebugPanel();
    return;
  }

  debugPanel = document.createElement('div');
  debugPanel.className = 'debug-panel';
  debugPanel.innerHTML = `
    <div class="debug-panel-header">
      <h3>Debug Panel</h3>
      <div class="debug-panel-tabs">
        <button class="debug-tab active" data-tab="logs">Logs</button>
        <button class="debug-tab" data-tab="performance">Performance</button>
        <button class="debug-tab" data-tab="api">API</button>
        <button class="debug-tab" data-tab="agent">Agent</button>
        <button class="debug-tab" data-tab="state">State</button>
      </div>
      <button class="debug-close-btn">&times;</button>
    </div>
    <div class="debug-panel-content">
      <div class="debug-tab-content active" data-tab="logs">
        <div class="debug-controls">
          <select class="debug-log-filter">
            <option value="all">All Levels</option>
            <option value="error">Errors Only</option>
            <option value="warn">Warnings+</option>
            <option value="info">Info+</option>
            <option value="debug">Debug+</option>
          </select>
          <button class="debug-clear-btn">Clear Logs</button>
        </div>
        <div class="debug-logs"></div>
      </div>
      <div class="debug-tab-content" data-tab="performance">
        <div class="debug-performance"></div>
      </div>
      <div class="debug-tab-content" data-tab="api">
        <div class="debug-api"></div>
      </div>
      <div class="debug-tab-content" data-tab="agent">
        <div class="debug-agent"></div>
      </div>
      <div class="debug-tab-content" data-tab="state">
        <div class="debug-state"></div>
      </div>
    </div>
    <div class="debug-panel-footer">
      <span class="debug-status"></span>
      <button class="debug-export-btn">Export</button>
    </div>
  `;

  document.body.appendChild(debugPanel);
  isPanelOpen = true;

  // Bind events
  debugPanel.querySelector('.debug-close-btn').addEventListener('click', closeDebugPanel);

  debugPanel.querySelectorAll('.debug-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      debugPanel.querySelectorAll('.debug-tab').forEach(t => t.classList.remove('active'));
      debugPanel.querySelectorAll('.debug-tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      debugPanel.querySelector(`.debug-tab-content[data-tab="${tab.dataset.tab}"]`).classList.add('active');
      updateDebugPanel();
    });
  });

  debugPanel.querySelector('.debug-clear-btn').addEventListener('click', () => {
    logEntries.length = 0;
    updateDebugPanel();
  });

  debugPanel.querySelector('.debug-log-filter').addEventListener('change', updateDebugPanel);

  debugPanel.querySelector('.debug-export-btn').addEventListener('click', exportDebugData);

  // Auto-update every second
  const updateInterval = setInterval(() => {
    if (isPanelOpen) {
      updateDebugPanel();
    } else {
      clearInterval(updateInterval);
    }
  }, 1000);

  addDebugPanelStyles();
  updateDebugPanel();
}

/**
 * Close debug panel
 */
export function closeDebugPanel() {
  if (debugPanel) {
    debugPanel.classList.add('hidden');
  }
  isPanelOpen = false;
}

/**
 * Update debug panel content
 */
function updateDebugPanel() {
  if (!debugPanel) return;

  const activeTab = debugPanel.querySelector('.debug-tab.active')?.dataset.tab || 'logs';

  switch (activeTab) {
    case 'logs':
      updateLogsTab();
      break;
    case 'performance':
      updatePerformanceTab();
      break;
    case 'api':
      updateApiTab();
      break;
    case 'agent':
      updateAgentTab();
      break;
    case 'state':
      updateStateTab();
      break;
  }

  // Update status
  const status = debugPanel.querySelector('.debug-status');
  if (status) {
    const memory = MemoryProfiler.getUsage();
    status.textContent = memory
      ? `Memory: ${memory.usedMB}MB / ${memory.totalMB}MB`
      : `Logs: ${logEntries.length}`;
  }
}

/**
 * Update logs tab
 */
function updateLogsTab() {
  const container = debugPanel.querySelector('.debug-logs');
  if (!container) return;

  const filter = debugPanel.querySelector('.debug-log-filter')?.value || 'all';
  const levels = { all: [], error: ['error'], warn: ['error', 'warn'], info: ['error', 'warn', 'info'], debug: ['error', 'warn', 'info', 'debug'] };
  const allowedLevels = levels[filter] || [];

  const filtered = logEntries.filter(e => allowedLevels.length === 0 || allowedLevels.includes(e.level));

  container.innerHTML = filtered
    .slice(-100)
    .reverse()
    .map(
      entry => `
    <div class="debug-log-entry ${entry.level}">
      <span class="log-time">${new Date(entry.timestamp).toLocaleTimeString()}</span>
      <span class="log-level">${entry.level.toUpperCase()}</span>
      <span class="log-message">${entry.message.join(' ')}</span>
    </div>
  `
    )
    .join('');
}

/**
 * Update performance tab
 */
function updatePerformanceTab() {
  const container = debugPanel.querySelector('.debug-performance');
  if (!container) return;

  const entries = Profiler.getEntries().slice(-10);
  const memory = MemoryProfiler.getUsage();

  container.innerHTML = `
    <div class="debug-section">
      <h4>Memory</h4>
      ${
        memory
          ? `
        <div class="debug-metrics">
          <div class="metric">
            <span class="metric-label">Used</span>
            <span class="metric-value">${memory.usedMB} MB</span>
          </div>
          <div class="metric">
            <span class="metric-label">Total</span>
            <span class="metric-value">${memory.totalMB} MB</span>
          </div>
          <div class="metric">
            <span class="metric-label">Limit</span>
            <span class="metric-value">${Math.round(memory.jsHeapSizeLimit / 1024 / 1024)} MB</span>
          </div>
        </div>
      `
          : '<p>Memory info not available</p>'
      }
    </div>
    <div class="debug-section">
      <h4>Profiling Sessions (${entries.length})</h4>
      <div class="debug-sessions">
        ${entries
          .map(
            s => `
          <div class="session">
            <span class="session-name">${s.name}</span>
            <span class="session-duration">${Math.round(s.totalDuration || 0)}ms</span>
          </div>
        `
          )
          .join('')}
      </div>
    </div>
  `;
}

/**
 * Update API tab
 */
function updateApiTab() {
  const container = debugPanel.querySelector('.debug-api');
  if (!container) return;

  const stats = ApiProfiler.getStats();
  const calls = ApiProfiler.calls.slice(-20).reverse();

  container.innerHTML = `
    <div class="debug-section">
      <h4>API Statistics</h4>
      <div class="debug-metrics">
        <div class="metric">
          <span class="metric-label">Total Calls</span>
          <span class="metric-value">${stats.total}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Success</span>
          <span class="metric-value">${stats.success}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Failed</span>
          <span class="metric-value">${stats.failed}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Avg Duration</span>
          <span class="metric-value">${stats.avgDuration}ms</span>
        </div>
        <div class="metric">
          <span class="metric-label">Cache Hit</span>
          <span class="metric-value">${stats.cacheHitRate}%</span>
        </div>
      </div>
    </div>
    <div class="debug-section">
      <h4>Recent Calls</h4>
      <div class="debug-calls">
        ${calls
          .map(
            c => `
          <div class="call ${c.success ? 'success' : 'error'}">
            <span class="call-method">${c.method}</span>
            <span class="call-url">${c.url}</span>
            <span class="call-duration">${c.duration}ms</span>
            ${c.cached ? '<span class="call-cached">cached</span>' : ''}
          </div>
        `
          )
          .join('')}
      </div>
    </div>
  `;
}

/**
 * Update agent tab
 */
function updateAgentTab() {
  const container = debugPanel.querySelector('.debug-agent');
  if (!container) return;

  const stats = AgentProfiler.getStats();
  const executions = AgentProfiler.executions.slice(-10).reverse();

  container.innerHTML = `
    <div class="debug-section">
      <h4>Agent Statistics</h4>
      <div class="debug-metrics">
        <div class="metric">
          <span class="metric-label">Total Executions</span>
          <span class="metric-value">${stats.total}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Success</span>
          <span class="metric-value">${stats.success}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Avg Iterations</span>
          <span class="metric-value">${stats.avgIterations}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Avg Duration</span>
          <span class="metric-value">${stats.avgDuration}ms</span>
        </div>
      </div>
    </div>
    <div class="debug-section">
      <h4>Recent Executions</h4>
      <div class="debug-executions">
        ${executions
          .map(
            e => `
          <div class="execution ${e.success ? 'success' : 'error'}">
            <span class="exec-time">${new Date(e.timestamp).toLocaleTimeString()}</span>
            <span class="exec-prompt">${e.prompt}</span>
            <span class="exec-iterations">${e.iterations} iter</span>
            <span class="exec-duration">${e.duration}ms</span>
          </div>
        `
          )
          .join('')}
      </div>
    </div>
  `;
}

/**
 * Update state tab
 */
function updateStateTab() {
  const container = debugPanel.querySelector('.debug-state');
  if (!container) return;

  container.innerHTML = `
    <div class="debug-section">
      <h4>Extension State</h4>
      <pre class="debug-state-json">${JSON.stringify(
        {
          debugConfig: { ...debugConfig, enabled: debugConfig.enabled },
          logCount: logEntries.length,
          performanceEntries: performanceEntries.length,
          apiCalls: ApiProfiler.calls.length,
          agentExecutions: AgentProfiler.executions.length
        },
        null,
        2
      )}</pre>
    </div>
  `;
}

/**
 * Export debug data
 */
function exportDebugData() {
  const data = {
    exportedAt: new Date().toISOString(),
    config: debugConfig,
    logs: logEntries.slice(-100),
    performance: Profiler.getEntries().slice(-10),
    apiCalls: ApiProfiler.calls.slice(-20),
    agentExecutions: AgentProfiler.executions.slice(-10),
    memory: MemoryProfiler.getUsage()
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `agentab-debug-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Add debug panel styles
 */
function addDebugPanelStyles() {
  if (document.getElementById('debug-panel-styles')) return;

  const style = document.createElement('style');
  style.id = 'debug-panel-styles';
  style.textContent = `
    .debug-panel {
      position: fixed;
      bottom: 0;
      right: 0;
      width: 500px;
      height: 400px;
      background: #1e1e1e;
      border-top-left-radius: 8px;
      box-shadow: 0 0 20px rgba(0, 0, 0, 0.5);
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 12px;
      color: #e0e0e0;
      display: flex;
      flex-direction: column;
    }

    .debug-panel.hidden {
      display: none;
    }

    .debug-panel-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 12px;
      background: #333;
      border-bottom: 1px solid #444;
    }

    .debug-panel-header h3 {
      margin: 0;
      font-size: 14px;
      color: #fff;
    }

    .debug-panel-tabs {
      display: flex;
      gap: 4px;
      flex: 1;
    }

    .debug-tab {
      padding: 4px 8px;
      background: transparent;
      border: none;
      color: #888;
      cursor: pointer;
      border-radius: 4px;
    }

    .debug-tab:hover {
      background: #444;
    }

    .debug-tab.active {
      background: #007acc;
      color: #fff;
    }

    .debug-close-btn {
      background: transparent;
      border: none;
      color: #888;
      font-size: 18px;
      cursor: pointer;
    }

    .debug-close-btn:hover {
      color: #fff;
    }

    .debug-panel-content {
      flex: 1;
      overflow: hidden;
    }

    .debug-tab-content {
      display: none;
      height: 100%;
      overflow-y: auto;
      padding: 12px;
    }

    .debug-tab-content.active {
      display: block;
    }

    .debug-controls {
      display: flex;
      gap: 8px;
      margin-bottom: 12px;
    }

    .debug-log-filter, .debug-clear-btn {
      padding: 4px 8px;
      background: #333;
      border: 1px solid #555;
      color: #e0e0e0;
      border-radius: 4px;
    }

    .debug-logs {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .debug-log-entry {
      display: flex;
      gap: 8px;
      padding: 4px 8px;
      border-radius: 4px;
      font-family: 'Fira Code', monospace;
      font-size: 11px;
    }

    .debug-log-entry.error {
      background: rgba(200, 0, 0, 0.2);
      color: #ff6b6b;
    }

    .debug-log-entry.warn {
      background: rgba(200, 150, 0, 0.2);
      color: #ffd93d;
    }

    .debug-log-entry.info {
      background: rgba(0, 100, 200, 0.2);
      color: #6bcfff;
    }

    .debug-log-entry.debug {
      background: rgba(100, 100, 100, 0.2);
      color: #aaa;
    }

    .log-time {
      color: #888;
    }

    .log-level {
      font-weight: 600;
    }

    .log-message {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .debug-section {
      margin-bottom: 16px;
    }

    .debug-section h4 {
      margin: 0 0 8px;
      color: #fff;
    }

    .debug-metrics {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
      gap: 8px;
    }

    .metric {
      background: #333;
      padding: 8px;
      border-radius: 4px;
    }

    .metric-label {
      display: block;
      font-size: 10px;
      color: #888;
    }

    .metric-value {
      font-size: 16px;
      font-weight: 600;
    }

    .debug-sessions, .debug-calls, .debug-executions {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .session, .call, .execution {
      display: flex;
      gap: 8px;
      padding: 4px 8px;
      background: #333;
      border-radius: 4px;
    }

    .call.success, .execution.success {
      border-left: 3px solid #0a0;
    }

    .call.error, .execution.error {
      border-left: 3px solid #c00;
    }

    .call-cached {
      color: #ffd93d;
    }

    .debug-state-json {
      background: #333;
      padding: 8px;
      border-radius: 4px;
      overflow-x: auto;
      font-family: 'Fira Code', monospace;
      font-size: 11px;
    }

    .debug-panel-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      background: #333;
      border-top: 1px solid #444;
    }

    .debug-status {
      color: #888;
    }

    .debug-export-btn {
      padding: 4px 12px;
      background: #007acc;
      border: none;
      color: #fff;
      border-radius: 4px;
      cursor: pointer;
    }
  `;

  document.head.appendChild(style);
}

/**
 * Create a trace ID for request correlation
 */
export function createTraceId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Time a function execution
 */
export async function timeAsync(name, fn) {
  const start = performance.now();
  try {
    const result = await fn();
    const duration = performance.now() - start;
    logger.debug(`[Timer] ${name}: ${Math.round(duration)}ms`);
    return { result, duration };
  } catch (error) {
    const duration = performance.now() - start;
    logger.error(`[Timer] ${name}: failed after ${Math.round(duration)}ms`, error);
    throw error;
  }
}

/**
 * Get debug summary
 */
export function getDebugSummary() {
  return {
    enabled: debugConfig.enabled,
    logCount: logEntries.length,
    errorCount: logEntries.filter(e => e.level === 'error').length,
    warnCount: logEntries.filter(e => e.level === 'warn').length,
    apiStats: ApiProfiler.getStats(),
    agentStats: AgentProfiler.getStats(),
    memory: MemoryProfiler.getUsage()
  };
}
