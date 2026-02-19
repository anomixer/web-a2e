# Agent Tools (MCP Server)

MCP tools registered in `/Users/Shawn/code/git/[mikedaley]/appleii-agent/src/tools/index.js`.

## Server / Connection

| Tool | Description |
|------|-------------|
| `server_control` | Start / stop / restart the HTTP server |
| `set_https` | Toggle HTTPS mode |
| `set_debug` | Toggle debug logging |
| `get_state` | Current server + connection state |
| `get_version` | Agent version info |
| `reload_sandbox` | Reload sandbox.config without restart |
| `disconnect_clients` | Disconnect all SSE clients |
| `shutdown_remote_server` | Shut down another instance on the same port |

## Window Management

| Tool | Description |
|------|-------------|
| `show_window` | Show + bring to front a window by ID |
| `hide_window` | Hide a window |
| `focus_window` | Bring an already-visible window to front |

## Generic Command

| Tool | Description |
|------|-------------|
| `emma_command` | Delegate to any frontend app tool via AG-UI |

## File Operations — Load Into Emulator

| Tool | Description |
|------|-------------|
| `load_disk_image` | Load a disk image (.dsk/.do/.po/.nib/.woz) from filesystem → base64 |
| `load_smartport_image` | Load a SmartPort hard drive image (.hdv/.po/.2mg) → base64 |
| `load_file` | Load any file → base64 or text |

## File Operations — Save From Emulator

| Tool | Description |
|------|-------------|
| `get_screenshot` | Capture screen → returns MCP image content (viewable by LLM) |
| `save_to` | Unified: load from source → save to sandbox path. `direct=true` (default) saves silently (no base64 in LLM context); `direct=false` returns content to LLM. |

### `save_to` Sources

| `from` value | Content | Params |
|---|---|---|
| `"basic-editor"` | BASIC program text from editor | — |
| `"asm-editor"` | Assembly source from editor | — |
| `"basic-memory"` | BASIC program from emulator memory | — |
| `"file-explorer"` | File from disk / SmartPort | `filename`, `drive` (0/1) |
| `"memory-range"` | Raw memory bytes | `address` ($hex or dec), `length` ($hex or dec) |
| `"screen"` | Screen capture | `screenMode`: `"auto"`\|`"graphics"`\|`"text"` |
| `"raw"` | LLM-provided content | `content: { data, type: "text"\|"binary" }` |

### Retired Tools (replaced by `save_to`)

The following were removed from the registry. Their source files still exist if needed:
- `save_screenshot` → `save_to({ from: "screen", ... })`
- `save_disk_file` → `save_to({ from: "raw", content: { data, type: "binary" }, ... })`
- `save_basic_file` → `save_to({ from: "raw", content: { data, type: "text" }, ... })`
- `save_asm_file` → `save_to({ from: "raw", content: { data, type: "text" }, ... })`
