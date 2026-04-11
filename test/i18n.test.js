// test/i18n.test.js - Tests for internationalization utilities

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock chrome.i18n API
const mockGetMessage = vi.fn((key, substitutions) => {
  const messages = {
    extName: 'Agentab',
    extDescription: 'AI Agent Chrome Extension',
    btnSave: 'Save',
    btnCancel: 'Cancel',
    greeting: 'Hello, $1!'
  };
  let message = messages[key] || key;
  if (substitutions) {
    const subs = Array.isArray(substitutions) ? substitutions : [substitutions];
    subs.forEach((sub, i) => {
      message = message.replace(`$${i + 1}`, sub);
    });
  }
  return message;
});

global.chrome = {
  i18n: {
    getMessage: mockGetMessage
  }
};

// Import after mock
const { i18n, localizeDocument } = await import('../lib/i18n.js');

describe('i18n', () => {
  beforeEach(() => {
    mockGetMessage.mockClear();
  });

  describe('i18n function', () => {
    it('should get message by key', () => {
      const message = i18n('extName');
      expect(message).toBe('Agentab');
      expect(mockGetMessage).toHaveBeenCalledWith('extName', undefined);
    });

    it('should return key if message not found', () => {
      const message = i18n('nonexistent');
      expect(message).toBe('nonexistent');
    });

    it('should handle string substitution', () => {
      const message = i18n('greeting', 'World');
      expect(message).toBe('Hello, World!');
    });

    it('should handle array substitutions', () => {
      const message = i18n('greeting', ['User']);
      expect(message).toBe('Hello, User!');
    });

    it('should handle undefined key', () => {
      const message = i18n(undefined);
      expect(message).toBe(undefined);
    });

    it('should handle null key', () => {
      const message = i18n(null);
      expect(message).toBe(null);
    });

    it('should handle empty key', () => {
      const message = i18n('');
      expect(message).toBe('');
    });
  });

  describe('localizeDocument', () => {
    beforeEach(() => {
      document.body.innerHTML = '';
    });

    it('should localize elements with data-i18n attribute', () => {
      const div = document.createElement('div');
      div.setAttribute('data-i18n', 'extName');
      document.body.appendChild(div);

      localizeDocument();

      expect(div.textContent).toBe('Agentab');
    });

    it('should localize placeholder attributes', () => {
      const input = document.createElement('input');
      input.setAttribute('data-i18n-placeholder', 'extName');
      document.body.appendChild(input);

      localizeDocument();

      expect(input.placeholder).toBe('Agentab');
    });

    it('should localize title attributes', () => {
      const button = document.createElement('button');
      button.setAttribute('data-i18n-title', 'btnSave');
      document.body.appendChild(button);

      localizeDocument();

      expect(button.title).toBe('Save');
    });

    it('should localize aria-label attributes', () => {
      const button = document.createElement('button');
      button.setAttribute('data-i18n-aria', 'btnSave');
      document.body.appendChild(button);

      localizeDocument();

      expect(button.getAttribute('aria-label')).toBe('Save');
    });

    it('should handle substitutions', () => {
      const div = document.createElement('div');
      div.setAttribute('data-i18n', 'greeting');
      div.setAttribute('data-i18n-subs', 'Test');
      document.body.appendChild(div);

      localizeDocument();

      expect(div.textContent).toBe('Hello, Test!');
    });

    it('should handle multiple substitutions', () => {
      const div = document.createElement('div');
      div.setAttribute('data-i18n', 'greeting');
      div.setAttribute('data-i18n-subs', 'User1,User2');
      document.body.appendChild(div);

      localizeDocument();

      // Should handle first substitution
      expect(div.textContent).toContain('Hello');
    });

    it('should handle empty document', () => {
      expect(() => localizeDocument()).not.toThrow();
    });

    it('should handle elements without attributes', () => {
      const div = document.createElement('div');
      document.body.appendChild(div);

      expect(() => localizeDocument()).not.toThrow();
    });
  });
});
