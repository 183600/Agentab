/**
 * Notification System
 * Provides toast notifications, error displays, and user feedback
 */

import { ErrorHandler } from './errors.js';

/**
 * Escape HTML entities - prevents XSS attacks
 * @param {string} text - Text to escape
 * @returns {string}
 */
function escapeHtml(text) {
  if (text == null) return '';
  const entities = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return String(text).replace(/[&<>"']/g, char => entities[char]);
}

/**
 * Notification types
 */
export const NotificationType = {
  SUCCESS: 'success',
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info',
  LOADING: 'loading'
};

/**
 * Notification positions
 */
export const NotificationPosition = {
  TOP_RIGHT: 'top-right',
  TOP_LEFT: 'top-left',
  BOTTOM_RIGHT: 'bottom-right',
  BOTTOM_LEFT: 'bottom-left',
  TOP_CENTER: 'top-center',
  BOTTOM_CENTER: 'bottom-center'
};

/**
 * NotificationManager - Manages toast notifications
 */
export class NotificationManager {
  constructor(options = {}) {
    this.position = options.position || NotificationPosition.TOP_RIGHT;
    this.maxNotifications = options.maxNotifications || 5;
    this.defaultDuration = options.defaultDuration || 5000;
    this.container = null;
    this.notifications = new Map();
    this.counter = 0;
    
    this._ensureContainer();
  }

  /**
   * Ensure notification container exists
   */
  _ensureContainer() {
    if (!this.container) {
      this.container = document.getElementById('notification-container');
      
      if (!this.container) {
        this.container = document.createElement('div');
        this.container.id = 'notification-container';
        this.container.className = `notification-container ${this.position}`;
        document.body.appendChild(this.container);
      }
    }
  }

  /**
   * Show a notification
   * @param {Object} options - Notification options
   * @returns {string} Notification ID
   */
  show(options) {
    const id = `notification_${++this.counter}`;
    const {
      type = NotificationType.INFO,
      title,
      message,
      duration = this.defaultDuration,
      icon,
      actions = [],
      dismissible = true,
      progress,
      onDismiss
    } = options;

    const notification = document.createElement('div');
    notification.id = id;
    notification.className = `notification notification-${type}`;
    notification.setAttribute('role', 'alert');
    notification.setAttribute('aria-live', 'polite');

    const iconSvg = icon || this._getDefaultIcon(type);

    // Build notification content using DOM methods for safety
    const contentDiv = document.createElement('div');
    contentDiv.className = 'notification-content';

    if (iconSvg) {
      const iconDiv = document.createElement('div');
      iconDiv.className = 'notification-icon';
      // Icon SVGs are predefined and safe
      iconDiv.innerHTML = iconSvg;
      contentDiv.appendChild(iconDiv);
    }

    const bodyDiv = document.createElement('div');
    bodyDiv.className = 'notification-body';

    if (title) {
      const titleDiv = document.createElement('div');
      titleDiv.className = 'notification-title';
      titleDiv.textContent = title;
      bodyDiv.appendChild(titleDiv);
    }

    if (message) {
      const messageDiv = document.createElement('div');
      messageDiv.className = 'notification-message';
      messageDiv.textContent = message;
      bodyDiv.appendChild(messageDiv);
    }

    contentDiv.appendChild(bodyDiv);

    if (dismissible) {
      const dismissBtn = document.createElement('button');
      dismissBtn.className = 'notification-dismiss';
      dismissBtn.setAttribute('aria-label', 'Dismiss');
      dismissBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
      dismissBtn.addEventListener('click', () => this.dismiss(id));
      contentDiv.appendChild(dismissBtn);
    }

    notification.appendChild(contentDiv);

    if (actions.length > 0) {
      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'notification-actions';

      actions.forEach((action, i) => {
        const actionBtn = document.createElement('button');
        actionBtn.className = `notification-action notification-action-${action.style || 'default'}`;
        actionBtn.textContent = action.label;
        actionBtn.addEventListener('click', () => {
          action.onClick?.();
          if (action.dismissOnClick !== false) {
            this.dismiss(id);
          }
        });
        actionsDiv.appendChild(actionBtn);
      });

      notification.appendChild(actionsDiv);
    }

    if (progress !== undefined) {
      const progressContainer = document.createElement('div');
      progressContainer.className = 'notification-progress';
      const progressBar = document.createElement('div');
      progressBar.className = 'notification-progress-bar';
      progressBar.style.width = `${progress}%`;
      progressContainer.appendChild(progressBar);
      notification.appendChild(progressContainer);
    }

    // Add to container
    this.container.appendChild(notification);
    this.notifications.set(id, { element: notification, onDismiss, timer: null });

    // Trigger animation
    requestAnimationFrame(() => {
      notification.classList.add('notification-show');
    });

    // Auto-dismiss
    if (duration > 0 && type !== NotificationType.LOADING) {
      const timer = setTimeout(() => this.dismiss(id), duration);
      this.notifications.get(id).timer = timer;
    }

    // Limit notifications
    this._enforceLimit();

    return id;
  }

  /**
   * Dismiss a notification
   * @param {string} id - Notification ID
   */
  dismiss(id) {
    const notification = this.notifications.get(id);
    if (!notification) return;

    clearTimeout(notification.timer);
    
    notification.element.classList.remove('notification-show');
    notification.element.classList.add('notification-hide');
    
    setTimeout(() => {
      notification.element.remove();
      notification.onDismiss?.();
      this.notifications.delete(id);
    }, 300);
  }

  /**
   * Update notification progress
   * @param {string} id - Notification ID
   * @param {number} progress - Progress percentage (0-100)
   */
  updateProgress(id, progress) {
    const notification = this.notifications.get(id);
    if (!notification) return;

    let progressBar = notification.element.querySelector('.notification-progress-bar');
    
    if (!progressBar && progress !== undefined) {
      const progressContainer = document.createElement('div');
      progressContainer.className = 'notification-progress';
      progressBar = document.createElement('div');
      progressBar.className = 'notification-progress-bar';
      progressContainer.appendChild(progressBar);
      notification.element.appendChild(progressContainer);
    }
    
    if (progressBar) {
      progressBar.style.width = `${progress}%`;
    }
  }

  /**
   * Update notification message
   * @param {string} id - Notification ID
   * @param {string} message - New message
   */
  updateMessage(id, message) {
    const notification = this.notifications.get(id);
    if (!notification) return;

    const messageEl = notification.element.querySelector('.notification-message');
    if (messageEl) {
      messageEl.textContent = message;
    }
  }

  /**
   * Dismiss all notifications
   */
  dismissAll() {
    for (const id of this.notifications.keys()) {
      this.dismiss(id);
    }
  }

  /**
   * Enforce notification limit
   */
  _enforceLimit() {
    while (this.notifications.size > this.maxNotifications) {
      const oldestId = this.notifications.keys().next().value;
      this.dismiss(oldestId);
    }
  }

  /**
   * Get default icon for notification type
   */
  _getDefaultIcon(type) {
    const icons = {
      [NotificationType.SUCCESS]: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
      [NotificationType.ERROR]: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
      [NotificationType.WARNING]: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
      [NotificationType.INFO]: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
      [NotificationType.LOADING]: `<svg class="spinning" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg>`
    };
    return icons[type] || '';
  }

  // Convenience methods
  success(message, options = {}) {
    return this.show({ type: NotificationType.SUCCESS, message, ...options });
  }

  error(message, options = {}) {
    return this.show({ type: NotificationType.ERROR, message, ...options });
  }

  warning(message, options = {}) {
    return this.show({ type: NotificationType.WARNING, message, ...options });
  }

  info(message, options = {}) {
    return this.show({ type: NotificationType.INFO, message, ...options });
  }

  loading(message, options = {}) {
    return this.show({ type: NotificationType.LOADING, message, duration: 0, dismissible: false, ...options });
  }

  /**
   * Show error with display info
   * @param {Error} error - Error object
   * @param {Object} options - Additional options
   */
  showError(error, options = {}) {
    const displayInfo = ErrorHandler.getDisplayInfo(error);
    
    return this.show({
      type: NotificationType.ERROR,
      title: `${displayInfo.icon} Error`,
      message: displayInfo.message,
      duration: 8000,
      actions: displayInfo.suggestion ? [
        { label: 'Learn More', onClick: () => this._showSuggestion(displayInfo.suggestion) }
      ] : (displayInfo.canRetry ? [
        { label: 'Retry', style: 'primary', onClick: options.onRetry }
      ] : []),
      ...options
    });
  }

  /**
   * Show suggestion in a modal
   */
  _showSuggestion(suggestion) {
    this.show({
      type: NotificationType.INFO,
      title: 'Suggestion',
      message: suggestion,
      duration: 10000
    });
  }
}

/**
 * ErrorDisplay - Displays detailed error information
 */
export class ErrorDisplay {
  constructor(container) {
    this.container = container;
  }

  /**
   * Show error display
   * @param {Error} error - Error to display
   * @param {Object} options - Display options
   */
  show(error, options = {}) {
    const displayInfo = ErrorHandler.getDisplayInfo(error);
    const normalized = ErrorHandler.normalize(error);

    this.container.innerHTML = `
      <div class="error-display">
        <div class="error-header">
          <span class="error-icon">${displayInfo.icon}</span>
          <span class="error-title">Error</span>
          <button class="error-close" aria-label="Close error">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="error-body">
          <p class="error-message">${displayInfo.message}</p>
          ${displayInfo.suggestion ? `
            <div class="error-suggestion">
              <strong>Suggestion:</strong> ${displayInfo.suggestion}
            </div>
          ` : ''}
          ${options.showDetails ? this._renderDetails(normalized) : ''}
        </div>
        <div class="error-actions">
          ${displayInfo.canRetry ? `
            <button class="btn btn-primary error-retry">Retry</button>
          ` : ''}
          <button class="btn btn-secondary error-dismiss">Dismiss</button>
          ${options.showDetails ? '' : `
            <button class="btn btn-text error-details">Show Details</button>
          `}
        </div>
      </div>
    `;

    this.container.classList.remove('hidden');

    // Event listeners
    this.container.querySelector('.error-close')?.addEventListener('click', () => this.hide());
    this.container.querySelector('.error-dismiss')?.addEventListener('click', () => this.hide());
    this.container.querySelector('.error-retry')?.addEventListener('click', () => options.onRetry?.());
    this.container.querySelector('.error-details')?.addEventListener('click', () => {
      this.show(error, { ...options, showDetails: true });
    });
  }

  /**
   * Render error details
   */
  _renderDetails(error) {
    return `
      <details class="error-details-section">
        <summary>Technical Details</summary>
        <div class="error-details-content">
          <p><strong>Code:</strong> ${error.code}</p>
          <p><strong>Time:</strong> ${error.timestamp}</p>
          ${error.details ? `<pre>${JSON.stringify(error.details, null, 2)}</pre>` : ''}
          ${error.stack ? `<pre class="error-stack">${error.stack}</pre>` : ''}
        </div>
      </details>
    `;
  }

  /**
   * Hide error display
   */
  hide() {
    this.container.classList.add('hidden');
    this.container.innerHTML = '';
  }
}

/**
 * ProgressIndicator - Shows progress for long operations
 */
export class ProgressIndicator {
  constructor(container) {
    this.container = container;
    this.currentStep = 0;
    this.totalSteps = 0;
  }

  /**
   * Start progress indicator
   * @param {Object} options - Options
   */
  start(options = {}) {
    const { title = 'Processing...', steps = [], totalSteps = 0 } = options;
    this.totalSteps = totalSteps;
    this.currentStep = 0;

    this.container.innerHTML = `
      <div class="progress-indicator">
        <div class="progress-header">
          <span class="progress-title">${title}</span>
          <span class="progress-percent">0%</span>
        </div>
        <div class="progress-bar-container">
          <div class="progress-bar" style="width: 0%"></div>
        </div>
        <div class="progress-steps">
          ${steps.map((step, i) => `
            <div class="progress-step" data-step="${i}">
              <span class="step-indicator pending">${i + 1}</span>
              <span class="step-label">${step}</span>
            </div>
          `).join('')}
        </div>
        <div class="progress-message"></div>
      </div>
    `;

    this.container.classList.remove('hidden');
  }

  /**
   * Update progress
   * @param {number} step - Current step
   * @param {string} message - Status message
   */
  update(step, message = '') {
    this.currentStep = step;
    const percent = this.totalSteps > 0 ? Math.round((step / this.totalSteps) * 100) : 0;

    const progressBar = this.container.querySelector('.progress-bar');
    const percentText = this.container.querySelector('.progress-percent');
    const messageEl = this.container.querySelector('.progress-message');

    if (progressBar) progressBar.style.width = `${percent}%`;
    if (percentText) percentText.textContent = `${percent}%`;
    if (messageEl) messageEl.textContent = message;

    // Update step indicators
    const steps = this.container.querySelectorAll('.progress-step');
    steps.forEach((stepEl, i) => {
      const indicator = stepEl.querySelector('.step-indicator');
      if (i < step) {
        indicator.className = 'step-indicator completed';
        indicator.innerHTML = '✓';
      } else if (i === step) {
        indicator.className = 'step-indicator active';
      } else {
        indicator.className = 'step-indicator pending';
      }
    });
  }

  /**
   * Complete progress
   * @param {string} message - Completion message
   */
  complete(message = 'Completed') {
    const progressBar = this.container.querySelector('.progress-bar');
    const percentText = this.container.querySelector('.progress-percent');
    const messageEl = this.container.querySelector('.progress-message');

    if (progressBar) progressBar.style.width = '100%';
    if (percentText) percentText.textContent = '100%';
    if (messageEl) messageEl.textContent = message;

    // Mark all steps as completed
    const steps = this.container.querySelectorAll('.progress-step');
    steps.forEach(stepEl => {
      const indicator = stepEl.querySelector('.step-indicator');
      indicator.className = 'step-indicator completed';
      indicator.innerHTML = '✓';
    });

    setTimeout(() => this.hide(), 2000);
  }

  /**
   * Show error in progress
   * @param {string} message - Error message
   */
  error(message) {
    const messageEl = this.container.querySelector('.progress-message');
    if (messageEl) {
      messageEl.textContent = message;
      messageEl.classList.add('error');
    }

    // Mark current step as failed
    const currentStepEl = this.container.querySelector(`[data-step="${this.currentStep}"]`);
    if (currentStepEl) {
      const indicator = currentStepEl.querySelector('.step-indicator');
      indicator.className = 'step-indicator failed';
      indicator.innerHTML = '✗';
    }
  }

  /**
   * Hide progress indicator
   */
  hide() {
    this.container.classList.add('hidden');
    this.container.innerHTML = '';
  }
}

// Global notification manager instance
let notificationManager = null;

/**
 * Get global notification manager
 */
export function getNotificationManager() {
  if (!notificationManager) {
    notificationManager = new NotificationManager();
  }
  return notificationManager;
}

/**
 * Quick notification functions
 */
export const notify = {
  success: (message, options) => getNotificationManager().success(message, options),
  error: (message, options) => getNotificationManager().error(message, options),
  warning: (message, options) => getNotificationManager().warning(message, options),
  info: (message, options) => getNotificationManager().info(message, options),
  loading: (message, options) => getNotificationManager().loading(message, options),
  show: (options) => getNotificationManager().show(options),
  dismiss: (id) => getNotificationManager().dismiss(id),
  dismissAll: () => getNotificationManager().dismissAll()
};

// Add notification styles
const notificationStyles = `
.notification-container {
  position: fixed;
  z-index: 10000;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 400px;
}

.notification-container.top-right { top: 16px; right: 16px; }
.notification-container.top-left { top: 16px; left: 16px; }
.notification-container.bottom-right { bottom: 16px; right: 16px; }
.notification-container.bottom-left { bottom: 16px; left: 16px; }
.notification-container.top-center { top: 16px; left: 50%; transform: translateX(-50%); }
.notification-container.bottom-center { bottom: 16px; left: 50%; transform: translateX(-50%); }

.notification {
  pointer-events: auto;
  background: var(--bg-secondary, #fff);
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  overflow: hidden;
  opacity: 0;
  transform: translateY(-8px);
  transition: opacity 0.3s, transform 0.3s;
}

.notification-show {
  opacity: 1;
  transform: translateY(0);
}

.notification-hide {
  opacity: 0;
  transform: translateY(-8px);
}

.notification-content {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 16px;
}

.notification-icon {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
}

.notification-body {
  flex: 1;
  min-width: 0;
}

.notification-title {
  font-weight: 600;
  margin-bottom: 4px;
}

.notification-message {
  font-size: 14px;
  color: var(--text-secondary, #666);
}

.notification-dismiss {
  flex-shrink: 0;
  background: none;
  border: none;
  cursor: pointer;
  opacity: 0.5;
  transition: opacity 0.2s;
  padding: 4px;
}

.notification-dismiss:hover { opacity: 1; }

.notification-actions {
  display: flex;
  gap: 8px;
  padding: 8px 16px 12px;
  border-top: 1px solid var(--border-color, #e0e0e0);
}

.notification-action {
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
  border: none;
  transition: background 0.2s;
}

.notification-action-default {
  background: var(--bg-tertiary, #f5f5f5);
}

.notification-action-primary {
  background: var(--primary-color, #4a90d9);
  color: white;
}

.notification-progress {
  height: 3px;
  background: var(--bg-tertiary, #f0f0f0);
}

.notification-progress-bar {
  height: 100%;
  background: var(--primary-color, #4a90d9);
  transition: width 0.3s;
}

.notification-success { border-left: 4px solid #4caf50; }
.notification-error { border-left: 4px solid #f44336; }
.notification-warning { border-left: 4px solid #ff9800; }
.notification-info { border-left: 4px solid #2196f3; }
.notification-loading { border-left: 4px solid #9e9e9e; }

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
`;

// Inject styles
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style');
  styleSheet.textContent = notificationStyles;
  document.head?.appendChild(styleSheet);
}
