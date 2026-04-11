// tasks/tasks.js

document.addEventListener('DOMContentLoaded', async () => {
  // Localize document
  localizeDocument();

  // === Theme ===
  await initTheme();

  // === Elements ===
  const tasksGrid = document.getElementById('tasks-grid');
  const emptyState = document.getElementById('empty-state');
  const noResults = document.getElementById('no-results');
  const searchInput = document.getElementById('search-input');
  const filterBtns = document.querySelectorAll('.filter-btn');
  const totalTasksEl = document.getElementById('total-tasks');
  const promptTasksEl = document.getElementById('prompt-tasks');
  const codeTasksEl = document.getElementById('code-tasks');
  const totalExecutionsEl = document.getElementById('total-executions');

  // Import/Export buttons
  const btnImportTasks = document.getElementById('btn-import-tasks');
  const btnExportTasks = document.getElementById('btn-export-tasks');
  const importFileInput = document.getElementById('import-file-input');

  // Edit modal
  const editModal = document.getElementById('edit-modal');
  const editTaskId = document.getElementById('edit-task-id');
  const editName = document.getElementById('edit-name');
  const editDescription = document.getElementById('edit-description');
  const editContent = document.getElementById('edit-content');
  const typePrompt = document.getElementById('type-prompt');
  const typeCode = document.getElementById('type-code');
  const btnCloseModal = document.getElementById('btn-close-modal');
  const btnCancelEdit = document.getElementById('btn-cancel-edit');
  const btnSaveEdit = document.getElementById('btn-save-edit');

  // Delete modal
  const deleteModal = document.getElementById('delete-modal');
  const deleteConfirmText = document.getElementById('delete-confirm-text');
  const btnCancelDelete = document.getElementById('btn-cancel-delete');
  const btnConfirmDelete = document.getElementById('btn-confirm-delete');

  let allTasks = [];
  let currentFilter = 'all';
  let currentSearch = '';
  let deleteTargetId = null;

  // === Load Tasks ===
  async function loadTasks() {
    const response = await chrome.runtime.sendMessage({ action: 'get_tasks' });
    if (response.success) {
      allTasks = response.tasks;
      updateStats();
      renderTasks();
    }
  }

  // === Update Stats ===
  function updateStats() {
    totalTasksEl.textContent = allTasks.length;
    promptTasksEl.textContent = allTasks.filter(t => t.type === 'prompt').length;
    codeTasksEl.textContent = allTasks.filter(t => t.type === 'code').length;
    totalExecutionsEl.textContent = allTasks.reduce((sum, t) => sum + (t.executionCount || 0), 0);
  }

  // === Filter & Search ===
  function getFilteredTasks() {
    return allTasks.filter(task => {
      const matchesFilter = currentFilter === 'all' || task.type === currentFilter;
      const matchesSearch =
        !currentSearch ||
        task.name.toLowerCase().includes(currentSearch) ||
        task.description?.toLowerCase().includes(currentSearch) ||
        task.content.toLowerCase().includes(currentSearch);
      return matchesFilter && matchesSearch;
    });
  }

  // === Get Type Label ===
  function getTypeLabel(type) {
    return type === 'prompt' ? i18n('typePrompt') : i18n('typeCode');
  }

  // === Get Type Icon ===
  function getTypeIcon(type) {
    return type === 'prompt' ? '💬' : '⚡';
  }

  // === Render Tasks ===
  function renderTasks() {
    const filtered = getFilteredTasks();

    if (allTasks.length === 0) {
      tasksGrid.classList.add('hidden');
      noResults.classList.add('hidden');
      emptyState.classList.remove('hidden');
      return;
    }

    if (filtered.length === 0) {
      tasksGrid.classList.add('hidden');
      emptyState.classList.add('hidden');
      noResults.classList.remove('hidden');
      return;
    }

    emptyState.classList.add('hidden');
    noResults.classList.add('hidden');
    tasksGrid.classList.remove('hidden');

    tasksGrid.innerHTML = filtered
      .map(
        task => `
      <div class="task-card" data-id="${task.id}">
        <div class="task-card-header">
          <div class="task-info">
            <div class="task-name" title="${escapeHtml(task.name)}">${escapeHtml(task.name)}</div>
            ${task.description ? `<div class="task-desc" title="${escapeHtml(task.description)}">${escapeHtml(task.description)}</div>` : ''}
          </div>
          <span class="task-type ${task.type}">
            ${getTypeIcon(task.type)} ${getTypeLabel(task.type)}
          </span>
        </div>
        <div class="task-content-preview">
          <pre>${escapeHtml(task.content.substring(0, 200))}${task.content.length > 200 ? '...' : ''}</pre>
        </div>
        <div class="task-meta">
          <div class="task-meta-info">
            <span title="${i18n('createdTime', [new Date(task.createdAt).toLocaleString()])}">
              📅 ${formatDate(task.createdAt)}
            </span>
            <span title="${i18n('executionCount')}">
              🔄 ${task.executionCount || 0} ${i18n('executionCount')}
            </span>
          </div>
          <div class="task-actions">
            <button class="task-action-btn run" title="${i18n('runTaskTitle')}" data-action="run" data-id="${task.id}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
            </button>
            <button class="task-action-btn" title="${i18n('editTaskTitle')}" data-action="edit" data-id="${task.id}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button class="task-action-btn" title="${i18n('copyTaskTitle')}" data-action="duplicate" data-id="${task.id}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
              </svg>
            </button>
            <button class="task-action-btn delete" title="${i18n('deleteTaskTitle')}" data-action="delete" data-id="${task.id}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    `
      )
      .join('');
  }

  // === Event Delegation for Task Actions ===
  tasksGrid.addEventListener('click', async e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const action = btn.dataset.action;
    const id = btn.dataset.id;
    const task = allTasks.find(t => t.id === id);
    if (!task) return;

    switch (action) {
      case 'run':
        await runTask(task);
        break;
      case 'edit':
        openEditModal(task);
        break;
      case 'duplicate':
        await duplicateTask(task);
        break;
      case 'delete':
        openDeleteModal(task);
        break;
    }
  });

  // === Run Task ===
  async function runTask(task) {
    showToast(i18n('runningTask', [task.name]), 'info');
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'execute_task',
        taskId: task.id
      });

      if (response.success) {
        showToast(i18n('taskExecSuccess', [task.name]), 'success');
        await loadTasks(); // Refresh to update execution count
      } else {
        showToast(i18n('taskExecFailed', [response.error]), 'error');
      }
    } catch (e) {
      showToast(`${i18n('error')}: ${e.message}`, 'error');
    }
  }

  // === Edit Modal ===
  function openEditModal(task) {
    editTaskId.value = task.id;
    editName.value = task.name;
    editDescription.value = task.description || '';
    editContent.value = task.content;

    // Set type
    typePrompt.classList.toggle('active', task.type === 'prompt');
    typeCode.classList.toggle('active', task.type === 'code');

    // Set textarea font based on type
    editContent.style.fontFamily = task.type === 'code' ? 'var(--font-mono)' : 'var(--font)';

    editModal.classList.remove('hidden');
    editName.focus();
  }

  function closeEditModal() {
    editModal.classList.add('hidden');
  }

  // Type selector
  [typePrompt, typeCode].forEach(btn => {
    btn.addEventListener('click', () => {
      typePrompt.classList.toggle('active', btn === typePrompt);
      typeCode.classList.toggle('active', btn === typeCode);
      editContent.style.fontFamily = btn === typeCode ? 'var(--font-mono)' : 'var(--font)';
    });
  });

  btnCloseModal.addEventListener('click', closeEditModal);
  btnCancelEdit.addEventListener('click', closeEditModal);

  btnSaveEdit.addEventListener('click', async () => {
    const id = editTaskId.value;
    const name = editName.value.trim();
    if (!name) {
      editName.focus();
      return;
    }

    const type = typePrompt.classList.contains('active') ? 'prompt' : 'code';

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'update_task',
        taskId: id,
        updates: {
          name,
          description: editDescription.value.trim(),
          type,
          content: editContent.value
        }
      });

      if (response.success) {
        closeEditModal();
        showToast(i18n('taskUpdated'), 'success');
        await loadTasks();
      }
    } catch (e) {
      showToast(`${i18n('error')}: ${e.message}`, 'error');
    }
  });

  // === Delete Modal ===
  function openDeleteModal(task) {
    deleteTargetId = task.id;
    deleteConfirmText.innerHTML = i18n('confirmDelete', [task.name]);
    deleteModal.classList.remove('hidden');
  }

  function closeDeleteModal() {
    deleteModal.classList.add('hidden');
    deleteTargetId = null;
  }

  btnCancelDelete.addEventListener('click', closeDeleteModal);

  btnConfirmDelete.addEventListener('click', async () => {
    if (!deleteTargetId) return;

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'delete_task',
        taskId: deleteTargetId
      });

      if (response.success) {
        closeDeleteModal();
        showToast(i18n('taskDeleted'), 'success');
        await loadTasks();
      }
    } catch (e) {
      showToast(`${i18n('error')}: ${e.message}`, 'error');
    }
  });

  // === Duplicate Task ===
  async function duplicateTask(task) {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'save_task',
        task: {
          name: `${task.name}${i18n('copySuffix')}`,
          type: task.type,
          content: task.content,
          description: task.description
        }
      });

      if (response.success) {
        showToast(i18n('taskCopied'), 'success');
        await loadTasks();
      }
    } catch (e) {
      showToast(`${i18n('error')}: ${e.message}`, 'error');
    }
  }

  // === Search (with debounce) ===
  const debouncedSearch = debounce(value => {
    currentSearch = value.toLowerCase().trim();
    renderTasks();
  }, 300);

  searchInput.addEventListener('input', e => {
    debouncedSearch(e.target.value);
  });

  // === Filters ===
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      renderTasks();
    });
  });

  // === Close modals on overlay click ===
  [editModal, deleteModal].forEach(modal => {
    modal.addEventListener('click', e => {
      if (e.target === modal) {
        modal.classList.add('hidden');
      }
    });
  });

  // === Close modals on Escape ===
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      editModal.classList.add('hidden');
      deleteModal.classList.add('hidden');
    }
  });

  // === Tab key in editor ===
  editContent.addEventListener('keydown', e => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = editContent.selectionStart;
      const end = editContent.selectionEnd;
      editContent.value =
        editContent.value.substring(0, start) + '  ' + editContent.value.substring(end);
      editContent.selectionStart = editContent.selectionEnd = start + 2;
    }
  });

  // === Import/Export Tasks ===
  btnExportTasks.addEventListener('click', async () => {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'get_tasks' });
      if (response.success && response.tasks.length > 0) {
        const exportData = {
          version: '1.0',
          exportedAt: new Date().toISOString(),
          tasks: response.tasks
        };
        const jsonStr = JSON.stringify(exportData, null, 2);
        const filename = `agentab-tasks-${new Date().toISOString().split('T')[0]}.json`;
        downloadFile(jsonStr, filename);
        showToast(i18n('tasksExported'), 'success');
      } else {
        showToast(i18n('noTasksToExport'), 'error');
      }
    } catch (e) {
      showToast(`${i18n('error')}: ${e.message}`, 'error');
    }
  });

  btnImportTasks.addEventListener('click', () => {
    importFileInput.click();
  });

  importFileInput.addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const content = await readFileAsText(file);
      const data = JSON.parse(content);

      // Validate import data
      if (!data.tasks || !Array.isArray(data.tasks)) {
        throw new Error('Invalid import file: missing tasks array');
      }

      let importedCount = 0;
      for (const task of data.tasks) {
        if (task.name && task.type && task.content) {
          await chrome.runtime.sendMessage({
            action: 'save_task',
            task: {
              name: task.name,
              type: task.type,
              content: task.content,
              description: task.description || ''
            }
          });
          importedCount++;
        }
      }

      showToast(i18n('tasksImported', [importedCount]), 'success');
      await loadTasks();
    } catch (e) {
      showToast(`${i18n('importFailed')}: ${e.message}`, 'error');
    } finally {
      // Reset file input
      importFileInput.value = '';
    }
  });

  // === Initialize ===
  loadTasks();

  // ============================================
  // Schedule Management
  // ============================================

  const btnAddSchedule = document.getElementById('btn-add-schedule');
  const schedulesList = document.getElementById('schedules-list');
  const schedulesEmpty = document.getElementById('schedules-empty');
  const activeSchedulesCount = document.getElementById('active-schedules-count');
  const pausedSchedulesCount = document.getElementById('paused-schedules-count');

  // Schedule modal elements
  const scheduleModal = document.getElementById('schedule-modal');
  const scheduleTaskSelect = document.getElementById('schedule-task-select');
  const scheduleEditIdInput = document.getElementById('schedule-edit-id');
  const scheduleIntervalGroup = document.getElementById('schedule-interval-group');
  const scheduleTimeGroup = document.getElementById('schedule-time-group');
  const scheduleDaysGroup = document.getElementById('schedule-days-group');
  const scheduleInterval = document.getElementById('schedule-interval');
  const scheduleTime = document.getElementById('schedule-time');
  const scheduleTypeOptions = document.querySelectorAll('.schedule-type-selector .type-option');
  const dayOptions = document.querySelectorAll('.day-option input');
  const btnCloseScheduleModal = document.getElementById('btn-close-schedule-modal');
  const btnCancelSchedule = document.getElementById('btn-cancel-schedule');
  const btnSaveSchedule = document.getElementById('btn-save-schedule');

  let allSchedules = [];
  let currentScheduleType = 'interval';

  /**
   * Load schedules from background
   */
  async function loadSchedules() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'get_schedules' });
      if (response.success) {
        allSchedules = response.schedules || [];
        updateScheduleStats();
        renderSchedules();
      }
    } catch (error) {
      console.error('Failed to load schedules:', error);
    }
  }

  /**
   * Update schedule statistics
   */
  function updateScheduleStats() {
    const active = allSchedules.filter(s => s.status === 'active').length;
    const paused = allSchedules.filter(s => s.status === 'paused').length;
    activeSchedulesCount.textContent = active;
    pausedSchedulesCount.textContent = paused;
  }

  /**
   * Render schedules list
   */
  function renderSchedules() {
    if (allSchedules.length === 0) {
      schedulesEmpty.style.display = 'block';
      schedulesList.querySelectorAll('.schedule-item').forEach(el => el.remove());
      return;
    }

    schedulesEmpty.style.display = 'none';
    schedulesList.querySelectorAll('.schedule-item').forEach(el => el.remove());

    for (const schedule of allSchedules) {
      const item = createScheduleItem(schedule);
      schedulesList.appendChild(item);
    }
  }

  /**
   * Create schedule item element
   */
  function createScheduleItem(schedule) {
    const item = document.createElement('div');
    item.className = 'schedule-item';
    item.dataset.id = schedule.id;

    const typeLabel = getScheduleTypeLabel(schedule);
    const nextRun = schedule.nextRunAt ? formatScheduleTime(schedule.nextRunAt) : '-';
    const taskName = schedule.metadata?.taskName || schedule.taskId;

    item.innerHTML = `
      <div class="schedule-info">
        <div class="schedule-task-name">${escapeHtml(taskName)}</div>
        <div class="schedule-details">
          <span class="schedule-type-badge">${typeLabel}</span>
          <span class="schedule-next-run">${i18n('nextRunAt')}${nextRun}</span>
        </div>
      </div>
      <div class="schedule-actions">
        <button class="icon-btn ${schedule.status === 'active' ? 'pause' : 'play'}" 
                title="${schedule.status === 'active' ? '暂停' : '恢复'}"
                data-action="${schedule.status === 'active' ? 'pause' : 'resume'}">
          ${schedule.status === 'active'
    ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>'
    : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>'}
        </button>
        <button class="icon-btn delete" title="删除" data-action="delete">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>
      </div>
    `;

    // Add event listeners
    item.querySelectorAll('.icon-btn').forEach(btn => {
      btn.addEventListener('click', () => handleScheduleAction(schedule.id, btn.dataset.action));
    });

    return item;
  }

  /**
   * Get schedule type label
   */
  function getScheduleTypeLabel(schedule) {
    switch (schedule.type) {
      case 'interval':
        return i18n('intervalEvery', [schedule.config.interval]);
      case 'daily':
        return i18n('dailyAt', [schedule.config.time]);
      case 'weekly': {
        const days = ['日', '一', '二', '三', '四', '五', '六'];
        const selectedDays = schedule.config.days.map(d => days[d]).join(', ');
        return i18n('weeklyAt', [selectedDays, schedule.config.time || '00:00']);
      }
      default:
        return schedule.type;
    }
  }

  /**
   * Format schedule time
   */
  function formatScheduleTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = date - now;

    if (diff < 60000) return '< 1分钟';
    if (diff < 3600000) return `${Math.round(diff / 60000)}分钟`;
    if (diff < 86400000) return `${Math.round(diff / 3600000)}小时`;

    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  /**
   * Handle schedule action
   */
  async function handleScheduleAction(scheduleId, action) {
    try {
      let response;
      switch (action) {
        case 'pause':
          response = await chrome.runtime.sendMessage({ action: 'pause_schedule', scheduleId });
          if (response.success) showToast(i18n('schedulePaused'), 'success');
          break;
        case 'resume':
          response = await chrome.runtime.sendMessage({ action: 'resume_schedule', scheduleId });
          if (response.success) showToast(i18n('scheduleResumed'), 'success');
          break;
        case 'delete':
          response = await chrome.runtime.sendMessage({ action: 'delete_schedule', scheduleId });
          if (response.success) showToast(i18n('scheduleDeleted'), 'success');
          break;
      }
      await loadSchedules();
    } catch (error) {
      showToast(`${i18n('error')}: ${error.message}`, 'error');
    }
  }

  /**
   * Populate task select dropdown
   */
  function populateScheduleTaskSelect() {
    scheduleTaskSelect.innerHTML = '<option value="">-- 选择任务 --</option>';
    for (const task of allTasks) {
      const option = document.createElement('option');
      option.value = task.id;
      option.textContent = task.name;
      scheduleTaskSelect.appendChild(option);
    }
  }

  /**
   * Open schedule modal
   */
  function openScheduleModal() {
    populateScheduleTaskSelect();
    scheduleEditIdInput.value = '';
    scheduleTaskSelect.value = '';
    currentScheduleType = 'interval';
    updateScheduleTypeUI();
    scheduleModal.classList.remove('hidden');
  }

  /**
   * Close schedule modal
   */
  function closeScheduleModal() {
    scheduleModal.classList.add('hidden');
  }

  /**
   * Update schedule type UI
   */
  function updateScheduleTypeUI() {
    scheduleTypeOptions.forEach(opt => {
      opt.classList.toggle('active', opt.dataset.scheduleType === currentScheduleType);
    });

    scheduleIntervalGroup.classList.toggle('hidden', currentScheduleType !== 'interval');
    scheduleTimeGroup.classList.toggle('hidden', currentScheduleType === 'interval');
    scheduleDaysGroup.classList.toggle('hidden', currentScheduleType !== 'weekly');
  }

  /**
   * Save schedule
   */
  async function saveSchedule() {
    const taskId = scheduleTaskSelect.value;
    if (!taskId) {
      showToast('请选择任务', 'error');
      return;
    }

    const config = {};
    switch (currentScheduleType) {
      case 'interval':
        config.interval = parseInt(scheduleInterval.value);
        break;
      case 'daily':
        config.time = scheduleTime.value;
        break;
      case 'weekly':
        config.time = scheduleTime.value;
        config.days = Array.from(dayOptions)
          .filter(opt => opt.checked)
          .map(opt => parseInt(opt.value));
        if (config.days.length === 0) {
          showToast('请选择至少一天', 'error');
          return;
        }
        break;
    }

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'create_schedule',
        taskId,
        type: currentScheduleType,
        config
      });

      if (response.success) {
        showToast(i18n('scheduleCreated'), 'success');
        closeScheduleModal();
        await loadSchedules();
      } else {
        throw new Error(response.error || 'Failed to create schedule');
      }
    } catch (error) {
      showToast(`${i18n('error')}: ${error.message}`, 'error');
    }
  }

  // Schedule event listeners
  btnAddSchedule.addEventListener('click', openScheduleModal);
  btnCloseScheduleModal.addEventListener('click', closeScheduleModal);
  btnCancelSchedule.addEventListener('click', closeScheduleModal);
  btnSaveSchedule.addEventListener('click', saveSchedule);

  scheduleTypeOptions.forEach(opt => {
    opt.addEventListener('click', () => {
      currentScheduleType = opt.dataset.scheduleType;
      updateScheduleTypeUI();
    });
  });

  // Enable add schedule button when tasks are loaded
  function updateAddScheduleButton() {
    btnAddSchedule.disabled = allTasks.length === 0;
  }

  // Load tasks and schedules together
  async function loadTasksAndSchedules() {
    await loadTasks();
    updateAddScheduleButton();
    await loadSchedules();
  }

  // Initial load
  loadTasksAndSchedules();
});
