// lib/mcp-server.js - MCP (Model Context Protocol) Server

/**
 * MCP Server for exposing Agentab tools to external MCP clients
 * Based on MCP specification: https://modelcontextprotocol.io/
 * 
 * This server can be accessed via:
 * 1. chrome.runtime.onMessageExternal - from other Chrome extensions
 * 2. Native Messaging - from local applications (requires native host setup)
 */
class MCPServer {
  constructor(config = {}) {
    this.name = config.name || 'Agentab';
    this.version = config.version || '1.0.0';
    this.protocolVersion = '2024-11-05';
    
    // Registered tools
    this.tools = new Map();
    // Registered resources
    this.resources = new Map();
    // Registered prompts
    this.prompts = new Map();
    
    // Active sessions
    this.sessions = new Map();
    
    // Tool handlers
    this.toolHandlers = new Map();
    
    // Bound message handler
    this._messageHandler = this._handleMessage.bind(this);
  }

  /**
   * Register a tool
   * @param {Object} tool - Tool definition
   * @param {Function} handler - Tool handler function
   */
  registerTool(tool, handler) {
    const toolDef = {
      name: tool.name,
      description: tool.description || '',
      inputSchema: tool.inputSchema || { type: 'object', properties: {} }
    };
    this.tools.set(tool.name, toolDef);
    this.toolHandlers.set(tool.name, handler);
  }

  /**
   * Register multiple tools
   * @param {Array} tools - Array of {tool, handler} objects
   */
  registerTools(tools) {
    for (const { tool, handler } of tools) {
      this.registerTool(tool, handler);
    }
  }

  /**
   * Register a resource
   * @param {Object} resource - Resource definition
   * @param {Function} handler - Resource read handler
   */
  registerResource(resource, handler) {
    this.resources.set(resource.uri, {
      ...resource,
      handler
    });
  }

  /**
   * Register a prompt
   * @param {Object} prompt - Prompt definition
   * @param {Function} handler - Prompt get handler
   */
  registerPrompt(prompt, handler) {
    this.prompts.set(prompt.name, {
      ...prompt,
      handler
    });
  }

  /**
   * Create JSON-RPC 2.0 response
   */
  _createResponse(id, result) {
    return {
      jsonrpc: '2.0',
      id,
      result
    };
  }

  /**
   * Create JSON-RPC 2.0 error response
   */
  _createError(id, code, message, data = null) {
    const error = { code, message };
    if (data !== null) error.data = data;
    return {
      jsonrpc: '2.0',
      id,
      error
    };
  }

  /**
   * Create JSON-RPC 2.0 notification
   */
  _createNotification(method, params = {}) {
    return {
      jsonrpc: '2.0',
      method,
      params
    };
  }

  /**
   * Handle JSON-RPC request
   */
  async _handleRequest(request, sender) {
    const { id, method, params } = request;

    // Handle notifications (no id)
    if (id === undefined) {
      return this._handleNotification(method, params, sender);
    }

    // Handle methods
    switch (method) {
      case 'initialize':
        return this._handleInitialize(id, params, sender);

      case 'tools/list':
        return this._handleToolsList(id);

      case 'tools/call':
        return this._handleToolsCall(id, params);

      case 'resources/list':
        return this._handleResourcesList(id);

      case 'resources/read':
        return this._handleResourcesRead(id, params);

      case 'prompts/list':
        return this._handlePromptsList(id);

      case 'prompts/get':
        return this._handlePromptsGet(id, params);

      case 'ping':
        return this._createResponse(id, {});

      default:
        return this._createError(id, -32601, `Method not found: ${method}`);
    }
  }

  /**
   * Handle notification
   */
  _handleNotification(method, params, sender) {
    switch (method) {
      case 'notifications/initialized':
        // Client has finished initialization
        const sessionId = sender?.id || 'default';
        if (this.sessions.has(sessionId)) {
          this.sessions.get(sessionId).initialized = true;
        }
        break;

      case 'notifications/cancelled':
        // Request cancelled by client
        break;

      default:
        console.warn(`Unknown notification: ${method}`);
    }
    return null; // No response for notifications
  }

  /**
   * Handle initialize request
   */
  _handleInitialize(id, params, sender) {
    const sessionId = sender?.id || Date.now().toString(36);
    
    // Store session info
    this.sessions.set(sessionId, {
      id: sessionId,
      clientInfo: params.clientInfo,
      clientCapabilities: params.capabilities,
      protocolVersion: params.protocolVersion,
      initialized: false,
      createdAt: new Date().toISOString()
    });

    return this._createResponse(id, {
      protocolVersion: this.protocolVersion,
      capabilities: {
        tools: { listChanged: false },
        resources: { subscribe: false, listChanged: false },
        prompts: { listChanged: false }
      },
      serverInfo: {
        name: this.name,
        version: this.version
      },
      sessionId
    });
  }

  /**
   * Handle tools/list request
   */
  _handleToolsList(id) {
    const tools = Array.from(this.tools.values());
    return this._createResponse(id, { tools });
  }

  /**
   * Handle tools/call request
   */
  async _handleToolsCall(id, params) {
    const { name, arguments: args } = params;

    const tool = this.tools.get(name);
    if (!tool) {
      return this._createError(id, -32602, `Tool not found: ${name}`);
    }

    const handler = this.toolHandlers.get(name);
    if (!handler) {
      return this._createError(id, -32603, `No handler for tool: ${name}`);
    }

    try {
      const result = await handler(args || {});
      
      // Format result as MCP content
      let content;
      if (result === undefined || result === null) {
        content = [{ type: 'text', text: 'Success' }];
      } else if (typeof result === 'string') {
        content = [{ type: 'text', text: result }];
      } else if (result.content) {
        // Already formatted as MCP content
        content = result.content;
      } else if (result.error) {
        // Error result
        return this._createError(id, -32000, result.error);
      } else {
        // JSON result
        content = [{ type: 'text', text: JSON.stringify(result, null, 2) }];
      }

      return this._createResponse(id, {
        content,
        isError: false
      });
    } catch (error) {
      return this._createError(id, -32000, error.message || String(error));
    }
  }

  /**
   * Handle resources/list request
   */
  _handleResourcesList(id) {
    const resources = Array.from(this.resources.values()).map(r => ({
      uri: r.uri,
      name: r.name,
      description: r.description,
      mimeType: r.mimeType
    }));
    return this._createResponse(id, { resources });
  }

  /**
   * Handle resources/read request
   */
  async _handleResourcesRead(id, params) {
    const { uri } = params;
    const resource = this.resources.get(uri);
    
    if (!resource) {
      return this._createError(id, -32602, `Resource not found: ${uri}`);
    }

    try {
      const content = await resource.handler(params);
      return this._createResponse(id, {
        contents: [{
          uri,
          mimeType: resource.mimeType || 'text/plain',
          text: typeof content === 'string' ? content : JSON.stringify(content)
        }]
      });
    } catch (error) {
      return this._createError(id, -32000, error.message);
    }
  }

  /**
   * Handle prompts/list request
   */
  _handlePromptsList(id) {
    const prompts = Array.from(this.prompts.values()).map(p => ({
      name: p.name,
      description: p.description,
      arguments: p.arguments || []
    }));
    return this._createResponse(id, { prompts });
  }

  /**
   * Handle prompts/get request
   */
  async _handlePromptsGet(id, params) {
    const { name, arguments: args } = params;
    const prompt = this.prompts.get(name);
    
    if (!prompt) {
      return this._createError(id, -32602, `Prompt not found: ${name}`);
    }

    try {
      const messages = await prompt.handler(args || {});
      return this._createResponse(id, {
        description: prompt.description,
        messages
      });
    } catch (error) {
      return this._createError(id, -32000, error.message);
    }
  }

  /**
   * Handle incoming message from chrome.runtime.onMessageExternal
   */
  async _handleMessage(message, sender, sendResponse) {
    // Validate JSON-RPC request
    if (!message || message.jsonrpc !== '2.0') {
      sendResponse(this._createError(null, -32600, 'Invalid Request'));
      return;
    }

    try {
      const response = await this._handleRequest(message, sender);
      if (response !== null) {
        sendResponse(response);
      }
    } catch (error) {
      sendResponse(this._createError(message.id, -32603, 'Internal error', error.message));
    }
  }

  /**
   * Start the MCP server
   * Listen for messages from external extensions and native messaging
   */
  start() {
    // Listen for messages from other extensions
    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessageExternal) {
      chrome.runtime.onMessageExternal.addListener(
        (message, sender, sendResponse) => {
          this._handleMessage(message, sender, sendResponse);
          return true; // Keep channel open for async response
        }
      );
    }

    console.log(`MCP Server "${this.name}" started`);
  }

  /**
   * Stop the MCP server
   */
  stop() {
    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessageExternal) {
      chrome.runtime.onMessageExternal.removeListener(this._messageHandler);
    }
    this.sessions.clear();
    console.log(`MCP Server "${this.name}" stopped`);
  }

  /**
   * Get server info
   */
  getServerInfo() {
    return {
      name: this.name,
      version: this.version,
      protocolVersion: this.protocolVersion,
      toolsCount: this.tools.size,
      resourcesCount: this.resources.size,
      promptsCount: this.prompts.size,
      sessionsCount: this.sessions.size
    };
  }

  /**
   * Get all registered tools (for documentation)
   */
  getToolDefinitions() {
    return Array.from(this.tools.values());
  }
}

/**
 * Create standard Agentab tools
 */
function createAgentabTools(storageManager, agentExecutor) {
  return [
    // Task Management Tools
    {
      tool: {
        name: 'save_task',
        description: 'Save a new task to Agentab. Tasks can be prompts (natural language) or code (JavaScript).',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Task name'
            },
            type: {
              type: 'string',
              enum: ['prompt', 'code'],
              description: 'Task type: "prompt" for natural language, "code" for JavaScript'
            },
            content: {
              type: 'string',
              description: 'Task content (prompt text or JavaScript code)'
            },
            description: {
              type: 'string',
              description: 'Optional task description'
            },
            autoRunSites: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional URLs for auto execution (supports wildcards like *.example.com)'
            }
          },
          required: ['name', 'type', 'content']
        }
      },
      handler: async (args) => {
        const task = await storageManager.saveTask({
          name: args.name,
          type: args.type,
          content: args.content,
          description: args.description,
          autoRunSites: args.autoRunSites
        });
        return { success: true, task };
      }
    },
    {
      tool: {
        name: 'get_tasks',
        description: 'Get all saved tasks from Agentab.',
        inputSchema: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['prompt', 'code', 'all'],
              description: 'Filter by task type (default: all)'
            }
          }
        }
      },
      handler: async (args) => {
        let tasks = await storageManager.getTasks();
        if (args.type && args.type !== 'all') {
          tasks = tasks.filter(t => t.type === args.type);
        }
        return { tasks };
      }
    },
    {
      tool: {
        name: 'update_task',
        description: 'Update an existing task in Agentab.',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: {
              type: 'string',
              description: 'Task ID to update'
            },
            name: {
              type: 'string',
              description: 'New task name'
            },
            type: {
              type: 'string',
              enum: ['prompt', 'code'],
              description: 'New task type'
            },
            content: {
              type: 'string',
              description: 'New task content'
            },
            description: {
              type: 'string',
              description: 'New task description'
            },
            autoRunSites: {
              type: 'array',
              items: { type: 'string' },
              description: 'New auto-run sites'
            }
          },
          required: ['taskId']
        }
      },
      handler: async (args) => {
        const { taskId, ...updates } = args;
        const task = await storageManager.updateTask(taskId, updates);
        if (!task) {
          return { error: 'Task not found' };
        }
        return { success: true, task };
      }
    },
    {
      tool: {
        name: 'delete_task',
        description: 'Delete a task from Agentab.',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: {
              type: 'string',
              description: 'Task ID to delete'
            }
          },
          required: ['taskId']
        }
      },
      handler: async (args) => {
        const deleted = await storageManager.deleteTask(args.taskId);
        return { success: deleted, deleted };
      }
    },
    {
      tool: {
        name: 'execute_task',
        description: 'Execute a saved task on the current active tab.',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: {
              type: 'string',
              description: 'Task ID to execute'
            }
          },
          required: ['taskId']
        }
      },
      handler: async (args) => {
        const tasks = await storageManager.getTasks();
        const task = tasks.find(t => t.id === args.taskId);
        if (!task) {
          return { error: 'Task not found' };
        }
        
        // Get active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) {
          return { error: 'No active tab found' };
        }

        await storageManager.recordExecution(task.id);
        
        const results = [];
        if (task.type === 'prompt') {
          await agentExecutor.runPrompt(tab.id, task.content, (update) => {
            results.push(update);
          });
        } else {
          await agentExecutor.runCode(tab.id, task.content, (update) => {
            results.push(update);
          });
        }
        
        return { success: true, results };
      }
    },
    {
      tool: {
        name: 'execute_prompt',
        description: 'Execute a natural language prompt on the current active tab.',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: 'Natural language prompt to execute'
            }
          },
          required: ['prompt']
        }
      },
      handler: async (args) => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) {
          return { error: 'No active tab found' };
        }

        const results = [];
        await agentExecutor.runPrompt(tab.id, args.prompt, (update) => {
          results.push(update);
        });
        
        return { success: true, results };
      }
    },
    {
      tool: {
        name: 'execute_code',
        description: 'Execute JavaScript code on the current active tab.',
        inputSchema: {
          type: 'object',
          properties: {
            code: {
              type: 'string',
              description: 'JavaScript code to execute'
            }
          },
          required: ['code']
        }
      },
      handler: async (args) => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) {
          return { error: 'No active tab found' };
        }

        const results = [];
        await agentExecutor.runCode(tab.id, args.code, (update) => {
          results.push(update);
        });
        
        return { success: true, results };
      }
    },
    // History Tools
    {
      tool: {
        name: 'get_history',
        description: 'Get execution history from Agentab.',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Maximum number of entries to return (default: 20)'
            }
          }
        }
      },
      handler: async (args) => {
        let history = await storageManager.getHistory();
        if (args.limit) {
          history = history.slice(0, args.limit);
        }
        return { history };
      }
    },
    {
      tool: {
        name: 'clear_history',
        description: 'Clear execution history from Agentab.',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      handler: async () => {
        await storageManager.clearHistory();
        return { success: true };
      }
    },
    // Settings Tools
    {
      tool: {
        name: 'get_settings',
        description: 'Get Agentab settings (API key is masked for security).',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      handler: async () => {
        const apiKey = await storageManager.getApiKey();
        const apiBaseUrl = await storageManager.getApiBaseUrl();
        const model = await storageManager.getModel();
        return {
          settings: {
            apiKey: apiKey ? '***masked***' : '',
            apiBaseUrl,
            model
          }
        };
      }
    },
    {
      tool: {
        name: 'update_settings',
        description: 'Update Agentab settings.',
        inputSchema: {
          type: 'object',
          properties: {
            apiKey: {
              type: 'string',
              description: 'API key for LLM'
            },
            apiBaseUrl: {
              type: 'string',
              description: 'API base URL'
            },
            model: {
              type: 'string',
              description: 'Model name'
            }
          }
        }
      },
      handler: async (args) => {
        if (args.apiKey !== undefined) {
          await storageManager.saveApiKey(args.apiKey);
        }
        if (args.apiBaseUrl !== undefined) {
          await storageManager.saveApiBaseUrl(args.apiBaseUrl);
        }
        if (args.model !== undefined) {
          await storageManager.saveModel(args.model);
        }
        return { success: true };
      }
    }
  ];
}

// Export for ES module
export { MCPServer, createAgentabTools };

// Make available globally
if (typeof globalThis !== 'undefined') {
  globalThis.MCPServer = MCPServer;
  globalThis.createAgentabTools = createAgentabTools;
}
