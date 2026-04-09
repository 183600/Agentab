/**
 * Task Import/Export Module
 * Provides functionality to import and export tasks in various formats
 */

import { StorageManager } from './storage.js';

/**
 * Export formats
 */
export const ExportFormat = {
  JSON: 'json',
  CSV: 'csv',
  MARKDOWN: 'markdown',
  YAML: 'yaml'
};

/**
 * Import sources
 */
export const ImportSource = {
  FILE: 'file',
  URL: 'url',
  TEXT: 'text',
  GIST: 'gist'
};

/**
 * TaskExporter - Export tasks to various formats
 */
export class TaskExporter {
  /**
   * Export tasks to JSON
   * @param {Array} tasks - Tasks to export
   * @param {Object} options - Export options
   * @returns {string}
   */
  static toJSON(tasks, options = {}) {
    const { pretty = true, includeStats = false } = options;

    const exportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      source: 'Agentab',
      tasks: tasks.map(task => ({
        id: task.id,
        name: task.name,
        description: task.description || '',
        type: task.type,
        content: task.content,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        ...(includeStats && {
          runCount: task.runCount || 0,
          lastRunAt: task.lastRunAt || null
        })
      }))
    };

    return pretty ? JSON.stringify(exportData, null, 2) : JSON.stringify(exportData);
  }

  /**
   * Export tasks to CSV
   * @param {Array} tasks - Tasks to export
   * @returns {string}
   */
  static toCSV(tasks) {
    const headers = ['id', 'name', 'description', 'type', 'content', 'createdAt', 'updatedAt'];
    const rows = [headers.join(',')];

    for (const task of tasks) {
      const row = headers.map(header => {
        let value = task[header] || '';
        // Escape quotes and wrap in quotes if contains comma
        value = String(value).replace(/"/g, '""');
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
          value = `"${value}"`;
        }
        return value;
      });
      rows.push(row.join(','));
    }

    return rows.join('\n');
  }

  /**
   * Export tasks to Markdown
   * @param {Array} tasks - Tasks to export
   * @returns {string}
   */
  static toMarkdown(tasks) {
    const lines = [
      '# Agentab Tasks Export',
      '',
      `Exported: ${new Date().toLocaleString()}`,
      '',
      `Total tasks: ${tasks.length}`,
      '',
      '---',
      ''
    ];

    // Group by type
    const promptTasks = tasks.filter(t => t.type === 'prompt');
    const codeTasks = tasks.filter(t => t.type === 'code');

    if (promptTasks.length > 0) {
      lines.push('## Prompt Tasks', '');
      for (const task of promptTasks) {
        lines.push(`### ${task.name}`);
        if (task.description) {
          lines.push(`*${task.description}*`);
        }
        lines.push('');
        lines.push('```text');
        lines.push(task.content);
        lines.push('```');
        lines.push('');
      }
    }

    if (codeTasks.length > 0) {
      lines.push('## Code Tasks', '');
      for (const task of codeTasks) {
        lines.push(`### ${task.name}`);
        if (task.description) {
          lines.push(`*${task.description}*`);
        }
        lines.push('');
        lines.push('```javascript');
        lines.push(task.content);
        lines.push('```');
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  /**
   * Export tasks to YAML-like format
   * @param {Array} tasks - Tasks to export
   * @returns {string}
   */
  static toYAML(tasks) {
    const lines = [
      'version: "1.0"',
      `exported_at: "${new Date().toISOString()}"`,
      `total_tasks: ${tasks.length}`,
      'tasks:',
      ''
    ];

    for (const task of tasks) {
      lines.push(`  - id: "${task.id}"`);
      lines.push(`    name: "${this._escapeYAML(task.name)}"`);
      if (task.description) {
        lines.push(`    description: "${this._escapeYAML(task.description)}"`);
      }
      lines.push(`    type: ${task.type}`);
      lines.push('    content: |');
      for (const line of task.content.split('\n')) {
        lines.push(`      ${line}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Escape YAML string
   */
  static _escapeYAML(str) {
    return str.replace(/"/g, '\\"').replace(/\n/g, '\\n');
  }

  /**
   * Export to specified format
   * @param {Array} tasks - Tasks to export
   * @param {string} format - Export format
   * @param {Object} options - Export options
   * @returns {string}
   */
  static export(tasks, format, options = {}) {
    switch (format) {
      case ExportFormat.JSON:
        return this.toJSON(tasks, options);
      case ExportFormat.CSV:
        return this.toCSV(tasks);
      case ExportFormat.MARKDOWN:
        return this.toMarkdown(tasks);
      case ExportFormat.YAML:
        return this.toYAML(tasks);
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  /**
   * Get file extension for format
   */
  static getFileExtension(format) {
    const extensions = {
      [ExportFormat.JSON]: '.json',
      [ExportFormat.CSV]: '.csv',
      [ExportFormat.MARKDOWN]: '.md',
      [ExportFormat.YAML]: '.yaml'
    };
    return extensions[format] || '.txt';
  }

  /**
   * Get MIME type for format
   */
  static getMimeType(format) {
    const types = {
      [ExportFormat.JSON]: 'application/json',
      [ExportFormat.CSV]: 'text/csv',
      [ExportFormat.MARKDOWN]: 'text/markdown',
      [ExportFormat.YAML]: 'text/yaml'
    };
    return types[format] || 'text/plain';
  }
}

/**
 * TaskImporter - Import tasks from various sources
 */
export class TaskImporter {
  /**
   * Import from JSON string
   * @param {string} json - JSON string
   * @returns {Array}
   */
  static fromJSON(json) {
    const data = JSON.parse(json);

    // Handle different formats
    if (Array.isArray(data)) {
      // Direct array of tasks
      return data.map(this._normalizeTask);
    }

    if (data.tasks && Array.isArray(data.tasks)) {
      // Wrapped format
      return data.tasks.map(this._normalizeTask);
    }

    throw new Error('Invalid JSON format: expected array or object with tasks property');
  }

  /**
   * Import from CSV string
   * @param {string} csv - CSV string
   * @returns {Array}
   */
  static fromCSV(csv) {
    const lines = csv.split('\n').filter(line => line.trim());
    if (lines.length < 2) {
      throw new Error('CSV must have header and at least one data row');
    }

    const headers = this._parseCSVLine(lines[0]);
    const tasks = [];

    for (let i = 1; i < lines.length; i++) {
      const values = this._parseCSVLine(lines[i]);
      const task = {};

      headers.forEach((header, index) => {
        task[header] = values[index] || '';
      });

      tasks.push(this._normalizeTask(task));
    }

    return tasks;
  }

  /**
   * Parse CSV line
   */
  static _parseCSVLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    values.push(current);
    return values;
  }

  /**
   * Import from Markdown
   * @param {string} markdown - Markdown string
   * @returns {Array}
   */
  static fromMarkdown(markdown) {
    const tasks = [];
    const lines = markdown.split('\n');
    let currentTask = null;
    let inCodeBlock = false;
    let codeBlockContent = [];

    for (const line of lines) {
      // Task header (### Task Name)
      if (line.startsWith('### ')) {
        if (currentTask && currentTask.content) {
          tasks.push(this._normalizeTask(currentTask));
        }
        currentTask = {
          name: line.slice(4).trim(),
          type: 'prompt'
        };
        continue;
      }

      // Section header (## Prompt Tasks or ## Code Tasks)
      if (line.startsWith('## ')) {
        if (currentTask && currentTask.content) {
          tasks.push(this._normalizeTask(currentTask));
          currentTask = null;
        }
        if (line.toLowerCase().includes('code')) {
          // Next tasks are code type
        }
        continue;
      }

      // Description (italic)
      if (currentTask && line.startsWith('*') && line.endsWith('*') && !inCodeBlock) {
        currentTask.description = line.slice(1, -1);
        continue;
      }

      // Code block start
      if (line.startsWith('```')) {
        if (!inCodeBlock) {
          inCodeBlock = true;
          const lang = line.slice(3).trim();
          if (lang === 'javascript' || lang === 'js') {
            currentTask.type = 'code';
          }
        } else {
          inCodeBlock = false;
          currentTask.content = codeBlockContent.join('\n');
          codeBlockContent = [];
        }
        continue;
      }

      // Code block content
      if (inCodeBlock) {
        codeBlockContent.push(line);
      }
    }

    // Add last task
    if (currentTask && currentTask.content) {
      tasks.push(this._normalizeTask(currentTask));
    }

    return tasks;
  }

  /**
   * Normalize task object
   */
  static _normalizeTask(task) {
    return {
      id: task.id || `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: task.name || task.title || 'Untitled Task',
      description: task.description || '',
      type: task.type || 'prompt',
      content: task.content || task.code || task.body || '',
      createdAt: task.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      runCount: task.runCount || 0,
      lastRunAt: task.lastRunAt || null
    };
  }

  /**
   * Import from specified format
   * @param {string} content - Content to import
   * @param {string} format - Import format
   * @returns {Array}
   */
  static import(content, format) {
    switch (format) {
      case ExportFormat.JSON:
        return this.fromJSON(content);
      case ExportFormat.CSV:
        return this.fromCSV(content);
      case ExportFormat.MARKDOWN:
        return this.fromMarkdown(content);
      default:
        // Try to auto-detect format
        return this.autoDetect(content);
    }
  }

  /**
   * Auto-detect format and import
   */
  static autoDetect(content) {
    const trimmed = content.trim();

    // Try JSON
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return this.fromJSON(content);
      } catch {
        // Continue
      }
    }

    // Try CSV
    const firstLine = trimmed.split('\n')[0];
    if (firstLine.includes(',') && !firstLine.startsWith('#')) {
      try {
        return this.fromCSV(content);
      } catch {
        // Continue
      }
    }

    // Try Markdown
    if (trimmed.startsWith('#')) {
      return this.fromMarkdown(content);
    }

    throw new Error('Could not auto-detect import format');
  }

  /**
   * Import from file
   * @param {File} file - File object
   * @returns {Promise<Array>}
   */
  static async fromFile(file) {
    const content = await file.text();
    const extension = file.name.split('.').pop().toLowerCase();

    const formatMap = {
      'json': ExportFormat.JSON,
      'csv': ExportFormat.CSV,
      'md': ExportFormat.MARKDOWN,
      'markdown': ExportFormat.MARKDOWN,
      'yaml': ExportFormat.YAML,
      'yml': ExportFormat.YAML
    };

    const format = formatMap[extension] || ExportFormat.JSON;
    return this.import(content, format);
  }

  /**
   * Import from URL
   * @param {string} url - URL to fetch
   * @returns {Promise<Array>}
   */
  static async fromURL(url) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.statusText}`);
    }

    const content = await response.text();

    // Try to get format from URL
    const extension = url.split('.').pop().toLowerCase();
    const formatMap = {
      'json': ExportFormat.JSON,
      'csv': ExportFormat.CSV,
      'md': ExportFormat.MARKDOWN,
      'markdown': ExportFormat.MARKDOWN
    };

    const format = formatMap[extension] || ExportFormat.JSON;
    return this.import(content, format);
  }

  /**
   * Import from GitHub Gist
   * @param {string} gistId - Gist ID
   * @returns {Promise<Array>}
   */
  static async fromGist(gistId) {
    const url = `https://api.github.com/gists/${gistId}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch gist: ${response.statusText}`);
    }

    const gist = await response.json();
    const tasks = [];

    for (const [filename, file] of Object.entries(gist.files)) {
      try {
        const imported = this.import(file.content, ExportFormat.JSON);
        tasks.push(...imported);
      } catch {
        // If not JSON, create task from content
        tasks.push({
          id: `gist_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name: filename,
          type: filename.endsWith('.js') ? 'code' : 'prompt',
          content: file.content
        });
      }
    }

    return tasks.map(this._normalizeTask);
  }
}

/**
 * TaskSync - Sync tasks with external sources
 */
export class TaskSync {
  constructor(options = {}) {
    this.storage = options.storage || new StorageManager();
    this.syncUrl = options.syncUrl;
    this.syncInterval = options.syncInterval || 300000; // 5 minutes
    this.lastSync = null;
    this.intervalId = null;
  }

  /**
   * Start auto sync
   */
  startAutoSync() {
    if (this.intervalId) return;

    this.intervalId = setInterval(() => {
      this.sync();
    }, this.syncInterval);
  }

  /**
   * Stop auto sync
   */
  stopAutoSync() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Sync tasks with remote
   */
  async sync() {
    if (!this.syncUrl) {
      throw new Error('Sync URL not configured');
    }

    const localTasks = await this.storage.getTasks();

    // Push local changes
    await fetch(this.syncUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: TaskExporter.toJSON(localTasks)
    });

    // Pull remote changes
    const remoteTasks = await TaskImporter.fromURL(this.syncUrl);
    await this.storage.saveTasks(remoteTasks);

    this.lastSync = new Date().toISOString();
    return { syncedAt: this.lastSync, count: remoteTasks.length };
  }
}

/**
 * Quick export function
 */
export function exportTasks(tasks, format = ExportFormat.JSON) {
  return TaskExporter.export(tasks, format);
}

/**
 * Quick import function
 */
export function importTasks(content, format = ExportFormat.JSON) {
  return TaskImporter.import(content, format);
}
