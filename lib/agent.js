// lib/agent.js - AI Agent logic

import { enhancedApiClient as apiClient } from './enhanced-api-client.js';
import { PageAnalyzer } from './page-analyzer.js';
import { AbortError } from './errors.js';
import { SandboxExecutor } from './sandbox.js';
import { RecoveryManager, RecoveryStrategy, circuitBreaker } from './recovery.js';
import { agentLogger as logger } from './logger.js';
import { tracker, metrics } from './performance.js';
import { ExecutionProgress, ExecutionPhase } from './progress.js';

/**
 * AgentExecutor - Main agent execution logic with recovery and monitoring
 */
export class AgentExecutor {
  constructor(options = {}) {
    this.maxIterations = options.maxIterations || 10;
    this.conversationHistory = [];
    this.abortController = null;
    this.isRunning = false;
    this.sandbox = new SandboxExecutor();

    // Recovery manager for error handling
    this.recoveryManager = new RecoveryManager({
      enableRecovery: options.enableRecovery ?? true,
      enableLogging: true
    });

    // Progress tracking
    this.progress = new ExecutionProgress({
      onPhaseChange: options.onPhaseChange,
      onProgress: options.onProgress
    });

    // Rate limiting configuration
    this.rateLimit = {
      maxExecutions: options.maxExecutionsPerMinute || 30,
      windowMs: 60000, // 1 minute window
      executions: []
    };
  }

  /**
   * Check if execution is rate limited
   * @returns {boolean} True if limited
   */
  isRateLimited() {
    const now = Date.now();
    // Clean old executions
    this.rateLimit.executions = this.rateLimit.executions.filter(
      t => now - t < this.rateLimit.windowMs
    );
    return this.rateLimit.executions.length >= this.rateLimit.maxExecutions;
  }

  /**
   * Record an execution for rate limiting
   */
  recordExecution() {
    this.rateLimit.executions.push(Date.now());
  }

  /**
   * Get remaining executions in current window
   * @returns {number}
   */
  getRemainingExecutions() {
    this.isRateLimited(); // Clean old entries
    return Math.max(0, this.rateLimit.maxExecutions - this.rateLimit.executions.length);
  }

  /**
   * Stop current execution - Fixed race condition
   */
  stop() {
    // Set flag first to prevent any new operations
    this.isRunning = false;

    // Then abort any in-flight requests
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  /**
   * Generate system prompt for agent
   * @param {Object} pageInfo - Page information
   * @returns {string}
   */
  getSystemPrompt(pageInfo) {
    return `You are a Chrome browser automation agent. You control web pages by generating JavaScript code.

## Current Page Info:
- URL: ${pageInfo.url}
- Title: ${pageInfo.title}

## Your Capabilities:
You can execute JavaScript code in the context of the current web page. The code runs with full DOM access.

## Response Format:
You MUST respond with a JSON object in one of these formats:

1. To execute JavaScript code:
\`\`\`json
{
  "action": "execute",
  "code": "// your JavaScript code here",
  "explanation": "What this code does"
}
\`\`\`

2. When the task is complete:
\`\`\`json
{
  "action": "complete",
  "result": "Summary of what was accomplished",
  "explanation": "Final explanation"
}
\`\`\`

3. If the task cannot be completed:
\`\`\`json
{
  "action": "error",
  "error": "Why the task cannot be completed",
  "explanation": "Detailed explanation"
}
\`\`\`

## Important Rules:
1. Always return valid JSON wrapped in a code block
2. Write clean, safe JavaScript code
3. Use document.querySelector/querySelectorAll for DOM manipulation
4. For multi-step tasks, execute one step at a time
5. After each execution, you'll receive the result and can decide the next step
6. Use console.log() for intermediate results that you want to see
7. The code's return value (last expression) will be sent back to you
8. You can use async/await and fetch API
9. Be careful with destructive operations
10. Always explain what you're doing`;
  }

  /**
   * Execute code on tab using sandbox
   * @param {number} tabId - Tab ID
   * @param {string} code - Code to execute
   * @returns {Promise<{success: boolean, result?: any, error?: string}>}
   */
  async executeCode(tabId, code) {
    try {
      // Check rate limit
      if (this.isRateLimited()) {
        return {
          success: false,
          error: 'Rate limit exceeded. Please wait before executing more code.'
        };
      }

      // Validate code using sandbox
      const validation = this.sandbox.validate(code);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      // Additional security: check for suspicious patterns in agent context
      const suspiciousPatterns = [
        /fetch\s*\(\s*['"]https?:\/\/(?!localhost|127\.0\.0\.1)/i, // External fetch
        /XMLHttpRequest/i,
        /WebSocket/i
      ];

      for (const pattern of suspiciousPatterns) {
        if (pattern.test(code)) {
          console.warn(`Warning: Code contains potentially risky pattern: ${pattern.toString()}`);
        }
      }

      // Record execution for rate limiting
      this.recordExecution();

      // Execute in page context with security wrapper
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: codeStr => {
          try {
            // Create a sandboxed execution environment
            // This wraps the code in an async IIFE with strict mode
            const wrappedCode = `
              "use strict";
              return (async () => {
                // Inject safe helper functions
                const __chromeAgent = {
                  waitForElement: (selector, timeout = 5000) => {
                    return new Promise((resolve, reject) => {
                      const element = document.querySelector(selector);
                      if (element) return resolve(element);
                      const observer = new MutationObserver(() => {
                        const el = document.querySelector(selector);
                        if (el) {
                          observer.disconnect();
                          resolve(el);
                        }
                      });
                      observer.observe(document.body, { childList: true, subtree: true });
                      setTimeout(() => {
                        observer.disconnect();
                        reject(new Error('Element not found: ' + selector));
                      }, timeout);
                    });
                  },
                  sleep: ms => new Promise(r => setTimeout(r, ms)),
                  click: selector => {
                    const el = document.querySelector(selector);
                    if (el) el.click();
                    return !!el;
                  },
                  type: (selector, text) => {
                    const el = document.querySelector(selector);
                    if (el) {
                      el.focus();
                      el.value = text;
                      el.dispatchEvent(new Event('input', { bubbles: true }));
                      return true;
                    }
                    return false;
                  }
                };

                // Execute user code
                ${codeStr}
              })();
            `;

            // Use Function constructor - safer than eval but still needs caution
            const asyncFn = new Function(wrappedCode);
            const result = asyncFn();
            return result;
          } catch (e) {
            return { __error: true, message: e.message, stack: e.stack };
          }
        },
        args: [code],
        world: 'MAIN'
      });

      const result = results[0]?.result;

      // Check for execution errors
      if (result && typeof result === 'object' && result.__error) {
        return {
          success: false,
          error: result.message,
          stack: result.stack
        };
      }

      // Handle promise results with timeout
      if (result instanceof Promise) {
        try {
          const resolved = await Promise.race([
            result,
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Promise timeout after 30 seconds')), 30000)
            )
          ]);
          return { success: true, result: resolved };
        } catch (e) {
          return { success: false, error: `Promise rejected: ${e.message}` };
        }
      }

      return { success: true, result };
    } catch (error) {
      // Handle Chrome API errors
      if (error.message?.includes('Cannot access')) {
        return {
          success: false,
          error: 'Cannot access this page. It may be a restricted page.'
        };
      }
      if (error.message?.includes('No tab with id')) {
        return { success: false, error: 'Tab was closed during execution' };
      }

      return { success: false, error: error.message };
    }
  }

  /**
   * Parse LLM response to extract action
   * @param {string} text - LLM response text
   * @returns {Object}
   */
  parseResponse(text) {
    // Try to extract JSON from code blocks
    const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
      try {
        return JSON.parse(codeBlockMatch[1].trim());
      } catch (e) {
        // Continue to next method
      }
    }

    // Try to parse entire response as JSON
    try {
      return JSON.parse(text.trim());
    } catch (e) {
      // Continue to next method
    }

    // Try to find JSON object in text
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (e) {
        // Continue to error
      }
    }

    throw new Error('Could not parse LLM response as JSON');
  }

  /**
   * Run agent loop for prompt
   * @param {number} tabId - Tab ID
   * @param {string} prompt - User prompt
   * @param {Function} onUpdate - Update callback
   * @returns {Promise<Array>}
   */
  async runPrompt(tabId, prompt, onUpdate) {
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Setup abort controller
    this.abortController = new AbortController();
    this.isRunning = true;
    this.conversationHistory = [];

    // Start progress tracking
    this.progress.start({
      maxIterations: this.maxIterations,
      metadata: { prompt: prompt.substring(0, 100), tabId }
    });

    logger.info('Agent execution started', { executionId, prompt: prompt.substring(0, 100) });
    metrics.increment('agent.execution.started');

    try {
      // Get page info with performance tracking
      this.progress.transitionTo(ExecutionPhase.ANALYZING);
      const pageInfo = await tracker.track('page_analysis', async () => {
        return await PageAnalyzer.getPromptContext(tabId);
      });

      const systemMessage = {
        role: 'system',
        content: this.getSystemPrompt(pageInfo)
      };

      // Add user message with page context
      this.conversationHistory.push({
        role: 'user',
        content: `Task: ${prompt}\n\nCurrent page structure:\n- Forms: ${JSON.stringify(pageInfo.forms || [])}\n- Buttons: ${JSON.stringify(pageInfo.buttons || [])}\n- Links (first 20): ${JSON.stringify(pageInfo.links || [])}\n- Page text (first 2000 chars): ${pageInfo.bodyText?.substring(0, 2000) || 'N/A'}`
      });

      const results = [];
      let iteration = 0;

      while (iteration < this.maxIterations && this.isRunning) {
        // Check if aborted
        if (this.abortController?.signal.aborted) {
          const error = new AbortError('Agent execution stopped by user');
          this.progress.fail(error);
          onUpdate?.({
            type: 'error',
            message: 'Agent execution stopped by user'
          });
          results.push({ type: 'error', message: 'Stopped by user' });
          break;
        }

        iteration++;
        this.progress.updateProgress(iteration, `Step ${iteration}`);
        this.progress.transitionTo(ExecutionPhase.THINKING, { iteration });

        onUpdate?.({
          type: 'thinking',
          iteration,
          message: `Agent is thinking (step ${iteration})...`
        });

        // Call LLM with recovery
        let llmResponse;
        try {
          this.progress.transitionTo(ExecutionPhase.GENERATING, { iteration });

          llmResponse = await this.recoveryManager.executeWithRecovery(
            async () => {
              return await tracker.trackApi('chat_completion', async () => {
                return await circuitBreaker.execute(async () => {
                  return await apiClient.chatCompletion(
                    [systemMessage, ...this.conversationHistory],
                    { signal: this.abortController?.signal }
                  );
                });
              });
            },
            RecoveryStrategy.API,
            { executionId, iteration }
          );
        } catch (error) {
          if (error instanceof AbortError) {
            this.progress.fail(error);
            onUpdate?.({
              type: 'error',
              message: 'Agent execution stopped by user'
            });
            results.push({ type: 'error', message: 'Stopped by user' });
            break;
          }

          logger.error('LLM call failed', { error: error.message, iteration });
          this.progress.fail(error);
          onUpdate?.({
            type: 'error',
            message: `LLM call failed: ${error.message}`
          });
          results.push({ type: 'error', message: error.message });
          break;
        }

        // Add assistant response to history
        this.conversationHistory.push({
          role: 'assistant',
          content: llmResponse
        });

        // Parse response with retry mechanism
        let action;
        let parseError = null;
        const maxParseRetries = 2;

        for (let parseAttempt = 0; parseAttempt <= maxParseRetries; parseAttempt++) {
          try {
            action = this.parseResponse(llmResponse);
            parseError = null;
            break;
          } catch (error) {
            parseError = error;

            // If not the last attempt, ask LLM to fix the format
            if (parseAttempt < maxParseRetries) {
              onUpdate?.({
                type: 'thinking',
                iteration,
                message: 'Response format invalid, requesting correction...'
              });

              // Add message asking for correction
              this.conversationHistory.push({
                role: 'user',
                content: `Your previous response could not be parsed: ${error.message}\n\nPlease provide a valid response in the required JSON format:\n{\n  "action": "execute" | "complete" | "error",\n  "code": "JavaScript code" (if action is execute),\n  "result": "result message" (if action is complete),\n  "error": "error message" (if action is error),\n  "explanation": "brief explanation"\n}\n\nRespond ONLY with the JSON object, no additional text.`
              });

              try {
                llmResponse = await apiClient.chatCompletion(
                  [systemMessage, ...this.conversationHistory],
                  { signal: this.abortController?.signal }
                );
                this.conversationHistory.push({
                  role: 'assistant',
                  content: llmResponse
                });
              } catch (retryError) {
                // Retry failed, use last error
                break;
              }
            }
          }
        }

        // If all parse attempts failed
        if (parseError) {
          onUpdate?.({
            type: 'error',
            message: `Failed to parse response after ${maxParseRetries + 1} attempts: ${parseError.message}`,
            raw: llmResponse
          });
          results.push({
            type: 'parse_error',
            message: parseError.message,
            raw: llmResponse
          });
          break;
        }

        // Handle different action types
        if (action.action === 'complete') {
          this.progress.complete({ result: action.result });
          onUpdate?.({
            type: 'complete',
            message: action.result,
            explanation: action.explanation
          });
          results.push({
            type: 'complete',
            result: action.result,
            explanation: action.explanation
          });

          metrics.increment('agent.execution.completed');
          logger.info('Agent execution completed', {
            executionId,
            iterations: iteration,
            result: action.result.substring(0, 100)
          });
          break;
        }

        if (action.action === 'error') {
          const error = new Error(action.error);
          this.progress.fail(error);
          onUpdate?.({
            type: 'error',
            message: action.error,
            explanation: action.explanation
          });
          results.push({
            type: 'error',
            message: action.error,
            explanation: action.explanation
          });

          metrics.increment('agent.execution.failed');
          logger.error('Agent reported error', { executionId, error: action.error });
          break;
        }

        if (action.action === 'execute') {
          this.progress.transitionTo(ExecutionPhase.EXECUTING, {
            code: action.code.substring(0, 100)
          });

          onUpdate?.({
            type: 'executing',
            code: action.code,
            explanation: action.explanation,
            iteration
          });

          // Execute code with performance tracking
          const execResult = await tracker.track('code_execution', async () => {
            return await this.executeCode(tabId, action.code);
          });

          this.progress.addStep({
            type: 'execution',
            code: action.code.substring(0, 100),
            success: execResult.success
          });

          results.push({
            type: 'execution',
            code: action.code,
            explanation: action.explanation,
            result: execResult,
            iteration
          });

          onUpdate?.({
            type: 'executed',
            code: action.code,
            result: execResult,
            iteration
          });

          // Get updated page info
          this.progress.transitionTo(ExecutionPhase.OBSERVING);

          // Get updated page info
          const updatedPageInfo = await PageAnalyzer.getPromptContext(tabId);

          // Send result back to LLM
          const resultMessage = execResult.success
            ? `Code executed successfully.\nReturn value: ${JSON.stringify(execResult.result, null, 2) ?? 'undefined'}\n\nUpdated page URL: ${updatedPageInfo.url}\nUpdated page title: ${updatedPageInfo.title}`
            : `Code execution failed.\nError: ${execResult.error}\n${execResult.stack || ''}`;

          this.conversationHistory.push({
            role: 'user',
            content: resultMessage
          });
        }
      }

      // Check for max iterations
      if (iteration >= this.maxIterations) {
        const error = new Error(`Agent reached maximum iterations (${this.maxIterations})`);
        this.progress.fail(error);
        onUpdate?.({
          type: 'error',
          message: `Agent reached maximum iterations (${this.maxIterations})`
        });

        metrics.increment('agent.execution.max_iterations');
        logger.warn('Agent reached max iterations', {
          executionId,
          maxIterations: this.maxIterations
        });
      }

      // Return results with stats
      const stats = this.progress.getStats();
      return {
        results,
        stats: {
          ...stats,
          cacheStats: PageAnalyzer.getCacheStats(),
          apiStats: apiClient.getCacheStats?.() || {},
          recoveryStats: this.recoveryManager.getStats()
        }
      };
    } catch (error) {
      this.progress.fail(error);
      logger.error('Agent execution failed', { executionId, error: error.message });
      metrics.increment('agent.execution.error');
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Execute raw code directly
   * @param {number} tabId - Tab ID
   * @param {string} code - Code to execute
   * @param {Function} onUpdate - Update callback
   * @returns {Promise<Object>}
   */
  async runCode(tabId, code, onUpdate) {
    const executionId = `code_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    logger.info('Direct code execution started', { executionId, codeLength: code.length });
    metrics.increment('agent.code_execution.started');

    this.progress.start({
      maxIterations: 1,
      metadata: { codeType: 'direct' }
    });

    this.progress.transitionTo(ExecutionPhase.EXECUTING, { code: code.substring(0, 100) });

    onUpdate?.({
      type: 'executing',
      code,
      explanation: 'Executing code'
    });

    try {
      const result = await tracker.track('direct_code_execution', async () => {
        return await this.executeCode(tabId, code);
      });

      if (result.success) {
        this.progress.complete({ result: result.result });
        metrics.increment('agent.code_execution.success');
      } else {
        this.progress.fail(new Error(result.error));
        metrics.increment('agent.code_execution.failed');
      }

      onUpdate?.({
        type: result.success ? 'complete' : 'error',
        code,
        result,
        message: result.success
          ? `Code executed successfully. Result: ${JSON.stringify(result.result)}`
          : `Execution failed: ${result.error}`
      });

      return {
        results: [
          {
            type: result.success ? 'execution' : 'error',
            code,
            result
          }
        ],
        stats: {
          duration: this.progress.getStats().duration,
          success: result.success
        }
      };
    } catch (error) {
      this.progress.fail(error);
      logger.error('Code execution failed', { executionId, error: error.message });
      metrics.increment('agent.code_execution.error');
      throw error;
    }
  }
}
