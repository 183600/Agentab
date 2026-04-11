/**
 * WebLLM Provider - Local LLM support via WebLLM
 * Enables running LLMs directly in the browser using WebGPU
 */

import { logger } from './logger.js';

/**
 * Available WebLLM models
 */
export const WebLLMModels = {
  // Phi-2 - Small but capable
  PHI_2: {
    id: 'Phi-2',
    name: 'Phi-2 (2.7B)',
    description: 'Microsoft Phi-2 - Small but capable model',
    size: '~2.7B params',
    memory: '~5GB VRAM',
    url: 'https://huggingface.co/microsoft/phi-2'
  },

  // Phi-3 Mini - Efficient small model
  PHI_3_MINI: {
    id: 'Phi-3-mini-4k-instruct',
    name: 'Phi-3 Mini (3.8B)',
    description: 'Microsoft Phi-3 Mini - Efficient and capable',
    size: '~3.8B params',
    memory: '~6GB VRAM',
    url: 'https://huggingface.co/microsoft/Phi-3-mini-4k-instruct'
  },

  // Llama-3 8B - Best open model
  LLAMA_3_8B: {
    id: 'Llama-3-8B-Instruct-q4f16_1-MLC',
    name: 'Llama 3 8B (4-bit)',
    description: 'Meta Llama 3 8B - Best open model, quantized',
    size: '~8B params (4-bit)',
    memory: '~6GB VRAM',
    url: 'https://huggingface.co/mlc-ai/Llama-3-8B-Instruct-q4f16_1-MLC'
  },

  // Mistral 7B - Fast and capable
  MISTRAL_7B: {
    id: 'Mistral-7B-Instruct-v0.2-q4f16_1-MLC',
    name: 'Mistral 7B (4-bit)',
    description: 'Mistral 7B - Fast and capable, quantized',
    size: '~7B params (4-bit)',
    memory: '~5GB VRAM',
    url: 'https://huggingface.co/mlc-ai/Mistral-7B-Instruct-v0.2-q4f16_1-MLC'
  },

  // Gemma 2B - Google's small model
  GEMMA_2B: {
    id: 'gemma-2b-it-q4f16_1-MLC',
    name: 'Gemma 2B (4-bit)',
    description: 'Google Gemma 2B - Small but effective',
    size: '~2B params (4-bit)',
    memory: '~3GB VRAM',
    url: 'https://huggingface.co/mlc-ai/gemma-2b-it-q4f16_1-MLC'
  },

  // TinyLlama - Smallest option
  TINY_LLAMA: {
    id: 'TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC',
    name: 'TinyLlama (1.1B)',
    description: 'TinyLlama - Smallest option, works on most devices',
    size: '~1.1B params (4-bit)',
    memory: '~2GB VRAM',
    url: 'https://huggingface.co/mlc-ai/TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC'
  }
};

/**
 * Model loading states
 */
export const LoadingState = {
  IDLE: 'idle',
  CHECKING_GPU: 'checking_gpu',
  DOWNLOADING: 'downloading',
  LOADING: 'loading',
  READY: 'ready',
  ERROR: 'error'
};

/**
 * WebLLM Provider class
 */
export class WebLLMProvider {
  constructor() {
    this.engine = null;
    this.currentModel = null;
    this.loadingState = LoadingState.IDLE;
    this.loadingProgress = 0;
    this.webgpuSupported = null;
    this.loadCallbacks = new Set();
  }

  /**
   * Check if WebGPU is supported
   */
  async checkWebGPUSupport() {
    if (this.webgpuSupported !== null) {
      return this.webgpuSupported;
    }

    try {
      if (!navigator.gpu) {
        this.webgpuSupported = false;
        logger.warn('WebGPU not available - WebLLM requires WebGPU');
        return false;
      }

      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) {
        this.webgpuSupported = false;
        logger.warn('No GPU adapter found');
        return false;
      }

      const device = await adapter.requestDevice();
      if (!device) {
        this.webgpuSupported = false;
        logger.warn('No GPU device found');
        return false;
      }

      this.webgpuSupported = true;
      logger.info('WebGPU is supported');
      return true;
    } catch (error) {
      this.webgpuSupported = false;
      logger.error('WebGPU check failed', { error: error.message });
      return false;
    }
  }

  /**
   * Check if WebLLM is available
   */
  async isAvailable() {
    try {
      // Try to import WebLLM
      const webllm = await import('@mlc-ai/web-llm');
      return !!webllm;
    } catch {
      logger.debug('WebLLM package not installed');
      return false;
    }
  }

  /**
   * Load a model
   */
  async loadModel(modelId, onProgress) {
    // Check support first
    const gpuSupported = await this.checkWebGPUSupport();
    if (!gpuSupported) {
      throw new Error('WebGPU is not supported on this device');
    }

    // Check if WebLLM is available
    const webllmAvailable = await this.isAvailable();
    if (!webllmAvailable) {
      throw new Error(
        'WebLLM is not installed. Install with: npm install @mlc-ai/web-llm'
      );
    }

    // Don't reload same model
    if (this.currentModel === modelId && this.loadingState === LoadingState.READY) {
      logger.debug('Model already loaded', { modelId });
      return;
    }

    // Cancel if already loading
    if (this.loadingState !== LoadingState.IDLE && this.loadingState !== LoadingState.READY) {
      throw new Error('Another model is currently loading');
    }

    this.loadingState = LoadingState.LOADING;
    this.loadingProgress = 0;
    this.currentModel = modelId;

    try {
      // Import WebLLM
      const webllm = await import('@mlc-ai/web-llm');

      // Create engine with progress callback
      const initProgressCallback = progress => {
        this.loadingProgress = progress.progress * 100;
        this.notifyLoadProgress(progress);

        if (onProgress) {
          onProgress({
            stage: progress.text?.includes('Downloading') ? 'downloading' : 'loading',
            progress: this.loadingProgress,
            text: progress.text
          });
        }
      };

      logger.info('Loading WebLLM model', { modelId });

      // Create the engine
      this.engine = await webllm.CreateMLCEngine(modelId, {
        initProgressCallback
      });

      this.loadingState = LoadingState.READY;
      logger.info('WebLLM model loaded', { modelId });

      return this.engine;
    } catch (error) {
      this.loadingState = LoadingState.ERROR;
      this.currentModel = null;
      logger.error('Failed to load WebLLM model', { modelId, error: error.message });
      throw error;
    }
  }

  /**
   * Unload current model
   */
  async unloadModel() {
    if (this.engine) {
      try {
        await this.engine.unload();
      } catch (error) {
        logger.warn('Error unloading model', { error: error.message });
      }
      this.engine = null;
      this.currentModel = null;
      this.loadingState = LoadingState.IDLE;
      logger.info('Model unloaded');
    }
  }

  /**
   * Generate completion
   */
  async generate(messages, options = {}) {
    if (!this.engine || this.loadingState !== LoadingState.READY) {
      throw new Error('No model loaded');
    }

    const {
      maxTokens = 1024,
      temperature = 0.7,
      topP = 0.9,
      stream = false,
      onToken
    } = options;

    try {
      const response = await this.engine.chat.completions.create({
        messages,
        max_tokens: maxTokens,
        temperature,
        top_p: topP,
        stream
      });

      if (stream) {
        let fullContent = '';
        for await (const chunk of response) {
          const content = chunk.choices[0]?.delta?.content || '';
          fullContent += content;
          if (onToken) {
            onToken(content, fullContent);
          }
        }
        return fullContent;
      } else {
        return response.choices[0]?.message?.content || '';
      }
    } catch (error) {
      logger.error('Generation failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Chat completion (OpenAI-compatible)
   */
  async chatCompletion(messages, options = {}) {
    const content = await this.generate(messages, options);
    return content;
  }

  /**
   * Stream chat completion
   */
  async *streamChatCompletion(messages, options = {}) {
    if (!this.engine || this.loadingState !== LoadingState.READY) {
      throw new Error('No model loaded');
    }

    const { maxTokens = 1024, temperature = 0.7, topP = 0.9 } = options;

    try {
      const response = await this.engine.chat.completions.create({
        messages,
        max_tokens: maxTokens,
        temperature,
        top_p: topP,
        stream: true
      });

      for await (const chunk of response) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          yield content;
        }
      }
    } catch (error) {
      logger.error('Streaming failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Get model info
   */
  getModelInfo() {
    if (!this.currentModel) {
      return null;
    }

    const modelInfo = Object.values(WebLLMModels).find(m => m.id === this.currentModel);
    return modelInfo || { id: this.currentModel, name: this.currentModel };
  }

  /**
   * Get loading state
   */
  getLoadingState() {
    return {
      state: this.loadingState,
      progress: this.loadingProgress,
      model: this.currentModel
    };
  }

  /**
   * Add load progress callback
   */
  onLoadProgress(callback) {
    this.loadCallbacks.add(callback);
    return () => this.loadCallbacks.delete(callback);
  }

  /**
   * Notify load progress callbacks
   */
  notifyLoadProgress(progress) {
    for (const callback of this.loadCallbacks) {
      try {
        callback(progress);
      } catch (error) {
        logger.warn('Load progress callback error', { error: error.message });
      }
    }
  }

  /**
   * Get available models
   */
  getAvailableModels() {
    return Object.values(WebLLMModels);
  }

  /**
   * Get recommended model based on device
   */
  getRecommendedModel() {
    // Check VRAM if possible (approximation based on device)
    const vram = navigator.deviceMemory || 4; // Default to 4GB

    if (vram >= 8) {
      return WebLLMModels.LLAMA_3_8B; // Best model for high-end devices
    } else if (vram >= 6) {
      return WebLLMModels.PHI_3_MINI; // Good balance
    } else if (vram >= 4) {
      return WebLLMModels.GEMMA_2B; // Works on mid-range
    } else {
      return WebLLMModels.TINY_LLAMA; // Smallest, works on most devices
    }
  }

  /**
   * Estimate memory usage for model
   */
  estimateMemory(modelId) {
    const model = Object.values(WebLLMModels).find(m => m.id === modelId);
    if (!model) return null;

    // Parse memory string (e.g., "~5GB VRAM")
    const match = model.memory.match(/~?(\d+)GB/);
    if (match) {
      return parseInt(match[1], 10);
    }
    return null;
  }

  /**
   * Check if device can run model
   */
  async canRunModel(modelId) {
    const gpuSupported = await this.checkWebGPUSupport();
    if (!gpuSupported) return false;

    const requiredMemory = this.estimateMemory(modelId);
    const deviceMemory = navigator.deviceMemory || 4;

    return deviceMemory >= requiredMemory;
  }

  /**
   * Reset the provider
   */
  async reset() {
    await this.unloadModel();
    this.loadCallbacks.clear();
    this.loadingState = LoadingState.IDLE;
    this.loadingProgress = 0;
  }
}

// Export singleton instance
export const webLLMProvider = new WebLLMProvider();

/**
 * Hybrid provider that falls back between WebLLM and API
 */
export class HybridLLMProvider {
  constructor(options = {}) {
    this.webLLM = webLLMProvider;
    this.apiProvider = options.apiProvider;
    this.preferLocal = options.preferLocal ?? true;
    this.fallbackToAPI = options.fallbackToAPI ?? true;
  }

  /**
   * Generate completion
   */
  async generate(messages, options = {}) {
    // Try local first if preferred and available
    if (this.preferLocal && this.webLLM.loadingState === LoadingState.READY) {
      try {
        return await this.webLLM.generate(messages, options);
      } catch (error) {
        if (!this.fallbackToAPI) throw error;
        logger.warn('Local generation failed, falling back to API', { error: error.message });
      }
    }

    // Use API provider
    if (this.apiProvider) {
      return await this.apiProvider.chatCompletion(messages, options);
    }

    throw new Error('No LLM provider available');
  }

  /**
   * Stream completion
   */
  async *stream(messages, options = {}) {
    // Try local first
    if (this.preferLocal && this.webLLM.loadingState === LoadingState.READY) {
      try {
        for await (const token of this.webLLM.streamChatCompletion(messages, options)) {
          yield token;
        }
        return;
      } catch (error) {
        if (!this.fallbackToAPI) throw error;
        logger.warn('Local streaming failed, falling back to API', { error: error.message });
      }
    }

    // Use API provider
    if (this.apiProvider) {
      // API streaming would be handled differently
      const result = await this.apiProvider.chatCompletion(messages, options);
      yield result;
      return;
    }

    throw new Error('No LLM provider available');
  }

  /**
   * Check available providers
   */
  async checkAvailability() {
    const webGPUSupported = await this.webLLM.checkWebGPUSupport();
    const webLLMAvailable = await this.webLLM.isAvailable();
    const apiAvailable = !!this.apiProvider;

    return {
      local: webGPUSupported && webLLMAvailable,
      api: apiAvailable,
      recommended: webGPUSupported && webLLMAvailable ? 'local' : apiAvailable ? 'api' : null
    };
  }
}
