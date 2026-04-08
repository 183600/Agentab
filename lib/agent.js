// lib/agent.js - AI Agent logic

import { apiClient } from './api-client.js';
import { PageAnalyzer } from './page-analyzer.js';
import { ExecutionError, AbortError } from './errors.js';
import { SandboxExecutor } from './sandbox.js';

/**
 * AgentExecutor - Main agent execution logic
 */
export class AgentExecutor {
  constructor(options = {}) {
    this.maxIterations = options.maxIterations || 10;
    this.conversationHistory = [];
    this.abortController = null;
    this.isRunning = false;
    this.sandbox = new SandboxExecutor();
  }

  /**
   * Stop current execution
   */
  stop() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.isRunning = false;
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
      // Validate code using sandbox
      const validation = this.sandbox.validate(code);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      // Execute in page context
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: (codeStr) => {
          try {
            // Execute using async IIFE
            const asyncCode = `(async () => { ${codeStr} })()`;
            const result = eval(asyncCode);
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

      // Handle promise results
      if (result instanceof Promise) {
        try {
          const resolved = await Promise.race([
            result,
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Promise timeout')), 30000)
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
    // Setup abort controller
    this.abortController = new AbortController();
    this.isRunning = true;
    this.conversationHistory = [];

    // Get page info
    const pageInfo = await PageAnalyzer.getPromptContext(tabId);
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
        onUpdate?.({
          type: 'error',
          message: 'Agent execution stopped by user'
        });
        results.push({ type: 'error', message: 'Stopped by user' });
        break;
      }

      iteration++;
      onUpdate?.({
        type: 'thinking',
        iteration,
        message: `Agent is thinking (step ${iteration})...`
      });

      // Call LLM
      let llmResponse;
      try {
        llmResponse = await apiClient.chatCompletion(
          [systemMessage, ...this.conversationHistory],
          { signal: this.abortController?.signal }
        );
      } catch (error) {
        if (error instanceof AbortError) {
          onUpdate?.({
            type: 'error',
            message: 'Agent execution stopped by user'
          });
          results.push({ type: 'error', message: 'Stopped by user' });
          break;
        }

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

      // Parse response
      let action;
      try {
        action = this.parseResponse(llmResponse);
      } catch (error) {
        onUpdate?.({
          type: 'error',
          message: `Failed to parse response: ${error.message}`,
          raw: llmResponse
        });
        results.push({
          type: 'parse_error',
          message: error.message,
          raw: llmResponse
        });
        break;
      }

      // Handle different action types
      if (action.action === 'complete') {
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
        break;
      }

      if (action.action === 'error') {
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
        break;
      }

      if (action.action === 'execute') {
        onUpdate?.({
          type: 'executing',
          code: action.code,
          explanation: action.explanation,
          iteration
        });

        // Execute code
        const execResult = await this.executeCode(tabId, action.code);

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
      onUpdate?.({
        type: 'error',
        message: `Agent reached maximum iterations (${this.maxIterations})`
      });
    }

    return results;
  }

  /**
   * Execute raw code directly
   * @param {number} tabId - Tab ID
   * @param {string} code - Code to execute
   * @param {Function} onUpdate - Update callback
   * @returns {Promise<Array>}
   */
  async runCode(tabId, code, onUpdate) {
    onUpdate?.({
      type: 'executing',
      code,
      explanation: 'Executing code'
    });

    const result = await this.executeCode(tabId, code);

    onUpdate?.({
      type: result.success ? 'complete' : 'error',
      code,
      result,
      message: result.success
        ? `Code executed successfully. Result: ${JSON.stringify(result.result)}`
        : `Execution failed: ${result.error}`
    });

    return [{
      type: result.success ? 'execution' : 'error',
      code,
      result
    }];
  }
}
