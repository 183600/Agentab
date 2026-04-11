/**
 * Agentab - Type Definitions
 * 提供完整的 TypeScript 类型支持，增强 IDE 体验和代码质量
 */

// ============================================
// 核心类型
// ============================================

/** 任务类型 */
export type TaskType = 'prompt' | 'code';

/** 执行状态 */
export type ExecutionStatus = 'idle' | 'running' | 'completed' | 'failed' | 'stopped';

/** 执行阶段 */
export type ExecutionPhase = 
  | 'idle' 
  | 'analyzing' 
  | 'thinking' 
  | 'generating' 
  | 'executing' 
  | 'observing' 
  | 'complete' 
  | 'failed';

/** UI 主题 */
export type UITheme = 'light' | 'dark' | 'system';

/** 状态变更类型 */
export type StateChangeType = 'set' | 'delete' | 'clear';

// ============================================
// 接口定义
// ============================================

/** API 配置 */
export interface ApiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
}

/** 任务定义 */
export interface Task {
  id: string;
  name: string;
  description?: string;
  type: TaskType;
  content: string;
  createdAt: number;
  updatedAt: number;
  executionCount: number;
  lastRunAt?: number;
  tags?: string[];
}

/** 执行结果 */
export interface ExecutionResult {
  success: boolean;
  result?: unknown;
  error?: string;
  stack?: string;
  duration?: number;
}

/** Agent 执行结果 */
export interface AgentResult {
  results: AgentStepResult[];
  stats: ExecutionStats;
}

/** Agent 步骤结果 */
export interface AgentStepResult {
  type: 'thinking' | 'execution' | 'complete' | 'error' | 'parse_error';
  message?: string;
  code?: string;
  explanation?: string;
  result?: ExecutionResult;
  iteration?: number;
}

/** 执行统计 */
export interface ExecutionStats {
  duration: number;
  iterations: number;
  success: boolean;
  cacheStats?: CacheStats;
  apiStats?: CacheStats;
  recoveryStats?: RecoveryStats;
}

/** 缓存统计 */
export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  hitRate: number;
}

/** 恢复统计 */
export interface RecoveryStats {
  totalAttempts: number;
  successfulRecoveries: number;
  failedRecoveries: number;
  retryCount: number;
  fallbackCount: number;
}

/** 历史记录项 */
export interface HistoryItem {
  id: string;
  type: TaskType;
  input: string;
  results: AgentResult;
  tabUrl?: string;
  tabTitle?: string;
  timestamp: number;
  duration?: number;
}

/** 设置 */
export interface Settings {
  api: ApiConfig;
  ui: UISettings;
  agent: AgentSettings;
  features: FeatureFlags;
}

/** UI 设置 */
export interface UISettings {
  theme: UITheme;
  animationEnabled: boolean;
  syntaxHighlightEnabled: boolean;
  showLineNumbers: boolean;
  fontSize: number;
  outputMaxEntries: number;
}

/** Agent 设置 */
export interface AgentSettings {
  maxIterations: number;
  enableStreaming: boolean;
  enableRecovery: boolean;
  enableCaching: boolean;
}

/** 功能开关 */
export interface FeatureFlags {
  commandPalette: boolean;
  autocomplete: boolean;
  snippets: boolean;
  templates: boolean;
  multiTab: boolean;
  debugMode: boolean;
}

// ============================================
// 命令面板类型
// ============================================

/** 命令定义 */
export interface Command {
  id: string;
  label: string;
  description?: string;
  category?: string;
  icon?: string;
  keywords?: string[];
  shortcut?: string;
  handler: () => void | Promise<void>;
  enabled?: boolean;
}

/** 命令分类 */
export interface CommandCategory {
  id: string;
  label: string;
  icon?: string;
  priority?: number;
}

/** 模糊匹配结果 */
export interface FuzzyMatchResult {
  score: number;
  matches: number[];
}

// ============================================
// 流式响应类型
// ============================================

/** 流式配置 */
export interface StreamingOptions {
  chunkSize?: number;
  animationSpeed?: number;
  showCursor?: boolean;
  cursorChar?: string;
}

/** SSE 事件 */
export interface SSEEvent {
  event?: string;
  data: string;
}

// ============================================
// 页面分析类型
// ============================================

/** 页面信息 */
export interface PageInfo {
  url: string;
  title: string;
  forms: FormInfo[];
  buttons: ButtonInfo[];
  links: LinkInfo[];
  inputs: InputInfo[];
  bodyText?: string;
}

/** 表单信息 */
export interface FormInfo {
  selector: string;
  action?: string;
  method?: string;
  inputs: InputInfo[];
  hasSubmitButton: boolean;
}

/** 按钮信息 */
export interface ButtonInfo {
  selector: string;
  text: string;
  type: string;
  isDisabled: boolean;
}

/** 链接信息 */
export interface LinkInfo {
  selector: string;
  text: string;
  href: string;
}

/** 输入信息 */
export interface InputInfo {
  selector: string;
  type: string;
  name?: string;
  placeholder?: string;
  value?: string;
  isRequired: boolean;
}

// ============================================
// 元素选择器类型
// ============================================

/** 元素信息 */
export interface ElementInfo {
  tagName: string;
  selector: string;
  id: string | null;
  className: string | null;
  attributes: Record<string, string>;
  boundingBox: BoundingBox;
  isVisible: boolean;
  isInteractive: boolean;
  textContent?: string;
}

/** 边界框 */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
}

// ============================================
// 多标签页类型
// ============================================

/** 多标签页任务 */
export interface MultiTabTask {
  id: string;
  type: TaskType;
  content: string;
  tabIds: number[];
  status: ExecutionStatus;
  progress: Record<number, number>;
  results: Record<number, ExecutionResult>;
  startTime: number;
  endTime?: number;
}

/** 多标签页结果 */
export interface MultiTabResult {
  taskId: string;
  summary: {
    total: number;
    successful: number;
    failed: number;
  };
  results: Array<{
    tabId: number;
    result: ExecutionResult;
  }>;
}

// ============================================
// 状态同步类型
// ============================================

/** 状态变更 */
export interface StateChange {
  key: string;
  type: StateChangeType;
  oldValue?: unknown;
  newValue?: unknown;
  timestamp: number;
}

/** 状态订阅 */
export interface StateSubscription {
  id: string;
  key: string;
  callback: (change: StateChange) => void;
}

// ============================================
// 代码片段类型
// ============================================

/** 代码片段 */
export interface Snippet {
  id: string;
  name: string;
  description?: string;
  code: string;
  category: SnippetCategory;
  variables?: SnippetVariable[];
  tags?: string[];
}

/** 片段分类 */
export type SnippetCategory = 
  | 'dom' 
  | 'form' 
  | 'extraction' 
  | 'navigation' 
  | 'wait' 
  | 'network' 
  | 'utility';

/** 片段变量 */
export interface SnippetVariable {
  name: string;
  description?: string;
  defaultValue?: string;
  required?: boolean;
}

// ============================================
// 任务模板类型
// ============================================

/** 任务模板 */
export interface TaskTemplate {
  id: string;
  name: string;
  description: string;
  type: TaskType;
  content: string;
  category: TemplateCategory;
  variables?: TemplateVariable[];
  tags?: string[];
}

/** 模板分类 */
export type TemplateCategory = 
  | 'data-extraction' 
  | 'form-operation' 
  | 'navigation' 
  | 'content-analysis' 
  | 'code-template' 
  | 'test-validation';

/** 模板变量 */
export interface TemplateVariable {
  name: string;
  label: string;
  description?: string;
  defaultValue?: string;
  type?: 'text' | 'number' | 'select';
  options?: string[];
  required?: boolean;
}

// ============================================
// 性能监控类型
// ============================================

/** 性能指标 */
export interface PerformanceMetric {
  name: string;
  value: number;
  timestamp: number;
  tags?: Record<string, string>;
}

/** 性能统计 */
export interface PerformanceStats {
  count: number;
  min: number;
  max: number;
  sum: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
}

// ============================================
// 日志类型
// ============================================

/** 日志级别 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** 日志条目 */
export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: number;
  context?: Record<string, unknown>;
  error?: Error;
}

// ============================================
// 错误类型
// ============================================

/** 错误代码 */
export type ErrorCode = 
  | 'VALIDATION_ERROR'
  | 'API_ERROR'
  | 'NETWORK_ERROR'
  | 'EXECUTION_ERROR'
  | 'TIMEOUT_ERROR'
  | 'ABORT_ERROR'
  | 'STORAGE_ERROR'
  | 'SECURITY_ERROR'
  | 'UNKNOWN_ERROR';

/** 规范化错误 */
export interface NormalizedError {
  message: string;
  code: ErrorCode;
  details?: Record<string, unknown>;
  stack?: string;
  recoverable: boolean;
}

// ============================================
// Chrome 扩展类型
// ============================================

/** 扩展消息 */
export interface ExtensionMessage<T = unknown> {
  action: string;
  [key: string]: T;
}

/** 扩展响应 */
export interface ExtensionResponse<T = unknown> {
  success: boolean;
  result?: T;
  error?: string;
  code?: ErrorCode;
}

/** 消息发送者 */
export interface MessageSender {
  id?: string;
  tab?: chrome.tabs.Tab;
  frameId?: number;
}

// ============================================
// 类声明
// ============================================

/** Agent 执行器 */
export class AgentExecutor {
  constructor(options?: AgentExecutorOptions);
  runPrompt(tabId: number, prompt: string, onUpdate?: UpdateCallback): Promise<AgentResult>;
  runCode(tabId: number, code: string, onUpdate?: UpdateCallback): Promise<AgentResult>;
  stop(): void;
  setStreaming(enabled: boolean): void;
  isStreamingEnabled(): boolean;
  getRateLimitStats(): RateLimitStats;
}

/** Agent 执行器选项 */
export interface AgentExecutorOptions {
  maxIterations?: number;
  enableStreaming?: boolean;
  enableRecovery?: boolean;
  maxExecutionsPerMinute?: number;
  onPhaseChange?: (phase: ExecutionPhase, data?: unknown) => void;
  onProgress?: (progress: number, message?: string) => void;
}

/** 更新回调 */
export type UpdateCallback = (update: AgentUpdate) => void;

/** Agent 更新 */
export interface AgentUpdate {
  type: 'thinking' | 'stream' | 'executing' | 'executed' | 'complete' | 'error';
  message?: string;
  code?: string;
  explanation?: string;
  result?: ExecutionResult;
  iteration?: number;
  chunk?: string;
  accumulated?: string;
}

/** 速率限制统计 */
export interface RateLimitStats {
  executionCount: number;
  resetTime: number;
  isLimited: boolean;
}

// ============================================
// 存储管理器
// ============================================

export class StorageManager {
  static getApiKey(): Promise<string>;
  static saveApiKey(key: string): Promise<void>;
  static getApiBaseUrl(): Promise<string>;
  static saveApiBaseUrl(url: string): Promise<void>;
  static getModel(): Promise<string>;
  static saveModel(model: string): Promise<void>;
  static getTasks(): Promise<Task[]>;
  static saveTask(task: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'executionCount'>): Promise<Task>;
  static updateTask(id: string, updates: Partial<Task>): Promise<Task>;
  static deleteTask(id: string): Promise<boolean>;
  static getHistory(): Promise<HistoryItem[]>;
  static addHistory(item: Omit<HistoryItem, 'id' | 'timestamp'>): Promise<HistoryItem>;
  static clearHistory(): Promise<void>;
}

// ============================================
// API 客户端
// ============================================

export class LlmApiClient {
  chatCompletion(messages: ChatMessage[], options?: ChatOptions): Promise<string>;
  testConnection(): Promise<{ success: boolean; message: string }>;
  getConfig(): Promise<ApiConfig>;
}

/** 聊天消息 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** 聊天选项 */
export interface ChatOptions {
  signal?: AbortSignal;
  temperature?: number;
  maxTokens?: number;
}

// ============================================
// 命令面板
// ============================================

export class CommandPalette {
  constructor(options?: CommandPaletteOptions);
  open(initialQuery?: string): void;
  close(): void;
  register(command: Command): void;
  unregister(id: string): void;
  updateCommand(id: string, updates: Partial<Command>): void;
  setFilter(filter: (command: Command) => boolean): void;
  destroy(): void;
}

/** 命令面板选项 */
export interface CommandPaletteOptions {
  container?: HTMLElement;
  commands?: Command[];
  categories?: Record<string, CommandCategory>;
  maxResults?: number;
  onOpen?: () => void;
  onClose?: () => void;
  onSelect?: (command: Command) => void;
}

// ============================================
// 流式响应 UI
// ============================================

export class StreamingResponseUI {
  constructor(options?: StreamingResponseUIOptions);
  startResponse(): void;
  handleChunk(chunk: string): void;
  showThinking(message?: string): void;
  hideThinking(): void;
  complete(): void;
  showError(message: string): void;
  clear(): void;
  getText(): string;
  getCodeBlocks(): Array<{ language: string; code: string }>;
}

/** 流式响应 UI 选项 */
export interface StreamingResponseUIOptions {
  container: HTMLElement;
  onCodeBlock?: (type: 'start' | 'complete', data: CodeBlockData) => void;
  onThinking?: (message: string) => void;
  onComplete?: () => void;
}

/** 代码块数据 */
export interface CodeBlockData {
  language?: string;
  code?: string;
}

// ============================================
// 元素选择器
// ============================================

export class ElementSelector {
  constructor(options?: ElementSelectorOptions);
  start(): Promise<ElementInfo>;
  stop(): void;
  highlight(selector: string): void;
  clearHighlight(): void;
}

/** 元素选择器选项 */
export interface ElementSelectorOptions {
  onHover?: (info: ElementInfo) => void;
  onSelect?: (info: ElementInfo) => void;
  filter?: (element: Element) => boolean;
  highlightStyle?: Partial<CSSStyleDeclaration>;
}

// ============================================
// 多标签页协调器
// ============================================

export class MultiTabCoordinator {
  constructor(options?: MultiTabCoordinatorOptions);
  executeOnTabs(task: Omit<MultiTabTask, 'id' | 'status' | 'progress' | 'results' | 'startTime'>): Promise<MultiTabResult>;
  executeOnAllTabs(task: { type: TaskType; content: string }): Promise<MultiTabResult>;
  getTaskStatus(taskId: string): MultiTabTask | undefined;
  getActiveTasks(): MultiTabTask[];
  cancelTask(taskId: string): Promise<boolean>;
}

/** 多标签页协调器选项 */
export interface MultiTabCoordinatorOptions {
  maxConcurrentTabs?: number;
  taskTimeout?: number;
  onProgress?: (taskId: string, tabId: number, progress: number) => void;
  onComplete?: (taskId: string, results: MultiTabResult) => void;
  onError?: (taskId: string, tabId: number, error: Error) => void;
}

// ============================================
// 恢复管理器
// ============================================

export class RecoveryManager {
  constructor(options?: RecoveryManagerOptions);
  executeWithRecovery<T>(
    operation: () => Promise<T>,
    strategy: RecoveryStrategy,
    context?: Record<string, unknown>
  ): Promise<T>;
  getStats(): RecoveryStats;
  reset(): void;
}

/** 恢复管理器选项 */
export interface RecoveryManagerOptions {
  enableRecovery?: boolean;
  enableLogging?: boolean;
  maxRetries?: number;
  retryDelay?: number;
  backoffMultiplier?: number;
}

/** 恢复策略 */
export type RecoveryStrategy = 'none' | 'retry' | 'fallback' | 'circuit-breaker' | 'api' | 'execution';

// ============================================
// 性能追踪器
// ============================================

export class PerformanceTracker {
  track<T>(name: string, operation: () => Promise<T>): Promise<T>;
  trackSync<T>(name: string, operation: () => T): T;
  trackApi(name: string, operation: () => Promise<unknown>): Promise<unknown>;
  startTimer(name: string): void;
  endTimer(name: string): number;
}

// ============================================
// 日志器
// ============================================

export class Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  time(label: string): void;
  timeEnd(label: string): void;
  child(namespace: string): Logger;
}
