const { defineConfig } = require('@playwright/test');
const baseURL = `http://127.0.0.1:${process.env.SPARK_TEST_PORT || 8089}`;
const browserName = process.env.SPARK_TEST_BROWSER === 'webkit' ? 'webkit' : 'chromium';
module.exports = defineConfig({
  // Legacy three-mode specs remain historical; only the current mentorship app is served.
  testDir: './tests', testMatch: '**/mentorship*.spec.cjs', workers: 1,
  use: { baseURL, browserName, ...(browserName === 'chromium' ? { channel: 'chrome' } : {}), serviceWorkers: 'block', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  webServer: { command: 'node tools/serve.cjs', url: baseURL, reuseExistingServer: false },
});
