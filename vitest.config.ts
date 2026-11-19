import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // Server testləri mock Firestore portu və process.env paylaşır
    fileParallelism: false,
  },
});
