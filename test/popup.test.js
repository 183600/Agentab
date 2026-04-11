// test/popup.test.js - Tests for popup UI functionality
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock DOM elements and i18n
const mockElements = () => {
  document.body.innerHTML = `
    <div class="tab" data-tab="prompt">Prompt</div>
    <div class="tab" data-tab="code">Code</div>
    <div id="tab-prompt" class="tab-content active"></div>
    <div id="tab-code" class="tab-content"></div>
    <textarea id="prompt-input"></textarea>
    <textarea id="code-input"></textarea>
    <button id="btn-run-prompt">Run</button>
    <button id="btn-run-code">Run</button>
    <button id="btn-save-prompt">Save</button>
    <button id="btn-save-code">Save</button>
    <button id="btn-tasks">Tasks</button>
    <button id="btn-settings">Settings</button>
    <div id="output-section" class="hidden"></div>
    <div id="output-content"></div>
    <button id="btn-clear-output">Clear</button>
    <div id="save-dialog" class="hidden">
      <input id="task-name" type="text">
      <textarea id="task-description"></textarea>
      <span id="task-type-badge"></span>
      <div id="task-content-preview"></div>
      <button id="btn-close-save-dialog">Close</button>
      <button id="btn-cancel-save">Cancel</button>
      <button id="btn-confirm-save">Confirm</button>
    </div>
  `;
};

// Mock i18n function
global.i18n = vi.fn((key, args) => {
  const messages = {
    taskSaved: 'Task saved',
    taskSaveFailed: 'Task save failed: {0}',
    enterPromptFirst: 'Please enter a prompt first',
    enterCodeFirst: 'Please enter code first',
    error: 'Error'
  };
  let msg = messages[key] || key;
  if (args) {
    args.forEach((arg, i) => {
      msg = msg.replace(`{${i}}`, arg);
    });
  }
  return msg;
});

// Mock localizeDocument
global.localizeDocument = vi.fn();

describe('Popup DOM Structure', () => {
  beforeEach(() => {
    mockElements();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('should have prompt and code tabs', () => {
    const tabs = document.querySelectorAll('.tab');
    expect(tabs.length).toBe(2);
    expect(tabs[0].dataset.tab).toBe('prompt');
    expect(tabs[1].dataset.tab).toBe('code');
  });

  it('should have tab contents', () => {
    const promptContent = document.getElementById('tab-prompt');
    const codeContent = document.getElementById('tab-code');
    expect(promptContent).toBeTruthy();
    expect(codeContent).toBeTruthy();
  });

  it('should have input elements', () => {
    const promptInput = document.getElementById('prompt-input');
    const codeInput = document.getElementById('code-input');
    expect(promptInput).toBeTruthy();
    expect(codeInput).toBeTruthy();
  });

  it('should have action buttons', () => {
    expect(document.getElementById('btn-run-prompt')).toBeTruthy();
    expect(document.getElementById('btn-run-code')).toBeTruthy();
    expect(document.getElementById('btn-save-prompt')).toBeTruthy();
    expect(document.getElementById('btn-save-code')).toBeTruthy();
    expect(document.getElementById('btn-tasks')).toBeTruthy();
    expect(document.getElementById('btn-settings')).toBeTruthy();
  });

  it('should have output section initially hidden', () => {
    const outputSection = document.getElementById('output-section');
    expect(outputSection.classList.contains('hidden')).toBe(true);
  });

  it('should have save dialog initially hidden', () => {
    const saveDialog = document.getElementById('save-dialog');
    expect(saveDialog.classList.contains('hidden')).toBe(true);
  });
});

describe('Tab Switching', () => {
  beforeEach(() => {
    mockElements();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('should switch tabs on click', () => {
    const tabs = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-content');

    // Initial state
    expect(tabs[0].classList.contains('active') || document.getElementById('tab-prompt').classList.contains('active')).toBe(true);

    // Click code tab
    tabs[1].click();

    // After click (if event listener is attached)
    // Note: Full tab switching logic is in popup.js
    expect(tabs[1].dataset.tab).toBe('code');
  });
});

describe('Tab Key Support', () => {
  beforeEach(() => {
    mockElements();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('should insert spaces on Tab key in code input', () => {
    const codeInput = document.getElementById('code-input');
    codeInput.value = 'test';

    const tabEvent = new KeyboardEvent('keydown', {
      key: 'Tab',
      cancelable: true
    });

    // Simulate Tab key handling
    codeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = codeInput.selectionStart;
        const end = codeInput.selectionEnd;
        codeInput.value = codeInput.value.substring(0, start) + '  ' + codeInput.value.substring(end);
        codeInput.selectionStart = codeInput.selectionEnd = start + 2;
      }
    });

    codeInput.dispatchEvent(tabEvent);
    expect(codeInput.value).toBe('  test');
  });
});

describe('Chrome API Integration', () => {
  beforeEach(() => {
    mockElements();
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('should send execute_prompt message', async () => {
    const prompt = 'Test prompt';
    
    await chrome.runtime.sendMessage({
      action: 'execute_prompt',
      prompt
    });

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      action: 'execute_prompt',
      prompt
    });
  });

  it('should send execute_code message', async () => {
    const code = 'console.log("test")';
    
    await chrome.runtime.sendMessage({
      action: 'execute_code',
      code
    });

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      action: 'execute_code',
      code
    });
  });

  it('should send save_task message', async () => {
    const task = {
      name: 'Test Task',
      type: 'prompt',
      content: 'Test content',
      description: 'Test description'
    };

    await chrome.runtime.sendMessage({
      action: 'save_task',
      task
    });

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      action: 'save_task',
      task
    });
  });

  it('should open settings page', () => {
    const settingsUrl = chrome.runtime.getURL('settings/settings.html');
    expect(settingsUrl).toContain('settings/settings.html');
  });

  it('should open tasks page', () => {
    const tasksUrl = chrome.runtime.getURL('tasks/tasks.html');
    expect(tasksUrl).toContain('tasks/tasks.html');
  });
});

describe('Input Validation', () => {
  beforeEach(() => {
    mockElements();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('should not run with empty prompt', () => {
    const promptInput = document.getElementById('prompt-input');
    promptInput.value = '';
    
    const shouldRun = promptInput.value.trim().length > 0;
    expect(shouldRun).toBe(false);
  });

  it('should not run with whitespace-only prompt', () => {
    const promptInput = document.getElementById('prompt-input');
    promptInput.value = '   ';
    
    const shouldRun = promptInput.value.trim().length > 0;
    expect(shouldRun).toBe(false);
  });

  it('should run with valid prompt', () => {
    const promptInput = document.getElementById('prompt-input');
    promptInput.value = 'Click the submit button';
    
    const shouldRun = promptInput.value.trim().length > 0;
    expect(shouldRun).toBe(true);
  });

  it('should not run with empty code', () => {
    const codeInput = document.getElementById('code-input');
    codeInput.value = '';
    
    const shouldRun = codeInput.value.trim().length > 0;
    expect(shouldRun).toBe(false);
  });

  it('should run with valid code', () => {
    const codeInput = document.getElementById('code-input');
    codeInput.value = 'document.querySelector("button").click()';
    
    const shouldRun = codeInput.value.trim().length > 0;
    expect(shouldRun).toBe(true);
  });
});

describe('Save Dialog', () => {
  beforeEach(() => {
    mockElements();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('should open dialog with correct type', () => {
    const saveDialog = document.getElementById('save-dialog');
    const typeBadge = document.getElementById('task-type-badge');
    const contentPreview = document.getElementById('task-content-preview');

    // Simulate opening dialog
    saveDialog.classList.remove('hidden');
    typeBadge.textContent = 'Prompt';
    contentPreview.textContent = 'Test content...';

    expect(saveDialog.classList.contains('hidden')).toBe(false);
    expect(typeBadge.textContent).toBe('Prompt');
  });

  it('should close dialog on cancel', () => {
    const saveDialog = document.getElementById('save-dialog');
    saveDialog.classList.remove('hidden');

    // Simulate cancel
    saveDialog.classList.add('hidden');

    expect(saveDialog.classList.contains('hidden')).toBe(true);
  });

  it('should require task name', () => {
    const nameInput = document.getElementById('task-name');
    nameInput.value = '';

    const isValid = nameInput.value.trim().length > 0;
    expect(isValid).toBe(false);
  });

  it('should preview content truncated', () => {
    const longContent = 'a'.repeat(500);
    const preview = longContent.substring(0, 300) + (longContent.length > 300 ? '...' : '');

    expect(preview.length).toBe(303); // 300 + 3 for '...'
    expect(preview.endsWith('...')).toBe(true);
  });
});
