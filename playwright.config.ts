import { defineConfig } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const port = 3197
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  use: {
    baseURL,
    permissions: ['microphone'],
    launchOptions: {
      executablePath: process.env.CHROME_PATH,
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    },
  },
  webServer: [{
    command: 'node dist/server.js',
    url: baseURL,
    env: { PORT: String(port), DATA_DIR: mkdtempSync(join(tmpdir(), 'haoh-test-')) },
  }, {
    command: 'node dist/server.js',
    port: 43198,
    env: {
      PORT: '43198',
      DATA_DIR: mkdtempSync(join(tmpdir(), 'haoh-accounts-test-')),
      ADMIN_EMAIL: 'admin@example.test',
      ADMIN_PASSWORD: 'test-admin-password',
    },
  }],
})
