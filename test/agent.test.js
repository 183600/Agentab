// test/agent.test.js - Tests for AgentExecutor

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentExecutor } from '../lib/agent.js';
import { mockChromeScripting, mockChromeTabs } from './setup.js';

// Mock dependencies
vi.mock('../lib/api-client.js', () => ({
  LlmApiClient: class LlmApiClient {
    constructor() {
      this.defaultTimeout = 60000;
      this.maxRetries = 3;
    }
    async chatCompletion() {
      return 'test response';
    }
    async testConnection() {
      return { success: true };
    }
    async listModels() {
      return [];
    }
  },
  apiClient: {
    chatCompletion: vi.fn(),
    testConnection: vi.fn(),
    listModels: vi.fn()
  }
}));

vi.mock('../lib/enhanced-api-client.js', () => ({
  enhancedApiClient: {
    chatCompletion: vi.fn(),
    testConnection: vi.fn(),
    getCacheStats: vi.fn(() => ({})),
    clearCache: vi.fn()
  }
}));

vi.mock('../lib/page-analyzer.js', () => ({
  PageAnalyzer: {
    getPromptContext: vi.fn(() =>
      Promise.resolve({
        url: 'https://example.com',
        title: 'Test Page',
        forms: [],
        buttons: [],
        links: [],
        bodyText: 'Test content'
      })
    )
  }
}));

describe('AgentExecutor', () => {
  let agent;

  beforeEach(() => {
    agent = new AgentExecutor();
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (agent) {
      agent.stop();
    }
  });

  describe('constructor', () => {
    it('should initialize with default values', () => {
      expect(agent.maxIterations).toBe(10);
      expect(agent.conversationHistory).toEqual([]);
      expect(agent.abortController).toBeNull();
      expect(agent.isRunning).toBe(false);
    });

    it('should accept custom maxIterations', () => {
      const customAgent = new AgentExecutor({ maxIterations: 5 });
      expect(customAgent.maxIterations).toBe(5);
    });

    it('should initialize rate limiting', () => {
      expect(agent.rateLimit.maxExecutions).toBe(30);
      expect(agent.rateLimit.windowMs).toBe(60000);
      expect(agent.rateLimit.executions).toEqual([]);
    });
  });

  describe('stop()', () => {
    it('should set isRunning to false first', () => {
      agent.isRunning = true;
      agent.abortController = new AbortController();

      agent.stop();

      expect(agent.isRunning).toBe(false);
      expect(agent.abortController).toBeNull();
    });

    it('should abort any active controller', () => {
      const controller = new AbortController();
      agent.abortController = controller;
      agent.isRunning = true;

      agent.stop();

      expect(controller.signal.aborted).toBe(true);
    });

    it('should handle null abortController gracefully', () => {
      agent.abortController = null;
      agent.isRunning = true;

      expect(() => agent.stop()).not.toThrow();
      expect(agent.isRunning).toBe(false);
    });
  });

  describe('rate limiting', () => {
    it('should allow executions under the limit', () => {
      expect(agent.isRateLimited()).toBe(false);
    });

    it('should track executions', () => {
      agent.recordExecution();
      expect(agent.rateLimit.executions.length).toBe(1);
    });

    it('should count remaining executions correctly', () => {
      for (let i = 0; i < 5; i++) {
        agent.recordExecution();
      }
      expect(agent.getRemainingExecutions()).toBe(25);
    });

    it('should limit when max executions reached', () => {
      for (let i = 0; i < 30; i++) {
        agent.recordExecution();
      }
      expect(agent.isRateLimited()).toBe(true);
    });

    it('should clean old executions', () => {
      // Add an old execution
      agent.rateLimit.executions.push(Date.now() - 70000);

      // Check rate limit should clean it
      agent.isRateLimited();

      expect(agent.rateLimit.executions.length).toBe(0);
    });
  });

  describe('parseResponse()', () => {
    it('should parse JSON from code block', () => {
      const response = '```json\n{"action": "execute", "code": "test"}\n```';
      const result = agent.parseResponse(response);

      expect(result).toEqual({
        action: 'execute',
        code: 'test'
      });
    });

    it('should parse JSON without json marker in code block', () => {
      const response = '```\n{"action": "complete", "result": "done"}\n```';
      const result = agent.parseResponse(response);

      expect(result).toEqual({
        action: 'complete',
        result: 'done'
      });
    });

    it('should parse raw JSON string', () => {
      const response = '{"action": "error", "error": "test error"}';
      const result = agent.parseResponse(response);

      expect(result).toEqual({
        action: 'error',
        error: 'test error'
      });
    });

    it('should find JSON in text', () => {
      const response = 'Here is the result: {"action": "execute", "code": "return 1"} done';
      const result = agent.parseResponse(response);

      expect(result).toEqual({
        action: 'execute',
        code: 'return 1'
      });
    });

    it('should throw on invalid JSON', () => {
      const response = 'This is not JSON';

      expect(() => agent.parseResponse(response)).toThrow('Could not parse LLM response as JSON');
    });
  });

  describe('getSystemPrompt()', () => {
    it('should include page info', () => {
      const pageInfo = {
        url: 'https://test.com',
        title: 'Test Title'
      };
      const prompt = agent.getSystemPrompt(pageInfo);

      expect(prompt).toContain('https://test.com');
      expect(prompt).toContain('Test Title');
    });

    it('should include response format instructions', () => {
      const prompt = agent.getSystemPrompt({ url: '', title: '' });

      expect(prompt).toContain('execute');
      expect(prompt).toContain('complete');
      expect(prompt).toContain('error');
    });
  });

  describe('executeCode()', () => {
    it('should fail when rate limited', async () => {
      // Exhaust rate limit
      for (let i = 0; i < 30; i++) {
        agent.recordExecution();
      }

      const result = await agent.executeCode(1, 'return 1');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Rate limit exceeded');
    });

    it('should validate code before execution', async () => {
      const maliciousCode = 'eval("alert(1)")';

      const result = await agent.executeCode(1, maliciousCode);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
