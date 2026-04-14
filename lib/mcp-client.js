// lib/mcp-client.js - MCP (Model Context Protocol) Client

/**
 * MCP Client for connecting to MCP servers
 * Supports HTTP/SSE and WebSocket transport
 * Based on MCP specification: https://modelcontextprotocol.io/
 */
class MCPClient {
  constructor(serverConfig) {
    this.serverConfig = serverConfig;
    this.serverUrl = serverConfig.url;
    this.serverName = serverConfig.name;
    this.transport = serverConfig.transport || 'http'; // 'http' | 'websocket'
    this.headers = serverConfig.headers || {};
    this.timeout = serverConfig.timeout || 30000;
    
    this.connected = false;
    this.sessionId = null;
    this.serverInfo = null;
    this.capabilities = null;
    this.tools = [];
    this.resources = [];
    this.prompts = [];
    
    this._requestId = 0;
    this._eventSource = null;
    this._websocket = null;
    this._pendingRequests = new Map();
  }

  /**
   * Generate unique request ID
   */
  _generateRequestId() {
    return ++this._requestId;
  }

  /**
   * Create JSON-RPC 2.0 request
   */
  _createRequest(method, params = {}) {
    return {
      jsonrpc: '2.0',
      id: this._generateRequestId(),
      method,
      params
    };
  }

  /**
   * Send request and wait for response
   */
  async _sendRequest(request) {
    if (this.transport === 'websocket') {
      return this._sendWebSocketRequest(request);
    } else {
      return this._sendHttpRequest(request);
    }
  }

  /**
   * Send HTTP request
   */
  async _sendHttpRequest(request) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(this.serverUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.headers
        },
        body: JSON.stringify(request),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error.message || JSON.stringify(data.error));
      }

      return data.result;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw error;
    }
  }

  /**
   * Send WebSocket request
   */
  async _sendWebSocketRequest(request) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this._pendingRequests.delete(request.id);
        reject(new Error('Request timeout'));
      }, this.timeout);

      this._pendingRequests.set(request.id, { resolve, reject, timeoutId });

      if (this._websocket && this._websocket.readyState === WebSocket.OPEN) {
        this._websocket.send(JSON.stringify(request));
      } else {
        clearTimeout(timeoutId);
        this._pendingRequests.delete(request.id);
        reject(new Error('WebSocket not connected'));
      }
    });
  }

  /**
   * Initialize WebSocket connection
   */
  async _initWebSocket() {
    return new Promise((resolve, reject) => {
      this._websocket = new WebSocket(this.serverUrl);
      
      this._websocket.onopen = () => {
        resolve();
      };

      this._websocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.id && this._pendingRequests.has(data.id)) {
            const { resolve: res, timeoutId } = this._pendingRequests.get(data.id);
            clearTimeout(timeoutId);
            this._pendingRequests.delete(data.id);
            if (data.error) {
              res({ error: data.error });
            } else {
              res(data.result);
            }
          }
        } catch (e) {
          console.error('WebSocket message parse error:', e);
        }
      };

      this._websocket.onerror = (error) => {
        reject(new Error('WebSocket connection failed'));
      };

      this._websocket.onclose = () => {
        this.connected = false;
        // Reject all pending requests
        for (const [id, { reject: rej, timeoutId }] of this._pendingRequests) {
          clearTimeout(timeoutId);
          rej(new Error('WebSocket closed'));
        }
        this._pendingRequests.clear();
      };
    });
  }

  /**
   * Connect to MCP server and initialize
   */
  async connect() {
    try {
      // Initialize WebSocket if needed
      if (this.transport === 'websocket') {
        await this._initWebSocket();
      }

      // Send initialize request
      const initRequest = this._createRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {
          roots: { listChanged: true },
          sampling: {}
        },
        clientInfo: {
          name: 'Agentab',
          version: '1.0.0'
        }
      });

      const initResult = await this._sendRequest(initRequest);
      
      this.serverInfo = initResult.serverInfo;
      this.capabilities = initResult.capabilities;
      this.sessionId = initResult.sessionId;
      
      // Send initialized notification
      const initializedNotification = {
        jsonrpc: '2.0',
        method: 'notifications/initialized'
      };
      
      if (this.transport === 'websocket' && this._websocket?.readyState === WebSocket.OPEN) {
        this._websocket.send(JSON.stringify(initializedNotification));
      } else {
        // For HTTP, we can skip the notification or handle differently
      }

      // Discover available features
      await this.discover();

      this.connected = true;
      return {
        success: true,
        serverInfo: this.serverInfo,
        capabilities: this.capabilities
      };
    } catch (error) {
      this.connected = false;
      throw error;
    }
  }

  /**
   * Discover tools, resources, and prompts from the server
   */
  async discover() {
    // Discover tools
    if (this.capabilities?.tools !== false) {
      try {
        const toolsResult = await this._sendRequest(
          this._createRequest('tools/list', {})
        );
        this.tools = toolsResult.tools || [];
      } catch (e) {
        console.warn('Failed to discover tools:', e.message);
        this.tools = [];
      }
    }

    // Discover resources
    if (this.capabilities?.resources !== false) {
      try {
        const resourcesResult = await this._sendRequest(
          this._createRequest('resources/list', {})
        );
        this.resources = resourcesResult.resources || [];
      } catch (e) {
        console.warn('Failed to discover resources:', e.message);
        this.resources = [];
      }
    }

    // Discover prompts
    if (this.capabilities?.prompts !== false) {
      try {
        const promptsResult = await this._sendRequest(
          this._createRequest('prompts/list', {})
        );
        this.prompts = promptsResult.prompts || [];
      } catch (e) {
        console.warn('Failed to discover prompts:', e.message);
        this.prompts = [];
      }
    }

    return {
      tools: this.tools,
      resources: this.resources,
      prompts: this.prompts
    };
  }

  /**
   * Call a tool
   */
  async callTool(toolName, args = {}) {
    if (!this.connected) {
      throw new Error('Not connected to MCP server');
    }

    const result = await this._sendRequest(
      this._createRequest('tools/call', {
        name: toolName,
        arguments: args
      })
    );

    return result;
  }

  /**
   * Read a resource
   */
  async readResource(uri) {
    if (!this.connected) {
      throw new Error('Not connected to MCP server');
    }

    const result = await this._sendRequest(
      this._createRequest('resources/read', {
        uri
      })
    );

    return result;
  }

  /**
   * Get a prompt
   */
  async getPrompt(promptName, args = {}) {
    if (!this.connected) {
      throw new Error('Not connected to MCP server');
    }

    const result = await this._sendRequest(
      this._createRequest('prompts/get', {
        name: promptName,
        arguments: args
      })
    );

    return result;
  }

  /**
   * Disconnect from server
   */
  disconnect() {
    this.connected = false;
    
    if (this._websocket) {
      this._websocket.close();
      this._websocket = null;
    }
    
    if (this._eventSource) {
      this._eventSource.close();
      this._eventSource = null;
    }
    
    // Reject all pending requests
    for (const [id, { reject, timeoutId }] of this._pendingRequests) {
      clearTimeout(timeoutId);
      reject(new Error('Disconnected'));
    }
    this._pendingRequests.clear();
  }

  /**
   * Get tool schemas for LLM
   */
  getToolSchemas() {
    return this.tools.map(tool => ({
      name: `${this.serverName}:${tool.name}`,
      description: tool.description || `Tool from ${this.serverName}`,
      inputSchema: tool.inputSchema || { type: 'object', properties: {} }
    }));
  }
}

/**
 * MCP Manager - manages multiple MCP server connections
 */
class MCPManager {
  constructor() {
    this.clients = new Map();
  }

  /**
   * Add and connect to a server
   */
  async addServer(serverConfig) {
    const client = new MCPClient(serverConfig);
    
    try {
      const result = await client.connect();
      this.clients.set(serverConfig.name, client);
      return result;
    } catch (error) {
      throw new Error(`Failed to connect to ${serverConfig.name}: ${error.message}`);
    }
  }

  /**
   * Remove a server
   */
  removeServer(name) {
    const client = this.clients.get(name);
    if (client) {
      client.disconnect();
      this.clients.delete(name);
    }
  }

  /**
   * Get client by name
   */
  getClient(name) {
    return this.clients.get(name);
  }

  /**
   * Get all connected clients
   */
  getConnectedClients() {
    return Array.from(this.clients.values()).filter(c => c.connected);
  }

  /**
   * Get all tools from all servers
   */
  getAllTools() {
    const tools = [];
    for (const client of this.clients.values()) {
      if (client.connected) {
        tools.push(...client.getToolSchemas());
      }
    }
    return tools;
  }

  /**
   * Call a tool by full name (server:tool)
   */
  async callTool(fullName, args = {}) {
    const [serverName, ...toolNameParts] = fullName.split(':');
    const toolName = toolNameParts.join(':');
    
    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`Server not found: ${serverName}`);
    }
    
    return client.callTool(toolName, args);
  }

  /**
   * Disconnect all servers
   */
  disconnectAll() {
    for (const client of this.clients.values()) {
      client.disconnect();
    }
    this.clients.clear();
  }

  /**
   * Reconnect all servers
   */
  async reconnectAll(serverConfigs) {
    this.disconnectAll();
    
    const results = [];
    for (const config of serverConfigs) {
      try {
        const result = await this.addServer(config);
        results.push({ name: config.name, success: true, ...result });
      } catch (error) {
        results.push({ name: config.name, success: false, error: error.message });
      }
    }
    
    return results;
  }
}

// Export for ES module
export { MCPClient, MCPManager };

// Make available globally
if (typeof globalThis !== 'undefined') {
  globalThis.MCPClient = MCPClient;
  globalThis.MCPManager = MCPManager;
}
