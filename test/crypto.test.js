// test/crypto.test.js - Tests for CryptoManager

import { describe, it, expect, vi, beforeEach } from 'vitest';
import './setup.js';

// Mock btoa and atob for Node environment if not available
if (typeof global.btoa !== 'function') {
  global.btoa = (str) => Buffer.from(str, 'binary').toString('base64');
}
if (typeof global.atob !== 'function') {
  global.atob = (str) => Buffer.from(str, 'base64').toString('binary');
}

describe('CryptoManager', () => {
  let CryptoManager;
  let cryptoManager;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Re-import to get fresh instance
    vi.resetModules();
    const module = await import('../lib/crypto.js');
    CryptoManager = module.CryptoManager;
    cryptoManager = new CryptoManager();
  });

  describe('constructor', () => {
    it('should initialize with correct algorithm settings', () => {
      expect(cryptoManager.algorithm).toBe('AES-GCM');
      expect(cryptoManager.keyLength).toBe(256);
      expect(cryptoManager.ivLength).toBe(12);
      expect(cryptoManager.saltLength).toBe(16);
    });
  });

  describe('generateRandomString()', () => {
    it('should generate string of correct length', () => {
      const str = cryptoManager.generateRandomString(32);
      expect(str.length).toBe(64); // 32 bytes = 64 hex chars
    });

    it('should generate different strings', () => {
      const str1 = cryptoManager.generateRandomString(16);
      const str2 = cryptoManager.generateRandomString(16);
      // Very unlikely to be the same
      expect(str1).not.toBe(str2);
    });

    it('should only contain hex characters', () => {
      const str = cryptoManager.generateRandomString(16);
      expect(str).toMatch(/^[0-9a-f]+$/);
    });
  });

  describe('arrayBufferToBase64()', () => {
    it('should convert ArrayBuffer to base64', () => {
      const buffer = new TextEncoder().encode('test').buffer;
      const base64 = cryptoManager.arrayBufferToBase64(buffer);
      
      expect(typeof base64).toBe('string');
      expect(base64.length).toBeGreaterThan(0);
    });

    it('should produce valid base64', () => {
      const buffer = new Uint8Array([72, 101, 108, 108, 111]).buffer;
      const base64 = cryptoManager.arrayBufferToBase64(buffer);
      
      // "Hello" in base64 is "SGVsbG8="
      expect(base64).toBe('SGVsbG8=');
    });
  });

  describe('base64ToArrayBuffer()', () => {
    it('should convert base64 to ArrayBuffer', () => {
      const base64 = 'SGVsbG8=';
      const buffer = cryptoManager.base64ToArrayBuffer(base64);
      
      expect(buffer instanceof ArrayBuffer).toBe(true);
      
      const text = new TextDecoder().decode(buffer);
      expect(text).toBe('Hello');
    });

    it('should be inverse of arrayBufferToBase64', () => {
      const original = new Uint8Array([1, 2, 3, 4, 5]).buffer;
      const base64 = cryptoManager.arrayBufferToBase64(original);
      const recovered = cryptoManager.base64ToArrayBuffer(base64);
      
      const originalArray = new Uint8Array(original);
      const recoveredArray = new Uint8Array(recovered);
      
      expect(recoveredArray.length).toBe(originalArray.length);
      for (let i = 0; i < originalArray.length; i++) {
        expect(recoveredArray[i]).toBe(originalArray[i]);
      }
    });
  });

  describe('isEncrypted()', () => {
    it('should return false for empty string', () => {
      expect(cryptoManager.isEncrypted('')).toBe(false);
    });

    it('should return false for null/undefined', () => {
      expect(cryptoManager.isEncrypted(null)).toBe(false);
      expect(cryptoManager.isEncrypted(undefined)).toBe(false);
    });

    it('should return false for plain text', () => {
      expect(cryptoManager.isEncrypted('hello world')).toBe(false);
      expect(cryptoManager.isEncrypted('sk-1234567890')).toBe(false);
    });
  });

  describe('encrypt()', () => {
    it('should return empty string for empty input', async () => {
      const result = await cryptoManager.encrypt('');
      expect(result).toBe('');
    });

    it('should return empty string for non-string input', async () => {
      const result1 = await cryptoManager.encrypt(null);
      const result2 = await cryptoManager.encrypt(undefined);
      const result3 = await cryptoManager.encrypt(123);
      
      expect(result1).toBe('');
      expect(result2).toBe('');
      expect(result3).toBe('');
    });
  });

  describe('decrypt()', () => {
    it('should return empty string for empty input', async () => {
      const result = await cryptoManager.decrypt('');
      expect(result).toBe('');
    });

    it('should return empty string for non-string input', async () => {
      const result = await cryptoManager.decrypt(null);
      expect(result).toBe('');
    });
  });

  describe('deriveKey()', () => {
    it('should derive a key from password and salt', async () => {
      const salt = new Uint8Array(16);
      
      // This should work with the real Web Crypto API in Node.js 18+
      const key = await cryptoManager.deriveKey('password', salt);
      
      // The key should be defined (CryptoKey object)
      expect(key).toBeDefined();
    });
  });
});
