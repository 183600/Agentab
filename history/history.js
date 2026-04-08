// history/history.js

document.addEventListener('DOMContentLoaded', async () => {
  // Localize document
  localizeDocument();

  // === Theme ===
  await initTheme();

  // === Elements ===
  const historyList = document.getElementById('history-list');
  const emptyState = document.getElementById('empty-state');
  const searchInput = document.getElementById('search-input');
  const filterTabs = document.querySelectorAll('.filter-tab');
  const totalExecutionsEl = document.getElementById('total-executions');
  const successCountEl = document.getElementById('success-count');
  const errorCountEl = document.getElementById('error-count');
  const promptCountEl = document.getElementById('prompt-count');
  const btnClearHistory = document.getElementById('btn-clear-history');
  const detailModal = document.getElementById('detail-modal');
  const detailContent = document.getElementById('detail-content');
  const deleteModal = document.getElementById('delete-modal');

  let allHistory = [];
  let currentFilter = 'all';
  let currentSearch = '';
  let selectedHistoryItem = null;

  // === Load History ===
  async function loadHistory() {
    const response = await chrome.runtime.sendMessage({ action: 'get_history' });
    if (response.success) {
      allHistory = response.history || [];
      updateStats();
      renderHistory();
    }
  }

  // === Update Stats ===
  function updateStats() {
    totalExecutionsEl.textContent = allHistory.length;
    promptCountEl.textContent = allHistory.filter(h => h.type === 'prompt').length;

    let successCount = 0;
    let errorCount = 0;

    allHistory.forEach(h => {
      if (h.results) {
        const lastResult = h.results[h.results.length - 1];
        if (lastResult?.type === 'complete' || lastResult?.type === 'execution') {
          successCount++;
        } else if (lastResult?.type === 'error') {
          errorCount++;
        }
      }
    });

    successCountEl.textContent = successCount;
    errorCountEl.textContent = errorCount;
  }

  // === Filter & Search ===
  function getFilteredHistory() {
    return allHistory.filter(item => {
      const matchesFilter = currentFilter === 'all' || item.type === currentFilter;
      const matchesSearch = !currentSearch ||
        item.input?.toLowerCase().includes(currentSearch) ||
        item.tabUrl?.toLowerCase().includes(currentSearch) ||
        item.tabTitle?.toLowerCase().includes(currentSearch);
      return matchesFilter && matchesSearch;
    });
  }

  // === Render History ===
  function renderHistory() {
    const filtered = getFilteredHistory();

    if (allHistory.length === 0) {
      historyList.classList.add('hidden');
      emptyState.classList.remove('hidden');
      return;
    }

    emptyState.classList.add('hidden');

    if (filtered.length === 0) {
      historyList.innerHTML = `
        <div class="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="11" cy="11" r="8"/>
            <path d="M21 21l-4.35-4.35"/>
          </svg>
          <h3>${i18n('noResults')}</h3>
          <p>${i18n('noResultsHint')}</p>
        </div>
      `;
      historyList.classList.remove('hidden');
      return;
    }

    historyList.classList.remove('hidden');
    historyList.innerHTML = filtered.map(item => renderHistoryItem(item)).join('');
  }

  function renderHistoryItem(item) {
    const typeIcon = item.type === 'prompt'
      ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
        </svg>`
      : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
        </svg>`;

    const lastResult = item.results?.[item.results.length - 1];
    const isSuccess = lastResult?.type === 'complete' || lastResult?.type === 'execution';
    const statusClass = isSuccess ? 'success' : 'error';
    const statusIcon = isSuccess
      ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>`
      : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="15" y1="9" x2="9" y2="15"/>
          <line x1="9" y1="9" x2="15" y2="15"/>
        </svg>`;

    return `
      <div class="history-item" data-id="${item.timestamp}">
        <div class="history-icon ${item.type}">
          ${typeIcon}
        </div>
        <div class="history-content">
          <div class="history-header">
            <span class="history-type ${item.type}">
              ${item.type === 'prompt' ? i18n('typePrompt') : i18n('typeCode')}
            </span>
            <span class="history-time">${formatDate(item.timestamp)}</span>
          </div>
          <div class="history-preview">${escapeHtml(item.input?.substring(0, 150) || '')}${(item.input?.length || 0) > 150 ? '...' : ''}</div>
          <div class="history-meta">
            <span class="history-meta-item">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="2" y1="12" x2="22" y2="12"/>
                <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
              </svg>
              ${escapeHtml(item.tabTitle?.substring(0, 30) || 'Unknown')}${(item.tabTitle?.length || 0) > 30 ? '...' : ''}
            </span>
            <span class="history-meta-item">
              ${item.results?.length || 0} ${i18n('stepsCount')}
            </span>
            <span class="history-status ${statusClass}">
              ${statusIcon}
              ${isSuccess ? i18n('statusSuccess') : i18n('statusFailed')}
            </span>
          </div>
        </div>
      </div>
    `;
  }

  // === Event Handlers ===
  historyList.addEventListener('click', (e) => {
    const item = e.target.closest('.history-item');
    if (!item) return;

    const id = item.dataset.id;
    const historyItem = allHistory.find(h => h.timestamp === id);
    if (historyItem) {
      openDetailModal(historyItem);
    }
  });

  // Search (with debounce)
  const debouncedSearch = debounce((value) => {
    currentSearch = value.toLowerCase().trim();
    renderHistory();
  }, 300);

  searchInput.addEventListener('input', (e) => {
    debouncedSearch(e.target.value);
  });

  // Filters
  filterTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      filterTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentFilter = tab.dataset.filter;
      renderHistory();
    });
  });

  // Clear History
  btnClearHistory.addEventListener('click', () => {
    deleteModal.classList.remove('hidden');
  });

  document.getElementById('btn-close-delete-modal').addEventListener('click', () => {
    deleteModal.classList.add('hidden');
  });

  document.getElementById('btn-cancel-clear').addEventListener('click', () => {
    deleteModal.classList.add('hidden');
  });

  document.getElementById('btn-confirm-clear').addEventListener('click', async () => {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'clear_history' });
      if (response.success) {
        deleteModal.classList.add('hidden');
        showToast(i18n('historyCleared'), 'success');
        await loadHistory();
      }
    } catch (e) {
      showToast(`${i18n('error')}: ${e.message}`, 'error');
    }
  });

  // Detail Modal
  function openDetailModal(item) {
    selectedHistoryItem = item;
    detailContent.innerHTML = renderDetailContent(item);
    detailModal.classList.remove('hidden');
  }

  function renderDetailContent(item) {
    return `
      <div class="detail-section">
        <div class="detail-label">${i18n('typeLabel')}</div>
        <div class="detail-value">
          <span class="history-type ${item.type}">
            ${item.type === 'prompt' ? i18n('typePrompt') : i18n('typeCode')}
          </span>
        </div>
      </div>
      <div class="detail-section">
        <div class="detail-label">${i18n('inputLabel')}</div>
        <div class="detail-code">${escapeHtml(item.input || '')}</div>
      </div>
      <div class="detail-section">
        <div class="detail-label">${i18n('pageLabel')}</div>
        <div class="detail-value">${escapeHtml(item.tabTitle || 'Unknown')}</div>
        <div class="detail-value text-muted" style="font-size: 12px; margin-top: 4px;">${escapeHtml(item.tabUrl || '')}</div>
      </div>
      <div class="detail-section">
        <div class="detail-label">${i18n('timeLabel')}</div>
        <div class="detail-value">${new Date(item.timestamp).toLocaleString()}</div>
      </div>
      <div class="detail-section">
        <div class="detail-label">${i18n('resultsLabel')}</div>
        <div class="detail-results">
          ${item.results?.map((r, i) => renderResultItem(r, i + 1)).join('') || '<div class="detail-value text-muted">No results</div>'}
        </div>
      </div>
    `;
  }

  function renderResultItem(result, index) {
    const typeClass = result.type === 'complete' ? 'complete' :
                      result.type === 'error' ? 'error' : 'execution';
    const typeIcon = result.type === 'complete' ? '✅' :
                     result.type === 'error' ? '❌' : '⚡';

    let content = '';
    if (result.type === 'execution') {
      content = `<strong>Step ${index}:</strong> ${escapeHtml(result.explanation || '')}`;
      if (result.code) {
        content += `<br><code style="display: block; margin-top: 6px; padding: 6px; background: rgba(0,0,0,0.1); border-radius: 4px; font-size: 11px;">${escapeHtml(result.code.substring(0, 100))}${result.code.length > 100 ? '...' : ''}</code>`;
      }
    } else if (result.type === 'complete') {
      content = `<strong>Completed:</strong> ${escapeHtml(result.result || result.explanation || '')}`;
    } else if (result.type === 'error') {
      content = `<strong>Error:</strong> ${escapeHtml(result.message || '')}`;
    }

    return `<div class="result-item ${typeClass}">${typeIcon} ${content}</div>`;
  }

  document.getElementById('btn-close-modal').addEventListener('click', () => {
    detailModal.classList.add('hidden');
  });

  document.getElementById('btn-close-detail').addEventListener('click', () => {
    detailModal.classList.add('hidden');
  });

  document.getElementById('btn-rerun').addEventListener('click', async () => {
    if (!selectedHistoryItem) return;

    detailModal.classList.add('hidden');
    showToast(i18n('rerunning'), 'info');

    try {
      const action = selectedHistoryItem.type === 'prompt' ? 'execute_prompt' : 'execute_code';
      const key = selectedHistoryItem.type === 'prompt' ? 'prompt' : 'code';

      const response = await chrome.runtime.sendMessage({
        action,
        [key]: selectedHistoryItem.input
      });

      if (response.success) {
        showToast(i18n('rerunSuccess'), 'success');
        await loadHistory();
      } else {
        showToast(i18n('rerunFailed', [response.error]), 'error');
      }
    } catch (e) {
      showToast(`${i18n('error')}: ${e.message}`, 'error');
    }
  });

  // Close modals on overlay click
  [detailModal, deleteModal].forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.add('hidden');
      }
    });
  });

  // Close modals on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      detailModal.classList.add('hidden');
      deleteModal.classList.add('hidden');
    }
  });

  // Back button
  document.getElementById('btn-back').addEventListener('click', (e) => {
    e.preventDefault();
    window.close();
  });

  // === Initialize ===
  loadHistory();
});
