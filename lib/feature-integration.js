/**
 * Feature Integration Module
 * Integrates V4 features (Command Palette, Streaming UI, Element Selector, etc.)
 * into the existing sidepanel interface
 */

import { CommandPalette, addCommandPaletteStyles, DEFAULT_COMMANDS } from './command-palette.js';
import { StreamingResponseUI, addStreamingUIStyles } from './streaming-ui.js';
import { getGlobalStateSync, StateKeys } from './state-sync.js';
import { enableDebugMode, toggleDebugPanel, isDebugEnabled } from './debug-mode.js';
import { uiLogger } from './logger.js';

/**
 * FeatureIntegrator - Main integration class
 */
export class FeatureIntegrator {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.container - Main container element
   * @param {Object} options.agentUI - AgentUI instance
   * @param {Object} options.tabManager - TabManager instance
   * @param {Object} options.codeEditor - CodeEditor instance
   * @param {Object} options.promptEditor - PromptEditor instance
   */
  constructor(options = {}) {
    this.options = options;
    this.commandPalette = null;
    this.streamingUI = null;
    this.stateSync = null;
    this.isInitialized = false;
  }

  /**
   * Initialize all features
   */
  async init() {
    if (this.isInitialized) return;

    try {
      // Add styles
      addCommandPaletteStyles();
      addStreamingUIStyles();

      // Initialize state sync
      this.initStateSync();

      // Initialize command palette
      this.initCommandPalette();

      // Initialize streaming UI
      this.initStreamingUI();

      // Initialize debug mode (in development)
      this.initDebugMode();

      // Setup keyboard shortcuts
      this.setupKeyboardShortcuts();

      this.isInitialized = true;
      uiLogger.info('Feature integration completed');
    } catch (error) {
      uiLogger.error('Feature integration failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Initialize state sync
   */
  initStateSync() {
    this.stateSync = getGlobalStateSync();

    // Subscribe to theme changes
    this.stateSync.subscribe(StateKeys.UI_THEME, change => {
      this.applyTheme(change.value);
    });

    // Subscribe to agent state changes
    this.stateSync.subscribe(StateKeys.AGENT_RUNNING, change => {
      this.onAgentStateChange(change.value);
    });
  }

  /**
   * Initialize command palette
   */
  initCommandPalette() {
    const commands = this.buildCommands();

    this.commandPalette = new CommandPalette({
      container: document.body,
      commands,
      maxResults: 12,
      onSelect: command => {
        uiLogger.info('Command selected', { id: command.id });
      }
    });
  }

  /**
   * Build command list
   */
  buildCommands() {
    const { agentUI, tabManager, codeEditor, promptEditor } = this.options;

    return [
      // Run commands
      {
        id: 'run',
        label: 'Run Current',
        description: 'Execute current prompt or code',
        category: 'action',
        icon: '▶️',
        shortcut: 'Ctrl+Enter',
        keywords: ['execute', 'start'],
        handler: () => {
          const tab = tabManager?.getCurrentTab();
          if (tab === 'prompt') {
            this.options.onRunPrompt?.();
          } else {
            this.options.onRunCode?.();
          }
        }
      },

      // Save command
      {
        id: 'save',
        label: 'Save as Task',
        description: 'Save current content as task',
        category: 'action',
        icon: '💾',
        shortcut: 'Ctrl+S',
        handler: () => {
          this.options.onSave?.();
        }
      },

      // Clear output
      {
        id: 'clear',
        label: 'Clear Output',
        description: 'Clear the output panel',
        category: 'action',
        icon: '🗑️',
        shortcut: 'Ctrl+L',
        handler: () => {
          agentUI?.clearOutput();
        }
      },

      // Navigation commands
      {
        id: 'goto-prompt',
        label: 'Go to Prompt',
        description: 'Switch to prompt tab',
        category: 'navigation',
        icon: '💬',
        shortcut: 'Ctrl+1',
        handler: () => {
          tabManager?.switchTo('prompt');
          promptEditor?.focus();
        }
      },

      {
        id: 'goto-code',
        label: 'Go to Code',
        description: 'Switch to code tab',
        category: 'navigation',
        icon: '📝',
        shortcut: 'Ctrl+2',
        handler: () => {
          tabManager?.switchTo('code');
          codeEditor?.focus();
        }
      },

      // Open pages
      {
        id: 'open-tasks',
        label: 'Open Tasks',
        description: 'Open task management page',
        category: 'navigation',
        icon: '📋',
        shortcut: 'Ctrl+T',
        handler: () => {
          chrome.tabs.create({ url: chrome.runtime.getURL('tasks/tasks.html') });
        }
      },

      {
        id: 'open-settings',
        label: 'Open Settings',
        description: 'Open settings page',
        category: 'navigation',
        icon: '⚙️',
        shortcut: 'Ctrl+,',
        handler: () => {
          chrome.tabs.create({ url: chrome.runtime.getURL('settings/settings.html') });
        }
      },

      {
        id: 'open-history',
        label: 'Open History',
        description: 'Open execution history',
        category: 'navigation',
        icon: '📜',
        handler: () => {
          chrome.tabs.create({ url: chrome.runtime.getURL('history/history.html') });
        }
      },

      // Theme toggle
      {
        id: 'toggle-theme',
        label: 'Toggle Theme',
        description: 'Switch between light and dark',
        category: 'setting',
        icon: '🌓',
        keywords: ['dark', 'light', 'mode'],
        handler: () => {
          this.toggleTheme();
        }
      },

      // Debug panel
      {
        id: 'toggle-debug',
        label: 'Toggle Debug Panel',
        description: 'Open/close debug panel',
        category: 'setting',
        icon: '🐛',
        shortcut: 'Ctrl+Shift+D',
        handler: () => {
          toggleDebugPanel();
        }
      },

      // State management
      {
        id: 'export-state',
        label: 'Export State',
        description: 'Export current state as JSON',
        category: 'task',
        icon: '📤',
        handler: () => {
          this.exportState();
        }
      },

      {
        id: 'clear-state',
        label: 'Clear State',
        description: 'Reset all state to defaults',
        category: 'task',
        icon: '🔄',
        handler: () => {
          this.stateSync?.clear();
          agentUI?.showNotification('State cleared');
        }
      }
    ];
  }

  /**
   * Initialize streaming UI
   */
  initStreamingUI() {
    const outputElement = this.options.outputElement;
    if (!outputElement) return;

    this.streamingUI = new StreamingResponseUI({
      container: outputElement,
      onCodeBlock: (type, data) => {
        if (type === 'complete') {
          // Auto-execute code blocks if enabled
          uiLogger.info('Code block complete', { language: data.language });
        }
      },
      onComplete: () => {
        this.stateSync?.set(StateKeys.AGENT_RUNNING, false);
      }
    });
  }

  /**
   * Initialize debug mode
   */
  initDebugMode() {
    // Enable in development or when explicitly requested
    const isDev = typeof process !== 'undefined' && process.env?.NODE_ENV === 'development';

    if (isDev && !isDebugEnabled?.()) {
      enableDebugMode({
        logLevel: 'debug',
        showTimings: true,
        showMemory: true
      });
    }
  }

  /**
   * Setup keyboard shortcuts
   */
  setupKeyboardShortcuts() {
    document.addEventListener('keydown', e => {
      const isMod = e.ctrlKey || e.metaKey;
      const isShift = e.shiftKey;

      // Ctrl/Cmd + Shift + P - Open command palette (VS Code style)
      if (isMod && isShift && e.key === 'P') {
        e.preventDefault();
        this.commandPalette?.toggle();
        return;
      }

      // Ctrl/Cmd + Shift + D - Toggle debug panel
      if (isMod && isShift && e.key === 'D') {
        e.preventDefault();
        toggleDebugPanel();
        return;
      }
    });
  }

  /**
   * Toggle theme
   */
  toggleTheme() {
    const current = this.stateSync?.get(StateKeys.UI_THEME, 'light');
    const newTheme = current === 'light' ? 'dark' : 'light';
    this.stateSync?.set(StateKeys.UI_THEME, newTheme);
    this.applyTheme(newTheme);
  }

  /**
   * Apply theme
   */
  applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
  }

  /**
   * Handle agent state change
   */
  onAgentStateChange(running) {
    // Update UI state
    const { agentUI } = this.options;
    if (agentUI) {
      agentUI.isRunning = running;
    }
  }

  /**
   * Export state
   */
  exportState() {
    const state = this.stateSync?.getState() || {};
    const json = JSON.stringify(state, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `agentab-state-${Date.now()}.json`;
    a.click();

    URL.revokeObjectURL(url);
    this.options.agentUI?.showNotification('State exported');
  }

  /**
   * Get streaming UI for agent responses
   */
  getStreamingUI() {
    return this.streamingUI;
  }

  /**
   * Start streaming response
   */
  startStreamingResponse() {
    if (!this.streamingUI) {
      this.initStreamingUI();
    }
    this.streamingUI?.startResponse();
    this.stateSync?.set(StateKeys.AGENT_RUNNING, true);
  }

  /**
   * Handle streaming chunk
   */
  handleStreamingChunk(chunk) {
    this.streamingUI?.handleChunk(chunk);
  }

  /**
   * Complete streaming response
   */
  completeStreamingResponse() {
    this.streamingUI?.complete();
    this.stateSync?.set(StateKeys.AGENT_RUNNING, false);
  }

  /**
   * Show streaming error
   */
  showStreamingError(message) {
    this.streamingUI?.showError(message);
    this.stateSync?.set(StateKeys.AGENT_RUNNING, false);
  }

  /**
   * Open command palette
   */
  openCommandPalette(initialQuery = '') {
    this.commandPalette?.open(initialQuery);
  }

  /**
   * Register custom command
   */
  registerCommand(command) {
    this.commandPalette?.register(command);
  }

  /**
   * Unregister command
   */
  unregisterCommand(id) {
    this.commandPalette?.unregister(id);
  }

  /**
   * Update state
   */
  setState(key, value) {
    this.stateSync?.set(key, value);
  }

  /**
   * Get state
   */
  getState(key, defaultValue) {
    return this.stateSync?.get(key, defaultValue);
  }

  /**
   * Destroy
   */
  destroy() {
    this.commandPalette?.destroy();
    this.streamingUI?.clear();
    this.stateSync?.destroy();
    this.isInitialized = false;
  }
}

/**
 * Create and initialize feature integrator
 */
export function createFeatureIntegrator(options) {
  const integrator = new FeatureIntegrator(options);
  return integrator;
}

/**
 * Quick integration helper for sidepanel
 */
export async function integrateFeatures(options) {
  const integrator = createFeatureIntegrator(options);
  await integrator.init();
  return integrator;
}
