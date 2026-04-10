// integration-guide.js - 新模块集成指南

/**
 * 本文档展示如何将新的改进模块集成到现有的 Agentab 项目中
 */

// =============================================================================
// 1. 在 agent.js 中集成安全沙箱和错误恢复
// =============================================================================

// 原代码 (lib/agent.js):
/*
import { SandboxExecutor } from './sandbox.js';

export class AgentExecutor {
  async executeCode(tabId, code) {
    // 使用旧沙箱
    const validation = this.sandbox.validate(code);
    ...
  }
}
*/

// 改进后:
import { SecureSandbox } from './secure-sandbox.js';
import { RecoveryManager, RecoveryStrategy } from './recovery.js';
import { ExecutionProgress, ExecutionPhase } from './progress.js';

export class AgentExecutor {
  constructor(options = {}) {
    // 使用增强的安全沙箱
    this.sandbox = new SecureSandbox(options.sandbox);

    // 添加错误恢复管理器
    this.recovery = new RecoveryManager({
      enableRecovery: true,
      enableLogging: true
    });

    // 添加进度追踪器
    this.progress = new ExecutionProgress(options.progress);
  }

  /**
   * 执行代码 - 增强版本
   */
  async executeCode(tabId, code) {
    // 1. 使用增强的安全沙箱验证
    const validation = this.sandbox.validate(code);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    // 显示安全警告
    if (validation.warnings && validation.warnings.length > 0) {
      console.warn('Security warnings:', validation.warnings);
      // 可选: 通知用户这些警告
    }

    // 2. 使用错误恢复机制执行
    const result = await this.recovery.executeWithRecovery(
      () => this._doExecuteCode(tabId, code),
      RecoveryStrategy.EXECUTION,
      { tabId, codeLength: code.length }
    );

    return result;
  }

  /**
   * 实际执行代码 (内部方法)
   */
  async _doExecuteCode(tabId, code) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: codeStr => {
          try {
            const asyncFn = new Function(`
              "use strict";
              return (async () => {
                ${codeStr}
              })();
            `);
            return asyncFn();
          } catch (e) {
            return { __error: true, message: e.message, stack: e.stack };
          }
        },
        args: [code],
        world: 'MAIN'
      });

      const result = results[0]?.result;

      if (result && typeof result === 'object' && result.__error) {
        return {
          success: false,
          error: result.message,
          stack: result.stack
        };
      }

      return { success: true, result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 运行提示词 - 添加进度追踪
   */
  async runPrompt(tabId, prompt, onUpdate) {
    // 开始进度追踪
    this.progress.start({
      maxIterations: this.maxIterations,
      metadata: { prompt, tabId }
    });

    try {
      // 初始化阶段
      this.progress.transitionTo(ExecutionPhase.INITIALIZING);

      // 获取页面信息
      this.progress.transitionTo(ExecutionPhase.ANALYZING);
      const pageInfo = await PageAnalyzer.getPromptContext(tabId);

      // 思考和生成代码
      this.progress.transitionTo(ExecutionPhase.THINKING);
      const systemMessage = {
        role: 'system',
        content: this.getSystemPrompt(pageInfo)
      };

      // ... 智能体循环 ...

      for (let iteration = 1; iteration <= this.maxIterations; iteration++) {
        this.progress.updateProgress(iteration, `Iteration ${iteration}`);

        // 生成代码
        this.progress.transitionTo(ExecutionPhase.GENERATING);
        const llmResponse = await this.recovery.executeWithRecovery(
          () =>
            apiClient.chatCompletion([systemMessage, ...this.conversationHistory], {
              signal: this.abortController?.signal
            }),
          RecoveryStrategy.API
        );

        // 执行代码
        this.progress.transitionTo(ExecutionPhase.EXECUTING);
        this.progress.addStep({
          type: 'execution',
          iteration,
          code: action.code
        });

        const execResult = await this.executeCode(tabId, action.code);

        // 观察结果
        this.progress.transitionTo(ExecutionPhase.OBSERVING);
        // ... 处理结果 ...
      }

      // 完成
      this.progress.complete({ iterations: this.maxIterations });
      return results;
    } catch (error) {
      this.progress.fail(error);
      throw error;
    }
  }
}

// =============================================================================
// 2. 在 background.js 中集成任务调度
// =============================================================================

// 原代码 (background/background.js):
/*
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch(error => {
      sendResponse({ error: error.message });
    });
  return true;
});
*/

// 改进后:
import { TaskScheduler, ScheduleType } from '../lib/scheduler.js';
import { CircuitBreaker } from '../lib/recovery.js';

const taskScheduler = new TaskScheduler();
const apiCircuitBreaker = new CircuitBreaker({
  failureThreshold: 5,
  recoveryTimeout: 30000
});

// 初始化调度器
await taskScheduler.init();

// 添加调度相关的消息处理
async function handleMessage(message, sender) {
  switch (message.action) {
    // ... 原有的处理逻辑 ...

    // 新增: 调度相关
    case 'create_schedule':
      return handleCreateSchedule(message);

    case 'get_schedules':
      return handleGetSchedules(message);

    case 'update_schedule':
      return handleUpdateSchedule(message);

    case 'delete_schedule':
      return handleDeleteSchedule(message);

    case 'pause_schedule':
      return handlePauseSchedule(message);

    case 'resume_schedule':
      return handleResumeSchedule(message);

    // 新增: 使用断路器保护API调用
    case 'execute_prompt':
      return handleExecutePromptWithCircuitBreaker(message, sender);

    default:
      throw new Error(`Unknown action: ${message.action}`);
  }
}

// 创建调度任务
async function handleCreateSchedule(message) {
  const schedule = await taskScheduler.createSchedule({
    taskId: message.taskId,
    name: message.name,
    type: message.type,
    config: message.config,
    metadata: message.metadata
  });

  return { success: true, schedule };
}

// 获取调度列表
async function handleGetSchedules(message) {
  const schedules = taskScheduler.getSchedules(message.filter);
  return { success: true, schedules };
}

// 更新调度
async function handleUpdateSchedule(message) {
  const schedule = await taskScheduler.updateSchedule(message.scheduleId, message.updates);
  return { success: true, schedule };
}

// 删除调度
async function handleDeleteSchedule(message) {
  const deleted = await taskScheduler.deleteSchedule(message.scheduleId);
  return { success: true, deleted };
}

// 暂停调度
async function handlePauseSchedule(message) {
  const schedule = await taskScheduler.pauseSchedule(message.scheduleId);
  return { success: true, schedule };
}

// 恢复调度
async function handleResumeSchedule(message) {
  const schedule = await taskScheduler.resumeSchedule(message.scheduleId);
  return { success: true, schedule };
}

// 使用断路器保护API调用
async function handleExecutePromptWithCircuitBreaker(message, sender) {
  try {
    return await apiCircuitBreaker.execute(async () => {
      return await handleExecutePrompt(message, sender);
    });
  } catch (error) {
    if (error.message.includes('Circuit breaker is OPEN')) {
      // 断路器打开,返回友好错误
      return {
        error: 'API服务暂时不可用,请稍后再试。系统正在自动恢复中。',
        code: 'CIRCUIT_BREAKER_OPEN'
      };
    }
    throw error;
  }
}

// =============================================================================
// 3. 在 sidepanel.js 中集成进度可视化和自动补全
// =============================================================================

// 原代码 (sidepanel/sidepanel.js):
/*
const codeEditor = new CodeEditor({
  textarea: document.getElementById('code-input')
});
*/

// 改进后:
import { AutocompleteUI, autocompleteEngine } from '../lib/autocomplete.js';
import { ExecutionProgress } from '../lib/progress.js';

// 初始化进度追踪UI
const progressContainer = document.getElementById('progress-container');
const executionProgress = new ExecutionProgress({
  container: progressContainer,
  onPhaseChange: (phase, previousPhase, data) => {
    console.log(`Phase changed: ${previousPhase} -> ${phase}`);
    // 可选: 播放动画或音效
  },
  onProgress: (step, total, message) => {
    console.log(`Progress: ${step}/${total} - ${message}`);
  }
});

// 初始化代码编辑器并添加自动补全
const codeEditor = new CodeEditor({
  textarea: document.getElementById('code-input')
});

const autocompleteUI = new AutocompleteUI(
  document.getElementById('code-input'),
  autocompleteEngine
);

// 运行代码时开始追踪进度
async function runCode() {
  const code = codeEditor.getValue();

  // 开始进度追踪
  executionProgress.start({
    maxIterations: 1,
    metadata: { type: 'code', codeLength: code.length }
  });

  try {
    executionProgress.transitionTo('executing');

    const response = await chrome.runtime.sendMessage({
      action: 'execute_code',
      code
    });

    if (response.success) {
      executionProgress.complete({ result: response.result });
    } else {
      executionProgress.fail(new Error(response.error));
    }
  } catch (error) {
    executionProgress.fail(error);
  }
}

// 运行提示词时追踪进度
async function runPrompt() {
  const prompt = promptEditor.getValue();

  executionProgress.start({
    maxIterations: 10,
    metadata: { type: 'prompt', prompt }
  });

  try {
    // 监听智能体更新
    const listener = message => {
      if (message.action === 'agent_update') {
        handleAgentUpdate(message.update);
      }
    };

    chrome.runtime.onMessage.addListener(listener);

    const response = await chrome.runtime.sendMessage({
      action: 'execute_prompt',
      prompt
    });

    chrome.runtime.onMessage.removeListener(listener);

    if (response.success) {
      executionProgress.complete({ results: response.results });
    } else {
      executionProgress.fail(new Error(response.error));
    }
  } catch (error) {
    executionProgress.fail(error);
  }
}

// 处理智能体更新
function handleAgentUpdate(update) {
  switch (update.type) {
    case 'thinking':
      executionProgress.transitionTo('thinking');
      break;

    case 'executing':
      executionProgress.transitionTo('executing');
      executionProgress.addStep({
        type: 'code',
        code: update.code,
        iteration: update.iteration
      });
      break;

    case 'complete':
      executionProgress.transitionTo('completed');
      break;

    case 'error':
      executionProgress.fail(new Error(update.message));
      break;
  }
}

// =============================================================================
// 4. 在 settings.js 中显示恢复统计
// =============================================================================

// 改进后:
import { recoveryManager } from '../lib/recovery.js';
import { circuitBreaker } from '../lib/recovery.js';

// 在设置页面显示统计
function showRecoveryStats() {
  const stats = recoveryManager.getStats();
  const circuitState = circuitBreaker.getState();

  const statsHtml = `
    <div class="stats-section">
      <h3>错误恢复统计</h3>
      <div class="stat-item">
        <label>总尝试次数:</label>
        <span>${stats.total}</span>
      </div>
      <div class="stat-item">
        <label>成功恢复:</label>
        <span>${stats.successful} (${stats.successRate}%)</span>
      </div>
      <div class="stat-item">
        <label>平均尝试次数:</label>
        <span>${stats.avgAttempts}</span>
      </div>
      <div class="stat-item">
        <label>断路器状态:</label>
        <span>${circuitState.state}</span>
      </div>
      <div class="stat-item">
        <label>当前失败数:</label>
        <span>${circuitState.failures}/${circuitState.threshold}</span>
      </div>
    </div>
  `;

  document.getElementById('recovery-stats').innerHTML = statsHtml;
}

// =============================================================================
// 5. 创建调度任务UI
// =============================================================================

// 在 tasks.html 中添加调度UI
/*
<div id="schedule-section" class="hidden">
  <h3>任务调度</h3>
  <button id="btn-create-schedule">创建调度</button>
  <div id="schedules-list"></div>
</div>
*/

// 在 tasks.js 中添加调度逻辑
async function showCreateScheduleDialog(taskId) {
  const dialog = document.createElement('div');
  dialog.className = 'schedule-dialog';
  dialog.innerHTML = `
    <h4>创建任务调度</h4>
    <form id="schedule-form">
      <div class="form-group">
        <label>调度名称:</label>
        <input type="text" id="schedule-name" required>
      </div>
      <div class="form-group">
        <label>调度类型:</label>
        <select id="schedule-type">
          <option value="once">一次性</option>
          <option value="interval">间隔执行</option>
          <option value="recurring">周期执行</option>
        </select>
      </div>
      <div class="form-group schedule-config">
        <!-- 根据类型动态显示配置选项 -->
      </div>
      <div class="form-actions">
        <button type="button" id="btn-cancel">取消</button>
        <button type="submit">创建</button>
      </div>
    </form>
  `;

  document.body.appendChild(dialog);

  // 处理类型变化
  document.getElementById('schedule-type').addEventListener('change', e => {
    const configDiv = dialog.querySelector('.schedule-config');
    switch (e.target.value) {
      case 'once':
        configDiv.innerHTML = `
          <label>执行时间:</label>
          <input type="datetime-local" id="run-at" required>
        `;
        break;
      case 'interval':
        configDiv.innerHTML = `
          <label>间隔时间:</label>
          <input type="text" id="interval" placeholder="例如: 5m, 1h, 1d" required>
        `;
        break;
      case 'recurring':
        configDiv.innerHTML = `
          <label>Cron表达式:</label>
          <input type="text" id="cron" placeholder="例如: */5 * * * *" required>
          <small>支持简单的cron表达式</small>
        `;
        break;
    }
  });

  // 处理表单提交
  dialog.querySelector('#schedule-form').addEventListener('submit', async e => {
    e.preventDefault();

    const formData = {
      taskId,
      name: document.getElementById('schedule-name').value,
      type: document.getElementById('schedule-type').value,
      config: {}
    };

    // 根据类型收集配置
    switch (formData.type) {
      case 'once':
        formData.config.runAt = new Date(document.getElementById('run-at').value).getTime();
        break;
      case 'interval':
        formData.config.interval = document.getElementById('interval').value;
        break;
      case 'recurring':
        formData.config.cron = document.getElementById('cron').value;
        break;
    }

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'create_schedule',
        ...formData
      });

      if (response.success) {
        alert('调度创建成功!');
        dialog.remove();
        loadSchedules();
      }
    } catch (error) {
      alert(`创建失败: ${error.message}`);
    }
  });

  // 取消按钮
  dialog.querySelector('#btn-cancel').addEventListener('click', () => {
    dialog.remove();
  });
}

// 加载调度列表
async function loadSchedules() {
  const response = await chrome.runtime.sendMessage({
    action: 'get_schedules'
  });

  const list = document.getElementById('schedules-list');
  list.innerHTML = response.schedules
    .map(
      schedule => `
    <div class="schedule-item">
      <div class="schedule-info">
        <span class="schedule-name">${schedule.name}</span>
        <span class="schedule-type">${schedule.type}</span>
        <span class="schedule-status">${schedule.status}</span>
      </div>
      <div class="schedule-actions">
        ${
          schedule.status === 'active'
            ? `
          <button onclick="pauseSchedule('${schedule.id}')">暂停</button>
        `
            : `
          <button onclick="resumeSchedule('${schedule.id}')">恢复</button>
        `
        }
        <button onclick="deleteSchedule('${schedule.id}')">删除</button>
      </div>
    </div>
  `
    )
    .join('');
}

// =============================================================================
// 总结
// =============================================================================

/**
 * 集成步骤总结:
 *
 * 1. 在 agent.js 中:
 *    - 替换 SandboxExecutor 为 SecureSandbox
 *    - 添加 RecoveryManager 处理错误
 *    - 添加 ExecutionProgress 追踪进度
 *
 * 2. 在 background.js 中:
 *    - 初始化 TaskScheduler
 *    - 添加调度相关的消息处理
 *    - 使用 CircuitBreaker 保护API调用
 *
 * 3. 在 sidepanel.js 中:
 *    - 添加 AutocompleteUI 到代码编辑器
 *    - 使用 ExecutionProgress 显示进度
 *    - 监听智能体更新事件
 *
 * 4. 在 settings.js 中:
 *    - 显示恢复统计和断路器状态
 *
 * 5. 在 tasks.js 中:
 *    - 添加调度创建UI
 *    - 显示调度列表
 *    - 实现调度管理功能
 *
 * 所有改进都向后兼容,可以逐步集成,不需要一次性全部替换。
 */
