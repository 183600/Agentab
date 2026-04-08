// background/background.js - Service Worker

import { StorageManager } from '../lib/storage.js';

// Open side panel when clicking the extension icon
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

// Set side panel behavior
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// ===== LLM Agent =====

class AgentExecutor {
  constructor() {
    this.conversationHistory = [];
    this.maxIterations = 10;
  }

  /**
   * Get system prompt for the agent
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
   * Call the LLM API
   */
  async callLLM(messages) {
    const apiKey = await StorageManager.getApiKey();
    const baseUrl = await StorageManager.getApiBaseUrl();
    const model = await StorageManager.getModel();

    if (!apiKey) {
      throw new Error('API key not configured. Please set it in the extension settings.');
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        temperature: 0.1,
        max_tokens: 4096
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`LLM API error (${response.status}): ${error}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  /**
   * Parse LLM response to extract JSON action
   */
  parseResponse(text) {
    // Try to extract JSON from code blocks
    const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
      try {
        return JSON.parse(codeBlockMatch[1].trim());
      } catch (e) {
        // Fall through
      }
    }

    // Try to parse the entire response as JSON
    try {
      return JSON.parse(text.trim());
    } catch (e) {
      // Fall through
    }

    // Try to find JSON object in the text
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (e) {
        // Fall through
      }
    }

    throw new Error('Could not parse LLM response as JSON: ' + text.substring(0, 200));
  }

  /**
   * Execute code on the active tab
   */
  async executeOnTab(tabId, code) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: (codeStr) => {
          try {
            // Wrap in async IIFE to support await
            const asyncCode = `(async () => { ${codeStr} })()`;
            return eval(asyncCode);
          } catch (e) {
            return { __error: true, message: e.message, stack: e.stack };
          }
        },
        args: [code],
        world: 'MAIN'
      });

      const result = results[0]?.result;
      
      if (result && typeof result === 'object' && result.__error) {
        return { success: false, error: result.message, stack: result.stack };
      }

      // Handle promise results
      if (result instanceof Promise) {
        const resolved = await result;
        return { success: true, result: resolved };
      }

      return { success: true, result };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * Get current page info
   */
  async getPageInfo(tabId) {
    try {
      const tab = await chrome.tabs.get(tabId);
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => ({
          url: window.location.href,
          title: document.title,
          bodyText: document.body?.innerText?.substring(0, 2000) || '',
          forms: Array.from(document.forms).map(f => ({
            action: f.action,
            method: f.method,
            inputs: Array.from(f.elements).map(el => ({
              type: el.type,
              name: el.name,
              id: el.id,
              placeholder: el.placeholder
            })).filter(el => el.name || el.id)
          })),
          links: Array.from(document.querySelectorAll('a[href]')).slice(0, 20).map(a => ({
            text: a.textContent?.trim().substring(0, 50),
            href: a.href
          })),
          buttons: Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"]')).map(b => ({
            text: b.textContent?.trim() || b.value,
            id: b.id,
            type: b.type
          }))
        }),
        world: 'MAIN'
      });

      return {
        url: tab.url,
        title: tab.title,
        ...(results[0]?.result || {})
      };
    } catch (e) {
      return {
        url: 'unknown',
        title: 'unknown',
        error: e.message
      };
    }
  }

  /**
   * Run the agent loop for a prompt
   */
  async runPrompt(tabId, prompt, onUpdate) {
    this.conversationHistory = [];
    const pageInfo = await this.getPageInfo(tabId);

    const systemMessage = {
      role: 'system',
      content: this.getSystemPrompt(pageInfo)
    };

    this.conversationHistory.push({
      role: 'user',
      content: `Task: ${prompt}\n\nCurrent page structure:\n- Forms: ${JSON.stringify(pageInfo.forms || [])}\n- Buttons: ${JSON.stringify(pageInfo.buttons || [])}\n- Links (first 20): ${JSON.stringify(pageInfo.links || [])}\n- Page text (first 2000 chars): ${pageInfo.bodyText?.substring(0, 2000) || 'N/A'}`
    });

    let iteration = 0;
    const results = [];

    while (iteration < this.maxIterations) {
      iteration++;
      onUpdate?.({
        type: 'thinking',
        iteration,
        message: `Agent is thinking (step ${iteration})...`
      });

      // Call LLM
      let llmResponse;
      try {
        llmResponse = await this.callLLM([systemMessage, ...this.conversationHistory]);
      } catch (e) {
        onUpdate?.({
          type: 'error',
          message: `LLM call failed: ${e.message}`
        });
        results.push({ type: 'error', message: e.message });
        break;
      }

      this.conversationHistory.push({
        role: 'assistant',
        content: llmResponse
      });

      // Parse response
      let action;
      try {
        action = this.parseResponse(llmResponse);
      } catch (e) {
        onUpdate?.({
          type: 'error',
          message: `Failed to parse response: ${e.message}`,
          raw: llmResponse
        });
        results.push({ type: 'parse_error', message: e.message, raw: llmResponse });
        break;
      }

      if (action.action === 'complete') {
        onUpdate?.({
          type: 'complete',
          message: action.result,
          explanation: action.explanation
        });
        results.push({ type: 'complete', result: action.result, explanation: action.explanation });
        break;
      }

      if (action.action === 'error') {
        onUpdate?.({
          type: 'error',
          message: action.error,
          explanation: action.explanation
        });
        results.push({ type: 'error', message: action.error, explanation: action.explanation });
        break;
      }

      if (action.action === 'execute') {
        onUpdate?.({
          type: 'executing',
          code: action.code,
          explanation: action.explanation,
          iteration
        });

        // Execute the code
        const execResult = await this.executeOnTab(tabId, action.code);

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
        const updatedPageInfo = await this.getPageInfo(tabId);

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

    if (iteration >= this.maxIterations) {
      onUpdate?.({
        type: 'error',
        message: `Agent reached maximum iterations (${this.maxIterations})`
      });
    }

    return results;
  }

  /**
   * Execute raw JS code directly
   */
  async runCode(tabId, code, onUpdate) {
    onUpdate?.({
      type: 'executing',
      code,
      explanation: 'Executing saved code task'
    });

    const result = await this.executeOnTab(tabId, code);

    onUpdate?.({
      type: result.success ? 'complete' : 'error',
      code,
      result,
      message: result.success
        ? `Code executed successfully. Result: ${JSON.stringify(result.result)}`
        : `Execution failed: ${result.error}`
    });

    return [{ type: result.success ? 'execution' : 'error', code, result }];
  }
}

const agent = new AgentExecutor();

// ===== Message Handling =====

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse).catch(err => {
    sendResponse({ error: err.message });
  });
  return true; // Keep channel open for async
});

async function handleMessage(message, sender) {
  switch (message.action) {
    case 'execute_prompt': {
      const tab = await getActiveTab();
      if (!tab) throw new Error('No active tab found');

      const updates = [];
      const results = await agent.runPrompt(tab.id, message.prompt, (update) => {
        updates.push(update);
        // Send real-time updates to popup
        chrome.runtime.sendMessage({
          action: 'agent_update',
          update
        }).catch(() => {}); // Ignore if popup is closed
      });

      await StorageManager.addHistory({
        type: 'prompt',
        input: message.prompt,
        results,
        tabUrl: tab.url,
        tabTitle: tab.title
      });

      return { success: true, results, updates };
    }

    case 'execute_code': {
      const tab = await getActiveTab();
      if (!tab) throw new Error('No active tab found');

      const updates = [];
      const results = await agent.runCode(tab.id, message.code, (update) => {
        updates.push(update);
        chrome.runtime.sendMessage({
          action: 'agent_update',
          update
        }).catch(() => {});
      });

      await StorageManager.addHistory({
        type: 'code',
        input: message.code,
        results,
        tabUrl: tab.url,
        tabTitle: tab.title
      });

      return { success: true, results, updates };
    }

    case 'execute_task': {
      const tasks = await StorageManager.getTasks();
      const task = tasks.find(t => t.id === message.taskId);
      if (!task) throw new Error('Task not found');

      await StorageManager.recordExecution(task.id);

      if (task.type === 'prompt') {
        return handleMessage({ action: 'execute_prompt', prompt: task.content }, sender);
      } else {
        return handleMessage({ action: 'execute_code', code: task.content }, sender);
      }
    }

    case 'save_task': {
      const task = await StorageManager.saveTask(message.task);
      return { success: true, task };
    }

    case 'get_tasks': {
      const tasks = await StorageManager.getTasks();
      return { success: true, tasks };
    }

    case 'delete_task': {
      const deleted = await StorageManager.deleteTask(message.taskId);
      return { success: true, deleted };
    }

    case 'update_task': {
      const updated = await StorageManager.updateTask(message.taskId, message.updates);
      return { success: true, task: updated };
    }

    case 'get_settings': {
      const apiKey = await StorageManager.getApiKey();
      const apiBaseUrl = await StorageManager.getApiBaseUrl();
      const model = await StorageManager.getModel();
      return { success: true, settings: { apiKey, apiBaseUrl, model } };
    }

    case 'save_settings': {
      if (message.settings.apiKey !== undefined) {
        await StorageManager.saveApiKey(message.settings.apiKey);
      }
      if (message.settings.apiBaseUrl !== undefined) {
        await StorageManager.saveApiBaseUrl(message.settings.apiBaseUrl);
      }
      if (message.settings.model !== undefined) {
        await StorageManager.saveModel(message.settings.model);
      }
      return { success: true };
    }

    case 'get_history': {
      const history = await StorageManager.getHistory();
      return { success: true, history };
    }

    case 'clear_history': {
      await StorageManager.clearHistory();
      return { success: true };
    }

    default:
      throw new Error(`Unknown action: ${message.action}`);
  }
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// Context menu for quick actions
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'chrome-agent-execute',
    title: 'Execute with Chrome Agent',
    contexts: ['selection']
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'chrome-agent-execute' && info.selectionText) {
    const updates = [];
    await agent.runPrompt(tab.id, info.selectionText, (update) => {
      updates.push(update);
      chrome.runtime.sendMessage({
        action: 'agent_update',
        update
      }).catch(() => {});
    });
  }
});
