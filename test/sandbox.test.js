// test/sandbox.test.js - Tests for code sandbox

import { describe, it, expect } from 'vitest';
import { SandboxExecutor, isValidCode } from '../lib/sandbox.js';

describe('SandboxExecutor', () => {
  const executor = new SandboxExecutor();

  describe('validate', () => {
    it('should validate safe code', () => {
      const result = executor.validate('return 1 + 1;');
      expect(result.valid).toBe(true);
    });

    it('should reject empty code', () => {
      const result = executor.validate('');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('non-empty');
    });

    it('should reject code with eval', () => {
      const result = executor.validate('eval("dangerous code")');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Blocked');
    });

    it('should reject code with Function constructor', () => {
      const result = executor.validate('new Function("return 1")()');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Blocked');
    });

    it('should reject code with __proto__', () => {
      const result = executor.validate('obj.__proto__ = {}');
      expect(result.valid).toBe(false);
    });

    it('should reject code exceeding max size', () => {
      const largeCode = 'a'.repeat(100001);
      const result = executor.validate(largeCode);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('too large');
    });

    it('should reject code with syntax errors', () => {
      const result = executor.validate('function { invalid }');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Syntax error');
    });
  });

  describe('execute', () => {
    it('should execute valid code', async () => {
      const result = await executor.execute('return 1 + 1;');
      expect(result.success).toBe(true);
      expect(result.result).toBe(2);
    });

    it('should execute async code', async () => {
      const result = await executor.execute(`
        await new Promise(r => setTimeout(r, 10));
        return 'async result';
      `);
      expect(result.success).toBe(true);
      expect(result.result).toBe('async result');
    });

    it('should return error for invalid code', async () => {
      const result = await executor.execute('eval("test")');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should track execution time', async () => {
      const result = await executor.execute('return 1;');
      expect(result.executionTime).toBeDefined();
      expect(result.executionTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('createPageContext', () => {
    it('should create safe page context', () => {
      const context = SandboxExecutor.createPageContext();
      expect(context.$).toBeDefined();
      expect(context.$$).toBeDefined();
      expect(context.console).toBeDefined();
    });
  });
});

describe('isValidCode', () => {
  it('should return true for valid code', () => {
    expect(isValidCode('return 1;')).toBe(true);
  });

  it('should return false for invalid code', () => {
    expect(isValidCode('')).toBe(false);
    expect(isValidCode('eval("test")')).toBe(false);
  });
});
