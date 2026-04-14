import { chromium, Browser, Page, BrowserContext } from 'playwright';
import { SessionManager } from './session-manager.js';

export class BrowserBridge {
  private sessionManager: SessionManager;
  private browsers: Map<string, Browser> = new Map();
  private contexts: Map<string, BrowserContext> = new Map();
  private pages: Map<string, Page> = new Map();

  constructor(sessionManager: SessionManager) {
    this.sessionManager = sessionManager;
  }

  async connect(sessionId: string, maxRetries: number = 10): Promise<void> {
    const wsEndpoint = this.sessionManager.getWsEndpoint(sessionId);

    let lastError: Error | null = null;
    for (let i = 0; i < maxRetries; i++) {
      try {
        const browser = await chromium.connect(wsEndpoint);
        const context = await browser.newContext();
        const page = await context.newPage();

        this.browsers.set(sessionId, browser);
        this.contexts.set(sessionId, context);
        this.pages.set(sessionId, page);

        this.sessionManager.setStatus(sessionId, 'running');
        return;
      } catch (err) {
        lastError = err as Error;
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

  async saveAuth(sessionId: string, filePath: string): Promise<string> {
    const context = this.getContext(sessionId);
    await context.storageState({ path: filePath });
    return `Auth saved to ${filePath}`;
  }

  async loadAuth(sessionId: string, filePath: string): Promise<string> {
    const session = this.sessionManager.get(sessionId);
    if (!session) throw new Error(`Session "${sessionId}" not found`);

    await this.disconnect(sessionId);

    const wsEndpoint = this.sessionManager.getWsEndpoint(sessionId);
    const browser = await chromium.connect(wsEndpoint);
    const context = await browser.newContext({ storageState: filePath });
    const page = await context.newPage();

    this.browsers.set(sessionId, browser);
    this.contexts.set(sessionId, context);
    this.pages.set(sessionId, page);

    return `Auth loaded from ${filePath}`;
  }

  async getCurrentUrl(sessionId: string): Promise<string> {
    const page = this.getPage(sessionId);
    return page.url();
  }
}
