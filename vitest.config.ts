import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'lcov'],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 70,
        statements: 90,
      },
      exclude: [
        'dist/**',
        'node_modules/**',
        'tests/**',
        'src/entrypoints/**',
        'esbuild.config.ts',
        'vitest.config.ts',
        'eslint.config.js',
      ],
    },
  },
});
