// lib/snippets.js - Code snippets library for common operations

/**
 * CodeSnippet - Represents a reusable code snippet
 */
export class CodeSnippet {
  constructor(options) {
    this.id = options.id;
    this.name = options.name;
    this.description = options.description;
    this.category = options.category;
    this.code = options.code;
    this.variables = options.variables || [];
    this.tags = options.tags || [];
  }

  /**
   * Apply variables to the code template
   * @param {Object} values - Variable values
   * @returns {string}
   */
  apply(values = {}) {
    let code = this.code;

    for (const variable of this.variables) {
      const value = values[variable.name] ?? variable.default ?? '';
      const pattern = new RegExp(`\\$\\{${variable.name}\\}`, 'g');
      code = code.replace(pattern, value);
    }

    return code;
  }
}

/**
 * SnippetLibrary - Manages code snippets
 */
export class SnippetLibrary {
  constructor() {
    this.snippets = new Map();
    this.categories = new Map();
    this.initializeBuiltIn();
  }

  /**
   * Add a snippet to the library
   * @param {CodeSnippet} snippet
   */
  add(snippet) {
    this.snippets.set(snippet.id, snippet);

    // Add to category
    if (!this.categories.has(snippet.category)) {
      this.categories.set(snippet.category, new Set());
    }
    this.categories.get(snippet.category).add(snippet.id);
  }

  /**
   * Get a snippet by ID
   * @param {string} id
   * @returns {CodeSnippet|undefined}
   */
  get(id) {
    return this.snippets.get(id);
  }

  /**
   * Get all snippets
   * @returns {Array<CodeSnippet>}
   */
  getAll() {
    return Array.from(this.snippets.values());
  }

  /**
   * Get snippets by category
   * @param {string} category
   * @returns {Array<CodeSnippet>}
   */
  getByCategory(category) {
    const ids = this.categories.get(category);
    if (!ids) return [];
    return Array.from(ids).map(id => this.snippets.get(id)).filter(Boolean);
  }

  /**
   * Get all categories
   * @returns {Array<string>}
   */
  getCategories() {
    return Array.from(this.categories.keys());
  }

  /**
   * Search snippets
   * @param {string} query
   * @returns {Array<CodeSnippet>}
   */
  search(query) {
    const lowerQuery = query.toLowerCase();
    return this.getAll().filter(snippet =>
      snippet.name.toLowerCase().includes(lowerQuery) ||
      snippet.description.toLowerCase().includes(lowerQuery) ||
      snippet.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
    );
  }

  /**
   * Initialize built-in snippets
   */
  initializeBuiltIn() {
    const builtInSnippets = [
      // === DOM Selection ===
      {
        id: 'select-element',
        name: 'Select Element',
        description: 'Select a single element by CSS selector',
        category: 'DOM',
        code: `const element = document.querySelector('${'${selector}'}');\nif (element) {\n  console.log('Found:', element);\n  return element;\n} else {\n  throw new Error('Element not found: ${'${selector}'}');\n}`,
        variables: [{ name: 'selector', description: 'CSS selector', default: '#my-element' }],
        tags: ['dom', 'select', 'query']
      },
      {
        id: 'select-all',
        name: 'Select All Elements',
        description: 'Select all elements matching a CSS selector',
        category: 'DOM',
        code: `const elements = document.querySelectorAll('${'${selector}'}');\nconsole.log('Found', elements.length, 'elements');\nreturn Array.from(elements);`,
        variables: [{ name: 'selector', description: 'CSS selector', default: '.item' }],
        tags: ['dom', 'select', 'queryAll']
      },

      // === Form Operations ===
      {
        id: 'fill-input',
        name: 'Fill Input Field',
        description: 'Fill a form input with text',
        category: 'Form',
        code: `const input = document.querySelector('${'${selector}'}');\nif (input) {\n  input.value = '${'${value}'}';\n  input.dispatchEvent(new Event('input', { bubbles: true }));\n  input.dispatchEvent(new Event('change', { bubbles: true }));\n  console.log('Filled:', input);\n  return input.value;\n} else {\n  throw new Error('Input not found: ${'${selector}'}');\n}`,
        variables: [
          { name: 'selector', description: 'Input selector', default: '#username' },
          { name: 'value', description: 'Value to fill', default: 'test@example.com' }
        ],
        tags: ['form', 'input', 'fill']
      },
      {
        id: 'submit-form',
        name: 'Submit Form',
        description: 'Submit a form',
        category: 'Form',
        code: `const form = document.querySelector('${'${selector}'}');\nif (form) {\n  form.submit();\n  console.log('Form submitted');\n  return true;\n} else {\n  throw new Error('Form not found: ${'${selector}'}');\n}`,
        variables: [{ name: 'selector', description: 'Form selector', default: 'form' }],
        tags: ['form', 'submit']
      },
      {
        id: 'fill-form-multi',
        name: 'Fill Multiple Fields',
        description: 'Fill multiple form fields at once',
        category: 'Form',
        code: `const fields = ${'${fields}'};\nObject.entries(fields).forEach(([selector, value]) => {\n  const input = document.querySelector(selector);\n  if (input) {\n    input.value = value;\n    input.dispatchEvent(new Event('input', { bubbles: true }));\n    input.dispatchEvent(new Event('change', { bubbles: true }));\n    console.log('Filled:', selector, '=', value);\n  }\n});\nreturn fields;`,
        variables: [{
          name: 'fields',
          description: 'Fields object',
          default: '{ "#name": "John", "#email": "john@example.com" }'
        }],
        tags: ['form', 'fill', 'multiple']
      },

      // === Data Extraction ===
      {
        id: 'extract-text',
        name: 'Extract Text',
        description: 'Extract text content from elements',
        category: 'Extraction',
        code: `const elements = document.querySelectorAll('${'${selector}'}');\nconst texts = Array.from(elements).map(el => el.textContent.trim());\nconsole.log('Extracted:', texts);\nreturn texts;`,
        variables: [{ name: 'selector', description: 'Element selector', default: 'p' }],
        tags: ['extract', 'text', 'scrape']
      },
      {
        id: 'extract-links',
        name: 'Extract Links',
        description: 'Extract all links from the page',
        category: 'Extraction',
        code: `const links = Array.from(document.querySelectorAll('a[href]'))\n  .map(a => ({\n    text: a.textContent.trim(),\n    href: a.href,\n    title: a.title\n  }))\n  .filter(link => link.href && !link.href.startsWith('javascript:'));\nconsole.log('Found', links.length, 'links');\nreturn links;`,
        variables: [],
        tags: ['extract', 'links', 'scrape']
      },
      {
        id: 'extract-images',
        name: 'Extract Images',
        description: 'Extract all images from the page',
        category: 'Extraction',
        code: `const images = Array.from(document.querySelectorAll('img[src]'))\n  .map(img => ({\n    src: img.src,\n    alt: img.alt,\n    width: img.naturalWidth,\n    height: img.naturalHeight\n  }));\nconsole.log('Found', images.length, 'images');\nreturn images;`,
        variables: [],
        tags: ['extract', 'images', 'scrape']
      },
      {
        id: 'extract-table',
        name: 'Extract Table Data',
        description: 'Extract data from an HTML table',
        category: 'Extraction',
        code: `const table = document.querySelector('${'${selector}'}');\nif (!table) throw new Error('Table not found');\n\nconst rows = Array.from(table.querySelectorAll('tr'));\nconst data = rows.map(row => \n  Array.from(row.querySelectorAll('td, th')).map(cell => cell.textContent.trim())\n);\nconsole.log('Extracted', data.length, 'rows');\nreturn data;`,
        variables: [{ name: 'selector', description: 'Table selector', default: 'table' }],
        tags: ['extract', 'table', 'data']
      },
      {
        id: 'extract-emails',
        name: 'Extract Email Addresses',
        description: 'Find all email addresses on the page',
        category: 'Extraction',
        code: `const text = document.body.innerText;\nconst emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}/g;\nconst emails = [...new Set(text.match(emailRegex) || [])];\nconsole.log('Found', emails.length, 'email addresses');\nreturn emails;`,
        variables: [],
        tags: ['extract', 'email', 'regex']
      },

      // === Navigation ===
      {
        id: 'click-element',
        name: 'Click Element',
        description: 'Click an element',
        category: 'Navigation',
        code: `const element = document.querySelector('${'${selector}'}');\nif (element) {\n  element.click();\n  console.log('Clicked:', element);\n  return true;\n} else {\n  throw new Error('Element not found: ${'${selector}'}');\n}`,
        variables: [{ name: 'selector', description: 'Element selector', default: 'button' }],
        tags: ['click', 'navigation']
      },
      {
        id: 'scroll-to',
        name: 'Scroll To Element',
        description: 'Scroll an element into view',
        category: 'Navigation',
        code: `const element = document.querySelector('${'${selector}'}');\nif (element) {\n  element.scrollIntoView({ behavior: 'smooth', block: 'center' });\n  console.log('Scrolled to:', element);\n  return true;\n} else {\n  throw new Error('Element not found: ${'${selector}'}');\n}`,
        variables: [{ name: 'selector', description: 'Element selector', default: '#section' }],
        tags: ['scroll', 'navigation']
      },
      {
        id: 'scroll-bottom',
        name: 'Scroll To Bottom',
        description: 'Scroll to the bottom of the page',
        category: 'Navigation',
        code: `window.scrollTo({\n  top: document.body.scrollHeight,\n  behavior: 'smooth'\n});\nconsole.log('Scrolled to bottom');\nreturn true;`,
        variables: [],
        tags: ['scroll', 'navigation']
      },

      // === Waiting ===
      {
        id: 'wait-element',
        name: 'Wait For Element',
        description: 'Wait for an element to appear',
        category: 'Wait',
        code: `const selector = '${'${selector}'}';\nconst timeout = ${'${timeout}'} * 1000;\n\nconst element = await new Promise((resolve, reject) => {\n  const existing = document.querySelector(selector);\n  if (existing) return resolve(existing);\n\n  const observer = new MutationObserver(() => {\n    const el = document.querySelector(selector);\n    if (el) {\n      observer.disconnect();\n      resolve(el);\n    }\n  });\n\n  observer.observe(document.body, { childList: true, subtree: true });\n\n  setTimeout(() => {\n    observer.disconnect();\n    reject(new Error('Timeout waiting for: ' + selector));\n  }, timeout);\n});\n\nconsole.log('Element appeared:', element);\nreturn element;`,
        variables: [
          { name: 'selector', description: 'CSS selector', default: '.loading' },
          { name: 'timeout', description: 'Timeout in seconds', default: '10' }
        ],
        tags: ['wait', 'async', 'observer']
      },
      {
        id: 'wait-sleep',
        name: 'Sleep/Wait',
        description: 'Wait for a specified duration',
        category: 'Wait',
        code: `await new Promise(resolve => setTimeout(resolve, ${'${ms}'}));\nconsole.log('Waited ${'${ms}'}ms');\nreturn true;`,
        variables: [{ name: 'ms', description: 'Milliseconds to wait', default: '1000' }],
        tags: ['wait', 'sleep', 'timeout']
      },

      // === Network ===
      {
        id: 'fetch-json',
        name: 'Fetch JSON',
        description: 'Fetch JSON data from an API',
        category: 'Network',
        code: `const response = await fetch('${'${url}'}');\nconst data = await response.json();\nconsole.log('Fetched:', data);\nreturn data;`,
        variables: [{ name: 'url', description: 'API URL', default: '/api/data' }],
        tags: ['fetch', 'api', 'json']
      },
      {
        id: 'post-data',
        name: 'POST Data',
        description: 'POST data to an API',
        category: 'Network',
        code: `const response = await fetch('${'${url}'}', {\n  method: 'POST',\n  headers: {\n    'Content-Type': 'application/json'\n  },\n  body: JSON.stringify(${'${data}'})\n});\nconst result = await response.json();\nconsole.log('POST result:', result);\nreturn result;`,
        variables: [
          { name: 'url', description: 'API URL', default: '/api/submit' },
          { name: 'data', description: 'Data to send', default: '{ key: "value" }' }
        ],
        tags: ['fetch', 'api', 'post']
      },

      // === Utilities ===
      {
        id: 'console-log',
        name: 'Console Log',
        description: 'Log a value to console',
        category: 'Utility',
        code: `console.log(${'${value}'});\nreturn ${'${value}'};`,
        variables: [{ name: 'value', description: 'Value to log', default: '"Hello"' }],
        tags: ['debug', 'log']
      },
      {
        id: 'get-page-info',
        name: 'Get Page Info',
        description: 'Get basic page information',
        category: 'Utility',
        code: `return {\n  url: window.location.href,\n  title: document.title,\n  domain: window.location.hostname,\n  userAgent: navigator.userAgent\n};`,
        variables: [],
        tags: ['info', 'page', 'meta']
      },
      {
        id: 'highlight-element',
        name: 'Highlight Element',
        description: 'Temporarily highlight an element',
        category: 'Utility',
        code: `const element = document.querySelector('${'${selector}'}');\nif (!element) throw new Error('Element not found');\n\nconst original = {\n  outline: element.style.outline,\n  background: element.style.background\n};\n\nelement.style.outline = '3px solid #ff4444';\nelement.style.background = 'rgba(255, 68, 68, 0.1)';\nelement.scrollIntoView({ behavior: 'smooth', block: 'center' });\n\nsetTimeout(() => {\n  element.style.outline = original.outline;\n  element.style.background = original.background;\n}, ${'${duration}'});\n\nconsole.log('Highlighted element');\nreturn true;`,
        variables: [
          { name: 'selector', description: 'CSS selector', default: '#target' },
          { name: 'duration', description: 'Duration in ms', default: '3000' }
        ],
        tags: ['debug', 'highlight', 'visual']
      }
    ];

    // Add all built-in snippets
    for (const snippetData of builtInSnippets) {
      this.add(new CodeSnippet(snippetData));
    }
  }
}

// Create and export default instance
export const snippetLibrary = new SnippetLibrary();

/**
 * Get snippet categories with localized names
 * @returns {Object}
 */
export function getCategoriesWithLabels() {
  return {
    'DOM': { label: 'DOM 操作', icon: '🔍' },
    'Form': { label: '表单操作', icon: '📝' },
    'Extraction': { label: '数据提取', icon: '📊' },
    'Navigation': { label: '页面导航', icon: '🧭' },
    'Wait': { label: '等待/延时', icon: '⏳' },
    'Network': { label: '网络请求', icon: '🌐' },
    'Utility': { label: '实用工具', icon: '🔧' }
  };
}
