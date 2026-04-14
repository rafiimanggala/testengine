// docker/launch-server.js
const { chromium } = require('playwright');

(async () => {
  const server = await chromium.launchServer({
    headless: true,
    port: 3000,
    wsPath: '/ws',
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-features=ServiceWorker',
      '--headless=new',
    ],
  });

  const wsEndpoint = server.wsEndpoint();
  console.log(`PLAYWRIGHT_WS=${wsEndpoint}`);
  // Keep process alive
  process.on('SIGTERM', async () => {
    await server.close();
    process.exit(0);
  });
})();
