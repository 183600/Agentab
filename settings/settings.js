// settings/settings.js

document.addEventListener('DOMContentLoaded', () => {
  // Localize document
  localizeDocument();

  // === Elements ===
  const apiBaseUrlInput = document.getElementById('api-base-url');
  const apiKeyInput = document.getElementById('api-key');
  const modelInput = document.getElementById('model');
  const btnSaveSettings = document.getElementById('btn-save-settings');
  const btnTestConnection = document.getElementById('btn-test-connection');
  const toggleApiKey = document.getElementById('toggle-api-key');
  const eyeIcon = toggleApiKey.querySelector('.eye-icon');
  const eyeOffIcon = toggleApiKey.querySelector('.eye-off-icon');

  // === Load Settings ===
  async function loadSettings() {
    const response = await chrome.runtime.sendMessage({ action: 'get_settings' });
    if (response.success) {
      apiBaseUrlInput.value = response.settings.apiBaseUrl || '';
      apiKeyInput.value = response.settings.apiKey || '';
      modelInput.value = response.settings.model || '';
    }
  }

  loadSettings();

  // === Toggle API Key Visibility ===
  toggleApiKey.addEventListener('click', () => {
    const isPassword = apiKeyInput.type === 'password';
    apiKeyInput.type = isPassword ? 'text' : 'password';
    eyeIcon.classList.toggle('hidden', isPassword);
    eyeOffIcon.classList.toggle('hidden', !isPassword);
  });

  // === Save Settings ===
  btnSaveSettings.addEventListener('click', async () => {
    const apiBaseUrl = apiBaseUrlInput.value.trim();
    const apiKey = apiKeyInput.value.trim();
    const model = modelInput.value.trim();

    if (!apiBaseUrl) {
      showToast(i18n('apiBaseUrlRequired'), 'error');
      apiBaseUrlInput.focus();
      return;
    }

    if (!apiKey) {
      showToast(i18n('apiKeyRequired'), 'error');
      apiKeyInput.focus();
      return;
    }

    if (!model) {
      showToast(i18n('modelRequired'), 'error');
      modelInput.focus();
      return;
    }

    btnSaveSettings.disabled = true;
    const originalContent = btnSaveSettings.innerHTML;
    btnSaveSettings.innerHTML = `<div class="spinner"></div><span>${i18n('saving')}</span>`;

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'save_settings',
        settings: {
          apiBaseUrl,
          apiKey,
          model
        }
      });

      if (response.success) {
        showToast(i18n('settingsSaved'), 'success');
      } else {
        showToast(i18n('settingsSaveFailed'), 'error');
      }
    } catch (e) {
      showToast(`${i18n('error')}: ${e.message}`, 'error');
    } finally {
      btnSaveSettings.disabled = false;
      btnSaveSettings.innerHTML = originalContent;
    }
  });

  // === Test Connection ===
  btnTestConnection.addEventListener('click', async () => {
    const apiBaseUrl = apiBaseUrlInput.value.trim();
    const apiKey = apiKeyInput.value.trim();
    const model = modelInput.value.trim();

    if (!apiBaseUrl || !apiKey || !model) {
      showToast(i18n('fillAllFields'), 'error');
      return;
    }

    btnTestConnection.disabled = true;
    const originalContent = btnTestConnection.innerHTML;
    btnTestConnection.innerHTML = `<div class="spinner"></div><span>${i18n('testing')}</span>`;

    try {
      const response = await fetch(`${apiBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model,
          messages: [{ role: 'user', content: 'Hello' }],
          max_tokens: 5
        })
      });

      if (response.ok) {
        showToast(i18n('connectionSuccess'), 'success');
      } else {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData.error?.message || response.statusText;
        showToast(i18n('connectionFailed', [errorMsg]), 'error');
      }
    } catch (e) {
      showToast(i18n('connectionFailed', [e.message]), 'error');
    } finally {
      btnTestConnection.disabled = false;
      btnTestConnection.innerHTML = originalContent;
    }
  });

  // ===== MCP Servers Management =====

  const mcpServersList = document.getElementById('mcp-servers-list');
  const mcpServersEmpty = document.getElementById('mcp-servers-empty');
  const btnAddMCPServer = document.getElementById('btn-add-mcp-server');
  const mcpServerDialog = document.getElementById('mcp-server-dialog');
  const mcpToolsDialog = document.getElementById('mcp-tools-dialog');
  const mcpDialogTitle = document.getElementById('mcp-dialog-title');

  let mcpServers = [];
  let mcpServerStatuses = new Map(); // serverId -> { connected, tools, error }

  // Load MCP servers
  async function loadMCPServers() {
    const response = await chrome.runtime.sendMessage({ action: 'get_mcp_servers' });
    if (response.success) {
      mcpServers = response.servers || [];
      renderMCPServers();
    }
  }

  // Render MCP servers list
  function renderMCPServers() {
    if (mcpServers.length === 0) {
      mcpServersList.innerHTML = '';
      mcpServersEmpty.classList.remove('hidden');
      return;
    }

    mcpServersEmpty.classList.add('hidden');
    mcpServersList.innerHTML = mcpServers.map(server => {
      const status = mcpServerStatuses.get(server.id) || { connected: false };
      let statusClass, statusText;

      if (!server.enabled) {
        statusClass = 'disabled';
        statusText = i18n('mcpStatusDisabled') || '已禁用';
      } else if (status.connected) {
        statusClass = 'connected';
        statusText = i18n('mcpStatusConnected') || '已连接';
      } else {
        statusClass = 'disconnected';
        statusText = status.error || (i18n('mcpStatusDisconnected') || '未连接');
      }

      return `
        <div class="mcp-server-item" data-id="${server.id}">
          <div class="mcp-server-info">
            <div class="mcp-server-name">${escapeHtml(server.name)}</div>
            <div class="mcp-server-url">${escapeHtml(server.url)}</div>
          </div>
          <div class="mcp-server-status ${statusClass}">
            <span>${statusText}</span>
          </div>
          <div class="mcp-server-actions">
            <button class="btn-tools" title="${i18n('mcpViewTools') || '查看工具'}" data-action="tools">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-3.77 3.77a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-3.77 3.77a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0z"/>
              </svg>
            </button>
            <button class="btn-edit" title="${i18n('mcpEditServer') || '编辑'}" data-action="edit">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button class="btn-delete" title="${i18n('mcpDeleteServer') || '删除'}" data-action="delete">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  // Refresh MCP server statuses
  async function refreshMCPStatuses() {
    const response = await chrome.runtime.sendMessage({ action: 'get_mcp_status' });
    if (response.success) {
      mcpServerStatuses = new Map(Object.entries(response.statuses || {}));
      renderMCPServers();
    }
  }

  // Open MCP server dialog
  function openMCPServerDialog(server = null) {
    const isEdit = !!server;
    mcpDialogTitle.textContent = isEdit 
      ? (i18n('mcpEditDialogTitle') || '编辑 MCP 服务器')
      : (i18n('mcpAddDialogTitle') || '添加 MCP 服务器');

    document.getElementById('mcp-server-id').value = server?.id || '';
    document.getElementById('mcp-server-name').value = server?.name || '';
    document.getElementById('mcp-server-url').value = server?.url || '';
    document.getElementById('mcp-server-transport').value = server?.transport || 'http';
    document.getElementById('mcp-server-timeout').value = server?.timeout || 30000;
    document.getElementById('mcp-server-enabled').checked = server?.enabled !== false;

    mcpServerDialog.classList.remove('hidden');
  }

  // Close MCP server dialog
  function closeMCPServerDialog() {
    mcpServerDialog.classList.add('hidden');
  }

  // Save MCP server
  async function saveMCPServer() {
    const id = document.getElementById('mcp-server-id').value;
    const name = document.getElementById('mcp-server-name').value.trim();
    const url = document.getElementById('mcp-server-url').value.trim();
    const transport = document.getElementById('mcp-server-transport').value;
    const timeout = parseInt(document.getElementById('mcp-server-timeout').value) || 30000;
    const enabled = document.getElementById('mcp-server-enabled').checked;

    if (!name) {
      showToast(i18n('mcpNameRequired') || '请输入服务器名称', 'error');
      return;
    }

    if (!url) {
      showToast(i18n('mcpUrlRequired') || '请输入服务器地址', 'error');
      return;
    }

    try {
      if (id) {
        // Update existing server
        const response = await chrome.runtime.sendMessage({
          action: 'update_mcp_server',
          serverId: id,
          updates: { name, url, transport, timeout, enabled }
        });
        if (response.success) {
          showToast(i18n('mcpServerUpdated') || '服务器已更新', 'success');
          closeMCPServerDialog();
          await loadMCPServers();
          await refreshMCPStatuses();
        }
      } else {
        // Add new server
        const response = await chrome.runtime.sendMessage({
          action: 'save_mcp_server',
          server: { name, url, transport, timeout, enabled }
        });
        if (response.success) {
          showToast(i18n('mcpServerAdded') || '服务器已添加', 'success');
          closeMCPServerDialog();
          await loadMCPServers();
          await refreshMCPStatuses();
        }
      }
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  // Delete MCP server
  async function deleteMCPServer(serverId) {
    if (!confirm(i18n('mcpDeleteConfirm') || '确定要删除这个服务器吗？')) {
      return;
    }

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'delete_mcp_server',
        serverId
      });
      if (response.success) {
        showToast(i18n('mcpServerDeleted') || '服务器已删除', 'success');
        await loadMCPServers();
      }
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  // Show MCP tools
  function showMCPTools(serverId) {
    const status = mcpServerStatuses.get(serverId);
    const toolsList = document.getElementById('mcp-tools-list');

    if (!status || !status.tools || status.tools.length === 0) {
      toolsList.innerHTML = `<div class="mcp-tools-empty">${i18n('mcpNoTools') || '没有可用的工具'}</div>`;
    } else {
      toolsList.innerHTML = status.tools.map(tool => `
        <div class="mcp-tool-item">
          <div class="mcp-tool-name">${escapeHtml(tool.name)}</div>
          <div class="mcp-tool-description">${escapeHtml(tool.description || '')}</div>
        </div>
      `).join('');
    }

    mcpToolsDialog.classList.remove('hidden');
  }

  // Event listeners for MCP servers
  btnAddMCPServer.addEventListener('click', () => openMCPServerDialog());

  document.getElementById('btn-close-mcp-dialog').addEventListener('click', closeMCPServerDialog);
  document.getElementById('btn-cancel-mcp-dialog').addEventListener('click', closeMCPServerDialog);
  document.getElementById('btn-save-mcp-server').addEventListener('click', saveMCPServer);

  document.getElementById('btn-close-tools-dialog').addEventListener('click', () => {
    mcpToolsDialog.classList.add('hidden');
  });

  mcpServersList.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;

    const item = btn.closest('.mcp-server-item');
    const serverId = item?.dataset.id;
    const action = btn.dataset.action;

    if (action === 'edit') {
      const server = mcpServers.find(s => s.id === serverId);
      if (server) openMCPServerDialog(server);
    } else if (action === 'delete') {
      deleteMCPServer(serverId);
    } else if (action === 'tools') {
      showMCPTools(serverId);
    }
  });

  // Close dialogs on overlay click
  mcpServerDialog.addEventListener('click', (e) => {
    if (e.target === mcpServerDialog) closeMCPServerDialog();
  });

  mcpToolsDialog.addEventListener('click', (e) => {
    if (e.target === mcpToolsDialog) mcpToolsDialog.classList.add('hidden');
  });

  // Initial load
  loadMCPServers();
  refreshMCPStatuses();

  // ===== MCP Server (Server-side) Info =====

  async function loadMCPServerInfo() {
    try {
      // Get server info
      const infoResponse = await chrome.runtime.sendMessage({ action: 'get_mcp_server_info' });
      if (infoResponse.success) {
        document.getElementById('mcp-server-tools-count').textContent = infoResponse.info.toolsCount;
      }

      // Get registered tools
      const toolsResponse = await chrome.runtime.sendMessage({ action: 'get_mcp_server_tools' });
      if (toolsResponse.success && toolsResponse.tools) {
        renderRegisteredTools(toolsResponse.tools);
      }
    } catch (e) {
      console.error('Failed to load MCP server info:', e);
    }
  }

  function renderRegisteredTools(tools) {
    const container = document.getElementById('registered-tools-list');
    if (!tools || tools.length === 0) {
      container.innerHTML = `<div class="empty-message">${i18n('noRegisteredTools') || '暂无注册工具'}</div>`;
      return;
    }

    container.innerHTML = tools.map(tool => `
      <div class="registered-tool-item">
        <div class="tool-header">
          <span class="tool-name">${escapeHtml(tool.name)}</span>
        </div>
        <div class="tool-description">${escapeHtml(tool.description || '')}</div>
        ${tool.inputSchema && Object.keys(tool.inputSchema.properties || {}).length > 0 ? `
          <div class="tool-params">
            <span class="params-label">${i18n('parameters') || '参数'}:</span>
            ${Object.keys(tool.inputSchema.properties).map(p => `<code>${escapeHtml(p)}</code>`).join(' ')}
          </div>
        ` : ''}
      </div>
    `).join('');
  }

  loadMCPServerInfo();

  // === Toast Notification ===
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = {
      success: '✅',
      error: '❌',
      info: 'ℹ️'
    };

    toast.innerHTML = `<span>${icons[type] || ''}</span><span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(20px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // === Utility ===
  function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }
});
