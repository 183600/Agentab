/**
 * Tests for Command Palette
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CommandPalette, fuzzyMatch, highlightMatches, DEFAULT_COMMANDS, addCommandPaletteStyles } from '../lib/command-palette.js';

describe('CommandPalette', () => {
  let container;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  describe('fuzzyMatch', () => {
    it('should match exact string', () => {
      const result = fuzzyMatch('test', 'test');
      expect(result.score).toBeGreaterThan(0);
      expect(result.matches).toHaveLength(4);
    });

    it('should match partial string', () => {
      const result = fuzzyMatch('tst', 'test');
      expect(result.score).toBeGreaterThan(0);
      expect(result.matches).toHaveLength(3);
    });

    it('should return zero score for no match', () => {
      const result = fuzzyMatch('xyz', 'test');
      expect(result.score).toBe(0);
      expect(result.matches).toHaveLength(0);
    });

    it('should be case insensitive', () => {
      const result = fuzzyMatch('TEST', 'test');
      expect(result.score).toBeGreaterThan(0);
    });

    it('should give bonus for prefix match', () => {
      const prefixResult = fuzzyMatch('te', 'test');
      const middleResult = fuzzyMatch('es', 'test');
      expect(prefixResult.score).toBeGreaterThan(middleResult.score);
    });

    it('should give bonus for consecutive matches', () => {
      const result = fuzzyMatch('ab', 'ab');
      expect(result.score).toBeGreaterThan(fuzzyMatch('ab', 'axb').score);
    });
  });

  describe('highlightMatches', () => {
    it('should highlight matched characters', () => {
      const result = highlightMatches('test', [0, 2]);
      expect(result).toContain('<mark');
      expect(result).toContain('t</mark>');
      expect(result).toContain('s</mark>');
    });

    it('should return original text if no matches', () => {
      const result = highlightMatches('test', []);
      expect(result).toBe('test');
    });

    it('should escape HTML in text', () => {
      const result = highlightMatches('<script>', []);
      expect(result).toBe('&lt;script&gt;');
    });
  });

  describe('CommandPalette', () => {
    it('should create palette element', () => {
      const palette = new CommandPalette({ container });
      expect(palette.element).toBeDefined();
      expect(palette.element.classList.contains('command-palette')).toBe(true);
    });

    it('should register commands', () => {
      const palette = new CommandPalette({ container });
      palette.register({
        id: 'test',
        label: 'Test Command',
        handler: vi.fn()
      });

      expect(palette.commands.has('test')).toBe(true);
    });

    it('should unregister commands', () => {
      const palette = new CommandPalette({ container });
      palette.register({
        id: 'test',
        label: 'Test Command',
        handler: vi.fn()
      });

      palette.unregister('test');
      expect(palette.commands.has('test')).toBe(false);
    });

    it('should filter commands by query', () => {
      const palette = new CommandPalette({ container });
      palette.register({ id: 'run', label: 'Run Task', handler: vi.fn() });
      palette.register({ id: 'stop', label: 'Stop Task', handler: vi.fn() });
      palette.register({ id: 'clear', label: 'Clear Output', handler: vi.fn() });

      palette.open('run');
      expect(palette.filteredCommands.length).toBeGreaterThan(0);
      expect(palette.filteredCommands[0].id).toBe('run');
    });

    it('should open and close palette', () => {
      const palette = new CommandPalette({ container });

      palette.open();
      expect(palette.isOpen).toBe(true);
      expect(palette.element.classList.contains('hidden')).toBe(false);

      palette.close();
      expect(palette.isOpen).toBe(false);
      expect(palette.element.classList.contains('hidden')).toBe(true);
    });

    it('should toggle palette', () => {
      const palette = new CommandPalette({ container });

      palette.toggle();
      expect(palette.isOpen).toBe(true);

      palette.toggle();
      expect(palette.isOpen).toBe(false);
    });

    it('should execute command on selection', async () => {
      const handler = vi.fn();
      const palette = new CommandPalette({ container });
      palette.register({ id: 'test', label: 'Test', handler });

      await palette.execute('test');
      expect(handler).toHaveBeenCalled();
    });

    it('should update command', () => {
      const palette = new CommandPalette({ container });
      palette.register({ id: 'test', label: 'Test', handler: vi.fn() });

      palette.update('test', { label: 'Updated' });
      expect(palette.commands.get('test').label).toBe('Updated');
    });

    it('should enable/disable command', () => {
      const palette = new CommandPalette({ container });
      palette.register({ id: 'test', label: 'Test', handler: vi.fn() });

      palette.setEnabled('test', false);
      expect(palette.commands.get('test').enabled).toBe(false);

      palette.setEnabled('test', true);
      expect(palette.commands.get('test').enabled).toBe(true);
    });

    it('should destroy palette', () => {
      const palette = new CommandPalette({ container });
      palette.destroy();

      expect(palette.commands.size).toBe(0);
    });
  });

  describe('DEFAULT_COMMANDS', () => {
    it('should have default commands defined', () => {
      expect(DEFAULT_COMMANDS.length).toBeGreaterThan(0);
    });

    it('should have required properties', () => {
      for (const cmd of DEFAULT_COMMANDS) {
        expect(cmd.id).toBeDefined();
        expect(cmd.label).toBeDefined();
        expect(cmd.category).toBeDefined();
      }
    });
  });

  describe('addCommandPaletteStyles', () => {
    it('should add styles to document', () => {
      addCommandPaletteStyles();
      const style = document.getElementById('command-palette-styles');
      expect(style).toBeDefined();
    });

    it('should not duplicate styles', () => {
      addCommandPaletteStyles();
      addCommandPaletteStyles();

      const styles = document.querySelectorAll('#command-palette-styles');
      expect(styles.length).toBeLessThanOrEqual(1);
    });
  });
});
