// lib/progress.js - Execution progress visualization and real-time monitoring

import { logger } from './logger.js';
import { metrics } from './performance.js';

/**
 * ExecutionPhase - Phases of agent execution
 */
export const ExecutionPhase = {
  INITIALIZING: 'initializing',
  ANALYZING: 'analyzing',
  THINKING: 'thinking',
  GENERATING: 'generating',
  EXECUTING: 'executing',
  OBSERVING: 'observing',
  COMPLETED: 'completed',
  FAILED: 'failed'
};

/**
 * Phase metadata for display
 */
export const PhaseMetadata = {
  [ExecutionPhase.INITIALIZING]: {
    label: 'Initializing',
    icon: '🔄',
    color: '#58a6ff',
    weight: 5
  },
  [ExecutionPhase.ANALYZING]: {
    label: 'Analyzing Page',
    icon: '🔍',
    color: '#8b949e',
    weight: 10
  },
  [ExecutionPhase.THINKING]: {
    label: 'Thinking',
    icon: '🧠',
    color: '#d29922',
    weight: 30
  },
  [ExecutionPhase.GENERATING]: {
    label: 'Generating Code',
    icon: '⚙️',
    color: '#238636',
    weight: 15
  },
  [ExecutionPhase.EXECUTING]: {
    label: 'Executing',
    icon: '⚡',
    color: '#f85149',
    weight: 25
  },
  [ExecutionPhase.OBSERVING]: {
    label: 'Observing Result',
    icon: '👁️',
    color: '#a371f7',
    weight: 10
  },
  [ExecutionPhase.COMPLETED]: {
    label: 'Completed',
    icon: '✅',
    color: '#238636',
    weight: 0
  },
  [ExecutionPhase.FAILED]: {
    label: 'Failed',
    icon: '❌',
    color: '#f85149',
    weight: 0
  }
};

/**
 * ExecutionProgress - Tracks and visualizes execution progress
 */
export class ExecutionProgress {
  constructor(options = {}) {
    this.options = {
      container: options.container || null,
      onPhaseChange: options.onPhaseChange || null,
      onProgress: options.onProgress || null,
      ...options
    };

    this.currentPhase = null;
    this.startTime = null;
    this.endTime = null;
    this.phases = [];
    this.steps = [];
    this.currentStep = 0;
    this.totalSteps = 0;
    this.status = 'idle';
    this.metadata = {};
  }

  /**
   * Start execution tracking
   * @param {Object} config - Execution configuration
   */
  start(config = {}) {
    this.startTime = Date.now();
    this.endTime = null;
    this.phases = [];
    this.steps = config.steps || [];
    this.currentStep = 0;
    this.totalSteps = this.steps.length || config.maxIterations || 10;
    this.status = 'running';
    this.metadata = config.metadata || {};

    this.transitionTo(ExecutionPhase.INITIALIZING);

    logger.info('Execution started', { totalSteps: this.totalSteps });
    metrics.increment('execution.started');

    this.render();
  }

  /**
   * Transition to new phase
   * @param {string} phase - New phase
   * @param {Object} data - Phase data
   */
  transitionTo(phase, data = {}) {
    const previousPhase = this.currentPhase;
    this.currentPhase = phase;

    const phaseRecord = {
      phase,
      startTime: Date.now(),
      endTime: null,
      duration: null,
      data
    };

    // Close previous phase
    if (this.phases.length > 0) {
      const lastPhase = this.phases[this.phases.length - 1];
      lastPhase.endTime = Date.now();
      lastPhase.duration = lastPhase.endTime - lastPhase.startTime;

      // Record metric
      metrics.record(`phase.${lastPhase.phase}`, lastPhase.duration);
    }

    this.phases.push(phaseRecord);

    // Notify listeners
    this.options.onPhaseChange?.(phase, previousPhase, data);

    logger.debug(`Phase: ${phase}`, { data });
    this.render();
  }

  /**
   * Update progress within current phase
   * @param {number} step - Current step
   * @param {string} message - Progress message
   */
  updateProgress(step, message = '') {
    this.currentStep = step;
    this.options.onProgress?.(step, this.totalSteps, message);
    this.render();
  }

  /**
   * Add a step to execution
   * @param {Object} step - Step details
   */
  addStep(step) {
    this.steps.push({
      ...step,
      timestamp: Date.now(),
      stepNumber: this.steps.length + 1
    });

    this.currentStep = this.steps.length;
    this.render();
  }

  /**
   * Mark execution as completed
   * @param {Object} result - Execution result
   */
  complete(result = {}) {
    this.endTime = Date.now();
    this.status = 'completed';
    this.transitionTo(ExecutionPhase.COMPLETED, { result });

    const duration = this.endTime - this.startTime;
    metrics.record('execution.total_duration', duration);
    metrics.increment('execution.completed');

    logger.info('Execution completed', {
      duration,
      steps: this.steps.length,
      phases: this.phases.length
    });

    this.render();
  }

  /**
   * Mark execution as failed
   * @param {Error} error - Error that caused failure
   */
  fail(error) {
    this.endTime = Date.now();
    this.status = 'failed';
    this.transitionTo(ExecutionPhase.FAILED, { error });

    const duration = this.endTime - this.startTime;
    metrics.record('execution.failed_duration', duration);
    metrics.increment('execution.failed');

    logger.error('Execution failed', {
      error: error.message,
      duration,
      steps: this.steps.length
    });

    this.render();
  }

  /**
   * Get execution statistics
   * @returns {Object}
   */
  getStats() {
    const duration = this.endTime ? this.endTime - this.startTime : Date.now() - this.startTime;

    const phaseStats = {};
    this.phases.forEach(p => {
      if (p.duration !== null) {
        if (!phaseStats[p.phase]) {
          phaseStats[p.phase] = [];
        }
        phaseStats[p.phase].push(p.duration);
      }
    });

    return {
      status: this.status,
      duration,
      currentPhase: this.currentPhase,
      totalSteps: this.totalSteps,
      completedSteps: this.currentStep,
      progress: this.totalSteps > 0 ? ((this.currentStep / this.totalSteps) * 100).toFixed(1) : 0,
      phases: phaseStats
    };
  }

  /**
   * Render progress UI
   */
  render() {
    const container = this.options.container;
    if (!container) return;

    const stats = this.getStats();
    const metadata = PhaseMetadata[this.currentPhase] || {};

    container.innerHTML = `
      <div class="execution-progress">
        <div class="progress-header">
          <span class="phase-icon">${metadata.icon || '🔄'}</span>
          <span class="phase-label">${metadata.label || this.currentPhase}</span>
          <span class="progress-percentage">${stats.progress}%</span>
        </div>
        
        <div class="progress-bar-container">
          <div class="progress-bar" style="width: ${stats.progress}%; background: ${metadata.color || '#58a6ff'}"></div>
        </div>
        
        <div class="progress-stats">
          <span class="stat">Step ${stats.completedSteps}/${stats.totalSteps}</span>
          <span class="stat">${this.formatDuration(stats.duration)}</span>
        </div>
        
        <div class="progress-steps">
          ${this.renderSteps()}
        </div>
        
        <div class="progress-phases">
          ${this.renderPhases()}
        </div>
      </div>
    `;

    // Add styles if not present
    this.addStyles();
  }

  /**
   * Render steps list
   * @returns {string}
   */
  renderSteps() {
    if (this.steps.length === 0) return '';

    return this.steps
      .map(
        (step, index) => `
      <div class="step-item ${index === this.currentStep - 1 ? 'active' : ''} ${step.error ? 'error' : ''}">
        <span class="step-number">${index + 1}</span>
        <span class="step-type">${step.type || 'step'}</span>
        <span class="step-status">${step.error ? '❌' : '✅'}</span>
      </div>
    `
      )
      .join('');
  }

  /**
   * Render phase timeline
   * @returns {string}
   */
  renderPhases() {
    return this.phases
      .map(p => {
        const meta = PhaseMetadata[p.phase] || {};
        return `
        <div class="phase-item">
          <span class="phase-marker" style="background: ${meta.color}"></span>
          <span class="phase-name">${meta.label || p.phase}</span>
          ${p.duration ? `<span class="phase-duration">${this.formatDuration(p.duration)}</span>` : ''}
        </div>
      `;
      })
      .join('');
  }

  /**
   * Format duration for display
   * @param {number} ms - Duration in milliseconds
   * @returns {string}
   */
  formatDuration(ms) {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  }

  /**
   * Add CSS styles for progress UI
   */
  addStyles() {
    if (document.getElementById('progress-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'progress-styles';
    styles.textContent = `
      .execution-progress {
        padding: 16px;
        background: var(--bg-secondary);
        border-radius: 8px;
        border: 1px solid var(--border);
      }

      .progress-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 12px;
      }

      .phase-icon {
        font-size: 20px;
      }

      .phase-label {
        font-weight: 600;
        flex: 1;
      }

      .progress-percentage {
        font-size: 14px;
        color: var(--text-muted);
      }

      .progress-bar-container {
        height: 8px;
        background: var(--bg-tertiary);
        border-radius: 4px;
        overflow: hidden;
        margin-bottom: 12px;
      }

      .progress-bar {
        height: 100%;
        transition: width 0.3s ease;
        border-radius: 4px;
      }

      .progress-stats {
        display: flex;
        justify-content: space-between;
        font-size: 12px;
        color: var(--text-muted);
        margin-bottom: 12px;
      }

      .progress-steps {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-bottom: 12px;
      }

      .step-item {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 4px 8px;
        background: var(--bg-tertiary);
        border-radius: 4px;
        font-size: 11px;
      }

      .step-item.active {
        border: 1px solid var(--accent);
      }

      .step-item.error {
        background: rgba(248, 81, 73, 0.1);
      }

      .step-number {
        font-weight: 600;
      }

      .progress-phases {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .phase-item {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 11px;
      }

      .phase-marker {
        width: 8px;
        height: 8px;
        border-radius: 50%;
      }

      .phase-name {
        flex: 1;
        color: var(--text-secondary);
      }

      .phase-duration {
        color: var(--text-muted);
        font-size: 10px;
      }
    `;

    document.head.appendChild(styles);
  }

  /**
   * Reset progress tracking
   */
  reset() {
    this.currentPhase = null;
    this.startTime = null;
    this.endTime = null;
    this.phases = [];
    this.steps = [];
    this.currentStep = 0;
    this.totalSteps = 0;
    this.status = 'idle';
    this.metadata = {};

    if (this.options.container) {
      this.options.container.innerHTML = '';
    }
  }
}

/**
 * RealTimeMonitor - Real-time execution monitoring
 */
export class RealTimeMonitor {
  constructor(options = {}) {
    this.options = {
      updateInterval: options.updateInterval || 1000,
      onMetric: options.onMetric || null,
      onAlert: options.onAlert || null,
      ...options
    };

    this.activeExecutions = new Map();
    this.metricHistory = [];
    this.alerts = [];
    this.isMonitoring = false;
    this.monitorTimer = null;
    this.thresholds = {
      duration: 60000, // Alert if execution > 60s
      memory: 100 * 1024 * 1024, // Alert if memory > 100MB
      errorRate: 0.3 // Alert if error rate > 30%
    };
  }

  /**
   * Start monitoring
   */
  start() {
    if (this.isMonitoring) return;

    this.isMonitoring = true;
    this.monitorTimer = setInterval(() => {
      this.collectMetrics();
    }, this.options.updateInterval);

    logger.info('Real-time monitor started');
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (!this.isMonitoring) return;

    this.isMonitoring = false;
    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = null;
    }

    logger.info('Real-time monitor stopped');
  }

  /**
   * Register execution for monitoring
   * @param {string} executionId - Execution ID
   * @param {Object} metadata - Execution metadata
   */
  registerExecution(executionId, metadata = {}) {
    this.activeExecutions.set(executionId, {
      id: executionId,
      startTime: Date.now(),
      ...metadata
    });
  }

  /**
   * Unregister execution
   * @param {string} executionId - Execution ID
   */
  unregisterExecution(executionId) {
    const execution = this.activeExecutions.get(executionId);
    if (execution) {
      const duration = Date.now() - execution.startTime;
      this.metricHistory.push({
        type: 'execution',
        executionId,
        duration,
        timestamp: Date.now()
      });

      this.activeExecutions.delete(executionId);
    }
  }

  /**
   * Collect current metrics
   */
  collectMetrics() {
    const now = Date.now();

    // Collect active executions
    this.activeExecutions.forEach((execution, id) => {
      const duration = now - execution.startTime;

      // Check thresholds
      if (duration > this.thresholds.duration) {
        this.alert('long_running', {
          executionId: id,
          duration,
          threshold: this.thresholds.duration
        });
      }
    });

    // Collect memory metrics (if available)
    if (performance.memory) {
      const memory = {
        used: performance.memory.usedJSHeapSize,
        total: performance.memory.totalJSHeapSize,
        limit: performance.memory.jsHeapSizeLimit
      };

      if (memory.used > this.thresholds.memory) {
        this.alert('high_memory', {
          used: memory.used,
          threshold: this.thresholds.memory
        });
      }

      this.metricHistory.push({
        type: 'memory',
        value: memory,
        timestamp: now
      });
    }

    // Notify metric listeners
    this.options.onMetric?.({
      activeExecutions: this.activeExecutions.size,
      timestamp: now
    });
  }

  /**
   * Create alert
   * @param {string} type - Alert type
   * @param {Object} data - Alert data
   */
  alert(type, data) {
    const alert = {
      type,
      data,
      timestamp: Date.now()
    };

    this.alerts.push(alert);

    // Notify alert listeners
    this.options.onAlert?.(alert);

    logger.warn(`Alert: ${type}`, data);
  }

  /**
   * Get monitoring statistics
   * @returns {Object}
   */
  getStats() {
    return {
      activeExecutions: this.activeExecutions.size,
      totalExecutions: this.metricHistory.filter(m => m.type === 'execution').length,
      alerts: this.alerts.length,
      isMonitoring: this.isMonitoring
    };
  }

  /**
   * Clear history
   */
  clearHistory() {
    this.metricHistory = [];
    this.alerts = [];
  }

  /**
   * Set threshold
   * @param {string} name - Threshold name
   * @param {number} value - Threshold value
   */
  setThreshold(name, value) {
    if (Object.prototype.hasOwnProperty.call(this.thresholds, name)) {
      this.thresholds[name] = value;
    }
  }
}

// Export singleton instances
export const progress = new ExecutionProgress();
export const monitor = new RealTimeMonitor();

/**
 * Helper function to create progress tracker
 * @param {HTMLElement} container - Container element
 * @returns {ExecutionProgress}
 */
export function createProgressTracker(container) {
  return new ExecutionProgress({ container });
}
