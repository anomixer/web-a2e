NAME: project-structure
DESCRIPTION: Directory structure and organization of web-a2e and appleii-agent projects

# Project Structure

This document describes the directory structure and organization of the Apple //e emulator project, which consists of two separate repositories.

**For integration concepts and how-to guides**, see `mcp-ag-ui-integration.md`.
**For connection architecture and behaviors**, see `connections.md`.

---

## Repository Layout

The project consists of **two separate Git repositories**:

```
[project-root]/
├── web-a2e/              # Main emulator application (THIS REPO)
└── appleii-agent/        # MCP server for agent integration (SEPARATE REPO)
```

**Expected location**: The `appleii-agent` repository should be located at `../appleii-agent` relative to the `web-a2e` repository root for local development.

**Why separate repos?**
- Independent versioning and release cycles
- appleii-agent can be published to npm as standalone package
- web-a2e can run with published or local agent
- Clear separation of concerns (app vs agent server)

---

## web-a2e Structure

**Repository**: https://github.com/mikedaley/web-a2e (or your fork)
**Technology**: C++ (WASM) + Vanilla JavaScript ES6 + Vite

```
web-a2e/
├── .claude/                    # Claude Code configuration
│   └── skills/
│       └── emma/              # EMMA agent skill
│           ├── SKILL.md       # Skill definition
│           ├── docs/          # Documentation files
│           │   ├── ag-ui-specs.md
│           │   ├── agent-setup.md
│           │   ├── bindings.md
│           │   ├── connections.md
│           │   ├── mcp-ag-ui-integration.md
│           │   ├── project-structure.md (THIS FILE)
│           │   ├── setup.md
│           │   └── styles.md
│           └── references/    # Reference tools
│               ├── create-pr.md        # Generate GitHub PR descriptions
│               ├── impact.md
│               ├── new-agent-tool.md
│               ├── new-app-tool.md
│               ├── query.md
│               ├── reference.md
│               └── update.md
│
├── .mcp.json                  # MCP server configuration (for local Claude Code)
├── CMakeLists.txt            # CMake build configuration for WASM
├── package.json              # Node.js dependencies (Vite, etc.)
├── vite.config.js            # Vite bundler configuration
│
├── public/                   # Static assets
│   ├── index.html           # Main HTML entry point
│   ├── a2e.js               # WASM JavaScript bindings (generated)
│   ├── a2e.wasm             # WASM binary (generated)
│   ├── assets/              # Images, sounds
│   ├── audio-worklet.js     # Audio processing worklet
│   ├── disks/               # Sample disk images
│   ├── docs/                # Documentation files
│   ├── icons/               # App icons
│   ├── llms.txt             # LLM feature index
│   ├── manifest.json        # PWA manifest
│   ├── shaders/             # WebGL CRT shaders
│   └── sw.js                # Service worker
│
├── roms/                     # Apple II ROM files (not in git)
│   ├── 342-0349-B-C0-FF.bin           # 16KB system ROM
│   ├── 342-0273-A-US-UK.bin           # 4KB character ROM
│   ├── 341-0027.bin                   # 256 bytes Disk II ROM
│   ├── Thunderclock Plus ROM.bin      # 2KB Thunderclock ROM
│   └── Apple Mouse Interface Card ROM - 342-0270-C.bin
│
├── src/                      # Source code
│   ├── bindings/            # WASM ↔ JavaScript interface
│   │   └── wasm_interface.cpp
│   │
│   ├── core/                # C++ emulator core (compiled to WASM)
│   │   ├── assembler/
│   │   ├── audio/
│   │   ├── basic/
│   │   ├── cards/           # Expansion card system
│   │   │   ├── expansion_card.hpp
│   │   │   ├── disk2/            # Disk II controller card
│   │   │   ├── mockingboard/     # AY-3-8910 + VIA 6522 + Mockingboard card
│   │   │   ├── mouse/            # Apple Mouse Interface Card
│   │   │   ├── smartport/        # SmartPort hard drive controller
│   │   │   ├── softcard/         # Microsoft Z-80 SoftCard
│   │   │   │   └── z80/          # Z80 CPU emulation core
│   │   │   ├── ssc/              # Super Serial Card + ACIA 6551
│   │   │   └── thunderclock/     # Thunderclock Plus real-time clock
│   │   ├── cpu/
│   │   │   └── 6502/             # Cycle-accurate 65C02 processor
│   │   ├── debug/
│   │   ├── disassembler/
│   │   ├── disk-image/
│   │   ├── emulator/        # Split emulator implementation files
│   │   │   ├── emulator_state.cpp  # State serialization
│   │   │   └── emulator_debug.cpp  # Debug facilities
│   │   ├── filesystem/
│   │   ├── input/
│   │   ├── mmu/
│   │   ├── video/
│   │   ├── emulator.cpp     # Core coordinator
│   │   ├── emulator.hpp     # Emulator class declaration
│   │   ├── noslot_clock.cpp  # DS1215 No-Slot Clock
│   │   └── types.hpp        # Shared constants
│   │
│   ├── css/                 # Stylesheets
│   │   ├── base.css
│   │   ├── controls.css
│   │   ├── layout.css
│   │   └── ...
│   │
│   └── js/                  # JavaScript application code
│       ├── main.js          # Entry point, AppleIIeEmulator class
│       │
│       ├── agent/           # AI agent integration (AG-UI client)
│       │   ├── agent-manager.js      # SSE connection to appleii-agent
│       │   ├── agent-tools.js        # Tool registry
│       │   ├── agent-version-tools.js
│       │   ├── assembler-tools.js
│       │   ├── basic-program-tools.js
│       │   ├── disk-tools.js
│       │   ├── file-explorer-tools.js
│       │   ├── main-tools.js
│       │   ├── slot-tools.js
│       │   ├── smartport-tools.js
│       │   └── window-tools.js
│       │
│       ├── audio/           # Web Audio API
│       ├── config/          # App version
│       ├── debug/           # Debug windows
│       ├── disk-manager/    # Disk operations
│       ├── display/         # WebGL renderer
│       ├── file-explorer/   # DOS 3.3/ProDOS browser
│       ├── help/            # Documentation
│       ├── input/           # Keyboard, joystick, mouse
│       ├── state/           # Save state management
│       ├── ui/              # UI controllers
│       ├── utils/           # Utilities
│       └── windows/         # Window system
│
├── tests/                   # Test suites
│   ├── catch2/             # Catch2 test framework setup
│   ├── common/             # Shared test utilities
│   ├── gcr/                # GCR encoding tests
│   ├── integration/        # Integration tests
│   ├── klaus/              # CPU compliance tests (6502/65C02)
│   ├── thunderclock/       # Thunderclock card tests
│   └── unit/               # Unit tests
│
└── build-native/           # Native build output (generated)
```

### Key Directories

**`src/core/`** - C++ emulator core, compiled to WASM
- Pure emulation logic, no browser dependencies
- All bindings exposed via `src/bindings/wasm_interface.cpp`

**`src/js/agent/`** - AG-UI client for agent integration
- `agent-manager.js` - Connects to appleii-agent via SSE (port 3033)
- `*-tools.js` - Tool implementations that call WASM bindings
- **Does not start the MCP server** - only connects to it

**`public/a2e.js` and `public/a2e.wasm`** - Generated by `npm run build:wasm`
- WASM JavaScript glue code and compiled emulator binary
- Output directly to public/ (not wasm-build/ subdirectory)

**`.mcp.json`** - Configures how Claude Code connects to appleii-agent
- Can use bunx (published package) or local path
- See `agent-setup.md` for configuration options

---

## appleii-agent Structure

**Repository**: https://github.com/retrotech71/appleii-agent (or equivalent)
**Technology**: Node.js + TypeScript
**Package**: Published to npm as `@retrotech71/appleii-agent`

```
appleii-agent/
├── package.json             # npm package definition
├── tsconfig.json            # TypeScript configuration
├── .npmignore              # npm publish exclusions
│
└── src/
    ├── index.js             # Main entry point (MCP + HTTP server)
    ├── mcp-server.js        # MCP protocol handler (stdio)
    ├── http-server.js       # HTTP/SSE server (port 3033)
    ├── logger.js            # Logging utilities
    ├── version.js           # Version information
    │
    └── tools/               # MCP tool implementations
        ├── index.js
        ├── disconnect-clients.js
        ├── emma-command.js
        ├── focus-window.js
        ├── get-state.js
        ├── get-version.js
        ├── hide-window.js
        ├── load-disk-image.js
        ├── load-file.js
        ├── load-smartport-image.js
        ├── save-asm-file.js
        ├── save-basic-file.js
        ├── save-disk-file.js
        ├── server-control.js
        ├── set-debug.js
        ├── set-https.js
        ├── show-window.js
        └── shutdown-remote-server.js
```

### Key Components

**`index.js`** - Entry point
- Starts MCP server (stdio) for Claude Code
- Starts HTTP/SSE server (port 3033) for web-a2e
- Both run in same Node.js process

**`http-server.js`** - AG-UI protocol server
- Listens on port 3033
- Sends TOOL_CALL_* events via SSE to browser
- Receives TOOL_CALL_RESULT via HTTP POST from browser
- Handles single-client mode (409 conflict)

**`tools/`** - MCP tool implementations
- Tools that load/save files from filesystem
- Tools that call web-a2e via `emma_command` wrapper
- **Does not execute emulator code** - delegates to browser

---

## How the Projects Connect

### Development Setup

```
[project-root]/
├── web-a2e/              # Clone from github.com/mikedaley/web-a2e
└── appleii-agent/        # Clone from github.com/retrotech71/appleii-agent
```

**Local development workflow:**
1. Clone both repos side-by-side
2. Configure `web-a2e/.mcp.json` with local path to appleii-agent:
   ```json
   {
     "mcpServers": {
       "appleii-agent": {
         "type": "stdio",
         "command": "node",
         "args": ["/absolute/path/to/appleii-agent/src/index.js"]
       }
     }
   }
   ```
3. Start web-a2e dev server: `npm run dev`
4. Claude Code automatically starts appleii-agent via .mcp.json
5. appleii-agent starts HTTP server on port 3033
6. Browser connects to appleii-agent via AgentManager

See `agent-setup.md` for all configuration options.

### Production Setup

```
web-a2e/ deployed to web server
appleii-agent published to npm
```

**Production workflow:**
1. Use bunx configuration in `.mcp.json`:
   ```json
   {
     "mcpServers": {
       "appleii-agent": {
         "command": "bunx",
         "args": ["-y", "@retrotech71/appleii-agent"]
       }
     }
   }
   ```
2. No local appleii-agent repo needed
3. Latest version auto-downloaded by bunx

---

## Communication Flow

```
┌──────────────────────────┐
│  Claude Code             │
│  (MCP Client)            │
└────────┬─────────────────┘
         │ MCP (stdio)
         │ Configured via .mcp.json
         │
┌────────▼─────────────────┐
│  appleii-agent           │ [separate repo: ../appleii-agent]
│  (MCP Server)            │
│  - Exposes MCP tools     │
│  - Runs HTTP/SSE server  │
└────────┬─────────────────┘
         │ HTTP/SSE (port 3033)
         │ AG-UI protocol
         │
┌────────▼─────────────────┐
│  web-a2e                 │ [this repo]
│  (Browser Application)  │
│  - AgentManager connects │
│  - Executes tools        │
│  - Calls WASM bindings   │
└──────────────────────────┘
```

**Key points:**
- **Claude Code starts appleii-agent** via .mcp.json configuration
- **appleii-agent does not execute emulator code** - it forwards tool calls to browser
- **Browser executes all tools** by calling WASM bindings
- **Two separate repos** but coordinated releases

---

## Build Outputs (Generated, Not in Git)

### web-a2e
- `public/a2e.js` and `public/a2e.wasm` - WASM binaries
- `dist/` - Production build (Vite output)
- `build-native/` - Native test executables (CMake)

### appleii-agent
- `dist/` - Compiled TypeScript (if using build step)
- `node_modules/` - Dependencies

---

## Version Compatibility

| web-a2e | appleii-agent | Notes |
|---------|---------------|-------|
| 1.0.10+ | 1.0.5+       | Version check enforced |
| 1.0.9   | 1.0.4+       | Older compatibility |

**Enforced in**: `src/js/agent/agent-manager.js` - `_checkVersionCompatibility()`

The browser checks agent version on connect and blocks if incompatible.

See `connections.md` for version compatibility details.

---

## Configuration Files

### web-a2e

**`.mcp.json`** - Local MCP server configuration
- Tells Claude Code how to start appleii-agent
- Not committed to git (user-specific paths)

**`package.json`** - npm dependencies
- Vite, development tools
- Does NOT include appleii-agent (separate project)

**`CMakeLists.txt`** - WASM build configuration
- Emscripten compiler settings
- EXPORTED_FUNCTIONS list for WASM bindings

**`vite.config.js`** - Bundler configuration
- Dev server settings
- Build output configuration

### appleii-agent

**`package.json`** - npm package
- Published to npm registry
- Specifies dependencies (@modelcontextprotocol/sdk, express)
- Defines entry point: `src/index.js`

---

## File Naming Conventions

### web-a2e
- **JavaScript**: kebab-case (e.g., `agent-manager.js`, `cpu-debugger-window.js`)
- **C++**: snake_case (e.g., `wasm_interface.cpp`, `expansion_card.hpp`)
- **CSS**: kebab-case (e.g., `controls.css`, `base-window.css`)

### appleii-agent
- **JavaScript**: kebab-case (e.g., `http-server.js`, `shutdown-remote-server.js`)

See `styles.md` for complete coding style guide.

---

## Related Documents

- `mcp-ag-ui-integration.md` - Integration concepts and patterns
- `connections.md` - Connection behaviors and architecture
- `agent-setup.md` - MCP server configuration options
- `setup.md` - Development environment setup
- `bindings.md` - WASM binding reference
