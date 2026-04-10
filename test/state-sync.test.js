/**
 * Tests for State Sync
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StateSync, StateChangeType, StateKeys, useState, getGlobalStateSync } from '../lib/state-sync.js';

describe('StateSync', () => {
  let stateSync;

  beforeEach(() => {
    stateSync = new StateSync({
      namespace: 'test',
      persist: false
    });
  });

  afterEach(() => {
    stateSync?.destroy();
  });

  describe('get and set', () => {
    it('should set and get simple values', () => {
      stateSync.set('name', 'test');
      expect(stateSync.get('name')).toBe('test');
    });

    it('should set and get nested values', () => {
      stateSync.set('user.name', 'John');
      stateSync.set('user.age', 30);

      expect(stateSync.get('user.name')).toBe('John');
      expect(stateSync.get('user.age')).toBe(30);
    });

    it('should return default value for missing keys', () => {
      expect(stateSync.get('missing', 'default')).toBe('default');
    });

    it('should handle undefined values', () => {
      stateSync.set('value', undefined);
      expect(stateSync.get('value')).toBeUndefined();
    });

    it('should handle null values', () => {
      stateSync.set('value', null);
      expect(stateSync.get('value')).toBeNull();
    });

    it('should handle complex objects', () => {
      const obj = { a: 1, b: { c: 2 } };
      stateSync.set('object', obj);
      expect(stateSync.get('object')).toEqual(obj);
    });
  });

  describe('delete', () => {
    it('should delete values', () => {
      stateSync.set('name', 'test');
      stateSync.delete('name');
      expect(stateSync.get('name')).toBeUndefined();
    });

    it('should delete nested values', () => {
      stateSync.set('user.name', 'John');
      stateSync.set('user.age', 30);
      stateSync.delete('user.name');

      expect(stateSync.get('user.name')).toBeUndefined();
      expect(stateSync.get('user.age')).toBe(30);
    });
  });

  describe('merge', () => {
    it('should merge objects', () => {
      stateSync.set('a', 1);
      stateSync.merge({ b: 2, c: 3 });

      expect(stateSync.get('a')).toBe(1);
      expect(stateSync.get('b')).toBe(2);
      expect(stateSync.get('c')).toBe(3);
    });
  });

  describe('clear', () => {
    it('should clear all state', () => {
      stateSync.set('a', 1);
      stateSync.set('b', 2);
      stateSync.clear();

      expect(stateSync.get('a')).toBeUndefined();
      expect(stateSync.get('b')).toBeUndefined();
    });
  });

  describe('subscribe', () => {
    it('should notify subscribers on change', () => {
      const handler = vi.fn();
      stateSync.subscribe('name', handler);

      stateSync.set('name', 'test');
      expect(handler).toHaveBeenCalled();
    });

    it('should notify global subscribers', () => {
      const handler = vi.fn();
      stateSync.subscribe(handler);

      stateSync.set('name', 'test');
      expect(handler).toHaveBeenCalled();
    });

    it('should unsubscribe', () => {
      const handler = vi.fn();
      const unsub = stateSync.subscribe('name', handler);

      unsub();
      stateSync.set('name', 'test');
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('scope', () => {
    it('should create scoped state', () => {
      const scoped = stateSync.scope('ui');
      scoped.set('theme', 'dark');

      expect(stateSync.get('ui.theme')).toBe('dark');
      expect(scoped.get('theme')).toBe('dark');
    });
  });

  describe('getState and setState', () => {
    it('should get entire state', () => {
      stateSync.set('a', 1);
      stateSync.set('b', 2);

      const state = stateSync.getState();
      expect(state).toEqual({ a: 1, b: 2 });
    });

    it('should set entire state', () => {
      stateSync.setState({ a: 1, b: 2 });

      expect(stateSync.get('a')).toBe(1);
      expect(stateSync.get('b')).toBe(2);
    });
  });
});

describe('useState', () => {
  it('should create state getter and setter', () => {
    const stateSync = new StateSync({ namespace: 'hook-test', persist: false });
    const [getValue, setValue] = useState(stateSync, 'count', 0);

    expect(getValue()).toBe(0);

    setValue(5);
    expect(getValue()).toBe(5);

    stateSync.destroy();
  });

  it('should support functional updates', () => {
    const stateSync = new StateSync({ namespace: 'hook-test2', persist: false });
    const [getValue, setValue] = useState(stateSync, 'count', 0);

    setValue(prev => prev + 1);
    expect(getValue()).toBe(1);

    stateSync.destroy();
  });
});

describe('getGlobalStateSync', () => {
  it('should return same instance', () => {
    const instance1 = getGlobalStateSync();
    const instance2 = getGlobalStateSync();

    expect(instance1).toBe(instance2);
  });
});

describe('StateKeys', () => {
  it('should have predefined state keys', () => {
    expect(StateKeys.UI_THEME).toBeDefined();
    expect(StateKeys.AGENT_RUNNING).toBeDefined();
    expect(StateKeys.API_CONFIGURED).toBeDefined();
  });
});
