import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/leaflet-mock.ts', './src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      // A dialog test that takes ~1s on its own takes several when the suite runs in parallel:
      // every file builds its own jsdom, and Radix renders a lot of it. The 5s default then times
      // the slowest files out at random, which reads as flakiness rather than as the starvation
      // it is.
      testTimeout: 20_000,
    },
  }),
)
