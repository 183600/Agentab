/**
 * Tests for Loading State Module
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  SkeletonLoader,
  LoadingSpinner,
  ProgressBar,
  StepProgress,
  LoadingOverlay,
  ToastNotification,
  getToast
} from '../lib/loading-state.js';

describe('SkeletonLoader', () => {
  let container;
  let loader;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    loader = new SkeletonLoader(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('should show skeleton', () => {
    loader.show();
    expect(container.querySelector('.skeleton-container')).toBeTruthy();
    expect(container.getAttribute('aria-busy')).toBe('true');
  });

  it('should show specified number of rows', () => {
    loader = new SkeletonLoader(container, { rows: 5 });
    loader.show();
    const rows = container.querySelectorAll('.skeleton-row');
    expect(rows.length).toBe(5);
  });

  it('should hide skeleton and restore content', () => {
    container.innerHTML = '<p>Original</p>';
    loader.show();
    loader.hide();
    expect(container.innerHTML).toContain('Original');
  });

  it('should hide skeleton with new content', () => {
    loader.show();
    loader.hide('<p>New</p>');
    expect(container.innerHTML).toContain('New');
  });

  it('should check if showing', () => {
    expect(loader.isShowing()).toBe(false);
    loader.show();
    expect(loader.isShowing()).toBe(true);
  });
});

describe('LoadingSpinner', () => {
  let container;
  let spinner;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    spinner = new LoadingSpinner(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('should show spinner', () => {
    spinner.show();
    expect(container.querySelector('.loading-spinner')).toBeTruthy();
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('should show label', () => {
    spinner = new LoadingSpinner(container, { label: 'Loading data...' });
    spinner.show();
    expect(container.textContent).toContain('Loading data...');
  });

  it('should hide spinner', () => {
    spinner.show();
    spinner.hide();
    expect(container.innerHTML).toBe('');
  });
});

describe('ProgressBar', () => {
  let container;
  let progress;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    progress = new ProgressBar(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('should set progress value', () => {
    progress.setValue(50);
    const fill = container.querySelector('.progress-fill');
    expect(fill.style.width).toBe('50%');
  });

  it('should clamp value to 0-100', () => {
    progress.setValue(-10);
    expect(progress.value).toBe(0);

    progress.setValue(150);
    expect(progress.value).toBe(100);
  });

  it('should increment progress', () => {
    progress.setValue(20);
    progress.increment(30);
    expect(progress.value).toBe(50);
  });

  it('should reset to 0', () => {
    progress.setValue(50);
    progress.reset();
    expect(progress.value).toBe(0);
  });

  it('should complete and hide', async () => {
    progress.setValue(0);
    progress.show();
    progress.complete();

    await new Promise(resolve => setTimeout(resolve, 400));
    expect(container.innerHTML).toBe('');
  });

  it('should show percentage', () => {
    progress = new ProgressBar(container, { showPercent: true });
    progress.setValue(75);
    expect(container.textContent).toContain('75%');
  });
});

describe('StepProgress', () => {
  let container;
  let steps;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    steps = new StepProgress(container, {
      steps: [
        { label: 'Step 1' },
        { label: 'Step 2' },
        { label: 'Step 3' }
      ]
    });
  });

  afterEach(() => {
    container.remove();
  });

  it('should render steps', () => {
    steps.render();
    const stepElements = container.querySelectorAll('.step');
    expect(stepElements.length).toBe(3);
  });

  it('should mark current step as active', () => {
    steps.goToStep(1);
    const activeStep = container.querySelector('.step.active');
    expect(activeStep).toBeTruthy();
  });

  it('should mark previous steps as complete', () => {
    steps.goToStep(2);
    const completeSteps = container.querySelectorAll('.step.complete');
    expect(completeSteps.length).toBe(2);
  });

  it('should navigate to next step', () => {
    steps.next();
    expect(steps.currentStep).toBe(1);
  });

  it('should navigate to previous step', () => {
    steps.goToStep(2);
    steps.prev();
    expect(steps.currentStep).toBe(1);
  });

  it('should call onStepChange callback', () => {
    const onStepChange = vi.fn();
    steps = new StepProgress(container, { onStepChange });
    steps.setSteps([{ label: 'A' }, { label: 'B' }]);
    steps.goToStep(1);
    expect(onStepChange).toHaveBeenCalledWith(1);
  });
});

describe('LoadingOverlay', () => {
  let overlay;

  afterEach(async () => {
    if (overlay) {
      overlay.overlay?.remove();
      document.body.style.overflow = '';
      overlay = null;
    }
  });

  it('should show overlay', () => {
    overlay = new LoadingOverlay();
    overlay.show();
    expect(document.querySelector('.loading-overlay')).toBeTruthy();
  });

  it('should show message', () => {
    overlay = new LoadingOverlay();
    overlay.currentMessage = 'Please wait...';
    overlay.show();
    const messageEl = document.querySelector('.loading-overlay-message');
    expect(messageEl.textContent).toBe('Please wait...');
  });

  it('should update message', () => {
    overlay = new LoadingOverlay();
    overlay.show();
    overlay.setMessage('Processing...');
    const messageEl = document.querySelector('.loading-overlay-message');
    expect(messageEl.textContent).toBe('Processing...');
  });

  it('should update progress', () => {
    overlay = new LoadingOverlay({ showProgress: true });
    overlay.show();
    overlay.setProgress(50);
    const fill = document.querySelector('.loading-overlay-progress .progress-fill');
    expect(fill.style.width).toBe('50%');
  });

  it('should hide overlay', async () => {
    overlay = new LoadingOverlay();
    overlay.show();
    overlay.hide();

    await new Promise(resolve => setTimeout(resolve, 300));
    expect(document.querySelector('.loading-overlay')).toBeFalsy();
  });

  it('should prevent body scroll when shown', () => {
    overlay = new LoadingOverlay();
    overlay.show();
    expect(document.body.style.overflow).toBe('hidden');
    overlay.hide();
  });
});

describe('ToastNotification', () => {
  let toast;
  let toastId;

  beforeEach(() => {
    toast = new ToastNotification();
    // Clear container
    const container = document.getElementById('toast-container');
    if (container) container.innerHTML = '';
  });

  afterEach(() => {
    toast.dismissAll();
  });

  it('should show toast', () => {
    toastId = toast.show('Test message');
    expect(document.querySelector('.toast')).toBeTruthy();
    expect(document.querySelector('.toast-message').textContent).toBe('Test message');
  });

  it('should show different types', () => {
    toast.success('Success');
    expect(document.querySelector('.toast-success')).toBeTruthy();

    toast.dismissAll();
    toast.error('Error');
    expect(document.querySelector('.toast-error')).toBeTruthy();
  });

  it('should dismiss toast', async () => {
    toastId = toast.show('Test', { duration: 0 });
    toast.dismiss(toastId);

    await new Promise(resolve => setTimeout(resolve, 300));
    expect(document.querySelector('.toast')).toBeFalsy();
  });

  it('should auto-dismiss after duration', async () => {
    toast.show('Test', { duration: 100 });

    await new Promise(resolve => setTimeout(resolve, 400));
    expect(document.querySelector('.toast')).toBeFalsy();
  });

  it('should dismiss all toasts', () => {
    toast.show('A', { duration: 0 });
    toast.show('B', { duration: 0 });
    toast.show('C', { duration: 0 });
    
    toast.dismissAll();
    expect(document.querySelectorAll('.toast').length).toBe(0);
  });

  it('should show action button', () => {
    const handler = vi.fn();
    toast.show('Test', {
      duration: 0,
      action: { label: 'Undo', handler }
    });
    
    const actionBtn = document.querySelector('.toast-action');
    expect(actionBtn).toBeTruthy();
    expect(actionBtn.textContent).toBe('Undo');
  });

  it('should call action handler', () => {
    const handler = vi.fn();
    toast.show('Test', {
      duration: 0,
      action: { label: 'Click', handler }
    });
    
    document.querySelector('.toast-action').click();
    expect(handler).toHaveBeenCalled();
  });
});

describe('getToast()', () => {
  it('should return singleton instance', () => {
    const toast1 = getToast();
    const toast2 = getToast();
    expect(toast1).toBe(toast2);
  });
});
