/**
 * Tests for Accessibility Module
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  Keys,
  FocusTrap,
  KeyboardNavigator,
  ARIA,
  AccessibilityChecker,
  makeAccessible,
  createAccessibleButton,
  createAccessibleDialog
} from '../lib/accessibility.js';

describe('Keys', () => {
  it('should define all navigation keys', () => {
    expect(Keys.ENTER).toBe('Enter');
    expect(Keys.ESCAPE).toBe('Escape');
    expect(Keys.ARROW_UP).toBe('ArrowUp');
    expect(Keys.ARROW_DOWN).toBe('ArrowDown');
  });
});

describe('FocusTrap', () => {
  let container;
  let focusTrap;

  beforeEach(() => {
    container = document.createElement('div');
    container.innerHTML = `
      <button id="btn1">Button 1</button>
      <button id="btn2">Button 2</button>
      <button id="btn3">Button 3</button>
    `;
    document.body.appendChild(container);
    focusTrap = new FocusTrap(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('should activate and deactivate', () => {
    focusTrap.activate();
    expect(focusTrap.isActive).toBe(true);
    
    focusTrap.deactivate();
    expect(focusTrap.isActive).toBe(false);
  });

  it('should set initial focus on activation', () => {
    focusTrap.activate();
    
    expect(document.activeElement).toBe(container.querySelector('#btn1'));
  });

  it('should store previously focused element', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    
    focusTrap.activate();
    expect(focusTrap.previouslyFocused).toBe(input);
    
    focusTrap.deactivate();
    input.remove();
  });

  it('should call onEscape callback', () => {
    const onEscape = vi.fn();
    focusTrap = new FocusTrap(container, { onEscape });
    focusTrap.activate();
    
    const event = new KeyboardEvent('keydown', { key: Keys.ESCAPE });
    container.dispatchEvent(event);
    
    expect(onEscape).toHaveBeenCalled();
  });
});

describe('KeyboardNavigator', () => {
  let container;
  let navigator;

  beforeEach(() => {
    container = document.createElement('div');
    container.setAttribute('role', 'menu');
    container.innerHTML = `
      <div role="menuitem" tabindex="-1">Item 1</div>
      <div role="menuitem" tabindex="-1">Item 2</div>
      <div role="menuitem" tabindex="-1">Item 3</div>
    `;
    document.body.appendChild(container);
    navigator = new KeyboardNavigator(container);
    navigator.init();
  });

  afterEach(() => {
    container.remove();
    navigator.destroy();
  });

  it('should initialize with items', () => {
    expect(navigator.items).toHaveLength(3);
  });

  it('should move to next item on arrow down', () => {
    const event = new KeyboardEvent('keydown', { key: Keys.ARROW_DOWN });
    container.dispatchEvent(event);
    
    expect(navigator.activeIndex).toBe(0);
    
    container.dispatchEvent(event);
    expect(navigator.activeIndex).toBe(1);
  });

  it('should move to previous item on arrow up', () => {
    navigator.activeIndex = 1;
    
    const event = new KeyboardEvent('keydown', { key: Keys.ARROW_UP });
    container.dispatchEvent(event);
    
    expect(navigator.activeIndex).toBe(0);
  });

  it('should move to first item on Home', () => {
    navigator.activeIndex = 2;
    
    const event = new KeyboardEvent('keydown', { key: Keys.HOME });
    container.dispatchEvent(event);
    
    expect(navigator.activeIndex).toBe(0);
  });

  it('should move to last item on End', () => {
    const event = new KeyboardEvent('keydown', { key: Keys.END });
    container.dispatchEvent(event);
    
    expect(navigator.activeIndex).toBe(2);
  });

  it('should call onSelect on Enter', () => {
    const onSelect = vi.fn();
    navigator = new KeyboardNavigator(container, { onSelect });
    navigator.init();
    navigator.activeIndex = 1;
    
    const event = new KeyboardEvent('keydown', { key: Keys.ENTER });
    container.dispatchEvent(event);
    
    expect(onSelect).toHaveBeenCalled();
  });

  it('should loop navigation by default', () => {
    navigator.activeIndex = 2;
    
    const event = new KeyboardEvent('keydown', { key: Keys.ARROW_DOWN });
    container.dispatchEvent(event);
    
    expect(navigator.activeIndex).toBe(0);
  });

  it('should support type ahead', () => {
    container.innerHTML = `
      <div role="menuitem" tabindex="-1">Apple</div>
      <div role="menuitem" tabindex="-1">Banana</div>
      <div role="menuitem" tabindex="-1">Cherry</div>
    `;
    
    navigator = new KeyboardNavigator(container, { typeAhead: true });
    navigator.init();
    
    const event = new KeyboardEvent('keydown', { key: 'b' });
    container.dispatchEvent(event);
    
    expect(navigator.activeIndex).toBe(1);
  });
});

describe('ARIA', () => {
  let element;

  beforeEach(() => {
    element = document.createElement('div');
  });

  it('should set ARIA attribute', () => {
    ARIA.set(element, 'label', 'Test');
    expect(element.getAttribute('aria-label')).toBe('Test');
  });

  it('should get ARIA attribute', () => {
    element.setAttribute('aria-hidden', 'true');
    expect(ARIA.get(element, 'hidden')).toBe('true');
  });

  it('should remove ARIA attribute', () => {
    element.setAttribute('aria-busy', 'true');
    ARIA.remove(element, 'busy');
    expect(element.hasAttribute('aria-busy')).toBe(false);
  });

  it('should announce message to screen readers', () => {
    ARIA.announce('Test announcement');
    
    const announcer = document.querySelector('[aria-live="polite"]');
    expect(announcer).toBeDefined();
    
    setTimeout(() => {
      expect(announcer.textContent).toBe('Test announcement');
    }, 150);
  });

  it('should set expanded state', () => {
    ARIA.setExpanded(element, true);
    expect(element.getAttribute('aria-expanded')).toBe('true');
  });

  it('should set selected state', () => {
    ARIA.setSelected(element, true);
    expect(element.getAttribute('aria-selected')).toBe('true');
  });

  it('should set busy state', () => {
    ARIA.setBusy(element, true);
    expect(element.getAttribute('aria-busy')).toBe('true');
  });

  it('should create live region', () => {
    const region = ARIA.createLiveRegion('test-region', 'assertive');
    
    expect(region.id).toBe('test-region');
    expect(region.getAttribute('aria-live')).toBe('assertive');
    
    region.remove();
  });

  it('should update live region', () => {
    const region = ARIA.createLiveRegion('test-region');
    ARIA.updateLiveRegion('test-region', 'Updated message');
    
    expect(region.textContent).toBe('Updated message');
    
    region.remove();
  });
});

describe('AccessibilityChecker', () => {
  let container;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('should detect missing alt on images', () => {
    container.innerHTML = '<img src="test.jpg">';
    
    const issues = AccessibilityChecker.check(container);
    
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe('missing-alt');
  });

  it('should detect missing labels on inputs', () => {
    container.innerHTML = '<input type="text">';
    
    const issues = AccessibilityChecker.check(container);
    
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe('missing-label');
  });

  it('should pass for inputs with aria-label', () => {
    container.innerHTML = '<input type="text" aria-label="Search">';
    
    const issues = AccessibilityChecker.check(container);
    
    expect(issues).toHaveLength(0);
  });

  it('should detect buttons without accessible names', () => {
    container.innerHTML = '<button></button>';
    
    const issues = AccessibilityChecker.check(container);
    
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe('missing-name');
  });

  it('should detect empty links', () => {
    container.innerHTML = '<a href="#"></a>';
    
    const issues = AccessibilityChecker.check(container);
    
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe('empty-link');
  });

  it('should get summary of issues', () => {
    const issues = [
      { severity: 'error' },
      { severity: 'error' },
      { severity: 'warning' }
    ];
    
    const summary = AccessibilityChecker.getSummary(issues);
    
    expect(summary.total).toBe(3);
    expect(summary.errors).toBe(2);
    expect(summary.warnings).toBe(1);
  });
});

describe('makeAccessible', () => {
  it('should add accessibility attributes', () => {
    const element = document.createElement('div');
    
    makeAccessible(element, {
      role: 'button',
      label: 'Click me',
      tabindex: 0
    });
    
    expect(element.getAttribute('role')).toBe('button');
    expect(element.getAttribute('aria-label')).toBe('Click me');
    expect(element.getAttribute('tabindex')).toBe('0');
  });

  it('should return the element', () => {
    const element = document.createElement('div');
    const result = makeAccessible(element, { role: 'button' });
    
    expect(result).toBe(element);
  });
});

describe('createAccessibleButton', () => {
  it('should create button with text', () => {
    const button = createAccessibleButton({ text: 'Click me' });
    
    expect(button.tagName).toBe('BUTTON');
    expect(button.textContent).toBe('Click me');
  });

  it('should create button with aria-label', () => {
    const button = createAccessibleButton({ label: 'Close dialog' });
    
    expect(button.getAttribute('aria-label')).toBe('Close dialog');
  });

  it('should set pressed state', () => {
    const button = createAccessibleButton({ pressed: true });
    
    expect(button.getAttribute('aria-pressed')).toBe('true');
  });

  it('should set expanded state', () => {
    const button = createAccessibleButton({ expanded: true, controls: 'menu1' });
    
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(button.getAttribute('aria-controls')).toBe('menu1');
  });

  it('should attach click handler', () => {
    const onClick = vi.fn();
    const button = createAccessibleButton({ onClick });
    
    button.click();
    
    expect(onClick).toHaveBeenCalled();
  });
});

describe('createAccessibleDialog', () => {
  it('should create dialog with title', () => {
    const dialog = createAccessibleDialog({ title: 'Confirm Action' });
    
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.textContent).toContain('Confirm Action');
  });

  it('should create dialog with description', () => {
    const dialog = createAccessibleDialog({ 
      title: 'Delete Item',
      description: 'This action cannot be undone.'
    });
    
    expect(dialog.textContent).toContain('This action cannot be undone.');
    expect(dialog.getAttribute('aria-describedby')).toBeDefined();
  });

  it('should use provided labelledBy', () => {
    const dialog = createAccessibleDialog({ labelledBy: 'custom-title' });
    
    expect(dialog.getAttribute('aria-labelledby')).toBe('custom-title');
  });
});
