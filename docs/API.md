# Agentab API 文档

## 目录

- [存储 API](#存储-api)
- [智能体 API](#智能体-api)
- [API 客户端](#api-客户端)
- [验证器 API](#验证器-api)
- [错误处理 API](#错误处理-api)
- [加密 API](#加密-api)
- [缓存 API](#缓存-api)
- [日志 API](#日志-api)
- [性能 API](#性能-api)

---

## 存储 API

### StorageManager

管理扩展数据存储。

```javascript
import { StorageManager } from './lib/storage.js';
```

#### 方法

##### getApiKey()
获取解密后的 API 密钥。

```javascript
const apiKey = await StorageManager.getApiKey();
```

**返回**: `Promise<string|null>`

##### saveApiKey(key)
加密并保存 API 密钥。

```javascript
await StorageManager.saveApiKey('sk-xxxxxxxx');
```

**参数**:
- `key` (string): API 密钥

**返回**: `Promise<void>`

##### getApiBaseUrl()
获取 API Base URL。

```javascript
const baseUrl = await StorageManager.getApiBaseUrl();
```

**返回**: `Promise<string>`

##### getModel()
获取模型名称。

```javascript
const model = await StorageManager.getModel();
```

**返回**: `Promise<string>`

##### getTasks()
获取所有保存的任务。

```javascript
const tasks = await StorageManager.getTasks();
```

**返回**: `Promise<Array<Task>>`

```typescript
interface Task {
  id: string;
  name: string;
  description?: string;
  type: 'prompt' | 'code';
  content: string;
  createdAt: number;
  updatedAt: number;
  executionCount: number;
  lastRunAt?: number;
}
```

##### saveTask(task)
保存新任务。

```javascript
const task = await StorageManager.saveTask({
  name: 'My Task',
  type: 'prompt',
  content: 'Extract all emails from the page'
});
```

**参数**:
- `task` (Object): 任务对象

**返回**: `Promise<Task>`

##### updateTask(taskId, updates)
更新任务。

```javascript
await StorageManager.updateTask('task-id', {
  name: 'Updated Name'
});
```

**参数**:
- `taskId` (string): 任务 ID
- `updates` (Object): 更新内容

**返回**: `Promise<Task>`

##### deleteTask(taskId)
删除任务。

```javascript
await StorageManager.deleteTask('task-id');
```

**参数**:
- `taskId` (string): 任务 ID

**返回**: `Promise<boolean>`

##### addHistory(entry)
添加历史记录。

```javascript
await StorageManager.addHistory({
  type: 'prompt',
  input: 'User prompt',
  results: [],
  tabUrl: 'https://example.com',
  tabTitle: 'Example'
});
```

**参数**:
- `entry` (Object): 历史记录条目

**返回**: `Promise<void>`

---

## 智能体 API

### AgentExecutor

AI 智能体执行器。

```javascript
import { AgentExecutor } from './lib/agent.js';

const agent = new AgentExecutor({
  maxIterations: 10,
  maxExecutionsPerMinute: 30
});
```

#### 方法

##### runPrompt(tabId, prompt, onUpdate)
运行智能体处理提示词。

```javascript
const results = await agent.runPrompt(tabId, 'Extract all emails', (update) => {
  console.log(update);
});
```

**参数**:
- `tabId` (number): 标签页 ID
- `prompt` (string): 用户提示词
- `onUpdate` (Function): 更新回调

**返回**: `Promise<Array>`

**更新类型**:
```javascript
// 思考中
{ type: 'thinking', iteration: 1, message: '...' }

// 执行代码
{ type: 'executing', code: '...', explanation: '...' }

// 执行完成
{ type: 'executed', result: { success: true, result: ... } }

// 任务完成
{ type: 'complete', message: '...', explanation: '...' }

// 错误
{ type: 'error', message: '...' }
```

##### runCode(tabId, code, onUpdate)
直接执行代码。

```javascript
const results = await agent.runCode(tabId, 'return document.title');
```

**参数**:
- `tabId` (number): 标签页 ID
- `code` (string): JavaScript 代码
- `onUpdate` (Function): 更新回调

**返回**: `Promise<Array>`

##### stop()
停止当前执行。

```javascript
agent.stop();
```

##### isRunning
检查是否正在运行。

```javascript
if (agent.isRunning) {
  console.log('Agent is busy');
}
```

---

## API 客户端

### LlmApiClient

LLM API 客户端。

```javascript
import { apiClient } from './lib/api-client.js';
```

#### 方法

##### chatCompletion(messages, options)
调用 LLM API。

```javascript
const response = await apiClient.chatCompletion([
  { role: 'system', content: 'You are a helpful assistant.' },
  { role: 'user', content: 'Hello!' }
], {
  timeout: 60000,
  retries: 3,
  signal: abortController.signal
});
```

**参数**:
- `messages` (Array): 消息数组
- `options` (Object): 选项
  - `timeout` (number): 超时时间（毫秒）
  - `retries` (number): 重试次数
  - `signal` (AbortSignal): 中止信号

**返回**: `Promise<string>`

##### testConnection()
测试 API 连接。

```javascript
const result = await apiClient.testConnection();
// { success: true } 或 { success: false, error: '...' }
```

**返回**: `Promise<Object>`

##### listModels()
列出可用模型。

```javascript
const models = await apiClient.listModels();
// [{ id: 'gpt-4', name: 'gpt-4' }, ...]
```

**返回**: `Promise<Array>`

### EnhancedLlmApiClient

增强版 API 客户端，带缓存和去重。

```javascript
import { enhancedApiClient } from './lib/enhanced-api-client.js';
```

##### getCacheStats()
获取缓存统计。

```javascript
const stats = enhancedApiClient.getCacheStats();
// { size: 10, hits: 50, misses: 10, hitRate: '83.33%', evictions: 2 }
```

##### clearCache()
清除缓存。

```javascript
enhancedApiClient.clearCache();
```

---

## 验证器 API

### InputValidator

输入验证和清理。

```javascript
import { InputValidator } from './lib/validator.js';
```

#### 方法

##### validatePrompt(prompt)
验证提示词。

```javascript
const result = InputValidator.validatePrompt('Extract emails');
// { valid: true, value: 'Extract emails' }
```

**返回**: `Object` - `{ valid: boolean, value?: string, error?: string }`

##### validateCode(code)
验证代码。

```javascript
const result = InputValidator.validateCode('return 1');
```

##### validateTask(task)
验证任务对象。

```javascript
const result = InputValidator.validateTask({
  name: 'My Task',
  type: 'prompt',
  content: '...'
});
```

##### sanitizeHtml(input)
清理 HTML 标签。

```javascript
const clean = InputValidator.sanitizeHtml('<script>alert(1)</script>Hello');
// 'Hello'
```

##### escapeHtml(input)
转义 HTML 实体。

```javascript
const escaped = InputValidator.escapeHtml('<div>"test"</div>');
// '&lt;div&gt;&quot;test&quot;&lt;/div&gt;'
```

---

## 错误处理 API

### ErrorHandler

统一错误处理。

```javascript
import { ErrorHandler } from './lib/errors.js';
```

#### 方法

##### normalize(error)
标准化错误对象。

```javascript
const normalized = ErrorHandler.normalize(error);
// { message: '...', code: 'ERROR_CODE', stack: '...' }
```

##### getSolution(error)
获取解决方案建议。

```javascript
const solution = ErrorHandler.getSolution(error);
// '建议：检查您的 API 密钥是否正确配置'
```

### 错误类型

```javascript
import { 
  ValidationError, 
  ApiError, 
  TimeoutError, 
  AbortError 
} from './lib/errors.js';

// 抛出验证错误
throw new ValidationError('Invalid input', 'field', value);

// 抛出 API 错误
throw ApiError.fromResponse(response, body);
```

---

## 加密 API

### CryptoManager

加密工具类。

```javascript
import { CryptoManager } from './lib/crypto.js';
```

#### 方法

##### encrypt(data, password)
加密数据。

```javascript
const encrypted = await CryptoManager.encrypt('secret data', 'password');
```

**返回**: `Promise<string>` - Base64 编码的加密数据

##### decrypt(encryptedData, password)
解密数据。

```javascript
const decrypted = await CryptoManager.decrypt(encrypted, 'password');
```

**返回**: `Promise<string>`

##### generateKey()
生成随机密钥。

```javascript
const key = await CryptoManager.generateKey();
// 'a1b2c3d4e5f6...'
```

**返回**: `Promise<string>` - 32 字节十六进制字符串

---

## 缓存 API

### SmartCache

LRU 缓存。

```javascript
import { SmartCache } from './lib/smart-cache.js';

const cache = new SmartCache({
  maxSize: 100,
  defaultTTL: 60000
});
```

#### 方法

##### get(key)
获取缓存值。

```javascript
const value = cache.get('my-key');
```

##### set(key, value, ttl)
设置缓存值。

```javascript
cache.set('my-key', { data: 'value' }, 30000);
```

##### getOrSet(key, fn, ttl)
获取或计算缓存值。

```javascript
const value = await cache.getOrSet('key', async () => {
  return await fetchData();
}, 60000);
```

##### getStats()
获取缓存统计。

```javascript
const stats = cache.getStats();
// { size: 10, hits: 50, misses: 10, hitRate: '83.33%' }
```

### RequestDeduplicator

请求去重。

```javascript
import { RequestDeduplicator } from './lib/smart-cache.js';

const deduper = new RequestDeduplicator();
```

##### execute(key, fn)
执行或加入待处理请求。

```javascript
const result = await deduper.execute('request-key', async () => {
  return await apiCall();
});
```

---

## 日志 API

### Logger

日志系统。

```javascript
import { logger, agentLogger } from './lib/logger.js';
```

#### 方法

##### debug(message, data)
调试日志。

```javascript
logger.debug('Processing', { step: 1 });
```

##### info(message, data)
信息日志。

```javascript
logger.info('Task completed', { duration: 1000 });
```

##### warn(message, data)
警告日志。

```javascript
logger.warn('Rate limit approaching', { remaining: 5 });
```

##### error(message, error)
错误日志。

```javascript
logger.error('API call failed', error);
```

##### time(label)
开始计时。

```javascript
logger.time('operation');
```

##### timeEnd(label)
结束计时。

```javascript
logger.timeEnd('operation');
// [INFO] operation: 123.45ms
```

---

## 性能 API

### PerformanceMetrics

性能指标收集。

```javascript
import { metrics, tracker } from './lib/performance.js';
```

#### 方法

##### startTimer(name)
开始计时。

```javascript
const timer = metrics.startTimer('api-call');
```

##### timer.end()
结束计时。

```javascript
timer.end();
```

##### increment(name, value)
增加计数器。

```javascript
metrics.increment('requests');
metrics.increment('bytes', 1024);
```

##### getStats(name)
获取统计信息。

```javascript
const stats = metrics.getStats('api-call');
// { count: 10, avg: 150.5, min: 100, max: 200, p95: 180, p99: 190 }
```

### PerformanceTracker

高级性能追踪。

```javascript
// 追踪异步操作
const result = await tracker.track('operation', async () => {
  return await doSomething();
});

// 追踪 API 调用
await tracker.trackApi('users', () => fetchUsers());
```

---

## 页面分析 API

### PageAnalyzer

分析页面结构。

```javascript
import { PageAnalyzer } from './lib/page-analyzer.js';
```

#### 方法

##### getPromptContext(tabId)
获取智能体上下文。

```javascript
const context = await PageAnalyzer.getPromptContext(tabId);
// {
//   url: 'https://...',
//   title: 'Page Title',
//   forms: [...],
//   buttons: [...],
//   links: [...],
//   bodyText: '...'
// }
```

##### analyze(tabId)
完整分析页面。

```javascript
const analysis = await PageAnalyzer.analyze(tabId);
```

##### clearCache()
清除缓存。

```javascript
PageAnalyzer.clearCache();
```

---

## 更多 API

更多 API 文档请参考各模块的 JSDoc 注释。

- [任务调度器 API](./lib/scheduler.js)
- [代码片段 API](./lib/snippets.js)
- [任务模板 API](./lib/templates.js)
- [执行进度 API](./lib/progress.js)
- [自动补全 API](./lib/autocomplete.js)
