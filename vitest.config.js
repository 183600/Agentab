import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Test environment
    environment: 'jsdom',

    // Global test APIs
    globals: true,

    // Ensure modules are properly mocked
    deps: {
      inline: [/lib\/logger\.js/]
    },

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: ['node_modules/**', 'test/**', '**/*.test.js', '**/*.spec.js', 'lib/workers/**'],
      // Don't collect coverage by default for faster tests
      enabled: false
    },

    // Test file patterns (exclude e2e tests by default)
    include: ['test/**/*.test.js'],
    exclude: ['test/e2e/**', 'node_modules/**'],

    // Setup files
    setupFiles: ['./test/setup.js'],

    // Timeout for individual tests (reduced for faster feedback)
    testTimeout: 5000,

    // Timeout for the entire test suite
    teardownTimeout: 5000,

    // Retry failed tests once
    retry: 1,

    // Run tests in parallel for speed
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
        minThreads: 1,
        maxThreads: 4
      }
    },

    // Performance optimizations
    isolate: false, // Faster but requires careful test isolation
    bail: 10, // Stop after 10 failures

    // Reporting
    reporters: ['default'],
    silent: false,

    // Watch mode options
    watch: false
  }
});
