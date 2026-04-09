# Agentab 架构设计文档

## 架构概述

Agentab 采用模块化设计，分为以下几个主要层次：

```
┌─────────────────────────────────────────────────────────┐
│                     UI Layer                             │
│  (popup, sidepanel, settings, tasks, history)            │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                   Background Layer                       │
│  (background.js - Service Worker)                        │
│  消息路由、任务调度、状态管理                              │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                    Core Layer                            │
│  agent.js, api-client.js, page-analyzer.js              │
│  智能体逻辑、API通信、页面分析                            │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                Infrastructure Layer                      │
│  storage, crypto, validator, errors, logger, etc.       │
│  存储、加密、验证、错误处理、日志等基础设施                │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                   Content Script                         │
│  注入页面，提供 __chromeAgent 辅助工具                    │
└─────────────────────────────────────────────────────────┘
```

## 模块职责

### Background Layer

**background.js** - Service Worker
- 消息路由和处理
- 任务调度
- 扩展生命周期管理
- 上下文菜单集成

### Core Layer

**agent.js** - AgentExecutor
- AI 智能体循环
- 代码执行沙箱
- 响应解析
- 速率限制

**api-client.js** - LlmApiClient
- LLM API 通信
- 重试和超时处理
- 错误恢复
- 模型列表

**page-analyzer.js** - PageAnalyzer
- 页面结构分析
- 表单、按钮、链接识别
- 缓存管理

### Infrastructure Layer

**storage.js** - StorageManager
- 任务存储
- 历史记录
- 设置管理
- API 密钥加密存储

**crypto.js** - CryptoManager
- AES-GCM 加密
- PBKDF2 密钥派生
- 安全密钥生成

**validator.js** - InputValidator
- 输入验证和清理
- XSS 防护
- SQL 注入防护

**errors.js** - ErrorHandler
- 统一错误处理
- 错误标准化
- 错误恢复建议

**logger.js** - Logger
- 分级日志
- 性能追踪
- 子日志器

**performance.js** - PerformanceMetrics
- 指标收集
- 统计计算
- 性能报告

**sandbox.js** - SandboxExecutor
- 代码安全执行
- 危险模式检测
- 执行超时

**smart-cache.js** - SmartCache
- LRU 缓存
- TTL 支持
- 请求去重

## 数据流

### 提示词执行流程

```
用户输入提示词
    │
    ▼
Sidepanel UI
    │ chrome.runtime.sendMessage
    ▼
Background (handleExecutePrompt)
    │ InputValidator.validatePrompt
    ▼
AgentExecutor.runPrompt
    │
    ├─→ PageAnalyzer.getPromptContext
    │       └─→ 缓存或新分析
    │
    ├─→ API Client.chatCompletion
    │       └─→ 智能缓存 / 请求去重
    │
    ├─→ parseResponse
    │
    └─→ executeCode (Sandbox)
            └─→ chrome.scripting.executeScript
                    └─→ Content Script (__chromeAgent)
```

### 代码执行流程

```
用户编写代码
    │
    ▼
Sidepanel UI
    │ chrome.runtime.sendMessage
    ▼
Background (handleExecuteCode)
    │ InputValidator.validateCode
    ▼
AgentExecutor.runCode
    │ SandboxExecutor.validate
    ▼
chrome.scripting.executeScript
    │
    ▼
Page Context
    │ Function 构造器
    ▼
执行结果
```

## 安全模型

### 多层防护

1. **输入层** - InputValidator
   - 清理用户输入
   - 检测注入模式
   - 长度和格式验证

2. **代码执行层** - SandboxExecutor
   - 危险模式检测 (eval, Function constructor with user input)
   - 代码大小限制
   - 执行超时

3. **存储层** - CryptoManager
   - API 密钥加密
   - 安全随机数生成

4. **传输层** - HTTPS only
   - 强制 HTTPS 连接
   - 安全头部

### CSP 配置

```json
{
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'; style-src 'self' 'unsafe-inline'"
  }
}
```

## 性能优化

### 缓存策略

1. **页面分析缓存** - 10秒 TTL
   - 避免重复分析相同页面
   - DOM 结构缓存

2. **API 响应缓存** - 5分钟 TTL
   - 相同请求复用响应
   - LRU 淘汰策略

3. **请求去重**
   - 合并并发相同请求
   - 避免重复计算

### 懒加载

- 语法高亮器按需加载
- 代码片段库延迟初始化
- 模板系统懒初始化

### 性能监控

- 关键操作计时
- P95/P99 延迟统计
- 异常告警

## 扩展点

### 自定义验证器

```javascript
InputValidator.registerValidator('custom', (value) => {
  // 自定义验证逻辑
  return { valid: true, value: processedValue };
});
```

### 自定义代码片段

```javascript
SnippetsManager.addSnippet({
  name: 'Custom Snippet',
  category: 'custom',
  code: '// Your code here'
});
```

### 自定义任务模板

```javascript
TemplatesManager.addTemplate({
  name: 'Custom Template',
  type: 'prompt',
  content: 'Your prompt here'
});
```

## 未来规划

### 短期 (v1.x)

- [ ] Web Worker 支持 - CPU 密集操作
- [ ] 可视化任务编辑器
- [ ] 任务依赖和流程编排
- [ ] 更多 LLM 提供商支持

### 中期 (v2.x)

- [ ] 本地模型支持 (WebLLM)
- [ ] 多标签页协调
- [ ] 团队协作功能
- [ ] 任务市场

### 长期 (v3.x)

- [ ] AI 模型微调接口
- [ ] 高级自动化工作流
- [ ] 企业级功能

## 最佳实践

### 添加新功能

1. 在合适的层创建模块
2. 添加类型注释 (JSDoc)
3. 编写单元测试
4. 更新文档
5. 添加到 CI/CD

### 错误处理

```javascript
try {
  // 操作
} catch (error) {
  const normalized = ErrorHandler.normalize(error);
  logger.error('Operation failed', normalized);
  throw normalized;
}
```

### 性能追踪

```javascript
const timer = metrics.startTimer('operation');
try {
  // 操作
} finally {
  timer.end();
}
```

### 安全审计

运行安全审计脚本：

```bash
node scripts/security-audit.js
```
