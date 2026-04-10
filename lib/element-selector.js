/**
 * Element Selector - Visual DOM element picker
 * Allows users to visually select elements by hovering/clicking
 */

import { escapeHtml } from './ui-components.js';
import { uiLogger } from './logger.js';

/**
 * Generate CSS selector for an element
 * @param {HTMLElement} element
 * @returns {string}
 */
function generateSelector(element) {
  // Try ID first
  if (element.id) {
    return `#${CSS.escape(element.id)}`;
  }

  // Try unique class combination
  if (element.className && typeof element.className === 'string') {
    const classes = element.className.split(/\s+/).filter(c => c && !c.startsWith(':'));
    if (classes.length > 0) {
      const classSelector = classes.map(c => `.${CSS.escape(c)}`).join('');
      const matches = document.querySelectorAll(classSelector);
      if (matches.length === 1) {
        return classSelector;
      }
    }
  }

  // Try name attribute
  if (element.name) {
    const nameSelector = `${element.tagName.toLowerCase()}[name="${CSS.escape(element.name)}"]`;
    const matches = document.querySelectorAll(nameSelector);
    if (matches.length === 1) {
      return nameSelector;
    }
  }

  // Try data attributes
  for (const attr of element.attributes) {
    if (attr.name.startsWith('data-')) {
      const selector = `${element.tagName.toLowerCase()}[${attr.name}="${CSS.escape(attr.value)}"]`;
      const matches = document.querySelectorAll(selector);
      if (matches.length === 1) {
        return selector;
      }
    }
  }

  // Fall back to path-based selector
  const path = [];
  let current = element;

  while (current && current !== document.body) {
    let selector = current.tagName.toLowerCase();

    // Add nth-child if needed
    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        c => c.tagName === current.tagName
      );
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        selector += `:nth-child(${index})`;
      }
    }

    path.unshift(selector);
    current = parent;
  }

  return path.join(' > ');
}

/**
 * Get element metadata
 * @param {HTMLElement} element
 * @returns {Object}
 */
function getElementInfo(element) {
  const rect = element.getBoundingClientRect();

  return {
    tagName: element.tagName.toLowerCase(),
    selector: generateSelector(element),
    id: element.id || null,
    className: element.className || null,
    name: element.name || null,
    type: element.type || null,
    value: element.value || null,
    placeholder: element.placeholder || null,
    text: element.textContent?.slice(0, 100) || null,
    href: element.href || null,
    src: element.src || null,
    attributes: Array.from(element.attributes).reduce((acc, attr) => {
      acc[attr.name] = attr.value;
      return acc;
    }, {}),
    boundingBox: {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    },
    isVisible: rect.width > 0 && rect.height > 0,
    isInteractive:
      ['a', 'button', 'input', 'select', 'textarea'].includes(element.tagName.toLowerCase()) ||
      element.onclick !== null ||
      element.hasAttribute('onclick') ||
      element.getAttribute('role') === 'button'
  };
}

/**
 * ElementSelector - Visual element picker
 */
export class ElementSelector {
  /**
   * @param {Object} options
   * @param {Function} options.onSelect - Callback when element is selected
   * @param {Function} options.onHover - Callback when element is hovered
   * @param {Function} options.onCancel - Callback when selection is cancelled
   * @param {boolean} [options.showInfo] - Show element info panel
   * @param {string} [options.highlightColor] - Highlight color
   * @param {string} [options.highlightStyle] - 'solid' | 'dashed' | 'outline'
   */
  constructor(options = {}) {
    this.options = {
      showInfo: true,
      highlightColor: '#007acc',
      highlightStyle: 'solid',
      ...options
    };

    this.isActive = false;
    this.currentElement = null;
    this.highlightOverlay = null;
    this.infoPanel = null;
    this.tooltip = null;

    this.boundHandlers = {
      mouseover: this.handleMouseOver.bind(this),
      mouseout: this.handleMouseOut.bind(this),
      click: this.handleClick.bind(this),
      keydown: this.handleKeydown.bind(this)
    };
  }

  /**
   * Start element selection mode
   */
  start() {
    if (this.isActive) return;

    this.isActive = true;
    this.currentElement = null;

    // Add styles
    this.addStyles();

    // Create overlay
    this.createOverlay();

    // Create info panel
    if (this.options.showInfo) {
      this.createInfoPanel();
    }

    // Add event listeners
    document.addEventListener('mouseover', this.boundHandlers.mouseover, true);
    document.addEventListener('mouseout', this.boundHandlers.mouseout, true);
    document.addEventListener('click', this.boundHandlers.click, true);
    document.addEventListener('keydown', this.boundHandlers.keydown, true);

    // Change cursor
    document.body.style.cursor = 'crosshair';

    // Notify user
    this.showTooltip('Click an element to select it, or press Esc to cancel');

    uiLogger.info('Element selector started');
  }

  /**
   * Stop element selection mode
   */
  stop() {
    if (!this.isActive) return;

    this.isActive = false;
    this.currentElement = null;

    // Remove event listeners
    document.removeEventListener('mouseover', this.boundHandlers.mouseover, true);
    document.removeEventListener('mouseout', this.boundHandlers.mouseout, true);
    document.removeEventListener('click', this.boundHandlers.click, true);
    document.removeEventListener('keydown', this.boundHandlers.keydown, true);

    // Restore cursor
    document.body.style.cursor = '';

    // Remove UI elements
    this.removeOverlay();
    this.removeInfoPanel();
    this.hideTooltip();

    uiLogger.info('Element selector stopped');
  }

  /**
   * Handle mouse over
   */
  handleMouseOver(e) {
    if (!this.isActive) return;

    const element = e.target;

    // Ignore our own elements
    if (this.isOurElement(element)) return;

    this.currentElement = element;
    this.highlightElement(element);

    // Update info panel
    if (this.infoPanel) {
      this.updateInfoPanel(element);
    }

    // Notify callback
    if (this.options.onHover) {
      const info = getElementInfo(element);
      this.options.onHover(info);
    }
  }

  /**
   * Handle mouse out
   */
  handleMouseOut(e) {
    if (!this.isActive) return;

    const element = e.target;
    if (element === this.currentElement) {
      this.currentElement = null;
      this.removeHighlight();
    }
  }

  /**
   * Handle click
   */
  handleClick(e) {
    if (!this.isActive) return;

    e.preventDefault();
    e.stopPropagation();

    const element = e.target;

    // Ignore our own elements
    if (this.isOurElement(element)) return;

    const info = getElementInfo(element);

    // Stop selection mode
    this.stop();

    // Notify callback
    if (this.options.onSelect) {
      this.options.onSelect(info);
    }

    uiLogger.info('Element selected', { selector: info.selector, tagName: info.tagName });
  }

  /**
   * Handle keydown
   */
  handleKeydown(e) {
    if (!this.isActive) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      this.stop();

      if (this.options.onCancel) {
        this.options.onCancel();
      }
    }
  }

  /**
   * Check if element is our UI
   */
  isOurElement(element) {
    return (
      element === this.highlightOverlay ||
      element === this.infoPanel ||
      element === this.tooltip ||
      this.highlightOverlay?.contains(element) ||
      this.infoPanel?.contains(element) ||
      this.tooltip?.contains(element)
    );
  }

  /**
   * Create highlight overlay
   */
  createOverlay() {
    this.highlightOverlay = document.createElement('div');
    this.highlightOverlay.className = 'element-selector-overlay';
    this.highlightOverlay.style.cssText = `
      position: fixed;
      pointer-events: none;
      z-index: 2147483646;
      border: 2px ${this.options.highlightStyle} ${this.options.highlightColor};
      background: ${this.options.highlightColor}20;
      transition: all 0.1s ease;
    `;
    document.body.appendChild(this.highlightOverlay);
  }

  /**
   * Highlight an element
   */
  highlightElement(element) {
    if (!this.highlightOverlay) return;

    const rect = element.getBoundingClientRect();
    const overlay = this.highlightOverlay;

    overlay.style.top = `${rect.top}px`;
    overlay.style.left = `${rect.left}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
    overlay.style.display = 'block';
  }

  /**
   * Remove highlight
   */
  removeHighlight() {
    if (this.highlightOverlay) {
      this.highlightOverlay.style.display = 'none';
    }
  }

  /**
   * Remove overlay
   */
  removeOverlay() {
    if (this.highlightOverlay) {
      this.highlightOverlay.remove();
      this.highlightOverlay = null;
    }
  }

  /**
   * Create info panel
   */
  createInfoPanel() {
    this.infoPanel = document.createElement('div');
    this.infoPanel.className = 'element-selector-info';
    this.infoPanel.innerHTML = `
      <div class="info-header">
        <span class="info-title">Element Info</span>
      </div>
      <div class="info-content">
        <div class="info-row">
          <span class="info-label">Tag:</span>
          <span class="info-value info-tag"></span>
        </div>
        <div class="info-row">
          <span class="info-label">Selector:</span>
          <code class="info-value info-selector"></code>
        </div>
        <div class="info-row">
          <span class="info-label">ID:</span>
          <span class="info-value info-id"></span>
        </div>
        <div class="info-row">
          <span class="info-label">Class:</span>
          <span class="info-value info-class"></span>
        </div>
        <div class="info-row">
          <span class="info-label">Size:</span>
          <span class="info-value info-size"></span>
        </div>
      </div>
    `;
    document.body.appendChild(this.infoPanel);
  }

  /**
   * Update info panel
   */
  updateInfoPanel(element) {
    if (!this.infoPanel) return;

    const info = getElementInfo(element);
    const rect = info.boundingBox;

    this.infoPanel.querySelector('.info-tag').textContent = info.tagName;
    this.infoPanel.querySelector('.info-selector').textContent = info.selector;
    this.infoPanel.querySelector('.info-id').textContent = info.id || '-';
    this.infoPanel.querySelector('.info-class').textContent =
      info.className?.split(/\s+/).slice(0, 3).join(', ') || '-';
    this.infoPanel.querySelector('.info-size').textContent = `${rect.width} × ${rect.height}`;

    // Position panel
    this.positionInfoPanel(element);
  }

  /**
   * Position info panel near element
   */
  positionInfoPanel(element) {
    if (!this.infoPanel) return;

    const rect = element.getBoundingClientRect();
    const panelRect = this.infoPanel.getBoundingClientRect();

    let top = rect.bottom + 8;
    let left = rect.left;

    // Check if panel would go off screen
    if (top + panelRect.height > window.innerHeight) {
      top = rect.top - panelRect.height - 8;
    }

    if (left + panelRect.width > window.innerWidth) {
      left = window.innerWidth - panelRect.width - 8;
    }

    if (left < 8) {
      left = 8;
    }

    this.infoPanel.style.top = `${top}px`;
    this.infoPanel.style.left = `${left}px`;
  }

  /**
   * Remove info panel
   */
  removeInfoPanel() {
    if (this.infoPanel) {
      this.infoPanel.remove();
      this.infoPanel = null;
    }
  }

  /**
   * Show tooltip
   */
  showTooltip(message) {
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'element-selector-tooltip';
    this.tooltip.textContent = message;
    this.tooltip.style.cssText = `
      position: fixed;
      top: 16px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 2147483647;
      padding: 8px 16px;
      background: #333;
      color: #fff;
      border-radius: 6px;
      font-size: 13px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    `;
    document.body.appendChild(this.tooltip);
  }

  /**
   * Hide tooltip
   */
  hideTooltip() {
    if (this.tooltip) {
      this.tooltip.remove();
      this.tooltip = null;
    }
  }

  /**
   * Add styles
   */
  addStyles() {
    if (document.getElementById('element-selector-styles')) return;

    const style = document.createElement('style');
    style.id = 'element-selector-styles';
    style.textContent = `
      .element-selector-info {
        position: fixed;
        z-index: 2147483647;
        min-width: 200px;
        max-width: 350px;
        background: #fff;
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 12px;
        overflow: hidden;
      }

      .element-selector-info .info-header {
        padding: 8px 12px;
        background: #007acc;
        color: #fff;
        font-weight: 600;
      }

      .element-selector-info .info-content {
        padding: 8px 12px;
      }

      .element-selector-info .info-row {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        padding: 4px 0;
      }

      .element-selector-info .info-label {
        flex-shrink: 0;
        width: 60px;
        color: #888;
      }

      .element-selector-info .info-value {
        flex: 1;
        color: #333;
        word-break: break-all;
      }

      .element-selector-info .info-selector {
        display: block;
        padding: 4px 8px;
        background: #f5f5f5;
        border-radius: 4px;
        font-family: 'Fira Code', 'Consolas', monospace;
        font-size: 11px;
        color: #007acc;
      }
    `;

    document.head.appendChild(style);
  }

  /**
   * Check if selector is active
   * @returns {boolean}
   */
  isSelecting() {
    return this.isActive;
  }

  /**
   * Get current element info
   * @returns {Object|null}
   */
  getCurrentElement() {
    return this.currentElement ? getElementInfo(this.currentElement) : null;
  }
}

/**
 * Quick select element function
 * @param {Object} options
 * @returns {Promise<Object>}
 */
export function selectElement(options = {}) {
  return new Promise((resolve, reject) => {
    const selector = new ElementSelector({
      ...options,
      onSelect: info => {
        resolve(info);
      },
      onCancel: () => {
        reject(new Error('Selection cancelled'));
      }
    });

    selector.start();
  });
}

/**
 * Generate code snippet for element interaction
 * @param {Object} elementInfo - Element info from selector
 * @param {string} action - Action type
 * @returns {string}
 */
export function generateCodeSnippet(elementInfo, action) {
  const selector = elementInfo.selector;

  switch (action) {
    case 'click':
      return `// Click on ${elementInfo.tagName}
const element = document.querySelector('${selector}');
if (element) {
  element.click();
  console.log('Clicked:', element);
}`;

    case 'type':
      const placeholder = elementInfo.placeholder || 'Enter text';
      return `// Type into ${elementInfo.tagName}
const input = document.querySelector('${selector}');
if (input) {
  input.value = '${placeholder}';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  console.log('Typed into:', input);
}`;

    case 'getText':
      return `// Get text from ${elementInfo.tagName}
const element = document.querySelector('${selector}');
const text = element?.textContent?.trim() || '';
console.log('Text:', text);
return text;`;

    case 'getValue':
      return `// Get value from ${elementInfo.tagName}
const input = document.querySelector('${selector}');
const value = input?.value || '';
console.log('Value:', value);
return value;`;

    case 'getAttribute':
      return `// Get attributes from ${elementInfo.tagName}
const element = document.querySelector('${selector}');
const attrs = {};
if (element) {
  for (const attr of element.attributes) {
    attrs[attr.name] = attr.value;
  }
}
console.log('Attributes:', attrs);
return attrs;`;

    case 'highlight':
      return `// Highlight ${elementInfo.tagName}
const element = document.querySelector('${selector}');
if (element) {
  element.style.outline = '3px solid #007acc';
  element.style.outlineOffset = '2px';
  setTimeout(() => {
    element.style.outline = '';
    element.style.outlineOffset = '';
  }, 2000);
}`;

    case 'scroll':
      return `// Scroll to ${elementInfo.tagName}
const element = document.querySelector('${selector}');
if (element) {
  element.scrollIntoView({ behavior: 'smooth', block: 'center' });
}`;

    case 'remove':
      return `// Remove ${elementInfo.tagName}
const element = document.querySelector('${selector}');
if (element) {
  element.remove();
  console.log('Element removed');
}`;

    default:
      return `// Selector: ${selector}
const element = document.querySelector('${selector}');
console.log('Element:', element);
return element;`;
  }
}

/**
 * Get all interactive elements on page
 * @returns {Array<Object>}
 */
export function getInteractiveElements() {
  const interactiveSelectors = [
    'a[href]',
    'button',
    'input',
    'select',
    'textarea',
    '[onclick]',
    '[role="button"]',
    '[role="link"]',
    '[tabindex]'
  ];

  const elements = document.querySelectorAll(interactiveSelectors.join(', '));
  const results = [];

  for (const element of elements) {
    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      results.push(getElementInfo(element));
    }
  }

  return results;
}
