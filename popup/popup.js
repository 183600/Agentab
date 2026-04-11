// popup/popup.js - Using shared UI components

import {
  AgentUI,
  SaveTaskDialog,
  KeyboardShortcuts,
  setupAgentMessageListener,
  addAnimationStyles,
  escapeHtml
} from '../lib/ui-components.js';

document.addEventListener('DOMContentLoaded', () => {
  // Localize document
  localizeDocument();

  // Initialize animations
  addAnimationStyles();

  // === Elements ===
  const tabs = document.querySelectorAll('.tab');
  const tabContents = document.querySelectorAll('.tab-content');
  const promptInput = document.getElementById('prompt-input');
  const codeInput = document.getElementById('code-input');
  const btnRunPrompt = document.getElementById('btn-run-prompt');
  const btnRunCode = document.getElementById('btn-run-code');
  const btnSavePrompt = document.getElementById('btn-save-prompt');
  const btnSaveCode = document.getElementById('btn-save-code');
  const btnTasks = document.getElementById('btn-tasks');
  const btnSettings = document.getElementById('btn-settings');
  const outputSection = document.getElementById('output-section');
  const outputContent = document.getElementById('output-content');
  const btnClearOutput = document.getElementById('btn-clear-output');

  // === Initialize Shared UI Components ===
  const agentUI = new AgentUI({
    outputSection,
    outputContent,
    clearOutputBtn: btnClearOutput
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

  // Setup message listener
  setupAgentMessageListener(agentUI);

  let currentTab = 'prompt';

  // === Tab Switching ===
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(tc => tc.classList.remove('active'));
      tab.classList.add('active');
      const tabId = tab.dataset.tab;
      document.getElementById(`tab-${tabId}`).classList.add('active');
      currentTab = tabId;
    });
  });

  // === Open Settings Page ===
  btnSettings.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('settings/settings.html') });
  });

  // === Keyboard Shortcuts ===
  new KeyboardShortcuts({
    onRun: () => {
      if (currentTab === 'prompt') {
        runPrompt();
      } else {
        runCode();
      }
    },
    onClear: () => {
      agentUI.clearOutput();
    },
    onSave: () => {
      const content = currentTab === 'prompt' ? promptInput.value.trim() : codeInput.value.trim();
      if (content) {
        saveDialog.open(currentTab, content);
      } else {
        agentUI.showNotification(
          currentTab === 'prompt' ? i18n('enterPromptFirst') : i18n('enterCodeFirst'),
          'error'
        );
      }
    },
    onFocusPrompt: () => {
      tabs[0].click();
      promptInput.focus();
    },
    onFocusCode: () => {
      tabs[1]?.click();
      codeInput.focus();
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
    const prompt = promptInput.value.trim();
    if (!prompt || agentUI.isRunning) return;

    agentUI.setRunningState(true, { run: btnRunPrompt });
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
      agentUI.setRunningState(false, { run: btnRunPrompt });
    }
  }

  btnRunPrompt.addEventListener('click', runPrompt);

  // === Run Code ===
  async function runCode() {
    const code = codeInput.value.trim();
    if (!code || agentUI.isRunning) return;

    agentUI.setRunningState(true, { run: btnRunCode });
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
      agentUI.setRunningState(false, { run: btnRunCode });
    }
  }

  btnRunCode.addEventListener('click', runCode);

  // === Save Task Dialog ===
  btnSavePrompt.addEventListener('click', () => {
    const prompt = promptInput.value.trim();
    if (!prompt) return agentUI.showNotification(i18n('enterPromptFirst'), 'error');
    saveDialog.open('prompt', prompt);
  });

  btnSaveCode.addEventListener('click', () => {
    const code = codeInput.value.trim();
    if (!code) return agentUI.showNotification(i18n('enterCodeFirst'), 'error');
    saveDialog.open('code', code);
  });

  // === Open Tasks Page ===
  btnTasks.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('tasks/tasks.html') });
  });

  // === Tab key support for code editor ===
  codeInput.addEventListener('keydown', e => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = codeInput.selectionStart;
      const end = codeInput.selectionEnd;
      codeInput.value = codeInput.value.substring(0, start) + '  ' + codeInput.value.substring(end);
      codeInput.selectionStart = codeInput.selectionEnd = start + 2;
    }
  });
});