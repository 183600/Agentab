// lib/smart-cache.js - Intelligent caching system with TTL and LRU eviction

import { logger } from './logger.js';

/**
 * Doubly-linked list node for O(1) LRU operations
 */
class LRUNode {
  constructor(key, value, expiresAt) {
    this.key = key;
    this.value = value;
    this.expiresAt = expiresAt;
    this.createdAt = Date.now();
    this.prev = null;
    this.next = null;
  }
}

/**
 * SmartCache - LRU Cache with TTL support
 * Uses doubly-linked list + Map for O(1) operations
 */
export class SmartCache {
  constructor(options = {}) {
    this.maxSize = options.maxSize || 100;
    this.defaultTTL = options.defaultTTL || 60000; // 1 minute
    this.cache = new Map(); // key -> LRUNode

    // Doubly-linked list for LRU order (most recent at tail)
    this.head = null; // Least recently used
    this.tail = null; // Most recently used

    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0
    };
  }

  /**
   * Generate cache key from arguments
   * @param {string} namespace - Cache namespace
   * @param {Array} args - Arguments
   * @returns {string}
   */
  generateKey(namespace, ...args) {
    return `${namespace}:${JSON.stringify(args)}`;
  }

  /**
   * Remove node from linked list - O(1)
   * @param {LRUNode} node
   */
  removeFromList(node) {
    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this.head = node.next;
    }

    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this.tail = node.prev;
    }

    node.prev = null;
    node.next = null;
  }

  /**
   * Add node to tail (most recently used) - O(1)
   * @param {LRUNode} node
   */
  appendToTail(node) {
    node.prev = this.tail;
    node.next = null;

    if (this.tail) {
      this.tail.next = node;
    }
    this.tail = node;

    if (!this.head) {
      this.head = node;
    }
  }

  /**
   * Move node to tail (mark as recently used) - O(1)
   * @param {LRUNode} node
   */
  moveToTail(node) {
    if (node === this.tail) return;

    this.removeFromList(node);
    this.appendToTail(node);
  }

  /**
   * Get item from cache - O(1)
   * @param {string} key - Cache key
   * @returns {any|null}
   */
  get(key) {
    const node = this.cache.get(key);

    if (!node) {
      this.stats.misses++;
      return null;
    }

    // Check TTL
    if (Date.now() > node.expiresAt) {
      this.delete(key);
      this.stats.misses++;
      return null;
    }

    // Update access order - O(1)
    this.moveToTail(node);
    this.stats.hits++;

    return node.value;
  }

  /**
   * Set item in cache - O(1)
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttl - Time to live in ms
   */
  set(key, value, ttl = this.defaultTTL) {
    const existingNode = this.cache.get(key);

    if (existingNode) {
      // Update existing node
      existingNode.value = value;
      existingNode.expiresAt = Date.now() + ttl;
      this.moveToTail(existingNode);
      return;
    }

    // Check if we need to evict
    if (this.cache.size >= this.maxSize) {
      this.evict();
    }

    const node = new LRUNode(key, value, Date.now() + ttl);
    this.cache.set(key, node);
    this.appendToTail(node);
  }

  /**
   * Delete item from cache - O(1)
   * @param {string} key - Cache key
   */
  delete(key) {
    const node = this.cache.get(key);
    if (!node) return;

    this.removeFromList(node);
    this.cache.delete(key);
  }

  /**
   * Clear entire cache
   */
  clear() {
    this.cache.clear();
    this.head = null;
    this.tail = null;
  }

  /**
   * Evict least recently used item - O(1)
   */
  evict() {
    if (!this.head) return;

    const key = this.head.key;
    this.removeFromList(this.head);
    this.cache.delete(key);
    this.stats.evictions++;
  }

  /**
   * Clean expired items - O(n) but only called periodically
   */
  cleanExpired() {
    const now = Date.now();
    const expiredKeys = [];

    for (const [key, node] of this.cache.entries()) {
      if (now > node.expiresAt) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.delete(key);
    }

    return expiredKeys.length;
  }

  /**
   * Get cache statistics
   * @returns {Object}
   */
  getStats() {
    const total = this.stats.hits + this.stats.misses;
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: total > 0 ? ((this.stats.hits / total) * 100).toFixed(2) + '%' : '0%',
      evictions: this.stats.evictions
    };
  }

  /**
   * Get or set pattern
   * @param {string} key - Cache key
   * @param {Function} fn - Function to compute value if not cached
   * @param {number} ttl - Time to live
   * @returns {Promise<any>}
   */
  async getOrSet(key, fn, ttl) {
    const cached = this.get(key);
    if (cached !== null) {
      return cached;
    }

    const value = await fn();
    this.set(key, value, ttl);
    return value;
  }
}

/**
 * RequestDeduplicator - Deduplicate concurrent identical requests
 */
export class RequestDeduplicator {
  constructor() {
    this.pending = new Map();
  }

  /**
   * Execute or join pending request
   * @param {string} key - Request key
   * @param {Function} fn - Request function
   * @returns {Promise<any>}
   */
  async execute(key, fn) {
    // Check if request is already pending
    if (this.pending.has(key)) {
      return this.pending.get(key);
    }

    // Create new promise
    const promise = fn().finally(() => {
      this.pending.delete(key);
    });

    this.pending.set(key, promise);
    return promise;
  }

  /**
   * Clear all pending requests
   */
  clear() {
    this.pending.clear();
  }

  /**
   * Get count of pending requests
   * @returns {number}
   */
  getPendingCount() {
    return this.pending.size;
  }
}

// Create singleton instances
export const apiCache = new SmartCache({
  maxSize: 50,
  defaultTTL: 300000 // 5 minutes for API responses
});

export const pageCache = new SmartCache({
  maxSize: 20,
  defaultTTL: 10000 // 10 seconds for page info
});

export const requestDeduplicator = new RequestDeduplicator();

/**
 * Initialize periodic cache cleanup
 * Uses Chrome Alarms API for Service Worker compatibility
 */
export function initCacheCleanup() {
  // Check if Chrome Alarms API is available (Service Worker context)
  if (typeof chrome !== 'undefined' && chrome.alarms) {
    // Create alarm for periodic cleanup
    chrome.alarms.create('cache-cleanup', {
      periodInMinutes: 1
    });

    // Listen for alarm
    chrome.alarms.onAlarm.addListener(alarm => {
      if (alarm.name === 'cache-cleanup') {
        const apiExpired = apiCache.cleanExpired();
        const pageExpired = pageCache.cleanExpired();
        if (apiExpired > 0 || pageExpired > 0) {
          logger.debug('Cache cleanup completed', { expired: apiExpired + pageExpired });
        }
      }
    });

    logger.debug('Cache periodic cleanup initialized');
  } else {
    // Fallback for non-Service Worker contexts (e.g., popup, sidepanel)
    const intervalId = setInterval(() => {
      apiCache.cleanExpired();
      pageCache.cleanExpired();
    }, 60000);

    // Return cleanup function for manual cleanup if needed
    return () => clearInterval(intervalId);
  }
}
