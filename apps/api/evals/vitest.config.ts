import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Do not let Vite load workspace .env files into the isolated eval worker.
  envDir: process.env.EVAL_TEMP_ROOT,
  test: {
    include: ['evals/drop-a.eval.ts'], fileParallelism: false,
    testTimeout: 240000, hookTimeout: 45000,
  },
});
