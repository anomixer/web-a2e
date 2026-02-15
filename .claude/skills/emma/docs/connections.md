# Agent Connection Architecture

This document describes the connection behaviors between the Apple //e emulator app (web-a2e) and the MCP agent server (appleii-agent).

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  Claude Code / MCP Client                                    │
│  - Communicates with appleii-agent via stdio (MCP protocol) │
└─────────────────┬───────────────────────────────────────────┘
                  │ MCP (stdio)
┌─────────────────▼───────────────────────────────────────────┐
│  appleii-agent MCP Server                                    │
│  - Node.js process                                           │
│  - HTTP/HTTPS server on port 3033                            │
│  - AG-UI protocol (Server-Sent Events)                       │
└─────────────────┬───────────────────────────────────────────┘
                  │ HTTP/SSE
┌─────────────────▼───────────────────────────────────────────┐
│  web-a2e Emulator (Browser)                                  │
│  - AgentManager connects via EventSource (SSE)               │
│  - Executes tool calls from agent                            │
│  - Returns results via HTTP POST                             │
└─────────────────────────────────────────────────────────────┘
```

## App Connection Behavior (web-a2e)

### Version Compatibility Check

**Required Minimum Version:** `1.0.2` (configurable)

**Implementation:** `src/js/agent/agent-manager.js` - `_checkVersionCompatibility()`

When connecting, the app checks the agent version:
1. Calls MCP tool `get_version` to retrieve agent version
2. Parses semantic version (major.minor.patch) into numeric parts
3. Compares agent version to minimum required version
4. If incompatible:
   - Shows dialog: "Agent out of date. Please update the Agent to latest version to continue."
   - **Blocks connection** (no option to bypass)
   - Logs warning to console
5. If compatible:
   - Proceeds with connection
   - Logs success to console

**Version Comparison Logic:**
- Compares major, then minor, then patch numerically
- `comparison < 0` = agent is older (incompatible)
- `comparison === 0` = exact match (compatible)
- `comparison > 0` = agent is newer (compatible)

**Update Minimum Version:**
```javascript
// In agent-manager.js _checkVersionCompatibility()
const minVersion = "1.0.2"; // Change this value

// Also update in agent-version-tools.js checkAgentCompatibility()
const { minVersion = "1.0.2" } = args; // Change default here
```

### Connection States

The emulator has three connection states:

1. **Disconnected** (gray sparkle)
   - Server available but not connected
   - Button title: "Connect to Agent"
   - Click → Attempts connection

2. **Connected** (yellow sparkle)
   - EventSource.readyState === OPEN
   - Button title: "Disconnect"
   - Click → Disconnects cleanly

3. **Reconnecting** (red/severed sparkle)
   - Connection lost, attempting to reconnect
   - Button title: "Connection lost - Click to abort reconnection"
   - Click → **Aborts reconnection**, resets to disconnected state
   - User can then click again to retry manually

### Sparkle Button Behavior

**Implementation:** `src/js/ui/ui-controller.js` - button click handler

```javascript
// Three distinct behaviors based on state:
if (connected) {
  // Disconnect
  agentManager.disconnect();
  agentManager.startHeartbeatPolling();
} else if (reconnecting) {
  // Abort reconnection (NEW BEHAVIOR)
  agentManager.disconnect(); // Clears timeout, resets state
  // Don't auto-connect - let user click again
} else {
  // Connect fresh
  agentManager.connect();
}
```

**Key Fix:** When in reconnecting state, clicking aborts all pending reconnection attempts and resets state cleanly, preventing racing reconnection timers.

### Reconnection Logic

**Implementation:** `src/js/agent/agent-manager.js` - `_scheduleReconnect()`

**Parameters:**
- `maxReconnectAttempts`: 36 attempts
- `reconnectDelay`: 5000ms (5 seconds)
- `maxReconnectDuration`: 180000ms (3 minutes)

**Behavior:**
1. Connection error triggers reconnection window
2. Attempts reconnect every 5 seconds for up to 3 minutes
3. If window expires:
   - Stops reconnecting
   - Hides sparkle button
   - Resumes heartbeat polling (checks every 15s for server availability)
4. When server becomes available again:
   - Shows sparkle button
   - User can manually connect

**Disconnect Cleanup:**
The `disconnect()` method now fully resets reconnection state:
```javascript
disconnect() {
  // Close EventSource
  if (this.eventSource) {
    this.eventSource.close();
    this.eventSource = null;
  }

  // Clear reconnection timeout
  if (this.reconnectTimeout) {
    clearTimeout(this.reconnectTimeout);
    this.reconnectTimeout = null;
  }

  // Reset reconnection state (CRITICAL FIX)
  this.reconnectAttempts = 0;
  this.reconnectStartTime = null;
}
```

### Connection Conflict Handling

**Implementation:** `src/js/agent/agent-manager.js` - `connect()`

Only one emulator can connect at a time. When attempting to connect while another client is connected:

1. HEAD request to `/events` endpoint returns **409 Conflict**
2. Shows dialog: "Another Apple //e Emulator Already Connected\n\nWould you like to disconnect the other client and connect?"
3. User choices:
   - **"Disconnect and Connect"**: Calls `disconnect_clients` MCP tool, then retries connection
   - **"Cancel"**: Aborts connection attempt

## MCP Server Connection Behavior (appleii-agent)

### MCP Client Configuration

The MCP server can be configured in `.mcp.json` (or `~/.claude/mcp.json` for global config) using different methods:

**Option 1: bunx (Recommended)**
```json
{
  "mcpServers": {
    "appleii-agent": {
      "type": "stdio",
      "command": "bunx",
      "args": ["-y", "@retrotech71/appleii-agent"]
    }
  }
}
```
- Runs the published npm package directly with Bun
- `-y` flag auto-installs without prompting
- No local installation required
- Always uses the latest published version

**Option 2: Local source (development)**
```json
{
  "mcpServers": {
    "appleii-agent": {
      "command": "node",
      "args": ["/absolute/path/to/appleii-agent/src/index.js"]
    }
  }
}
```
- For local development of the agent itself
- Must use absolute path, not relative
- Requires `npm install` in appleii-agent directory

**Switching configurations:**
1. Edit `.mcp.json` or `~/.claude/mcp.json`
2. Restart Claude Code (or MCP client) to apply changes
3. Kill any existing process on port 3033: `lsof -ti:3033 | xargs kill -9`

### Port Conflict Handling

**Implementation:** `src/http-server.js`, `src/tools/server-control.js`

The MCP server handles port conflicts gracefully without crashing.

**State Tracking:**
- `portInUse`: `true` if port 3033 is already in use by another instance
- `externallyShutdown`: `true` if server was shut down via `/shutdown` endpoint
- `running`: `true` if HTTP server is currently running

**Behavior on Startup:**

```javascript
// When port is already in use (EADDRINUSE):
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    this.portInUse = true;
    this.server = null;
    // Resolve instead of reject - keeps MCP alive
    resolve();
  }
});
```

The server **does not crash** - it resolves gracefully and sets `portInUse = true`.

**Starting After Port Conflict:**

The `externallyShutdown` flag is now **informational only** (does NOT block starting):

```javascript
async start() {
  // Log if restarting after external shutdown (informational)
  if (this.externallyShutdown && this.debug) {
    logger.log("[HTTP] Restarting after external shutdown");
  }

  // Proceed with starting...

  // On successful start - clear flags
  this.server.listen(this.port, () => {
    this.portInUse = false;
    this.externallyShutdown = false; // Reset flag
    resolve();
  });
}
```

### Port Reclamation Workflow

**MCP Tools:** `shutdown_remote_server`, `server_control`

To reclaim port 3033 from another instance:

```bash
# 1. Shutdown the other instance
shutdown_remote_server { port: 3033, useHttps: false }

# 2. Start this instance
server_control { action: "start" }
```

**No MCP restart required!** The instance can reclaim the port without restarting the Node.js process.

### Server Control Tool

**Implementation:** `src/tools/server-control.js`

**Actions:**

1. **`start`**
   - Starts HTTP server on port 3033
   - If port in use: Returns `portInUse: true` with helpful message
   - If successful: Returns `running: true`

2. **`stop`**
   - Stops HTTP server (internal stop)
   - Sets `externallyShutdown: false`
   - Can be restarted via `start` action

3. **`restart`**
   - Stops then starts HTTP server
   - If port in use after restart: Returns error

4. **`status`**
   - Returns current server state
   - Includes helpful messages based on state

### Shutdown Remote Server Tool

**Implementation:** `src/tools/shutdown-remote-server.js`

Sends POST request to `http://localhost:3033/shutdown` to gracefully shut down another instance.

**Parameters:**
- `port`: Port number (default: 3033)
- `useHttps`: Whether to use HTTPS (default: false)

**Responses:**
- **Success**: Returns `success: true` with shutdown confirmation
- **No server found**: Returns `success: false`, `error: "connection_refused"`
- **Timeout**: 5 second timeout for request

**Shutdown Endpoint Behavior:**

```javascript
// In http-server.js
if (req.method === "POST" && req.url === "/shutdown") {
  // Mark as external shutdown
  await this.stop(false); // false = external shutdown

  // this.externallyShutdown = true (set in stop())
}
```

## Connection Flow Diagrams

### App Connecting to Agent

```
┌─────────────┐
│ User clicks │
│   sparkle   │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────┐
│ Check agent version             │
│ (calls get_version MCP tool)    │
└──────┬──────────────────────────┘
       │
       ├─── Version < 1.0.2 ───► Show "Agent out of date" dialog
       │                          └─► Block connection (return)
       │
       └─── Version >= 1.0.2 ──┐
                                │
       ┌────────────────────────┘
       ▼
┌─────────────────────────────────┐
│ HEAD /events (check conflicts)  │
└──────┬──────────────────────────┘
       │
       ├─── 409 Conflict ───► Show "Another client connected" dialog
       │                      ├─► User chooses "Disconnect and Connect"
       │                      │   └─► Call disconnect_clients, retry
       │                      └─► User chooses "Cancel"
       │                          └─► Abort connection (return)
       │
       └─── 200 OK ──┐
                      │
       ┌──────────────┘
       ▼
┌─────────────────────────────────┐
│ Create EventSource /events      │
│ (SSE connection established)    │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│ Connected (yellow sparkle)      │
│ - Receive tool calls via SSE    │
│ - Execute and return results    │
└─────────────────────────────────┘
```

### Port Conflict Resolution

```
┌──────────────────┐
│ MCP instance A   │
│ (port 3033 free) │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Start HTTP       │
│ server           │
│ ✓ Success        │
│ running = true   │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ MCP instance B   │
│ starts           │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Attempt start    │
│ EADDRINUSE       │
│ portInUse = true │
│ running = false  │
└────────┬─────────┘
         │
         ▼
┌──────────────────────────────────┐
│ Agent calls:                     │
│ shutdown_remote_server           │
│ (shuts down instance A)          │
└────────┬─────────────────────────┘
         │
         ▼
┌──────────────────────────────────┐
│ Agent calls:                     │
│ server_control { action: start } │
└────────┬─────────────────────────┘
         │
         ▼
┌──────────────────┐
│ Instance B       │
│ starts on 3033   │
│ ✓ Success        │
│ running = true   │
│ portInUse = false│
└──────────────────┘
```

## Key Implementation Files

### App (web-a2e)

- **`src/js/agent/agent-manager.js`**
  - `connect()` - Main connection logic with version check
  - `disconnect()` - Cleanup and state reset
  - `_checkVersionCompatibility()` - Version checking
  - `_showVersionIncompatibleDialog()` - Version error dialog
  - `_showConnectionConflictDialog()` - Conflict resolution dialog
  - `_scheduleReconnect()` - Reconnection logic

- **`src/js/ui/ui-controller.js`**
  - Sparkle button click handler (3 states)
  - `updateButtonState()` - Visual state management

- **`src/js/agent/agent-version-tools.js`**
  - `checkAgentCompatibility` - Tool for checking version
  - `getAgentVersion` - Tool for getting version info
  - Version parsing and comparison utilities

### MCP Server (appleii-agent)

- **`src/http-server.js`**
  - `start()` - Graceful port conflict handling
  - `stop(internal)` - Shutdown with external flag
  - `/shutdown` endpoint - External shutdown handler
  - State: `portInUse`, `externallyShutdown`, `running`

- **`src/tools/server-control.js`**
  - `start`, `stop`, `restart`, `status` actions
  - Port conflict messages

- **`src/tools/shutdown-remote-server.js`**
  - Remote instance shutdown
  - Connection error handling

- **`src/index.js`**
  - Startup logic with status checking
  - Informational logging

## Design Decisions

### Why Block Incompatible Connections?

**Decision:** Show "Agent out of date" dialog and prevent connection if version < 1.0.2

**Rationale:**
- Prevents confusing errors from missing features
- Clear user guidance to update agent
- Simpler than feature detection for each tool

**Alternative considered:** Allow connection with warning
- Rejected: Too confusing, hard to debug which features don't work

### Why Allow Aborting Reconnection?

**Decision:** Clicking sparkle during reconnection aborts attempts and resets to disconnected

**Rationale:**
- User control over connection state
- Prevents racing reconnection timers
- Allows manual retry with clean state

**Previous behavior:** Clicking during reconnection would call `connect()` again
- Problem: Multiple reconnection timers running simultaneously
- Problem: Confusing state when reconnection already scheduled

### Why Allow Port Reclamation Without MCP Restart?

**Decision:** Remove `externallyShutdown` blocking behavior, make it informational only

**Rationale:**
- Enables coordination between multiple MCP instances
- Avoids forcing users to restart Claude Code
- Matches expectation: "reclaim port" should work immediately

**Previous behavior:** `externallyShutdown` permanently blocked starting
- Problem: Defeated the purpose of port reclamation feature
- Problem: Required MCP restart (exactly what we wanted to avoid)

### Why Single-Client Mode?

**Decision:** Only one emulator can connect to agent at a time (409 conflict)

**Rationale:**
- Tool calls are tied to single emulator instance state
- Prevents state confusion (which emulator to control?)
- Provides clear conflict resolution dialog

**Implementation:** HEAD request checks before EventSource creation

## Future Considerations

### Version Range Support

Currently supports minimum version only (`>= 1.0.2`). Could extend to:
- Maximum version (`< 2.0.0` for breaking changes)
- Feature flags instead of version numbers
- Dynamic compatibility based on available tools

### Multiple Client Support

Could support multiple emulators by:
- Adding client IDs to tool calls
- Routing tools to specific emulator instances
- More complex UI for selecting target emulator

### Automatic Agent Updates

Could add:
- Update notification in app
- Auto-update mechanism for agent
- Version compatibility matrix

## Testing Scenarios

### Version Compatibility

1. Agent 1.0.2, Required 1.0.2 → ✅ Connect
2. Agent 1.0.3, Required 1.0.2 → ✅ Connect
3. Agent 1.0.1, Required 1.0.2 → ❌ Show dialog, block
4. Agent 1.0.2, Required 1.0.5 → ❌ Show dialog, block

### Port Conflicts

1. Start instance A → ✅ Running
2. Start instance B → ✅ MCP alive, HTTP not running
3. Call `shutdown_remote_server` from B → ✅ A shuts down
4. Call `server_control start` from B → ✅ B takes over port

### Reconnection

1. Connect emulator → ✅ Yellow sparkle
2. Stop agent server → 🔴 Red sparkle, reconnecting
3. Click sparkle → ✅ Aborts, gray sparkle
4. Click sparkle again → ✅ Attempts fresh connection

### Connection Conflicts

1. Emulator A connects → ✅ Connected
2. Emulator B tries to connect → Dialog shown
3. User clicks "Disconnect and Connect" → ✅ A disconnects, B connects
4. User clicks "Cancel" → ✅ B stays disconnected, A remains connected

## Common Issues

### "Agent out of date" dialog when agent is current

**Cause:** Browser cache has old code with wrong minimum version
**Fix:** Hard refresh browser (Cmd+Shift+R / Ctrl+Shift+F5)

### Sparkle button hidden

**Cause:** Reconnection window expired (3 minutes), heartbeat polling not detecting server
**Fix:** Restart agent server, wait 15 seconds for heartbeat detection

### Port already in use, can't start

**Cause:** Another instance has port 3033
**Fix:** Use `shutdown_remote_server` tool first

### Connected but tools timeout

**Cause:** Browser and agent disconnected but state not updated
**Fix:** Disconnect and reconnect in emulator

## Version History

- **1.0.2** - Added version compatibility checking
- **1.0.1** - Added port reclamation without MCP restart
- **1.0.0** - Initial connection architecture with reconnection and port conflict handling
