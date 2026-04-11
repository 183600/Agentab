// test/response-parser.test.js - Tests for ResponseParser

import { describe, it, expect, beforeEach } from 'vitest';
import { ResponseParser, responseParser } from '../lib/response-parser.js';

describe('ResponseParser', () => {
  let parser;

  beforeEach(() => {
    parser = new ResponseParser();
  });

  describe('parse', () => {
    it('should parse JSON in code blocks', () => {
      const text = '```json\n{"action": "execute", "code": "return 1"}\n```';
      const result = parser.parse(text);

      expect(result.action).toBe('execute');
      expect(result.code).toBe('return 1');
    });

    it('should parse JSON in code blocks without language tag', () => {
      const text = '```\n{"action": "complete", "result": "done"}\n```';
      const result = parser.parse(text);

      expect(result.action).toBe('complete');
      expect(result.result).toBe('done');
    });

    it('should parse plain JSON', () => {
      const text = '{"action": "execute", "code": "return 1"}';
      const result = parser.parse(text);

      expect(result.action).toBe('execute');
      expect(result.code).toBe('return 1');
    });

    it('should parse embedded JSON', () => {
      const text = 'Here is my response: {"action": "error", "error": "test error"} and more text';
      const result = parser.parse(text);

      expect(result.action).toBe('error');
      expect(result.error).toBe('test error');
    });

    it('should throw on invalid JSON', () => {
      expect(() => parser.parse('not valid json')).toThrow('Could not parse');
    });

    it('should throw on empty string', () => {
      expect(() => parser.parse('')).toThrow('Could not parse');
    });

    it('should prefer code block over plain text', () => {
      const text = '{"action": "execute", "code": "wrong"}\n```json\n{"action": "complete", "result": "right"}\n```';
      const result = parser.parse(text);

      expect(result.action).toBe('complete');
      expect(result.result).toBe('right');
    });
  });

  describe('validate', () => {
    it('should validate execute action', () => {
      const result = parser.validate({ action: 'execute', code: 'return 1' });
      expect(result.action).toBe('execute');
    });

    it('should reject execute without code', () => {
      expect(() => parser.validate({ action: 'execute' })).toThrow('requires a "code" string');
    });

    it('should reject execute with non-string code', () => {
      expect(() => parser.validate({ action: 'execute', code: 123 })).toThrow('requires a "code" string');
    });

    it('should validate complete action', () => {
      const result = parser.validate({ action: 'complete', result: 'done' });
      expect(result.action).toBe('complete');
    });

    it('should reject complete without result', () => {
      expect(() => parser.validate({ action: 'complete' })).toThrow('requires a "result"');
    });

    it('should validate error action', () => {
      const result = parser.validate({ action: 'error', error: 'test' });
      expect(result.action).toBe('error');
    });

    it('should reject error without error field', () => {
      expect(() => parser.validate({ action: 'error' })).toThrow('requires an "error"');
    });

    it('should reject invalid action type', () => {
      expect(() => parser.validate({ action: 'invalid' })).toThrow('Invalid action');
    });

    it('should reject non-object', () => {
      expect(() => parser.validate('string')).toThrow('must be a JSON object');
    });

    it('should reject null', () => {
      expect(() => parser.validate(null)).toThrow('must be a JSON object');
    });

    it('should reject object without action', () => {
      expect(() => parser.validate({ code: 'test' })).toThrow('must have an "action"');
    });
  });

  describe('getCorrectionPrompt', () => {
    it('should generate correction prompt for error', () => {
      const error = new Error('Test error message');
      const prompt = parser.getCorrectionPrompt(error);

      expect(prompt).toContain('Test error message');
      expect(prompt).toContain('JSON');
      expect(prompt).toContain('action');
    });

    it('should include all valid actions in prompt', () => {
      const error = new Error('Test');
      const prompt = parser.getCorrectionPrompt(error);

      expect(prompt).toContain('execute');
      expect(prompt).toContain('complete');
      expect(prompt).toContain('error');
    });
  });
});

describe('responseParser singleton', () => {
  it('should be a ResponseParser instance', () => {
    expect(responseParser).toBeInstanceOf(ResponseParser);
  });

  it('should parse valid responses', () => {
    const result = responseParser.parse('{"action": "complete", "result": "test"}');
    expect(result.action).toBe('complete');
  });
});
