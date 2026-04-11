// lib/agent.js - AI Agent orchestration (refactored)

import { enhancedApiClient as apiClient } from './enhanced-api-client.js';
import { PageAnalyzer } from './page-analyzer.js';
import { AbortError } from './errors.js';
import { CodeExecutor } from './code-executor.js';
import { ResponseParser } from './response-parser.js';
import { RecoveryManager, RecoveryStrategy, circuitBreaker } from './recovery.js';
import { agentLogger as logger } from './logger.js';
import { tracker, metrics } from './performance.js';
import { ExecutionProgress, ExecutionPhase } from './progress.js';

/**
 * AgentExecutor - Main agent orchestration (simplified)
 * 
 * Responsibilities:
 * - Coordinate between components
 * - Manage conversation history
 * - Handle abort/stop signals
 * - Track progress
 */
export class AgentExecutor {
  constructor(options = {}) {
    this.maxIterations = options.maxIterations || 10;
    this.conversationHistory = [];
    this.abortController = null;
    this.isRunning = false;
    this.enableStreaming = options.enableStreaming ?? false;

    // Composed components
    this.codeExecutor = new CodeExecutor({
      maxExecutionsPerMinute: options.maxExecutionsPerMinute || 30
    });
    this.responseParser = new ResponseParser();
    this.recoveryManager = new RecoveryManager({
      enableRecovery: options.enableRecovery ?? true,
      enableLogging: true
    });

    // Progress tracking
    this.progress = new ExecutionProgress({
      onPhaseChange: options.onPhaseChange,
      onProgress: options.onProgress
    });
  }

  /**
   * Enable or disable streaming mode
   */
  setStreaming(enabled) {
    this.enableStreaming = enabled;
  }

  /**
   * Check if streaming is enabled
   */
  isStreamingEnabled() {
    return this.enableStreaming;
  }

  /**
   * Stop current execution
   */
  stop() {
    this.isRunning = false;
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  /**
   * Generate system prompt for agent
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
   * Run agent loop for prompt
   */
  async runPrompt(tabId, prompt, onUpdate) {
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    this.abortController = new AbortController();
    this.isRunning = true;
    this.conversationHistory = [];

    this.progress.start({
      maxIterations: this.maxIterations,
      metadata: { prompt: prompt.substring(0, 100), tabId }
    });

    logger.info('Agent execution started', { executionId, prompt: prompt.substring(0, 100) });
    metrics.increment('agent.execution.started');

    try {
      this.progress.transitionTo(ExecutionPhase.ANALYZING);
      const pageInfo = await tracker.track('page_analysis', async () => {
        return await PageAnalyzer.getPromptContext(tabId);
      });

      const systemMessage = {
        role: 'system',
        content: this.getSystemPrompt(pageInfo)
      };

      this.conversationHistory.push({
        role: 'user',
        content: `Task: ${prompt}\n\nCurrent page structure:\n- Forms: ${JSON.stringify(pageInfo.forms || [])}\n- Buttons: ${JSON.stringify(pageInfo.buttons || [])}\n- Links (first 20): ${JSON.stringify(pageInfo.links || [])}\n- Page text (first 2000 chars): ${pageInfo.bodyText?.substring(0, 2000) || 'N/A'}`
      });

      const results = [];
      let iteration = 0;

      while (iteration < this.maxIterations && this.isRunning) {
        if (this.abortController?.signal.aborted) {
          return this.handleAbort(results, onUpdate);
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
        const llmResponse = await this.callLLM(
          systemMessage,
          executionId,
          iteration,
          onUpdate
        );

        if (!llmResponse) {
          results.push({ type: 'error', message: 'LLM call failed' });
          break;
        }

        this.conversationHistory.push({
          role: 'assistant',
          content: llmResponse
        });

        // Parse response with retry
        const { action, parseError } = await this.parseWithRetry(
          llmResponse,
          systemMessage,
          onUpdate,
          iteration
        );

        if (parseError) {
          onUpdate?.({
            type: 'error',
            message: `Failed to parse response: ${parseError.message}`
          });
          results.push({ type: 'parse_error', message: parseError.message });
          break;
        }

        // Handle action
        const actionResult = await this.handleAction(
          action,
          tabId,
          iteration,
          onUpdate
        );

        results.push(...actionResult.results);

        if (actionResult.done) {
          break;
        }
      }

      // Check for max iterations
      if (iteration >= this.maxIterations) {
        this.progress.fail(new Error(`Max iterations reached`));
        onUpdate?.({
          type: 'error',
          message: `Agent reached maximum iterations (${this.maxIterations})`
        });
        metrics.increment('agent.execution.max_iterations');
      }

      return this.buildResult(results);
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
   * Call LLM with streaming support
   */
  async callLLM(systemMessage, executionId, iteration, onUpdate) {
    this.progress.transitionTo(ExecutionPhase.GENERATING, { iteration });

    try {
      if (this.enableStreaming && onUpdate) {
        return await this.recoveryManager.executeWithRecovery(
          async () => {
            return await tracker.trackApi('stream_chat_completion', async () => {
              return await circuitBreaker.execute(async () => {
                let accumulated = '';
                return await apiClient.streamChatCompletion(
                  [systemMessage, ...this.conversationHistory],
                  chunk => {
                    accumulated += chunk;
                    onUpdate({
                      type: 'stream',
                      chunk,
                      accumulated,
                      iteration
                    });
                  },
                  { signal: this.abortController?.signal }
                );
              });
            });
          },
          RecoveryStrategy.API,
          { executionId, iteration }
        );
      } else {
        return await this.recoveryManager.executeWithRecovery(
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
      }
    } catch (error) {
      if (error instanceof AbortError) {
        return null;
      }
      logger.error('LLM call failed', { error: error.message, iteration });
      return null;
    }
  }

  /**
   * Parse response with retry mechanism
   */
  async parseWithRetry(llmResponse, systemMessage, onUpdate, iteration) {
    const maxRetries = 2;
    let currentResponse = llmResponse;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const action = this.responseParser.parse(currentResponse);
        return { action, parseError: null };
      } catch (error) {
        if (attempt < maxRetries) {
          onUpdate?.({
            type: 'thinking',
            iteration,
            message: 'Response format invalid, requesting correction...'
          });

          this.conversationHistory.push({
            role: 'user',
            content: this.responseParser.getCorrectionPrompt(error)
          });

          try {
            currentResponse = await apiClient.chatCompletion(
              [systemMessage, ...this.conversationHistory],
              { signal: this.abortController?.signal }
            );
            this.conversationHistory.push({
              role: 'assistant',
              content: currentResponse
            });
          } catch (retryError) {
            return { action: null, parseError: error };
          }
        } else {
          return { action: null, parseError: error };
        }
      }
    }

    return { action: null, parseError: new Error('Max parse retries exceeded') };
  }

  /**
   * Handle parsed action
   */
  async handleAction(action, tabId, iteration, onUpdate) {
    const results = [];
    let done = false;

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
      done = true;
    } else if (action.action === 'error') {
      this.progress.fail(new Error(action.error));
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
      done = true;
    } else if (action.action === 'execute') {
      this.progress.transitionTo(ExecutionPhase.EXECUTING, {
        code: action.code.substring(0, 100)
      });

      onUpdate?.({
        type: 'executing',
        code: action.code,
        explanation: action.explanation,
        iteration
      });

      const execResult = await tracker.track('code_execution', async () => {
        return await this.codeExecutor.execute(tabId, action.code);
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

      // Get updated page info and send to LLM
      this.progress.transitionTo(ExecutionPhase.OBSERVING);
      const updatedPageInfo = await PageAnalyzer.getPromptContext(tabId);

      const resultMessage = execResult.success
        ? `Code executed successfully.\nReturn value: ${JSON.stringify(execResult.result, null, 2) ?? 'undefined'}\n\nUpdated page URL: ${updatedPageInfo.url}\nUpdated page title: ${updatedPageInfo.title}`
        : `Code execution failed.\nError: ${execResult.error}\n${execResult.stack || ''}`;

      this.conversationHistory.push({
        role: 'user',
        content: resultMessage
      });
    }

    return { results, done };
  }

  /**
   * Handle abort
   */
  handleAbort(results, onUpdate) {
    const error = new AbortError('Agent execution stopped by user');
    this.progress.fail(error);
    onUpdate?.({
      type: 'error',
      message: 'Agent execution stopped by user'
    });
    results.push({ type: 'error', message: 'Stopped by user' });
    return this.buildResult(results);
  }

  /**
   * Build final result object
   */
  buildResult(results) {
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
  }

  /**
   * Execute raw code directly
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
        return await this.codeExecutor.execute(tabId, code);
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

  /**
   * Get rate limiter stats
   */
  getRateLimitStats() {
    return this.codeExecutor.getRateLimitStats();
  }
}