// test/history.test.js - Tests for history page functionality
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock DOM elements
const mockHistoryElements = () => {
  document.body.innerHTML = `
    <div id="history-list"></div>
    <div id="empty-state"></div>
    <input id="search-input" type="text">
    <div class="filter-tab" data-filter="all">All</div>
    <div class="filter-tab" data-filter="prompt">Prompt</div>
    <div class="filter-tab" data-filter="code">Code</div>
    <span id="total-executions">0</span>
    <span id="success-count">0</span>
    <span id="error-count">0</span>
    <span id="prompt-count">0</span>
    <button id="btn-clear-history">Clear</button>
    <div id="detail-modal" class="hidden">
      <div id="detail-content"></div>
      <button id="btn-close-modal">Close</button>
      <button id="btn-close-detail">Close</button>
      <button id="btn-rerun">Rerun</button>
    </div>
    <div id="delete-modal" class="hidden">
      <button id="btn-close-delete-modal">Close</button>
      <button id="btn-cancel-clear">Cancel</button>
      <button id="btn-confirm-clear">Confirm</button>
    </div>
    <button id="btn-back">Back</button>
  `;
};

// Mock i18n function
global.i18n = vi.fn((key) => key);

// Mock localizeDocument
global.localizeDocument = vi.fn();

// Mock initTheme
global.initTheme = vi.fn(async () => {});

// Mock showToast
global.showToast = vi.fn();

// Mock escapeHtml
global.escapeHtml = vi.fn((str) => {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
});

// Mock debounce
global.debounce = vi.fn((fn, delay) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
});

// Mock formatDate
global.formatDate = vi.fn((timestamp) => {
  return new Date(timestamp).toLocaleString();
});

describe('History DOM Structure', () => {
  beforeEach(() => {
    mockHistoryElements();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('should have history list container', () => {
    expect(document.getElementById('history-list')).toBeTruthy();
  });

  it('should have empty state element', () => {
    expect(document.getElementById('empty-state')).toBeTruthy();
  });

  it('should have search input', () => {
    expect(document.getElementById('search-input')).toBeTruthy();
  });

  it('should have filter tabs', () => {
    const tabs = document.querySelectorAll('.filter-tab');
    expect(tabs.length).toBe(3);
  });

  it('should have stats elements', () => {
    expect(document.getElementById('total-executions')).toBeTruthy();
    expect(document.getElementById('success-count')).toBeTruthy();
    expect(document.getElementById('error-count')).toBeTruthy();
    expect(document.getElementById('prompt-count')).toBeTruthy();
  });

  it('should have modals initially hidden', () => {
    const detailModal = document.getElementById('detail-modal');
    const deleteModal = document.getElementById('delete-modal');
    expect(detailModal.classList.contains('hidden')).toBe(true);
    expect(deleteModal.classList.contains('hidden')).toBe(true);
  });
});

describe('History Loading', () => {
  beforeEach(() => {
    mockHistoryElements();
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('should fetch history from background', async () => {
    await chrome.runtime.sendMessage({ action: 'get_history' });

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      action: 'get_history'
    });
  });

  it('should handle empty history', () => {
    const history = [];
    const historyList = document.getElementById('history-list');
    const emptyState = document.getElementById('empty-state');

    if (history.length === 0) {
      historyList.classList.add('hidden');
      emptyState.classList.remove('hidden');
    }

    expect(historyList.classList.contains('hidden')).toBe(true);
    expect(emptyState.classList.contains('hidden')).toBe(false);
  });

  it('should render history items', () => {
    const history = [
      {
        timestamp: Date.now(),
        type: 'prompt',
        input: 'Click submit button',
        tabTitle: 'Test Page',
        tabUrl: 'https://example.com',
        results: [{ type: 'complete', result: 'Done' }]
      }
    ];

    expect(history.length).toBe(1);
    expect(history[0].type).toBe('prompt');
  });
});

describe('History Statistics', () => {
  const calculateStats = (history) => {
    const total = history.length;
    const promptCount = history.filter(h => h.type === 'prompt').length;

    let successCount = 0;
    let errorCount = 0;

    history.forEach(h => {
      if (h.results) {
        const lastResult = h.results[h.results.length - 1];
        if (lastResult?.type === 'complete' || lastResult?.type === 'execution') {
          successCount++;
        } else if (lastResult?.type === 'error') {
          errorCount++;
        }
      }
    });

    return { total, promptCount, successCount, errorCount };
  };

  it('should calculate correct stats', () => {
    const history = [
      { type: 'prompt', results: [{ type: 'complete' }] },
      { type: 'code', results: [{ type: 'error' }] },
      { type: 'prompt', results: [{ type: 'execution' }] },
      { type: 'code', results: [] }
    ];

    const stats = calculateStats(history);
    expect(stats.total).toBe(4);
    expect(stats.promptCount).toBe(2);
    expect(stats.successCount).toBe(2);
    expect(stats.errorCount).toBe(1);
  });

  it('should handle empty history', () => {
    const stats = calculateStats([]);
    expect(stats.total).toBe(0);
    expect(stats.promptCount).toBe(0);
    expect(stats.successCount).toBe(0);
    expect(stats.errorCount).toBe(0);
  });
});

describe('Filtering', () => {
  const filterHistory = (history, filter, search) => {
    return history.filter(item => {
      const matchesFilter = filter === 'all' || item.type === filter;
      const matchesSearch =
        !search ||
        item.input?.toLowerCase().includes(search) ||
        item.tabUrl?.toLowerCase().includes(search) ||
        item.tabTitle?.toLowerCase().includes(search);
      return matchesFilter && matchesSearch;
    });
  };

  const mockHistory = [
    { type: 'prompt', input: 'Click button', tabTitle: 'Test Page', tabUrl: 'https://example.com' },
    { type: 'code', input: 'document.querySelector()', tabTitle: 'Code Test', tabUrl: 'https://code.example.com' },
    { type: 'prompt', input: 'Fill form', tabTitle: 'Form Page', tabUrl: 'https://form.example.com' }
  ];

  it('should filter by type', () => {
    const filtered = filterHistory(mockHistory, 'prompt', '');
    expect(filtered.length).toBe(2);
    expect(filtered.every(h => h.type === 'prompt')).toBe(true);
  });

  it('should filter by code type', () => {
    const filtered = filterHistory(mockHistory, 'code', '');
    expect(filtered.length).toBe(1);
    expect(filtered[0].type).toBe('code');
  });

  it('should show all when filter is all', () => {
    const filtered = filterHistory(mockHistory, 'all', '');
    expect(filtered.length).toBe(3);
  });

  it('should search by input', () => {
    const filtered = filterHistory(mockHistory, 'all', 'click');
    expect(filtered.length).toBe(1);
    expect(filtered[0].input).toContain('Click');
  });

  it('should search by tab title', () => {
    const filtered = filterHistory(mockHistory, 'all', 'form');
    expect(filtered.length).toBe(1);
    expect(filtered[0].tabTitle).toContain('Form');
  });

  it('should search by tab URL', () => {
    const filtered = filterHistory(mockHistory, 'all', 'code.example');
    expect(filtered.length).toBe(1);
  });

  it('should combine filter and search', () => {
    const filtered = filterHistory(mockHistory, 'prompt', 'form');
    expect(filtered.length).toBe(1);
    expect(filtered[0].type).toBe('prompt');
    expect(filtered[0].input).toContain('form');
  });
});

describe('Detail Modal', () => {
  beforeEach(() => {
    mockHistoryElements();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('should open modal with history item details', () => {
    const detailModal = document.getElementById('detail-modal');
    const item = {
      timestamp: Date.now(),
      type: 'prompt',
      input: 'Test prompt',
      tabTitle: 'Test Page',
      tabUrl: 'https://example.com',
      results: [{ type: 'complete', result: 'Done' }]
    };

    detailModal.classList.remove('hidden');
    expect(detailModal.classList.contains('hidden')).toBe(false);
  });

  it('should close modal on close button', () => {
    const detailModal = document.getElementById('detail-modal');
    detailModal.classList.remove('hidden');

    const closeBtn = document.getElementById('btn-close-modal');
    closeBtn.click();
    detailModal.classList.add('hidden');

    expect(detailModal.classList.contains('hidden')).toBe(true);
  });

  it('should close modal on escape key', () => {
    const detailModal = document.getElementById('detail-modal');
    detailModal.classList.remove('hidden');

    const event = new KeyboardEvent('keydown', { key: 'Escape' });
    document.dispatchEvent(event);
    detailModal.classList.add('hidden');

    expect(detailModal.classList.contains('hidden')).toBe(true);
  });
});

describe('Delete Modal', () => {
  beforeEach(() => {
    mockHistoryElements();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('should open delete confirmation modal', () => {
    const deleteModal = document.getElementById('delete-modal');
    deleteModal.classList.remove('hidden');

    expect(deleteModal.classList.contains('hidden')).toBe(false);
  });

  it('should close on cancel', () => {
    const deleteModal = document.getElementById('delete-modal');
    deleteModal.classList.remove('hidden');

    const cancelBtn = document.getElementById('btn-cancel-clear');
    cancelBtn.click();
    deleteModal.classList.add('hidden');

    expect(deleteModal.classList.contains('hidden')).toBe(true);
  });

  it('should clear history on confirm', async () => {
    await chrome.runtime.sendMessage({ action: 'clear_history' });

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      action: 'clear_history'
    });
  });
});

describe('Rerun Functionality', () => {
  beforeEach(() => {
    mockHistoryElements();
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('should rerun prompt', async () => {
    const historyItem = {
      type: 'prompt',
      input: 'Click submit button'
    };

    await chrome.runtime.sendMessage({
      action: 'execute_prompt',
      prompt: historyItem.input
    });

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      action: 'execute_prompt',
      prompt: historyItem.input
    });
  });

  it('should rerun code', async () => {
    const historyItem = {
      type: 'code',
      input: 'document.querySelector("button").click()'
    };

    await chrome.runtime.sendMessage({
      action: 'execute_code',
      code: historyItem.input
    });

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      action: 'execute_code',
      code: historyItem.input
    });
  });
});

describe('Search Debounce', () => {
  beforeEach(() => {
    mockHistoryElements();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('should debounce search input', () => {
    const searchInput = document.getElementById('search-input');
    let searchValue = '';

    const debouncedSearch = debounce((value) => {
      searchValue = value.toLowerCase().trim();
    }, 300);

    searchInput.addEventListener('input', (e) => {
      debouncedSearch(e.target.value);
    });

    // Type quickly
    searchInput.value = 'te';
    searchInput.dispatchEvent(new Event('input'));

    searchInput.value = 'test';
    searchInput.dispatchEvent(new Event('input'));

    // Fast forward time
    vi.advanceTimersByTime(300);

    // Should only process once after debounce
    expect(searchValue).toBe('test');
  });
});
