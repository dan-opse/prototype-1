import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Each test file gets its own throwaway database copy, so files must not share a process.
    pool: 'forks',
  },
});
