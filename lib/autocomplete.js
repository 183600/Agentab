// lib/autocomplete.js - Code autocomplete and intelligent suggestions

import { snippetLibrary } from './snippets.js';

/**
 * CompletionType - Types of completions
 */
export const CompletionType = {
  KEYWORD: 'keyword',
  METHOD: 'method',
  PROPERTY: 'property',
  VARIABLE: 'variable',
  FUNCTION: 'function',
  SNIPPET: 'snippet',
  SELECTOR: 'selector',
  TEMPLATE: 'template'
};

/**
 * AutocompleteEngine - Provides intelligent code completion
 */
export class AutocompleteEngine {
  constructor(options = {}) {
    this.options = {
      maxSuggestions: options.maxSuggestions || 10,
      minTriggerLength: options.minTriggerLength || 2,
      enableSnippets: options.enableSnippets ?? true,
      enableSelectors: options.enableSelectors ?? true,
      enableTemplates: options.enableTemplates ?? true,
      ...options
    };

    this.contextKeywords = new Map();
    this.domKeywords = this.initDOMKeywords();
    this.agentKeywords = this.initAgentKeywords();
    this.jsKeywords = this.initJSKeywords();
  }

  /**
   * Initialize DOM-related keywords
   * @returns {Map}
   */
  initDOMKeywords() {
    const keywords = new Map();

    // Document methods
    const docMethods = [
      'querySelector',
      'querySelectorAll',
      'getElementById',
      'getElementsByClassName',
      'getElementsByTagName',
      'createElement',
      'createTextNode',
      'createDocumentFragment',
      'addEventListener',
      'removeEventListener',
      'dispatchEvent'
    ];

    docMethods.forEach(method => {
      keywords.set(method, {
        type: CompletionType.METHOD,
        insertText: method,
        documentation: `Document.${method}()`,
        trigger: '.'
      });
    });

    // Element properties
    const elementProps = [
      'innerHTML',
      'outerHTML',
      'textContent',
      'innerText',
      'value',
      'className',
      'classList',
      'style',
      'attributes',
      'children',
      'parentElement',
      'firstElementChild',
      'lastElementChild',
      'nextElementSibling',
      'previousElementSibling'
    ];

    elementProps.forEach(prop => {
      keywords.set(prop, {
        type: CompletionType.PROPERTY,
        insertText: prop,
        documentation: `Element.${prop}`,
        trigger: '.'
      });
    });

    // Event types
    const eventTypes = [
      'click',
      'dblclick',
      'mouseenter',
      'mouseleave',
      'mousedown',
      'mouseup',
      'keydown',
      'keyup',
      'keypress',
      'change',
      'input',
      'submit',
      'focus',
      'blur',
      'load',
      'error',
      'scroll',
      'resize'
    ];

    eventTypes.forEach(event => {
      keywords.set(event, {
        type: CompletionType.KEYWORD,
        insertText: `'${event}'`,
        documentation: `Event: ${event}`,
        trigger: ''
      });
    });

    return keywords;
  }

  /**
   * Initialize Chrome Agent helper methods
   * @returns {Map}
   */
  initAgentKeywords() {
    const keywords = new Map();

    const methods = [
      {
        name: 'waitForElement',
        template: 'await __chromeAgent.waitForElement(${1:selector}, ${2:timeout})'
      },
      {
        name: 'typeText',
        template: 'await __chromeAgent.typeText(${1:selector}, ${2:text}, ${3:delay})'
      },
      {
        name: 'clickElement',
        template: 'await __chromeAgent.clickElement(${1:selector}, ${2:retries})'
      },
      { name: 'getVisibleText', template: '__chromeAgent.getVisibleText(${1:selector})' },
      { name: 'sleep', template: 'await __chromeAgent.sleep(${1:ms})' },
      { name: 'extractTable', template: '__chromeAgent.extractTable(${1:selector})' },
      {
        name: 'fillForm',
        template: 'await __chromeAgent.fillForm({\n\t${1:selector}: ${2:value}\n})'
      }
    ];

    methods.forEach(({ name, template }) => {
      keywords.set(name, {
        type: CompletionType.METHOD,
        insertText: template,
        documentation: `__chromeAgent.${name}()`,
        trigger: '.'
      });
    });

    return keywords;
  }

  /**
   * Initialize JavaScript keywords
   * @returns {Map}
   */
  initJSKeywords() {
    const keywords = new Map();

    const jsKeywords = [
      'async',
      'await',
      'break',
      'case',
      'catch',
      'const',
      'continue',
      'debugger',
      'default',
      'do',
      'else',
      'export',
      'extends',
      'finally',
      'for',
      'function',
      'if',
      'import',
      'let',
      'new',
      'return',
      'switch',
      'this',
      'throw',
      'try',
      'typeof',
      'var',
      'void',
      'while',
      'with',
      'yield'
    ];

    jsKeywords.forEach(keyword => {
      keywords.set(keyword, {
        type: CompletionType.KEYWORD,
        insertText: keyword,
        documentation: `Keyword: ${keyword}`,
        trigger: ''
      });
    });

    const builtins = [
      'console',
      'Math',
      'JSON',
      'Array',
      'Object',
      'String',
      'Number',
      'Boolean',
      'Date',
      'Promise',
      'Map',
      'Set',
      'Symbol',
      'Error',
      'setTimeout',
      'setInterval',
      'clearTimeout',
      'clearInterval',
      'fetch',
      'URL',
      'URLSearchParams',
      'FormData'
    ];

    builtins.forEach(builtin => {
      keywords.set(builtin, {
        type: CompletionType.VARIABLE,
        insertText: builtin,
        documentation: `Built-in: ${builtin}`,
        trigger: ''
      });
    });

    return keywords;
  }

  /**
   * Get completions for current context
   * @param {string} code - Full code
   * @param {number} position - Cursor position
   * @param {Object} context - Additional context
   * @returns {Array}
   */
  getCompletions(code, position, context = {}) {
    const completions = [];
    const { line, column, word, trigger } = this.getContextInfo(code, position);

    // Get word being typed
    const currentWord = word || '';

    // Check minimum length
    if (currentWord.length < this.options.minTriggerLength && !trigger) {
      return completions;
    }

    // Get completions based on context
    if (trigger === '.' || this.looksLikeMethodCall(line, column)) {
      // Method/property completion
      completions.push(...this.getMemberCompletions(line, currentWord));
    } else if (
      trigger === 'querySelector' ||
      trigger === 'querySelectorAll' ||
      this.looksLikeSelector(currentWord)
    ) {
      // Selector completion
      if (this.options.enableSelectors) {
        completions.push(...this.getSelectorCompletions(currentWord, context));
      }
    } else {
      // General completions
      completions.push(...this.getKeywordCompletions(currentWord));
      completions.push(...this.getJSCompletions(currentWord));

      // Snippets
      if (this.options.enableSnippets && currentWord.length >= 2) {
        completions.push(...this.getSnippetCompletions(currentWord));
      }
    }

    // Sort and limit
    return this.rankAndLimit(completions, currentWord);
  }

  /**
   * Get context information at cursor position
   * @param {string} code - Full code
   * @param {number} position - Cursor position
   * @returns {Object}
   */
  getContextInfo(code, position) {
    const lines = code.substring(0, position).split('\n');
    const line = lines[lines.length - 1];
    const column = line.length;

    // Find word being typed
    const wordMatch = line.match(/(\w+)$/);
    const word = wordMatch ? wordMatch[1] : '';

    // Find trigger character
    const triggerMatch = line.match(/(\S)\s*\w*$/);
    const trigger = triggerMatch ? triggerMatch[1] : '';

    return { line, column, word, trigger };
  }

  /**
   * Check if context looks like a method call
   * @param {string} line - Current line
   * @param {number} column - Column position
   * @returns {boolean}
   */
  looksLikeMethodCall(line, column) {
    const before = line.substring(0, column);
    return /\.\w*$/.test(before);
  }

  /**
   * Check if word looks like a CSS selector
   * @param {string} word - Word to check
   * @returns {boolean}
   */
  looksLikeSelector(word) {
    return /^[.#]/.test(word) || word.includes('-');
  }

  /**
   * Get member completions (methods/properties)
   * @param {string} line - Current line
   * @param {string} word - Current word
   * @returns {Array}
   */
  getMemberCompletions(line, word) {
    const completions = [];

    // Check context to determine which members to suggest
    if (line.includes('document') || line.includes('element')) {
      this.domKeywords.forEach((info, key) => {
        if (!word || key.toLowerCase().includes(word.toLowerCase())) {
          completions.push({
            label: key,
            kind: info.type,
            insertText: info.insertText,
            documentation: info.documentation
          });
        }
      });
    }

    if (line.includes('__chromeAgent')) {
      this.agentKeywords.forEach((info, key) => {
        if (!word || key.toLowerCase().includes(word.toLowerCase())) {
          completions.push({
            label: key,
            kind: info.type,
            insertText: info.insertText,
            documentation: info.documentation
          });
        }
      });
    }

    return completions;
  }

  /**
   * Get keyword completions
   * @param {string} word - Current word
   * @returns {Array}
   */
  getKeywordCompletions(word) {
    const completions = [];

    // Add common patterns
    const patterns = [
      {
        label: 'document.querySelector',
        insertText: "document.querySelector('${1:selector}')",
        documentation: 'Query selector'
      },
      {
        label: 'document.querySelectorAll',
        insertText: "document.querySelectorAll('${1:selector}')",
        documentation: 'Query all selectors'
      },
      {
        label: 'async function',
        insertText: 'async function ${1:name}(${2:params}) {\n\t${3}\n}',
        documentation: 'Async function'
      },
      {
        label: 'arrow function',
        insertText: '(${1:params}) => ${2:expression}',
        documentation: 'Arrow function'
      },
      { label: 'console.log', insertText: 'console.log(${1:value})', documentation: 'Console log' }
    ];

    patterns.forEach(pattern => {
      if (!word || pattern.label.toLowerCase().includes(word.toLowerCase())) {
        completions.push({
          label: pattern.label,
          kind: CompletionType.TEMPLATE,
          insertText: pattern.insertText,
          documentation: pattern.documentation
        });
      }
    });

    return completions;
  }

  /**
   * Get JavaScript completions
   * @param {string} word - Current word
   * @returns {Array}
   */
  getJSCompletions(word) {
    const completions = [];

    this.jsKeywords.forEach((info, key) => {
      if (!word || key.toLowerCase().startsWith(word.toLowerCase())) {
        completions.push({
          label: key,
          kind: info.type,
          insertText: info.insertText,
          documentation: info.documentation
        });
      }
    });

    return completions;
  }

  /**
   * Get snippet completions
   * @param {string} word - Current word
   * @returns {Array}
   */
  getSnippetCompletions(word) {
    const completions = [];
    const snippets = snippetLibrary.getAll();

    snippets.forEach(snippet => {
      if (
        !word ||
        snippet.name.toLowerCase().includes(word.toLowerCase()) ||
        snippet.shortcut?.toLowerCase().includes(word.toLowerCase())
      ) {
        completions.push({
          label: snippet.name,
          kind: CompletionType.SNIPPET,
          insertText: snippet.code,
          documentation: snippet.description,
          shortcut: snippet.shortcut
        });
      }
    });

    return completions;
  }

  /**
   * Get selector completions
   * @param {string} word - Current word
   * @param {Object} context - Page context
   * @returns {Array}
   */
  getSelectorCompletions(word, _context = {}) {
    const completions = [];

    // Common selectors
    const commonSelectors = [
      { selector: 'body', description: 'Body element' },
      { selector: 'head', description: 'Head element' },
      { selector: 'header', description: 'Header element' },
      { selector: 'footer', description: 'Footer element' },
      { selector: 'main', description: 'Main content' },
      { selector: 'nav', description: 'Navigation' },
      { selector: 'article', description: 'Article element' },
      { selector: 'section', description: 'Section element' },
      { selector: 'form', description: 'Form element' },
      { selector: 'input[type="text"]', description: 'Text input' },
      { selector: 'input[type="email"]', description: 'Email input' },
      { selector: 'input[type="password"]', description: 'Password input' },
      { selector: 'button', description: 'Button element' },
      { selector: 'a[href]', description: 'Link with href' },
      { selector: 'img', description: 'Image element' }
    ];

    commonSelectors.forEach(({ selector, description }) => {
      const selectorText =
        selector.startsWith('#') || selector.startsWith('.') ? selector : `'${selector}'`;
      if (!word || selector.toLowerCase().includes(word.toLowerCase())) {
        completions.push({
          label: selector,
          kind: CompletionType.SELECTOR,
          insertText: selectorText,
          documentation: description
        });
      }
    });

    return completions;
  }

  /**
   * Rank and limit completions
   * @param {Array} completions - Completions to rank
   * @param {string} word - Current word
   * @returns {Array}
   */
  rankAndLimit(completions, word) {
    // Remove duplicates
    const unique = new Map();
    completions.forEach(c => {
      if (!unique.has(c.label)) {
        unique.set(c.label, c);
      }
    });

    const ranked = Array.from(unique.values());

    // Sort by relevance
    if (word) {
      ranked.sort((a, b) => {
        const aStartsWith = a.label.toLowerCase().startsWith(word.toLowerCase());
        const bStartsWith = b.label.toLowerCase().startsWith(word.toLowerCase());

        if (aStartsWith && !bStartsWith) return -1;
        if (!aStartsWith && bStartsWith) return 1;

        return a.label.localeCompare(b.label);
      });
    } else {
      ranked.sort((a, b) => a.label.localeCompare(b.label));
    }

    // Limit results
    return ranked.slice(0, this.options.maxSuggestions);
  }

  /**
   * Clear keyword cache
   */
  clearCache() {
    this.contextKeywords.clear();
  }
}

// Export singleton
export const autocompleteEngine = new AutocompleteEngine();

/**
 * Integration helper for textarea/input elements
 */
export class AutocompleteUI {
  constructor(element, engine = autocompleteEngine) {
    this.element = element;
    this.engine = engine;
    this.dropdown = null;
    this.selectedIndex = 0;
    this.completions = [];
    this.visible = false;

    this.setup();
  }

  /**
   * Setup autocomplete UI
   */
  setup() {
    this.element.addEventListener('input', this.handleInput.bind(this));
    this.element.addEventListener('keydown', this.handleKeydown.bind(this));
    this.element.addEventListener('blur', this.hide.bind(this));

    this.createDropdown();
  }

  /**
   * Create dropdown element
   */
  createDropdown() {
    this.dropdown = document.createElement('div');
    this.dropdown.className = 'autocomplete-dropdown';
    this.dropdown.style.cssText = `
      position: absolute;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 4px;
      max-height: 200px;
      overflow-y: auto;
      z-index: 1000;
      display: none;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    `;

    document.body.appendChild(this.dropdown);
  }

  /**
   * Handle input event
   */
  handleInput() {
    const position = this.element.selectionStart;
    const code = this.element.value;

    this.completions = this.engine.getCompletions(code, position);

    if (this.completions.length > 0) {
      this.show();
    } else {
      this.hide();
    }
  }

  /**
   * Handle keydown event
   */
  handleKeydown(event) {
    if (!this.visible) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.selectNext();
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.selectPrevious();
        break;
      case 'Enter':
      case 'Tab':
        event.preventDefault();
        this.acceptSelection();
        break;
      case 'Escape':
        event.preventDefault();
        this.hide();
        break;
    }
  }

  /**
   * Show dropdown
   */
  show() {
    this.visible = true;
    this.selectedIndex = 0;
    this.renderDropdown();
    this.positionDropdown();
    this.dropdown.style.display = 'block';
  }

  /**
   * Hide dropdown
   */
  hide() {
    this.visible = false;
    this.dropdown.style.display = 'none';
  }

  /**
   * Render dropdown items
   */
  renderDropdown() {
    this.dropdown.innerHTML = '';

    this.completions.forEach((completion, index) => {
      const item = document.createElement('div');
      item.className = `autocomplete-item ${index === this.selectedIndex ? 'selected' : ''}`;
      item.style.cssText = `
        padding: 6px 12px;
        cursor: pointer;
        ${index === this.selectedIndex ? 'background: var(--bg-hover);' : ''}
      `;
      item.innerHTML = `
        <span style="font-weight: 500;">${completion.label}</span>
        <span style="color: var(--text-muted); font-size: 11px; margin-left: 8px;">${completion.documentation || ''}</span>
      `;

      item.addEventListener('click', () => {
        this.selectedIndex = index;
        this.acceptSelection();
      });

      item.addEventListener('mouseenter', () => {
        this.selectedIndex = index;
        this.renderDropdown();
      });

      this.dropdown.appendChild(item);
    });
  }

  /**
   * Position dropdown near cursor
   */
  positionDropdown() {
    const rect = this.element.getBoundingClientRect();
    this.dropdown.style.top = `${rect.bottom + window.scrollY}px`;
    this.dropdown.style.left = `${rect.left + window.scrollX}px`;
    this.dropdown.style.width = `${Math.min(rect.width, 400)}px`;
  }

  /**
   * Select next item
   */
  selectNext() {
    this.selectedIndex = (this.selectedIndex + 1) % this.completions.length;
    this.renderDropdown();
  }

  /**
   * Select previous item
   */
  selectPrevious() {
    this.selectedIndex =
      (this.selectedIndex - 1 + this.completions.length) % this.completions.length;
    this.renderDropdown();
  }

  /**
   * Accept current selection
   */
  acceptSelection() {
    const completion = this.completions[this.selectedIndex];
    if (!completion) return;

    // Simple insertion (for now - could be enhanced with placeholder support)
    const start = this.element.selectionStart;
    const end = this.element.selectionEnd;
    const value = this.element.value;

    this.element.value = value.substring(0, start) + completion.insertText + value.substring(end);
    this.element.focus();
    this.element.selectionStart = this.element.selectionEnd = start + completion.insertText.length;

    this.hide();
  }

  /**
   * Destroy autocomplete UI
   */
  destroy() {
    this.element.removeEventListener('input', this.handleInput);
    this.element.removeEventListener('keydown', this.handleKeydown);
    this.element.removeEventListener('blur', this.hide);

    if (this.dropdown && this.dropdown.parentNode) {
      this.dropdown.parentNode.removeChild(this.dropdown);
    }
  }
}
