/**
 * Syntax Highlighting Worker
 * Performs syntax highlighting in a separate thread to avoid blocking UI
 */

// Token patterns for various languages
const TOKEN_PATTERNS = {
  javascript: [
    { pattern: /(\/\/.*$)/gm, className: 'comment' },
    { pattern: /(\/\*[\s\S]*?\*\/)/g, className: 'comment' },
    { pattern: /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g, className: 'string' },
    {
      pattern:
        /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|class|extends|import|export|from|default|async|await|try|catch|finally|throw|typeof|instanceof|in|of)\b/g,
      className: 'keyword'
    },
    { pattern: /\b(true|false|null|undefined|NaN|Infinity)\b/g, className: 'literal' },
    { pattern: /\b(\d+\.?\d*)\b/g, className: 'number' },
    { pattern: /\b([A-Z][a-zA-Z0-9]*)\b/g, className: 'class-name' },
    {
      pattern:
        /\b(console|document|window|Math|JSON|Array|Object|String|Number|Boolean|Date|RegExp|Promise|Map|Set)\b/g,
      className: 'builtin'
    },
    { pattern: /([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g, className: 'function' },
    { pattern: /([+\-*/%=<>!&|^~?:;,.[\]{}()])/g, className: 'operator' }
  ],
  html: [
    { pattern: /(&lt;!--[\s\S]*?--&gt;)/g, className: 'comment' },
    { pattern: /(&lt;\/?[a-zA-Z][a-zA-Z0-9]*)/g, className: 'tag' },
    { pattern: /(&gt;)/g, className: 'tag' },
    { pattern: /\s([a-zA-Z-]+)=/g, className: 'attr-name' },
    { pattern: /=("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g, className: 'attr-value' }
  ],
  css: [
    { pattern: /(\/\*[\s\S]*?\*\/)/g, className: 'comment' },
    { pattern: /([.#][a-zA-Z_-][a-zA-Z0-9_-]*)/g, className: 'selector' },
    { pattern: /\b([a-z-]+)\s*:/g, className: 'property' },
    { pattern: /:\s*([^;{}]+)/g, className: 'value' },
    { pattern: /(@[a-zA-Z]+)/g, className: 'at-rule' },
    { pattern: /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g, className: 'string' },
    { pattern: /\b(\d+\.?\d*)(px|em|rem|%|vh|vw|s|ms)?\b/g, className: 'number' },
    { pattern: /(#[a-fA-F0-9]{3,8})\b/g, className: 'color' }
  ],
  json: [
    { pattern: /("(?:[^"\\]|\\.)*")\s*:/g, className: 'key' },
    { pattern: /:\s*("(?:[^"\\]|\\.)*")/g, className: 'string' },
    { pattern: /\b(true|false|null)\b/g, className: 'literal' },
    { pattern: /\b(-?\d+\.?\d*)\b/g, className: 'number' }
  ],
  python: [
    { pattern: /(#.*$)/gm, className: 'comment' },
    { pattern: /("""[\s\S]*?"""|'''[\s\S]*?''')/g, className: 'string' },
    { pattern: /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g, className: 'string' },
    {
      pattern:
        /\b(def|class|if|elif|else|for|while|try|except|finally|with|as|import|from|return|yield|raise|pass|break|continue|and|or|not|in|is|lambda|True|False|None)\b/g,
      className: 'keyword'
    },
    { pattern: /\b(\d+\.?\d*)\b/g, className: 'number' },
    { pattern: /\b([A-Z][a-zA-Z0-9]*)\b/g, className: 'class-name' },
    { pattern: /(@[a-zA-Z]+)/g, className: 'decorator' }
  ],
  bash: [
    { pattern: /(#.*$)/gm, className: 'comment' },
    { pattern: /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g, className: 'string' },
    {
      pattern:
        /\b(if|then|else|fi|for|while|do|done|case|esac|function|return|exit|export|source|echo|printf|read|cd|pwd|mkdir|rm|cp|mv|ls|cat|grep|sed|awk|find|xargs|chmod|chown)\b/g,
      className: 'keyword'
    },
    { pattern: /(\$[a-zA-Z_][a-zA-Z0-9_]*)/g, className: 'variable' },
    { pattern: /(\$\{[^}]+\})/g, className: 'variable' },
    { pattern: /(-[a-zA-Z]+)/g, className: 'flag' }
  ]
};

/**
 * Escape HTML entities
 */
function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Tokenize code into spans
 */
function tokenize(code, lang) {
  const escaped = escapeHtml(code);
  const patterns = TOKEN_PATTERNS[lang] || TOKEN_PATTERNS.javascript;
  const tokens = [];

  // Create a mask for already processed positions
  const mask = new Array(escaped.length).fill(false);

  for (const { pattern, className } of patterns) {
    let match;
    const regex = new RegExp(pattern.source, pattern.flags);

    while ((match = regex.exec(escaped)) !== null) {
      const start = match.index;
      const end = start + match[0].length;

      // Check if this range is already masked
      let alreadyMasked = true;
      for (let i = start; i < end; i++) {
        if (!mask[i]) {
          alreadyMasked = false;
          break;
        }
      }

      if (!alreadyMasked) {
        // Mark positions as masked
        for (let i = start; i < end; i++) {
          mask[i] = true;
        }

        tokens.push({
          start,
          end,
          html: `<span class="token ${className}">${match[0]}</span>`
        });
      }
    }
  }

  // Sort tokens by start position
  tokens.sort((a, b) => a.start - b.start);

  // Build final HTML
  let lastEnd = 0;
  let result = '';

  for (const token of tokens) {
    if (token.start > lastEnd) {
      result += escaped.slice(lastEnd, token.start);
    }
    result += token.html;
    lastEnd = token.end;
  }

  if (lastEnd < escaped.length) {
    result += escaped.slice(lastEnd);
  }

  return result;
}

/**
 * Detect language from code patterns
 */
function detectLanguage(code) {
  const patterns = {
    javascript: [/\b(const|let|var|function)\s+\w+/, /=>\s*[({]/, /\bconsole\.\w+/],
    html: [/<(!DOCTYPE|html|head|body|div|span|p|a|script|style)/i],
    css: [/[.#][\w-]+\s*\{/, /@media|@keyframes/, /\w+\s*:\s*[\w#]+\s*;/],
    json: [/^\s*[{[]/, /"\w+"\s*:/],
    python: [/\bdef\s+\w+\s*\(/, /\bimport\s+\w+/, /\bfrom\s+\w+\s+import/],
    bash: [/^\s*#!\/bin\/(bash|sh)/, /\b(if|then|fi|for|do|done)\b/]
  };

  let maxScore = 0;
  let detectedLang = 'javascript';

  for (const [lang, tests] of Object.entries(patterns)) {
    let score = 0;
    for (const test of tests) {
      if (test.test(code)) {
        score++;
      }
    }
    if (score > maxScore) {
      maxScore = score;
      detectedLang = lang;
    }
  }

  return detectedLang;
}

/**
 * Highlight code with line numbers
 */
function highlightWithLineNumbers(code, lang) {
  const highlighted = tokenize(code, lang);
  const lines = highlighted.split('\n');

  return lines
    .map((line, i) => {
      const lineNum = `<span class="line-number">${i + 1}</span>`;
      return `<div class="line">${lineNum}<span class="line-content">${line}</span></div>`;
    })
    .join('');
}

// Worker message handler
self.onmessage = function(e) {
  const { id, action, payload } = e.data;

  try {
    let result;

    switch (action) {
      case 'highlight':
        result = tokenize(payload.code, payload.lang || 'javascript');
        break;

      case 'highlightWithLines':
        result = highlightWithLineNumbers(payload.code, payload.lang || 'javascript');
        break;

      case 'detect':
        result = detectLanguage(payload.code);
        break;

      case 'analyze':
        result = analyzeCode(payload.code, payload.lang);
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    self.postMessage({ id, success: true, result });
  } catch (error) {
    self.postMessage({ id, success: false, error: error.message });
  }
};

/**
 * Analyze code structure
 */
function analyzeCode(code, lang = 'javascript') {
  const analysis = {
    lines: code.split('\n').length,
    characters: code.length,
    functions: [],
    classes: [],
    imports: [],
    exports: [],
    variables: [],
    complexity: 0
  };

  if (lang === 'javascript' || lang === 'typescript') {
    // Extract function declarations
    const funcRegex =
      /(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(|(\w+)\s*:\s*(?:async\s*)?function|(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{)/g;
    let match;
    while ((match = funcRegex.exec(code)) !== null) {
      analysis.functions.push(match[1] || match[2] || match[3] || match[4]);
    }

    // Extract class declarations
    const classRegex = /class\s+(\w+)(?:\s+extends\s+(\w+))?/g;
    while ((match = classRegex.exec(code)) !== null) {
      analysis.classes.push({
        name: match[1],
        extends: match[2] || null
      });
    }

    // Extract imports
    const importRegex = /import\s+(?:(\{[^}]+\})|(\w+))\s+from\s+['"]([^'"]+)['"]/g;
    while ((match = importRegex.exec(code)) !== null) {
      analysis.imports.push({
        name: match[1] || match[2],
        source: match[3]
      });
    }

    // Extract exports
    const exportRegex = /export\s+(?:default\s+)?(?:class|function|const|let|var)?\s*(\w+)/g;
    while ((match = exportRegex.exec(code)) !== null) {
      analysis.exports.push(match[1]);
    }

    // Calculate cyclomatic complexity
    const complexityKeywords = ['if', 'else if', 'for', 'while', 'case', 'catch', '&&', '||', '?'];
    for (const keyword of complexityKeywords) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'g');
      const matches = code.match(regex);
      if (matches) {
        analysis.complexity += matches.length;
      }
    }
    analysis.complexity += 1; // Base complexity
  }

  return analysis;
}
