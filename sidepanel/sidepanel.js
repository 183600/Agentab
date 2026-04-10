// sidepanel/sidepanel.js - Sidepanel implementation using shared components

import {
  AgentUI,
  SaveTaskDialog,
  TabManager,
  CodeEditor,
  KeyboardShortcuts,
  setupAgentMessageListener,
  addAnimationStyles
} from '../lib/ui-components.js';
import { snippetLibrary, getCategoriesWithLabels } from '../lib/snippets.js';
import { templateLibrary, getTemplateCategoriesWithMeta } from '../lib/templates.js';
import { AutocompleteUI, autocompleteEngine } from '../lib/autocomplete.js';
import { uiLogger } from '../lib/logger.js';

/**
 * Debounce function to limit execution rate
 * @param {Function} fn - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {Function}
 */
function debounce(fn, delay = 300) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Setup keyboard navigation for a list panel (roving tabindex pattern)
 * @param {HTMLElement} panel - Panel element
 * @param {string} itemSelector - Selector for navigable items
 * @param {Function} onSelect - Callback when item is selected (Enter/Space)
 * @param {Function} onClose - Callback when panel should close (Escape)
 */
function setupKeyboardNavigation(panel, itemSelector, onSelect, onClose) {
  let focusedIndex = -1;

  function getItems() {
    return Array.from(panel.querySelectorAll(itemSelector));
  }

  function focusItem(index) {
    const items = getItems();
    if (items.length === 0) return;

    // Update tabindex
    items.forEach((item, i) => {
      item.setAttribute('tabindex', i === index ? '0' : '-1');
    });

    // Focus the item
    if (index >= 0 && index < items.length) {
      items[index].focus();
      focusedIndex = index;
    }
  }

  function focusFirst() {
    focusItem(0);
  }

  function focusLast() {
    const items = getItems();
    focusItem(items.length - 1);
  }

  function focusNext() {
    const items = getItems();
    const nextIndex = (focusedIndex + 1) % items.length;
    focusItem(nextIndex);
  }

  function focusPrev() {
    const items = getItems();
    const prevIndex = focusedIndex <= 0 ? items.length - 1 : focusedIndex - 1;
    focusItem(prevIndex);
  }

  // Handle keyboard events
  panel.addEventListener('keydown', e => {
    const items = getItems();

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (focusedIndex === -1) {
          focusFirst();
        } else {
          focusNext();
        }
        break;

      case 'ArrowUp':
        e.preventDefault();
        if (focusedIndex === -1) {
          focusLast();
        } else {
          focusPrev();
        }
        break;

      case 'Home':
        e.preventDefault();
        focusFirst();
        break;

      case 'End':
        e.preventDefault();
        focusLast();
        break;

      case 'Enter':
      case ' ':
        if (focusedIndex >= 0 && focusedIndex < items.length) {
          e.preventDefault();
          onSelect(items[focusedIndex], focusedIndex);
        }
        break;

      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  });

  // Handle click to update focus
  panel.addEventListener('click', e => {
    const item = e.target.closest(itemSelector);
    if (item) {
      const items = getItems();
      const index = items.indexOf(item);
      if (index !== -1) {
        focusItem(index);
      }
    }
  });

  // Return methods for external control
  return {
    focusFirst,
    focusLast,
    focusItem,
    reset: () => {
      focusedIndex = -1;
      getItems().forEach(item => item.setAttribute('tabindex', '-1'));
    }
  };
}

document.addEventListener('DOMContentLoaded', async () => {
  // Localize document
  localizeDocument();

  // Initialize animations
  addAnimationStyles();

  // === Theme Management ===
  const btnTheme = document.getElementById('btn-theme');
  const iconSun = btnTheme.querySelector('.icon-sun');
  const iconMoon = btnTheme.querySelector('.icon-moon');

  async function updateThemeUI() {
    const theme = document.documentElement.getAttribute('data-theme') || 'light';
    iconSun.classList.toggle('hidden', theme === 'dark');
    iconMoon.classList.toggle('hidden', theme === 'light');
  }

  btnTheme.addEventListener('click', async () => {
    await toggleTheme();
    await updateThemeUI();
  });

  await initTheme();
  await updateThemeUI();

  // === Shortcuts Panel ===
  const btnShortcuts = document.getElementById('btn-shortcuts');
  let shortcutsPanel = null;

  btnShortcuts.addEventListener('click', () => {
    if (!shortcutsPanel) {
      shortcutsPanel = createShortcutsPanel();
      document.body.appendChild(shortcutsPanel);
    }
    shortcutsPanel.classList.toggle('hidden');
  });

  function createShortcutsPanel() {
    const panel = document.createElement('div');
    panel.className = 'shortcuts-panel';
    panel.innerHTML = `
      <div class="shortcuts-header">
        <h3>${i18n('shortcutsTitle')}</h3>
        <button class="icon-btn small close-shortcuts">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div class="shortcuts-list">
        <div class="shortcut-item">
          <kbd>Ctrl</kbd> + <kbd>Enter</kbd>
          <span>${i18n('shortcutRun')}</span>
        </div>
        <div class="shortcut-item">
          <kbd>Tab</kbd>
          <span>${i18n('shortcutTab')}</span>
        </div>
        <div class="shortcut-item">
          <kbd>Esc</kbd>
          <span>${i18n('shortcutClose')}</span>
        </div>
      </div>
    `;
    panel.querySelector('.close-shortcuts').addEventListener('click', () => {
      panel.classList.add('hidden');
    });
    return panel;
  }

  // === Initialize UI Components ===
  const agentUI = new AgentUI({
    outputSection: document.getElementById('output-section'),
    outputContent: document.getElementById('output-content'),
    clearOutputBtn: document.getElementById('btn-clear-output')
  });

  const tabManager = new TabManager({
    tabs: document.querySelectorAll('.tab'),
    onSwitch: _tabId => {
      // Could add analytics or state management here
    }
  });

  const saveDialog = new SaveTaskDialog({
    dialog: document.getElementById('save-dialog'),
    nameInput: document.getElementById('task-name'),
    descInput: document.getElementById('task-description'),
    typeBadge: document.getElementById('task-type-badge'),
    contentPreview: document.getElementById('task-content-preview'),
    closeBtn: document.getElementById('btn-close-save-dialog'),
    cancelBtn: document.getElementById('btn-cancel-save'),
    confirmBtn: document.getElementById('btn-confirm-save'),
    onConfirm: async task => {
      try {
        const response = await chrome.runtime.sendMessage({
          action: 'save_task',
          task
        });
        if (response.success) {
          agentUI.showNotification(i18n('taskSaved'));
        }
      } catch (e) {
        agentUI.showNotification(i18n('taskSaveFailed', [e.message]), 'error');
      }
    }
  });

  const promptEditor = new CodeEditor({
    textarea: document.getElementById('prompt-input')
  });

  const codeEditor = new CodeEditor({
    textarea: document.getElementById('code-input')
  });

  // Setup autocomplete for code editor
  try {
    new AutocompleteUI(document.getElementById('code-input'), autocompleteEngine);
    uiLogger.info('Autocomplete enabled for code editor');
  } catch (e) {
    uiLogger.warn('Failed to initialize autocomplete', { error: e.message });
  }

  // Setup message listener
  setupAgentMessageListener(agentUI);

  // === Elements ===
  const btnRunPrompt = document.getElementById('btn-run-prompt');
  const btnRunCode = document.getElementById('btn-run-code');
  const btnStopPrompt = document.getElementById('btn-stop-prompt');
  const btnStopCode = document.getElementById('btn-stop-code');
  const btnSavePrompt = document.getElementById('btn-save-prompt');
  const btnSaveCode = document.getElementById('btn-save-code');
  const btnTasks = document.getElementById('btn-tasks');
  const btnHistory = document.getElementById('btn-history');
  const btnSettings = document.getElementById('btn-settings');

  // === Keyboard Shortcuts ===
  new KeyboardShortcuts({
    onRun: () => {
      const activeTab = tabManager.getCurrentTab();
      if (activeTab === 'prompt') {
        runPrompt();
      } else {
        runCode();
      }
    },
    onStop: () => {
      if (agentUI.isRunning) {
        stopAgent();
      }
    },
    onClear: () => {
      agentUI.clearOutput();
    },
    onSave: () => {
      const activeTab = tabManager.getCurrentTab();
      const content =
        activeTab === 'prompt' ? promptEditor.getValue().trim() : codeEditor.getValue().trim();
      if (content) {
        saveDialog.open(activeTab, content);
      } else {
        agentUI.showNotification(
          activeTab === 'prompt' ? i18n('enterPromptFirst') : i18n('enterCodeFirst'),
          'error'
        );
      }
    },
    onFocusPrompt: () => {
      tabManager.switchTo('prompt');
      promptEditor.focus();
    },
    onFocusCode: () => {
      tabManager.switchTo('code');
      codeEditor.focus();
    },
    onOpenTasks: () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('tasks/tasks.html') });
    },
    onOpenSettings: () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('settings/settings.html') });
    }
  });

  // === Run Prompt ===
  async function runPrompt() {
    const prompt = promptEditor.getValue().trim();
    if (!prompt || agentUI.isRunning) return;

    agentUI.setRunningState(true, { run: btnRunPrompt, stop: btnStopPrompt });
    agentUI.clearOutput();

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'execute_prompt',
        prompt
      });

      if (!response.success && response.error) {
        agentUI.addOutput(
          'error',
          `
          <div class="label">❌ ${i18n('error')}</div>
          <div>${escapeHtml(response.error)}</div>
        `
        );
      }
    } catch (e) {
      agentUI.addOutput(
        'error',
        `
        <div class="label">❌ ${i18n('error')}</div>
        <div>${escapeHtml(e.message)}</div>
      `
      );
    } finally {
      agentUI.setRunningState(false, { run: btnRunPrompt, stop: btnStopPrompt });
    }
  }

  btnRunPrompt.addEventListener('click', runPrompt);

  // === Stop Agent ===
  async function stopAgent() {
    try {
      await chrome.runtime.sendMessage({ action: 'stop_agent' });
      agentUI.setRunningState(false, { run: btnRunPrompt, stop: btnStopPrompt });
      agentUI.setRunningState(false, { run: btnRunCode, stop: btnStopCode });
      agentUI.addOutput(
        'error',
        `
        <div class="label">⏹️ ${i18n('stopped')}</div>
        <div>${i18n('agentStopped')}</div>
      `
      );
    } catch (e) {
      console.error('Failed to stop agent:', e);
    }
  }

  btnStopPrompt.addEventListener('click', stopAgent);

  // === Run Code ===
  async function runCode() {
    const code = codeEditor.getValue().trim();
    if (!code || agentUI.isRunning) return;

    agentUI.setRunningState(true, { run: btnRunCode, stop: btnStopCode });
    agentUI.clearOutput();

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'execute_code',
        code
      });

      if (!response.success && response.error) {
        agentUI.addOutput(
          'error',
          `
          <div class="label">❌ ${i18n('error')}</div>
          <div>${escapeHtml(response.error)}</div>
        `
        );
      }
    } catch (e) {
      agentUI.addOutput(
        'error',
        `
        <div class="label">❌ ${i18n('error')}</div>
        <div>${escapeHtml(e.message)}</div>
      `
      );
    } finally {
      agentUI.setRunningState(false, { run: btnRunCode, stop: btnStopCode });
    }
  }

  btnRunCode.addEventListener('click', runCode);
  btnStopCode.addEventListener('click', stopAgent);

  // === Save Task ===
  btnSavePrompt.addEventListener('click', () => {
    const prompt = promptEditor.getValue().trim();
    if (!prompt) return agentUI.showNotification(i18n('enterPromptFirst'), 'error');
    saveDialog.open('prompt', prompt);
  });

  btnSaveCode.addEventListener('click', () => {
    const code = codeEditor.getValue().trim();
    if (!code) return agentUI.showNotification(i18n('enterCodeFirst'), 'error');
    saveDialog.open('code', code);
  });

  // === Navigation Buttons ===
  btnTasks.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('tasks/tasks.html') });
  });

  btnHistory.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('history/history.html') });
  });

  btnSettings.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('settings/settings.html') });
  });

  // === Snippets Panel ===
  let snippetsPanel = null;
  let snippetsBtn = null;

  // Create snippets button
  function createSnippetsButton() {
    const btn = document.createElement('button');
    btn.id = 'btn-snippets';
    btn.className = 'icon-btn';
    btn.title = i18n('snippetsTitle');
    btn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="8" y1="13" x2="16" y2="13"/>
        <line x1="8" y1="17" x2="12" y2="17"/>
      </svg>
    `;
    return btn;
  }

  // Create snippets panel
  function createSnippetsPanel() {
    const panel = document.createElement('div');
    panel.className = 'snippets-panel';
    panel.innerHTML = `
      <div class="snippets-header">
        <h3>${i18n('snippetsTitle')}</h3>
        <div class="snippets-search">
          <input type="text" placeholder="${i18n('searchSnippets')}" class="snippets-search-input">
        </div>
        <button class="icon-btn small close-snippets">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div class="snippets-categories"></div>
      <div class="snippets-list"></div>
    `;

    // Close button
    panel.querySelector('.close-snippets').addEventListener('click', () => {
      panel.classList.add('hidden');
    });

    // Search functionality with debounce
    const searchInput = panel.querySelector('.snippets-search-input');
    const debouncedSnippetSearch = debounce(query => {
      if (query) {
        const results = snippetLibrary.search(query);
        renderSnippetsList(panel, results);
      } else {
        renderSnippetsCategories(panel);
      }
    }, 300);

    searchInput.addEventListener('input', e => {
      debouncedSnippetSearch(e.target.value.trim());
    });

    return panel;
  }

  // Render snippets categories
  function renderSnippetsCategories(panel) {
    const categoriesEl = panel.querySelector('.snippets-categories');
    const categoriesMeta = getCategoriesWithLabels();
    const categories = snippetLibrary.getCategories();

    categoriesEl.innerHTML = categories
      .map(cat => {
        const meta = categoriesMeta[cat] || { label: cat, icon: '📁' };
        const count = snippetLibrary.getByCategory(cat).length;
        return `
        <button class="snippet-category-btn" data-category="${cat}">
          <span class="category-icon">${meta.icon}</span>
          <span class="category-label">${meta.label}</span>
          <span class="category-count">${count}</span>
        </button>
      `;
      })
      .join('');

    // Add click handlers
    categoriesEl.querySelectorAll('.snippet-category-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const category = btn.dataset.category;
        const snippets = snippetLibrary.getByCategory(category);
        renderSnippetsList(panel, snippets);
      });
    });

    // Clear snippets list
    panel.querySelector('.snippets-list').innerHTML = '';
  }

  // Store keyboard navigation instance
  let snippetsKeyboardNav = null;

  // Render snippets list
  function renderSnippetsList(panel, snippets) {
    const listEl = panel.querySelector('.snippets-list');

    if (snippets.length === 0) {
      listEl.innerHTML = `<div class="snippets-empty">${i18n('noSnippetsFound')}</div>`;
      if (snippetsKeyboardNav) snippetsKeyboardNav.reset();
      return;
    }

    listEl.innerHTML = snippets
      .map(
        (snippet, _index) => `
      <div class="snippet-item"
           data-id="${snippet.id}"
           tabindex="-1"
           role="option"
           aria-label="${escapeHtml(snippet.name)}: ${escapeHtml(snippet.description)}">
        <div class="snippet-info">
          <div class="snippet-name">${escapeHtml(snippet.name)}</div>
          <div class="snippet-desc">${escapeHtml(snippet.description)}</div>
        </div>
        <button class="snippet-insert-btn" title="插入代码" tabindex="-1">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
      </div>
    `
      )
      .join('');

    // Add insert handlers
    listEl.querySelectorAll('.snippet-item').forEach(item => {
      const insertBtn = item.querySelector('.snippet-insert-btn');
      insertBtn.addEventListener('click', e => {
        e.stopPropagation();
        const id = item.dataset.id;
        const snippet = snippetLibrary.get(id);
        if (snippet) {
          insertSnippet(snippet);
          panel.classList.add('hidden');
        }
      });
    });

    // Setup keyboard navigation
    if (!snippetsKeyboardNav) {
      snippetsKeyboardNav = setupKeyboardNavigation(
        panel,
        '.snippet-item',
        item => {
          const snippet = snippetLibrary.get(item.dataset.id);
          if (snippet) {
            insertSnippet(snippet);
            panel.classList.add('hidden');
          }
        },
        () => panel.classList.add('hidden')
      );
    }

    // Set list role and focus first item
    listEl.setAttribute('role', 'listbox');
    listEl.setAttribute('aria-label', i18n('snippetsTitle'));

    // Focus first item after a short delay
    setTimeout(() => snippetsKeyboardNav?.focusFirst(), 50);
  }

  // Insert snippet into code editor
  function insertSnippet(snippet) {
    const currentTab = tabManager.getCurrentTab();
    if (currentTab !== 'code') {
      agentUI.showNotification(i18n('snippetsCodeModeOnly'), 'error');
      return;
    }

    // If snippet has variables, show a simple prompt
    let code = snippet.code;
    if (snippet.variables && snippet.variables.length > 0) {
      const values = {};
      for (const variable of snippet.variables) {
        const value = prompt(`${variable.description}:`, variable.default || '');
        if (value === null) return; // User cancelled
        values[variable.name] = value;
      }
      code = snippet.apply(values);
    }

    const textarea = document.getElementById('code-input');
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = textarea.value.substring(0, start);
    const after = textarea.value.substring(end);

    // Insert with newline padding
    const insert =
      (start > 0 && before[start - 1] !== '\n' ? '\n' : '') +
      code +
      (after[0] !== '\n' && after.length > 0 ? '\n' : '');

    textarea.value = before + insert + after;
    textarea.selectionStart = textarea.selectionEnd = start + insert.length;
    textarea.focus();

    uiLogger.info('Snippet inserted', { snippetId: snippet.id });
    agentUI.showNotification(i18n('snippetInserted', [snippet.name]), 'success');
  }

  // Add snippets button to header
  const headerRight = document.querySelector('.header-right');
  if (headerRight) {
    snippetsBtn = createSnippetsButton();
    headerRight.insertBefore(snippetsBtn, headerRight.firstChild);

    snippetsBtn.addEventListener('click', () => {
      if (!snippetsPanel) {
        snippetsPanel = createSnippetsPanel();
        document.body.appendChild(snippetsPanel);
        renderSnippetsCategories(snippetsPanel);
      }
      snippetsPanel.classList.toggle('hidden');
    });
  }

  // === Templates Panel ===
  let templatesPanel = null;
  let templatesBtn = null;

  // Create templates button
  function createTemplatesButton() {
    const btn = document.createElement('button');
    btn.id = 'btn-templates';
    btn.className = 'icon-btn';
    btn.title = i18n('templatesTitle');
    btn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
        <line x1="3" y1="9" x2="21" y2="9"/>
        <line x1="9" y1="21" x2="9" y2="9"/>
      </svg>
    `;
    return btn;
  }

  // Create templates panel
  function createTemplatesPanel() {
    const panel = document.createElement('div');
    panel.className = 'templates-panel';
    panel.innerHTML = `
      <div class="templates-header">
        <h3>${i18n('templatesTitle')}</h3>
        <div class="templates-search">
          <input type="text" placeholder="${i18n('searchTemplates')}" class="templates-search-input">
        </div>
        <button class="icon-btn small close-templates">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div class="templates-categories"></div>
      <div class="templates-list"></div>
    `;

    panel.querySelector('.close-templates').addEventListener('click', () => {
      panel.classList.add('hidden');
    });

    const searchInput = panel.querySelector('.templates-search-input');
    const debouncedTemplateSearch = debounce(query => {
      if (query) {
        const results = templateLibrary.search(query);
        renderTemplatesList(panel, results);
      } else {
        renderTemplatesCategories(panel);
      }
    }, 300);

    searchInput.addEventListener('input', e => {
      debouncedTemplateSearch(e.target.value.trim());
    });

    return panel;
  }

  // Render templates categories
  function renderTemplatesCategories(panel) {
    const categoriesEl = panel.querySelector('.templates-categories');
    const categoriesMeta = getTemplateCategoriesWithMeta();
    const categories = templateLibrary.getCategories();

    categoriesEl.innerHTML = categories
      .map(cat => {
        const meta = categoriesMeta[cat] || { label: cat, icon: '📁' };
        const count = templateLibrary.getByCategory(cat).length;
        return `
        <button class="template-category-btn" data-category="${cat}">
          <span class="category-icon">${meta.icon}</span>
          <span class="category-label">${meta.label}</span>
          <span class="category-count">${count}</span>
        </button>
      `;
      })
      .join('');

    categoriesEl.querySelectorAll('.template-category-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const category = btn.dataset.category;
        const templates = templateLibrary.getByCategory(category);
        renderTemplatesList(panel, templates);
      });
    });

    panel.querySelector('.templates-list').innerHTML = '';
  }

  // Store keyboard navigation instance
  let templatesKeyboardNav = null;

  // Render templates list
  function renderTemplatesList(panel, templates) {
    const listEl = panel.querySelector('.templates-list');

    if (templates.length === 0) {
      listEl.innerHTML = `<div class="templates-empty">${i18n('noTemplatesFound')}</div>`;
      if (templatesKeyboardNav) templatesKeyboardNav.reset();
      return;
    }

    listEl.innerHTML = templates
      .map(
        (template, _index) => `
      <div class="template-item"
           data-id="${template.id}"
           tabindex="-1"
           role="option"
           aria-label="${escapeHtml(template.name)}: ${escapeHtml(template.description)}">
        <div class="template-info">
          <span class="template-icon">${template.icon}</span>
          <div class="template-name">${escapeHtml(template.name)}</div>
          <div class="template-desc">${escapeHtml(template.description)}</div>
        </div>
        <button class="template-use-btn" title="使用模板" tabindex="-1">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </button>
      </div>
    `
      )
      .join('');

    listEl.querySelectorAll('.template-item').forEach(item => {
      const useBtn = item.querySelector('.template-use-btn');
      useBtn.addEventListener('click', e => {
        e.stopPropagation();
        const id = item.dataset.id;
        const template = templateLibrary.get(id);
        if (template) {
          useTemplate(template);
          panel.classList.add('hidden');
        }
      });
    });

    // Setup keyboard navigation
    if (!templatesKeyboardNav) {
      templatesKeyboardNav = setupKeyboardNavigation(
        panel,
        '.template-item',
        item => {
          const template = templateLibrary.get(item.dataset.id);
          if (template) {
            useTemplate(template);
            panel.classList.add('hidden');
          }
        },
        () => panel.classList.add('hidden')
      );
    }

    // Set list role and focus first item
    listEl.setAttribute('role', 'listbox');
    listEl.setAttribute('aria-label', i18n('templatesTitle'));

    // Focus first item after a short delay
    setTimeout(() => templatesKeyboardNav?.focusFirst(), 50);
  }

  // Use template
  function useTemplate(template) {
    // Switch to appropriate tab
    tabManager.switchTo(template.type);

    // Apply template content
    let content = template.content;
    if (template.variables && template.variables.length > 0) {
      const values = {};
      for (const variable of template.variables) {
        const value = prompt(`${variable.description}:`, variable.default || '');
        if (value === null) return;
        values[variable.name] = value;
      }
      content = template.apply(values);
    }

    // Set content in appropriate editor
    if (template.type === 'prompt') {
      promptEditor.setValue(content);
    } else {
      codeEditor.setValue(content);
    }

    uiLogger.info('Template used', { templateId: template.id });
    agentUI.showNotification(i18n('templateApplied', [template.name]), 'success');
  }

  // Add templates button to header
  if (headerRight) {
    templatesBtn = createTemplatesButton();
    headerRight.insertBefore(templatesBtn, snippetsBtn);

    templatesBtn.addEventListener('click', () => {
      if (!templatesPanel) {
        templatesPanel = createTemplatesPanel();
        document.body.appendChild(templatesPanel);
        renderTemplatesCategories(templatesPanel);
      }
      templatesPanel.classList.toggle('hidden');
    });
  }

  // === Close panels on click outside ===
  document.addEventListener('click', e => {
    if (snippetsPanel && !snippetsPanel.classList.contains('hidden')) {
      if (!snippetsPanel.contains(e.target) && e.target !== snippetsBtn) {
        snippetsPanel.classList.add('hidden');
      }
    }
    if (templatesPanel && !templatesPanel.classList.contains('hidden')) {
      if (!templatesPanel.contains(e.target) && e.target !== templatesBtn) {
        templatesPanel.classList.add('hidden');
      }
    }
  });

  // Log initialization
  uiLogger.info('Sidepanel initialized');
});
