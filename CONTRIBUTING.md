# 贡献指南

感谢您有兴趣为 Agentab 做出贡献！本文档将帮助您开始贡献流程。

## 📋 目录

- [行为准则](#行为准则)
- [如何贡献](#如何贡献)
- [开发设置](#开发设置)
- [项目结构](#项目结构)
- [编码规范](#编码规范)
- [提交规范](#提交规范)
- [测试](#测试)
- [文档](#文档)
- [发布流程](#发布流程)

## 行为准则

本项目采用贡献者公约作为行为准则。参与此项目即表示您同意遵守其条款。请阅读 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) 了解详情。

## 如何贡献

### 报告 Bug

如果您发现了 bug，请创建一个 issue 并包含：

1. **清晰的标题** - 简要描述问题
2. **复现步骤** - 详细的步骤列表
3. **预期行为** - 您期望发生什么
4. **实际行为** - 实际发生了什么
5. **环境信息** - Chrome 版本、操作系统、扩展版本
6. **截图** - 如果适用
7. **日志** - 从开发者工具复制的相关日志

### 建议新功能

欢迎提出新功能建议！请创建一个 issue 并包含：

1. **清晰的标题** - 描述建议的功能
2. **用例** - 为什么需要这个功能
3. **实现思路** - 如果您有想法，请分享
4. **替代方案** - 考虑过的其他方案

### 提交 Pull Request

1. Fork 本仓库
2. 创建您的功能分支 (`git checkout -b feature/amazing-feature`)
3. 进行更改
4. 确保通过所有测试 (`npm run validate`)
5. 提交您的更改 (`git commit -m 'feat: add amazing feature'`)
6. 推送到分支 (`git push origin feature/amazing-feature`)
7. 创建 Pull Request

## 开发设置

### 前置要求

- Node.js 18+
- npm 9+
- Chrome 120+

### 安装步骤

```bash
# 克隆仓库
git clone https://github.com/183600/Agentab.git
cd Agentab

# 安装依赖
npm install

# 运行测试
npm test

# 代码检查
npm run lint

# 安全审计
npm run security
```

### 加载扩展

1. 在 Chrome 中打开 `chrome://extensions/`
2. 启用开发者模式
3. 点击"加载已解压的扩展程序"
4. 选择项目根目录

### 开发工作流

```bash
# 监视模式运行测试
npm run test:watch

# 运行特定测试
npm test -- path/to/test.js

# 测试覆盖率
npm run test:coverage

# 格式化代码
npm run format

# 修复 lint 错误
npm run lint:fix

# 完整验证
npm run validate
```

## 项目结构

```
Agentab/
├── background/          # Service Worker
│   └── background.js
├── content/             # 内容脚本
│   └── content.js
├── lib/                 # 核心库
│   ├── agent.js         # 智能体核心
│   ├── api-client.js    # API 客户端
│   ├── storage.js       # 存储管理
│   ├── crypto.js        # 加密工具
│   ├── validator.js     # 输入验证
│   ├── errors.js        # 错误处理
│   ├── logger.js        # 日志系统
│   └── ...
├── popup/               # 弹窗 UI
├── sidepanel/           # 侧边栏 UI
├── settings/            # 设置页面
├── tasks/               # 任务管理
├── history/             # 历史记录
├── test/                # 测试文件
├── docs/                # 文档
└── scripts/             # 工具脚本
```

## 编码规范

### JavaScript

- 使用 ES2022+ 特性
- 使用 `const` 和 `let`，不使用 `var`
- 使用箭头函数
- 使用模板字符串
- 使用解构赋值
- 使用 async/await

### 命名约定

```javascript
// 类名：帕斯卡命名法
class MyClass {}

// 函数/变量：驼峰命名法
function myFunction() {}
const myVariable = '';

// 常量：全大写下划线
const MAX_ITERATIONS = 10;

// 私有属性：下划线前缀
this._privateProperty = '';

// 文件名：小写连字符
// my-module.js
```

### 文档注释

```javascript
/**
 * 函数描述
 * @param {string} param1 - 参数描述
 * @param {Object} options - 选项
 * @param {number} [options.timeout=1000] - 超时时间
 * @returns {Promise<Object>} 返回值描述
 * @throws {Error} 错误描述
 */
async function myFunction(param1, options = {}) {
  // ...
}
```

### 错误处理

```javascript
// 使用 ErrorHandler
import { ErrorHandler } from './errors.js';

try {
  // 操作
} catch (error) {
  const normalized = ErrorHandler.normalize(error);
  logger.error('Operation failed', normalized);
  throw normalized;
}
```

### 安全编码 - XSS 防护

**重要：本项目高度重视安全性，必须遵循以下规则防止XSS攻击。**

#### innerHTML 安全规则

```javascript
// ❌ 危险：直接使用 innerHTML 插入用户输入
element.innerHTML = userInput;  // 禁止！

// ✅ 安全：使用 textContent 插入纯文本
element.textContent = userInput;

// ✅ 安全：使用 escapeHtml 转义后插入
import { escapeHtml } from '../lib/ui-components.js';
element.innerHTML = escapeHtml(userInput);

// ✅ 安全：使用 DOM API 构建元素
const div = document.createElement('div');
div.className = 'message';
div.textContent = userInput;
container.appendChild(div);

// ✅ 安全：使用 createElement 工具函数
import { createElement } from '../lib/ui-components.js';
const el = createElement('div', { className: 'message' }, userInput);
container.appendChild(el);
```

#### 安全模式检查清单

1. **用户输入永远不要直接插入 innerHTML**
2. **URL 必须验证协议**（仅允许 http/https）
3. **API 密钥不得暴露到控制台或日志**
4. **代码执行前必须通过沙箱验证**
5. **敏感数据使用 chrome.storage.local 加密存储**

#### ESLint 安全检查

项目配置了 `no-unsanitized` 插件检查潜在XSS风险：

```bash
npm run lint  # 会检查 innerHTML 使用是否安全
```

#### 安全审查

提交 PR 前请确认：
- [ ] 无直接 innerHTML 用户输入
- [ ] URL/路径经过验证
- [ ] 敏感数据已加密
- [ ] 代码通过沙箱执行

### 性能追踪

```javascript
import { metrics } from './performance.js';

const timer = metrics.startTimer('operation');
try {
  // 操作
} finally {
  timer.end();
}
```

## 提交规范

我们使用语义化提交消息：

```
<type>(<scope>): <subject>

<body>

<footer>
```

### 类型

- `feat`: 新功能
- `fix`: Bug 修复
- `docs`: 文档更改
- `style`: 代码格式（不影响功能）
- `refactor`: 重构
- `perf`: 性能改进
- `test`: 测试相关
- `chore`: 构建过程或辅助工具
- `security`: 安全相关

### 示例

```
feat(api): add streaming support for chat completion

Implement SSE streaming for better UX with long responses.
Closes #123

BREAKING CHANGE: API client now returns AsyncIterable
```

```
fix(validator): prevent XSS in user input

Escape HTML entities in prompt validation.
Fixes #456
```

## 测试

### 单元测试

```javascript
import { describe, it, expect } from 'vitest';

describe('MyModule', () => {
  it('should do something', () => {
    expect(myFunction()).toBe(expected);
  });
});
```

### 测试原则

1. 每个测试只测试一件事
2. 使用描述性的测试名称
3. 遵循 AAA 模式（Arrange, Act, Assert）
4. Mock 外部依赖
5. 测试边界情况

### 运行测试

```bash
# 所有测试
npm test

# 监视模式
npm run test:watch

# 覆盖率
npm run test:coverage

# UI 模式
npm run test:ui
```

## 文档

### 更新文档

如果您添加了新功能或更改了行为，请更新相关文档：

- `README.md` - 用户文档
- `docs/ARCHITECTURE.md` - 架构文档
- `docs/API.md` - API 文档
- JSDoc 注释

### 文档风格

- 使用清晰、简洁的语言
- 提供代码示例
- 保持更新

## 发布流程

### 版本号

我们遵循语义化版本控制：

- **MAJOR**: 不兼容的 API 更改
- **MINOR**: 向后兼容的功能添加
- **PATCH**: 向后兼容的 bug 修复

### 发布检查清单

1. 更新 `CHANGELOG.md`
2. 更新 `package.json` 版本号
3. 更新 `manifest.json` 版本号
4. 运行完整测试套件
5. 创建 git 标签
6. 创建 GitHub release

## 获得帮助

- 💬 [GitHub Discussions](https://github.com/183600/Agentab/discussions)
- 🐛 [Issue Tracker](https://github.com/183600/Agentab/issues)
- 📧 Email: support@agentab.dev

## 许可证

通过贡献您的代码，您同意您的贡献将根据 MIT 许可证进行许可。
