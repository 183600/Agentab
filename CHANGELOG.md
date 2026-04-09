# Changelog

本项目的所有重要更改都将记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
并且本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### 新增

#### 架构改进
- 添加 CI/CD 工作流配置 (`.github/workflows/ci.yml`)
- 实现智能缓存系统 (`lib/smart-cache.js`)
  - LRU 缓存淘汰策略
  - TTL 支持
  - 请求去重
- 创建增强版 API 客户端 (`lib/enhanced-api-client.js`)
  - 自动缓存
  - 批量请求支持
  - 流式响应支持

#### 开发工具
- 安全审计脚本 (`scripts/security-audit.js`)
  - 静态代码分析
  - 危险模式检测
  - Manifest 安全检查
- 项目统计脚本

#### 文档
- 架构设计文档 (`docs/ARCHITECTURE.md`)
- 贡献指南 (`CONTRIBUTING.md`)
- 变更日志 (`CHANGELOG.md`)

#### 测试
- 智能缓存测试 (`test/smart-cache.test.js`)
- 增强的测试覆盖率

### 改进

#### package.json
- 添加新的 npm 脚本命令
- 增加开发依赖包
- 添加 engines 字段
- 完善 repository 信息

#### ESLint 配置
- 添加更多代码质量规则
- 支持 ES2022 特性
- 配置全局变量

### 技术债务

#### 已修复
- 优化代码执行沙箱安全性
- 改进错误处理和恢复机制
- 增强输入验证和清理

## [1.0.0] - 2024-01-XX

### 新增

#### 核心功能
- AI 智能体模式 - 使用自然语言控制网页
- 直接代码模式 - 执行 JavaScript 代码
- 任务管理系统 - 保存、编辑、删除任务
- 灵活的 LLM 支持 - OpenAI 兼容 API

#### 安全特性
- 代码执行沙箱 (`lib/sandbox.js`)
- 输入验证器 (`lib/validator.js`)
- API 密钥加密存储 (`lib/crypto.js`)
- 统一错误处理 (`lib/errors.js`)

#### 基础设施
- 存储管理器 (`lib/storage.js`)
- API 客户端 (`lib/api-client.js`)
- 页面分析器 (`lib/page-analyzer.js`)
- 智能体执行器 (`lib/agent.js`)

#### UI 组件
- 代码语法高亮 (`lib/syntax-highlighter.js`)
- 共享 UI 组件库 (`lib/ui-components.js`)
- 自动补全引擎 (`lib/autocomplete.js`)
- 执行进度可视化 (`lib/progress.js`)

#### 自动化
- 代码片段库 (`lib/snippets.js`) - 20+ 内置片段
- 任务模板系统 (`lib/templates.js`) - 20+ 预定义模板
- 任务调度器 (`lib/scheduler.js`)
- 错误恢复机制 (`lib/recovery.js`)

#### 监控和日志
- 日志系统 (`lib/logger.js`)
- 性能监控 (`lib/performance.js`)
- 增强安全沙箱 (`lib/secure-sandbox.js`)

#### 开发工具
- Vitest 测试框架
- ESLint 代码检查
- Prettier 代码格式化
- Chrome API Mock
- 16 个测试文件，300+ 测试用例

#### 国际化
- 中文支持 (zh_CN)
- 英文支持 (en)

### 文档
- README.md (中文)
- README_EN.md (英文)
- IMPROVEMENTS.md
- IMPROVEMENTS_V2.md

---

## 版本说明

### [Unreleased]
当前开发版本，包含最新的改进和新功能。

### [1.0.0]
首次发布版本，包含核心功能和基础设施。

---

## 版本规划

### [1.1.0] - 计划中

#### 新增
- [ ] Web Worker 支持
- [ ] 可视化任务编辑器
- [ ] 任务导入/导出 UI
- [ ] 更多测试覆盖

#### 改进
- [ ] 性能优化
- [ ] 文档完善
- [ ] 错误提示改进

### [1.2.0] - 计划中

#### 新增
- [ ] 任务依赖和流程编排
- [ ] 更多 LLM 提供商支持
- [ ] 自定义主题

### [2.0.0] - 未来

#### 新增
- [ ] 本地模型支持 (WebLLM)
- [ ] 多标签页协调
- [ ] 团队协作功能
- [ ] 任务市场

---

## 贡献

请阅读 [CONTRIBUTING.md](CONTRIBUTING.md) 了解如何为此项目做出贡献。

## 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件。
