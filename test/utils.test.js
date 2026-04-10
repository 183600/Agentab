// test/utils.test.js - Tests for utility functions including safe HTML

import { describe, it, expect, beforeEach } from 'vitest';
import {
  escapeHtml,
  sanitizeHtml,
  safeHtml,
  markSafe,
  setSafeHtml,
  createElementFromHtml,
  ALLOWED_TAGS,
  ALLOWED_ATTRS
} from '../lib/utils.js';

describe('escapeHtml', () => {
  it('should escape HTML special characters', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert("xss")&lt;/script&gt;'
    );
  });

  it('should escape ampersand', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('should handle null', () => {
    expect(escapeHtml(null)).toBe('');
  });

  it('should handle undefined', () => {
    expect(escapeHtml(undefined)).toBe('');
  });

  it('should handle numbers', () => {
    expect(escapeHtml(123)).toBe('123');
  });

  it('should preserve safe text', () => {
    expect(escapeHtml('Hello World')).toBe('Hello World');
  });
});

describe('sanitizeHtml', () => {
  it('should remove script tags', () => {
    const result = sanitizeHtml('<div>Safe</div><script>alert(1)</script>');
    expect(result).toContain('Safe');
    expect(result).not.toContain('<script>');
    expect(result).not.toContain('alert');
  });

  it('should remove event handlers', () => {
    const result = sanitizeHtml('<div onclick="alert(1)">Click</div>');
    expect(result).not.toContain('onclick');
  });

  it('should remove javascript: URLs', () => {
    const result = sanitizeHtml('<a href="javascript:alert(1)">Link</a>');
    expect(result).not.toContain('javascript:');
  });

  it('should preserve safe tags', () => {
    const result = sanitizeHtml('<div class="test"><span>Hello</span></div>');
    expect(result).toContain('<div');
    expect(result).toContain('<span');
    expect(result).toContain('Hello');
  });

  it('should preserve SVG elements', () => {
    const result = sanitizeHtml('<svg><circle cx="10" cy="10" r="5"/></svg>');
    expect(result).toContain('<svg');
    expect(result).toContain('<circle');
  });

  it('should remove dangerous attributes', () => {
    const result = sanitizeHtml('<div srcdoc="<script>alert(1)</script>">Test</div>');
    expect(result).not.toContain('srcdoc');
  });

  it('should handle empty string', () => {
    expect(sanitizeHtml('')).toBe('');
  });

  it('should handle null', () => {
    expect(sanitizeHtml(null)).toBe('');
  });

  it('should allow custom tags', () => {
    const result = sanitizeHtml('<custom>Test</custom>', { allowedTags: new Set(['custom']) });
    expect(result).toContain('<custom');
  });

  it('should allow custom attributes', () => {
    const result = sanitizeHtml('<div data-custom="value">Test</div>', {
      allowedAttrs: new Set(['data-custom'])
    });
    expect(result).toContain('data-custom');
  });
});

describe('safeHtml template tag', () => {
  it('should escape interpolated values', () => {
    const input = '<script>alert("xss")</script>';
    const result = safeHtml`<div>${input}</div>`;
    expect(result).not.toContain('<script>');
    expect(result).toContain('&lt;script&gt;');
  });

  it('should handle multiple interpolations', () => {
    const a = '<b>';
    const b = '</b>';
    const result = safeHtml`<div>${a}content${b}</div>`;
    expect(result).toContain('&lt;b&gt;');
    expect(result).toContain('content');
  });

  it('should preserve numbers', () => {
    const num = 42;
    const result = safeHtml`<span>${num}</span>`;
    expect(result).toContain('42');
  });

  it('should handle null values', () => {
    const result = safeHtml`<div>${null}</div>`;
    expect(result).toBe('<div></div>');
  });

  it('should handle undefined values', () => {
    const result = safeHtml`<div>${undefined}</div>`;
    expect(result).toBe('<div></div>');
  });

  it('should handle arrays', () => {
    const items = ['<a>', '<b>', '<c>'];
    const result = safeHtml`<div>${items}</div>`;
    expect(result).toContain('&lt;a&gt;');
    expect(result).toContain('&lt;b&gt;');
    expect(result).toContain('&lt;c&gt;');
  });

  it('should preserve booleans', () => {
    const result = safeHtml`<div>${true}</div>`;
    expect(result).toContain('true');
  });
});

describe('markSafe', () => {
  it('should return the input unchanged', () => {
    const html = '<svg><circle/></svg>';
    expect(markSafe(html)).toBe(html);
  });

  it('should work with safeHtml template', () => {
    const safeIcon = markSafe('<svg>icon</svg>');
    const unsafeUser = '<script>alert(1)</script>';
    const result = safeHtml`<div>[SAFE]${safeIcon}</div><span>${unsafeUser}</span>`;
    expect(result).toContain('<svg>icon</svg>');
    expect(result).toContain('&lt;script&gt;');
  });
});

describe('setSafeHtml', () => {
  let container;

  beforeEach(() => {
    container = document.createElement('div');
  });

  it('should set sanitized HTML', () => {
    setSafeHtml(container, '<div>Safe</div><script>alert(1)</script>');
    expect(container.innerHTML).toContain('Safe');
    expect(container.innerHTML).not.toContain('<script>');
  });

  it('should handle null element', () => {
    expect(() => setSafeHtml(null, '<div>Test</div>')).not.toThrow();
  });

  it('should preserve safe content', () => {
    setSafeHtml(container, '<div class="test">Hello</div>');
    expect(container.querySelector('.test')).not.toBeNull();
    expect(container.textContent).toContain('Hello');
  });
});

describe('createElementFromHtml', () => {
  it('should create document fragment', () => {
    const fragment = createElementFromHtml('<div>Test</div>');
    expect(fragment).toBeInstanceOf(DocumentFragment);
  });

  it('should sanitize content', () => {
    const fragment = createElementFromHtml('<div>Safe</div><script>alert(1)</script>');
    const div = document.createElement('div');
    div.appendChild(fragment);
    expect(div.innerHTML).not.toContain('<script>');
  });

  it('should preserve multiple elements', () => {
    const fragment = createElementFromHtml('<span>A</span><span>B</span>');
    const div = document.createElement('div');
    div.appendChild(fragment);
    expect(div.querySelectorAll('span').length).toBe(2);
  });
});

describe('ALLOWED_TAGS', () => {
  it('should contain common safe tags', () => {
    expect(ALLOWED_TAGS.has('div')).toBe(true);
    expect(ALLOWED_TAGS.has('span')).toBe(true);
    expect(ALLOWED_TAGS.has('a')).toBe(true);
    expect(ALLOWED_TAGS.has('svg')).toBe(true);
  });

  it('should not contain dangerous tags', () => {
    expect(ALLOWED_TAGS.has('script')).toBe(false);
    expect(ALLOWED_TAGS.has('iframe')).toBe(false);
    expect(ALLOWED_TAGS.has('object')).toBe(false);
    expect(ALLOWED_TAGS.has('embed')).toBe(false);
  });
});

describe('ALLOWED_ATTRS', () => {
  it('should contain safe attributes', () => {
    expect(ALLOWED_ATTRS.has('class')).toBe(true);
    expect(ALLOWED_ATTRS.has('id')).toBe(true);
    expect(ALLOWED_ATTRS.has('href')).toBe(true);
    expect(ALLOWED_ATTRS.has('data-id')).toBe(true);
  });

  it('should not contain dangerous attributes', () => {
    expect(ALLOWED_ATTRS.has('onclick')).toBe(false);
    expect(ALLOWED_ATTRS.has('onerror')).toBe(false);
    expect(ALLOWED_ATTRS.has('srcdoc')).toBe(false);
  });
});
