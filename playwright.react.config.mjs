import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /react-lanzamiento\.spec\.mjs/,
  timeout: 60000,
  expect: { timeout: 20000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.PADDLESAFE_URL || 'http://127.0.0.1:5173',
    trace: 'off',
    screenshot: 'only-on-failure',
    locale: 'es-ES'
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5173',
    cwd: './web',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
    timeout: 30000
  },
  projects: [
    {
      name: 'escritorio',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } }
    },
    {
      name: 'movil',
      use: { ...devices['Pixel 5'] }
    },
    {
      name: 'movil-horizontal',
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 844, height: 390 }
      }
    }
  ]
});
