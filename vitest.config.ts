import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      vscode: fileURLToPath(new URL('./src/test-utils/vscode.ts', import.meta.url))
    }
  },
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.ts']
  }
});
