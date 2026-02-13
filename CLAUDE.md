# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Apple //e Browser Based Emulator - A cycle-accurate Apple II Enhanced emulator running in the browser using WebAssembly (C++ backend) and WebGL rendering. No JavaScript frameworks; vanilla ES6 modules with Vite for bundling.

## Build Commands

```bash
npm install           # Install dependencies
npm run build:wasm    # Build WASM module (required first time and after C++ changes)
npm run dev           # Start dev server at localhost:3000 (hot-reload for JS only)
npm run build         # Full production build (WASM + Vite bundle)
npm run clean         # Clean build artifacts
npm run deploy        # Deploy to VPS via rsync
```

## Testing

### CPU Compliance Tests

Klaus Dormann's 6502/65C02 functional test suites (`tests/klaus/`):

```bash
mkdir -p build-native && cd build-native
cmake ..
make -j$(sysctl -n hw.ncpu)
ctest --verbose
```

Test executables: `klaus_6502_test` (NMOS 6502), `klaus_65c02_test` (65C02 extended opcodes)

### Thunderclock Tests

Native C++ tests for Thunderclock card emulation (`tests/thunderclock/`), including MMU integration. Built and run via the same native CMake build above.

### GCR Encoding Tests

GCR (Group Code Recording) encoding tests (`tests/gcr/`). Native C++ tests for disk encoding logic.

### Integration Tests

Ad-hoc JavaScript tests for disk, memory, and boot debugging (`tests/integration/`). Run with Node.js:

```bash
node tests/integration/disk-boot-test.js
```

## Architecture

### Two-Layer Design

**C++ Core (src/core/)** - Pure emulation logic compiled to WebAssembly:

- `cpu/cpu6502.cpp` - Cycle-accurate 65C02 processor (1.023 MHz)
- `mmu/mmu.cpp` - 128KB memory management, soft switches ($C000-$CFFF), expansion slots
- `video/video.cpp` - TEXT/LORES/HIRES/DHIRES per-scanline rendering
- `audio/audio.cpp` - Speaker emulation from $C030 toggles
- `disk-image/` - Disk image format support (DSK/DO/PO/NIB/WOZ) with GCR encoding
- `disassembler/` - 65C02 instruction disassembler
- `input/keyboard.cpp` - Keyboard input handling
- `cards/` - Pluggable expansion card system (ExpansionCard interface)
- `cards/mockingboard/` - AY-3-8910 sound chip + VIA 6522 timer
- `cards/smartport/` - SmartPort hard drive controller (2 block devices, self-built ROM)
- `filesystem/` - DOS 3.3 and ProDOS filesystem parsers
- `basic/` - Applesoft and Integer BASIC detokenizer and tokenizer
- `debug/` - Condition evaluator for breakpoint expressions (supports BV/BA/BA2 for BASIC variable/array reads)
- `emulator.cpp` - Core coordinator, state serialization

**JavaScript Layer (src/js/)** - Browser integration:

- `main.js` - AppleIIeEmulator class orchestrating all subsystems
- `audio/` - Web Audio API driver and AudioWorklet
- `display/` - WebGL renderer, CRT shader effects, display settings, screen window
- `disk-manager/` - Disk drive UI, SmartPort hard drives, persistence, surface rendering, drive sounds
- `file-explorer/` - DOS 3.3 and ProDOS disk browser with disassembler
- `debug/` - Debug window implementations (see Debugging section)
- `help/` - Documentation and release notes windows
- `input/` - Keyboard input, text selection, joystick, mouse
- `ui/` - Menu wiring, reminders, slot configuration, custom confirm dialogs
- `state/` - State serialization and persistence (autosave + 5 manual slots)
- `config/` - App version
- `utils/` - Shared utilities (storage, string, BASIC)
- `windows/` - Base window class and window manager

### Theming

Light, dark, and system-follow themes controlled by `ThemeManager` (`src/js/ui/theme-manager.js`). Sets `data-theme` attribute on `<html>` for CSS variable switching. All accent and syntax highlighting colours are derived from the six-stripe Apple rainbow logo palette (Green `#61BB46`, Yellow `#FDB827`, Orange `#F5821F`, Red `#E03A3E`, Purple `#963D97`, Blue `#009DDC`), with brightness adjusted per theme for contrast. Speaker, Mockingboard, and disk drive sound volumes are all wired to a single main volume slider with a unified mute toggle.

Control sytles, sizes and layout must be consistent across the entire app.

### Audio-Driven Timing

The emulator uses Web Audio API for precise timing:

1. AudioWorklet requests samples at 48kHz
2. WASM runs ~21.3 CPU cycles per audio sample
3. Frame ready when cycles cross ~17,030 (60Hz)

This ensures consistent speed and works when the browser tab is backgrounded.

### WASM Interface Pattern

Single global `Emulator` instance in C++ (`wasm_interface.cpp`). JS allocates WASM heap with `_malloc`/`_free`, uses `stringToUTF8()`/`UTF8ToString()` for string conversion. New WASM exports must be added to `CMakeLists.txt` EXPORTED_FUNCTIONS list.

### Key Constants (src/core/types.hpp)

- CPU: 1.023 MHz clock
- Audio: 48kHz sample rate
- Screen: 560x384 pixels (280x192 doubled)
- Memory: 64KB main + 64KB aux RAM, 16KB ROM

## Development Workflow

**C++ changes** require rebuilding WASM: `npm run build:wasm`

**JavaScript changes** auto-reload via Vite dev server

**Full build** for production: `npm run build` (outputs to `dist/`)

**ROM files** are embedded into WASM at compile time. Place in `roms/` directory before building:

- `342-0349-B-C0-FF.bin` (16KB system ROM)
- `342-0273-A-US-UK.bin` (4KB character ROM, US/UK)
- `341-0160-A-US-UK.bin` (alternate character ROM variant)
- `341-0027.bin` (256 bytes Disk II ROM)
- `Thunderclock Plus ROM.bin` (2KB Thunderclock card ROM)
- `Apple Mouse Interface Card ROM - 342-0270-C.bin` (2KB Mouse Interface Card ROM)

## Code Organization

```
src/
├── core/               # C++ emulator (namespace a2e::)
│   ├── cpu/            # 65C02 processor
│   ├── mmu/            # Memory management and soft switches
│   ├── video/          # Per-scanline video rendering
│   ├── audio/          # Speaker audio
│   ├── disk-image/     # Disk image formats (DSK/DO/PO/NIB/WOZ) and GCR encoding
│   ├── disassembler/   # 65C02 disassembler
│   ├── input/          # Keyboard handling
│   ├── cards/          # Expansion card system
│   │   ├── mockingboard/  # AY-3-8910 + VIA 6522
│   │   └── smartport/     # SmartPort hard drive controller
│   ├── filesystem/     # DOS 3.3 and ProDOS parsers
│   ├── basic/          # BASIC tokenizer and detokenizer
│   ├── debug/          # Condition evaluator
│   ├── emulator.cpp    # Core coordinator, state serialization
│   └── types.hpp       # Shared constants and types
├── bindings/           # wasm_interface.cpp - WASM export glue
└── js/                 # ES6 modules, no framework
    ├── main.js         # Entry point, AppleIIeEmulator class
    ├── audio/          # Web Audio API driver and worklet
    ├── config/         # App version
    ├── debug/          # Debug window implementations
    ├── disk-manager/   # Disk drive operations, persistence, surface rendering, sounds
    ├── display/        # WebGL renderer, CRT shaders, display settings, screen window
    ├── file-explorer/  # DOS 3.3 and ProDOS file browser, disassembler
    ├── help/           # Documentation and release notes
    ├── input/          # Keyboard input, text selection, joystick, mouse
    ├── state/          # Save state manager and persistence
    ├── ui/             # Menu wiring, reminders, slot configuration
    ├── utils/          # Shared utilities (storage, string, BASIC)
    └── windows/        # Base window class and window manager
├── css/                # Stylesheets (bundled by Vite)
public/                 # Static assets, built WASM files, shaders
├── shaders/           # CRT vertex/fragment shaders
├── assets/            # Images and sounds
└── index.html         # Main HTML entry point
tests/
├── klaus/              # Klaus Dormann CPU compliance tests
├── thunderclock/       # Thunderclock card tests
├── integration/        # JS integration/debug tests
└── gcr/                # GCR encoding tests
```

### File Naming Convention

All JavaScript files use **kebab-case** (e.g., `audio-driver.js`, `cpu-debugger-window.js`). Class names remain PascalCase in the code.

## Expansion Card Architecture

The MMU supports pluggable expansion cards matching real Apple IIe hardware. Cards implement the `ExpansionCard` interface (`src/core/cards/expansion_card.hpp`).

### Slot Memory Map

| Slot | I/O Space   | ROM Space   | Default Card                |
| ---- | ----------- | ----------- | --------------------------- |
| 1    | $C090-$C09F | $C100-$C1FF | Empty                       |
| 2    | $C0A0-$C0AF | $C200-$C2FF | Empty                       |
| 3    | $C0B0-$C0BF | $C300-$C3FF | 80-column (built-in, fixed) |
| 4    | $C0C0-$C0CF | $C400-$C4FF | Mockingboard                |
| 5    | $C0D0-$C0DF | $C500-$C5FF | Thunderclock                |
| 6    | $C0E0-$C0EF | $C600-$C6FF | Disk II                     |
| 7    | $C0F0-$C0FF | $C700-$C7FF | Empty                       |

### Card Interface Methods

```cpp
class ExpansionCard {
    virtual uint8_t readIO(uint8_t offset);      // I/O space ($C0x0-$C0xF)
    virtual void writeIO(uint8_t offset, uint8_t value);
    virtual uint8_t readROM(uint8_t offset);     // ROM space ($Cx00-$CxFF)
    virtual void writeROM(uint8_t offset, uint8_t value);
    virtual void reset();
    virtual void update(int cycles);
    // ... serialization, IRQ callbacks, etc.
};
```

### Available Cards

- `Disk2Card` - Wraps Disk2Controller (slot 6)
- `MockingboardCard` - Dual AY-3-8910 + VIA 6522, stereo output (slot 4)
- `MouseCard` - Apple Mouse Interface Card via MC6821 PIA command protocol (slot 4)
- `SmartPortCard` - SmartPort hard drive controller, 2 block devices, self-built ROM (user-configurable slot)
- `ThunderclockCard` - ProDOS-compatible real-time clock (slots 5, 7)

## State Serialization

Binary format with versioned header. Includes CPU state, 128KB RAM, Language Card (16KB), soft switches, disk images with modifications, filenames, and debugger state. Autosave slot plus 5 manual save slots. Stored in browser IndexedDB. Window option state (toggles, view modes, mute states) is persisted separately via localStorage.

## Release Process

When the user says "release", perform all of the following steps:

1. **Review git log** since the last release notes entry to identify all changes
2. **Bump version** in `src/js/config/version.js`
3. **Update release notes** in both `src/js/help/release-notes.js` and `src/js/config/release-notes.json`
4. **Update README.md** to reflect any new features, changed commands, or updated project information
5. **Update CLAUDE.md** to reflect any architectural changes, new files/directories, new build steps, new expansion cards, new debug windows, or other structural changes to the codebase

## Debugging

Built-in debug windows accessible via Debug menu:

- CPU Debugger: registers (REGS, FLAGS, TIMING, BEAM sections), breakpoints, stepping, disassembly with symbols
- Memory Browser: hex/ASCII view of 128KB address space with search
- Memory Heat Map: real-time memory access visualization (read/write/combined modes)
- Memory Map: address space layout overview
- Stack Viewer: live stack contents
- Zero Page Watch: monitor zero page locations with predefined and custom watches
- Soft Switch Monitor: Apple II switch states ($C000-$C0FF)
- Mockingboard: unified channel-centric view with AY-3-8910 and VIA registers, inline waveforms, level meters, and per-channel mute controls
- Mouse Card: PIA registers, position, mode, interrupt state, protocol activity
- BASIC Program Viewer: view, load, and tokenize BASIC programs from memory, line heat map, trace toggle, statement-level breakpoints, conditional breakpoints on variables/arrays, condition-only rules, variable inspector, run/stop/pause/step controls
- Rule Builder: complex conditional breakpoints with C-style expressions, supports CPU registers/memory and BASIC variables/arrays as subjects

## Keyboard Shortcuts

| Shortcut         | Action                   |
| ---------------- | ------------------------ |
| F1               | Open/close Help window   |
| Ctrl+Escape      | Exit full page mode      |
| Ctrl+V           | Paste text into emulator |
| Ctrl+`           | Open window switcher     |
| Option+Tab       | Cycle to next window     |
| Option+Shift+Tab | Cycle to previous window |
| F5               | Run / Continue execution |
| F10              | Step Over                |
| F11              | Step Into                |
| Shift+F11        | Step Out                 |

## Agent / MCP Integration

The emulator exposes an AI agent interface via the Model Context Protocol (MCP) and AG-UI event protocol. This allows AI agents (including Claude Code) to fully control the emulator programmatically.

### Architecture

Two coordinated components:

- **MCP Server** (`mcp/appleii-agent/`) — Node.js process providing MCP tools over stdio + an HTTP/HTTPS server (port 3033) implementing the AG-UI event protocol (SSE)
- **Frontend Agent Manager** (`src/js/agent/agent-manager.js`) — Browser-side AG-UI client that connects to the server, receives tool calls via SSE, executes them against the emulator, and returns results

### Configuration

- `.mcp.json` (repo root) — MCP client config for running the agent
  - Recommended: `bunx -y @retrotech71/appleii-agent` (auto-installs with Bun)
  - Development: `node /path/to/appleii-agent/src/index.js` (local source)
- Environment variables: `PORT` (default 3033), `HTTPS=true` for TLS mode

### MCP Server Tools (`mcp/appleii-agent/src/tools/`)

| Tool | Description |
| ---- | ----------- |
| `emma_command` | Generic command wrapper — delegates to any frontend tool |
| `server_control` | Start/stop/restart the agent server |
| `set_https` | Enable/disable HTTPS mode |
| `set_debug` | Set debug logging level |
| `get_state` | Return current emulator state |
| `show_window` / `hide_window` / `focus_window` | Window management |
| `load_disk_image` | Load disk image (.dsk/.do/.po/.nib/.woz) from filesystem, returns base64 |
| `load_file` | Load arbitrary file from filesystem |
| `save_basic_file` | Save BASIC program to disk |
| `save_asm_file` | Save assembler source to disk |
| `save_disk_file` | Save extracted disk file to filesystem |
| `load_smartport_image` | Load hard drive image (.hdv/.po/.2mg) from filesystem |

### Frontend Agent Tools (`src/js/agent/`)

Registered in `agent-tools.js`, organized by category:

**Emulator Control** (`main-tools.js`)
- `emulatorPower` — on/off/toggle
- `emulatorCtrlReset` — warm reset (Ctrl+Reset)
- `emulatorReboot` — cold reset
- `directLoadBinaryAt` — load base64 data to memory address
- `directSaveBinaryRangeTo` — read memory range as base64

**BASIC Program** (`basic-program-tools.js`)
- `directReadBasic` / `directWriteBasic` / `directRunBasic` / `directNewBasic` — direct memory operations
- `basicProgramLoadFromMemory` / `basicProgramLoadIntoEmulator` — transfer between editor and emulator
- `basicProgramRun` / `basicProgramPause` / `basicProgramNew` / `basicProgramRenumber` / `basicProgramFormat`
- `basicProgramGet` / `basicProgramSet` / `basicProgramLineCount`
- `saveBasicInEditorToLocal` — export from editor

**Assembler** (`assembler-tools.js`)
- `asmAssemble` — compile source code
- `asmWrite` — load assembled code into memory
- `asmLoadExample` — load template program
- `asmNew` / `asmGet` / `asmSet` — editor operations
- `asmGetStatus` — compilation status (origin, size, errors)
- `directExecuteAssemblyAt` — execute at address with optional return address

**Disk Drives** (`disk-tools.js`)
- `driveInsertDisc` — load disk image (calls MCP `load_disk_image`)
- `driveRecentsList` / `driveInsertRecent` / `driveLoadRecent` / `drivesClearRecent` — recent disk management

**SmartPort Hard Drives** (`smartport-tools.js`)
- `smartportInsertImage` — load hard drive image (calls MCP `load_smartport_image`)
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
