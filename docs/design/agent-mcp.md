# Agent / MCP integration

Moved out of CLAUDE.md; this is the detail behind the rules summarised there.

## Agent / MCP Integration

The emulator exposes an AI agent interface via the Model Context Protocol (MCP) and AG-UI event protocol. This allows AI agents (including Claude Code) to fully control the emulator programmatically. Multiple emulator browser tabs can connect simultaneously, each identified by a unique name.

### Architecture

Two coordinated components:

- **MCP Server** (`../appleii-agent/`) — Node.js process providing MCP tools over stdio + an HTTP/HTTPS server (port 3033) implementing the AG-UI event protocol (SSE)
- **Frontend Agent Manager** (`src/js/agent/agent-manager.js`) — Browser-side AG-UI client that connects to the server, receives tool calls via SSE, executes them against the emulator, and returns results

### Multi-Emulator Support

Multiple browser tabs can connect simultaneously. Each tab is assigned a unique name from a name pool (stored in `sessionStorage` so it persists across server restarts within the same tab session).

**Routing**: Tools with an optional `emulator` param route as follows:
- `emulator: "Name"` — target specific emulator
- `emulator: "all"` — broadcast to all connected emulators (where supported)
- omitted + 1 connected — use it
- omitted + multiple connected — use the one marked as default
- omitted + multiple + no default — Claude is prompted to pick

**Default emulator**: First tab to connect becomes default. Change with `set_default_emulator`. Use `list_connections` to see all connected emulators and current default.

**Rename**: Double-click the emulator name label on the sparkle button (connected state only) to rename inline. Valid names: Unicode letters, hyphens, underscores — no numbers or spaces. Rename POSTs to `/emulator-rename` on the MCP server and persists the new name to `sessionStorage`.

### Configuration

- `.mcp.json` (repo root) — MCP client config for running the agent
  - Recommended: `bunx -y @retrotech71/appleii-agent` (auto-installs with Bun)
  - Development: `node /path/to/appleii-agent/src/index.js` (local source)
- Environment variables: `PORT` (default 3033), `HTTPS=true` for TLS mode, `APPLEII_AGENT_SANDBOX` (path to sandbox config — required for all file operations)

### Sandbox Configuration

All MCP file operations (loading/saving disk images, BASIC programs, assembly files) are gated by a sandbox config. Without it the agent starts but file access is completely blocked.

**Config file format** (`~/.appleii/sandbox.config`):
```
# Lines starting with # are comments
[key]@/path/to/directory
```
- Key: alphanumeric, underscores, hyphens only
- Path: absolute or `~`-prefixed home-relative

**Wire it up in `.mcp.json`:**
```json
"env": { "APPLEII_AGENT_SANDBOX": "/path/to/sandbox.config" }
```

**Sandbox path syntax in tool calls:** `[key]/relative/path/file`

**Tools that accept sandbox paths:** `load_disk_image`, `load_smartport_image`, `load_file`, `save_to`

**Reload without restarting:** call `reload_sandbox` after editing the config file — no Claude Code restart needed.

Security: path traversal (`../`) and full paths outside all configured directories are blocked. Save tools default to `overwrite: false`.

### MCP Server Tools (`../appleii-agent/src/tools/`)

**Server / Connection**

| Tool | Description |
| ---- | ----------- |
| `server_control` | Start/stop/restart the agent server |
| `set_https` | Enable/disable HTTPS mode |
| `set_debug` | Set debug logging level |
| `get_state` | Return current server + emulator state |
| `get_version` | Agent version info |
| `reload_sandbox` | Reload sandbox.config without restart |
| `disconnect_clients` | Disconnect all SSE clients |
| `shutdown_remote_server` | Shut down another instance on the same port |

**Multi-Emulator**

| Tool | Description |
| ---- | ----------- |
| `list_connections` | List all connected emulators with name, state, isDefault |
| `set_default_emulator` | Set which emulator receives tool calls by default |

**Generic Command**

| Tool | Description |
| ---- | ----------- |
| `emma_command` | Delegate to any frontend app tool via AG-UI. Has optional `emulator` param for routing |

**File Operations — Load Into Emulator**

| Tool | Description |
| ---- | ----------- |
| `load_disk_image` | Load a disk image (.dsk/.do/.po/.nib/.woz) from filesystem → base64 |
| `load_smartport_image` | Load a SmartPort hard drive image (.hdv/.po/.2mg) → base64 |
| `load_file` | Load any file → base64 or text |

**File Operations — Save From Emulator**

| Tool | Description |
| ---- | ----------- |
| `get_screenshot` | Capture screen → returns MCP image content (viewable by LLM). Has optional `emulator` param |
| `save_to` | Load from emulator source → save to sandbox path. Has optional `emulator` param for routing |

`save_to` sources: `basic-editor`, `asm-editor`, `basic-memory`, `file-explorer`, `memory-range`, `screen`, `raw`

**Note:** `showWindow` / `hideWindow` / `focusWindow` are frontend tools — call via `emma_command`, not separate MCP tools.

### Frontend Agent Tools (`src/js/agent/`)

Registered in `agent-tools.js`, organized by category:

**Emulator Control** (`main-tools.js`)
- `emulatorPower` — on/off/toggle
- `emulatorCtrlReset` — warm reset (Ctrl+Reset)
- `emulatorReboot` — cold reset
- `directLoadBinaryAt` — load base64 data to memory address
- `directSaveBinaryRangeTo` — read memory range as base64
- `directLoadFileAt` — load a file from the disk in a drive to a memory address
- `directMemoryCopy` / `directMemoryFill` — bulk memory operations
- `captureScreenshot` — capture display as base64 PNG
- `captureScreenText` — read text from screen (optional row/col range)
- `typeKeyboard` — type text at the machine (goes through the core's paste buffer, so nothing is dropped)

**BASIC Program** (`basic-program-tools.js`)
- `directReadBasic` / `directWriteBasic` / `directRunBasic` / `directNewBasic` — direct memory operations
- `basicProgramLoadFromMemory` / `basicProgramLoadIntoEmulator` — transfer between editor and emulator
- `basicProgramRun` / `basicProgramPause` / `basicProgramNew` / `basicProgramRenumber` / `basicProgramFormat`
- `basicProgramGet` / `basicProgramSet` / `basicProgramLineCount`
- `basicProgramLoadFile` — load a sandbox file into the editor server-side (source bypasses LLM context); pairs with `save_to from:"basic-editor"`
- `saveBasicInEditorToLocal` / `directSaveBasicInMemoryToLocal` — export from editor or from memory
- `basicProgramSetBreakpoint` / `basicProgramUnsetBreakpoint` / `basicProgramListBreakpoints` — statement-level breakpoints
- `basicProgramStepNext` / `basicProgramGetCurrentLine` — stepping and position
- `basicProgramGetVariables` / `basicProgramSetVariable` — inspect and set Applesoft variables
- `basicProgramGetHeatMap` — per-line execution counts

**Assembler** (`assembler-tools.js`)
- `asmAssemble` — compile source code
- `asmWrite` — load assembled code into memory
- `asmLoadExample` — load template program
- `asmNew` / `asmGet` / `asmSet` — editor operations
- `saveAsmInEditorToLocal` — export from editor
- `asmLoadFile` — load a sandbox file into the editor server-side (source bypasses LLM context); pairs with `save_to from:"asm-editor"`
- `asmGetStatus` — compilation status (origin, size, errors)
- `directExecuteAssemblyAt` — execute at address with optional return address

**Disk Drives** (`disk-tools.js`)
- `driveInsertDisc` — load disk image (calls MCP `load_disk_image`)
- `driveInsertBlank` — insert a freshly formatted image
- `diskDriveEject` — eject a drive
- `getDiskImageData` — read the current image back out
- `driveRecentsList` / `driveInsertRecent` / `driveLoadRecent` / `drivesClearRecent` — recent disk management

**SmartPort Hard Drives** (`smartport-tools.js`)
- `smartportInsertImage` — load hard drive image (calls MCP `load_smartport_image`)
- `smartportEject` — detach an image
- `smartportRecentsList` / `smartportInsertRecent` / `smartportClearRecent` — recent image management
- Validates SmartPort card is installed before operations

**File Explorer** (`file-explorer-tools.js`)
- `listDiskFiles` — enumerate DOS 3.3/ProDOS catalog (returns filename, type, size, locked status)
- `getDiskFileContent` — read file from disk (base64 for binary, plaintext for text)

**Window Management** (`window-tools.js`)
- `showWindow` / `hideWindow` / `focusWindow`

**Expansion Slots** (`slot-tools.js`)
- `slotsListAll` — list all slots with current cards and available options
- `slotsInstallCard` / `slotsRemoveCard` / `slotsMoveCard` — card management
- Persists to localStorage, triggers emulator reset after changes

**Printers** (`printer-tools.js`)
- `printerOpen` / `printerClose` / `printerClear` / `printerGetState` — window and paper lifecycle
- `printerSetPower` / `printerSetOnline` / `printerSetModel` / `printerSetup` — printer configuration
- `printerSetPageSize` / `printerSetPaperDimensions` / `printerSetRibbon` / `printerSetAutoLineFeed` — media and ribbon
- `printerSendBytes` / `printerStrike` / `printerSuper` — drive the print head directly
- `printerFeed` / `printerLineFeed` / `printerFormFeed` — paper movement
- `printerDumpScreen` — print the current screen
- `printerCapturePaper` / `printerGetPage` / `printerListHistory` / `printerReloadJob` — read printed output back

**Agent Version** (`agent-version-tools.js`)
- `getAgentVersion` / `checkAgentCompatibility` — version handshake with the MCP server

### WASM APIs Used by Agent Tools

The frontend tools hook into these WASM exports (changes to these require updating agent tools):

- **CPU/Execution**: `_isPaused()`, `_setPaused(bool)`, `_getPC()`, `_setRegPC()`, `_getA/X/Y/SP()`, `_setRegA/X/Y/SP()`, `_getTotalCycles()`, `_reset()`, `_warmReset()`
- **Memory**: `_readMemory(addr)`, `_writeMemory(addr, val)`, `_peekMemory(addr)`, `_malloc()`, `_free()`
- **Disk**: `_isDiskInserted(drive)`, `_getDiskSectorData()`, `_isDOS33Format()`, `_isProDOSFormat()`, `_getDOS33Catalog()`, `_getProDOSCatalog()`, `_readDOS33File()`, `_readProDOSFile()`, `_getDOS33FileBuffer()`, `_getProDOSFileBuffer()`
- **Slots**: `_getSlotCard(slot)`, `_setSlotCard(slot, cardId)`, `_isSmartPortCardInstalled()`
- **Strings**: `stringToUTF8()`, `UTF8ToString()`

### Data Flow

1. Agent calls MCP tool (e.g., `load_disk_image`) → MCP server reads file from filesystem → returns base64
2. Agent calls frontend tool (e.g., `driveInsertDisc`) via `emma_command` → AG-UI SSE delivers tool call to browser
3. Frontend decodes data, calls disk manager / WASM APIs → emulator state updates → result returned via `/tool-result` POST
