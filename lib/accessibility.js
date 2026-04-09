/**
 * Accessibility Module
 * Provides ARIA support, keyboard navigation, and screen reader compatibility
 */

/**
 * Keyboard navigation keys
 */
export const Keys = {
  ENTER: 'Enter',
  ESCAPE: 'Escape',
  SPACE: ' ',
  TAB: 'Tab',
  ARROW_UP: 'ArrowUp',
  ARROW_DOWN: 'ArrowDown',
  ARROW_LEFT: 'ArrowLeft',
  ARROW_RIGHT: 'ArrowRight',
  HOME: 'Home',
  END: 'End',
  PAGE_UP: 'PageUp',
  PAGE_DOWN: 'PageDown',
  DELETE: 'Delete',
  BACKSPACE: 'Backspace'
};

/**
 * FocusTrap - Traps focus within a container
 */
export class FocusTrap {
  constructor(container, options = {}) {
    this.container = container;
    this.options = {
      initialFocus: options.initialFocus,
      returnFocus: options.returnFocus ?? true,
      onEscape: options.onEscape,
      ...options
    };
    this.previouslyFocused = null;
    this.isActive = false;
  }

  /**
   * Activate focus trap
   */
  activate() {
    if (this.isActive) return;

    this.previouslyFocused = document.activeElement;
    this.isActive = true;

    // Add event listeners
    this.container.addEventListener('keydown', this._handleKeyDown.bind(this));

    // Set initial focus
    const initialElement = this.options.initialFocus 
      ? this.container.querySelector(this.options.initialFocus)
      : this._getFirstFocusable();

    if (initialElement) {
      initialElement.focus();
    }
  }

  /**
   * Deactivate focus trap
   */
  deactivate() {
    if (!this.isActive) return;

    this.isActive = false;
    this.container.removeEventListener('keydown', this._handleKeyDown.bind(this));

    // Return focus
    if (this.options.returnFocus && this.previouslyFocused) {
      this.previouslyFocused.focus();
    }
  }

  /**
   * Handle keydown events
   */
  _handleKeyDown(event) {
    if (event.key === Keys.TAB) {
      const focusableElements = this._getFocusableElements();
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    } else if (event.key === Keys.ESCAPE) {
      this.options.onEscape?.();
    }
  }

  /**
   * Get all focusable elements
   */
  _getFocusableElements() {
    const selector = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])'
    ].join(', ');

    return Array.from(this.container.querySelectorAll(selector))
      .filter(el => !el.closest('[aria-hidden="true"]'));
  }

  /**
   * Get first focusable element
   */
  _getFirstFocusable() {
    return this._getFocusableElements()[0];
  }
}

/**
 * KeyboardNavigator - Provides arrow key navigation for lists/menus
 */
export class KeyboardNavigator {
  constructor(container, options = {}) {
    this.container = container;
    this.options = {
      itemSelector: options.itemSelector || '[role="menuitem"], [role="option"]',
      orientation: options.orientation || 'vertical', // 'vertical' or 'horizontal'
      loop: options.loop ?? true,
      onSelect: options.onSelect,
      onEscape: options.onEscape,
      typeAhead: options.typeAhead ?? true,
      ...options
    };
    this.activeIndex = -1;
    this.typeAheadBuffer = '';
    this.typeAheadTimeout = null;
  }

  /**
   * Initialize navigation
   */
  init() {
    this.container.addEventListener('keydown', this._handleKeyDown.bind(this));
    this._updateItems();
  }

  /**
   * Update items list
   */
  _updateItems() {
    this.items = Array.from(this.container.querySelectorAll(this.options.itemSelector));
  }

  /**
   * Handle keydown events
   */
  _handleKeyDown(event) {
    this._updateItems();
    
    if (this.items.length === 0) return;

    const { key } = event;

    // Type ahead
    if (this.options.typeAhead && key.length === 1 && key.match(/[a-zA-Z0-9]/)) {
      this._handleTypeAhead(key);
      event.preventDefault();
      return;
    }

    switch (key) {
      case Keys.ARROW_DOWN:
        event.preventDefault();
        this._moveNext();
        break;

      case Keys.ARROW_UP:
        event.preventDefault();
        this._movePrev();
        break;

      case Keys.ARROW_RIGHT:
        if (this.options.orientation === 'horizontal') {
          event.preventDefault();
          this._moveNext();
        }
        break;

      case Keys.ARROW_LEFT:
        if (this.options.orientation === 'horizontal') {
          event.preventDefault();
          this._movePrev();
        }
        break;

      case Keys.HOME:
        event.preventDefault();
        this._moveTo(0);
        break;

      case Keys.END:
        event.preventDefault();
        this._moveTo(this.items.length - 1);
        break;

      case Keys.ENTER:
      case Keys.SPACE:
        event.preventDefault();
        this._selectCurrent();
        break;

      case Keys.ESCAPE:
        this.options.onEscape?.();
        break;
    }
  }

  /**
   * Move to next item
   */
  _moveNext() {
    let nextIndex = this.activeIndex + 1;
    
    if (nextIndex >= this.items.length) {
      nextIndex = this.options.loop ? 0 : this.items.length - 1;
    }
    
    this._moveTo(nextIndex);
  }

  /**
   * Move to previous item
   */
  _movePrev() {
    let prevIndex = this.activeIndex - 1;
    
    if (prevIndex < 0) {
      prevIndex = this.options.loop ? this.items.length - 1 : 0;
    }
    
    this._moveTo(prevIndex);
  }

  /**
   * Move to specific index
   */
  _moveTo(index) {
    // Remove active state from current
    if (this.activeIndex >= 0 && this.items[this.activeIndex]) {
      this.items[this.activeIndex].setAttribute('aria-selected', 'false');
      this.items[this.activeIndex].classList.remove('active');
    }

    // Set new active index
    this.activeIndex = index;
    const item = this.items[index];

    if (item) {
      item.setAttribute('aria-selected', 'true');
      item.classList.add('active');
      item.focus();

      // Scroll into view (with fallback for JSDOM)
      if (typeof item.scrollIntoView === 'function') {
        item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }

  /**
   * Handle type ahead
   */
  _handleTypeAhead(char) {
    clearTimeout(this.typeAheadTimeout);
    
    this.typeAheadBuffer += char.toLowerCase();
    
    // Find matching item
    const match = this.items.find(item => {
      const text = item.textContent.toLowerCase().trim();
      return text.startsWith(this.typeAheadBuffer);
    });

    if (match) {
      this._moveTo(this.items.indexOf(match));
    }

    // Clear buffer after timeout
    this.typeAheadTimeout = setTimeout(() => {
      this.typeAheadBuffer = '';
    }, 500);
  }

  /**
   * Select current item
   */
  _selectCurrent() {
    if (this.activeIndex >= 0) {
      this.options.onSelect?.(this.items[this.activeIndex], this.activeIndex);
    }
  }

  /**
   * Destroy navigator
   */
  destroy() {
    this.container.removeEventListener('keydown', this._handleKeyDown.bind(this));
  }
}

/**
 * ARIA utilities
 */
export const ARIA = {
  /**
   * Set ARIA attribute
   */
  set(element, attr, value) {
    element.setAttribute(`aria-${attr}`, value);
  },

  /**
   * Get ARIA attribute
   */
  get(element, attr) {
    return element.getAttribute(`aria-${attr}`);
  },

  /**
   * Remove ARIA attribute
   */
  remove(element, attr) {
    element.removeAttribute(`aria-${attr}`);
  },

  /**
   * Announce message to screen readers
   */
  announce(message, priority = 'polite') {
    const announcer = document.createElement('div');
    announcer.setAttribute('role', 'status');
    announcer.setAttribute('aria-live', priority);
    announcer.setAttribute('aria-atomic', 'true');
    announcer.className = 'sr-only';
    announcer.style.cssText = 'position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;';
    
    document.body.appendChild(announcer);
    
    // Set message after a tick to ensure announcement
    setTimeout(() => {
      announcer.textContent = message;
    }, 100);
    
    // Remove after announcement
    setTimeout(() => {
      announcer.remove();
    }, 1000);
  },

  /**
   * Create live region
   */
  createLiveRegion(id, priority = 'polite') {
    const region = document.createElement('div');
    region.id = id;
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', priority);
    region.setAttribute('aria-atomic', 'true');
    region.className = 'sr-only';
    region.style.cssText = 'position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;';
    
    document.body.appendChild(region);
    return region;
  },

  /**
   * Update live region
   */
  updateLiveRegion(id, message) {
    const region = document.getElementById(id);
    if (region) {
      region.textContent = message;
    }
  },

  /**
   * Set expanded state
   */
  setExpanded(element, expanded) {
    this.set(element, 'expanded', expanded);
  },

  /**
   * Set selected state
   */
  setSelected(element, selected) {
    this.set(element, 'selected', selected);
  },

  /**
   * Set checked state
   */
  setChecked(element, checked) {
    this.set(element, 'checked', checked);
  },

  /**
   * Set hidden state
   */
  setHidden(element, hidden) {
    this.set(element, 'hidden', hidden);
  },

  /**
   * Describe element
   */
  describe(element, descriptionId) {
    this.set(element, 'describedby', descriptionId);
  },

  /**
   * Label element
   */
  label(element, labelId) {
    this.set(element, 'labelledby', labelId);
  },

  /**
   * Set busy state
   */
  setBusy(element, busy) {
    this.set(element, 'busy', busy);
  }
};

/**
 * AccessibilityChecker - Check for accessibility issues
 */
export class AccessibilityChecker {
  /**
   * Check element for accessibility issues
   */
  static check(element) {
    const issues = [];

    // Check for missing alt on images
    const images = element.querySelectorAll('img:not([alt])');
    images.forEach(img => {
      issues.push({
        element: img,
        type: 'missing-alt',
        message: 'Image missing alt attribute',
        severity: 'error'
      });
    });

    // Check for missing labels on inputs
    const inputs = element.querySelectorAll('input:not([type="hidden"]), select, textarea');
    inputs.forEach(input => {
      const hasLabel = input.labels?.length > 0 || 
                       input.getAttribute('aria-label') ||
                       input.getAttribute('aria-labelledby');
      
      if (!hasLabel) {
        issues.push({
          element: input,
          type: 'missing-label',
          message: 'Form control missing accessible label',
          severity: 'error'
        });
      }
    });

    // Check for buttons without accessible names
    const buttons = element.querySelectorAll('button');
    buttons.forEach(button => {
      const hasName = button.textContent?.trim() ||
                      button.getAttribute('aria-label') ||
                      button.getAttribute('aria-labelledby');
      
      if (!hasName) {
        issues.push({
          element: button,
          type: 'missing-name',
          message: 'Button missing accessible name',
          severity: 'error'
        });
      }
    });

    // Check for links without text
    const links = element.querySelectorAll('a[href]');
    links.forEach(link => {
      const hasText = link.textContent?.trim() ||
                      link.getAttribute('aria-label') ||
                      link.getAttribute('aria-labelledby') ||
                      link.querySelector('img[alt]');
      
      if (!hasText) {
        issues.push({
          element: link,
          type: 'empty-link',
          message: 'Link without accessible text',
          severity: 'error'
        });
      }
    });

    // Check for invalid ARIA attributes
    const allElements = element.querySelectorAll('*');
    allElements.forEach(el => {
      Array.from(el.attributes).forEach(attr => {
        if (attr.name.startsWith('aria-') && !ARIA_ATTRIBUTES.has(attr.name)) {
          issues.push({
            element: el,
            type: 'invalid-aria',
            message: `Invalid ARIA attribute: ${attr.name}`,
            severity: 'warning'
          });
        }
      });
    });

    return issues;
  }

  /**
   * Get summary of issues
   */
  static getSummary(issues) {
    const errors = issues.filter(i => i.severity === 'error').length;
    const warnings = issues.filter(i => i.severity === 'warning').length;
    
    return {
      total: issues.length,
      errors,
      warnings,
      hasIssues: issues.length > 0
    };
  }
}

// Valid ARIA attributes
const ARIA_ATTRIBUTES = new Set([
  'aria-activedescendant',
  'aria-atomic',
  'aria-autocomplete',
  'aria-busy',
  'aria-checked',
  'aria-colcount',
  'aria-colindex',
  'aria-colspan',
  'aria-controls',
  'aria-current',
  'aria-describedby',
  'aria-details',
  'aria-disabled',
  'aria-dropeffect',
  'aria-errormessage',
  'aria-expanded',
  'aria-flowto',
  'aria-grabbed',
  'aria-haspopup',
  'aria-hidden',
  'aria-invalid',
  'aria-keyshortcuts',
  'aria-label',
  'aria-labelledby',
  'aria-level',
  'aria-live',
  'aria-modal',
  'aria-multiline',
  'aria-multiselectable',
  'aria-orientation',
  'aria-owns',
  'aria-placeholder',
  'aria-posinset',
  'aria-pressed',
  'aria-readonly',
  'aria-relevant',
  'aria-required',
  'aria-roledescription',
  'aria-rowcount',
  'aria-rowindex',
  'aria-rowspan',
  'aria-selected',
  'aria-setsize',
  'aria-sort',
  'aria-valuemax',
  'aria-valuemin',
  'aria-valuenow',
  'aria-valuetext'
]);

/**
 * Make element accessible
 */
export function makeAccessible(element, options = {}) {
  const {
    role,
    label,
    description,
    tabindex,
    hidden
  } = options;

  if (role) element.setAttribute('role', role);
  if (label) element.setAttribute('aria-label', label);
  if (description) element.setAttribute('aria-describedby', description);
  if (tabindex !== undefined) element.setAttribute('tabindex', tabindex);
  if (hidden !== undefined) element.setAttribute('aria-hidden', hidden);

  return element;
}

/**
 * Create accessible button
 */
export function createAccessibleButton(options = {}) {
  const {
    text,
    icon,
    label,
    pressed,
    expanded,
    controls,
    haspopup,
    onClick
  } = options;

  const button = document.createElement('button');
  
  if (text) button.textContent = text;
  if (label) button.setAttribute('aria-label', label);
  if (pressed !== undefined) button.setAttribute('aria-pressed', pressed);
  if (expanded !== undefined) button.setAttribute('aria-expanded', expanded);
  if (controls) button.setAttribute('aria-controls', controls);
  if (haspopup) button.setAttribute('aria-haspopup', haspopup);
  if (onClick) button.addEventListener('click', onClick);
  
  if (icon && !text) {
    button.innerHTML = icon;
    button.classList.add('icon-button');
  }

  return button;
}

/**
 * Create accessible dialog
 */
export function createAccessibleDialog(options = {}) {
  const {
    title,
    description,
    labelledBy,
    describedBy
  } = options;

  const dialog = document.createElement('div');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  
  if (labelledBy) {
    dialog.setAttribute('aria-labelledby', labelledBy);
  } else if (title) {
    const titleId = `dialog-title-${Date.now()}`;
    const titleEl = document.createElement('h2');
    titleEl.id = titleId;
    titleEl.textContent = title;
    dialog.appendChild(titleEl);
    dialog.setAttribute('aria-labelledby', titleId);
  }
  
  if (describedBy) {
    dialog.setAttribute('aria-describedby', describedBy);
  } else if (description) {
    const descId = `dialog-desc-${Date.now()}`;
    const descEl = document.createElement('p');
    descEl.id = descId;
    descEl.textContent = description;
    dialog.appendChild(descEl);
    dialog.setAttribute('aria-describedby', descId);
  }

  return dialog;
}
