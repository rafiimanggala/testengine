# TestEngine

Self-hosted MCP server for isolated parallel web testing. Each session runs in its own Docker container with Playwright, so multiple projects can be tested simultaneously without interference.

## Features

- **Isolated sessions** -- each browser runs in its own Docker container
- **27 MCP tools** -- session, browser, auth, pool, debug, and tab management
- **Container pool** -- pre-warm containers for instant session creation (<1s)
- **Health monitoring** -- automatic memory/uptime/idle checks with auto-recycle
- **Auth persistence** -- save/load cookies + localStorage across sessions (SQLite)
- **Console & network capture** -- debug client-side errors and API calls
- **Tab management** -- list, switch, and close browser tabs
- **Live viewer** -- optional SwiftUI viewer with CDP screencast (macOS)

## Requirements

- macOS (ARM64) or Linux
- Docker Desktop (12GB+ VM memory recommended)
- Node.js 20+

## Setup

```bash
# Clone
git clone https://github.com/rafiimanggala/testengine.git
cd testengine

# Build Docker image + install deps
npm install
npm run docker:build

# Build MCP server
npm run build
```

## Claude Code Integration

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "testengine": {
      "command": "node",
      "args": ["/path/to/testengine/dist/server.js"]
    }
  }
}
```

Restart Claude Code. Tools available as `mcp__testengine__*`.

## Tools (27)

### Session Management (7)

| Tool | Description |
|------|-------------|
| `session_create` | Create isolated browser session in Docker container |
| `session_destroy` | Destroy session and its container |
| `session_list` | List all active sessions |
| `session_summary` | AI-friendly summary: URL, action count, last action |
| `profile_save` | Save project profile (URL + auth + viewport) |
| `profile_list` | List saved profiles |
| `profile_delete` | Delete a profile |

### Browser Actions (8)

| Tool | Description |
|------|-------------|
| `navigate` | Navigate to URL |
| `click` | Click element by CSS selector |
| `type` | Type text into input field |
| `screenshot` | Take JPEG screenshot |
| `get_text` | Get text content (element or full page) |
| `wait_for` | Wait for element to appear |
| `evaluate` | Execute JavaScript in page context |
| `fill_form` | Fill multiple form fields at once |

### Auth (2)

| Tool | Description |
|------|-------------|
| `session_auth_save` | Save cookies + localStorage to database |
| `session_auth_load` | Load saved auth into session |

### Pool & Health (4)

| Tool | Description |
|------|-------------|
| `pool_set` | Set pre-warm pool size (0-5 containers) |
| `pool_status` | Show pool status: warm, active, target |
| `session_health` | Check container health: memory, uptime |
| `session_recycle` | Recycle container preserving auth state |

### Debug (3)

| Tool | Description |
|------|-------------|
| `console_log` | Get JS console messages (log/warn/error/info) |
| `get_network_log` | Get HTTP request/response pairs (last 100) |
| `wait_for_request` | Wait for network request matching URL pattern |

### Tab Management (3)

| Tool | Description |
|------|-------------|
| `session_tabs` | List all open tabs with URL and title |
| `session_tab_switch` | Switch to tab by index |
| `session_tab_close` | Close tab by index |

## Architecture

```
Claude Code  <--stdio-->  MCP Server  <--CDP/Playwright-->  Docker Containers
                              |                                  (1 per session)
                           SQLite DB
                         (auth, actions,
                          profiles)
```

- **MCP Server** (`src/server.ts`) -- thin orchestrator with handler registry
- **BrowserBridge** -- manages Playwright connections per session
- **ContainerPool** -- pre-warms Docker containers for fast acquisition
- **HealthMonitor** -- periodic checks, auto-recycle on memory/uptime limits
- **CommandQueue** -- per-session async queue preventing race conditions
- **ConsoleCollector / NetworkCollector** -- ring buffers for debug data
- **Database** -- SQLite (WAL mode) for auth, actions, profiles

## Development

```bash
npm run dev          # Watch mode (tsc)
npm test             # Run tests (vitest)
npm run viewer:build # Build SwiftUI viewer (macOS only)
```

## Resource Usage

- ~225 MB RAM per session
- ~251 MB fixed cost (Docker VM overhead)
- Docker image: ~2.1 GB (ARM64, Chromium + Playwright)

## License

MIT
