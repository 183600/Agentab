// lib/ui-components.js - Shared UI components and functionality

import { SyntaxHighlighter, addHighlightStyles } from './syntax-highlighter.js';
import { StreamingResponseUI, addStreamingUIStyles } from './streaming-ui.js';

/**
 * Escape HTML entities - prevents XSS attacks
 * @param {string} text - Text to escape
 * @returns {string}
 */
export function escapeHtml(text) {
  if (text == null) return '';
  const entities = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return String(text).replace(/[&<>"']/g, char => entities[char]);
}

/**
 * Safe HTML rendering - allows only specific safe HTML patterns
 * Use this when you need to render HTML that has been pre-sanitized
 * @param {string} html - HTML string to render safely
 * @returns {DocumentFragment}
 */
export function safeHtml(html) {
  const template = document.createElement('template');
  template.innerHTML = html;
  return template.content.cloneNode(true);
}

/**
 * Create a safe DOM element with content
 * @param {string} tag - Element tag name
 * @param {Object} attrs - Element attributes
 * @param {string|Element|DocumentFragment} content - Element content
 * @returns {HTMLElement}
 */
export function createElement(tag, attrs = {}, content = null) {
  const element = document.createElement(tag);

  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'className') {
      element.className = value;
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(element.style, value);
    } else if (key.startsWith('on') && typeof value === 'function') {
      element.addEventListener(key.slice(2).toLowerCase(), value);
    } else {
      element.setAttribute(key, value);
    }
  }

  if (content != null) {
    if (typeof content === 'string') {
      element.textContent = content;
    } else if (content instanceof Element || content instanceof DocumentFragment) {
      element.appendChild(content);
    }
  }

  return element;
}
export class AgentUI {
  constructor(options = {}) {
    this.options = {
      outputSection: null,
      outputContent: null,
      clearOutputBtn: null,
      maxOutputEntries: 200, // Maximum output entries before pruning
      pruneBatchSize: 50, // Number of entries to remove when pruning
      ...options
    };

    this.isRunning = false;
    this.currentSaveType = 'prompt';
    this.currentSaveContent = '';
    this.outputCount = 0;
    this.streamingUI = null; // Streaming response UI instance

    // Initialize if elements provided
    if (this.options.outputSection) {
      this.init();
    }
  }

  /**
   * Initialize UI
   */
  init() {
    if (this.options.clearOutputBtn) {
      this.options.clearOutputBtn.addEventListener('click', () => this.clearOutput());
    }
  }

  /**
   * Prune old output entries to prevent DOM bloat
   */
  pruneOutputEntries() {
    const { outputContent, maxOutputEntries, pruneBatchSize } = this.options;
    if (!outputContent) return;

    const children = outputContent.children;
    if (children.length <= maxOutputEntries) return;

    // Remove oldest entries (from the beginning)
    const removeCount = Math.min(
      pruneBatchSize,
      children.length - maxOutputEntries + pruneBatchSize
    );
    for (let i = 0; i < removeCount; i++) {
      if (children[0]) {
        children[0].remove();
        this.outputCount--;
      }
    }

    console.debug(
      `[AgentUI] Pruned ${removeCount} output entries, current count: ${this.outputCount}`
    );
  }

  /**
   * Add output entry
   * @param {string} type - Output type (thinking, executing, success, error)
   * @param {string|HTMLElement|DocumentFragment} content - Content to display
   */
  addOutput(type, content) {
    const { outputSection, outputContent } = this.options;
    if (!outputSection || !outputContent) return;

    // Prune if we've exceeded the limit
    this.pruneOutputEntries();

    outputSection.classList.remove('hidden');
    const entry = document.createElement('div');
    entry.className = `output-entry ${type}`;

    // Safely render content
    if (typeof content === 'string') {
      // Use textContent for plain strings to prevent XSS
      entry.textContent = content;
    } else if (content instanceof Element || content instanceof DocumentFragment) {
      // Safe to append DOM nodes directly
      entry.appendChild(content);
    }

    outputContent.appendChild(entry);
    outputContent.scrollTop = outputContent.scrollHeight;
    this.outputCount++;
  }

  /**
   * Clear all output
   */
  clearOutput() {
    const { outputSection, outputContent } = this.options;
    if (outputContent) outputContent.innerHTML = '';
    if (outputSection) outputSection.classList.add('hidden');
    
    // Clean up streaming UI
    if (this.streamingUI) {
      this.streamingUI.clear();
      this.streamingUI = null;
    }
    
    this.outputCount = 0;
  }

  /**
   * Handle agent update messages
   * @param {Object} update - Update object from agent
   */
  handleAgentUpdate(update) {
    switch (update.type) {
      case 'stream': {
        // Handle streaming response
        if (!this.streamingUI) {
          addStreamingUIStyles();
          const container = document.createElement('div');
          container.className = 'streaming-output';
          this.addOutput('streaming', container);
          
          this.streamingUI = new StreamingResponseUI({
            container,
            onCodeBlock: (type, data) => {
              if (type === 'complete') {
                // Code block is complete, could trigger action
                console.debug('[AgentUI] Code block complete', data.language);
              }
            }
          });
          this.streamingUI.startResponse();
        }
        
        // Add chunk to streaming UI
        this.streamingUI.handleChunk(update.chunk || '');
        break;
      }

      case 'stream_complete': {
        // Complete streaming
        if (this.streamingUI) {
          this.streamingUI.complete();
          this.streamingUI = null;
        }
        break;
      }

      case 'thinking': {
        const fragment = document.createDocumentFragment();
        const spinner = document.createElement('div');
        spinner.className = 'spinner';
        const span = document.createElement('span');
        span.textContent = update.message || '';
        fragment.appendChild(spinner);
        fragment.appendChild(span);
        this.addOutput('thinking', fragment);
        break;
      }

      case 'executing': {
        const fragment = document.createDocumentFragment();
        const label = document.createElement('div');
        label.className = 'label';
        label.textContent = `⚡ ${i18n('execCodeStep', [update.iteration || 1])}`;
        fragment.appendChild(label);

        const explDiv = document.createElement('div');
        explDiv.textContent = update.explanation || '';
        fragment.appendChild(explDiv);

        const codeBlock = document.createElement('div');
        codeBlock.className = 'code-block';
        codeBlock.textContent = update.code || '';
        fragment.appendChild(codeBlock);

        this.addOutput('executing', fragment);
        break;
      }

      case 'executed': {
        const fragment = document.createDocumentFragment();
        const label = document.createElement('div');
        label.className = 'label';

        if (update.result?.success) {
          label.textContent = `✅ ${i18n('execResult')}`;
          fragment.appendChild(label);

          const codeBlock = document.createElement('div');
          codeBlock.className = 'code-block';
          codeBlock.textContent = JSON.stringify(update.result.result, null, 2) || 'undefined';
          fragment.appendChild(codeBlock);

          this.addOutput('success', fragment);
        } else {
          label.textContent = `❌ ${i18n('execError')}`;
          fragment.appendChild(label);

          const errorDiv = document.createElement('div');
          errorDiv.textContent = update.result?.error || i18n('unknownError');
          fragment.appendChild(errorDiv);

          this.addOutput('error', fragment);
        }
        break;
      }

      case 'complete': {
        const fragment = document.createDocumentFragment();
        const label = document.createElement('div');
        label.className = 'label';
        label.textContent = `🎉 ${i18n('taskComplete')}`;
        fragment.appendChild(label);

        const msgDiv = document.createElement('div');
        msgDiv.textContent = update.message || '';
        fragment.appendChild(msgDiv);

        if (update.explanation) {
          const explDiv = document.createElement('div');
          explDiv.className = 'text-muted mt-8';
          explDiv.textContent = update.explanation;
          fragment.appendChild(explDiv);
        }

        this.addOutput('success', fragment);
        break;
      }

      case 'error': {
        const fragment = document.createDocumentFragment();
        const label = document.createElement('div');
        label.className = 'label';
        label.textContent = `❌ ${i18n('error')}`;
        fragment.appendChild(label);

        const msgDiv = document.createElement('div');
        msgDiv.textContent = update.message || '';
        fragment.appendChild(msgDiv);

        this.addOutput('error', fragment);
        break;
      }
    }
  }

  /**
   * Show notification
   * @param {string} message - Message to display
   * @param {string} type - Notification type (success, error, info)
   */
  showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `output-entry ${type}`;
    notification.style.cssText = `
      position: fixed;
      bottom: 16px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 1000;
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 12px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      animation: slideUp 0.3s ease;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.animation = 'fadeOut 0.3s ease forwards';
      setTimeout(() => notification.remove(), 300);
    }, 2000);
  }

  /**
   * Set running state
   * @param {boolean} running - Whether agent is running
   * @param {Object} buttons - Button elements { run, stop }
   */
  setRunningState(running, buttons) {
    this.isRunning = running;
    const { run, stop } = buttons;

    if (run) {
      run.disabled = running;
      run.classList.toggle('hidden', running);
    }
    if (stop) {
      stop.classList.toggle('hidden', !running);
    }
  }
}

/**
 * SaveTaskDialog - Reusable save task dialog
 */
export class SaveTaskDialog {
  constructor(options = {}) {
    this.options = {
      dialog: null,
      nameInput: null,
      descInput: null,
      typeBadge: null,
      contentPreview: null,
      closeBtn: null,
      cancelBtn: null,
      confirmBtn: null,
      ...options
    };

    this.currentType = 'prompt';
    this.currentContent = '';
    this.onConfirm = null;

    if (this.options.dialog) {
      this.init();
    }
  }

  /**
   * Initialize dialog
   */
  init() {
    const { closeBtn, cancelBtn, confirmBtn, nameInput } = this.options;

    if (closeBtn) closeBtn.addEventListener('click', () => this.close());
    if (cancelBtn) cancelBtn.addEventListener('click', () => this.close());

    if (confirmBtn) {
      confirmBtn.addEventListener('click', async () => {
        const name = this.options.nameInput?.value.trim();
        if (!name) {
          this.options.nameInput.style.borderColor = 'var(--error)';
          this.options.nameInput.focus();
          return;
        }

        if (this.onConfirm) {
          await this.onConfirm({
            name,
            type: this.currentType,
            content: this.currentContent,
            description: this.options.descInput?.value.trim() || ''
          });
        }
        this.close();
      });
    }

    // Reset border color on focus
    if (nameInput) {
      nameInput.addEventListener('focus', () => {
        nameInput.style.borderColor = '';
      });
    }
  }

  /**
   * Open dialog
   * @param {string} type - Task type (prompt or code)
   * @param {string} content - Task content
   */
  open(type, content) {
    this.currentType = type;
    this.currentContent = content;

    const { nameInput, descInput, typeBadge, contentPreview, dialog } = this.options;

    if (nameInput) nameInput.value = '';
    if (descInput) descInput.value = '';

    if (typeBadge) {
      typeBadge.textContent = i18n(type === 'prompt' ? 'typePrompt' : 'typeCode');
      typeBadge.className = `task-type-badge ${type}`;
    }

    if (contentPreview) {
      contentPreview.textContent = content.substring(0, 300) + (content.length > 300 ? '...' : '');
    }

    if (dialog) {
      dialog.classList.remove('hidden');
      nameInput?.focus();
    }
  }

  /**
   * Close dialog
   */
  close() {
    this.options.dialog?.classList.add('hidden');
  }
}

/**
 * TabManager - Tab switching functionality
 */
export class TabManager {
  constructor(options = {}) {
    this.options = {
      tabs: null,
      onSwitch: null,
      ...options
    };

    if (this.options.tabs) {
      this.init();
    }
  }

  /**
   * Initialize tab manager
   */
  init() {
    this.options.tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        this.switchTo(tab.dataset.tab);
      });
    });
  }

  /**
   * Switch to a specific tab
   * @param {string} tabId - Tab ID to switch to
   */
  switchTo(tabId) {
    this.options.tabs.forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));

    const activeTab = Array.from(this.options.tabs).find(t => t.dataset.tab === tabId);
    if (activeTab) activeTab.classList.add('active');

    const activeContent = document.getElementById(`tab-${tabId}`);
    if (activeContent) activeContent.classList.add('active');

    if (this.options.onSwitch) {
      this.options.onSwitch(tabId);
    }
  }

  /**
   * Get current active tab
   * @returns {string} Current tab ID
   */
  getCurrentTab() {
    const activeTab = document.querySelector('.tab.active');
    return activeTab?.dataset.tab || 'prompt';
  }
}

/**
 * CodeEditor - Enhanced code editor with syntax highlighting
 */
export class CodeEditor {
  constructor(options = {}) {
    this.options = {
      textarea: null,
      highlightOverlay: null,
      theme: options.theme || 'light',
      debounceDelay: options.debounceDelay || 50,
      ...options
    };

    this.value = '';
    this.highlighter = new SyntaxHighlighter({ theme: this.options.theme });
    this.debounceTimer = null;

    if (this.options.textarea) {
      this.init();
    }
  }

  /**
   * Initialize editor
   */
  init() {
    // Add highlight styles if not present
    addHighlightStyles();

    const { textarea } = this.options;

    // Create highlight overlay
    this.createHighlightOverlay();

    // Tab key support
    textarea.addEventListener('keydown', e => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        textarea.value = textarea.value.substring(0, start) + '  ' + textarea.value.substring(end);
        textarea.selectionStart = textarea.selectionEnd = start + 2;
        this.updateHighlight();
      }
    });

    // Track value changes with debouncing
    textarea.addEventListener('input', () => {
      this.value = textarea.value;
      this.debouncedUpdateHighlight();
    });

    // Sync scroll
    textarea.addEventListener('scroll', () => {
      if (this.overlay) {
        this.overlay.scrollTop = textarea.scrollTop;
        this.overlay.scrollLeft = textarea.scrollLeft;
      }
    });

    // Initial highlight
    this.value = textarea.value;
    this.updateHighlight();
  }

  /**
   * Create highlight overlay element
   */
  createHighlightOverlay() {
    const { textarea } = this.options;

    // Create container if needed
    let container = textarea.parentElement;
    if (!container.classList.contains('code-editor-container')) {
      container = document.createElement('div');
      container.className = 'code-editor-container';
      textarea.parentNode.insertBefore(container, textarea);
      container.appendChild(textarea);
    }

    // Create overlay
    this.overlay = document.createElement('pre');
    this.overlay.className = 'code-highlight-overlay';
    this.overlay.setAttribute('aria-hidden', 'true');

    // Copy textarea styles
    const style = window.getComputedStyle(textarea);
    const copyStyles = [
      'fontFamily',
      'fontSize',
      'fontWeight',
      'lineHeight',
      'letterSpacing',
      'padding',
      'paddingTop',
      'paddingRight',
      'paddingBottom',
      'paddingLeft',
      'border',
      'borderWidth',
      'boxSizing',
      'whiteSpace',
      'wordWrap',
      'wordBreak',
      'tabSize',
      'MozTabSize'
    ];

    copyStyles.forEach(prop => {
      this.overlay.style[prop] = style[prop];
    });

    // Position overlay
    Object.assign(this.overlay.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      overflow: 'auto',
      color: 'transparent',
      background: 'transparent',
      margin: '0',
      zIndex: '1'
    });

    // Make textarea transparent but show caret
    textarea.style.caretColor = textarea.style.caretColor || 'inherit';
    textarea.style.position = 'relative';
    textarea.style.zIndex = '2';
    textarea.style.background = 'transparent';
    textarea.style.color = 'transparent';

    container.insertBefore(this.overlay, textarea);
  }

  /**
   * Debounced highlight update
   */
  debouncedUpdateHighlight() {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.updateHighlight();
    }, this.options.debounceDelay);
  }

  /**
   * Update syntax highlighting
   */
  updateHighlight() {
    if (!this.overlay) return;
    const code = this.value || this.options.textarea?.value || '';
    this.overlay.innerHTML = this.highlighter.highlight(code) + '\n';
  }

  /**
   * Set theme
   * @param {string} theme - 'light' or 'dark'
   */
  setTheme(theme) {
    this.options.theme = theme;
    this.highlighter.options.theme = theme;
    this.updateHighlight();
  }

  /**
   * Get editor value
   * @returns {string}
   */
  getValue() {
    return this.options.textarea?.value || '';
  }

  /**
   * Set editor value
   * @param {string} value
   */
  setValue(value) {
    if (this.options.textarea) {
      this.options.textarea.value = value;
      this.value = value;
      this.updateHighlight();
    }
  }

  /**
   * Focus editor
   */
  focus() {
    this.options.textarea?.focus();
  }
}

/**
 * KeyboardShortcuts - Keyboard shortcut manager
 */
export class KeyboardShortcuts {
  constructor(options = {}) {
    this.options = {
      onRun: null,
      onStop: null,
      onClear: null,
      onSave: null,
      onToggleComment: null,
      onFocusPrompt: null,
      onFocusCode: null,
      onOpenTasks: null,
      onOpenSettings: null,
      ...options
    };

    this.shortcuts = new Map();
    this.enabled = true;
    this.init();
  }

  /**
   * Initialize shortcuts
   */
  init() {
    document.addEventListener('keydown', e => {
      if (!this.enabled) return;

      const isMod = e.ctrlKey || e.metaKey;
      const isShift = e.shiftKey;

      // Ctrl/Cmd + Enter - Run
      if (isMod && e.key === 'Enter') {
        e.preventDefault();
        this.options.onRun?.();
        return;
      }

      // Escape - Stop/Close
      if (e.key === 'Escape') {
        this.options.onStop?.();
        return;
      }

      // Ctrl/Cmd + L - Clear output
      if (isMod && (e.key === 'l' || e.key === 'L')) {
        e.preventDefault();
        this.options.onClear?.();
        return;
      }

      // Ctrl/Cmd + S - Save task
      if (isMod && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        this.options.onSave?.();
        return;
      }

      // Ctrl/Cmd + / - Toggle comment (in code editor)
      if (isMod && (e.key === '/' || e.key === '?')) {
        e.preventDefault();
        this.options.onToggleComment?.();
        return;
      }

      // Ctrl/Cmd + 1 - Focus prompt tab
      if (isMod && e.key === '1') {
        e.preventDefault();
        this.options.onFocusPrompt?.();
        return;
      }

      // Ctrl/Cmd + 2 - Focus code tab
      if (isMod && e.key === '2') {
        e.preventDefault();
        this.options.onFocusCode?.();
        return;
      }

      // Ctrl/Cmd + T - Open tasks
      if (isMod && (e.key === 't' || e.key === 'T') && !isShift) {
        e.preventDefault();
        this.options.onOpenTasks?.();
        return;
      }

      // Ctrl/Cmd + , - Open settings
      if (isMod && e.key === ',') {
        e.preventDefault();
        this.options.onOpenSettings?.();
        return;
      }

      // Check custom shortcuts
      const combo = this.getCombo(e);
      const handler = this.shortcuts.get(combo);
      if (handler) {
        e.preventDefault();
        handler(e);
      }
    });
  }

  /**
   * Get key combo string
   * @param {KeyboardEvent} e - Keyboard event
   * @returns {string}
   */
  getCombo(e) {
    const parts = [];
    if (e.ctrlKey) parts.push('Ctrl');
    if (e.metaKey) parts.push('Cmd');
    if (e.shiftKey) parts.push('Shift');
    if (e.altKey) parts.push('Alt');
    parts.push(e.key);
    return parts.join('+');
  }

  /**
   * Register custom shortcut
   * @param {string} key - Key combination (e.g., 'Ctrl+Shift+A')
   * @param {Function} handler - Handler function
   */
  register(key, handler) {
    this.shortcuts.set(key, handler);
  }

  /**
   * Unregister shortcut
   * @param {string} key - Key combination
   */
  unregister(key) {
    this.shortcuts.delete(key);
  }

  /**
   * Enable/disable shortcuts
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    this.enabled = enabled;
  }

  /**
   * Get shortcuts help text
   * @returns {Array<{combo: string, description: string}>}
   */
  getShortcutsHelp() {
    return [
      { combo: 'Ctrl/Cmd + Enter', description: '运行当前提示词或代码' },
      { combo: 'Ctrl/Cmd + S', description: '保存当前内容为任务' },
      { combo: 'Ctrl/Cmd + L', description: '清除输出' },
      { combo: 'Ctrl/Cmd + 1', description: '切换到提示词标签页' },
      { combo: 'Ctrl/Cmd + 2', description: '切换到代码标签页' },
      { combo: 'Ctrl/Cmd + T', description: '打开任务管理' },
      { combo: 'Ctrl/Cmd + ,', description: '打开设置' },
      { combo: 'Ctrl/Cmd + /', description: '切换代码注释' },
      { combo: 'Escape', description: '停止执行或关闭对话框' },
      { combo: 'Tab', description: '插入缩进（在代码编辑器中）' }
    ];
  }
}

/**
 * setupAgentMessageListener - Setup message listener for agent updates
 * @param {AgentUI} ui - AgentUI instance
 */
export function setupAgentMessageListener(ui) {
  chrome.runtime.onMessage.addListener(message => {
    if (message.action === 'agent_update') {
      ui.handleAgentUpdate(message.update);
    }
  });
}

/**
 * addAnimationStyles - Add CSS animations for notifications
 */
export function addAnimationStyles() {
  if (document.getElementById('agent-animations')) return;

  const style = document.createElement('style');
  style.id = 'agent-animations';
  style.textContent = `
    @keyframes slideUp {
      from { opacity: 0; transform: translateX(-50%) translateY(10px); }
      to { opacity: 1; transform: translateX(-50%) translateY(0); }
    }
    @keyframes fadeOut {
      from { opacity: 1; }
      to { opacity: 0; }
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
}
