import preact from '@preact/preset-vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [preact()],
  test: {
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    environment: 'node',
    setupFiles: ['tests/helpers/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/core/**/*.ts', 'src/shared/**/*.ts'],
      reporter: ['text', 'html'],
      thresholds: {
        'src/core/**': { lines: 90, functions: 90, branches: 90, statements: 90 },
      },
    },
  },
});
