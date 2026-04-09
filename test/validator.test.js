// test/validator.test.js - Tests for InputValidator

import { describe, it, expect } from 'vitest';
import { InputValidator } from '../lib/validator.js';

describe('InputValidator', () => {
  describe('validatePrompt', () => {
    it('should validate a valid prompt', () => {
      const result = InputValidator.validatePrompt('Click the submit button');
      expect(result.valid).toBe(true);
      expect(result.value).toBe('Click the submit button');
    });

    it('should reject empty prompt', () => {
      const result = InputValidator.validatePrompt('');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject null prompt', () => {
      const result = InputValidator.validatePrompt(null);
      expect(result.valid).toBe(false);
    });

    it('should sanitize prompt with script tags', () => {
      const result = InputValidator.validatePrompt('<script>alert("xss")</script>');
      // Script tags are sanitized, so the prompt becomes valid
      expect(result.valid).toBe(true);
      // The value should not contain the script tags
      expect(result.value).not.toContain('<script>');
    });

    it('should reject prompt with javascript protocol', () => {
      const result = InputValidator.validatePrompt('javascript:alert(1)');
      expect(result.valid).toBe(false);
    });

    it('should trim whitespace', () => {
      const result = InputValidator.validatePrompt('  hello world  ');
      expect(result.valid).toBe(true);
      expect(result.value).toBe('hello world');
    });

    it('should reject prompt exceeding max length', () => {
      const longPrompt = 'a'.repeat(10001);
      const result = InputValidator.validatePrompt(longPrompt);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('exceed');
    });
  });

  describe('validateCode', () => {
    it('should validate valid JavaScript code', () => {
      const result = InputValidator.validateCode('return document.title;');
      expect(result.valid).toBe(true);
    });

    it('should reject empty code', () => {
      const result = InputValidator.validateCode('');
      expect(result.valid).toBe(false);
    });

    it('should reject code exceeding max size', () => {
      const longCode = 'a'.repeat(100001);
      const result = InputValidator.validateCode(longCode);
      expect(result.valid).toBe(false);
    });
  });

  describe('validateTask', () => {
    it('should validate a valid task', () => {
      const result = InputValidator.validateTask({
        name: 'My Task',
        type: 'prompt',
        content: 'Click the button'
      });
      expect(result.valid).toBe(true);
      expect(result.value.name).toBe('My Task');
    });

    it('should reject task with invalid type', () => {
      const result = InputValidator.validateTask({
        name: 'My Task',
        type: 'invalid',
        content: 'test'
      });
      expect(result.valid).toBe(false);
    });

    it('should reject task with empty name', () => {
      const result = InputValidator.validateTask({
        name: '',
        type: 'prompt',
        content: 'test'
      });
      expect(result.valid).toBe(false);
    });
  });

  describe('validateApiKey', () => {
    it('should validate valid API key', () => {
      const result = InputValidator.validateApiKey('sk-1234567890abcdef');
      expect(result.valid).toBe(true);
    });

    it('should reject empty API key', () => {
      const result = InputValidator.validateApiKey('');
      expect(result.valid).toBe(false);
    });

    it('should reject API key with invalid characters', () => {
      const result = InputValidator.validateApiKey('key with spaces!');
      expect(result.valid).toBe(false);
    });
  });

  describe('validateUrl', () => {
    it('should validate valid URL', () => {
      const result = InputValidator.validateUrl('https://api.openai.com/v1');
      expect(result.valid).toBe(true);
    });

    it('should reject invalid URL', () => {
      const result = InputValidator.validateUrl('not-a-url');
      expect(result.valid).toBe(false);
    });

    it('should reject non-HTTP URLs', () => {
      const result = InputValidator.validateUrl('ftp://example.com');
      expect(result.valid).toBe(false);
    });
  });

  describe('stripHtml', () => {
    it('should strip HTML tags', () => {
      const result = InputValidator.stripHtml('<script>alert(1)</script>');
      expect(result).not.toContain('<script>');
    });
  });

  describe('escapeHtml', () => {
    it('should escape HTML entities', () => {
      const result = InputValidator.escapeHtml('<div>"test"&\'value\'</div>');
      expect(result).toBe('&lt;div&gt;&quot;test&quot;&amp;&#039;value&#039;&lt;/div&gt;');
    });
  });
});
