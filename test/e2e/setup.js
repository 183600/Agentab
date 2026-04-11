/**
 * E2E Test Setup
 * Configures the test environment for browser extension testing
 */

import { beforeAll, afterAll, vi } from 'vitest';

// Increase timeout for E2E tests
vi.setConfig({
  testTimeout: 60000,
  hookTimeout: 30000
});

// Mock console methods to reduce noise in E2E tests
const originalConsole = {
  log: console.log,
  warn: console.warn,
  error: console.error,
  info: console.info,
  debug: console.debug
};

beforeAll(() => {
  // Keep errors and warnings, suppress logs in CI
  if (process.env.CI) {
    console.log = vi.fn();
    console.info = vi.fn();
    console.debug = vi.fn();
  }
});

afterAll(() => {
  // Restore console
  Object.assign(console, originalConsole);
});

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection in E2E test:', reason);
});

// Export for potential use in tests
export { originalConsole };