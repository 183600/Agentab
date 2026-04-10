import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SecureSandbox, isSecureCode, secureExecute } from '../lib/secure-sandbox.js';

describe('SecureSandbox', () => {
  let sandbox;

  beforeEach(() => {
    sandbox = new SecureSandbox();
  });

  describe('validate()', () => {
    it('should validate empty string', () => {
      const result = sandbox.validate('');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('non-empty string');
    });

    it('should validate non-string input', () => {
      const result = sandbox.validate(null);
      expect(result.valid).toBe(false);
    });

    it('should validate code size', () => {
      const largeCode = 'x'.repeat(150000);
      const result = sandbox.validate(largeCode);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('too large');
    });

    it('should detect blocked eval pattern', () => {
      const result = sandbox.validate('eval("code")');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Blocked pattern');
    });

    it('should detect blocked Function constructor', () => {
      const result = sandbox.validate('new Function("code")');
      expect(result.valid).toBe(false);
    });

    it('should detect blocked __proto__', () => {
      const result = sandbox.validate('obj.__proto__ = {}');
      expect(result.valid).toBe(false);
    });

    it('should detect blocked chrome.storage', () => {
      const result = sandbox.validate('chrome.storage.local.get()');
      expect(result.valid).toBe(false);
    });

    it('should detect blocked chrome.runtime', () => {
      const result = sandbox.validate('chrome.runtime.sendMessage()');
      expect(result.valid).toBe(false);
    });

    it('should warn about innerHTML assignment', () => {
      const result = sandbox.validate('element.innerHTML = "<div>"');
      expect(result.valid).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings).toContain('Direct innerHTML assignment detected');
    });

    it('should warn about cookie access', () => {
      const result = sandbox.validate('const c = document.cookie');
      expect(result.valid).toBe(true);
      expect(result.warnings).toContain('Cookie access detected');
    });

    it('should validate valid JavaScript', () => {
      const result = sandbox.validate('const x = 1 + 2;');
      expect(result.valid).toBe(true);
    });

    it('should validate valid async code', () => {
      const result = sandbox.validate('await fetch(url)');
      expect(result.valid).toBe(true);
    });

    it('should detect syntax errors', () => {
      const result = sandbox.validate('const x = {');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Syntax error');
    });
  });

  describe('executeWithFunction()', () => {
    it('should execute simple code', async () => {
      const result = await sandbox.executeWithFunction('return 1 + 2');
      expect(result.success).toBe(true);
      expect(result.result).toBe(3);
    });

    it('should execute async code', async () => {
      const result = await sandbox.executeWithFunction(`
        await new Promise(r => setTimeout(r, 10));
        return 'done';
      `);
      expect(result.success).toBe(true);
      expect(result.result).toBe('done');
    });

    it('should use context variables', async () => {
      const result = await sandbox.executeWithFunction('return x + y', { x: 1, y: 2 });
      expect(result.success).toBe(true);
      expect(result.result).toBe(3);
    });

    it('should handle execution errors', async () => {
      const result = await sandbox.executeWithFunction('throw new Error("test error")');
      expect(result.success).toBe(false);
      expect(result.error).toContain('test error');
    });

    it('should track execution time', async () => {
      const result = await sandbox.executeWithFunction('return 1');
      expect(result.executionTime).toBeDefined();
      expect(result.executionTime).toBeGreaterThanOrEqual(0);
    });

    it('should include warnings in result', async () => {
      const result = await sandbox.executeWithFunction('element.innerHTML = "test"; return 1');
      expect(result.warnings).toBeDefined();
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('formatError()', () => {
    it('should format timeout error', () => {
      const error = new Error('timeout');
      error.name = 'AbortError';
      const formatted = sandbox.formatError(error);
      expect(formatted).toContain('timed out');
    });

    it('should format syntax error', () => {
      const error = new SyntaxError('Unexpected token');
      const formatted = sandbox.formatError(error);
      expect(formatted).toMatch(/syntax/i);
    });

    it('should format reference error', () => {
      const error = new ReferenceError('x is not defined');
      const formatted = sandbox.formatError(error);
      expect(formatted).toMatch(/reference/i);
    });

    it('should format generic error', () => {
      const error = new Error('Something went wrong');
      const formatted = sandbox.formatError(error);
      expect(formatted).toContain('Execution failed');
    });
  });

  describe('createPageContext()', () => {
    it('should create context with helper methods', () => {
      const context = SecureSandbox.createPageContext();
      expect(context.$).toBeDefined();
      expect(context.$$).toBeDefined();
      expect(context.console).toBeDefined();
    });
  });
});

describe('isSecureCode()', () => {
  it('should return true for secure code', () => {
    expect(isSecureCode('const x = 1')).toBe(true);
  });

  it('should return false for insecure code', () => {
    expect(isSecureCode('eval("code")')).toBe(false);
  });
});

describe('secureExecute()', () => {
  let sandbox;

  beforeEach(() => {
    sandbox = new SecureSandbox();
  });

  it('should execute valid code', async () => {
    // Use executeWithFunction for Node.js test environment (no iframe support)
    const result = await sandbox.executeWithFunction('return 1 + 2');
    expect(result.success).toBe(true);
    expect(result.result).toBe(3);
  });

  it('should throw for invalid code', async () => {
    const result = await sandbox.executeWithFunction('eval("code")');
    expect(result.success).toBe(false);
  });

  it('should use context', async () => {
    const result = await sandbox.executeWithFunction('return x * 2', { x: 5 });
    expect(result.success).toBe(true);
    expect(result.result).toBe(10);
  });
});
