// tasks/tasks.js

document.addEventListener('DOMContentLoaded', () => {
  // Localize document
  localizeDocument();

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
      const matchesSearch = !currentSearch ||
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

    tasksGrid.innerHTML = filtered.map(task => `
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
    `).join('');
  }

  // === Event Delegation for Task Actions ===
  tasksGrid.addEventListener('click', async (e) => {
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
    editContent.style.fontFamily = task.type === 'code'
      ? "var(--font-mono)" : "var(--font)";

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
      editContent.style.fontFamily = btn === typeCode
        ? "var(--font-mono)" : "var(--font)";
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

  // === Search ===
  searchInput.addEventListener('input', (e) => {
    currentSearch = e.target.value.toLowerCase().trim();
    renderTasks();
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
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.add('hidden');
      }
    });
  });

  // === Close modals on Escape ===
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      editModal.classList.add('hidden');
      deleteModal.classList.add('hidden');
    }
  });

  // === Toast Notification ===
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = {
      success: '✅',
      error: '❌',
      info: 'ℹ️'
    };

    toast.innerHTML = `<span>${icons[type] || ''}</span><span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(20px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // === Utility ===
  function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }

  function formatDate(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return i18n('justNow');
    if (minutes < 60) return i18n('minutesAgo', [minutes]);
    if (hours < 24) return i18n('hoursAgo', [hours]);
    if (days < 7) return i18n('daysAgo', [days]);
    return date.toLocaleDateString();
  }

  // === Tab key in editor ===
  editContent.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = editContent.selectionStart;
      const end = editContent.selectionEnd;
      editContent.value = editContent.value.substring(0, start) + '  ' + editContent.value.substring(end);
      editContent.selectionStart = editContent.selectionEnd = start + 2;
    }
  });

  // === Initialize ===
  loadTasks();
});
