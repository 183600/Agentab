import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Test environment
    environment: 'jsdom',

    // Global test APIs
    globals: true,

    // Coverage not needed for E2E
    coverage: {
      enabled: false
    },

    // E2E test file patterns
    include: ['test/e2e/**/*.test.js'],

    // Setup files
    setupFiles: ['./test/e2e/setup.js'],

    // Longer timeout for E2E tests (browser operations)
    testTimeout: 60000,

    // Hook timeout
    hookTimeout: 30000,

    // Teardown timeout
    teardownTimeout: 10000,

    // Retry E2E tests more times (browser can be flaky)
    retry: 2,

    // Run E2E tests sequentially (browser instances)
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true
      }
    },

    // Don't isolate E2E tests
    isolate: false,

    // Longer bail threshold for E2E
    bail: 5,

    // Reporting
    reporters: ['verbose'],

    // Watch mode options
    watch: false
  }
});
