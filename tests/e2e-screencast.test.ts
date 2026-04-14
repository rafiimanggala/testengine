/**
 * E2E Integration Test: ScreencastRelay with real Docker container
 *
 * Requirements: Docker running, testengine-browser image built
 * Run: npm test -- tests/e2e-screencast.test.ts --timeout 60000
 */
import { describe, it, expect, afterAll } from 'vitest';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import Docker from 'dockerode';
import { WebSocket } from 'ws';
import { ScreencastRelay } from '../src/screencast-relay.js';

const CONTAINER_PORT = 9100;
const WS_RELAY_PORT = 9200;
const DOCKER_IMAGE = 'testengine-browser';
const CONTAINER_NAME = 'te-e2e-test';

const docker = new Docker();
let containerId: string | undefined;
let browser: Browser | undefined;
let context: BrowserContext | undefined;
let page: Page | undefined;
let relay: ScreencastRelay | undefined;

async function waitForWsReady(port: number, maxRetries = 20): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const b = await chromium.connect(`ws://localhost:${port}/ws`);
      await b.close();
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(`Playwright WS not ready on port ${port} after ${maxRetries} retries`);
}

afterAll(async () => {
  if (relay) {
    await relay.stopAll().catch(() => {});
  }
  if (page) {
    await page.close().catch(() => {});
  }
  if (context) {
    await context.close().catch(() => {});
  }
  if (browser) {
    await browser.close().catch(() => {});
  }
  if (containerId) {
    const container = docker.getContainer(containerId);
    await container.stop({ t: 3 }).catch(() => {});
    await container.remove({ force: true }).catch(() => {});
  }
});

describe('E2E: ScreencastRelay with Docker', { timeout: 60000 }, () => {
  it('streams JPEG frames from CDP screencast through WebSocket relay', async () => {
    // 1. Start Docker container
    const container = await docker.createContainer({
      Image: DOCKER_IMAGE,
      name: CONTAINER_NAME,
      ExposedPorts: { '3000/tcp': {} },
      HostConfig: {
        PortBindings: { '3000/tcp': [{ HostPort: String(CONTAINER_PORT) }] },
        ShmSize: 2 * 1024 * 1024 * 1024,
      },
    });
    await container.start();
    containerId = container.id;

    // 2. Wait for Playwright WS endpoint
    await waitForWsReady(CONTAINER_PORT);

    // 3. Connect browser, create page, navigate
    browser = await chromium.connect(`ws://localhost:${CONTAINER_PORT}/ws`);
    context = await browser.newContext();
    page = await context.newPage();
    await page.goto('data:text/html,<h1>TestEngine E2E</h1>', { waitUntil: 'domcontentloaded' });

    // 4. Start ScreencastRelay
    relay = new ScreencastRelay(WS_RELAY_PORT);
    const relayPort = await relay.start('e2e-test', page);
    expect(relayPort).toBe(WS_RELAY_PORT);

    // 5. Connect WS client and collect frames
    const frames: Buffer[] = [];
    const wsConnected = new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${relayPort}`);
      ws.on('open', () => resolve());
      ws.on('error', reject);
      ws.on('message', (data: Buffer) => {
        frames.push(data);
      });

      // Close after collecting some frames
      setTimeout(() => ws.close(), 3000);
    });

    await wsConnected;

    // Wait for frames to arrive
    await new Promise((r) => setTimeout(r, 4000));

    // 6. Verify JPEG frames received
    expect(frames.length).toBeGreaterThan(0);

    // Verify first frame is valid JPEG (starts with FFD8)
    const firstFrame = frames[0];
    expect(firstFrame[0]).toBe(0xff);
    expect(firstFrame[1]).toBe(0xd8);

    // 7. Stop relay
    await relay.stop('e2e-test');
    expect(relay.isActive('e2e-test')).toBe(false);
  });
});
