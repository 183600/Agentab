// lib/enhanced-api-client.js - Enhanced API client with caching and deduplication

import { LlmApiClient } from './api-client.js';
import { apiCache, requestDeduplicator } from './smart-cache.js';
import { ApiError } from './errors.js';
import { apiLogger } from './logger.js';
import { AppConfig } from './config.js';

/**
 * EnhancedLlmApiClient - API client with caching and request deduplication
 */
export class EnhancedLlmApiClient extends LlmApiClient {
  constructor() {
    super();
    this.enableCache = true;
    this.enableDeduplication = true;
  }

  /**
   * Generate cache key for request
   * @param {Array} messages - Messages
   * @param {Object} config - API config
   * @returns {string}
   */
  getCacheKey(messages, config) {
    // Create stable cache key from messages and config
    const normalizedMessages = messages.map(m => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content.substring(0, 500) : m.content
    }));

    return apiCache.generateKey('chat', config.model, normalizedMessages);
  }

  /**
   * Check if request should be cached
   * @param {Array} messages - Messages
   * @returns {boolean}
   */
  shouldCache(messages) {
    // Cache only if:
    // - Caching is enabled
    // - No system message with volatile content
    // - Reasonable message count
    if (!this.enableCache) return false;
    if (messages.length > 20) return false;

    // Don't cache if messages contain timestamps or random data
    const content = JSON.stringify(messages);
    if (content.includes('Date.now()') || content.includes('Math.random()')) {
      return false;
    }

    return true;
  }

  /**
   * Enhanced chat completion with caching
   * @param {Array} messages - Messages
   * @param {Object} options - Options
   * @returns {Promise<string>}
   */
  async chatCompletion(messages, options = {}) {
    const config = await this.getConfig();
    const cacheKey = this.getCacheKey(messages, config);

    // Check cache
    if (this.shouldCache(messages)) {
      const cached = apiCache.get(cacheKey);
      if (cached) {
        apiLogger.debug('Cache hit', { cacheKey: cacheKey.substring(0, 20) });
        return cached;
      }
    }

    // Deduplicate concurrent requests
    if (this.enableDeduplication) {
      return requestDeduplicator.execute(cacheKey, async () => {
        const result = await super.chatCompletion(messages, options);

        // Cache successful response
        if (this.shouldCache(messages)) {
          apiCache.set(cacheKey, result, 300000); // 5 minutes
        }

        return result;
      });
    }

    // Regular request
    const result = await super.chatCompletion(messages, options);

    // Cache successful response
    if (this.shouldCache(messages)) {
      apiCache.set(cacheKey, result, 300000);
    }

    return result;
  }

  /**
   * Get cache statistics
   * @returns {Object}
   */
  getCacheStats() {
    return apiCache.getStats();
  }

  /**
   * Clear cache
   */
  clearCache() {
    apiCache.clear();
  }

  /**
   * Enable/disable caching
   * @param {boolean} enabled
   */
  setCaching(enabled) {
    this.enableCache = enabled;
  }

  /**
   * Enable/disable request deduplication
   * @param {boolean} enabled
   */
  setDeduplication(enabled) {
    this.enableDeduplication = enabled;
  }

  /**
   * Batch requests with shared context
   * @param {Array} requests - Array of {messages, options}
   * @returns {Promise<Array>}
   */
  async batchRequests(requests) {
    // Group by model and common prefix
    const groups = this.groupRequests(requests);

    const results = new Array(requests.length);

    // Process each group
    await Promise.all(
      groups.map(async group => {
        for (const { index, messages, options } of group.items) {
          try {
            results[index] = {
              success: true,
              result: await this.chatCompletion(messages, options)
            };
          } catch (error) {
            results[index] = {
              success: false,
              error: error.message
            };
          }
        }
      })
    );

    return results;
  }

  /**
   * Group requests by model and common prefix
   * @param {Array} requests - Requests
   * @returns {Array}
   */
  groupRequests(requests) {
    const groups = new Map();

    requests.forEach((request, index) => {
      // Simple grouping by model for now
      const model = request.options?.model || 'default';

      if (!groups.has(model)) {
        groups.set(model, { items: [] });
      }

      groups.get(model).items.push({
        index,
        messages: request.messages,
        options: request.options
      });
    });

    return Array.from(groups.values());
  }

  /**
   * Stream chat completion (for future support)
   * @param {Array} messages - Messages
   * @param {Function} onChunk - Chunk callback
   * @param {Object} options - Options
   * @returns {Promise<string>}
   */
  async streamChatCompletion(messages, onChunk, options = {}) {
    const config = await this.getConfig();

    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        stream: true,
        temperature: 0.1,
        max_tokens: 4096
      }),
      signal: options.signal
    });

    if (!response.ok) {
      const body = await response.json();
      throw ApiError.fromResponse(response, body);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(line => line.trim());

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              fullContent += content;
              onChunk?.(content);
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
    }

    return fullContent;
  }
}

// Export singleton instance
export const enhancedApiClient = new EnhancedLlmApiClient();
