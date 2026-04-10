/**
 * Tests for Error Boundary Module
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ErrorBoundary,
  GlobalErrorBoundary,
  ErrorDisplay,
  AsyncOperation,
  withBoundary,
  withFallback,
  safeAsync,
  getGlobalErrorBoundary
} from '../lib/error-boundary.js';
import { AgentabError, ValidationError } from '../lib/errors.js';

describe('ErrorBoundary', () => {
  let boundary;

  beforeEach(() => {
    boundary = new ErrorBoundary();
  });

  describe('wrap()', () => {
    it('should return success for successful function', async () => {
      const result = await boundary.wrap(() => Promise.resolve('success'));
      expect(result.success).toBe(true);
      expect(result.result).toBe('success');
    });

    it('should return error for failed function', async () => {
      const result = await boundary.wrap(() => Promise.reject(new Error('test error')));
      expect(result.success).toBe(false);
      expect(result.error.message).toBe('test error');
    });

    it('should normalize errors', async () => {
      const result = await boundary.wrap(() => Promise.reject(new Error('test')));
      expect(result.error).toBeInstanceOf(AgentabError);
    });

    it('should call onCatch callback on error', async () => {
      const onCatch = vi.fn();
      boundary = new ErrorBoundary({ onCatch });

      await boundary.wrap(() => Promise.reject(new Error('test')));
      expect(onCatch).toHaveBeenCalled();
    });

    it('should retry recoverable errors', async () => {
      const onRetry = vi.fn();
      boundary = new ErrorBoundary({ onRetry, maxRetries: 2, retryDelay: 10 });

      let attempts = 0;
      const fn = () => {
        attempts++;
        if (attempts < 3) {
          const error = new AgentabError('test', 'TIMEOUT_ERROR');
          error.code = 'TIMEOUT_ERROR';
          return Promise.reject(error);
        }
        return Promise.resolve('success');
      };

      const result = await boundary.wrap(fn);
      expect(result.success).toBe(true);
      expect(attempts).toBe(3);
    });
  });

  describe('wrapWithFallback()', () => {
    it('should use main result on success', async () => {
      const fallback = vi.fn();
      const result = await boundary.wrapWithFallback(
        () => Promise.resolve('main'),
        fallback
      );
      expect(result).toBe('main');
      expect(fallback).not.toHaveBeenCalled();
    });

    it('should use fallback on error', async () => {
      const fallback = vi.fn(() => 'fallback');
      const result = await boundary.wrapWithFallback(
        () => Promise.reject(new Error('test')),
        fallback
      );
      expect(result).toBe('fallback');
      expect(fallback).toHaveBeenCalled();
    });
  });

  describe('reset()', () => {
    it('should reset retry count', () => {
      boundary.retryCount = 5;
      boundary.reset();
      expect(boundary.retryCount).toBe(0);
    });
  });
});

describe('GlobalErrorBoundary', () => {
  let globalBoundary;

  beforeEach(() => {
    globalBoundary = new GlobalErrorBoundary();
  });

  describe('getBoundary()', () => {
    it('should create new boundary', () => {
      const boundary = globalBoundary.getBoundary('test');
      expect(boundary).toBeInstanceOf(ErrorBoundary);
    });

    it('should return existing boundary', () => {
      const boundary1 = globalBoundary.getBoundary('test');
      const boundary2 = globalBoundary.getBoundary('test');
      expect(boundary1).toBe(boundary2);
    });
  });

  describe('subscribe()', () => {
    it('should notify listeners on error', async () => {
      const listener = vi.fn();
      globalBoundary.subscribe(listener);

      const boundary = globalBoundary.getBoundary('test');
      await boundary.wrap(() => Promise.reject(new Error('test')));

      expect(listener).toHaveBeenCalled();
    });

    it('should return unsubscribe function', () => {
      const listener = vi.fn();
      const unsubscribe = globalBoundary.subscribe(listener);
      unsubscribe();

      // Listener should not be called after unsubscribe
      expect(globalBoundary.listeners.has(listener)).toBe(false);
    });
  });

  describe('getStats()', () => {
    it('should return error statistics', async () => {
      const boundary = globalBoundary.getBoundary('test');
      await boundary.wrap(() => Promise.reject(new Error('error1')));
      await boundary.wrap(() => Promise.reject(new Error('error2')));

      const stats = globalBoundary.getStats();
      expect(stats.total).toBe(2);
    });
  });
});

describe('ErrorDisplay', () => {
  let container;
  let display;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    display = new ErrorDisplay(container);
  });

  it('should show error message', () => {
    const error = new Error('Test error message');
    display.show(error);
    expect(container.textContent).toContain('Test error message');
  });

  it('should show retry button for recoverable errors', () => {
    const error = new AgentabError('test', 'TIMEOUT_ERROR');
    error.code = 'TIMEOUT_ERROR';
    
    display = new ErrorDisplay(container, { showRetry: true });
    display.show(error);
    
    expect(container.querySelector('.btn-retry')).toBeTruthy();
  });

  it('should hide error', () => {
    display.show(new Error('test'));
    display.hide();
    expect(container.innerHTML).toBe('');
  });
});

describe('AsyncOperation', () => {
  let container;
  let operation;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    operation = new AsyncOperation({
      loadingElement: container
    });
  });

  describe('execute()', () => {
    it('should return result on success', async () => {
      const result = await operation.execute(() => Promise.resolve('success'));
      expect(result.success).toBe(true);
      expect(result.result).toBe('success');
    });

    it('should return error on failure', async () => {
      const result = await operation.execute(() => Promise.reject(new Error('test')));
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it('should set loading state', async () => {
      const fn = () => new Promise(resolve => setTimeout(() => resolve('done'), 10));
      
      const promise = operation.execute(fn);
      expect(operation.isLoading).toBe(true);
      
      await promise;
      expect(operation.isLoading).toBe(false);
    });
  });
});

describe('withBoundary()', () => {
  it('should wrap function with error boundary', async () => {
    const result = await withBoundary(() => Promise.resolve('success'));
    expect(result.success).toBe(true);
    expect(result.result).toBe('success');
  });
});

describe('withFallback()', () => {
  it('should use fallback on error', async () => {
    const result = await withFallback(
      () => Promise.reject(new Error('test')),
      () => 'fallback'
    );
    expect(result).toBe('fallback');
  });
});

describe('safeAsync()', () => {
  it('should create safe async handler', async () => {
    const handler = safeAsync(() => Promise.resolve('success'));
    const result = await handler();
    expect(result).toBe('success');
  });

  it('should return null on error', async () => {
    const handler = safeAsync(() => Promise.reject(new Error('test')));
    const result = await handler();
    expect(result).toBeNull();
  });

  it('should call onError callback', async () => {
    const onError = vi.fn();
    const handler = safeAsync(
      () => Promise.reject(new Error('test')),
      { onError }
    );
    
    await handler();
    expect(onError).toHaveBeenCalled();
  });
});
