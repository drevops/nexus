import { createServer } from 'node:net';
import { defineConfig, devices } from '@playwright/test';

// Binds the way tests/server.mjs does, so the port is free for the server too.
export function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.on('error', reject);
    probe.listen(0, () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

// Worker processes load this file again and inherit the port through the
// environment, so every process of a run uses the same server.
process.env.NEXUS_E2E_PORT ||= String(await freePort());

const BASE_URL = 'http://127.0.0.1:' + process.env.NEXUS_E2E_PORT;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'node tests/server.mjs',
    url: BASE_URL + '/index.html',
    reuseExistingServer: false,
    env: { PORT: process.env.NEXUS_E2E_PORT },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
