// test/errors.test.js - Tests for error handling

import { describe, it, expect } from 'vitest';
import {
  AgentabError,
  ValidationError,
  ApiError,
  ExecutionError,
  TimeoutError,
  AbortError,
  ErrorHandler
} from '../lib/errors.js';

describe('Error Classes', () => {
  describe('AgentabError', () => {
    it('should create error with message', () => {
      const error = new AgentabError('Test error');
      expect(error.message).toBe('Test error');
      expect(error.name).toBe('AgentabError');
      expect(error.code).toBe('UNKNOWN_ERROR');
    });

    it('should create error with code and details', () => {
      const error = new AgentabError('Test error', 'TEST_CODE', { key: 'value' });
      expect(error.code).toBe('TEST_CODE');
      expect(error.details).toEqual({ key: 'value' });
    });

    it('should serialize to JSON', () => {
      const error = new AgentabError('Test error', 'TEST_CODE');
      const json = error.toJSON();
      expect(json.message).toBe('Test error');
      expect(json.code).toBe('TEST_CODE');
    });
  });

  describe('ValidationError', () => {
    it('should create validation error', () => {
      const error = new ValidationError('Invalid input', 'field', 'value');
      expect(error.message).toBe('Invalid input');
      expect(error.field).toBe('field');
      expect(error.value).toBe('value');
    });
  });

  describe('ApiError', () => {
    it('should create API error from response', () => {
      const response = { status: 401 };
      const body = { error: { message: 'Unauthorized' } };
      const error = ApiError.fromResponse(response, body);
      expect(error.statusCode).toBe(401);
      expect(error.message).toContain('API key');
    });

    it('should handle rate limit error', () => {
      const response = { status: 429 };
      const error = ApiError.fromResponse(response, {});
      expect(error.statusCode).toBe(429);
      expect(error.message).toContain('Rate limit');
    });

    it('should handle server error', () => {
      const response = { status: 500 };
      const error = ApiError.fromResponse(response, {});
      expect(error.message).toContain('Server error');
    });
  });

  describe('TimeoutError', () => {
    it('should create timeout error', () => {
      const error = new TimeoutError('Operation timed out', 5000);
      expect(error.message).toBe('Operation timed out');
      expect(error.duration).toBe(5000);
    });
  });

  describe('AbortError', () => {
    it('should create abort error', () => {
      const error = new AbortError();
      expect(error.message).toBe('Operation was aborted');
    });
  });
});

describe('ErrorHandler', () => {
  describe('normalize', () => {
    it('should normalize AgentabError', () => {
      const error = new AgentabError('Test');
      const normalized = ErrorHandler.normalize(error);
      expect(normalized).toBe(error);
    });

    it('should normalize generic error', () => {
      const error = new Error('Generic error');
      const normalized = ErrorHandler.normalize(error);
      expect(normalized).toBeInstanceOf(AgentabError);
      expect(normalized.message).toBe('Generic error');
    });

    it('should normalize DOMException as AbortError', () => {
      const error = new DOMException('Aborted', 'AbortError');
      const normalized = ErrorHandler.normalize(error);
      expect(normalized).toBeInstanceOf(AbortError);
    });
  });

  describe('getUserMessage', () => {
    it('should return user-friendly message for validation error', () => {
      const error = new ValidationError('Invalid field');
      const message = ErrorHandler.getUserMessage(error);
      expect(message).toContain('Validation failed');
    });

    it('should return user-friendly message for API error', () => {
      const error = new ApiError('Request failed', 400);
      const message = ErrorHandler.getUserMessage(error);
      expect(message).toContain('API Error');
    });
  });

  describe('getErrorIcon', () => {
    it('should return icon for each error type', () => {
      expect(ErrorHandler.getErrorIcon(new ValidationError('test'))).toBe('⚠️');
      expect(ErrorHandler.getErrorIcon(new ApiError('test'))).toBe('🔌');
      expect(ErrorHandler.getErrorIcon(new TimeoutError())).toBe('⏱️');
      expect(ErrorHandler.getErrorIcon(new AbortError())).toBe('⏹️');
    });
  });

  describe('getSuggestion', () => {
    it('should return suggestion for API error', () => {
      const error = new ApiError('Request failed');
      const suggestion = ErrorHandler.getSuggestion(error);
      expect(suggestion).toContain('API key');
    });

    it('should return suggestion for timeout error', () => {
      const error = new TimeoutError();
      const suggestion = ErrorHandler.getSuggestion(error);
      expect(suggestion).toContain('network');
    });
  });

  describe('isRecoverable', () => {
    it('should identify recoverable errors', () => {
      expect(ErrorHandler.isRecoverable(new TimeoutError())).toBe(true);
      expect(ErrorHandler.isRecoverable(new ApiError('', 401))).toBe(false);
    });
  });
});
