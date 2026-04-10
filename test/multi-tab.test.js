/**
 * Tests for Multi-Tab Coordinator module
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock chrome API
const mockTabs = [
  { id: 1, url: 'https://example.com', title: 'Example' },
  { id: 2, url: 'https://test.com', title: 'Test' },
  { id: 3, url: 'https://demo.com', title: 'Demo' }
];

const mockChrome = {
  tabs: {
    query: vi.fn().mockResolvedValue(mockTabs),
    create: vi.fn().mockResolvedValue({ id: 10 }),
    remove: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    group: vi.fn().mockResolvedValue(100),
    ungroup: vi.fn().mockResolvedValue(undefined),
    onUpdated: {
      addListener: vi.fn(),
      removeListener: vi.fn()
    }
  },
  scripting: {
    executeScript: vi.fn().mockResolvedValue([{ result: 'success' }])
  },
  runtime: {
    sendMessage: vi.fn().mockResolvedValue({ success: true, results: {} })
  }
};

global.chrome = mockChrome;

// Mock logger
vi.mock('../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }
}));

import {
  MultiTabCoordinator,
  TabGroup,
  TabWorkflow,
  executeOnAllTabs,
  runTabWorkflow,
  TaskStatus,
  TabConnectionStatus,
  getMultiTabCoordinator
} from '../lib/multi-tab.js';

describe('MultiTabCoordinator', () => {
  let coordinator;

  beforeEach(() => {
    vi.clearAllMocks();
    coordinator = new MultiTabCoordinator();
  });

  afterEach(() => {
    coordinator = null;
  });

  describe('getAllTabs', () => {
    it('should return all tabs', async () => {
      const tabs = await coordinator.getAllTabs();
      expect(tabs).toHaveLength(3);
    });

    it('should filter restricted tabs', async () => {
      mockChrome.tabs.query.mockResolvedValueOnce([
        { id: 1, url: 'https://example.com' },
        { id: 2, url: 'chrome://extensions' },
        { id: 3, url: 'chrome-extension://test' }
      ]);
      
      const tabs = await coordinator.getAllTabs();
      expect(tabs).toHaveLength(1);
    });
  });

  describe('isValidTab', () => {
    it('should accept valid tabs', () => {
      expect(coordinator.isValidTab({ id: 1, url: 'https://example.com' })).toBe(true);
    });

    it('should reject tabs without ID', () => {
      expect(coordinator.isValidTab({ url: 'https://example.com' })).toBe(false);
    });

    it('should reject tabs without URL', () => {
      expect(coordinator.isValidTab({ id: 1 })).toBe(false);
    });

    it('should reject chrome:// URLs', () => {
      expect(coordinator.isValidTab({ id: 1, url: 'chrome://settings' })).toBe(false);
    });

    it('should reject chrome-extension:// URLs', () => {
      expect(coordinator.isValidTab({ id: 1, url: 'chrome-extension://test' })).toBe(false);
    });
  });

  describe('executeOnTabs', () => {
    it('should execute on specified tabs', async () => {
      const result = await coordinator.executeOnTabs({
        tabIds: [1, 2],
        type: 'code',
        content: 'document.title'
      });
      
      expect(result.status).toBe(TaskStatus.COMPLETED);
      expect(result.results).toHaveLength(2);
    });

    it('should execute on all tabs when tabIds is "all"', async () => {
      const result = await coordinator.executeOnTabs({
        tabIds: 'all',
        type: 'code',
        content: 'document.title'
      });
      
      expect(result.status).toBe(TaskStatus.COMPLETED);
      expect(result.results).toHaveLength(3);
    });

    it('should throw error when no valid tabs', async () => {
      mockChrome.tabs.query.mockResolvedValueOnce([]);
      
      await expect(
        coordinator.executeOnTabs({
          tabIds: 'all',
          type: 'code',
          content: 'test'
        })
      ).rejects.toThrow('No valid tabs');
    });

    it('should call onProgress callback', async () => {
      const onProgress = vi.fn();
      
      await coordinator.executeOnTabs({
        tabIds: [1],
        type: 'code',
        content: 'test',
        options: {}
      });
      
      // Progress is called internally via constructor options
      const progressCoordinator = new MultiTabCoordinator({ onProgress });
      await progressCoordinator.executeOnTabs({
        tabIds: [1],
        type: 'code',
        content: 'test'
      });
      
      expect(onProgress).toHaveBeenCalled();
    });

    it('should call onComplete callback', async () => {
      const onComplete = vi.fn();
      
      const completeCoordinator = new MultiTabCoordinator({ onComplete });
      await completeCoordinator.executeOnTabs({
        tabIds: [1],
        type: 'code',
        content: 'test'
      });
      
      expect(onComplete).toHaveBeenCalled();
    });
  });

  describe('executeCode', () => {
    it('should execute code on tab', async () => {
      const result = await coordinator.executeCode(1, 'return 1 + 1');
      expect(result).toBe('success');
    });

    it('should handle execution errors', async () => {
      mockChrome.scripting.executeScript.mockResolvedValueOnce([{
        result: { __error: true, message: 'Test error' }
      }]);
      
      await expect(
        coordinator.executeCode(1, 'throw new Error("test")')
      ).rejects.toThrow('Test error');
    });
  });

  describe('executePrompt', () => {
    it('should execute prompt via runtime', async () => {
      const result = await coordinator.executePrompt(1, 'Click button');
      expect(result).toBeDefined();
    });

    it('should handle prompt execution failure', async () => {
      mockChrome.runtime.sendMessage.mockResolvedValueOnce({
        success: false,
        error: 'API error'
      });
      
      await expect(
        coordinator.executePrompt(1, 'Test prompt')
      ).rejects.toThrow('API error');
    });
  });

  describe('cancel', () => {
    it('should cancel running task', async () => {
      const execution = coordinator.executeOnTabs({
        tabIds: [1, 2],
        type: 'code',
        content: 'test'
      });
      
      // Cancel immediately
      coordinator.cancel(Object.keys(coordinator.activeTasks)[0]);
      
      await execution;
    });
  });

  describe('getStatus', () => {
    it('should return null for non-existent task', () => {
      const status = coordinator.getStatus('non-existent');
      expect(status).toBeNull();
    });

    it('should return task status', async () => {
      const result = await coordinator.executeOnTabs({
        tabIds: [1],
        type: 'code',
        content: 'test'
      });
      
      const status = coordinator.getStatus(result.id);
      expect(status).toBeDefined();
      expect(status.status).toBe(TaskStatus.COMPLETED);
    });
  });

  describe('getActiveExecutions', () => {
    it('should return empty array when no active executions', () => {
      const executions = coordinator.getActiveExecutions();
      expect(executions).toHaveLength(0);
    });
  });

  describe('cleanup', () => {
    it('should clean up completed executions', async () => {
      await coordinator.executeOnTabs({
        tabIds: [1],
        type: 'code',
        content: 'test'
      });
      
      coordinator.cleanup();
    });
  });
});

describe('TabGroup', () => {
  let tabGroup;

  beforeEach(() => {
    vi.clearAllMocks();
    tabGroup = new TabGroup({
      name: 'Test Group',
      color: 'blue'
    });
  });

  it('should initialize correctly', () => {
    expect(tabGroup.name).toBe('Test Group');
    expect(tabGroup.color).toBe('blue');
    expect(tabGroup.tabIds).toHaveLength(0);
  });

  describe('create', () => {
    it('should throw error when no tabs', async () => {
      await expect(tabGroup.create()).rejects.toThrow('No tabs');
    });

    it('should create group with tabs', async () => {
      tabGroup.tabIds = [1, 2];
      const groupId = await tabGroup.create();
      
      expect(groupId).toBe(100);
      expect(mockChrome.tabs.group).toHaveBeenCalled();
    });
  });

  describe('addTab', () => {
    it('should add tab to group', async () => {
      await tabGroup.addTab(1);
      expect(tabGroup.tabIds).toContain(1);
    });
  });

  describe('removeTab', () => {
    it('should remove tab from group', async () => {
      tabGroup.tabIds = [1, 2];
      await tabGroup.removeTab(1);
      expect(tabGroup.tabIds).not.toContain(1);
    });
  });

  describe('closeAll', () => {
    it('should close all tabs', async () => {
      tabGroup.tabIds = [1, 2];
      await tabGroup.closeAll();
      
      expect(mockChrome.tabs.remove).toHaveBeenCalled();
      expect(tabGroup.tabIds).toHaveLength(0);
    });
  });

  describe('getTabs', () => {
    it('should return tabs in group', async () => {
      tabGroup.groupId = 100;
      const tabs = await tabGroup.getTabs();
      expect(Array.isArray(tabs)).toBe(true);
    });
  });
});

describe('TabWorkflow', () => {
  let workflow;

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock onUpdated listener to immediately trigger callback
    mockChrome.tabs.onUpdated.addListener.mockImplementation(callback => {
      // Simulate immediate tab load complete
      setTimeout(() => callback(10, { status: 'complete' }), 0);
    });
    
    workflow = new TabWorkflow({
      name: 'Test Workflow',
      steps: [
        { action: 'open_tab', url: 'https://example.com', waitForLoad: false },
        { action: 'wait', duration: 10 },
        { action: 'close_tab' }
      ]
    });
  });

  it('should initialize correctly', () => {
    expect(workflow.name).toBe('Test Workflow');
    expect(workflow.steps).toHaveLength(3);
    expect(workflow.currentStep).toBe(0);
  });

  describe('run', () => {
    it('should execute workflow steps', async () => {
      // Increase timeout for workflow tests
      const result = await workflow.run();
      
      expect(result.success).toBe(true);
      expect(result.steps).toHaveLength(3);
    }, 30000);

    it('should throw if already running', async () => {
      const runPromise = workflow.run();
      
      await expect(workflow.run()).rejects.toThrow('already running');
      await runPromise;
    }, 30000);

    it('should update context between steps', async () => {
      const context = { customData: 'test' };
      const result = await workflow.run(context);
      
      expect(result.context.customData).toBe('test');
      expect(result.context.stepIndex).toBeDefined();
    }, 30000);

    it('should stop on error when configured', async () => {
      workflow = new TabWorkflow({
        name: 'Error Workflow',
        steps: [
          { action: 'open_tab', url: 'https://example.com' },
          { action: 'invalid_action', stopOnError: true },
          { action: 'close_tab' }
        ]
      });
      
      const result = await workflow.run();
      expect(result.steps).toHaveLength(2); // Stopped at step 2
    }, 30000);
  });

  describe('getProgress', () => {
    it('should return workflow progress', () => {
      const progress = workflow.getProgress();
      
      expect(progress.name).toBe('Test Workflow');
      expect(progress.totalSteps).toBe(3);
      expect(progress.progress).toBe('33.3%');
    });
  });
});

describe('Helper Functions', () => {
  it('should execute on all tabs', async () => {
    const result = await executeOnAllTabs({
      type: 'code',
      content: 'document.title'
    });
    
    expect(result).toBeDefined();
  });

  it('should run tab workflow', async () => {
    const result = await runTabWorkflow({
      name: 'Quick Test',
      steps: [{ action: 'wait', duration: 10 }]
    });
    
    expect(result).toBeDefined();
  });

  it('should get global coordinator', () => {
    const coordinator = getMultiTabCoordinator();
    expect(coordinator).toBeInstanceOf(MultiTabCoordinator);
    
    // Should return same instance
    const sameCoordinator = getMultiTabCoordinator();
    expect(coordinator).toBe(sameCoordinator);
  });
});

describe('Constants', () => {
  it('should export TaskStatus', () => {
    expect(TaskStatus.PENDING).toBe('pending');
    expect(TaskStatus.RUNNING).toBe('running');
    expect(TaskStatus.COMPLETED).toBe('completed');
    expect(TaskStatus.FAILED).toBe('failed');
    expect(TaskStatus.CANCELLED).toBe('cancelled');
  });

  it('should export TabConnectionStatus', () => {
    expect(TabConnectionStatus.CONNECTED).toBe('connected');
    expect(TabConnectionStatus.DISCONNECTED).toBe('disconnected');
    expect(TabConnectionStatus.ERROR).toBe('error');
  });
});
