import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['src/**/__tests__/*.spec.ts'],
    setupFiles: ['./src/test-setup/localstorage-polyfill.ts'],
  },
})
