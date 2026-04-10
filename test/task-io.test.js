/**
 * Tests for Task Import/Export Module
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  TaskExporter,
  TaskImporter,
  ExportFormat,
  exportTasks,
  importTasks
} from '../lib/task-io.js';

// Sample tasks for testing
const sampleTasks = [
  {
    id: 'task-1',
    name: 'Extract Emails',
    description: 'Extract all emails from page',
    type: 'prompt',
    content: 'Find all email addresses on this page and list them',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    runCount: 5,
    lastRunAt: '2024-01-15T00:00:00.000Z'
  },
  {
    id: 'task-2',
    name: 'Fill Form',
    description: 'Auto-fill login form',
    type: 'code',
    content:
      "document.querySelector('#username').value = 'test';\ndocument.querySelector('#password').value = 'pass';",
    createdAt: '2024-01-02T00:00:00.000Z',
    updatedAt: '2024-01-02T00:00:00.000Z',
    runCount: 3
  }
];

describe('TaskExporter', () => {
  describe('toJSON', () => {
    it('should export tasks to JSON', () => {
      const json = TaskExporter.toJSON(sampleTasks);
      const parsed = JSON.parse(json);

      expect(parsed.version).toBe('1.0');
      expect(parsed.tasks).toHaveLength(2);
      expect(parsed.tasks[0].name).toBe('Extract Emails');
    });

    it('should export without stats by default', () => {
      const json = TaskExporter.toJSON(sampleTasks);
      const parsed = JSON.parse(json);

      expect(parsed.tasks[0].runCount).toBeUndefined();
    });

    it('should include stats when requested', () => {
      const json = TaskExporter.toJSON(sampleTasks, { includeStats: true });
      const parsed = JSON.parse(json);

      expect(parsed.tasks[0].runCount).toBe(5);
    });

    it('should export compact JSON when pretty is false', () => {
      const json = TaskExporter.toJSON(sampleTasks, { pretty: false });

      expect(json).not.toContain('\n  ');
    });
  });

  describe('toCSV', () => {
    it('should export tasks to CSV', () => {
      const csv = TaskExporter.toCSV(sampleTasks);
      const lines = csv.split('\n');

      expect(lines[0]).toContain('id,name,description');
      expect(lines[1]).toContain('task-1,Extract Emails');
      expect(lines[2]).toContain('task-2,Fill Form');
    });

    it('should escape commas in content', () => {
      const tasks = [
        {
          ...sampleTasks[0],
          content: 'Find, all, emails'
        }
      ];
      const csv = TaskExporter.toCSV(tasks);

      expect(csv).toContain('"Find, all, emails"');
    });

    it('should escape quotes in content', () => {
      const tasks = [
        {
          ...sampleTasks[0],
          content: 'Find "important" emails'
        }
      ];
      const csv = TaskExporter.toCSV(tasks);

      expect(csv).toContain('"Find ""important"" emails"');
    });
  });

  describe('toMarkdown', () => {
    it('should export tasks to Markdown', () => {
      const md = TaskExporter.toMarkdown(sampleTasks);

      expect(md).toContain('# Agentab Tasks Export');
      expect(md).toContain('## Prompt Tasks');
      expect(md).toContain('### Extract Emails');
      expect(md).toContain('## Code Tasks');
      expect(md).toContain('### Fill Form');
    });

    it('should include task descriptions', () => {
      const md = TaskExporter.toMarkdown(sampleTasks);

      expect(md).toContain('*Extract all emails from page*');
    });

    it('should use code block for code tasks', () => {
      const md = TaskExporter.toMarkdown(sampleTasks);

      expect(md).toContain('```javascript');
      expect(md).toContain("document.querySelector('#username')");
    });
  });

  describe('getFileExtension', () => {
    it('should return correct extensions', () => {
      expect(TaskExporter.getFileExtension(ExportFormat.JSON)).toBe('.json');
      expect(TaskExporter.getFileExtension(ExportFormat.CSV)).toBe('.csv');
      expect(TaskExporter.getFileExtension(ExportFormat.MARKDOWN)).toBe('.md');
    });
  });

  describe('getMimeType', () => {
    it('should return correct MIME types', () => {
      expect(TaskExporter.getMimeType(ExportFormat.JSON)).toBe('application/json');
      expect(TaskExporter.getMimeType(ExportFormat.CSV)).toBe('text/csv');
    });
  });

  describe('export', () => {
    it('should export to specified format', () => {
      const json = TaskExporter.export(sampleTasks, ExportFormat.JSON);
      const parsed = JSON.parse(json);
      expect(parsed.tasks).toHaveLength(2);

      const csv = TaskExporter.export(sampleTasks, ExportFormat.CSV);
      expect(csv).toContain('id,name');
    });
  });
});

describe('TaskImporter', () => {
  describe('fromJSON', () => {
    it('should import from JSON array', () => {
      const json = JSON.stringify(sampleTasks);
      const tasks = TaskImporter.fromJSON(json);

      expect(tasks).toHaveLength(2);
      expect(tasks[0].name).toBe('Extract Emails');
    });

    it('should import from wrapped JSON', () => {
      const json = JSON.stringify({ version: '1.0', tasks: sampleTasks });
      const tasks = TaskImporter.fromJSON(json);

      expect(tasks).toHaveLength(2);
    });

    it('should normalize tasks with missing fields', () => {
      const json = JSON.stringify([{ name: 'Test' }]);
      const tasks = TaskImporter.fromJSON(json);

      expect(tasks[0].id).toBeDefined();
      expect(tasks[0].type).toBe('prompt');
      expect(tasks[0].content).toBe('');
    });
  });

  describe('fromCSV', () => {
    it('should import from CSV', () => {
      const csv = TaskExporter.toCSV(sampleTasks);
      const tasks = TaskImporter.fromCSV(csv);

      expect(tasks).toHaveLength(2);
      expect(tasks[0].name).toBe('Extract Emails');
    });

    it('should handle quoted values', () => {
      const csv = 'id,name,content\n1,Test,"line1\nline2"';
      const tasks = TaskImporter.fromCSV(csv);

      expect(tasks[0].content).toBe('line1\nline2');
    });
  });

  describe('fromMarkdown', () => {
    it('should import from Markdown', () => {
      const md = TaskExporter.toMarkdown(sampleTasks);
      const tasks = TaskImporter.fromMarkdown(md);

      expect(tasks.length).toBeGreaterThan(0);
      expect(tasks[0].name).toBe('Extract Emails');
    });

    it('should detect code tasks from code blocks', () => {
      const md = `# Tasks

## Code Tasks

### My Code Task
Description here

\`\`\`javascript
console.log('hello');
\`\`\`
`;
      const tasks = TaskImporter.fromMarkdown(md);

      expect(tasks[0].type).toBe('code');
      expect(tasks[0].content).toContain("console.log('hello')");
    });
  });

  describe('autoDetect', () => {
    it('should detect JSON format', () => {
      const json = JSON.stringify(sampleTasks);
      const tasks = TaskImporter.autoDetect(json);

      expect(tasks).toHaveLength(2);
    });

    it('should detect Markdown format', () => {
      const md = '# Tasks\n\n### Test\n```\ncode\n```';
      const tasks = TaskImporter.autoDetect(md);

      expect(tasks).toBeDefined();
    });
  });

  describe('import', () => {
    it('should import from specified format', () => {
      const json = TaskExporter.toJSON(sampleTasks);
      const tasks = TaskImporter.import(json, ExportFormat.JSON);

      expect(tasks).toHaveLength(2);
    });
  });
});

describe('normalizeTask', () => {
  it('should generate ID if missing', () => {
    const task = TaskImporter._normalizeTask({ name: 'Test' });

    expect(task.id).toBeDefined();
    expect(task.id).toMatch(/^task_\d+_/);
  });

  it('should set defaults for missing fields', () => {
    const task = TaskImporter._normalizeTask({ name: 'Test' });

    expect(task.type).toBe('prompt');
    expect(task.content).toBe('');
    expect(task.description).toBe('');
  });

  it('should handle alternative field names', () => {
    const task = TaskImporter._normalizeTask({
      title: 'My Task',
      code: 'console.log(1)',
      body: 'ignored'
    });

    expect(task.name).toBe('My Task');
    expect(task.content).toBe('console.log(1)');
  });
});

describe('exportTasks / importTasks helpers', () => {
  it('should export and import tasks', () => {
    const exported = exportTasks(sampleTasks, ExportFormat.JSON);
    const imported = importTasks(exported, ExportFormat.JSON);

    expect(imported).toHaveLength(2);
    expect(imported[0].name).toBe('Extract Emails');
  });
});
