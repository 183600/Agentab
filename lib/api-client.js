// lib/api-client.js - LLM API client

import { ApiError, TimeoutError, AbortError } from './errors.js';
import { StorageManager } from './storage.js';

/**
 * LLM API Client
 */
export class LlmApiClient {
  constructor() {
    this.defaultTimeout = 60000; // 60 seconds
    this.maxRetries = 3;
    this.retryDelay = 1000; // Base retry delay
  }

  /**
   * Get API configuration
   * @returns {Promise<{apiKey: string, baseUrl: string, model: string}>}
   */
  async getConfig() {
    const [apiKey, baseUrl, model] = await Promise.all([
      StorageManager.getApiKey(),
      StorageManager.getApiBaseUrl(),
      StorageManager.getModel()
    ]);

    if (!apiKey) {
      throw new Error('API key not configured. Please set it in the extension settings.');
    }

    return {
      apiKey,
      baseUrl: baseUrl || 'https://api.openai.com/v1',
      model: model || 'gpt-4'
    };
  }

  /**
   * Make API request with retry and timeout
   * @param {Array} messages - Chat messages
   * @param {Object} options - Request options
   * @returns {Promise<string>}
   */
  async chatCompletion(messages, options = {}) {
    const {
      timeout = this.defaultTimeout,
      retries = this.maxRetries,
      signal = null
    } = options;

    const config = await this.getConfig();
    let lastError;

    for (let attempt = 1; attempt <= retries; attempt++) {
      // Check if aborted
      if (signal?.aborted) {
        throw new AbortError('Request aborted');
      }

      try {
        const result = await this.makeRequest(config, messages, timeout, signal);
        return result;
      } catch (error) {
        lastError = error;

        // Don't retry for certain errors
        if (this.shouldNotRetry(error)) {
          throw error;
        }

        // Wait and retry
        if (attempt < retries) {
          const delay = this.getRetryDelay(error, attempt);
          console.log(`API request attempt ${attempt} failed, retrying in ${delay}ms...`);
          await this.sleep(delay);
        }
      }
    }

    throw lastError || new Error('API request failed after retries');
  }

  /**
   * Make single API request
   * @param {Object} config - API configuration
   * @param {Array} messages - Messages
   * @param {number} timeout - Timeout in ms
   * @param {AbortSignal} signal - Abort signal
   * @returns {Promise<string>}
   */
  async makeRequest(config, messages, timeout, signal) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    // Combine external signal with timeout
    if (signal) {
      signal.addEventListener('abort', () => controller.abort());
    }

    try {
      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          model: config.model,
          messages: messages,
          temperature: 0.1,
          max_tokens: 4096
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const body = await this.parseErrorResponse(response);
        throw ApiError.fromResponse(response, body);
      }

      const data = await response.json();

      if (!data.choices?.[0]?.message?.content) {
        throw new Error('Invalid API response format');
      }

      return data.choices[0].message.content;
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        throw new TimeoutError(`Request timed out after ${timeout}ms`);
      }
      
      throw error;
    }
  }

  /**
   * Parse error response body
   * @param {Response} response - Response object
   * @returns {Promise<Object>}
   */
  async parseErrorResponse(response) {
    try {
      return await response.json();
    } catch {
      try {
        const text = await response.text();
        return { error: { message: text } };
      } catch {
        return {};
      }
    }
  }

  /**
   * Check if error should not be retried
   * @param {Error} error - Error object
   * @returns {boolean}
   */
  shouldNotRetry(error) {
    // Don't retry authentication errors
    if (error instanceof ApiError && error.statusCode === 401) {
      return true;
    }

    // Don't retry validation errors
    if (error instanceof ApiError && error.statusCode === 400) {
      return true;
    }

    return false;
  }

  /**
   * Get retry delay based on error and attempt
   * @param {Error} error - Error object
   * @param {number} attempt - Attempt number
   * @returns {number}
   */
  getRetryDelay(error, attempt) {
    // Exponential backoff with jitter
    const baseDelay = this.retryDelay * Math.pow(2, attempt - 1);
    const maxDelay = 10000; // Max 10 seconds
    const jitter = Math.random() * 0.5; // Add 0-50% jitter

    const delay = Math.min(baseDelay * (1 + jitter), maxDelay);

    // Use Retry-After header if available
    if (error instanceof ApiError && error.statusCode === 429) {
      const retryAfter = error.responseBody?.['retry-after'];
      if (retryAfter) {
        return Math.max(delay, parseInt(retryAfter) * 1000);
      }
    }

    return delay;
  }

  /**
   * Sleep utility
   * @param {number} ms - Milliseconds
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Test API connection
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async testConnection() {
    try {
      const config = await this.getConfig();
      
      const response = await fetch(`${config.baseUrl}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`
        }
      });

      if (!response.ok) {
        const body = await this.parseErrorResponse(response);
        throw ApiError.fromResponse(response, body);
      }

      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error.message || 'Failed to connect to API' 
      };
    }
  }

  /**
   * List available models
   * @returns {Promise<Array<{id: string, name: string}>>}
   */
  async listModels() {
    try {
      const config = await this.getConfig();
      
      const response = await fetch(`${config.baseUrl}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`
        }
      });

      if (!response.ok) {
        throw await this.parseErrorResponse(response);
      }

      const data = await response.json();
      
      return (data.data || [])
        .filter(model => model.id?.includes('gpt') || model.id?.includes('claude') || model.id?.includes('llama'))
        .map(model => ({
          id: model.id,
          name: model.id
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      console.error('Failed to list models:', error);
      return [];
    }
  }
}

// Export singleton instance
export const apiClient = new LlmApiClient();
