# 🤖 Agentab

> **将任意标签页变为 AI 智能体。**  
> Agentab 是一款 Chrome 扩展，让你可以通过自然语言提示词或 JavaScript 代码来控制网页——支持任何兼容 OpenAI 的大语言模型。

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?style=flat-square&logo=googlechrome&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-green?style=flat-square)
![License MIT](https://img.shields.io/badge/License-MIT-purple?style=flat-square)
![Version](https://img.shields.io/badge/Version-1.0.0-6c5ce7?style=flat-square)

---

## 📸 截图预览

```
┌─────────────────────────┐    ┌─────────────────────────┐
│  🤖 Agentab             │    │  📋 已保存任务          │
│  ─────────────────────  │    │  ─────────────────────   │
│  [ 提示词 ] [ 代码  ]   │    │  🔍 搜索任务...         │
│                         │    │                          │
│  ┌───────────────────┐  │    │  ┌─────────┐ ┌────────┐ │
│  │ 描述你想要智能体  │  │    │  │提取邮箱 │ │填写表单│ │
│  │ 执行的任务...     │  │    │  │💬 提示词│ │⚡ 代码 │ │
│  └───────────────────┘  │    │  └─────────┘ └────────┘ │
│                         │    │                          │
│  [  保存  ] [ 运行智能体]│   │    │  [全部] [提示词] [代码] │
└─────────────────────────┘    └─────────────────────────┘
```

---

## ✨ 功能特性

### 🧠 AI 智能体模式

- 使用**自然语言**描述任务——Agentab 会自动处理其余工作
- 多步推理循环：智能体思考 → 执行 → 观察 → 循环
- 自动分析页面结构（表单、按钮、链接、文本）
- 每个任务最多支持 **10 次迭代**

### ⚡ 直接代码模式

- 在任意页面上直接编写和执行 **JavaScript**
- 完整的 DOM 访问权限，支持 `async/await`
- 通过 `__chromeAgent` 使用内置辅助工具
- 实时执行结果反馈

### 💾 任务管理

- 将任务保存为**提示词**类型或**代码**类型
- 完整的任务列表，支持搜索和筛选
- 编辑、复制、删除任务
- 追踪执行次数和最后运行时间

### 🔌 灵活的 LLM 支持

- 支持**任何兼容 OpenAI 的 API**
- 支持 OpenAI、Azure OpenAI、Ollama、LM Studio、DeepSeek 等
- 可配置 Base URL、API Key 和模型名称

---

## 🚀 快速开始

### 安装

> Agentab 尚未上架 Chrome 应用商店。  
> 请以开发者模式手动安装。

**步骤 1 — 克隆仓库**

```bash
git clone https://github.com/yourname/agentab.git
cd agentab
```

**步骤 2 — 生成图标**

在浏览器中打开 `generate-icons.html`。  
图标会自动下载到你的 `icons/` 文件夹。

**步骤 3 — 加载扩展**

1. 打开 Chrome，访问 `chrome://extensions/`
2. 启用**开发者模式**（右上角开关）
3. 点击**"加载已解压的扩展程序"**
4. 选择 `agentab` 项目文件夹

**步骤 4 — 配置 API**

1. 点击 Chrome 工具栏中的 Agentab 图标
2. 点击 ⚙️ 设置按钮
3. 填写你的 API 信息：

| 字段         | 示例                        |
| ------------ | --------------------------- |
| API Base URL | `https://api.openai.com/v1` |
| API Key      | `sk-xxxxxxxxxxxxxxxx`       |
| Model        | `gpt-4o`                    |

---

## 📖 使用说明

### 提示词模式（AI 智能体）

切换到**提示词**标签页，描述你想要执行的任务：

```
找出页面上所有的邮箱地址并列出来
```

```
用用户名 "demo" 和密码 "demo123" 填写登录表单
```

```
滚动到页面底部并点击"加载更多"按钮
```

```
提取页面上每个商品的标题、价格和评分
```

```
获取导航菜单中的所有链接，以 JSON 数组形式返回
```

智能体会：

1. 🔍 分析当前页面结构
2. 🧠 生成 JavaScript 代码来完成任务
3. ⚡ 在页面上执行代码
4. 👀 观察执行结果
5. 🔄 循环执行直到任务完成

---

### 代码模式（直接执行）

切换到**代码**标签页，编写 JavaScript：

```javascript
// 从页面提取所有图片 URL
const images = Array.from(document.querySelectorAll('img')).map(img => ({
  src: img.src,
  alt: img.alt
}));
return images;
```

```javascript
// 填写表单并提交
await __chromeAgent.typeText('#username', 'hello@example.com');
await __chromeAgent.typeText('#password', 'mypassword');
await __chromeAgent.clickElement('#submit-btn');
```

```javascript
// 等待动态内容加载后提取
const el = await __chromeAgent.waitForElement('.results-container');
return __chromeAgent.getVisibleText('.results-container');
```

---

### 任务管理

点击 📋 图标打开**任务管理器**：

- 按名称、描述或内容**搜索**任务
- 按类型**筛选**：全部 / 提示词 / 代码
- 一键**运行**任意已保存的任务
- **编辑**任务名称、描述、类型和内容
- **复制**任务作为新任务的起点
- **删除**不再需要的任务
- 查看每个任务的**执行统计**

---

## 🛠️ 内置辅助 API

编写代码时，你可以使用 `__chromeAgent` 工具：

```javascript
// 等待元素出现在 DOM 中（默认最多等待 10 秒）
const el = await __chromeAgent.waitForElement('.my-element', 10000);

// 逐字输入文本（模拟人工输入）
await __chromeAgent.typeText('#input-field', 'Hello World', 50);

// 点击元素（自动重试）
await __chromeAgent.clickElement('#submit-button', 3);

// 获取可见文本内容
const text = __chromeAgent.getVisibleText('.article-body');

// 延时 / 等待
await __chromeAgent.sleep(1000);

// 提取表格数据为二维数组
const table = __chromeAgent.extractTable('#data-table');

// 批量填写表单字段
__chromeAgent.fillForm({
  '#name': 'John Doe',
  '#email': 'john@example.com',
  '#role': 'developer'
});
```

---

## 📁 项目结构

```
agentab/
├── manifest.json              # 扩展清单 (MV3)
├── background/
│   └── background.js          # Service Worker，LLM 智能体循环
├── content/
│   └── content.js             # 内容脚本，辅助工具
├── popup/
│   ├── popup.html             # 扩展弹窗界面
│   ├── popup.css              # 弹窗样式
│   └── popup.js               # 弹窗逻辑
├── tasks/
│   ├── tasks.html             # 任务管理页面
│   ├── tasks.css              # 任务管理样式
│   └── tasks.js               # 任务管理逻辑
├── lib/
│   └── storage.js             # Chrome 存储工具
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── generate-icons.html        # 图标生成工具
```

---

## ⚙️ 配置

### 支持的 LLM 提供商

| 提供商       | Base URL                                                              | 备注       |
| ------------ | --------------------------------------------------------------------- | ---------- |
| OpenAI       | `https://api.openai.com/v1`                                           | 默认       |
| Azure OpenAI | `https://{resource}.openai.azure.com/openai/deployments/{deployment}` |            |
| Ollama       | `http://localhost:11434/v1`                                           | 本地，免费 |
| LM Studio    | `http://localhost:1234/v1`                                            | 本地，免费 |
| DeepSeek     | `https://api.deepseek.com/v1`                                         | 高性价比   |
| Groq         | `https://api.groq.com/openai/v1`                                      | 快速推理   |
| OpenRouter   | `https://openrouter.ai/api/v1`                                        | 多模型     |

### 推荐模型

| 使用场景    | 模型                  |
| ----------- | --------------------- |
| 最佳精度    | `gpt-4o`              |
| 均衡选择    | `gpt-4o-mini`         |
| 本地 / 免费 | `llama3.2` via Ollama |
| 快速且便宜  | `deepseek-chat`       |

---

## 🔒 隐私与安全

- **不收集数据** — Agentab 从不向任何服务器发送你的数据，除了你配置的 LLM API
- **API Key 本地存储** — 仅存储在你设备的 `chrome.storage.local` 中
- **代码审查** — 所有 JS 代码在执行前都可在界面中查看
- **无后台追踪** — Service Worker 仅在你使用扩展时激活
- **开源** — 你可以自行审计完整源代码

> ⚠️ **警告：** 在包含敏感信息的页面上运行智能体任务时请谨慎。  
> 始终在授予重要表单或数据访问权限之前检查生成的代码。

---

## 🧩 键盘快捷键

| 快捷键               | 操作                              |
| -------------------- | --------------------------------- |
| `Ctrl / Cmd + Enter` | 运行当前提示词或代码              |
| `Tab`                | 插入 2 空格缩进（在代码编辑器中） |
| `Esc`                | 关闭弹窗或对话框                  |
| 右键选中文字         | 将选中内容作为智能体提示词运行    |

---

## 🗺️ 路线图

- [ ] **v1.1** — 代码编辑器语法高亮
- [ ] **v1.2** — 任务调度（定时运行或页面加载时运行）
- [ ] **v1.3** — 导入 / 导出任务集合
- [ ] **v1.4** — 多标签页协调
- [ ] **v1.5** — 可视化元素选择器（点击选择 DOM 元素）
- [ ] **v2.0** — 内置本地模型支持（WebLLM）
- [ ] **v2.1** — 任务分享市场

---

## 🤝 贡献

欢迎贡献！

```bash
# Fork 并克隆
git clone https://github.com/yourname/agentab.git

# 创建功能分支
git checkout -b feature/my-feature

# 进行修改，然后提交 PR
git push origin feature/my-feature
```

请遵循以下准则：

- 保持代码整洁并添加注释
- 在 Chrome 120+ 上测试
- 不要引入外部依赖
- 每个 PR 只包含一个功能

---

## 🐛 已知问题

- 内容脚本可能无法注入到 `chrome://` 或 `chrome-extension://` 页面（设计限制）
- 某些 SPA 可能需要刷新页面后辅助工具才可用
- 非常长的智能体任务（10 步以上）在慢速 API 连接下可能超时

---

## 📄 许可证

```
MIT License

Copyright (c) 2024 Agentab

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
```

---

## 🙏 致谢

- 由 [OpenAI](https://openai.com) 兼容 API 驱动
- 基于 Chrome Extensions Manifest V3 构建
- 灵感来源于浏览器自动化和 AI 智能体社区

---

<div align="center">

**由 Agentab 团队用 ❤️ 制作**

[报告 Bug](https://github.com/yourname/agentab/issues) ·
[请求功能](https://github.com/yourname/agentab/issues) ·
[Chrome 应用商店](#) _(即将上线)_

</div>
