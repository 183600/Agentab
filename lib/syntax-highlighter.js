// lib/syntax-highlighter.js - Lightweight JavaScript syntax highlighter

/**
 * Simple JavaScript syntax highlighter without external dependencies
 * Provides basic syntax highlighting for code editors
 */
export class SyntaxHighlighter {
  constructor(options = {}) {
    this.options = {
      theme: options.theme || 'default',
      lineNumbers: options.lineNumbers !== false,
      tabSize: options.tabSize || 2,
      ...options
    };

    // Token patterns
    this.patterns = {
      // Comments
      singleLineComment: /\/\/.*$/gm,
      multiLineComment: /\/\*[\s\S]*?\*\//g,

      // Strings
      stringDouble: /"(?:[^"\\]|\\.)*"/g,
      stringSingle: /'(?:[^'\\]|\\.)*'/g,
      stringTemplate: /`(?:[^`\\]|\\.)*`/g,

      // Numbers
      number: /\b(\d+\.?\d*)\b/g,

      // Keywords
      keywords:
        /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|try|catch|finally|throw|new|class|extends|import|export|from|default|async|await|yield|typeof|instanceof|in|of|this|super|null|undefined|true|false|void|delete|static|get|set)\b/g,

      // Built-in objects
      builtins:
        /\b(Array|Object|String|Number|Boolean|Function|Symbol|Map|Set|WeakMap|WeakSet|Promise|Proxy|Reflect|JSON|Math|Date|RegExp|Error|TypeError|SyntaxError|ReferenceError|console|window|document|fetch|setTimeout|setInterval|clearTimeout|clearInterval|requestAnimationFrame|cancelAnimationFrame)\b/g,

      // Function calls
      functionCall: /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?=\()/g,

      // Properties
      property: /\.([a-zA-Z_$][a-zA-Z0-9_$]*)/g,

      // Operators
      operators: /([+\-*/%=&|^!<>?:]+)/g,

      // Punctuation
      punctuation: /([{}[\]();,.])/g
    };

    // Token styling
    this.styles = {
      comment: 'color: #6a737d; font-style: italic;',
      string: 'color: #032f62;',
      number: 'color: #005cc5;',
      keyword: 'color: #d73a49; font-weight: bold;',
      builtin: 'color: #6f42c1;',
      function: 'color: #6f42c1;',
      property: 'color: #005cc5;',
      operator: 'color: #d73a49;',
      punctuation: 'color: #24292e;',
      default: 'color: #24292e;'
    };

    // Dark theme styles
    this.darkStyles = {
      comment: 'color: #8b949e; font-style: italic;',
      string: 'color: #a5d6ff;',
      number: 'color: #79c0ff;',
      keyword: 'color: #ff7b72; font-weight: bold;',
      builtin: 'color: #d2a8ff;',
      function: 'color: #d2a8ff;',
      property: 'color: #79c0ff;',
      operator: 'color: #ff7b72;',
      punctuation: 'color: #c9d1d9;',
      default: 'color: #c9d1d9;'
    };
  }

  /**
   * Get style for token type
   * @param {string} type - Token type
   * @returns {string}
   */
  getStyle(type) {
    const styles = this.options.theme === 'dark' ? this.darkStyles : this.styles;
    return styles[type] || styles.default;
  }

  /**
   * Escape HTML entities
   * @param {string} text - Text to escape
   * @returns {string}
   */
  escapeHtml(text) {
    const entities = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, char => entities[char]);
  }

  /**
   * Highlight JavaScript code
   * @param {string} code - Code to highlight
   * @returns {string} HTML with syntax highlighting
   */
  highlight(code) {
    if (!code) return '';

    // First escape HTML
    let highlighted = this.escapeHtml(code);

    // Apply highlighting in specific order to avoid conflicts

    // 1. Comments (preserve them first)
    const comments = [];
    highlighted = highlighted.replace(this.patterns.multiLineComment, match => {
      comments.push(match);
      return `__COMMENT_${comments.length - 1}__`;
    });
    highlighted = highlighted.replace(this.patterns.singleLineComment, match => {
      comments.push(match);
      return `__COMMENT_${comments.length - 1}__`;
    });

    // 2. Strings (preserve them)
    const strings = [];
    highlighted = highlighted.replace(this.patterns.stringTemplate, match => {
      strings.push(match);
      return `__STRING_${strings.length - 1}__`;
    });
    highlighted = highlighted.replace(this.patterns.stringDouble, match => {
      strings.push(match);
      return `__STRING_${strings.length - 1}__`;
    });
    highlighted = highlighted.replace(this.patterns.stringSingle, match => {
      strings.push(match);
      return `__STRING_${strings.length - 1}__`;
    });

    // 3. Apply highlighting
    highlighted = highlighted
      .replace(this.patterns.keywords, `<span style="${this.getStyle('keyword')}">$1</span>`)
      .replace(this.patterns.builtins, `<span style="${this.getStyle('builtin')}">$1</span>`)
      .replace(this.patterns.number, `<span style="${this.getStyle('number')}">$1</span>`)
      .replace(this.patterns.functionCall, `<span style="${this.getStyle('function')}">$1</span>`)
      .replace(this.patterns.property, `.<span style="${this.getStyle('property')}">$1</span>`)
      .replace(this.patterns.operators, `<span style="${this.getStyle('operator')}">$1</span>`)
      .replace(
        this.patterns.punctuation,
        `<span style="${this.getStyle('punctuation')}">$1</span>`
      );

    // 4. Restore strings
    highlighted = highlighted.replace(/__STRING_(\d+)__/g, (match, index) => {
      const str = strings[parseInt(index)];
      return `<span style="${this.getStyle('string')}">${str}</span>`;
    });

    // 5. Restore comments
    highlighted = highlighted.replace(/__COMMENT_(\d+)__/g, (match, index) => {
      const comment = comments[parseInt(index)];
      return `<span style="${this.getStyle('comment')}">${comment}</span>`;
    });

    return highlighted;
  }

  /**
   * Highlight with line numbers
   * @param {string} code - Code to highlight
   * @returns {string} HTML with line numbers
   */
  highlightWithLineNumbers(code) {
    const lines = code.split('\n');
    const highlightedLines = lines.map(line => this.highlight(line));

    return highlightedLines
      .map(
        (line, i) =>
          `<span class="line-number">${(i + 1).toString().padStart(3, ' ')}</span> ${line}`
      )
      .join('\n');
  }
}

/**
 * CodeEditorWithHighlight - Textarea with syntax highlighting overlay
 */
export class CodeEditorWithHighlight {
  constructor(options = {}) {
    this.options = {
      textarea: null,
      highlightOverlay: null,
      highlighter: new SyntaxHighlighter({ theme: options.theme }),
      debounceDelay: 50,
      ...options
    };

    this.textarea = this.options.textarea;
    this.overlay = this.options.highlightOverlay;
    this.value = '';

    if (this.textarea) {
      this.init();
    }
  }

  /**
   * Initialize editor
   */
  init() {
    // Create overlay if not exists
    if (!this.overlay) {
      this.createOverlay();
    }

    // Sync scrolling
    this.textarea.addEventListener('scroll', () => {
      this.overlay.scrollTop = this.textarea.scrollTop;
      this.overlay.scrollLeft = this.textarea.scrollLeft;
    });

    // Highlight on input
    let timeout;
    this.textarea.addEventListener('input', () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => this.updateHighlight(), this.options.debounceDelay);
      this.value = this.textarea.value;
    });

    // Initial highlight
    this.updateHighlight();

    // Tab key support
    this.textarea.addEventListener('keydown', e => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = this.textarea.selectionStart;
        const end = this.textarea.selectionEnd;
        const spaces = ' '.repeat(this.options.highlighter.options.tabSize);
        this.textarea.value =
          this.textarea.value.substring(0, start) + spaces + this.textarea.value.substring(end);
        this.textarea.selectionStart = this.textarea.selectionEnd =
          start + this.options.highlighter.options.tabSize;
        this.updateHighlight();
      }
    });

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      this.overlay.style.width = `${this.textarea.offsetWidth}px`;
      this.overlay.style.height = `${this.textarea.offsetHeight}px`;
    });
    resizeObserver.observe(this.textarea);
  }

  /**
   * Create highlight overlay element
   */
  createOverlay() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'code-highlight-overlay';

    // Copy textarea styles
    const style = window.getComputedStyle(this.textarea);
    const copyStyles = [
      'fontFamily',
      'fontSize',
      'lineHeight',
      'letterSpacing',
      'padding',
      'paddingTop',
      'paddingRight',
      'paddingBottom',
      'paddingLeft',
      'border',
      'borderWidth',
      'boxSizing',
      'whiteSpace',
      'wordWrap',
      'wordBreak'
    ];

    copyStyles.forEach(prop => {
      this.overlay.style[prop] = style[prop];
    });

    // Position overlay
    this.overlay.style.position = 'absolute';
    this.overlay.style.top = '0';
    this.overlay.style.left = '0';
    this.overlay.style.width = `${this.textarea.offsetWidth}px`;
    this.overlay.style.height = `${this.textarea.offsetHeight}px`;
    this.overlay.style.pointerEvents = 'none';
    this.overlay.style.overflow = 'auto';
    this.overlay.style.color = 'transparent';
    this.overlay.style.background = 'transparent';

    // Insert overlay before textarea in a container
    const container = document.createElement('div');
    container.className = 'code-editor-container';
    container.style.position = 'relative';

    this.textarea.parentNode.insertBefore(container, this.textarea);
    container.appendChild(this.overlay);
    container.appendChild(this.textarea);

    // Make textarea transparent for text but visible for caret
    this.textarea.style.caretColor = 'inherit';
    this.textarea.style.background = 'transparent';
    this.textarea.style.color = 'transparent';
  }

  /**
   * Update syntax highlighting
   */
  updateHighlight() {
    if (!this.overlay) return;
    const code = this.textarea.value;
    this.overlay.innerHTML = this.options.highlighter.highlight(code) + '\n';
  }

  /**
   * Set theme
   * @param {string} theme - 'light' or 'dark'
   */
  setTheme(theme) {
    this.options.highlighter.options.theme = theme;
    this.updateHighlight();
  }

  /**
   * Get editor value
   * @returns {string}
   */
  getValue() {
    return this.textarea.value;
  }

  /**
   * Set editor value
   * @param {string} value
   */
  setValue(value) {
    this.textarea.value = value;
    this.value = value;
    this.updateHighlight();
  }

  /**
   * Focus editor
   */
  focus() {
    this.textarea.focus();
  }
}

/**
 * Add highlight overlay styles
 */
export function addHighlightStyles() {
  if (document.getElementById('syntax-highlight-styles')) return;

  const style = document.createElement('style');
  style.id = 'syntax-highlight-styles';
  style.textContent = `
    .code-editor-container {
      position: relative;
      display: inline-block;
      width: 100%;
    }
    
    .code-highlight-overlay {
      white-space: pre-wrap;
      word-wrap: break-word;
      z-index: 1;
    }
    
    .code-highlight-overlay span {
      display: inline;
    }
    
    .code-textarea {
      position: relative;
      z-index: 2;
      resize: none;
    }
    
    .code-textarea::selection {
      background: rgba(66, 133, 244, 0.3);
    }
    
    [data-theme="dark"] .code-textarea::selection {
      background: rgba(140, 150, 255, 0.3);
    }
  `;
  document.head.appendChild(style);
}

// Export singleton instance
export const defaultHighlighter = new SyntaxHighlighter();
