// popup/popup.js

document.addEventListener('DOMContentLoaded', () => {
  // Localize document
  localizeDocument();

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
  let lastPromptInput = '';           // 最后输入的 prompt
  let generatedCodes = [];            // 执行过程中生成的代码
  let hasGeneratedCode = false;       // 是否有生成的代码可供保存

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
          // 收集生成的代码
          if (update.code) {
            generatedCodes.push({
              step: update.iteration || generatedCodes.length + 1,
              code: update.code,
              explanation: update.explanation || ''
            });
            hasGeneratedCode = true;
            updateSaveButtonState();
          }
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

    // 记录 prompt 并清空生成的代码
    lastPromptInput = prompt;
    generatedCodes = [];
    hasGeneratedCode = false;

    isRunning = true;
    btnRunPrompt.disabled = true;
    btnRunPrompt.innerHTML = `<div class="spinner"></div> ${i18n('running')}`;
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
      isRunning = false;
      btnRunPrompt.disabled = false;
      btnRunPrompt.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
        <span>${i18n('btnRunAgent')}</span>
      `;
    }
  });

  // === Run Code ===
  btnRunCode.addEventListener('click', async () => {
    const code = codeInput.value.trim();
    if (!code || isRunning) return;

    isRunning = true;
    btnRunCode.disabled = true;
    btnRunCode.innerHTML = `<div class="spinner"></div> ${i18n('running')}`;
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
      isRunning = false;
      btnRunCode.disabled = false;
      btnRunCode.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
        <span>${i18n('btnExecute')}</span>
      `;
    }
  });

  // === Update Save Button State ===
  function updateSaveButtonState() {
    // 如果有生成的代码，显示提示
    if (hasGeneratedCode && btnSavePrompt) {
      btnSavePrompt.classList.add('has-generated-code');
    } else if (btnSavePrompt) {
      btnSavePrompt.classList.remove('has-generated-code');
    }
  }

  // === Save Task Dialog ===
  function openSaveDialog(type, content, options = {}) {
    const { promptText, generatedCodeAvailable = false } = options;
    
    currentSaveType = type;
    currentSaveContent = content;
    taskNameInput.value = '';
    taskDescInput.value = '';
    
    // 处理类型选择器
    const typeSelector = document.getElementById('save-type-selector');
    const codeOption = document.getElementById('save-option-code');
    
    if (typeSelector && generatedCodeAvailable && generatedCodes.length > 0) {
      typeSelector.classList.remove('hidden');
      // 默认选择保存 prompt
      document.getElementById('save-option-prompt').classList.add('active');
      if (codeOption) codeOption.classList.remove('active');
    } else if (typeSelector) {
      typeSelector.classList.add('hidden');
    }
    
    taskTypeBadge.textContent = i18n(type === 'prompt' ? 'typePrompt' : 'typeCode');
    taskTypeBadge.className = `task-type-badge ${type}`;
    taskContentPreview.textContent = content.substring(0, 300) + (content.length > 300 ? '...' : '');
    saveDialog.classList.remove('hidden');
    taskNameInput.focus();
  }

  function closeSaveDialog() {
    saveDialog.classList.add('hidden');
  }

  // === Save Type Selector Events ===
  const saveOptionPrompt = document.getElementById('save-option-prompt');
  const saveOptionCode = document.getElementById('save-option-code');

  if (saveOptionPrompt && saveOptionCode) {
    saveOptionPrompt.addEventListener('click', () => {
      saveOptionPrompt.classList.add('active');
      saveOptionCode.classList.remove('active');
      // 更新预览内容为原始 prompt
      currentSaveType = 'prompt';
      currentSaveContent = lastPromptInput || promptInput.value.trim();
      taskTypeBadge.textContent = i18n('typePrompt');
      taskTypeBadge.className = 'task-type-badge prompt';
      taskContentPreview.textContent = currentSaveContent.substring(0, 300) + (currentSaveContent.length > 300 ? '...' : '');
    });

    saveOptionCode.addEventListener('click', () => {
      saveOptionCode.classList.add('active');
      saveOptionPrompt.classList.remove('active');
      // 更新预览内容为生成的代码
      currentSaveType = 'code';
      currentSaveContent = generatedCodes.map((c, i) => `// Step ${c.step}: ${c.explanation}\n${c.code}`).join('\n\n');
      taskTypeBadge.textContent = i18n('typeCode');
      taskTypeBadge.className = 'task-type-badge code';
      taskContentPreview.textContent = currentSaveContent.substring(0, 300) + (currentSaveContent.length > 300 ? '...' : '');
    });
  }

  btnSavePrompt.addEventListener('click', () => {
    const prompt = promptInput.value.trim();
    if (!prompt) return showNotification(i18n('enterPromptFirst'), 'error');
    openSaveDialog('prompt', prompt, {
      promptText: prompt,
      generatedCodeAvailable: hasGeneratedCode && generatedCodes.length > 0
    });
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

    // 解析自动执行网站
    const autoSitesInput = document.getElementById('task-auto-sites');
    const autoRunSites = autoSitesInput ? parseAutoRunSites(autoSitesInput.value.trim()) : [];

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'save_task',
        task: {
          name,
          type: currentSaveType,
          content: currentSaveContent,
          description: taskDescInput.value.trim(),
          autoRunSites
        }
      });

      if (response.success) {
        closeSaveDialog();
        if (autoSitesInput) autoSitesInput.value = '';
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

  // === Tasks Panel ===
  const tasksPanel = document.getElementById('tasks-panel');
  const tasksList = document.getElementById('tasks-list');
  const tasksEmpty = document.getElementById('tasks-empty');
  const btnCloseTasksPanel = document.getElementById('btn-close-tasks-panel');
  const tasksTotal = document.getElementById('tasks-total');
  const tasksPromptCount = document.getElementById('tasks-prompt-count');
  const tasksCodeCount = document.getElementById('tasks-code-count');
  const filterBtns = document.querySelectorAll('.filter-btn');
  const taskMenu = document.getElementById('task-menu');
  const editDialog = document.getElementById('edit-dialog');
  const deleteDialog = document.getElementById('delete-dialog');
  
  let allTasks = [];
  let currentFilter = 'all';
  let selectedTaskId = null;

  async function loadTasks() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'get_tasks' });
      if (response.success) {
        allTasks = response.tasks || [];
        renderTasks();
        updateTasksStats();
      }
    } catch (e) {
      console.error('Failed to load tasks:', e);
    }
  }

  function updateTasksStats() {
    const promptTasks = allTasks.filter(t => t.type === 'prompt');
    const codeTasks = allTasks.filter(t => t.type === 'code');
    tasksTotal.textContent = allTasks.length;
    tasksPromptCount.textContent = promptTasks.length;
    tasksCodeCount.textContent = codeTasks.length;
  }

  function renderTasks() {
    const filtered = currentFilter === 'all' 
      ? allTasks 
      : allTasks.filter(t => t.type === currentFilter);
    
    if (filtered.length === 0) {
      tasksList.innerHTML = '';
      tasksEmpty.classList.remove('hidden');
      return;
    }
    
    tasksEmpty.classList.add('hidden');
    tasksList.innerHTML = filtered.map(task => {
      const hasAutoRun = task.autoRunSites && task.autoRunSites.length > 0;
      return `
        <div class="task-item" data-id="${task.id}">
          ${hasAutoRun ? '<div class="task-auto-indicator" title="' + i18n('autoRunEnabled') + '"></div>' : ''}
          <div class="task-icon ${task.type}">
            ${task.type === 'prompt' 
              ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>'
              : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>'
            }
          </div>
          <div class="task-info">
            <div class="task-name">${escapeHtml(task.name)}</div>
            <div class="task-meta">${formatDate(task.createdAt)} · ${task.executions || 0} ${i18n('executions') || '次'}${hasAutoRun ? ' · 🔄' : ''}</div>
          </div>
          <div class="task-actions">
            <button class="task-action-btn" data-action="menu" title="${i18n('moreActions') || '更多'}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>
              </svg>
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  function formatDate(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return i18n('justNow') || '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} ${i18n('minutesAgo') || '分钟前'}`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} ${i18n('hoursAgo') || '小时前'}`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)} ${i18n('daysAgo') || '天前'}`;
    
    return date.toLocaleDateString();
  }

  function openTasksPanel() {
    tasksPanel.classList.remove('hidden');
    loadTasks();
  }

  function closeTasksPanel() {
    tasksPanel.classList.add('hidden');
    hideTaskMenu();
  }

  function showTaskMenu(taskId, x, y) {
    selectedTaskId = taskId;
    taskMenu.style.left = `${x}px`;
    taskMenu.style.top = `${y}px`;
    taskMenu.classList.remove('hidden');
  }

  function hideTaskMenu() {
    taskMenu.classList.add('hidden');
    selectedTaskId = null;
  }

  // Open tasks panel
  btnTasks.addEventListener('click', openTasksPanel);
  btnCloseTasksPanel.addEventListener('click', closeTasksPanel);

  // Filter tasks
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      renderTasks();
    });
  });

  // Task item clicks
  tasksList.addEventListener('click', (e) => {
    const taskItem = e.target.closest('.task-item');
    if (!taskItem) return;
    
    const taskId = taskItem.dataset.id;
    const menuBtn = e.target.closest('[data-action="menu"]');
    
    if (menuBtn) {
      e.stopPropagation();
      const rect = menuBtn.getBoundingClientRect();
      showTaskMenu(taskId, rect.left, rect.bottom + 4);
    } else {
      // Run task on click
      runTask(taskId);
    }
  });

  // Close menu on outside click
  document.addEventListener('click', (e) => {
    if (!taskMenu.contains(e.target) && !e.target.closest('[data-action="menu"]')) {
      hideTaskMenu();
    }
  });

  // Run task
  async function runTask(taskId) {
    const task = allTasks.find(t => t.id === taskId);
    if (!task) return;
    
    hideTaskMenu();
    closeTasksPanel();
    
    isRunning = true;
    btnRunPrompt.disabled = true;
    btnRunPrompt.innerHTML = `<div class="spinner"></div> ${i18n('running')}`;
    clearOutput();
    
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'execute_task',
        taskId
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
      isRunning = false;
      btnRunPrompt.disabled = false;
      btnRunPrompt.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
        <span>${i18n('btnRunAgent')}</span>
      `;
    }
  }

  // Task menu actions
  document.getElementById('menu-run').addEventListener('click', () => {
    if (selectedTaskId) runTask(selectedTaskId);
  });

  document.getElementById('menu-edit').addEventListener('click', () => {
    if (!selectedTaskId) return;
    const task = allTasks.find(t => t.id === selectedTaskId);
    if (!task) return;
    
    hideTaskMenu();
    
    document.getElementById('edit-task-id').value = task.id;
    document.getElementById('edit-task-name').value = task.name;
    document.getElementById('edit-task-desc').value = task.description || '';
    document.getElementById('edit-task-content').value = task.content;
    document.getElementById('edit-task-sites').value = formatAutoRunSites(task.autoRunSites || []);
    
    editDialog.classList.remove('hidden');
  });

  // Auto run settings
  const autoRunDialog = document.getElementById('auto-run-dialog');
  
  document.getElementById('menu-auto-run').addEventListener('click', () => {
    if (!selectedTaskId) return;
    const task = allTasks.find(t => t.id === selectedTaskId);
    if (!task) return;
    
    hideTaskMenu();
    
    document.getElementById('auto-run-task-id').value = task.id;
    document.getElementById('auto-run-task-name').textContent = task.name;
    document.getElementById('auto-run-sites').value = formatAutoRunSites(task.autoRunSites || []);
    document.getElementById('auto-run-enabled').checked = task.autoRunSites && task.autoRunSites.length > 0;
    
    autoRunDialog.classList.remove('hidden');
  });

  document.getElementById('btn-close-auto-run-dialog').addEventListener('click', () => {
    autoRunDialog.classList.add('hidden');
  });

  document.getElementById('btn-cancel-auto-run').addEventListener('click', () => {
    autoRunDialog.classList.add('hidden');
  });

  document.getElementById('btn-save-auto-run').addEventListener('click', async () => {
    const taskId = document.getElementById('auto-run-task-id').value;
    const sitesInput = document.getElementById('auto-run-sites').value.trim();
    const enabled = document.getElementById('auto-run-enabled').checked;
    
    const autoRunSites = enabled ? parseAutoRunSites(sitesInput) : [];
    
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'update_task',
        taskId,
        updates: { autoRunSites }
      });
      
      if (response.success) {
        autoRunDialog.classList.add('hidden');
        loadTasks();
        showNotification(i18n('autoRunUpdated') || '自动执行设置已更新');
      }
    } catch (e) {
      showNotification(e.message, 'error');
    }
  });

  document.getElementById('menu-delete').addEventListener('click', () => {
    if (!selectedTaskId) return;
    const task = allTasks.find(t => t.id === selectedTaskId);
    if (!task) return;
    
    hideTaskMenu();
    
    document.getElementById('delete-task-name').textContent = 
      `${i18n('deleteConfirm') || '确定删除'} "${task.name}"?`;
    deleteDialog.classList.remove('hidden');
  });

  // Edit dialog
  document.getElementById('btn-close-edit-dialog').addEventListener('click', () => {
    editDialog.classList.add('hidden');
  });

  document.getElementById('btn-cancel-edit').addEventListener('click', () => {
    editDialog.classList.add('hidden');
  });

  document.getElementById('btn-save-edit').addEventListener('click', async () => {
    const taskId = document.getElementById('edit-task-id').value;
    const name = document.getElementById('edit-task-name').value.trim();
    const description = document.getElementById('edit-task-desc').value.trim();
    const content = document.getElementById('edit-task-content').value.trim();
    const autoRunSites = parseAutoRunSites(document.getElementById('edit-task-sites').value.trim());
    
    if (!name) return;
    
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'update_task',
        taskId,
        updates: { name, description, content, autoRunSites }
      });
      
      if (response.success) {
        editDialog.classList.add('hidden');
        loadTasks();
        showNotification(i18n('taskUpdated') || '任务已更新');
      }
    } catch (e) {
      showNotification(e.message, 'error');
    }
  });

  // Delete dialog
  document.getElementById('btn-cancel-delete').addEventListener('click', () => {
    deleteDialog.classList.add('hidden');
  });

  document.getElementById('btn-confirm-delete').addEventListener('click', async () => {
    const task = allTasks.find(t => t.id === selectedTaskId);
    if (!task) return;
    
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'delete_task',
        taskId: selectedTaskId
      });
      
      if (response.success) {
        deleteDialog.classList.add('hidden');
        loadTasks();
        showNotification(i18n('taskDeleted') || '任务已删除');
      }
    } catch (e) {
      showNotification(e.message, 'error');
    }
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

  // === Notification ===
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

  // === Utility ===
  function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }

  // Parse auto-run sites from input
  function parseAutoRunSites(input) {
    if (!input) return [];
    return input
      .split(/[,，\n]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0)
      .map(s => {
        // 如果没有协议，添加 https://
        if (!s.match(/^(https?:\/\/|\*\.)/)) {
          if (s.startsWith('*.')) {
            return s;
          }
          return '*.' + s;
        }
        return s;
      });
  }

  // Format auto-run sites for display
  function formatAutoRunSites(sites) {
    if (!sites || sites.length === 0) return '';
    return sites.join(', ');
  }

  // Add CSS animations
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
