import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { ScreencastRelay } from '../src/screencast-relay.js';

function createMockPage() {
  const cdpSession = Object.assign(new EventEmitter(), {
    send: vi.fn().mockResolvedValue(undefined),
    detach: vi.fn().mockResolvedValue(undefined),
  });
  const page = {
    context: () => ({
      newCDPSession: vi.fn().mockResolvedValue(cdpSession),
    }),
  };
  return { page, cdpSession };
}

describe('ScreencastRelay', () => {
  let relay: ScreencastRelay;

  beforeEach(() => {
    relay = new ScreencastRelay(19200);
  });

  afterEach(async () => {
    await relay.stopAll();
  });

  it('starts screencast and returns port', async () => {
    const { page, cdpSession } = createMockPage();
    const port = await relay.start('test1', page as any);
    expect(port).toBe(19200);
    expect(relay.isActive('test1')).toBe(true);
    expect(cdpSession.send).toHaveBeenCalledWith('Page.startScreencast', {
      format: 'jpeg',
      quality: 60,
      maxWidth: 1280,
      maxHeight: 720,
      everyNthFrame: 1,
    });
  });

  it('allocates sequential ports for multiple sessions', async () => {
    const { page: p1 } = createMockPage();
    const { page: p2 } = createMockPage();
    expect(await relay.start('s1', p1 as any)).toBe(19200);
    expect(await relay.start('s2', p2 as any)).toBe(19201);
  });

  it('rejects duplicate session id', async () => {
    const { page } = createMockPage();
    await relay.start('test1', page as any);
    await expect(relay.start('test1', page as any)).rejects.toThrow('already active');
  });

  it('broadcasts CDP frames to WS clients as binary', async () => {
    const { page, cdpSession } = createMockPage();
    const port = await relay.start('test1', page as any);

    const client = new WebSocket(`ws://localhost:${port}`);
    await new Promise<void>((resolve) => client.on('open', resolve));

    const framePromise = new Promise<Buffer>((resolve) => {
      client.on('message', (data: Buffer) => resolve(data));
    });

    const jpegBytes = Buffer.from('fake-jpeg-data');
    cdpSession.emit('Page.screencastFrame', {
      data: jpegBytes.toString('base64'),
      sessionId: 1,
    });

    const received = await framePromise;
    expect(received.toString()).toBe('fake-jpeg-data');
    expect(cdpSession.send).toHaveBeenCalledWith('Page.screencastFrameAck', { sessionId: 1 });
    client.close();
  });

  it('stops screencast and cleans up', async () => {
    const { page, cdpSession } = createMockPage();
    await relay.start('test1', page as any);
    expect(relay.isActive('test1')).toBe(true);

    await relay.stop('test1');
    expect(relay.isActive('test1')).toBe(false);
    expect(relay.getPort('test1')).toBeUndefined();
    expect(cdpSession.send).toHaveBeenCalledWith('Page.stopScreencast');
    expect(cdpSession.detach).toHaveBeenCalled();
  });

  it('getPort returns port for active session', async () => {
    const { page } = createMockPage();
    await relay.start('test1', page as any);
    expect(relay.getPort('test1')).toBe(19200);
    expect(relay.getPort('nonexistent')).toBeUndefined();
  });

  it('stopAll cleans up all sessions', async () => {
    const { page: p1 } = createMockPage();
    const { page: p2 } = createMockPage();
    await relay.start('s1', p1 as any);
    await relay.start('s2', p2 as any);
    await relay.stopAll();
    expect(relay.isActive('s1')).toBe(false);
    expect(relay.isActive('s2')).toBe(false);
  });

  it('stop on nonexistent session is no-op', async () => {
    await expect(relay.stop('nonexistent')).resolves.toBeUndefined();
  });
});
