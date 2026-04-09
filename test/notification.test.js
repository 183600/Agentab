/**
 * Tests for Notification System
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  NotificationManager,
  NotificationType,
  ErrorDisplay,
  ProgressIndicator,
  getNotificationManager,
  notify
} from '../lib/notification.js';
import { ErrorHandler, ValidationError, ApiError, TimeoutError } from '../lib/errors.js';

// Mock DOM
describe('NotificationManager', () => {
  let manager;
  let container;

  beforeEach(() => {
    // Clean up any existing container
    document.body.innerHTML = '';
    manager = new NotificationManager({ maxNotifications: 3 });
  });

  afterEach(() => {
    manager.dismissAll();
  });

  it('should create notification container', () => {
    container = document.getElementById('notification-container');
    expect(container).toBeDefined();
  });

  it('should show notification', () => {
    const id = manager.show({
      type: NotificationType.INFO,
      message: 'Test message'
    });
    
    expect(id).toBeDefined();
    expect(manager.notifications.has(id)).toBe(true);
  });

  it('should dismiss notification', () => {
    const id = manager.show({
      type: NotificationType.INFO,
      message: 'Test message',
      duration: 0
    });
    
    manager.dismiss(id);
    
    // Wait for animation
    setTimeout(() => {
      expect(manager.notifications.has(id)).toBe(false);
    }, 400);
  });

  it('should enforce max notifications limit', () => {
    manager.show({ type: NotificationType.INFO, message: '1' });
    manager.show({ type: NotificationType.INFO, message: '2' });
    manager.show({ type: NotificationType.INFO, message: '3' });
    manager.show({ type: NotificationType.INFO, message: '4' });
    
    expect(manager.notifications.size).toBe(3);
  });

  it('should create success notification', () => {
    const id = manager.success('Success message');
    const notification = manager.notifications.get(id);
    
    expect(notification.element.classList.contains('notification-success')).toBe(true);
  });

  it('should create error notification', () => {
    const id = manager.error('Error message');
    const notification = manager.notifications.get(id);
    
    expect(notification.element.classList.contains('notification-error')).toBe(true);
  });

  it('should create loading notification without auto-dismiss', () => {
    const id = manager.loading('Loading...');
    const notification = manager.notifications.get(id);
    
    expect(notification.timer).toBeNull();
  });

  it('should update progress', () => {
    const id = manager.loading('Processing...');
    manager.updateProgress(id, 50);
    
    const progressBar = manager.notifications.get(id).element.querySelector('.notification-progress-bar');
    expect(progressBar.style.width).toBe('50%');
  });

  it('should update message', () => {
    const id = manager.show({ type: NotificationType.INFO, message: 'Old message', duration: 0 });
    manager.updateMessage(id, 'New message');
    
    const messageEl = manager.notifications.get(id).element.querySelector('.notification-message');
    expect(messageEl.textContent).toBe('New message');
  });
});

describe('ErrorDisplay', () => {
  let container;
  let display;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    display = new ErrorDisplay(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('should show error display', () => {
    const error = new ValidationError('Invalid input', 'username', 'test');
    display.show(error);
    
    expect(container.classList.contains('hidden')).toBe(false);
    expect(container.textContent).toContain('Validation failed');
  });

  it('should show suggestion when available', () => {
    const error = new TimeoutError('Operation timed out', 30000);
    display.show(error);
    
    expect(container.textContent).toContain('Try again');
  });

  it('should show technical details', () => {
    const error = new ApiError('API failed', 500, { error: 'Server error' });
    display.show(error, { showDetails: true });
    
    expect(container.innerHTML).toContain('Technical Details');
  });

  it('should hide on dismiss', () => {
    const error = new ValidationError('Invalid');
    display.show(error);
    
    container.querySelector('.error-dismiss').click();
    
    expect(container.classList.contains('hidden')).toBe(true);
  });
});

describe('ProgressIndicator', () => {
  let container;
  let progress;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    progress = new ProgressIndicator(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('should start progress indicator', () => {
    progress.start({
      title: 'Processing',
      steps: ['Step 1', 'Step 2', 'Step 3'],
      totalSteps: 3
    });
    
    expect(container.classList.contains('hidden')).toBe(false);
    expect(container.textContent).toContain('Processing');
  });

  it('should update progress', () => {
    progress.start({ totalSteps: 4 });
    progress.update(2, 'Processing step 2');
    
    const progressBar = container.querySelector('.progress-bar');
    expect(progressBar.style.width).toBe('50%');
    
    const percentText = container.querySelector('.progress-percent');
    expect(percentText.textContent).toBe('50%');
  });

  it('should complete progress', () => {
    progress.start({ totalSteps: 3 });
    progress.complete('Done!');
    
    const progressBar = container.querySelector('.progress-bar');
    expect(progressBar.style.width).toBe('100%');
  });

  it('should show error in progress', () => {
    progress.start({ totalSteps: 3 });
    progress.update(1);
    progress.error('Failed at step 1');
    
    const messageEl = container.querySelector('.progress-message');
    expect(messageEl.classList.contains('error')).toBe(true);
  });
});

describe('notify convenience functions', () => {
  it('should get global notification manager', () => {
    const manager = getNotificationManager();
    expect(manager).toBeInstanceOf(NotificationManager);
  });

  it('should create notification via notify object', () => {
    const id = notify.success('Test success');
    expect(id).toBeDefined();
    
    notify.dismiss(id);
  });

  it('should dismiss all notifications', () => {
    notify.info('1');
    notify.info('2');
    notify.info('3');
    
    notify.dismissAll();
    
    const manager = getNotificationManager();
    expect(manager.notifications.size).toBe(0);
  });
});

describe('showError integration', () => {
  let manager;

  beforeEach(() => {
    document.body.innerHTML = '';
    manager = new NotificationManager();
  });

  it('should show error with display info', () => {
    const error = new ValidationError('Invalid email', 'email', 'not-an-email');
    const id = manager.showError(error);
    
    const notification = manager.notifications.get(id);
    expect(notification.element.textContent).toContain('Validation failed');
  });

  it('should show retry action for recoverable errors', () => {
    const error = new TimeoutError('Request timed out');
    const onRetry = vi.fn();
    const id = manager.showError(error, { onRetry });
    
    const notification = manager.notifications.get(id);
    const retryButton = notification.element.querySelector('.notification-action-primary');
    
    expect(retryButton).toBeDefined();
    expect(retryButton.textContent).toBe('Retry');
  });
});
