// src/handlers/types.ts
import type { SessionManager } from '../session-manager.js';
import type { BrowserBridge } from '../browser-bridge.js';
import type { CommandQueue } from '../command-queue.js';
import type { HealthMonitor } from '../health-monitor.js';
import type { ActionTracker } from '../action-tracker.js';
import type { Database } from '../database.js';
import type { ScreencastRelay } from '../screencast-relay.js';
import type { ChildProcess } from 'child_process';

export interface HandlerContext {
  sessionManager: SessionManager;
  browserBridge: BrowserBridge;
  commandQueue: CommandQueue;
  healthMonitor: HealthMonitor;
  actionTracker: ActionTracker;
  database: Database;
  screencastRelay: ScreencastRelay;
  viewerProcesses: Map<string, ChildProcess>;
  viewerBinary: string;
  sessionIdRegex: RegExp;
}

export interface ToolContent {
  type: 'text' | 'image';
  text?: string;
  data?: string;
  mimeType?: string;
}

export interface ToolResult {
  [key: string]: unknown;
  content: ToolContent[];
  isError?: boolean;
}

export type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResult>;
