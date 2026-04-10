/**
 * Tests for Feature Integration module
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';

// Setup DOM
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.document = dom.window.document;
global.window = dom.window;

// Polyfill URL.createObjectURL for JSDOM
if (!URL.createObjectURL) {
  URL.createObjectURL = vi.fn(() => 'blob:test');
  URL.revokeObjectURL = vi.fn();
}

// Mock chrome API
global.chrome = {
  runtime: {
    getURL: vi.fn(path => `chrome-extension://test/${path}`),
    sendMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn()
    }
  },
  tabs: {
    create: vi.fn()
  },
  storage: {
    local: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined)
    }
  }
};

// Mock dependencies
vi.mock('../lib/command-palette.js', () => ({
  CommandPalette: vi.fn().mockImplementation(() => ({
    open: vi.fn(),
    close: vi.fn(),
    toggle: vi.fn(),
    register: vi.fn(),
    unregister: vi.fn(),
    destroy: vi.fn()
  })),
  addCommandPaletteStyles: vi.fn(),
  DEFAULT_COMMANDS: []
}));

vi.mock('../lib/streaming-ui.js', () => ({
  StreamingResponseUI: vi.fn().mockImplementation(() => ({
    startResponse: vi.fn(),
    handleChunk: vi.fn(),
    complete: vi.fn(),
    showError: vi.fn(),
    clear: vi.fn()
  })),
  addStreamingUIStyles: vi.fn()
}));

vi.mock('../lib/state-sync.js', () => ({
  getGlobalStateSync: vi.fn().mockImplementation(() => ({
    get: vi.fn((key, def) => def),
    set: vi.fn(),
    getState: vi.fn(() => ({})),
    clear: vi.fn(),
    subscribe: vi.fn(),
    destroy: vi.fn()
  })),
  StateKeys: {
    UI_THEME: 'ui.theme',
    AGENT_RUNNING: 'agent.running'
  }
}));

vi.mock('../lib/debug-mode.js', () => ({
  enableDebugMode: vi.fn(),
  toggleDebugPanel: vi.fn(),
  isDebugEnabled: vi.fn(() => false)
}));

vi.mock('../lib/logger.js', () => ({
  uiLogger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

import { FeatureIntegrator, createFeatureIntegrator, integrateFeatures } from '../lib/feature-integration.js';

describe('FeatureIntegrator', () => {
  let integrator;
  let mockOptions;

  beforeEach(() => {
    vi.clearAllMocks();
    mockOptions = {
      container: document.body,
      agentUI: {
        clearOutput: vi.fn(),
        showNotification: vi.fn(),
        isRunning: false
      },
      tabManager: {
        getCurrentTab: vi.fn(() => 'prompt'),
        switchTo: vi.fn()
      },
      codeEditor: {
        focus: vi.fn(),
        getValue: vi.fn(() => '')
      },
      promptEditor: {
        focus: vi.fn(),
        getValue: vi.fn(() => '')
      },
      outputElement: document.createElement('div'),
      onRunPrompt: vi.fn(),
      onRunCode: vi.fn(),
      onSave: vi.fn()
    };
    integrator = new FeatureIntegrator(mockOptions);
  });

  afterEach(() => {
    integrator?.destroy();
  });

  describe('init', () => {
    it('should initialize all features', async () => {
      await integrator.init();
      expect(integrator.isInitialized).toBe(true);
    });

    it('should not initialize twice', async () => {
      await integrator.init();
      await integrator.init();
      expect(integrator.isInitialized).toBe(true);
    });
  });

  describe('command palette', () => {
    it('should be accessible after init', async () => {
      await integrator.init();
      expect(integrator.commandPalette).toBeDefined();
    });

    it('should open via openCommandPalette', async () => {
      await integrator.init();
      integrator.openCommandPalette('test');
      expect(integrator.commandPalette.open).toHaveBeenCalledWith('test');
    });
  });

  describe('streaming UI', () => {
    it('should handle streaming response', async () => {
      await integrator.init();
      integrator.startStreamingResponse();
      integrator.handleStreamingChunk('test');
      integrator.completeStreamingResponse();
    });

    it('should handle streaming errors', async () => {
      await integrator.init();
      integrator.showStreamingError('test error');
    });
  });

  describe('state management', () => {
    it('should set and get state', async () => {
      await integrator.init();
      integrator.setState('test.key', 'value');
      integrator.getState('test.key');
    });
  });

  describe('theme', () => {
    it('should toggle theme', async () => {
      await integrator.init();
      integrator.toggleTheme();
    });

    it('should apply theme', async () => {
      await integrator.init();
      integrator.applyTheme('dark');
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });
  });

  describe('export', () => {
    it('should export state', async () => {
      await integrator.init();
      integrator.exportState();
    });
  });

  describe('destroy', () => {
    it('should clean up resources', async () => {
      await integrator.init();
      integrator.destroy();
      expect(integrator.isInitialized).toBe(false);
    });
  });
});

describe('createFeatureIntegrator', () => {
  it('should create integrator instance', () => {
    const integrator = createFeatureIntegrator({});
    expect(integrator).toBeInstanceOf(FeatureIntegrator);
  });
});

describe('integrateFeatures', () => {
  it('should create and initialize integrator', async () => {
    const integrator = await integrateFeatures({});
    expect(integrator).toBeInstanceOf(FeatureIntegrator);
    expect(integrator.isInitialized).toBe(true);
    integrator.destroy();
  });
});
