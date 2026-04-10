// test/ui-components.test.js
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  escapeHtml,
  safeHtml,
  createElement,
  AgentUI
} from '../lib/ui-components.js';

describe('escapeHtml', () => {
  it('should escape HTML special characters', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
    );
  });

  it('should escape ampersand', () => {
    expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
  });

  it('should escape less than and greater than', () => {
    expect(escapeHtml('5 < 10 && 10 > 5')).toBe('5 &lt; 10 &amp;&amp; 10 &gt; 5');
  });

  it('should escape double quotes', () => {
    expect(escapeHtml('He said "Hello"')).toBe('He said &quot;Hello&quot;');
  });

  it('should escape single quotes', () => {
    expect(escapeHtml("It's working")).toBe('It&#039;s working');
  });

  it('should handle null', () => {
    expect(escapeHtml(null)).toBe('');
  });

  it('should handle undefined', () => {
    expect(escapeHtml(undefined)).toBe('');
  });

  it('should handle empty string', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('should handle plain text without special characters', () => {
    expect(escapeHtml('Hello World')).toBe('Hello World');
  });

  it('should convert numbers to string', () => {
    expect(escapeHtml(123)).toBe('123');
  });

  it('should handle complex HTML', () => {
    const input = '<div class="test" onclick="alert(1)">Text & more</div>';
    const expected =
      '&lt;div class=&quot;test&quot; onclick=&quot;alert(1)&quot;&gt;Text &amp; more&lt;/div&gt;';
    expect(escapeHtml(input)).toBe(expected);
  });
});

describe('safeHtml', () => {
  it('should create a document fragment from HTML', () => {
    const fragment = safeHtml('<div>Test</div>');
    expect(fragment).toBeInstanceOf(DocumentFragment);
    expect(fragment.firstChild).toBeInstanceOf(HTMLDivElement);
    expect(fragment.firstChild.textContent).toBe('Test');
  });

  it('should handle nested elements', () => {
    const fragment = safeHtml('<div><span>Nested</span></div>');
    expect(fragment.querySelector('span').textContent).toBe('Nested');
  });

  it('should handle multiple elements', () => {
    const fragment = safeHtml('<p>First</p><p>Second</p>');
    expect(fragment.children.length).toBe(2);
  });

  it('should handle empty string', () => {
    const fragment = safeHtml('');
    expect(fragment.childNodes.length).toBe(0);
  });

  it('should handle text nodes', () => {
    const fragment = safeHtml('Plain text');
    expect(fragment.textContent).toBe('Plain text');
  });
});

describe('createElement', () => {
  it('should create element with tag name', () => {
    const el = createElement('div');
    expect(el.tagName).toBe('DIV');
  });

  it('should set className from attrs', () => {
    const el = createElement('div', { className: 'test-class' });
    expect(el.className).toBe('test-class');
  });

  it('should set inline styles from attrs', () => {
    const el = createElement('div', {
      style: { color: 'red', fontSize: '16px' }
    });
    expect(el.style.color).toBe('red');
    expect(el.style.fontSize).toBe('16px');
  });

  it('should set regular attributes', () => {
    const el = createElement('input', { type: 'text', placeholder: 'Enter text' });
    expect(el.getAttribute('type')).toBe('text');
    expect(el.getAttribute('placeholder')).toBe('Enter text');
  });

  it('should add event listeners from on* attributes', () => {
    const handler = vi.fn();
    const el = createElement('button', { onClick: handler });

    el.click();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should set text content from string', () => {
    const el = createElement('p', {}, 'Hello World');
    expect(el.textContent).toBe('Hello World');
  });

  it('should append element content', () => {
    const child = document.createElement('span');
    child.textContent = 'Child';
    const el = createElement('div', {}, child);

    expect(el.firstChild).toBe(child);
  });

  it('should append document fragment content', () => {
    const fragment = document.createDocumentFragment();
    const span = document.createElement('span');
    fragment.appendChild(span);

    const el = createElement('div', {}, fragment);
    expect(el.firstChild).toBe(span);
  });

  it('should handle null content', () => {
    const el = createElement('div', {}, null);
    expect(el.childNodes.length).toBe(0);
  });

  it('should handle undefined content', () => {
    const el = createElement('div', {}, undefined);
    expect(el.childNodes.length).toBe(0);
  });

  it('should combine all options', () => {
    const handler = vi.fn();
    const el = createElement(
      'button',
      {
        className: 'btn primary',
        id: 'submit-btn',
        type: 'submit',
        onClick: handler
      },
      'Submit'
    );

    expect(el.tagName).toBe('BUTTON');
    expect(el.className).toBe('btn primary');
    expect(el.id).toBe('submit-btn');
    expect(el.getAttribute('type')).toBe('submit');
    expect(el.textContent).toBe('Submit');

    el.click();
    expect(handler).toHaveBeenCalled();
  });
});

describe('AgentUI', () => {
  let container;
  let outputSection;
  let outputContent;
  let clearBtn;

  beforeEach(() => {
    container = document.createElement('div');
    container.innerHTML = `
      <div id="output-section"></div>
      <div id="output-content"></div>
      <button id="clear-btn"></button>
    `;
    document.body.appendChild(container);

    outputSection = container.querySelector('#output-section');
    outputContent = container.querySelector('#output-content');
    clearBtn = container.querySelector('#clear-btn');
  });

  afterEach(() => {
    container.remove();
  });

  it('should create instance with default options', () => {
    const ui = new AgentUI();
    expect(ui.options.maxOutputEntries).toBe(200);
    expect(ui.options.pruneBatchSize).toBe(50);
    expect(ui.isRunning).toBe(false);
  });

  it('should accept custom options', () => {
    const ui = new AgentUI({
      maxOutputEntries: 100,
      pruneBatchSize: 20
    });
    expect(ui.options.maxOutputEntries).toBe(100);
    expect(ui.options.pruneBatchSize).toBe(20);
  });

  it('should initialize with elements', () => {
    const ui = new AgentUI({
      outputSection,
      outputContent,
      clearOutputBtn: clearBtn
    });

    expect(ui.options.outputSection).toBe(outputSection);
    expect(ui.options.outputContent).toBe(outputContent);
    expect(ui.options.clearOutputBtn).toBe(clearBtn);
  });

  it('should clear output when clear button clicked', () => {
    const ui = new AgentUI({
      outputSection,
      outputContent,
      clearOutputBtn: clearBtn
    });
    ui.init();

    outputContent.innerHTML = '<div>Some content</div>';
    expect(outputContent.children.length).toBe(1);

    clearBtn.click();
    expect(outputContent.children.length).toBe(0);
  });

  it('should track running state', () => {
    const ui = new AgentUI();
    expect(ui.isRunning).toBe(false);

    ui.isRunning = true;
    expect(ui.isRunning).toBe(true);
  });

  it('should prune old entries when max exceeded', () => {
    const ui = new AgentUI({
      outputContent,
      maxOutputEntries: 10,
      pruneBatchSize: 5
    });

    // Add 15 entries
    for (let i = 0; i < 15; i++) {
      const entry = document.createElement('div');
      entry.className = 'output-entry';
      entry.textContent = `Entry ${i}`;
      outputContent.appendChild(entry);
    }

    expect(outputContent.children.length).toBe(15);

    // Trigger pruning
    ui.pruneOutputEntries();

    // Should remove pruneBatchSize (5) entries
    expect(outputContent.children.length).toBe(10);
    expect(outputContent.firstChild.textContent).toBe('Entry 5');
  });

  it('should not prune if under max limit', () => {
    const ui = new AgentUI({
      outputContent,
      maxOutputEntries: 20,
      pruneBatchSize: 5
    });

    // Add 10 entries (under limit)
    for (let i = 0; i < 10; i++) {
      const entry = document.createElement('div');
      entry.className = 'output-entry';
      outputContent.appendChild(entry);
    }

    const initialCount = outputContent.children.length;
    ui.pruneOutputEntries();

    expect(outputContent.children.length).toBe(initialCount);
  });
});
