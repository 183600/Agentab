// lib/crypto.js - Secure storage utilities

import { logger } from './logger.js';

/**
 * Sentinel value to indicate decryption failure
 * This allows callers to distinguish between empty strings and failed decryption
 */
export const DECRYPTION_FAILED = Symbol('DECRYPTION_FAILED');

/**
 * CryptoManager - Provides encryption for sensitive data
 * Uses Web Crypto API for secure storage
 */
export class CryptoManager {
  constructor() {
    this.algorithm = 'AES-GCM';
    this.keyLength = 256;
    this.ivLength = 12;
    this.saltLength = 16;
    this.decryptionFailures = 0;
  }

  /**
   * Generate a cryptographic key from a password
   * @param {string} password - Password to derive key from
   * @param {Uint8Array} salt - Salt for key derivation
   * @returns {Promise<CryptoKey>}
   */
  async deriveKey(password, salt) {
    const encoder = new TextEncoder();
    const passwordBuffer = encoder.encode(password);

    // Import password as raw key
    const passwordKey = await crypto.subtle.importKey('raw', passwordBuffer, 'PBKDF2', false, [
      'deriveKey'
    ]);

    // Derive AES key using PBKDF2
    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256'
      },
      passwordKey,
      {
        name: this.algorithm,
        length: this.keyLength
      },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Get or create encryption key for this extension
   * Uses a unique identifier to generate consistent key
   * @returns {Promise<CryptoKey>}
   */
  async getExtensionKey() {
    // Try to get existing key material from storage
    const result = await chrome.storage.local.get('keyMaterial');

    if (result.keyMaterial) {
      // Derive key from stored material
      const salt = new Uint8Array(result.keyMaterial.salt);
      return this.deriveKey(result.keyMaterial.password, salt);
    }

    // Generate new key material
    const password = this.generateRandomString(32);
    const salt = crypto.getRandomValues(new Uint8Array(this.saltLength));

    // Store key material
    await chrome.storage.local.set({
      keyMaterial: {
        password,
        salt: Array.from(salt)
      }
    });

    return this.deriveKey(password, salt);
  }

  /**
   * Encrypt a string value
   * @param {string} plaintext - Text to encrypt
   * @returns {Promise<string>} Base64 encoded encrypted data
   */
  async encrypt(plaintext) {
    if (!plaintext || typeof plaintext !== 'string') {
      return '';
    }

    try {
      const key = await this.getExtensionKey();
      const encoder = new TextEncoder();
      const data = encoder.encode(plaintext);

      // Generate IV
      const iv = crypto.getRandomValues(new Uint8Array(this.ivLength));

      // Encrypt
      const encrypted = await crypto.subtle.encrypt(
        {
          name: this.algorithm,
          iv: iv
        },
        key,
        data
      );

      // Combine IV and encrypted data
      const combined = new Uint8Array(iv.length + encrypted.byteLength);
      combined.set(iv, 0);
      combined.set(new Uint8Array(encrypted), iv.length);

      // Return as base64
      return this.arrayBufferToBase64(combined.buffer);
    } catch (error) {
      logger.error('Encryption failed', { error: error.message });
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypt an encrypted string
   * @param {string} ciphertext - Base64 encoded encrypted data
   * @param {boolean} silent - If true, return empty string on failure instead of sentinel
   * @returns {Promise<string|Symbol>} Decrypted text or DECRYPTION_FAILED sentinel
   */
  async decrypt(ciphertext, silent = false) {
    if (!ciphertext || typeof ciphertext !== 'string') {
      return '';
    }

    try {
      const key = await this.getExtensionKey();

      // Decode from base64
      const combined = this.base64ToArrayBuffer(ciphertext);
      const combinedArray = new Uint8Array(combined);

      // Extract IV and encrypted data
      const iv = combinedArray.slice(0, this.ivLength);
      const encrypted = combinedArray.slice(this.ivLength);

      // Decrypt
      const decrypted = await crypto.subtle.decrypt(
        {
          name: this.algorithm,
          iv: iv
        },
        key,
        encrypted
      );

      // Decode to string
      const decoder = new TextDecoder();
      return decoder.decode(decrypted);
    } catch (error) {
      this.decryptionFailures++;
      // Security: Only log count, never log error details that might expose key material
      logger.debug('Decryption operation failed', { attempt: this.decryptionFailures });

      // In silent mode (for migration), return empty string
      // Otherwise return sentinel to allow caller to detect failure
      if (silent) {
        return '';
      }
      return DECRYPTION_FAILED;
    }
  }

  /**
   * Check if a value indicates decryption failure
   * @param {any} value - Value to check
   * @returns {boolean}
   */
  static isDecryptionFailed(value) {
    return value === DECRYPTION_FAILED;
  }

  /**
   * Get decryption failure count
   * @returns {number}
   */
  getDecryptionFailures() {
    return this.decryptionFailures;
  }

  /**
   * Check if a value is encrypted
   * @param {string} value - Value to check
   * @returns {boolean}
   */
  isEncrypted(value) {
    if (!value || typeof value !== 'string') {
      return false;
    }

    // Check if it looks like base64 encrypted data
    // Encrypted values are typically longer and base64 encoded
    try {
      const decoded = this.base64ToArrayBuffer(value);
      return decoded.byteLength > this.ivLength;
    } catch {
      return false;
    }
  }

  /**
   * Convert ArrayBuffer to Base64
   * @param {ArrayBuffer} buffer - Buffer to convert
   * @returns {string}
   */
  arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Convert Base64 to ArrayBuffer
   * @param {string} base64 - Base64 string
   * @returns {ArrayBuffer}
   */
  base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * Generate a random string
   * @param {number} length - Length of string
   * @returns {string}
   */
  generateRandomString(length) {
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }
}

// Export singleton instance
export const cryptoManager = new CryptoManager();
