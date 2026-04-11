// test/web-llm-provider.test.js - Tests for WebLLM Provider

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock WebLLM module since @mlc-ai/web-llm is not installed
vi.mock('@mlc-ai/web-llm', () => ({
  CreateMLCEngine: vi.fn(async () => ({
    chat: {
      completions: {
        create: vi.fn(async () => ({
          choices: [{ message: { content: 'Mock response' } }]
        }))
      }
    },
    unload: vi.fn(async () => {})
  }))
}));

import {
  WebLLMProvider,
  webLLMProvider,
  WebLLMModels,
  LoadingState,
  HybridLLMProvider
} from '../lib/web-llm-provider.js';

describe('WebLLMModels', () => {
  it('should have predefined models', () => {
    expect(WebLLMModels.PHI_2).toBeDefined();
    expect(WebLLMModels.PHI_3_MINI).toBeDefined();
    expect(WebLLMModels.LLAMA_3_8B).toBeDefined();
    expect(WebLLMModels.MISTRAL_7B).toBeDefined();
    expect(WebLLMModels.GEMMA_2B).toBeDefined();
    expect(WebLLMModels.TINY_LLAMA).toBeDefined();
  });

  it('should have required model properties', () => {
    Object.values(WebLLMModels).forEach(model => {
      expect(model.id).toBeDefined();
      expect(model.name).toBeDefined();
      expect(model.description).toBeDefined();
      expect(model.size).toBeDefined();
      expect(model.memory).toBeDefined();
      expect(model.url).toBeDefined();
    });
  });

  it('should have unique model IDs', () => {
    const ids = Object.values(WebLLMModels).map(m => m.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});

describe('LoadingState', () => {
  it('should have all expected states', () => {
    expect(LoadingState.IDLE).toBe('idle');
    expect(LoadingState.CHECKING_GPU).toBe('checking_gpu');
    expect(LoadingState.DOWNLOADING).toBe('downloading');
    expect(LoadingState.LOADING).toBe('loading');
    expect(LoadingState.READY).toBe('ready');
    expect(LoadingState.ERROR).toBe('error');
  });
});

describe('WebLLMProvider', () => {
  let provider;

  beforeEach(() => {
    provider = new WebLLMProvider();
  });

  afterEach(async () => {
    await provider.reset();
  });

  describe('constructor', () => {
    it('should initialize with default values', () => {
      expect(provider.engine).toBeNull();
      expect(provider.currentModel).toBeNull();
      expect(provider.loadingState).toBe(LoadingState.IDLE);
      expect(provider.loadingProgress).toBe(0);
      expect(provider.webgpuSupported).toBeNull();
    });
  });

  describe('checkWebGPUSupport', () => {
    it('should return cached result if already checked', async () => {
      provider.webgpuSupported = true;
      const result = await provider.checkWebGPUSupport();
      expect(result).toBe(true);
    });

    it('should return false if navigator.gpu is not available', async () => {
      const originalGPU = navigator.gpu;
      delete navigator.gpu;

      const result = await provider.checkWebGPUSupport();
      expect(result).toBe(false);

      if (originalGPU) navigator.gpu = originalGPU;
    });
  });

  describe('isAvailable', () => {
    it('should return true when WebLLM mock is available', async () => {
      const result = await provider.isAvailable();
      // Should be true since we have a mock
      expect(result).toBe(true);
    });
  });

  describe('getLoadingState', () => {
    it('should return current loading state', () => {
      provider.loadingState = LoadingState.READY;
      provider.loadingProgress = 50;
      provider.currentModel = 'test-model';

      const state = provider.getLoadingState();
      expect(state.state).toBe(LoadingState.READY);
      expect(state.progress).toBe(50);
      expect(state.model).toBe('test-model');
    });
  });

  describe('getModelInfo', () => {
    it('should return null if no model loaded', () => {
      const info = provider.getModelInfo();
      expect(info).toBeNull();
    });

    it('should return model info for loaded model', () => {
      provider.currentModel = WebLLMModels.PHI_2.id;
      const info = provider.getModelInfo();
      expect(info).toBeDefined();
      expect(info.id).toBe(WebLLMModels.PHI_2.id);
    });
  });

  describe('getAvailableModels', () => {
    it('should return all available models', () => {
      const models = provider.getAvailableModels();
      expect(models.length).toBe(Object.keys(WebLLMModels).length);
    });
  });

  describe('getRecommendedModel', () => {
    it('should return a recommended model based on device memory', () => {
      const model = provider.getRecommendedModel();
      expect(model).toBeDefined();
      expect(model.id).toBeDefined();
      expect(model.name).toBeDefined();
    });

    it('should return TinyLlama for low memory devices', () => {
      const originalMemory = navigator.deviceMemory;
      Object.defineProperty(navigator, 'deviceMemory', {
        value: 2,
        configurable: true
      });

      const model = provider.getRecommendedModel();
      expect(model.id).toBe(WebLLMModels.TINY_LLAMA.id);

      Object.defineProperty(navigator, 'deviceMemory', {
        value: originalMemory,
        configurable: true
      });
    });

    it('should return Llama 3 for high memory devices', () => {
      const originalMemory = navigator.deviceMemory;
      Object.defineProperty(navigator, 'deviceMemory', {
        value: 16,
        configurable: true
      });

      const model = provider.getRecommendedModel();
      expect(model.id).toBe(WebLLMModels.LLAMA_3_8B.id);

      Object.defineProperty(navigator, 'deviceMemory', {
        value: originalMemory,
        configurable: true
      });
    });
  });

  describe('estimateMemory', () => {
    it('should estimate memory for known models', () => {
      const memory = provider.estimateMemory(WebLLMModels.PHI_2.id);
      expect(memory).toBe(5); // ~5GB VRAM
    });

    it('should return null for unknown models', () => {
      const memory = provider.estimateMemory('unknown-model');
      expect(memory).toBeNull();
    });
  });

  describe('onLoadProgress', () => {
    it('should register callback and return unsubscribe function', () => {
      const callback = vi.fn();
      const unsubscribe = provider.onLoadProgress(callback);

      expect(typeof unsubscribe).toBe('function');
      expect(provider.loadCallbacks.has(callback)).toBe(true);

      unsubscribe();
      expect(provider.loadCallbacks.has(callback)).toBe(false);
    });
  });

  describe('notifyLoadProgress', () => {
    it('should call all registered callbacks', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      provider.onLoadProgress(callback1);
      provider.onLoadProgress(callback2);

      provider.notifyLoadProgress({ progress: 50 });

      expect(callback1).toHaveBeenCalledWith({ progress: 50 });
      expect(callback2).toHaveBeenCalledWith({ progress: 50 });
    });

    it('should handle callback errors gracefully', () => {
      const badCallback = vi.fn(() => {
        throw new Error('Callback error');
      });
      const goodCallback = vi.fn();

      provider.onLoadProgress(badCallback);
      provider.onLoadProgress(goodCallback);

      // Should not throw
      expect(() => provider.notifyLoadProgress({ progress: 50 })).not.toThrow();

      expect(goodCallback).toHaveBeenCalled();
    });
  });

  describe('reset', () => {
    it('should reset provider to initial state', async () => {
      provider.loadingState = LoadingState.READY;
      provider.loadingProgress = 100;
      provider.currentModel = 'test-model';
      provider.engine = {}; // Mock engine so unloadModel clears currentModel
      provider.onLoadProgress(() => {});

      await provider.reset();

      expect(provider.loadingState).toBe(LoadingState.IDLE);
      expect(provider.loadingProgress).toBe(0);
      expect(provider.currentModel).toBeNull();
      expect(provider.loadCallbacks.size).toBe(0);
    });
  });

  describe('loadModel', () => {
    it('should throw if WebGPU is not supported', async () => {
      provider.webgpuSupported = false;

      await expect(provider.loadModel('test-model')).rejects.toThrow(
        'WebGPU is not supported'
      );
    });

    it('should throw if another model is loading', async () => {
      // First set WebGPU as supported so we get past that check
      provider.webgpuSupported = true;
      provider.loadingState = LoadingState.LOADING;

      await expect(provider.loadModel('test-model')).rejects.toThrow(
        'Another model is currently loading'
      );
    });
  });

  describe('generate', () => {
    it('should throw if no model is loaded', async () => {
      await expect(provider.generate([])).rejects.toThrow('No model loaded');
    });
  });

  describe('streamChatCompletion', () => {
    it('should throw if no model is loaded', async () => {
      await expect(async () => {
        for await (const _ of provider.streamChatCompletion([])) {
          // consume
        }
      }).rejects.toThrow('No model loaded');
    });
  });

  describe('canRunModel', () => {
    it('should return false if WebGPU not supported', async () => {
      provider.webgpuSupported = false;

      const result = await provider.canRunModel(WebLLMModels.PHI_2.id);
      expect(result).toBe(false);
    });
  });
});

describe('HybridLLMProvider', () => {
  let hybridProvider;
  let mockApiProvider;

  beforeEach(() => {
    mockApiProvider = {
      chatCompletion: vi.fn(async () => 'API response')
    };

    hybridProvider = new HybridLLMProvider({
      apiProvider: mockApiProvider,
      preferLocal: true,
      fallbackToAPI: true
    });
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const provider = new HybridLLMProvider();
      expect(provider.preferLocal).toBe(true);
      expect(provider.fallbackToAPI).toBe(true);
    });

    it('should accept custom options', () => {
      expect(hybridProvider.apiProvider).toBe(mockApiProvider);
      expect(hybridProvider.preferLocal).toBe(true);
    });
  });

  describe('generate', () => {
    it('should use API provider when local not available', async () => {
      const result = await hybridProvider.generate([{ role: 'user', content: 'test' }]);

      expect(mockApiProvider.chatCompletion).toHaveBeenCalled();
      expect(result).toBe('API response');
    });

    it('should throw if no provider available', async () => {
      const provider = new HybridLLMProvider({ apiProvider: null });

      await expect(provider.generate([])).rejects.toThrow('No LLM provider available');
    });
  });

  describe('stream', () => {
    it('should yield from API when local not available', async () => {
      const tokens = [];
      for await (const token of hybridProvider.stream([{ role: 'user', content: 'test' }])) {
        tokens.push(token);
      }

      expect(tokens).toEqual(['API response']);
    });

    it('should throw if no provider available', async () => {
      const provider = new HybridLLMProvider({ apiProvider: null });

      await expect(async () => {
        for await (const _ of provider.stream([])) {
          // consume
        }
      }).rejects.toThrow('No LLM provider available');
    });
  });

  describe('checkAvailability', () => {
    it('should return availability status', async () => {
      const status = await hybridProvider.checkAvailability();

      expect(status).toHaveProperty('local');
      expect(status).toHaveProperty('api');
      expect(status).toHaveProperty('recommended');
    });
  });
});

describe('webLLMProvider singleton', () => {
  it('should be an instance of WebLLMProvider', () => {
    expect(webLLMProvider).toBeInstanceOf(WebLLMProvider);
  });
});
