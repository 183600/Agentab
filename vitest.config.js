import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // Mock @mlc-ai/web-llm since it's an optional dependency
      '@mlc-ai/web-llm': '/home/qwe12345678/Agentab/test/mocks/web-llm.js'
    }
  },
  test: {
    // Test environment
    environment: 'jsdom',

    // Global test APIs
    globals: true,

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: ['node_modules/**', 'test/**', '**/*.test.js', '**/*.spec.js', 'lib/workers/**'],
      // Enable coverage in CI environment, disable locally for faster tests
      enabled: process.env.CI === 'true' || process.env.COVERAGE === 'true'
    },

    // Test file patterns (exclude e2e tests by default)
    include: ['test/**/*.test.js'],
    exclude: ['test/e2e/**', 'node_modules/**'],

    // Setup files
    setupFiles: ['./test/setup.js'],

    // Timeout for individual tests (increased for complex tests)
    testTimeout: 15000,

    // Timeout for the entire test suite
    teardownTimeout: 15000,

    // Timeout for hook execution
    hookTimeout: 15000,

    // Retry failed tests once
    retry: 1,

    // Run tests in parallel for speed
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
        minThreads: 1,
        maxThreads: 4,
        isolate: true
      }
    },

    // Performance optimizations
    isolate: true, // Better test isolation
    bail: 10, // Stop after 10 failures for faster feedback

    // Reporting
    reporters: ['default'],
    silent: false,

    // Watch mode options
    watch: false,

    // Cache for faster reruns
    cache: true,

    // Exclude slow tests by default
    // Use --reporter=verbose to see slow tests
    slowTestThreshold: 1000,

    // Better handling of async operations
    fakeTimers: {
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date']
    }
  }
});
