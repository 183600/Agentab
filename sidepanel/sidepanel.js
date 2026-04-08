// sidepanel/sidepanel.js

document.addEventListener('DOMContentLoaded', async () => {
  // Localize document
  localizeDocument();

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

  // === Elements ===
  const tabs = document.querySelectorAll('.tab');
  const tabContents = document.querySelectorAll('.tab-content');
  const promptInput = document.getElementById('prompt-input');
  const codeInput = document.getElementById('code-input');
  const btnRunPrompt = document.getElementById('btn-run-prompt');
  const btnRunCode = document.getElementById('btn-run-code');
  const btnStopPrompt = document.getElementById('btn-stop-prompt');
  const btnStopCode = document.getElementById('btn-stop-code');
  const btnSavePrompt = document.getElementById('btn-save-prompt');
  const btnSaveCode = document.getElementById('btn-save-code');
  const btnTasks = document.getElementById('btn-tasks');
  const btnHistory = document.getElementById('btn-history');
  const btnSettings = document.getElementById('btn-settings');
  const outputSection = document.getElementById('output-section');
  const outputContent = document.getElementById('output-content');
  const btnClearOutput = document.getElementById('btn-clear-output');
  
  // Save dialog elements
  const saveDialog = document.getElementById('save-dialog');
  const taskNameInput = document.getElementById('task-name');
  const taskDescInput = document.getElementById('task-description');
  const taskTypeBadge = document.getElementById('task-type-badge');
  const taskContentPreview = document.getElementById('task-content-preview');
  const btnCloseSaveDialog = document.getElementById('btn-close-save-dialog');
  const btnCancelSave = document.getElementById('btn-cancel-save');
  const btnConfirmSave = document.getElementById('btn-confirm-save');

  let isRunning = false;
  let currentSaveType = 'prompt';
  let currentSaveContent = '';

  // === Helper to toggle run/stop buttons ===
  function setRunningState(running, type = 'prompt') {
    isRunning = running;
    if (type === 'prompt') {
      btnRunPrompt.disabled = running;
      btnRunPrompt.classList.toggle('hidden', running);
      btnStopPrompt.classList.toggle('hidden', !running);
    } else {
      btnRunCode.disabled = running;
      btnRunCode.classList.toggle('hidden', running);
      btnStopCode.classList.toggle('hidden', !running);
    }
  }

  // === Tab Switching ===
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(tc => tc.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
    });
  });

  // === Open Settings Page ===
  btnSettings.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('settings/settings.html') });
  });

  // === Output ===
  function addOutput(type, content) {
    outputSection.classList.remove('hidden');
    const entry = document.createElement('div');
    entry.className = `output-entry ${type}`;

    if (typeof content === 'string') {
      entry.textContent = content;
    } else {
      entry.innerHTML = content;
    }

    outputContent.appendChild(entry);
    outputContent.scrollTop = outputContent.scrollHeight;
  }

  function clearOutput() {
    outputContent.innerHTML = '';
    outputSection.classList.add('hidden');
  }

  btnClearOutput.addEventListener('click', clearOutput);

  // === Handle Agent Updates ===
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'agent_update') {
      const update = message.update;
      switch (update.type) {
        case 'thinking':
          addOutput('thinking', `
            <div class="spinner"></div>
            <span>${escapeHtml(update.message)}</span>
          `);
          break;
        case 'executing':
          addOutput('executing', `
            <div class="label">⚡ ${i18n('execCodeStep', [update.iteration || 1])}</div>
            <div>${escapeHtml(update.explanation || '')}</div>
            <div class="code-block">${escapeHtml(update.code)}</div>
          `);
          break;
        case 'executed':
          if (update.result?.success) {
            addOutput('success', `
              <div class="label">✅ ${i18n('execResult')}</div>
              <div class="code-block">${escapeHtml(JSON.stringify(update.result.result, null, 2) || 'undefined')}</div>
            `);
          } else {
            addOutput('error', `
              <div class="label">❌ ${i18n('execError')}</div>
              <div>${escapeHtml(update.result?.error || i18n('unknownError'))}</div>
            `);
          }
          break;
        case 'complete':
          addOutput('success', `
            <div class="label">🎉 ${i18n('taskComplete')}</div>
            <div>${escapeHtml(update.message)}</div>
            ${update.explanation ? `<div class="text-muted mt-8">${escapeHtml(update.explanation)}</div>` : ''}
          `);
          break;
        case 'error':
          addOutput('error', `
            <div class="label">❌ ${i18n('error')}</div>
            <div>${escapeHtml(update.message)}</div>
          `);
          break;
      }
    }
  });

  // === Run Prompt ===
  btnRunPrompt.addEventListener('click', async () => {
    const prompt = promptInput.value.trim();
    if (!prompt || isRunning) return;

    setRunningState(true, 'prompt');
    clearOutput();

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'execute_prompt',
        prompt
      });

      if (!response.success && response.error) {
        addOutput('error', `
          <div class="label">❌ ${i18n('error')}</div>
          <div>${escapeHtml(response.error)}</div>
        `);
      }
    } catch (e) {
      addOutput('error', `
        <div class="label">❌ ${i18n('error')}</div>
        <div>${escapeHtml(e.message)}</div>
      `);
    } finally {
      setRunningState(false, 'prompt');
    }
  });

  // === Stop Prompt ===
  btnStopPrompt.addEventListener('click', async () => {
    try {
      await chrome.runtime.sendMessage({ action: 'stop_agent' });
      setRunningState(false, 'prompt');
      addOutput('error', `
        <div class="label">⏹️ ${i18n('stopped')}</div>
        <div>${i18n('agentStopped')}</div>
      `);
    } catch (e) {
      console.error('Failed to stop agent:', e);
    }
  });

  // === Run Code ===
  btnRunCode.addEventListener('click', async () => {
    const code = codeInput.value.trim();
    if (!code || isRunning) return;

    setRunningState(true, 'code');
    clearOutput();

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'execute_code',
        code
      });

      if (!response.success && response.error) {
        addOutput('error', `
          <div class="label">❌ ${i18n('error')}</div>
          <div>${escapeHtml(response.error)}</div>
        `);
      }
    } catch (e) {
      addOutput('error', `
        <div class="label">❌ ${i18n('error')}</div>
        <div>${escapeHtml(e.message)}</div>
      `);
    } finally {
      setRunningState(false, 'code');
    }
  });

  // === Stop Code ===
  btnStopCode.addEventListener('click', async () => {
    try {
      await chrome.runtime.sendMessage({ action: 'stop_agent' });
      setRunningState(false, 'code');
      addOutput('error', `
        <div class="label">⏹️ ${i18n('stopped')}</div>
        <div>${i18n('executionStopped')}</div>
      `);
    } catch (e) {
      console.error('Failed to stop execution:', e);
    }
  });

  // === Save Task Dialog ===
  function openSaveDialog(type, content) {
    currentSaveType = type;
    currentSaveContent = content;
    taskNameInput.value = '';
    taskDescInput.value = '';
    taskTypeBadge.textContent = i18n(type === 'prompt' ? 'typePrompt' : 'typeCode');
    taskTypeBadge.className = `task-type-badge ${type}`;
    taskContentPreview.textContent = content.substring(0, 300) + (content.length > 300 ? '...' : '');
    saveDialog.classList.remove('hidden');
    taskNameInput.focus();
  }

  function closeSaveDialog() {
    saveDialog.classList.add('hidden');
  }

  btnSavePrompt.addEventListener('click', () => {
    const prompt = promptInput.value.trim();
    if (!prompt) return showNotification(i18n('enterPromptFirst'), 'error');
    openSaveDialog('prompt', prompt);
  });

  btnSaveCode.addEventListener('click', () => {
    const code = codeInput.value.trim();
    if (!code) return showNotification(i18n('enterCodeFirst'), 'error');
    openSaveDialog('code', code);
  });

  btnCloseSaveDialog.addEventListener('click', closeSaveDialog);
  btnCancelSave.addEventListener('click', closeSaveDialog);

  btnConfirmSave.addEventListener('click', async () => {
    const name = taskNameInput.value.trim();
    if (!name) {
      taskNameInput.style.borderColor = 'var(--error)';
      taskNameInput.focus();
      return;
    }

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'save_task',
        task: {
          name,
          type: currentSaveType,
          content: currentSaveContent,
          description: taskDescInput.value.trim()
        }
      });

      if (response.success) {
        closeSaveDialog();
        showNotification(i18n('taskSaved'));
      }
    } catch (e) {
      showNotification(i18n('taskSaveFailed', [e.message]), 'error');
    }
  });

  // Reset border color on focus
  taskNameInput.addEventListener('focus', () => {
    taskNameInput.style.borderColor = '';
  });

  // === Open Tasks Page ===
  btnTasks.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('tasks/tasks.html') });
  });

  // === Open History Page ===
  btnHistory.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('history/history.html') });
  });

  // === Tab key support for code editor ===
  codeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = codeInput.selectionStart;
      const end = codeInput.selectionEnd;
      codeInput.value = codeInput.value.substring(0, start) + '  ' + codeInput.value.substring(end);
      codeInput.selectionStart = codeInput.selectionEnd = start + 2;
    }
  });

  // === Keyboard shortcuts ===
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'Enter') {
        e.preventDefault();
        const activeTab = document.querySelector('.tab.active');
        if (activeTab.dataset.tab === 'prompt') {
          btnRunPrompt.click();
        } else {
          btnRunCode.click();
        }
      }
    }
  });

  // === Notification (sidepanel-specific bottom notification) ===
  function showNotification(message, type = 'success') {
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

  // Add CSS animations (keep for notification)
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideUp {
      from { opacity: 0; transform: translateX(-50%) translateY(10px); }
      to { opacity: 1; transform: translateX(-50%) translateY(0); }
    }
    @keyframes fadeOut {
      from { opacity: 1; }
      to { opacity: 0; }
    }
  `;
  document.head.appendChild(style);
});
