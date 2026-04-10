// lib/templates.js - Task templates for quick task creation

/**
 * TaskTemplate - Predefined task template
 */
export class TaskTemplate {
  constructor(options) {
    this.id = options.id;
    this.name = options.name;
    this.description = options.description;
    this.category = options.category;
    this.type = options.type; // 'prompt' or 'code'
    this.content = options.content;
    this.icon = options.icon || '📝';
    this.tags = options.tags || [];
    this.variables = options.variables || [];
    this.examples = options.examples || [];
  }

  /**
   * Apply variables to template content
   * @param {Object} values
   * @returns {string}
   */
  apply(values = {}) {
    let content = this.content;

    for (const variable of this.variables) {
      const value = values[variable.name] ?? variable.default ?? '';
      const pattern = new RegExp(`\\{\\{${variable.name}\\}\\}`, 'g');
      content = content.replace(pattern, value);
    }

    return content;
  }
}

/**
 * TemplateLibrary - Manages task templates
 */
export class TemplateLibrary {
  constructor() {
    this.templates = new Map();
    this.categories = new Map();
    this.initializeBuiltIn();
  }

  /**
   * Add template
   * @param {TaskTemplate} template
   */
  add(template) {
    this.templates.set(template.id, template);

    if (!this.categories.has(template.category)) {
      this.categories.set(template.category, new Set());
    }
    this.categories.get(template.category).add(template.id);
  }

  /**
   * Get template by ID
   * @param {string} id
   * @returns {TaskTemplate|undefined}
   */
  get(id) {
    return this.templates.get(id);
  }

  /**
   * Get all templates
   * @returns {Array<TaskTemplate>}
   */
  getAll() {
    return Array.from(this.templates.values());
  }

  /**
   * Get templates by category
   * @param {string} category
   * @returns {Array<TaskTemplate>}
   */
  getByCategory(category) {
    const ids = this.categories.get(category);
    if (!ids) return [];
    return Array.from(ids)
      .map(id => this.templates.get(id))
      .filter(Boolean);
  }

  /**
   * Get all categories
   * @returns {Array<string>}
   */
  getCategories() {
    return Array.from(this.categories.keys());
  }

  /**
   * Search templates
   * @param {string} query
   * @returns {Array<TaskTemplate>}
   */
  search(query) {
    const lowerQuery = query.toLowerCase();
    return this.getAll().filter(
      template =>
        template.name.toLowerCase().includes(lowerQuery) ||
        template.description.toLowerCase().includes(lowerQuery) ||
        template.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
    );
  }

  /**
   * Initialize built-in templates
   */
  initializeBuiltIn() {
    const builtInTemplates = [
      // === Data Extraction Templates ===
      {
        id: 'extract-emails',
        name: '提取邮箱地址',
        description: '从页面中提取所有邮箱地址',
        category: '数据提取',
        type: 'prompt',
        content: '找出页面上所有的邮箱地址，以列表形式列出',
        icon: '📧',
        tags: ['提取', '邮箱', '数据'],
        examples: ['适用于任何包含邮箱地址的页面']
      },
      {
        id: 'extract-links',
        name: '提取所有链接',
        description: '提取页面上的所有链接及其文本',
        category: '数据提取',
        type: 'prompt',
        content: '提取页面上所有的链接，包括链接文本和URL，以JSON数组格式返回',
        icon: '🔗',
        tags: ['提取', '链接', '数据'],
        examples: ['适用于导航页面、文章列表等']
      },
      {
        id: 'extract-images',
        name: '提取图片信息',
        description: '提取页面上的所有图片',
        category: '数据提取',
        type: 'prompt',
        content: '提取页面上所有的图片，包括图片URL、alt文本和尺寸，以JSON格式返回',
        icon: '🖼️',
        tags: ['提取', '图片', '数据'],
        examples: ['适用于图库、电商产品页面']
      },
      {
        id: 'extract-table',
        name: '提取表格数据',
        description: '提取页面表格中的数据',
        category: '数据提取',
        type: 'prompt',
        content: '提取页面上的表格数据，以JSON二维数组格式返回',
        icon: '📊',
        tags: ['提取', '表格', '数据'],
        examples: ['适用于数据报表、价格表等']
      },
      {
        id: 'extract-prices',
        name: '提取价格信息',
        description: '提取页面上的价格信息',
        category: '数据提取',
        type: 'prompt',
        content: '找出页面上所有的价格信息，包括商品名称和价格，以JSON格式返回',
        icon: '💰',
        tags: ['提取', '价格', '电商'],
        examples: ['适用于电商网站、比价页面']
      },

      // === Form Operations Templates ===
      {
        id: 'fill-login',
        name: '自动填充登录表单',
        description: '填充用户名和密码字段',
        category: '表单操作',
        type: 'prompt',
        content: '用用户名 "{{username}}" 和密码 "{{password}}" 填写登录表单，然后点击登录按钮',
        icon: '🔑',
        tags: ['表单', '登录', '填充'],
        variables: [
          { name: 'username', description: '用户名', default: '' },
          { name: 'password', description: '密码', default: '' }
        ],
        examples: ['适用于标准登录页面']
      },
      {
        id: 'fill-form',
        name: '自动填充表单',
        description: '智能识别并填充表单字段',
        category: '表单操作',
        type: 'prompt',
        content: '填写页面上的表单，使用以下数据：{{data}}',
        icon: '📝',
        tags: ['表单', '填充'],
        variables: [{ name: 'data', description: '表单数据 (JSON格式)', default: '{}' }],
        examples: ['适用于注册表单、调查问卷等']
      },
      {
        id: 'clear-form',
        name: '清空表单',
        description: '清空页面表单中的所有字段',
        category: '表单操作',
        type: 'prompt',
        content: '清空页面上所有表单字段的值',
        icon: '🗑️',
        tags: ['表单', '清空'],
        examples: ['适用于重置表单']
      },

      // === Navigation Templates ===
      {
        id: 'click-button',
        name: '点击按钮',
        description: '点击页面上的特定按钮',
        category: '页面导航',
        type: 'prompt',
        content: '找到并点击 "{{buttonText}}" 按钮',
        icon: '👆',
        tags: ['点击', '按钮', '导航'],
        variables: [{ name: 'buttonText', description: '按钮文本', default: '提交' }],
        examples: ['适用于各种操作按钮']
      },
      {
        id: 'scroll-load',
        name: '滚动加载更多',
        description: '滚动页面加载更多内容',
        category: '页面导航',
        type: 'prompt',
        content: '滚动到页面底部，触发"加载更多"，直到没有新内容为止，最多加载 {{maxPages}} 次',
        icon: '⬇️',
        tags: ['滚动', '加载', '无限滚动'],
        variables: [{ name: 'maxPages', description: '最大加载次数', default: '5' }],
        examples: ['适用于社交媒体、商品列表等']
      },
      {
        id: 'navigate-menu',
        name: '导航菜单',
        description: '通过菜单导航到指定页面',
        category: '页面导航',
        type: 'prompt',
        content: '在导航菜单中找到 "{{menuItem}}" 并点击',
        icon: '🧭',
        tags: ['导航', '菜单'],
        variables: [{ name: 'menuItem', description: '菜单项名称', default: '' }],
        examples: ['适用于网站导航']
      },

      // === Content Analysis Templates ===
      {
        id: 'summarize-page',
        name: '总结页面内容',
        description: '总结页面主要内容',
        category: '内容分析',
        type: 'prompt',
        content: '总结这个页面的主要内容，包括标题、关键信息和主要段落',
        icon: '📄',
        tags: ['分析', '总结', '内容'],
        examples: ['适用于文章、博客、新闻页面']
      },
      {
        id: 'find-keywords',
        name: '提取关键词',
        description: '提取页面关键词',
        category: '内容分析',
        type: 'prompt',
        content: '分析页面内容，提取出最重要的 {{count}} 个关键词',
        icon: '🏷️',
        tags: ['分析', '关键词', '内容'],
        variables: [{ name: 'count', description: '关键词数量', default: '10' }],
        examples: ['适用于文章分析、SEO分析']
      },
      {
        id: 'check-element',
        name: '检查元素存在',
        description: '检查页面是否包含特定元素',
        category: '内容分析',
        type: 'prompt',
        content: '检查页面上是否存在 "{{selector}}" 元素，返回存在状态和元素数量',
        icon: '🔍',
        tags: ['检查', '元素', '验证'],
        variables: [{ name: 'selector', description: 'CSS选择器或元素描述', default: '.product' }],
        examples: ['适用于元素验证、页面测试']
      },

      // === Code Templates ===
      {
        id: 'code-wait-click',
        name: '等待并点击',
        description: '等待元素出现后点击',
        category: '代码模板',
        type: 'code',
        content: `// 等待元素出现后点击
const selector = '{{selector}}';
const timeout = {{timeout}} * 1000;

const element = await new Promise((resolve, reject) => {
  const existing = document.querySelector(selector);
  if (existing) return resolve(existing);
  
  const observer = new MutationObserver(() => {
    const el = document.querySelector(selector);
    if (el) {
      observer.disconnect();
      resolve(el);
    }
  });
  
  observer.observe(document.body, { childList: true, subtree: true });
  setTimeout(() => {
    observer.disconnect();
    reject(new Error('Timeout: ' + selector));
  }, timeout);
});

element.click();
console.log('Clicked:', element);
return true;`,
        icon: '⚡',
        tags: ['代码', '等待', '点击'],
        variables: [
          { name: 'selector', description: 'CSS选择器', default: 'button' },
          { name: 'timeout', description: '超时秒数', default: '10' }
        ]
      },
      {
        id: 'code-extract-json',
        name: '提取并格式化JSON',
        description: '提取页面数据并格式化为JSON',
        category: '代码模板',
        type: 'code',
        content: `// 提取页面数据
const data = {
  url: window.location.href,
  title: document.title,
  timestamp: new Date().toISOString(),
  // 添加更多字段...
};

console.log('Extracted:', JSON.stringify(data, null, 2));
return data;`,
        icon: '📦',
        tags: ['代码', '提取', 'JSON']
      },
      {
        id: 'code-batch-click',
        name: '批量点击',
        description: '依次点击多个元素',
        category: '代码模板',
        type: 'code',
        content: `// 批量点击元素
const selector = '{{selector}}';
const delay = {{delay}};

const elements = document.querySelectorAll(selector);
console.log('Found', elements.length, 'elements');

for (const element of elements) {
  element.click();
  console.log('Clicked:', element);
  await new Promise(r => setTimeout(r, delay));
}

return elements.length;`,
        icon: '🔄',
        tags: ['代码', '批量', '点击'],
        variables: [
          { name: 'selector', description: 'CSS选择器', default: '.item button' },
          { name: 'delay', description: '点击间隔(ms)', default: '500' }
        ]
      },

      // === Testing Templates ===
      {
        id: 'test-form-validation',
        name: '测试表单验证',
        description: '测试表单验证规则',
        category: '测试验证',
        type: 'prompt',
        content: '测试这个表单的验证功能：尝试提交空表单，检查是否显示错误提示，并报告验证结果',
        icon: '🧪',
        tags: ['测试', '表单', '验证'],
        examples: ['适用于表单测试']
      },
      {
        id: 'test-ui-state',
        name: '检查UI状态',
        description: '检查页面UI状态是否正确',
        category: '测试验证',
        type: 'prompt',
        content: '检查页面上的 {{element}} 是否处于正确状态（可见/隐藏/启用/禁用），报告当前状态',
        icon: '✅',
        tags: ['测试', 'UI', '状态'],
        variables: [{ name: 'element', description: '元素描述', default: '主要按钮' }],
        examples: ['适用于UI状态验证']
      }
    ];

    for (const templateData of builtInTemplates) {
      this.add(new TaskTemplate(templateData));
    }
  }
}

// Create and export default instance
export const templateLibrary = new TemplateLibrary();

/**
 * Get template categories with metadata
 * @returns {Object}
 */
export function getTemplateCategoriesWithMeta() {
  return {
    数据提取: { label: '数据提取', icon: '📊', color: '#6366f1' },
    表单操作: { label: '表单操作', icon: '📝', color: '#10b981' },
    页面导航: { label: '页面导航', icon: '🧭', color: '#f59e0b' },
    内容分析: { label: '内容分析', icon: '📄', color: '#8b5cf6' },
    代码模板: { label: '代码模板', icon: '⚡', color: '#ef4444' },
    测试验证: { label: '测试验证', icon: '🧪', color: '#3b82f6' }
  };
}
