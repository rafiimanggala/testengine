import { WebSocketServer, WebSocket } from 'ws';
import { PortAllocator } from './port-allocator.js';
import type { Page, CDPSession } from 'playwright';

interface ScreencastSession {
  cdpSession: CDPSession;
  wsServer: WebSocketServer;
  port: number;
  clients: Set<WebSocket>;
}

export class ScreencastRelay {
  private portAllocator: PortAllocator;
  private sessions: Map<string, ScreencastSession> = new Map();

  constructor(basePort: number = 9200) {
    this.portAllocator = new PortAllocator(basePort);
  }

  async start(sessionId: string, page: Page): Promise<number> {
    if (this.sessions.has(sessionId)) {
      throw new Error(`Screencast already active for session "${sessionId}"`);
    }

    const port = this.portAllocator.allocate(sessionId);
    const cdpSession = await page.context().newCDPSession(page);
    const clients = new Set<WebSocket>();

    const wsServer = new WebSocketServer({ port });

    await new Promise<void>((resolve, reject) => {
      wsServer.on('listening', resolve);
      wsServer.on('error', reject);
    });

    wsServer.on('connection', (ws) => {
      clients.add(ws);
      ws.on('close', () => clients.delete(ws));
    });

    cdpSession.on('Page.screencastFrame', (params: { data: string; sessionId: number }) => {
      const buffer = Buffer.from(params.data, 'base64');
      for (const client of clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(buffer);
        }
      }
      cdpSession.send('Page.screencastFrameAck', { sessionId: params.sessionId }).catch(() => {});
    });

    await cdpSession.send('Page.startScreencast', {
      format: 'jpeg',
      quality: 60,
      maxWidth: 1280,
      maxHeight: 720,
      everyNthFrame: 1,
    });

    this.sessions.set(sessionId, { cdpSession, wsServer, port, clients });
    return port;
  }

  async stop(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    try {
      await session.cdpSession.send('Page.stopScreencast');
    } catch { /* CDP may already be closed */ }

    try {
      await session.cdpSession.detach();
    } catch { /* already detached */ }

    for (const client of session.clients) {
      client.close();
    }
    session.clients.clear();

    await new Promise<void>((resolve) => {
      session.wsServer.close(() => resolve());
    });

    this.portAllocator.release(sessionId);
    this.sessions.delete(sessionId);
  }

  async stopAll(): Promise<void> {
    const ids = Array.from(this.sessions.keys());
    await Promise.all(ids.map((id) => this.stop(id)));
  }

  getPort(sessionId: string): number | undefined {
    return this.sessions.get(sessionId)?.port;
  }

  isActive(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }
}
