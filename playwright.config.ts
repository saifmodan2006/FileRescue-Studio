import {defineConfig,devices} from '@playwright/test';
import {randomBytes} from 'node:crypto';

const password = process.env.STUDIO_TEST_PASSWORD ?? randomBytes(20).toString('hex');
process.env.STUDIO_TEST_PASSWORD = password;
const url = 'http://127.0.0.1:4411';
export default defineConfig({
  testDir:'tests/e2e',
  timeout:35_000,
  workers:2,
  reporter:'list',
  use:{...devices['Desktop Chrome'],baseURL:url,trace:'retain-on-failure'},
  webServer:{command:'node --import tsx tests/start-e2e.ts',url,timeout:25_000,env:{STUDIO_TEST_PASSWORD:password}},
});
