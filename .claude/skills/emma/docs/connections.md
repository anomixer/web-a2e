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
                  │ HTTP/SSE (multiple simultaneous connections)
┌─────────────────▼───────────────────────────────────────────┐
│  web-a2e Emulator (Browser Tabs)                             │
│  - Each tab runs AgentManager, connects via EventSource      │
│  - Assigned a unique name from the name pool                 │
│  - One tab is designated as the default for tool routing     │
└─────────────────────────────────────────────────────────────┘
```

## App Connection Behavior (web-a2e)

### Version Compatibility Check

**Required Minimum Version:** `1.2.0`

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
const minVersion = "1.2.0"; // Change this value

// Also update in agent-version-tools.js checkAgentCompatibility()
const { minVersion = "1.2.0" } = args; // Change default here
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
  // Abort reconnection
  agentManager.disconnect(); // Clears timeout, resets state
  // Don't auto-connect - let user click again
} else {
  // Connect fresh
  agentManager.connect();
}
```

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
The `disconnect()` method fully resets reconnection state:
```javascript
disconnect() {
  // Send intentional disconnect signal to server
  await this._sendDisconnectSignal("intentional");

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

  // Reset reconnection state
  this.reconnectAttempts = 0;
  this.reconnectStartTime = null;
  this._triedNames.clear();
}
```

## Multi-Emulator Support

Multiple browser tabs can connect simultaneously. Each is assigned a unique name and one is designated as the default routing target.

### Name Assignment

**Implementation:** `src/js/agent/agent-manager.js` - `connect()`, `_handleConnectAck()`

**Name pool:** `src/js/agent/emulator-names-list.js` — a list of Apple II-themed names (Merlin, Wozulator, Beagle, etc.)

**Resolution order:**
1. Use `preferredName` argument if provided
2. Use name stored in `sessionStorage` (if not already tried this session)
3. Pick randomly from untried names in the pool

**CONNECT_ACK flow:**
- Server sends `{ type: "CONNECT_ACK", accepted: true/false, name, isDefault }`
- If accepted: persist name and `isDefault` to `sessionStorage`
- If rejected (`name_taken`): add to `_triedNames`, retry with a new name

**Reconnect with same name:**
- If the tab has a name in `sessionStorage`, it attempts that name first
- Server accepts it if the existing entry is `disconnected` (stale entry cleared and replaced)
- Server rejects it only if another tab is actively connected with that name

### Default Routing

**Implementation:** `src/http-server.js` - `resolveEmulator()`

**Auto-assign default on connect:**
- First emulator to connect when no default exists becomes the default
- Condition: `!hasDefault && (wasDefault || connectedCount === 0)`
- `wasDefault` is passed as a query param from sessionStorage on reconnect

**wasDefault yield behavior:**
- If a tab reconnects with `wasDefault=true` but another default already exists → yields (does NOT steal)
- Only reclaims default if the slot is free (`!hasDefault`)

**Routing rules (no `emulator` param):**
| Scenario | Result |
|----------|--------|
| 0 connected | Error: "No emulators are connected." |
| 1 connected | Route to it (regardless of default flag) |
| 2+ connected, default set | Route to default |
| 2+ connected, no default | Error: prompt to pick |

**Routing rules (with `emulator` param):**
| Scenario | Result |
|----------|--------|
| `emulator: "Name"` | Route to that specific emulator |
| `emulator: "all"` | Broadcast to all connected |
| Named emulator broken | Error: prompt to wait, switch, or abort |
| Named emulator not found | Error: list connected names |

### Disconnect Rules

**Implementation:** `src/http-server.js` - `_handleDisconnected()`, `_handleBroken()`

**Clean disconnect (button click):**
1. Browser POSTs to `/disconnect?name=X&type=intentional`
2. Server sets entry state to `disconnected`, `isDefault = false`
3. Applies fallback rules (see below)
4. Entry stays in registry (reconnect can reuse the name)

**Tab close (beacon):**
1. Browser fires `navigator.sendBeacon` to `/disconnect?name=X&type=unload`
2. Server **removes** the entry entirely from the registry
3. No fallback needed (entry gone)

**Broken connection (SSE stream drops unexpectedly):**
1. Server detects stream close without a disconnect signal
2. Sets entry state to `broken`, `isDefault` unchanged
3. Routing to a broken emulator returns a prompt error

**Default fallback rules (on clean disconnect or broken→disconnect):**
| Remaining connected | Action |
|---------------------|--------|
| 0 | No action — routing will error naturally |
| 1 | Auto-promote to default; queue `_note` for Claude |
| 2+ | No auto-promote — routing returns `noDefault` error |

### Context Injection

**Implementation:** `src/tools/emma-command.js`, `src/tools/routing-helpers.js`

When a successful tool call completes and there are pending context notes, the `_note` field is appended to the response:

```json
{
  "success": true,
  "result": { ... },
  "_note": "\"Merlin\" disconnected. \"Wozulator\" is now the default emulator."
}
```

**Only queued for auto-promotion** (routing still works but Claude's mental model is stale). Other events (no default, broken connection) are handled by routing errors and don't need a separate note.

**Queue lifecycle:** Notes accumulate between tool calls. The queue is drained and cleared on the next successful routed tool call.

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

The `externallyShutdown` flag is **informational only** (does NOT block starting):

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
       ├─── Version < 1.2.0 ───► Show "Agent out of date" dialog
       │                          └─► Block connection (return)
       │
       └─── Version >= 1.2.0 ──┐
                                │
       ┌────────────────────────┘
       ▼
┌─────────────────────────────────────────────────┐
│ Create EventSource /events?name=X&wasDefault=Y  │
│ (SSE connection established)                     │
└──────┬──────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│ Await CONNECT_ACK               │
└──────┬──────────────────────────┘
       │
       ├─── accepted: false (name_taken) ───► Retry with new name from pool
       │
       └─── accepted: true ──┐
                              │
       ┌──────────────────────┘
       ▼
┌─────────────────────────────────┐
│ Persist name + isDefault to     │
│ sessionStorage                  │
│ Connected (yellow sparkle)      │
└─────────────────────────────────┘
```

### Disconnect Flow

```
┌─────────────────────────────────┐
│ User clicks Disconnect          │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│ POST /disconnect?type=intentional│
│ Server: state = "disconnected"  │
│ isDefault = false               │
└──────┬──────────────────────────┘
       │
       ├─── was default + 1 remaining ───► Auto-promote, queue _note
       ├─── was default + 2+ remaining ──► No auto-promote, noDefault error on next route
       └─── was not default ─────────────► Silent

┌─────────────────────────────────┐
│ Tab closed (no button click)    │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│ sendBeacon /disconnect?type=unload│
│ Server: entry REMOVED entirely  │
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
  - `connect()` - Name resolution, version check, EventSource creation
  - `disconnect()` - Sends disconnect signal, cleanup and state reset
  - `_handleConnectAck()` - Accept/reject name, persist to sessionStorage
  - `_retryWithNewName()` - Pick new name from pool on rejection
  - `_checkVersionCompatibility()` - Version checking
  - `_sendDisconnectSignal()` - POST to /disconnect before closing stream
  - `_scheduleReconnect()` - Reconnection logic

- **`src/js/agent/emulator-names-list.js`**
  - Pool of Apple II-themed emulator names

- **`src/js/ui/ui-controller.js`**
  - Sparkle button click handler (3 states)
  - `updateButtonState()` - Visual state management

- **`src/js/agent/agent-version-tools.js`**
  - `checkAgentCompatibility` - Tool for checking version
  - `getAgentVersion` - Tool for getting version info

### MCP Server (appleii-agent)

- **`src/http-server.js`**
  - `_handleEventStream()` - Name validation, accept/reject, default assignment
  - `_handleDisconnected()` - Fallback rules, auto-promotion, note queuing
  - `_handleBroken()` - Broken state (silent — routing error handles it)
  - `resolveEmulator()` - Routing logic (single, broadcast, default, noDefault, brokenTarget)
  - `consumeContextNotes()` - Drain and return queued notes
  - `start()` - Graceful port conflict handling
  - `stop(internal)` - Shutdown with external flag
  - `/disconnect` endpoint - Clean and unload disconnect handler
  - `/shutdown` endpoint - External shutdown handler

- **`src/tools/routing-helpers.js`**
  - `checkResolution()` - Convert routing result to error/prompt response
  - `sendAppToolCall()` - Send tool call to emulator, attach `_note` on success

- **`src/tools/emma-command.js`**
  - Main tool call handler, attaches `_note` from context notes queue

- **`src/tools/list-connections.js`**
  - Returns all emulator records with name, state, isDefault

- **`src/tools/set-default-emulator.js`**
  - Manually override which emulator is default

- **`src/tools/server-control.js`**
  - `start`, `stop`, `restart`, `status` actions

- **`src/tools/shutdown-remote-server.js`**
  - Remote instance shutdown

## Design Decisions

### Why Block Incompatible Connections?

**Decision:** Show "Agent out of date" dialog and prevent connection if version < 1.2.0

**Rationale:**
- Prevents confusing errors from missing features
- Clear user guidance to update agent
- Simpler than feature detection for each tool

### Why Allow Aborting Reconnection?

**Decision:** Clicking sparkle during reconnection aborts attempts and resets to disconnected

**Rationale:**
- User control over connection state
- Prevents racing reconnection timers
- Allows manual retry with clean state

### Why Allow Port Reclamation Without MCP Restart?

**Decision:** Remove `externallyShutdown` blocking behavior, make it informational only

**Rationale:**
- Enables coordination between multiple MCP instances
- Avoids forcing users to restart Claude Code

### Why Multi-Emulator Instead of Single-Client?

**Decision:** Multiple tabs can connect simultaneously, each with a unique name and one designated default

**Rationale:**
- Enables working across multiple emulator configurations simultaneously
- Claude can target specific emulators by name or broadcast to all
- Default routing keeps single-emulator workflows simple

**Routing precedence:** explicit name > default > single-connected > error

### Why `wasDefault` Yields Instead of Steals?

**Decision:** A reconnecting tab with `wasDefault=true` only reclaims default if no current default exists

**Rationale:**
- If another emulator was explicitly set as default while this tab was away, that choice should be respected
- Prevents surprising default switches mid-conversation

### Why Only Queue Notes for Auto-Promotion?

**Decision:** Context notes (`_note`) only appear for auto-promotion, not for all state changes

**Rationale:**
- Routing errors (noDefault, brokenTarget) already explain the situation at point of use
- Non-default disconnects don't affect routing
- Auto-promotion is the only case where routing succeeds but Claude's mental model is stale

### Why Remove Entry on Tab Close but Keep on Clean Disconnect?

**Decision:** `type=unload` (beacon) removes the entry; `type=intentional` (button click) keeps it as `disconnected`

**Rationale:**
- Tab close is permanent — the session is gone, name can be reused immediately
- Clean disconnect is temporary — the tab might reconnect and should reclaim its name
- Stale `disconnected` entries are cleared automatically when the same name reconnects

## Testing Scenarios

### Version Compatibility

1. Agent 1.2.0, Required 1.2.0 → ✅ Connect
2. Agent 1.3.0, Required 1.2.0 → ✅ Connect
3. Agent 1.1.0, Required 1.2.0 → ❌ Show dialog, block

### Multi-Emulator

1. Open tab A → ✅ Connects as default
2. Open tab B → ✅ Connects as non-default
3. Open tab C → ✅ Connects as non-default
4. Disconnect A (default, 1 remaining B) → ✅ B auto-promoted, `_note` on next tool call
5. Disconnect A (default, 2+ remaining) → ✅ No auto-promote, next route returns `noDefault` error
6. Reconnect A → ✅ Reclaims name "A", yields default to B (B is still default)
7. Close tab C (no button) → ✅ Entry removed entirely (beacon)

### Disconnect Rules

1. Click disconnect → ✅ State = `disconnected`, signal POSTed
2. Close tab → ✅ Entry removed (beacon)
3. SSE stream drops → ✅ State = `broken`, routing error on next attempt

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

### Tab reconnects with wrong name

**Cause:** Previous name was rejected (another tab is actively using it)
**Fix:** Expected behavior — the tab picks a new name from the pool. If the previous name was just `disconnected`, it should reconnect successfully.

## Version History

- **1.2.0** - Multi-emulator support: name pool, default routing, disconnect rules, context injection, `wasDefault` yield, same-name reconnect
- **1.0.2** - Added version compatibility checking
- **1.0.1** - Added port reclamation without MCP restart
- **1.0.0** - Initial connection architecture with reconnection and port conflict handling
