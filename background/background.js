// background/background.js - Service Worker (refactored)

import { StorageManager } from '../lib/storage.js';
import { AgentExecutor } from '../lib/agent.js';
import { ErrorHandler, ValidationError, ApiError } from '../lib/errors.js';
import { InputValidator } from '../lib/validator.js';
import { PageAnalyzer } from '../lib/page-analyzer.js';
import { initCacheCleanup } from '../lib/smart-cache.js';
import { initMigration } from '../lib/migration.js';
import { MultiTabCoordinator } from '../lib/multi-tab.js';
import { logger } from '../lib/logger.js';

// Setup error boundary
ErrorHandler.setupErrorBoundary?.();

// Initialize data migration (runs on install/update)
initMigration()
  .then(result => {
    if (result.migrated) {
      logger.info('Data migration completed');
    }
  })
  .catch(error => {
    logger.error('Migration error', { error: error.message });
  });

// Initialize PageAnalyzer cache cleanup
PageAnalyzer.initCleanup();

// Initialize SmartCache periodic cleanup (uses Chrome Alarms API)
initCacheCleanup();

// Initialize agent with streaming support
const agent = new AgentExecutor({
  enableStreaming: true // Enable streaming by default for better UX
});

// Initialize multi-tab coordinator
const multiTabCoordinator = new MultiTabCoordinator({
  maxConcurrentTabs: 5,
  taskTimeout: 60000,
  onProgress: (taskId, tabId, progress) => {
    console.log(`[MultiTab] Task ${taskId} progress on tab ${tabId}:`, progress);
  },
  onComplete: (taskId, results) => {
    console.log(`[MultiTab] Task ${taskId} completed:`, results.summary);
  }
});

// ===== Extension Lifecycle Events =====

// Handle extension install/update
chrome.runtime.onInstalled.addListener(async details => {
  console.log('[Background] Extension event:', details.reason);

  if (details.reason === 'install') {
    console.log('[Background] First install - initializing default data');

    // Set initial schema version
    await chrome.storage.local.set({ schemaVersion: 1 });

    // Initialize default settings
    const defaultSettings = {
      settings: {
        ui: {
          theme: 'light',
          animationEnabled: true,
          syntaxHighlightEnabled: true
        },
        features: {},
        agent: {
          maxIterations: 10
        }
      }
    };
    await chrome.storage.local.set(defaultSettings);
  } else if (details.reason === 'update') {
    console.log('[Background] Extension updated from', details.previousVersion);

    // Run migration for updates
    const { MigrationManager } = await import('../lib/migration.js');
    const result = await MigrationManager.migrate({ backup: true });

    if (result.success && result.fromVersion !== result.toVersion) {
      console.log(`[Background] Migrated data: v${result.fromVersion} -> v${result.toVersion}`);
    } else if (!result.success) {
      console.error('[Background] Migration failed:', result.errors);
    }
  }
});

// ===== Side Panel Setup =====

chrome.action.onClicked.addListener(tab => {
  chrome.sidePanel.open({ tabId: tab.id });
});

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// ===== Message Handling =====

/**
 * Validate message sender to prevent cross-extension attacks
 * @param {Object} sender - Message sender info
 * @returns {boolean} True if sender is valid
 */
function isValidSender(sender) {
  // Messages must come from our own extension or from content scripts
  // in tabs where we've injected (sender.id matches our extension ID)
  if (sender.id && sender.id !== chrome.runtime.id) {
    return false;
  }

  // Internal messages (no tab context) are valid
  if (!sender.tab) {
    return true;
  }

  // Validate tab origin - reject restricted pages
  const url = sender.tab.url || '';
  const restrictedProtocols = ['chrome:', 'chrome-extension:', 'about:', 'edge:', 'brave:'];
  if (restrictedProtocols.some(proto => url.startsWith(proto))) {
    return false;
  }

  return true;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Security: Validate sender
  if (!isValidSender(sender)) {
    console.warn('[Security] Rejected message from invalid sender:', sender);
    sendResponse({ error: 'Invalid sender', code: 'SECURITY_ERROR' });
    return false;
  }

  handleMessage(message, sender)
    .then(sendResponse)
    .catch(error => {
      const normalized = ErrorHandler.normalize(error);
      sendResponse({
        error: normalized.message,
        code: normalized.code
      });
    });

  return true; // Keep channel open for async
});

/**
 * Main message handler
 * @param {Object} message - Message object
 * @param {Object} sender - Sender info
 * @returns {Promise<Object>}
 */
async function handleMessage(message, sender) {
  switch (message.action) {
    case 'execute_prompt':
      return handleExecutePrompt(message, sender);

    case 'execute_code':
      return handleExecuteCode(message, sender);

    case 'stop_agent':
      return handleStopAgent();

    case 'execute_task':
      return handleExecuteTask(message, sender);

    case 'save_task':
      return handleSaveTask(message);

    case 'get_tasks':
      return handleGetTasks();

    case 'delete_task':
      return handleDeleteTask(message);

    case 'update_task':
      return handleUpdateTask(message);

    case 'get_settings':
      return handleGetSettings();

    case 'save_settings':
      return handleSaveSettings(message);

    case 'get_history':
      return handleGetHistory();

    case 'clear_history':
      return handleClearHistory();

    case 'test_api_connection':
      return handleTestApiConnection();

    case 'test_api_connection_with_params':
      return handleTestApiConnectionWithParams(message);

    case 'export_tasks':
      return handleExportTasks();

    case 'import_tasks':
      return handleImportTasks(message);

    case 'multi_tab_execute':
      return handleMultiTabExecute(message);

    case 'multi_tab_status':
      return handleMultiTabStatus(message);

    case 'multi_tab_cancel':
      return handleMultiTabCancel(message);

    default:
      throw new Error(`Unknown action: ${message.action}`);
  }
}

// ===== Action Handlers =====

async function handleExecutePrompt(message, _sender) {
  // Validate prompt
  const validation = InputValidator.validatePrompt(message.prompt);
  if (!validation.valid) {
    throw new ValidationError(validation.error, 'prompt', message.prompt);
  }

  const tab = await getActiveTab();
  if (!tab) {
    throw new Error('No active tab found');
  }

  const updates = [];
  const results = await agent.runPrompt(tab.id, validation.value, update => {
    updates.push(update);
    // Send real-time updates
    broadcastUpdate(update);
  });

  // Save to history
  await StorageManager.addHistory({
    type: 'prompt',
    input: validation.value,
    results,
    tabUrl: tab.url,
    tabTitle: tab.title
  });

  return { success: true, results, updates };
}

async function handleExecuteCode(message, _sender) {
  // Validate code
  const validation = InputValidator.validateCode(message.code);
  if (!validation.valid) {
    throw new ValidationError(validation.error, 'code', message.code);
  }

  const tab = await getActiveTab();
  if (!tab) {
    throw new Error('No active tab found');
  }

  const updates = [];
  const results = await agent.runCode(tab.id, validation.value, update => {
    updates.push(update);
    broadcastUpdate(update);
  });

  // Save to history
  await StorageManager.addHistory({
    type: 'code',
    input: validation.value,
    results,
    tabUrl: tab.url,
    tabTitle: tab.title
  });

  return { success: true, results, updates };
}

async function handleStopAgent() {
  agent.stop();
  return { success: true, message: 'Agent stopped' };
}

async function handleExecuteTask(message, sender) {
  const tasks = await StorageManager.getTasks();
  const task = tasks.find(t => t.id === message.taskId);

  if (!task) {
    throw new Error('Task not found');
  }

  // Record execution
  await StorageManager.recordExecution(task.id);

  // Execute based on type
  if (task.type === 'prompt') {
    return handleExecutePrompt({ prompt: task.content }, sender);
  } else {
    return handleExecuteCode({ code: task.content }, sender);
  }
}

async function handleSaveTask(message) {
  // Validate task
  const validation = InputValidator.validateTask(message.task);
  if (!validation.valid) {
    throw new ValidationError(validation.error);
  }

  const task = await StorageManager.saveTask(validation.value);
  return { success: true, task };
}

async function handleGetTasks() {
  const tasks = await StorageManager.getTasks();
  return { success: true, tasks };
}

async function handleDeleteTask(message) {
  const deleted = await StorageManager.deleteTask(message.taskId);
  return { success: true, deleted };
}

async function handleUpdateTask(message) {
  // Validate updates if present
  if (message.updates.name !== undefined) {
    const nameValidation = InputValidator.validateTaskName(message.updates.name);
    if (!nameValidation.valid) {
      throw new ValidationError(`Invalid name: ${nameValidation.error}`);
    }
    message.updates.name = nameValidation.value;
  }

  if (message.updates.description !== undefined) {
    const descValidation = InputValidator.validateDescription(message.updates.description);
    if (!descValidation.valid) {
      throw new ValidationError(`Invalid description: ${descValidation.error}`);
    }
    message.updates.description = descValidation.value;
  }

  const updated = await StorageManager.updateTask(message.taskId, message.updates);
  return { success: true, task: updated };
}

async function handleGetSettings() {
  const [apiKey, apiBaseUrl, model] = await Promise.all([
    StorageManager.getApiKey(),
    StorageManager.getApiBaseUrl(),
    StorageManager.getModel()
  ]);

  return {
    success: true,
    settings: {
      apiKey,
      apiBaseUrl,
      model
    }
  };
}

async function handleSaveSettings(message) {
  // Validate settings
  if (message.settings.apiKey !== undefined) {
    const validation = InputValidator.validateApiKey(message.settings.apiKey);
    if (!validation.valid) {
      throw new ValidationError(`Invalid API key: ${validation.error}`);
    }
    await StorageManager.saveApiKey(validation.value);
  }

  if (message.settings.apiBaseUrl !== undefined) {
    const validation = InputValidator.validateUrl(message.settings.apiBaseUrl);
    if (!validation.valid) {
      throw new ValidationError(`Invalid API URL: ${validation.error}`);
    }
    await StorageManager.saveApiBaseUrl(validation.value);
  }

  if (message.settings.model !== undefined) {
    if (typeof message.settings.model !== 'string' || message.settings.model.trim().length === 0) {
      throw new ValidationError('Model name must be a non-empty string');
    }
    await StorageManager.saveModel(message.settings.model.trim());
  }

  return { success: true };
}

async function handleGetHistory() {
  const history = await StorageManager.getHistory();
  return { success: true, history };
}

async function handleClearHistory() {
  await StorageManager.clearHistory();
  return { success: true };
}

async function handleTestApiConnection() {
  const { apiClient } = await import('../lib/api-client.js');
  const result = await apiClient.testConnection();
  return result;
}

/**
 * Test API connection with provided parameters (without storing)
 * This is safer than testing in the settings page where the key could be exposed
 * @param {Object} message - Message with apiBaseUrl, apiKey, model
 * @returns {Promise<Object>}
 */
async function handleTestApiConnectionWithParams(message) {
  const { apiBaseUrl, apiKey, model } = message;

  // Validate inputs
  if (!apiBaseUrl || !apiKey || !model) {
    throw new ValidationError('All API parameters are required for testing');
  }

  const urlValidation = InputValidator.validateUrl(apiBaseUrl);
  if (!urlValidation.valid) {
    throw new ValidationError(`Invalid API URL: ${urlValidation.error}`);
  }

  const keyValidation = InputValidator.validateApiKey(apiKey);
  if (!keyValidation.valid) {
    throw new ValidationError(`Invalid API key: ${keyValidation.error}`);
  }

  try {
    const response = await fetch(`${urlValidation.value}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${keyValidation.value}`
      },
      body: JSON.stringify({
        model: model.trim(),
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 5
      })
    });

    if (response.ok) {
      return { success: true, message: 'Connection successful' };
    }

    const errorData = await response.json().catch(() => ({}));
    const errorMsg = errorData.error?.message || response.statusText;
    throw new ApiError(errorMsg, response.status, errorData);
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(`Connection failed: ${error.message}`);
  }
}

async function handleExportTasks() {
  const tasks = await StorageManager.getTasks();
  const exportData = {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    tasks
  };
  return { success: true, data: exportData };
}

async function handleImportTasks(message) {
  if (!message.data || !Array.isArray(message.data.tasks)) {
    throw new ValidationError('Invalid import data format');
  }

  const importedTasks = [];
  const errors = [];

  for (const task of message.data.tasks) {
    try {
      const validation = InputValidator.validateTask(task);
      if (validation.valid) {
        const saved = await StorageManager.saveTask(validation.value);
        importedTasks.push(saved);
      } else {
        errors.push({ task: task.name, error: validation.error });
      }
    } catch (error) {
      errors.push({ task: task.name, error: error.message });
    }
  }

  return {
    success: true,
    imported: importedTasks.length,
    errors: errors.length > 0 ? errors : undefined
  };
}

// ===== Utility Functions =====

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function broadcastUpdate(update) {
  chrome.runtime
    .sendMessage({
      action: 'agent_update',
      update
    })
    .catch(() => {
      // Ignore if no listeners (popup closed)
    });
}

// ===== Multi-Tab Handlers =====

async function handleMultiTabExecute(message) {
  const { task } = message;

  if (!task || !task.content) {
    throw new ValidationError('Task content is required', 'task', task);
  }

  const result = await multiTabCoordinator.executeOnTabs(task);
  return { success: true, result };
}

async function handleMultiTabStatus(message) {
  const { taskId } = message;

  if (taskId) {
    const status = multiTabCoordinator.getTaskStatus(taskId);
    return { success: true, status };
  }

  // Return all active tasks
  const activeTasks = multiTabCoordinator.getActiveTasks();
  return { success: true, activeTasks };
}

async function handleMultiTabCancel(message) {
  const { taskId } = message;

  if (!taskId) {
    throw new ValidationError('Task ID is required', 'taskId', taskId);
  }

  const result = await multiTabCoordinator.cancelTask(taskId);
  return { success: true, cancelled: result };
}

// ===== Context Menu =====

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'chrome-agent-execute',
    title: 'Execute with Chrome Agent',
    contexts: ['selection']
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'chrome-agent-execute' && info.selectionText) {
    try {
      // Validate selection text
      const validation = InputValidator.validatePrompt(info.selectionText);
      if (!validation.valid) {
        console.error('Invalid selection:', validation.error);
        // Notify user of validation error
        broadcastUpdate({
          type: 'error',
          message: `Invalid selection: ${validation.error}`
        });
        return;
      }

      await agent.runPrompt(tab.id, validation.value, update => {
        broadcastUpdate(update);
      });
    } catch (error) {
      // Log and broadcast error
      const normalized = ErrorHandler.normalize(error);
      ErrorHandler.log(error, { context: 'context_menu', selectionText: info.selectionText });

      broadcastUpdate({
        type: 'error',
        message: normalized.message,
        code: normalized.code
      });
    }
  }
});

// ===== Keep-alive for Service Worker =====

// Service workers can be terminated after 30 seconds of inactivity
// This keeps the worker alive during long-running tasks
setInterval(() => {
  if (agent.isRunning) {
    chrome.runtime.getPlatformInfo(() => {
      // Ping to keep alive
    });
  }
}, 20000);

// ===== Cleanup on Service Worker Suspend =====

// Note: Service Workers don't have a reliable "beforeunload" event
// We handle cleanup through the PageAnalyzer's automatic interval
// and tab removal/navigation listeners

// Self-message handler for testing cleanup
self.addEventListener('message', event => {
  if (event.data === 'cleanup') {
    PageAnalyzer.stopCleanup();
  }
});
