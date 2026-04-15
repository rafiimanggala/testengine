import { chromium, Browser, Page, BrowserContext } from 'playwright';
import { SessionManager } from './session-manager.js';
import { ConsoleCollector } from './console-collector.js';
import { NetworkCollector } from './network-collector.js';
import type { ConsoleEntry } from './console-collector.js';

export class BrowserBridge {
  private sessionManager: SessionManager;
  private browsers: Map<string, Browser> = new Map();
  private contexts: Map<string, BrowserContext> = new Map();
  private pages: Map<string, Page> = new Map();
  private consoleCollector: ConsoleCollector;
  private networkCollector: NetworkCollector;

  constructor(
    sessionManager: SessionManager,
    consoleCollector?: ConsoleCollector,
    networkCollector?: NetworkCollector,
  ) {
    this.sessionManager = sessionManager;
    this.consoleCollector = consoleCollector ?? new ConsoleCollector();
    this.networkCollector = networkCollector ?? new NetworkCollector();
  }

  getConsoleCollector(): ConsoleCollector { return this.consoleCollector; }
  getNetworkCollector(): NetworkCollector { return this.networkCollector; }

  private attachPageListeners(sessionId: string, page: Page): void {
    page.on('console', (msg) => {
      const level = msg.type();
      const mapped = (['log', 'warn', 'error', 'info'].includes(level) ? level : 'log') as ConsoleEntry['level'];
      this.consoleCollector.push(sessionId, {
        level: mapped,
        text: msg.text(),
        timestamp: Date.now(),
      });
    });

    page.on('request', (request) => {
      this.networkCollector.recordRequest(sessionId, request.url(), request.method());
    });

    page.on('response', (response) => {
      const request = response.request();
      this.networkCollector.recordResponse(
        sessionId, response.url(), request.method(),
        response.status(), request.resourceType(),
      );
    });
  }

  async connect(sessionId: string, maxRetries: number = 10): Promise<void> {
    const wsEndpoint = this.sessionManager.getWsEndpoint(sessionId);

    let lastError: Error | null = null;
    for (let i = 0; i < maxRetries; i++) {
      let browser: Browser | null = null;
      try {
        browser = await chromium.connect(wsEndpoint);
        const context = await browser.newContext();
        const page = await context.newPage();

        this.browsers.set(sessionId, browser);
        this.contexts.set(sessionId, context);
        this.pages.set(sessionId, page);

        this.attachPageListeners(sessionId, page);
        context.on('page', (newPage: Page) => {
          this.attachPageListeners(sessionId, newPage);
        });

        this.sessionManager.setStatus(sessionId, 'running');
        return;
      } catch (err) {
        lastError = err as Error;
        if (browser) { await browser.close().catch(() => {}); }
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    throw new Error(`Failed to connect to session "${sessionId}" after ${maxRetries} retries: ${lastError?.message}`);
  }

  async disconnect(sessionId: string): Promise<void> {
    const browser = this.browsers.get(sessionId);
    if (browser) {
      try { await browser.close(); } catch { /* already closed */ }
    }
    this.browsers.delete(sessionId);
    this.contexts.delete(sessionId);
    this.pages.delete(sessionId);
    this.consoleCollector.clear(sessionId);
    this.networkCollector.clear(sessionId);
  }

  getPage(sessionId: string): Page {
    const page = this.pages.get(sessionId);
    if (!page) throw new Error(`No page for session "${sessionId}". Is it connected?`);
    return page;
  }

  private getContext(sessionId: string): BrowserContext {
    const ctx = this.contexts.get(sessionId);
    if (!ctx) throw new Error(`No context for session "${sessionId}".`);
    return ctx;
  }

  async navigate(sessionId: string, url: string): Promise<string> {
    const page = this.getPage(sessionId);
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    return `Navigated to ${url} (status: ${response?.status() ?? 'unknown'})`;
  }

  async click(sessionId: string, selector: string): Promise<string> {
    const page = this.getPage(sessionId);
    await page.click(selector, { timeout: 10000 });
    return `Clicked: ${selector}`;
  }

  async type(sessionId: string, selector: string, text: string): Promise<string> {
    const page = this.getPage(sessionId);
    await page.fill(selector, text, { timeout: 10000 });
    return `Typed "${text}" into ${selector}`;
  }

  async screenshot(sessionId: string): Promise<Buffer> {
    const page = this.getPage(sessionId);
    return await page.screenshot({ type: 'jpeg', quality: 75 });
  }

  async getText(sessionId: string, selector?: string): Promise<string> {
    const page = this.getPage(sessionId);
    if (selector) {
      return await page.textContent(selector, { timeout: 10000 }) ?? '';
    }
    return await page.evaluate(() => document.body.innerText);
  }

  async waitFor(sessionId: string, selector: string, timeout: number = 10000): Promise<string> {
    const page = this.getPage(sessionId);
    await page.waitForSelector(selector, { timeout });
    return `Element found: ${selector}`;
  }

  async evaluate(sessionId: string, script: string): Promise<string> {
    const page = this.getPage(sessionId);
    const result = await page.evaluate(script);
    return JSON.stringify(result);
  }

  async fillForm(sessionId: string, fields: Record<string, string>): Promise<string> {
    const page = this.getPage(sessionId);
    const filled: string[] = [];
    for (const [selector, value] of Object.entries(fields)) {
      await page.fill(selector, value, { timeout: 10000 });
      filled.push(selector);
    }
    return `Filled ${filled.length} fields: ${filled.join(', ')}`;
  }

  async saveAuthToJson(sessionId: string): Promise<string> {
    const context = this.getContext(sessionId);
    const state = await context.storageState();
    return JSON.stringify(state);
  }

  async loadAuthFromJson(sessionId: string, stateJson: string): Promise<string> {
    const session = this.sessionManager.get(sessionId);
    if (!session) throw new Error(`Session "${sessionId}" not found`);
    await this.disconnect(sessionId);
    const wsEndpoint = this.sessionManager.getWsEndpoint(sessionId);
    const browser = await chromium.connect(wsEndpoint);
    const state = JSON.parse(stateJson);
    const context = await browser.newContext({ storageState: state });
    const page = await context.newPage();
    this.browsers.set(sessionId, browser);
    this.contexts.set(sessionId, context);
    this.pages.set(sessionId, page);

    this.attachPageListeners(sessionId, page);
    context.on('page', (newPage: Page) => {
      this.attachPageListeners(sessionId, newPage);
    });

    return 'Auth loaded from database';
  }

  async getCurrentUrl(sessionId: string): Promise<string> {
    const page = this.getPage(sessionId);
    return page.url();
  }

  async getPages(sessionId: string): Promise<Array<{ index: number; url: string; title: string }>> {
    const context = this.getContext(sessionId);
    const pages = context.pages();
    return Promise.all(
      pages.map(async (p, i) => ({
        index: i,
        url: p.url(),
        title: await p.title().catch(() => ''),
      })),
    );
  }

  async switchTab(sessionId: string, index: number): Promise<string> {
    const context = this.getContext(sessionId);
    const pages = context.pages();
    if (index < 0 || index >= pages.length) {
      throw new Error(`Tab index ${index} out of range (${pages.length} tabs)`);
    }
    const page = pages[index];
    await page.bringToFront();
    this.pages.set(sessionId, page);
    return `Switched to tab ${index}: ${page.url()}`;
  }

  async closeTab(sessionId: string, index: number): Promise<string> {
    const context = this.getContext(sessionId);
    const pages = context.pages();
    if (pages.length <= 1) {
      throw new Error('Cannot close the last tab');
    }
    if (index < 0 || index >= pages.length) {
      throw new Error(`Tab index ${index} out of range (${pages.length} tabs)`);
    }
    const page = pages[index];
    const url = page.url();
    const activePage = this.pages.get(sessionId);
    await page.close();

    if (page === activePage) {
      const remaining = context.pages();
      const newActive = remaining[Math.min(index, remaining.length - 1)];
      this.pages.set(sessionId, newActive);
    }

    return `Closed tab ${index}: ${url}`;
  }

  async waitForNetworkRequest(sessionId: string, urlPattern: string, timeout: number = 30000): Promise<{ url: string; method: string; status: number | null }> {
    const page = this.getPage(sessionId);
    const request = await page.waitForRequest(
      (req) => req.url().includes(urlPattern),
      { timeout },
    );
    const response = await request.response().catch(() => null);
    return {
      url: request.url(),
      method: request.method(),
      status: response?.status() ?? null,
    };
  }
}
