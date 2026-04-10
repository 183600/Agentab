/**
 * Loading State Module
 * Provides loading indicators, skeleton screens, and progress feedback
 */

import { escapeHtml } from './utils.js';

/**
 * SkeletonLoader - Shows placeholder content while loading
 */
export class SkeletonLoader {
  /**
   * @param {HTMLElement} container
   * @param {Object} options
   */
  constructor(container, options = {}) {
    this.container = container;
    this.options = {
      rows: 3,
      lineHeight: 20,
      gap: 12,
      width: '100%',
      borderRadius: 4,
      animate: true,
      ...options
    };
    this.originalContent = null;
  }

  /**
   * Show skeleton loader
   */
  show() {
    // Store original content
    this.originalContent = this.container.innerHTML;

    // Create skeleton
    const skeleton = document.createElement('div');
    skeleton.className = 'skeleton-container';
    skeleton.setAttribute('aria-busy', 'true');
    skeleton.setAttribute('aria-label', 'Loading content');

    for (let i = 0; i < this.options.rows; i++) {
      const row = document.createElement('div');
      row.className = 'skeleton-row';
      
      // Vary width for last row
      const width = i === this.options.rows - 1 ? '60%' : this.options.width;
      
      row.innerHTML = `<div class="skeleton-line" style="width: ${width}; height: ${this.options.lineHeight}px; border-radius: ${this.options.borderRadius}px;"></div>`;
      
      skeleton.appendChild(row);
    }

    this.container.innerHTML = '';
    this.container.appendChild(skeleton);
    // Set aria-busy on container too
    this.container.setAttribute('aria-busy', 'true');
  }

  /**
   * Hide skeleton and restore content
   * @param {string} [content] - Optional new content
   */
  hide(content = null) {
    this.container.innerHTML = content !== null ? content : (this.originalContent || '');
    this.originalContent = null;
  }

  /**
   * Check if showing
   * @returns {boolean}
   */
  isShowing() {
    return this.container.querySelector('.skeleton-container') !== null;
  }
}

/**
 * LoadingSpinner - Animated loading indicator
 */
export class LoadingSpinner {
  /**
   * @param {HTMLElement} container
   * @param {Object} options
   */
  constructor(container, options = {}) {
    this.container = container;
    this.options = {
      size: 24,
      color: 'currentColor',
      thickness: 2,
      label: 'Loading...',
      ...options
    };
  }

  /**
   * Show spinner
   */
  show() {
    const { size, color, thickness, label } = this.options;
    
    this.container.innerHTML = `
      <div class="loading-spinner" role="status" aria-label="${escapeHtml(label)}">
        <svg 
          class="spinner-svg" 
          width="${size}" 
          height="${size}" 
          viewBox="0 0 24 24"
          fill="none"
          stroke="${color}"
          stroke-width="${thickness}"
          stroke-linecap="round"
        >
          <circle cx="12" cy="12" r="10" stroke-opacity="0.25"/>
          <path d="M12 2a10 10 0 0 1 10 10" class="spinner-arc"/>
        </svg>
        ${label ? `<span class="spinner-label">${escapeHtml(label)}</span>` : ''}
      </div>
    `;
  }

  /**
   * Hide spinner
   */
  hide() {
    this.container.innerHTML = '';
  }
}

/**
 * ProgressBar - Visual progress indicator
 */
export class ProgressBar {
  /**
   * @param {HTMLElement} container
   * @param {Object} options
   */
  constructor(container, options = {}) {
    this.container = container;
    this.options = {
      height: 4,
      color: '#3b82f6',
      bgColor: '#e5e7eb',
      showPercent: false,
      animate: true,
      ...options
    };
    this.value = 0;
  }

  /**
   * Set progress value
   * @param {number} value - Progress value (0-100)
   */
  setValue(value) {
    this.value = Math.min(100, Math.max(0, value));
    this.render();
  }

  /**
   * Increment progress
   * @param {number} amount
   */
  increment(amount = 10) {
    this.setValue(this.value + amount);
  }

  /**
   * Reset to 0
   */
  reset() {
    this.setValue(0);
  }

  /**
   * Complete and hide
   */
  complete() {
    this.setValue(100);
    setTimeout(() => this.hide(), 300);
  }

  /**
   * Show progress bar
   */
  show() {
    this.render();
  }

  /**
   * Hide progress bar
   */
  hide() {
    this.container.innerHTML = '';
  }

  /**
   * Render progress bar
   */
  render() {
    const { height, color, bgColor, showPercent, animate } = this.options;
    
    this.container.innerHTML = `
      <div class="progress-bar" role="progressbar" aria-valuenow="${this.value}" aria-valuemin="0" aria-valuemax="100">
        <div class="progress-track" style="height: ${height}px; background: ${bgColor}; border-radius: ${height / 2}px;">
          <div 
            class="progress-fill ${animate ? 'animate' : ''}" 
            style="width: ${this.value}%; background: ${color}; border-radius: ${height / 2}px;"
          ></div>
        </div>
        ${showPercent ? `<span class="progress-percent">${Math.round(this.value)}%</span>` : ''}
      </div>
    `;
  }
}

/**
 * StepProgress - Multi-step progress indicator
 */
export class StepProgress {
  /**
   * @param {HTMLElement} container
   * @param {Object} options
   */
  constructor(container, options = {}) {
    this.container = container;
    this.options = {
      steps: [],
      currentStep: 0,
      allowSkip: false,
      ...options
    };
    this.currentStep = this.options.currentStep;
  }

  /**
   * Set steps
   * @param {Array<{label: string, icon?: string}>} steps
   */
  setSteps(steps) {
    this.options.steps = steps;
    this.render();
  }

  /**
   * Go to step
   * @param {number} step
   */
  goToStep(step) {
    if (step >= 0 && step < this.options.steps.length) {
      this.currentStep = step;
      this.render();
      this.options.onStepChange?.(step);
    }
  }

  /**
   * Next step
   */
  next() {
    this.goToStep(this.currentStep + 1);
  }

  /**
   * Previous step
   */
  prev() {
    this.goToStep(this.currentStep - 1);
  }

  /**
   * Render steps
   */
  render() {
    const { steps } = this.options;
    
    const html = `
      <div class="step-progress">
        ${steps.map((step, i) => {
          const isActive = i === this.currentStep;
          const isComplete = i < this.currentStep;
          const isPending = i > this.currentStep;
          
          return `
            <div class="step ${isActive ? 'active' : ''} ${isComplete ? 'complete' : ''} ${isPending ? 'pending' : ''}">
              <div class="step-indicator">
                ${isComplete ? '✓' : (step.icon || (i + 1))}
              </div>
              <div class="step-label">${escapeHtml(step.label)}</div>
              ${i < steps.length - 1 ? '<div class="step-connector"></div>' : ''}
            </div>
          `;
        }).join('')}
      </div>
    `;

    this.container.innerHTML = html;
  }
}

/**
 * LoadingOverlay - Full-screen loading overlay
 */
export class LoadingOverlay {
  /**
   * @param {Object} options
   */
  constructor(options = {}) {
    this.options = {
      message: 'Loading...',
      showSpinner: true,
      showProgress: false,
      blur: true,
      ...options
    };
    this.overlay = null;
    this.currentMessage = this.options.message;
  }

  /**
   * Show overlay
   */
  show() {
    if (this.overlay) return;

    this.overlay = document.createElement('div');
    this.overlay.className = 'loading-overlay';
    this.overlay.setAttribute('role', 'dialog');
    this.overlay.setAttribute('aria-modal', 'true');
    this.overlay.setAttribute('aria-label', this.currentMessage);

    const { showSpinner, showProgress, blur } = this.options;

    this.overlay.innerHTML = `
      <div class="loading-overlay-backdrop ${blur ? 'blur' : ''}"></div>
      <div class="loading-overlay-content">
        ${showSpinner ? '<div class="loading-overlay-spinner"></div>' : ''}
        <div class="loading-overlay-message">${escapeHtml(this.currentMessage)}</div>
        ${showProgress ? '<div class="loading-overlay-progress"></div>' : ''}
      </div>
    `;

    document.body.appendChild(this.overlay);
    document.body.style.overflow = 'hidden';
  }

  /**
   * Update message
   * @param {string} message
   */
  setMessage(message) {
    this.currentMessage = message;
    if (this.overlay) {
      const msgEl = this.overlay.querySelector('.loading-overlay-message');
      if (msgEl) msgEl.textContent = message;
    }
  }

  /**
   * Update progress
   * @param {number} value
   */
  setProgress(value) {
    if (this.overlay) {
      const progressEl = this.overlay.querySelector('.loading-overlay-progress');
      if (progressEl) {
        progressEl.innerHTML = `<div class="progress-fill" style="width: ${value}%"></div>`;
      }
    }
  }

  /**
   * Hide overlay
   */
  hide() {
    if (this.overlay) {
      this.overlay.classList.add('fade-out');
      setTimeout(() => {
        this.overlay?.remove();
        this.overlay = null;
        document.body.style.overflow = '';
      }, 200);
    }
  }
}

/**
 * ToastNotification - Non-blocking notification
 */
export class ToastNotification {
  constructor() {
    this.container = this.getOrCreateContainer();
    this.toasts = new Map();
  }

  /**
   * Get or create toast container
   */
  getOrCreateContainer() {
    let container = document.getElementById('toast-container');
    
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.setAttribute('role', 'region');
      container.setAttribute('aria-label', 'Notifications');
      document.body.appendChild(container);
    }
    
    return container;
  }

  /**
   * Show toast
   * @param {string} message
   * @param {Object} options
   * @returns {string} Toast ID
   */
  show(message, options = {}) {
    const id = `toast-${Date.now()}`;
    const { type = 'info', duration = 3000, action, onDismiss } = options;

    const icons = {
      success: '✓',
      error: '✕',
      warning: '⚠',
      info: 'ℹ'
    };

    const toast = document.createElement('div');
    toast.id = id;
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'polite');

    toast.innerHTML = `
      <span class="toast-icon">${icons[type] || ''}</span>
      <span class="toast-message">${escapeHtml(message)}</span>
      ${action ? `<button class="toast-action">${escapeHtml(action.label)}</button>` : ''}
      <button class="toast-dismiss" aria-label="Dismiss">✕</button>
    `;

    // Event handlers
    toast.querySelector('.toast-dismiss').addEventListener('click', () => {
      this.dismiss(id);
      onDismiss?.();
    });

    if (action) {
      toast.querySelector('.toast-action').addEventListener('click', () => {
        action.handler();
        this.dismiss(id);
      });
    }

    this.container.appendChild(toast);
    this.toasts.set(id, { toast, timeout: null, onDismiss });

    // Auto-dismiss
    if (duration > 0) {
      const timeout = setTimeout(() => this.dismiss(id), duration);
      this.toasts.get(id).timeout = timeout;
    }

    // Animate in
    requestAnimationFrame(() => toast.classList.add('show'));

    return id;
  }

  /**
   * Dismiss toast
   * @param {string} id
   */
  dismiss(id) {
    const entry = this.toasts.get(id);
    if (!entry) return;

    clearTimeout(entry.timeout);
    entry.toast.classList.remove('show');
    entry.toast.classList.add('hide');

    setTimeout(() => {
      entry.toast.remove();
      this.toasts.delete(id);
      entry.onDismiss?.();
    }, 200);
  }

  /**
   * Dismiss all toasts
   */
  dismissAll() {
    for (const [id, entry] of this.toasts.entries()) {
      clearTimeout(entry.timeout);
      entry.toast.remove();
      this.toasts.delete(id);
      entry.onDismiss?.();
    }
  }

  /**
   * Quick methods
   */
  success(message, options = {}) {
    return this.show(message, { ...options, type: 'success' });
  }

  error(message, options = {}) {
    return this.show(message, { ...options, type: 'error' });
  }

  warning(message, options = {}) {
    return this.show(message, { ...options, type: 'warning' });
  }

  info(message, options = {}) {
    return this.show(message, { ...options, type: 'info' });
  }
}

// Singleton toast instance
let toastInstance = null;

/**
 * Get toast instance
 * @returns {ToastNotification}
 */
export function getToast() {
  if (!toastInstance) {
    toastInstance = new ToastNotification();
  }
  return toastInstance;
}

/**
 * Add loading state styles
 */
export function addLoadingStateStyles() {
  if (document.getElementById('loading-state-styles')) return;

  const style = document.createElement('style');
  style.id = 'loading-state-styles';
  style.textContent = `
    /* Skeleton Loader */
    .skeleton-container {
      padding: 16px;
    }

    .skeleton-row {
      margin-bottom: 12px;
    }

    .skeleton-line {
      background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
      background-size: 200% 100%;
      animation: skeleton-shimmer 1.5s infinite;
    }

    @keyframes skeleton-shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }

    /* Loading Spinner */
    .loading-spinner {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }

    .spinner-svg {
      animation: spinner-rotate 1s linear infinite;
    }

    .spinner-arc {
      animation: spinner-dash 1.5s ease-in-out infinite;
    }

    @keyframes spinner-rotate {
      100% { transform: rotate(360deg); }
    }

    @keyframes spinner-dash {
      0% {
        stroke-dasharray: 1, 150;
        stroke-dashoffset: 0;
      }
      50% {
        stroke-dasharray: 90, 150;
        stroke-dashoffset: -35;
      }
      100% {
        stroke-dasharray: 90, 150;
        stroke-dashoffset: -124;
      }
    }

    /* Progress Bar */
    .progress-bar {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .progress-track {
      flex: 1;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      transition: width 0.3s ease;
    }

    .progress-fill.animate {
      background: linear-gradient(
        90deg,
        var(--color-primary, #3b82f6),
        var(--color-primary-light, #60a5fa),
        var(--color-primary, #3b82f6)
      );
      background-size: 200% 100%;
      animation: progress-shimmer 2s linear infinite;
    }

    @keyframes progress-shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }

    /* Step Progress */
    .step-progress {
      display: flex;
      align-items: center;
      gap: 0;
    }

    .step {
      display: flex;
      flex-direction: column;
      align-items: center;
      position: relative;
      flex: 1;
    }

    .step-indicator {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      background: var(--color-bg-secondary, #f3f4f6);
      color: var(--color-text-secondary, #6b7280);
      border: 2px solid var(--color-border, #e5e7eb);
      z-index: 1;
    }

    .step.active .step-indicator {
      background: var(--color-primary, #3b82f6);
      color: white;
      border-color: var(--color-primary, #3b82f6);
    }

    .step.complete .step-indicator {
      background: var(--color-success, #22c55e);
      color: white;
      border-color: var(--color-success, #22c55e);
    }

    .step-label {
      margin-top: 8px;
      font-size: 14px;
      color: var(--color-text-secondary, #6b7280);
    }

    .step.active .step-label {
      color: var(--color-text, #111827);
      font-weight: 500;
    }

    .step-connector {
      position: absolute;
      top: 16px;
      left: 50%;
      right: calc(-50% + 16px);
      height: 2px;
      background: var(--color-border, #e5e7eb);
    }

    .step.complete .step-connector {
      background: var(--color-success, #22c55e);
    }

    /* Loading Overlay */
    .loading-overlay {
      position: fixed;
      inset: 0;
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .loading-overlay-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
    }

    .loading-overlay-backdrop.blur {
      backdrop-filter: blur(4px);
    }

    .loading-overlay-content {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      padding: 32px;
      background: var(--color-bg, white);
      border-radius: 12px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
    }

    .loading-overlay-spinner {
      width: 48px;
      height: 48px;
      border: 3px solid var(--color-border, #e5e7eb);
      border-top-color: var(--color-primary, #3b82f6);
      border-radius: 50%;
      animation: spinner-rotate 0.8s linear infinite;
    }

    .loading-overlay-message {
      font-size: 16px;
      font-weight: 500;
      color: var(--color-text, #111827);
    }

    .loading-overlay-progress {
      width: 200px;
      height: 4px;
      background: var(--color-border, #e5e7eb);
      border-radius: 2px;
      overflow: hidden;
    }

    .loading-overlay.fade-out {
      opacity: 0;
      transition: opacity 0.2s;
    }

    /* Toast Notifications */
    #toast-container {
      position: fixed;
      bottom: 16px;
      right: 16px;
      z-index: 9998;
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-width: 400px;
    }

    .toast {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      background: var(--color-bg, white);
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      transform: translateX(100%);
      opacity: 0;
      transition: all 0.2s ease;
    }

    .toast.show {
      transform: translateX(0);
      opacity: 1;
    }

    .toast.hide {
      transform: translateX(100%);
      opacity: 0;
    }

    .toast-success .toast-icon { color: var(--color-success, #22c55e); }
    .toast-error .toast-icon { color: var(--color-error, #ef4444); }
    .toast-warning .toast-icon { color: var(--color-warning, #f59e0b); }
    .toast-info .toast-icon { color: var(--color-info, #3b82f6); }

    .toast-icon {
      font-size: 18px;
      flex-shrink: 0;
    }

    .toast-message {
      flex: 1;
      font-size: 14px;
    }

    .toast-action {
      padding: 4px 8px;
      background: var(--color-primary, #3b82f6);
      color: white;
      border: none;
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
    }

    .toast-dismiss {
      padding: 4px;
      background: transparent;
      border: none;
      color: var(--color-text-secondary, #6b7280);
      cursor: pointer;
      border-radius: 4px;
    }

    .toast-dismiss:hover {
      background: var(--color-bg-hover, #f3f4f6);
    }
  `;

  document.head.appendChild(style);
}
