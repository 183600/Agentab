import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ExecutionProgress,
  ExecutionPhase,
  PhaseMetadata,
  RealTimeMonitor,
  progress,
  monitor
} from '../lib/progress.js';

describe('ExecutionProgress', () => {
  let progressTracker;
  let container;

  beforeEach(() => {
    container = document.createElement('div');
    progressTracker = new ExecutionProgress({ container });
  });

  describe('start()', () => {
    it('should initialize execution tracking', () => {
      progressTracker.start({ maxIterations: 5 });

      expect(progressTracker.startTime).toBeDefined();
      expect(progressTracker.status).toBe('running');
      expect(progressTracker.totalSteps).toBe(5);
    });

    it('should transition to INITIALIZING phase', () => {
      progressTracker.start();

      expect(progressTracker.currentPhase).toBe(ExecutionPhase.INITIALIZING);
      expect(progressTracker.phases).toHaveLength(1);
    });

    it('should accept custom steps', () => {
      const steps = [{ type: 'analyze' }, { type: 'execute' }];

      progressTracker.start({ steps });

      expect(progressTracker.steps).toEqual(steps);
      expect(progressTracker.totalSteps).toBe(2);
    });
  });

  describe('transitionTo()', () => {
    it('should transition to new phase', () => {
      progressTracker.start();
      progressTracker.transitionTo(ExecutionPhase.THINKING);

      expect(progressTracker.currentPhase).toBe(ExecutionPhase.THINKING);
      expect(progressTracker.phases).toHaveLength(2);
    });

    it('should close previous phase', () => {
      progressTracker.start();
      const firstPhase = progressTracker.phases[0];

      progressTracker.transitionTo(ExecutionPhase.THINKING);

      expect(firstPhase.endTime).toBeDefined();
      expect(firstPhase.duration).toBeDefined();
    });

    it('should call onPhaseChange callback', () => {
      const onPhaseChange = vi.fn();
      const tracker = new ExecutionProgress({ onPhaseChange });

      tracker.start();
      tracker.transitionTo(ExecutionPhase.THINKING);

      expect(onPhaseChange).toHaveBeenCalledWith(
        ExecutionPhase.THINKING,
        ExecutionPhase.INITIALIZING,
        {}
      );
    });
  });

  describe('updateProgress()', () => {
    it('should update current step', () => {
      progressTracker.start({ maxIterations: 10 });
      progressTracker.updateProgress(3, 'Processing');

      expect(progressTracker.currentStep).toBe(3);
    });

    it('should call onProgress callback', () => {
      const onProgress = vi.fn();
      const tracker = new ExecutionProgress({ onProgress });

      tracker.start({ maxIterations: 10 });
      tracker.updateProgress(3, 'Processing');

      expect(onProgress).toHaveBeenCalledWith(3, 10, 'Processing');
    });
  });

  describe('addStep()', () => {
    it('should add step to list', () => {
      progressTracker.start();

      progressTracker.addStep({ type: 'code', code: 'const x = 1' });

      expect(progressTracker.steps).toHaveLength(1);
      expect(progressTracker.steps[0].type).toBe('code');
      expect(progressTracker.steps[0].timestamp).toBeDefined();
    });

    it('should assign step number', () => {
      progressTracker.start();

      progressTracker.addStep({ type: 'test' });
      progressTracker.addStep({ type: 'test2' });

      expect(progressTracker.steps[0].stepNumber).toBe(1);
      expect(progressTracker.steps[1].stepNumber).toBe(2);
    });
  });

  describe('complete()', () => {
    it('should mark execution as completed', () => {
      progressTracker.start();
      progressTracker.complete({ result: 'success' });

      expect(progressTracker.status).toBe('completed');
      expect(progressTracker.endTime).toBeDefined();
      expect(progressTracker.currentPhase).toBe(ExecutionPhase.COMPLETED);
    });

    it('should calculate total duration', () => {
      progressTracker.start();
      const start = progressTracker.startTime;

      return new Promise(resolve => {
        setTimeout(() => {
          progressTracker.complete();
          expect(progressTracker.endTime).toBeGreaterThan(start);
          resolve();
        }, 10);
      });
    });
  });

  describe('fail()', () => {
    it('should mark execution as failed', () => {
      const error = new Error('Test error');
      progressTracker.start();
      progressTracker.fail(error);

      expect(progressTracker.status).toBe('failed');
      expect(progressTracker.currentPhase).toBe(ExecutionPhase.FAILED);
    });

    it('should record error in phase data', () => {
      const error = new Error('Test error');
      progressTracker.start();
      progressTracker.fail(error);

      const lastPhase = progressTracker.phases[progressTracker.phases.length - 1];
      expect(lastPhase.data.error).toBe(error);
    });
  });

  describe('getStats()', () => {
    it('should return execution statistics', () => {
      progressTracker.start({ maxIterations: 5 });
      progressTracker.updateProgress(2);

      const stats = progressTracker.getStats();

      expect(stats.status).toBe('running');
      expect(stats.totalSteps).toBe(5);
      expect(stats.completedSteps).toBe(2);
      expect(stats.progress).toBe('40.0');
    });

    it('should calculate progress percentage', () => {
      progressTracker.start({ maxIterations: 10 });
      progressTracker.updateProgress(7);

      const stats = progressTracker.getStats();

      expect(stats.progress).toBe('70.0');
    });
  });

  describe('formatDuration()', () => {
    it('should format milliseconds', () => {
      expect(progressTracker.formatDuration(500)).toBe('500ms');
    });

    it('should format seconds', () => {
      expect(progressTracker.formatDuration(1500)).toBe('1.5s');
    });

    it('should format minutes', () => {
      expect(progressTracker.formatDuration(90000)).toBe('1m 30s');
    });
  });

  describe('reset()', () => {
    it('should reset all state', () => {
      progressTracker.start();
      progressTracker.updateProgress(2);
      progressTracker.addStep({ type: 'test' });

      progressTracker.reset();

      expect(progressTracker.currentPhase).toBeNull();
      expect(progressTracker.phases).toHaveLength(0);
      expect(progressTracker.steps).toHaveLength(0);
      expect(progressTracker.status).toBe('idle');
    });
  });

  describe('render()', () => {
    it('should render progress UI', () => {
      progressTracker.start({ maxIterations: 5 });

      expect(container.innerHTML).toContain('execution-progress');
      expect(container.innerHTML).toContain('progress-bar');
    });

    it('should show current phase', () => {
      progressTracker.start();
      progressTracker.transitionTo(ExecutionPhase.THINKING);

      expect(container.innerHTML).toContain('Thinking');
    });
  });
});

describe('RealTimeMonitor', () => {
  let realTimeMonitor;

  beforeEach(() => {
    realTimeMonitor = new RealTimeMonitor();
    realTimeMonitor.stop();
  });

  describe('start()', () => {
    it('should start monitoring', () => {
      realTimeMonitor.start();

      expect(realTimeMonitor.isMonitoring).toBe(true);
      expect(realTimeMonitor.monitorTimer).toBeDefined();

      realTimeMonitor.stop();
    });

    it('should not start twice', () => {
      realTimeMonitor.start();
      realTimeMonitor.start();

      expect(realTimeMonitor.isMonitoring).toBe(true);

      realTimeMonitor.stop();
    });
  });

  describe('stop()', () => {
    it('should stop monitoring', () => {
      realTimeMonitor.start();
      realTimeMonitor.stop();

      expect(realTimeMonitor.isMonitoring).toBe(false);
      expect(realTimeMonitor.monitorTimer).toBeNull();
    });
  });

  describe('registerExecution()', () => {
    it('should register execution', () => {
      realTimeMonitor.registerExecution('exec-1', { type: 'prompt' });

      expect(realTimeMonitor.activeExecutions.has('exec-1')).toBe(true);
    });

    it('should record metadata', () => {
      realTimeMonitor.registerExecution('exec-1', { taskId: 'task-1' });

      const execution = realTimeMonitor.activeExecutions.get('exec-1');
      expect(execution.taskId).toBe('task-1');
    });
  });

  describe('unregisterExecution()', () => {
    it('should unregister execution', () => {
      realTimeMonitor.registerExecution('exec-1');
      realTimeMonitor.unregisterExecution('exec-1');

      expect(realTimeMonitor.activeExecutions.has('exec-1')).toBe(false);
    });

    it('should record in history', () => {
      realTimeMonitor.registerExecution('exec-1');
      realTimeMonitor.unregisterExecution('exec-1');

      const history = realTimeMonitor.metricHistory.filter(m => m.type === 'execution');
      expect(history).toHaveLength(1);
    });
  });

  describe('alert()', () => {
    it('should create alert', () => {
      realTimeMonitor.alert('test_alert', { data: 'test' });

      expect(realTimeMonitor.alerts).toHaveLength(1);
      expect(realTimeMonitor.alerts[0].type).toBe('test_alert');
    });

    it('should call onAlert callback', () => {
      const onAlert = vi.fn();
      const alertMonitor = new RealTimeMonitor({ onAlert });

      alertMonitor.alert('test', { value: 1 });

      expect(onAlert).toHaveBeenCalled();
    });
  });

  describe('getStats()', () => {
    it('should return monitoring statistics', () => {
      realTimeMonitor.registerExecution('exec-1');

      const stats = realTimeMonitor.getStats();

      expect(stats.activeExecutions).toBe(1);
      expect(stats.isMonitoring).toBe(false);
    });
  });

  describe('setThreshold()', () => {
    it('should set threshold', () => {
      realTimeMonitor.setThreshold('duration', 30000);

      expect(realTimeMonitor.thresholds.duration).toBe(30000);
    });

    it('should not set invalid threshold', () => {
      realTimeMonitor.setThreshold('invalid', 100);

      expect(realTimeMonitor.thresholds.invalid).toBeUndefined();
    });
  });

  describe('clearHistory()', () => {
    it('should clear metric history', () => {
      realTimeMonitor.registerExecution('exec-1');
      realTimeMonitor.unregisterExecution('exec-1');
      realTimeMonitor.alert('test', {});

      realTimeMonitor.clearHistory();

      expect(realTimeMonitor.metricHistory).toHaveLength(0);
      expect(realTimeMonitor.alerts).toHaveLength(0);
    });
  });
});

describe('ExecutionPhase', () => {
  it('should have all phases', () => {
    expect(ExecutionPhase.INITIALIZING).toBeDefined();
    expect(ExecutionPhase.ANALYZING).toBeDefined();
    expect(ExecutionPhase.THINKING).toBeDefined();
    expect(ExecutionPhase.GENERATING).toBeDefined();
    expect(ExecutionPhase.EXECUTING).toBeDefined();
    expect(ExecutionPhase.OBSERVING).toBeDefined();
    expect(ExecutionPhase.COMPLETED).toBeDefined();
    expect(ExecutionPhase.FAILED).toBeDefined();
  });
});

describe('PhaseMetadata', () => {
  it('should have metadata for all phases', () => {
    Object.values(ExecutionPhase).forEach(phase => {
      expect(PhaseMetadata[phase]).toBeDefined();
      expect(PhaseMetadata[phase].label).toBeDefined();
      expect(PhaseMetadata[phase].icon).toBeDefined();
      expect(PhaseMetadata[phase].color).toBeDefined();
    });
  });
});
