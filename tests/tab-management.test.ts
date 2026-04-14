import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserBridge } from '../src/browser-bridge.js';

const { mockPage1, mockPage2, mockContext, mockBrowser } = vi.hoisted(() => {
  const mockPage1 = {
    url: vi.fn().mockReturnValue('https://example.com'),
    title: vi.fn().mockResolvedValue('Example'),
    bringToFront: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    goto: vi.fn().mockResolvedValue({ status: () => 200 }),
  };

  const mockPage2 = {
    url: vi.fn().mockReturnValue('https://other.com'),
    title: vi.fn().mockResolvedValue('Other'),
    bringToFront: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
  };

  const mockContext = {
    newPage: vi.fn().mockResolvedValue(mockPage1),
    pages: vi.fn().mockReturnValue([mockPage1, mockPage2]),
    storageState: vi.fn().mockResolvedValue({ cookies: [], origins: [] }),
    on: vi.fn(),
  };

  const mockBrowser = {
    newContext: vi.fn().mockResolvedValue(mockContext),
    close: vi.fn().mockResolvedValue(undefined),
  };

  return { mockPage1, mockPage2, mockContext, mockBrowser };
});

const { chromium: mockChromium } = vi.hoisted(() => {
  const chromium = {
    connect: vi.fn().mockResolvedValue(mockBrowser),
  };
  return { chromium };
});

vi.mock('playwright', () => ({
  chromium: mockChromium,
}));

const mockSessionManager = {
  getWsEndpoint: vi.fn().mockReturnValue('ws://localhost:9100/ws'),
  setStatus: vi.fn(),
  get: vi.fn().mockReturnValue({ id: 's1', url: 'https://example.com', mode: 'headless', port: 9100, containerId: 'c1', status: 'running', createdAt: new Date() }),
};

describe('BrowserBridge tab management', () => {
  let bridge: BrowserBridge;

  beforeEach(async () => {
    vi.resetAllMocks();
    // Re-set default return values after resetAllMocks
    mockPage1.url.mockReturnValue('https://example.com');
    mockPage1.title.mockResolvedValue('Example');
    mockPage1.bringToFront.mockResolvedValue(undefined);
    mockPage1.close.mockResolvedValue(undefined);
    mockPage1.goto.mockResolvedValue({ status: () => 200 });
    mockPage2.url.mockReturnValue('https://other.com');
    mockPage2.title.mockResolvedValue('Other');
    mockPage2.bringToFront.mockResolvedValue(undefined);
    mockPage2.close.mockResolvedValue(undefined);
    mockContext.newPage.mockResolvedValue(mockPage1);
    mockContext.pages.mockReturnValue([mockPage1, mockPage2]);
    mockContext.storageState.mockResolvedValue({ cookies: [], origins: [] });
    mockContext.on.mockImplementation(() => {});
    mockBrowser.newContext.mockResolvedValue(mockContext);
    mockBrowser.close.mockResolvedValue(undefined);
    mockSessionManager.getWsEndpoint.mockReturnValue('ws://localhost:9100/ws');
    mockSessionManager.setStatus.mockImplementation(() => {});
    mockSessionManager.get.mockReturnValue({ id: 's1', url: 'https://example.com', mode: 'headless', port: 9100, containerId: 'c1', status: 'running', createdAt: new Date() });
    mockChromium.connect.mockResolvedValue(mockBrowser);

    bridge = new BrowserBridge(mockSessionManager as any);
    await bridge.connect('s1');
  });

  it('lists all tabs', async () => {
    const tabs = await bridge.getPages('s1');
    expect(tabs).toHaveLength(2);
    expect(tabs[0]).toEqual({ index: 0, url: 'https://example.com', title: 'Example' });
    expect(tabs[1]).toEqual({ index: 1, url: 'https://other.com', title: 'Other' });
  });

  it('switches active tab', async () => {
    const result = await bridge.switchTab('s1', 1);
    expect(mockPage2.bringToFront).toHaveBeenCalled();
    expect(result).toContain('Switched to tab 1');
  });

  it('rejects out-of-range tab index', async () => {
    await expect(bridge.switchTab('s1', 5)).rejects.toThrow('out of range');
  });

  it('closes a tab', async () => {
    mockContext.pages
      .mockReturnValueOnce([mockPage1, mockPage2])  // for length check
      .mockReturnValueOnce([mockPage1, mockPage2])  // for index access
      .mockReturnValueOnce([mockPage1]);             // after close, remaining
    const result = await bridge.closeTab('s1', 1);
    expect(mockPage2.close).toHaveBeenCalled();
    expect(result).toContain('Closed tab 1');
  });

  it('rejects closing last tab', async () => {
    mockContext.pages.mockReturnValue([mockPage1]);
    await expect(bridge.closeTab('s1', 0)).rejects.toThrow('Cannot close the last tab');
  });
});
