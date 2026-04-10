/**
 * Command Palette - Quick action search interface (VS Code-like)
 * Provides fuzzy search, keyboard navigation, and action grouping
 */

import { escapeHtml } from './ui-components.js';
import { uiLogger } from './logger.js';

/**
 * Fuzzy match algorithm
 * @param {string} query - Search query
 * @param {string} text - Text to match
 * @returns {{score: number, matches: number[]}} Match result with score and indices
 */
export function fuzzyMatch(query, text) {
  const queryLower = query.toLowerCase();
  const textLower = text.toLowerCase();
  const matches = [];
  let score = 0;
  let queryIndex = 0;

  for (let i = 0; i < text.length && queryIndex < queryLower.length; i++) {
    if (textLower[i] === queryLower[queryIndex]) {
      matches.push(i);
      queryIndex++;

      // Bonus for consecutive matches
      if (matches.length > 1 && matches[matches.length - 1] === matches[matches.length - 2] + 1) {
        score += 2;
      }

      // Bonus for match at word start
      if (i === 0 || /\s/.test(text[i - 1]) || /[A-Z]/.test(text[i])) {
        score += 3;
      }

      score += 1;
    }
  }

  // If not all query characters matched
  if (queryIndex < queryLower.length) {
    return { score: 0, matches: [] };
  }

  // Bonus for exact prefix match
  if (textLower.startsWith(queryLower)) {
    score += 10;
  }

  return { score, matches };
}

/**
 * Highlight matched characters in text
 * @param {string} text - Original text
 * @param {number[]} matches - Match indices
 * @returns {string} HTML with highlighted matches
 */
export function highlightMatches(text, matches) {
  if (matches.length === 0) return escapeHtml(text);

  let result = '';
  let lastIndex = 0;

  for (const matchIndex of matches) {
    result += escapeHtml(text.slice(lastIndex, matchIndex));
    result += `<mark class="match">${escapeHtml(text[matchIndex])}</mark>`;
    lastIndex = matchIndex + 1;
  }

  result += escapeHtml(text.slice(lastIndex));
  return result;
}

/**
 * Command definition
 * @typedef {Object} Command
 * @property {string} id - Unique command ID
 * @property {string} label - Display label
 * @property {string} [description] - Optional description
 * @property {string} [category] - Category for grouping
 * @property {string} [icon] - Optional icon (emoji or SVG)
 * @property {string[]} [keywords] - Additional search keywords
 * @property {string} [shortcut] - Keyboard shortcut display
 * @property {Function} handler - Command handler
 * @property {boolean} [enabled] - Whether command is enabled
 */

/**
 * CommandPalette - Main command palette class
 */
export class CommandPalette {
  /**
   * @param {Object} options
   * @param {HTMLElement} [options.container] - Container element
   * @param {Command[]} [options.commands] - Initial commands
   * @param {Object} [options.categories] - Category definitions with icons
   * @param {number} [options.maxResults] - Maximum results to show
   * @param {Function} [options.onOpen] - Callback when palette opens
   * @param {Function} [options.onClose] - Callback when palette closes
   * @param {Function} [options.onSelect] - Callback when command is selected
   */
  constructor(options = {}) {
    this.options = {
      maxResults: 10,
      ...options
    };

    this.commands = new Map();
    this.categories = {
      action: { label: 'Actions', icon: '⚡', order: 1 },
      navigation: { label: 'Navigation', icon: '🔗', order: 2 },
      task: { label: 'Tasks', icon: '📋', order: 3 },
      setting: { label: 'Settings', icon: '⚙️', order: 4 },
      help: { label: 'Help', icon: '❓', order: 5 },
      ...options.categories
    };

    this.isOpen = false;
    this.selectedIndex = 0;
    this.filteredCommands = [];
    this.query = '';

    // Register initial commands
    if (options.commands) {
      options.commands.forEach(cmd => this.register(cmd));
    }

    // Create DOM
    this.element = this.createPalette();
    this.inputElement = this.element.querySelector('.command-palette-input');
    this.resultsElement = this.element.querySelector('.command-palette-results');

    // Bind events
    this.bindEvents();

    // Add to container or document body
    const container = options.container || document.body;
    container.appendChild(this.element);

    uiLogger.info('Command palette initialized', { commandCount: this.commands.size });
  }

  /**
   * Create palette DOM structure
   */
  createPalette() {
    const palette = document.createElement('div');
    palette.className = 'command-palette hidden';
    palette.setAttribute('role', 'dialog');
    palette.setAttribute('aria-modal', 'true');
    palette.setAttribute('aria-label', 'Command Palette');

    palette.innerHTML = `
      <div class="command-palette-backdrop"></div>
      <div class="command-palette-content">
        <div class="command-palette-header">
          <div class="command-palette-search">
            <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input 
              type="text" 
              class="command-palette-input"
              placeholder="Search commands... (Ctrl+Shift+P)"
              autocomplete="off"
              spellcheck="false"
              aria-label="Search commands"
            >
          </div>
        </div>
        <div class="command-palette-results" role="listbox" aria-label="Command results">
          <div class="command-palette-empty">No commands found</div>
        </div>
        <div class="command-palette-footer">
          <span class="hint"><kbd>↑↓</kbd> Navigate</span>
          <span class="hint"><kbd>Enter</kbd> Select</span>
          <span class="hint"><kbd>Esc</kbd> Close</span>
        </div>
      </div>
    `;

    return palette;
  }

  /**
   * Bind event handlers
   */
  bindEvents() {
    // Backdrop click
    this.element.querySelector('.command-palette-backdrop').addEventListener('click', () => {
      this.close();
    });

    // Input events
    this.inputElement.addEventListener('input', e => {
      this.query = e.target.value;
      this.filter();
    });

    this.inputElement.addEventListener('keydown', e => {
      this.handleKeydown(e);
    });

    // Results click
    this.resultsElement.addEventListener('click', e => {
      const item = e.target.closest('.command-item');
      if (item) {
        const id = item.dataset.id;
        this.execute(id);
      }
    });

    // Results hover
    this.resultsElement.addEventListener('mousemove', e => {
      const item = e.target.closest('.command-item');
      if (item) {
        const items = Array.from(this.resultsElement.querySelectorAll('.command-item'));
        const index = items.indexOf(item);
        if (index !== this.selectedIndex) {
          this.setSelectedIndex(index);
        }
      }
    });
  }

  /**
   * Handle keyboard navigation
   */
  handleKeydown(e) {
    const itemCount = this.filteredCommands.length;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (itemCount > 0) {
          this.setSelectedIndex((this.selectedIndex + 1) % itemCount);
        }
        break;

      case 'ArrowUp':
        e.preventDefault();
        if (itemCount > 0) {
          this.setSelectedIndex((this.selectedIndex - 1 + itemCount) % itemCount);
        }
        break;

      case 'Enter':
        e.preventDefault();
        if (this.filteredCommands.length > 0) {
          const selected = this.filteredCommands[this.selectedIndex];
          if (selected) {
            this.execute(selected.id);
          }
        }
        break;

      case 'Escape':
        e.preventDefault();
        this.close();
        break;

      case 'Tab':
        e.preventDefault();
        // Could implement command category cycling here
        break;
    }
  }

  /**
   * Register a command
   * @param {Command} command
   */
  register(command) {
    if (!command.id || !command.label || typeof command.handler !== 'function') {
      throw new Error('Command must have id, label, and handler');
    }

    this.commands.set(command.id, {
      ...command,
      enabled: command.enabled ?? true,
      category: command.category || 'action',
      keywords: command.keywords || []
    });
  }

  /**
   * Unregister a command
   * @param {string} id
   */
  unregister(id) {
    this.commands.delete(id);
  }

  /**
   * Update a command
   * @param {string} id
   * @param {Partial<Command>} updates
   */
  update(id, updates) {
    const command = this.commands.get(id);
    if (command) {
      this.commands.set(id, { ...command, ...updates });
    }
  }

  /**
   * Enable/disable a command
   * @param {string} id
   * @param {boolean} enabled
   */
  setEnabled(id, enabled) {
    this.update(id, { enabled });
  }

  /**
   * Get all commands
   * @returns {Command[]}
   */
  getCommands() {
    return Array.from(this.commands.values());
  }

  /**
   * Filter commands by query
   */
  filter() {
    const query = this.query.trim().toLowerCase();
    const results = [];

    for (const command of this.commands.values()) {
      if (!command.enabled) continue;

      let score = 0;
      let matches = [];

      // Match against label
      const labelResult = fuzzyMatch(query, command.label);
      if (labelResult.score > 0) {
        score = Math.max(score, labelResult.score + 5); // Boost label matches
        matches = labelResult.matches;
      }

      // Match against description
      if (command.description) {
        const descResult = fuzzyMatch(query, command.description);
        if (descResult.score > 0) {
          score = Math.max(score, descResult.score);
        }
      }

      // Match against keywords
      for (const keyword of command.keywords) {
        const keywordResult = fuzzyMatch(query, keyword);
        if (keywordResult.score > 0) {
          score = Math.max(score, keywordResult.score);
        }
      }

      // Show all commands when query is empty
      if (query === '') {
        score = 1;
      }

      if (score > 0) {
        results.push({
          ...command,
          score,
          highlightMatches: matches
        });
      }
    }

    // Sort by score (descending), then by category order, then by label
    results.sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      const catA = this.categories[a.category]?.order || 99;
      const catB = this.categories[b.category]?.order || 99;
      if (catA !== catB) return catA - catB;
      return a.label.localeCompare(b.label);
    });

    // Limit results
    this.filteredCommands = results.slice(0, this.options.maxResults);
    this.selectedIndex = 0;

    this.render();
  }

  /**
   * Render filtered commands
   */
  render() {
    if (this.filteredCommands.length === 0) {
      this.resultsElement.innerHTML = `
        <div class="command-palette-empty">
          <span class="empty-icon">🔍</span>
          <span>No commands found for "${escapeHtml(this.query)}"</span>
        </div>
      `;
      return;
    }

    // Group by category
    const groups = new Map();
    for (const command of this.filteredCommands) {
      const category = command.category;
      if (!groups.has(category)) {
        groups.set(category, []);
      }
      groups.get(category).push(command);
    }

    let html = '';
    let index = 0;

    for (const [category, commands] of groups) {
      const catDef = this.categories[category] || { label: category, icon: '📁' };

      html += `
        <div class="command-group">
          <div class="command-group-header">
            <span class="group-icon">${catDef.icon}</span>
            <span class="group-label">${escapeHtml(catDef.label)}</span>
          </div>
          <div class="command-group-items">
      `;

      for (const command of commands) {
        const isSelected = index === this.selectedIndex;
        const labelHtml = highlightMatches(command.label, command.highlightMatches);

        html += `
          <div class="command-item ${isSelected ? 'selected' : ''}"
               data-id="${escapeHtml(command.id)}"
               role="option"
               aria-selected="${isSelected}"
               tabindex="-1">
            <div class="command-main">
              <span class="command-icon">${command.icon || catDef.icon}</span>
              <span class="command-label">${labelHtml}</span>
              ${command.shortcut ? `<span class="command-shortcut"><kbd>${escapeHtml(command.shortcut)}</kbd></span>` : ''}
            </div>
            ${command.description ? `<div class="command-description">${escapeHtml(command.description)}</div>` : ''}
          </div>
        `;

        index++;
      }

      html += `
          </div>
        </div>
      `;
    }

    this.resultsElement.innerHTML = html;
  }

  /**
   * Set selected index and update UI
   */
  setSelectedIndex(index) {
    this.selectedIndex = index;

    const items = this.resultsElement.querySelectorAll('.command-item');
    items.forEach((item, i) => {
      item.classList.toggle('selected', i === index);
      item.setAttribute('aria-selected', i === index ? 'true' : 'false');
    });

    // Scroll into view
    const selectedItem = items[index];
    if (selectedItem) {
      selectedItem.scrollIntoView({ block: 'nearest' });
    }
  }

  /**
   * Execute a command
   * @param {string} id
   */
  async execute(id) {
    const command = this.commands.get(id);
    if (!command || !command.enabled) return;

    uiLogger.info('Executing command', { id, label: command.label });

    try {
      this.close();

      if (this.options.onSelect) {
        this.options.onSelect(command);
      }

      await command.handler();
    } catch (error) {
      uiLogger.error('Command execution failed', { id, error: error.message });
      throw error;
    }
  }

  /**
   * Open the palette
   */
  open(initialQuery = '') {
    if (this.isOpen) return;

    this.isOpen = true;
    this.query = initialQuery;
    this.element.classList.remove('hidden');

    // Reset and focus input
    this.inputElement.value = initialQuery;
    this.inputElement.focus();

    // Initial filter
    this.filter();

    // Notify
    if (this.options.onOpen) {
      this.options.onOpen();
    }

    uiLogger.debug('Command palette opened');
  }

  /**
   * Close the palette
   */
  close() {
    if (!this.isOpen) return;

    this.isOpen = false;
    this.element.classList.add('hidden');
    this.query = '';
    this.selectedIndex = 0;

    // Notify
    if (this.options.onClose) {
      this.options.onClose();
    }

    uiLogger.debug('Command palette closed');
  }

  /**
   * Toggle the palette
   */
  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  /**
   * Check if palette is open
   * @returns {boolean}
   */
  getIsOpen() {
    return this.isOpen;
  }

  /**
   * Destroy the palette
   */
  destroy() {
    this.close();
    this.element.remove();
    this.commands.clear();
  }
}

/**
 * Default command definitions for Agentab
 */
export const DEFAULT_COMMANDS = [
  // Actions
  {
    id: 'run-prompt',
    label: 'Run Prompt',
    description: 'Execute the current prompt as AI agent',
    category: 'action',
    icon: '▶️',
    shortcut: 'Ctrl+Enter',
    keywords: ['execute', 'agent', 'ai']
  },
  {
    id: 'run-code',
    label: 'Run Code',
    description: 'Execute the current JavaScript code',
    category: 'action',
    icon: '⚡',
    keywords: ['execute', 'javascript', 'script']
  },
  {
    id: 'stop-agent',
    label: 'Stop Agent',
    description: 'Stop the currently running agent',
    category: 'action',
    icon: '⏹️',
    shortcut: 'Esc',
    keywords: ['abort', 'cancel', 'halt']
  },
  {
    id: 'clear-output',
    label: 'Clear Output',
    description: 'Clear the output panel',
    category: 'action',
    icon: '🗑️',
    shortcut: 'Ctrl+L',
    keywords: ['reset', 'clean']
  },
  {
    id: 'save-task',
    label: 'Save as Task',
    description: 'Save current content as a reusable task',
    category: 'action',
    icon: '💾',
    shortcut: 'Ctrl+S',
    keywords: ['store', 'bookmark']
  },

  // Navigation
  {
    id: 'switch-prompt',
    label: 'Go to Prompt Tab',
    description: 'Switch to the prompt input tab',
    category: 'navigation',
    icon: '💬',
    shortcut: 'Ctrl+1',
    keywords: ['prompt', 'tab', 'switch']
  },
  {
    id: 'switch-code',
    label: 'Go to Code Tab',
    description: 'Switch to the code input tab',
    category: 'navigation',
    icon: '📝',
    shortcut: 'Ctrl+2',
    keywords: ['code', 'tab', 'switch']
  },
  {
    id: 'open-tasks',
    label: 'Open Tasks',
    description: 'Open the task management page',
    category: 'navigation',
    icon: '📋',
    shortcut: 'Ctrl+T',
    keywords: ['saved', 'library']
  },
  {
    id: 'open-settings',
    label: 'Open Settings',
    description: 'Open the settings page',
    category: 'navigation',
    icon: '⚙️',
    shortcut: 'Ctrl+,',
    keywords: ['preferences', 'config', 'options']
  },
  {
    id: 'open-history',
    label: 'Open History',
    description: 'Open the execution history page',
    category: 'navigation',
    icon: '📜',
    keywords: ['past', 'records', 'log']
  },

  // Tasks
  {
    id: 'new-task',
    label: 'New Task',
    description: 'Create a new task',
    category: 'task',
    icon: '➕',
    keywords: ['create', 'add']
  },
  {
    id: 'export-tasks',
    label: 'Export Tasks',
    description: 'Export all tasks to JSON file',
    category: 'task',
    icon: '📤',
    keywords: ['download', 'backup']
  },
  {
    id: 'import-tasks',
    label: 'Import Tasks',
    description: 'Import tasks from JSON file',
    category: 'task',
    icon: '📥',
    keywords: ['upload', 'restore']
  },

  // Settings
  {
    id: 'toggle-theme',
    label: 'Toggle Theme',
    description: 'Switch between light and dark theme',
    category: 'setting',
    icon: '🌓',
    keywords: ['dark', 'light', 'mode', 'appearance']
  },
  {
    id: 'test-api',
    label: 'Test API Connection',
    description: 'Test the LLM API connection',
    category: 'setting',
    icon: '🔌',
    keywords: ['connect', 'verify', 'check']
  },

  // Help
  {
    id: 'show-shortcuts',
    label: 'Show Keyboard Shortcuts',
    description: 'Display all available keyboard shortcuts',
    category: 'help',
    icon: '⌨️',
    keywords: ['keybinding', 'help']
  },
  {
    id: 'show-snippets',
    label: 'Browse Code Snippets',
    description: 'Open the code snippets library',
    category: 'help',
    icon: '📄',
    keywords: ['template', 'examples']
  },
  {
    id: 'show-templates',
    label: 'Browse Task Templates',
    description: 'Open the task templates library',
    category: 'help',
    icon: '📑',
    keywords: ['preset', 'examples']
  }
];

/**
 * Add Command Palette styles
 */
export function addCommandPaletteStyles() {
  if (document.getElementById('command-palette-styles')) return;

  const style = document.createElement('style');
  style.id = 'command-palette-styles';
  style.textContent = `
    .command-palette {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 10000;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
    }

    .command-palette.hidden {
      display: none;
    }

    .command-palette-backdrop {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(2px);
    }

    .command-palette-content {
      position: absolute;
      top: 15%;
      left: 50%;
      transform: translateX(-50%);
      width: 90%;
      max-width: 600px;
      background: var(--bg-primary, #fff);
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      overflow: hidden;
    }

    [data-theme="dark"] .command-palette-content {
      background: #1e1e1e;
    }

    .command-palette-header {
      padding: 12px 16px;
      border-bottom: 1px solid var(--border-color, #e0e0e0);
    }

    [data-theme="dark"] .command-palette-header {
      border-bottom-color: #333;
    }

    .command-palette-search {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .search-icon {
      color: var(--text-muted, #888);
      flex-shrink: 0;
    }

    .command-palette-input {
      flex: 1;
      border: none;
      outline: none;
      font-size: 16px;
      background: transparent;
      color: var(--text-primary, #333);
    }

    [data-theme="dark"] .command-palette-input {
      color: #e0e0e0;
    }

    .command-palette-input::placeholder {
      color: var(--text-muted, #888);
    }

    .command-palette-results {
      max-height: 400px;
      overflow-y: auto;
      padding: 8px 0;
    }

    .command-palette-empty {
      padding: 24px;
      text-align: center;
      color: var(--text-muted, #888);
    }

    .empty-icon {
      font-size: 24px;
      margin-right: 8px;
    }

    .command-group-header {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      color: var(--text-muted, #888);
      letter-spacing: 0.5px;
    }

    .group-icon {
      font-size: 12px;
    }

    .command-item {
      padding: 8px 16px;
      cursor: pointer;
      transition: background 0.1s;
    }

    .command-item:hover,
    .command-item.selected {
      background: var(--bg-hover, #f0f0f0);
    }

    [data-theme="dark"] .command-item:hover,
    [data-theme="dark"] .command-item.selected {
      background: #2a2a2a;
    }

    .command-main {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .command-icon {
      font-size: 14px;
      flex-shrink: 0;
    }

    .command-label {
      flex: 1;
      font-size: 14px;
      color: var(--text-primary, #333);
    }

    [data-theme="dark"] .command-label {
      color: #e0e0e0;
    }

    .command-label mark.match {
      background: rgba(255, 200, 0, 0.3);
      color: inherit;
      font-weight: 600;
      border-radius: 2px;
    }

    .command-shortcut {
      flex-shrink: 0;
    }

    .command-shortcut kbd {
      display: inline-block;
      padding: 2px 6px;
      font-size: 11px;
      font-family: inherit;
      background: var(--bg-secondary, #eee);
      border-radius: 4px;
      color: var(--text-muted, #666);
    }

    [data-theme="dark"] .command-shortcut kbd {
      background: #333;
      color: #aaa;
    }

    .command-description {
      margin-top: 2px;
      margin-left: 22px;
      font-size: 12px;
      color: var(--text-muted, #888);
    }

    .command-palette-footer {
      display: flex;
      gap: 16px;
      padding: 8px 16px;
      border-top: 1px solid var(--border-color, #e0e0e0);
      font-size: 11px;
      color: var(--text-muted, #888);
    }

    [data-theme="dark"] .command-palette-footer {
      border-top-color: #333;
    }

    .hint {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .hint kbd {
      display: inline-block;
      padding: 1px 4px;
      font-size: 10px;
      background: var(--bg-secondary, #eee);
      border-radius: 3px;
    }

    [data-theme="dark"] .hint kbd {
      background: #333;
    }
  `;

  document.head.appendChild(style);
}
