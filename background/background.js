// background/background.js - Service Worker

import { StorageManager } from '../lib/storage.js';
import { MCPManager } from '../lib/mcp-client.js';
import { MCPServer, createAgentabTools } from '../lib/mcp-server.js';

// Initialize MCP Manager (client side - connecting to external MCP servers)
const mcpManager = new MCPManager();

// Initialize MCP Server (server side - exposing tools to external clients)
const mcpServer = new MCPServer({
  name: 'Agentab',
  version: '1.0.0'
});

// Initialize MCP connections on startup
async function initMCPConnections() {
  try {
    const servers = await StorageManager.getEnabledMCPServers();
    const results = await mcpManager.reconnectAll(servers);
    console.log('MCP connections initialized:', results);
  } catch (e) {
    console.error('Failed to initialize MCP connections:', e);
  }
}

initMCPConnections();

// Open side panel when clicking the extension icon
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

// ===== LLM Agent =====

class AgentExecutor {
  constructor() {
    this.conversationHistory = [];
    this.maxIterations = 10;
  }

  /**
   * Get builtin tools description for system prompt
   */
  getBuiltinToolsDescription() {
    return `
## Built-in Tools:
You have access to these built-in tools for managing tasks and settings:

- save_task: Save a new task/tool for later reuse. MUST USE when user says "保存", "save", "创建工具", "保存工具" etc.
  (params: name, type, content, description, autoRunSites)
- get_tasks: Get all saved tasks. (params: type)
- update_task: Update an existing task. (params: taskId, name, type, content, description, autoRunSites)
- delete_task: Delete a task. (params: taskId)
- execute_task: Execute a saved task on current tab. (params: taskId)
- get_history: Get execution history. (params: limit)
- clear_history: Clear execution history. (params: none)

### IMPORTANT: When to use save_task vs execute
- If user says "保存一个...工具" or "save a tool that...", USE save_task directly. DO NOT execute code first.
- If user says "执行..." or "运行...", then use execute action.
- When saving a tool, the "content" should be the CODE itself, not the result of running the code.

### Example: User says "保存一个让网页变白的工具"
Correct response (ONLY save, do NOT execute):
\`\`\`json
{
  "action": "builtin_call",
  "tool": "save_task",
  "args": {
    "name": "网页变白",
    "type": "code",
    "content": "document.body.style.backgroundColor = 'white'; document.body.style.color = 'black';",
    "description": "将网页背景变为白色，文字变为黑色"
  },
  "explanation": "保存一个让网页变白的工具供以后使用"
}
\`\`\`

### Example: User says "让网页变白"
Correct response (execute directly):
\`\`\`json
{
  "action": "execute",
  "code": "document.body.style.backgroundColor = 'white'; document.body.style.color = 'black';",
  "explanation": "将网页背景变为白色"
}
\`\`\`

For save_task tool parameters:
- name: A descriptive name for the task (short, e.g., "网页变白", "自动登录")
- type: "prompt" for natural language instructions, or "code" for JavaScript code
- content: The prompt text or JavaScript code to save (NOT the execution result)
- description: Optional description of what the task does
- autoRunSites: Optional array of URL patterns where this task should auto-run (e.g. ["*.example.com"])
`;
  }

  /**
   * Get MCP tools description for system prompt
   */
  async getMCPToolsDescription() {
    const tools = mcpManager.getAllTools();
    if (tools.length === 0) return '';
    
    const toolDescriptions = tools.map(t => {
      const schema = t.inputSchema || { type: 'object', properties: {} };
      const params = schema.properties ? Object.keys(schema.properties).join(', ') : 'none';
      return `- ${t.name}: ${t.description}${params !== 'none' ? ` (params: ${params})` : ''}`;
    }).join('\n');
    
    return `
## MCP Tools Available:
You have access to external tools via MCP (Model Context Protocol). Use these tools when needed:

${toolDescriptions}

To use an MCP tool:
\`\`\`json
{
  "action": "mcp_call",
  "tool": "server:tool_name",
  "args": { "param1": "value1" },
  "explanation": "Why you're calling this tool"
}
\`\`\`
`;
  }

  /**
   * Get system prompt for the agent
   */
  async getSystemPrompt(pageInfo) {
    const mcpToolsDesc = await this.getMCPToolsDescription();
    const builtinToolsDesc = this.getBuiltinToolsDescription();
    
    return `You are a Chrome browser automation agent. You control web pages by generating JavaScript code.

## Current Page Info:
- URL: ${pageInfo.url}
- Title: ${pageInfo.title}

## Your Capabilities:
You can execute JavaScript code in the context of the current web page. The code runs with full DOM access.
${builtinToolsDesc}
${mcpToolsDesc}
## Response Format:
You MUST respond with a JSON object in one of these formats:

1. To call a built-in tool (save_task, get_tasks, etc.):
\`\`\`json
{
  "action": "builtin_call",
  "tool": "save_task",
  "args": { "name": "...", "type": "...", "content": "..." },
  "explanation": "Why you're calling this tool"
}
\`\`\`

2. To execute JavaScript code:
\`\`\`json
{
  "action": "execute",
  "code": "// your JavaScript code here",
  "explanation": "What this code does"
}
\`\`\`

3. To call an MCP tool:
\`\`\`json
{
  "action": "mcp_call",
  "tool": "server:tool_name",
  "args": { "param": "value" },
  "explanation": "Why you're calling this tool"
}
\`\`\`

4. When the task is complete:
\`\`\`json
{
  "action": "complete",
  "result": "Summary of what was accomplished",
  "explanation": "Final explanation"
}
\`\`\`

5. If the task cannot be completed:
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
10. Always explain what you're doing
11. Use MCP tools when they can help accomplish the task more efficiently
12. **CRITICAL: When user says "保存" or "save" a tool, use builtin_call with save_task. DO NOT execute code first.**`;
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
    // Method 1: Try to extract JSON from code blocks with better handling
    // Find the first ```json or ``` and the LAST ``` to handle nested code blocks
    // This handles cases where the JSON content itself contains ``` characters
    const firstCodeBlock = text.match(/```(?:json)?\s*\n?/);
    if (firstCodeBlock) {
      const startIndex = firstCodeBlock.index + firstCodeBlock[0].length;
      // Find the LAST occurrence of ```
      const lastTripleBacktick = text.lastIndexOf('```');
      if (lastTripleBacktick > startIndex) {
        const jsonContent = text.substring(startIndex, lastTripleBacktick).trim();
        try {
          return JSON.parse(jsonContent);
        } catch (e) {
          // Fall through to other methods
        }
      }
    }

    // Method 2: Try to parse the entire response as JSON
    try {
      return JSON.parse(text.trim());
    } catch (e) {
      // Fall through
    }

    // Method 3: Try to find JSON object in the text
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
   * Handle built-in tool calls
   */
  async handleBuiltinTool(toolName, args) {
    switch (toolName) {
      case 'save_task': {
        if (!args.name || !args.type || !args.content) {
          throw new Error('save_task requires name, type, and content parameters');
        }
        const task = await StorageManager.saveTask({
          name: args.name,
          type: args.type,
          content: args.content,
          description: args.description || '',
          autoRunSites: args.autoRunSites || []
        });
        return { success: true, task };
      }

      case 'get_tasks': {
        let tasks = await StorageManager.getTasks();
        if (args.type && args.type !== 'all') {
          tasks = tasks.filter(t => t.type === args.type);
        }
        return { tasks };
      }

      case 'update_task': {
        if (!args.taskId) {
          throw new Error('update_task requires taskId parameter');
        }
        const { taskId, ...updates } = args;
        const task = await StorageManager.updateTask(taskId, updates);
        if (!task) {
          throw new Error('Task not found');
        }
        return { success: true, task };
      }

      case 'delete_task': {
        if (!args.taskId) {
          throw new Error('delete_task requires taskId parameter');
        }
        const deleted = await StorageManager.deleteTask(args.taskId);
        return { success: deleted, deleted };
      }

      case 'execute_task': {
        if (!args.taskId) {
          throw new Error('execute_task requires taskId parameter');
        }
        const tasks = await StorageManager.getTasks();
        const task = tasks.find(t => t.id === args.taskId);
        if (!task) {
          throw new Error('Task not found');
        }
        // Return info about the task (actual execution happens separately)
        return { success: true, task, message: 'Task found. Use execute action to run it.' };
      }

      case 'get_history': {
        let history = await StorageManager.getHistory();
        if (args.limit) {
          history = history.slice(0, args.limit);
        }
        return { history };
      }

      case 'clear_history': {
        await StorageManager.clearHistory();
        return { success: true };
      }

      default:
        throw new Error(`Unknown built-in tool: ${toolName}`);
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
      content: await this.getSystemPrompt(pageInfo)
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

      if (action.action === 'mcp_call') {
        onUpdate?.({
          type: 'executing',
          code: `MCP Tool: ${action.tool}`,
          explanation: action.explanation || `Calling MCP tool: ${action.tool}`,
          iteration
        });

        try {
          const mcpResult = await mcpManager.callTool(action.tool, action.args || {});
          
          results.push({
            type: 'mcp_call',
            tool: action.tool,
            args: action.args,
            result: mcpResult,
            explanation: action.explanation,
            iteration
          });

          onUpdate?.({
            type: 'executed',
            code: `MCP Tool: ${action.tool}`,
            result: { success: true, result: mcpResult },
            iteration
          });

          this.conversationHistory.push({
            role: 'user',
            content: `MCP tool "${action.tool}" executed successfully.\nResult: ${JSON.stringify(mcpResult, null, 2)}`
          });
        } catch (e) {
          onUpdate?.({
            type: 'error',
            message: `MCP call failed: ${e.message}`
          });
          
          results.push({
            type: 'mcp_error',
            tool: action.tool,
            error: e.message,
            iteration
          });

          this.conversationHistory.push({
            role: 'user',
            content: `MCP tool "${action.tool}" failed.\nError: ${e.message}`
          });
        }
        continue;
      }

      if (action.action === 'builtin_call') {
        onUpdate?.({
          type: 'executing',
          code: `Built-in Tool: ${action.tool}`,
          explanation: action.explanation || `Calling built-in tool: ${action.tool}`,
          iteration
        });

        try {
          const builtinResult = await this.handleBuiltinTool(action.tool, action.args || {});

          results.push({
            type: 'builtin_call',
            tool: action.tool,
            args: action.args,
            result: builtinResult,
            explanation: action.explanation,
            iteration
          });

          onUpdate?.({
            type: 'executed',
            code: `Built-in Tool: ${action.tool}`,
            result: { success: true, result: builtinResult },
            iteration
          });

          this.conversationHistory.push({
            role: 'user',
            content: `Built-in tool "${action.tool}" executed successfully.\nResult: ${JSON.stringify(builtinResult, null, 2)}`
          });
        } catch (e) {
          onUpdate?.({
            type: 'error',
            message: `Built-in tool call failed: ${e.message}`
          });

          results.push({
            type: 'builtin_error',
            tool: action.tool,
            error: e.message,
            iteration
          });

          this.conversationHistory.push({
            role: 'user',
            content: `Built-in tool "${action.tool}" failed.\nError: ${e.message}`
          });
        }
        continue;
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

// ===== MCP Server Setup =====

// Register Agentab tools on the MCP Server
const agentabTools = createAgentabTools(StorageManager, agent);
mcpServer.registerTools(agentabTools);

// Start MCP Server
mcpServer.start();

// Log registered tools
console.log('MCP Server tools:', mcpServer.getToolDefinitions().map(t => t.name));

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

    // ===== MCP Server Management =====

    case 'get_mcp_servers': {
      const servers = await StorageManager.getMCPServers();
      return { success: true, servers };
    }

    case 'save_mcp_server': {
      const server = await StorageManager.saveMCPServer(message.server);
      // Try to connect to the new server if enabled
      if (server.enabled) {
        try {
          await mcpManager.addServer(server);
        } catch (e) {
          console.error('Failed to connect to new MCP server:', e);
        }
      }
      return { success: true, server };
    }

    case 'update_mcp_server': {
      const updated = await StorageManager.updateMCPServer(message.serverId, message.updates);
      if (updated) {
        // Reconnect if enabled
        mcpManager.removeServer(updated.name);
        if (updated.enabled) {
          try {
            await mcpManager.addServer(updated);
          } catch (e) {
            console.error('Failed to reconnect MCP server:', e);
          }
        }
      }
      return { success: true, server: updated };
    }

    case 'delete_mcp_server': {
      const servers = await StorageManager.getMCPServers();
      const server = servers.find(s => s.id === message.serverId);
      if (server) {
        mcpManager.removeServer(server.name);
      }
      const deleted = await StorageManager.deleteMCPServer(message.serverId);
      return { success: true, deleted };
    }

    case 'get_mcp_status': {
      const statuses = {};
      const servers = await StorageManager.getMCPServers();
      for (const server of servers) {
        const client = mcpManager.getClient(server.name);
        if (client && client.connected) {
          statuses[server.id] = {
            connected: true,
            tools: client.tools,
            resources: client.resources,
            prompts: client.prompts
          };
        } else {
          statuses[server.id] = {
            connected: false,
            error: 'Not connected'
          };
        }
      }
      return { success: true, statuses };
    }

    case 'mcp_call_tool': {
      const result = await mcpManager.callTool(message.tool, message.args || {});
      return { success: true, result };
    }

    case 'mcp_reconnect_all': {
      const servers = await StorageManager.getEnabledMCPServers();
      const results = await mcpManager.reconnectAll(servers);
      return { success: true, results };
    }

    // ===== MCP Server (Server-side) =====

    case 'get_mcp_server_info': {
      return { success: true, info: mcpServer.getServerInfo() };
    }

    case 'get_mcp_server_tools': {
      return { success: true, tools: mcpServer.getToolDefinitions() };
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

// ===== Auto-run Tasks =====

/**
 * Check if URL matches any pattern in the list
 */
function urlMatchesPatterns(url, patterns) {
  const urlObj = new URL(url);
  const hostname = urlObj.hostname;
  const fullUrl = urlObj.href;

  for (const pattern of patterns) {
    // 处理通配符模式
    if (pattern.includes('*')) {
      // 将通配符模式转换为正则表达式
      // 支持 *.example.com 和 https://*.example.com/*
      let regexPattern = pattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*');
      
      // 如果模式不以协议开头，匹配任何协议
      if (!pattern.startsWith('http://') && !pattern.startsWith('https://')) {
        regexPattern = 'https?://' + regexPattern;
      }
      
      // 如果模式不以路径结尾，匹配任何路径
      if (!pattern.includes('/')) {
        regexPattern = regexPattern + '(/.*)?';
      }

      try {
        const regex = new RegExp(`^${regexPattern}$`, 'i');
        if (regex.test(fullUrl) || regex.test(hostname)) {
          return true;
        }
      } catch (e) {
        console.error('Invalid pattern:', pattern, e);
      }
    } else {
      // 精确匹配
      if (hostname === pattern || fullUrl === pattern || fullUrl.startsWith(pattern)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Find tasks that should auto-run on a URL
 */
async function findAutoRunTasks(url) {
  const tasks = await StorageManager.getTasks();
  return tasks.filter(task => {
    if (!task.autoRunSites || task.autoRunSites.length === 0) return false;
    return urlMatchesPatterns(url, task.autoRunSites);
  });
}

/**
 * Execute auto-run tasks for a tab
 */
async function executeAutoRunTasks(tabId, url) {
  const tasks = await findAutoRunTasks(url);
  
  for (const task of tasks) {
    console.log(`Auto-running task "${task.name}" on ${url}`);
    
    // 记录执行
    await StorageManager.recordExecution(task.id);
    
    // 执行任务
    try {
      if (task.type === 'prompt') {
        await agent.runPrompt(tabId, task.content, (update) => {
          // 可以选择发送通知或记录日志
          console.log(`Auto-run update:`, update.type);
        });
      } else {
        await agent.runCode(tabId, task.content, (update) => {
          console.log(`Auto-run update:`, update.type);
        });
      }
    } catch (e) {
      console.error(`Auto-run task "${task.name}" failed:`, e);
    }
  }
}

// 监听页面加载完成事件
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // 只在页面加载完成时触发
  if (changeInfo.status === 'complete' && tab.url) {
    // 排除 chrome:// 和 edge:// 等特殊页面
    if (tab.url.startsWith('chrome://') || 
        tab.url.startsWith('edge://') || 
        tab.url.startsWith('about:') ||
        tab.url.startsWith('chrome-extension://')) {
      return;
    }
    
    try {
      await executeAutoRunTasks(tabId, tab.url);
    } catch (e) {
      console.error('Auto-run error:', e);
    }
  }
});

// 监听新标签页创建（处理用户导航而非刷新的情况）
chrome.webNavigation?.onCompleted?.addListener(async (details) => {
  if (details.frameId !== 0) return; // 只处理主框架
  
  const tab = await chrome.tabs.get(details.tabId);
  if (tab && tab.url) {
    // 排除特殊页面
    if (tab.url.startsWith('chrome://') || 
        tab.url.startsWith('edge://') || 
        tab.url.startsWith('about:') ||
        tab.url.startsWith('chrome-extension://')) {
      return;
    }
    
    try {
      await executeAutoRunTasks(details.tabId, tab.url);
    } catch (e) {
      console.error('Auto-run error:', e);
    }
  }
});
