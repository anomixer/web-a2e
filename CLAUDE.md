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
npm test              # JavaScript tests (Vitest)
npm run check         # check:exports + check:core-purity + check:basic-tokens + npm test
npm run generate:basic-tokens  # Regenerate src/js/utils/basic-tokens.js from C++
```

## Testing

### JavaScript (Vitest)

`npm test` runs `tests/js/`. Config is in `vitest.config.js`, kept separate from
`vite.config.js` so the app build settings do not obscure test failures. The
modules under test are pure logic and run in plain node — a new DOM dependency
in one of them is a smell, not a reason to add jsdom.

Covers the printer emulation (characterization tests capturing the event stream
from `PrinterBase.setEventSink()`), the Applesoft listing parser, and input
mapping.

### Consistency checks

`npm run check` runs three guards, each verified to fail when violated:

- `scripts/check-exports.sh` — `EMSCRIPTEN_KEEPALIVE` functions vs the
  `EXPORTED_FUNCTIONS` list in `CMakeLists.txt`, both directions
- `scripts/check-core-purity.sh` — no host-platform dependencies in `src/core/`
  (matches code, not comments, so docs may name what they warn about)
- `scripts/generate-basic-tokens.mjs --check` — the generated JS token table is
  in step with `src/core/basic/basic_tokens.hpp`

### C++ (Catch2)

All C++ tests use the Catch2 framework and are built/run via CMake's native build:

```bash
mkdir -p build-native && cd build-native
cmake ..
make -j$(sysctl -n hw.ncpu)
ctest --verbose
```

Test suites cover CPU (6502/65C02), memory (MMU, slots), video, audio, disk images (DSK/WOZ/GCR), expansion cards (Disk II, Mockingboard, Thunderclock, Mouse, SmartPort, SSC), filesystems (DOS 3.3, ProDOS, Pascal), BASIC tokenizer/detokenizer, assembler, disassembler, keyboard, condition evaluator, and full emulator integration.

## Architecture

### Two-Layer Design

**C++ Core (src/core/)** - Pure emulation logic compiled to WebAssembly:

- `cpu/6502/cpu6502.cpp` - Cycle-accurate 65C02 processor (1.023 MHz)
- `mmu/mmu.cpp` - 128KB memory management, soft switches ($C000-$CFFF), expansion slots
- `video/video.cpp` - TEXT/LORES/HIRES/DHIRES per-scanline rendering
- `audio/audio.cpp` - Speaker emulation from $C030 toggles
- `disk-image/` - Disk image format support (DSK/DO/PO/NIB/WOZ) with GCR encoding
- `disassembler/` - 65C02 instruction disassembler
- `input/keyboard.cpp` - Keyboard input handling
- `cards/` - Pluggable expansion card system (ExpansionCard interface)
- `cards/disk2/` - Disk II controller card
- `cards/mockingboard/` - AY-3-8910 sound chip + VIA 6522 timer + Mockingboard card
- `cards/mouse/` - Apple Mouse Interface Card
- `cards/parallel/` - Centronics parallel card (drives Epson FX-80 and Apple DMP)
- `cards/smartport/` - SmartPort hard drive controller (2 block devices, self-built ROM)
- `cards/softcard/` - Microsoft Z-80 SoftCard with Z80 CPU emulation
- `cards/ssc/` - Super Serial Card with ACIA 6551 (drives ImageWriter I and ImageWriter II)
- `cards/thunderclock/` - Thunderclock Plus real-time clock card
- `filesystem/` - DOS 3.3 and ProDOS filesystem parsers
- `basic/` - Applesoft and Integer BASIC detokenizer, tokenizer, token tables, and
  variable representation (`applesoft_vars` — MBF floats, name/type decoding,
  VARTAB/ARYTAB walking)
- `debug/` - Condition evaluator for breakpoint expressions (supports BV/BA/BA2 for BASIC variable/array reads), and `debug_log` (host-installed log sink; the core never writes to a console itself)
- `noslot_clock.cpp` - DS1215 No-Slot Clock (ProDOS RTC at $C300)
- `emulator.cpp` - Core coordinator
- `emulator/emulator_state.cpp` - State serialization (exportState/importState)
- `emulator/emulator_debug.cpp` - Debug facilities (breakpoints, watchpoints, trace, beam)

**JavaScript Layer (src/js/)** - Browser integration:

- `main.js` - AppleIIeEmulator class orchestrating all subsystems
- `worker/` - Web Worker infrastructure for WASM isolation (see Worker Architecture below)
- `audio/` - Web Audio API driver and AudioWorklet
- `display/` - WebGL renderer, CRT shader effects, display settings, screen window, no-signal screen
- `disk-manager/` - Disk drive UI, SmartPort hard drives, persistence, surface rendering, drive sounds, URL-parameter media loading
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

**Window surfaces are opaque and carry no `backdrop-filter`.** Use the `--glass-bg`, `--glass-bg-solid` and `--glass-bg-header` tokens for any window, panel, menu or popout background; they are fully opaque in both themes despite the legacy names. Do not reintroduce translucency or blur on these surfaces: they sit over a canvas that repaints 60 times a second, so a backdrop filter forces the compositor to re-blur the full area of every open window on every frame regardless of whether its content changed. Translucency is still correct for two things — dimming scrims behind modals and the window switcher, and accent-tinted inner chips (CPU flags, soft switch badges) layered on an already-opaque window.

### Display / CRT Shader

`public/shaders/crt.glsl` is the whole picture pipeline. Three things in it are load-bearing and must not be undone:

**Animated effects are bounded by the photosensitive-epilepsy limits.** No full-screen luminance modulation may exceed three flashes per second or a 10% relative luminance change (WCAG 2.3.1). `flicker()` is a slow two-sine undulation at 3% amplitude for this reason, and the full-screen TV static that used to play while the machine was off was removed outright — it ran at 50Hz with a 12Hz brightness modulation on top. The constraint is documented in the functions themselves; read those comments before touching them.

**The mask is in physical screen space, the beam is not.** `shadowMask()` derives position from `gl_FragCoord` divided by `u_pixelRatio` — a mask has a fixed pitch in millimetres, so it must neither resize with display density nor move when jitter and horizontal sync displace the picture. Effects that model the *signal* take the distorted UV; effects that model the *glass* do not.

**Scanlines model a beam spot, not a stripe pattern.** `scanlines()` takes the displayed luminance and widens its Gaussian with it, because a CRT beam grows with current. The framebuffer is 560x384 (280x192 doubled), so a scanline pitch is two texel rows — 192 lines.

The powered-off screen is built by `src/js/display/no-signal-frame.js` as an ordinary 560x384 RGBA framebuffer and uploaded as the source texture, so it passes through the whole CRT chain like emulator video. `WebGLRenderer.updateTexture()` ignores emulator frames while it is displayed.

`WebGLRenderer.draw()` re-derives the drawing buffer size when `devicePixelRatio` changes, because a density change alters no CSS size and so never reaches the `ResizeObserver` that drives `resize()`.

Display Settings (`src/js/display/display-settings-window.js`) leads with a **Monitor preset** — Pixel Exact, Composite Color, RGB Monitor, Monochrome Green, Monochrome Amber — with every individual slider behind an Advanced disclosure. Presets set only the picture, never the user's brightness/contrast/saturation or bezel; editing a setting a preset owns relabels the selection Custom without changing values.

### URL Media Parameters

`?disk=`, `?disk1=`, `?disk2=`, `?hd=`, `?hd2=` and `?name=` let a link open with images already inserted. `?disk=` targets the Disk II floppy drives (formats `.dsk`/`.do`/`.po`/`.woz`); `?hd=` targets the SmartPort block devices (formats `.2mg`/`.hdv`). Three modules:

- `src/js/utils/url-params.js` — pure parsing and URL validation (http/https only; relative paths resolve against the page). Unit-tested in `tests/js/utils/url-params.test.js`.
- `src/js/disk-manager/url-media-loader.js` — fetches (`credentials: "omit"`, size-capped) and inserts.
- `functions/proxy/[[path]].js` — a Cloudflare Pages Function serving the same-origin CORS proxy (`/proxy/url/<encodeURIComponent(target)>`), returning the fetched file with permissive CORS headers. The local Vite dev server serves that same route via `plugins/dev-proxy-plugin.js` (a `configureServer` middleware), so `npm run dev` behaves like production.

`fetchImage` in `url-media-loader.js` first tries a direct fetch; when the browser raises the opaque TypeError that signals a CORS refusal, it automatically retries through `/proxy/url/…`. Hosts that already send `Access-Control-Allow-Origin` are never routed through the proxy. Note the dev-server middleware must call `next()` for non-proxy paths — skipping it stalls every other request on the whole server.

`main.js` parses the URL *before* `DiskManager.init()` / `HardDriveManager.init()` and populates `urlOwnedDrives` / `urlOwnedDevices`, which those managers use to skip restoring persisted images into units a link is about to claim — otherwise the two loads race.

Loads are transient: `DiskManager.loadDiskFromUrlData()` deliberately skips `saveDiskToStorage`/`addToRecentDisks`, and `StateManager.suspendAutoSave()` is called for the session so the periodic autosave cannot persist the URL disk by the back door. The stored autosave preference is untouched.

### Worker Architecture

The WASM emulator runs in a dedicated Web Worker to keep the main thread free:

```
Main Thread                    Worker Thread                AudioWorklet Thread
-----------                    -------------                -------------------
WasmProxy (ES6 Proxy)  ←msg→  emulator-worker.js           audio-worklet.js
  - WebGL renderer               - WASM module                - reads shared ring
  - Debug windows                 - audio generation           - requests refill
  - Input capture                 - framebuffer write            when buffer low
  - Agent tools                   - RPC handler
        ↑                               ↓                            ↑
        └──── SharedArrayBuffer: framebuffer (2 slots) + control ─────┘
                             audio ring buffer
```

- `src/js/worker/wasm-proxy.js` — ES6 Proxy intercepts `_functionName()` calls and sends async RPC to Worker. Fire-and-forget calls (input, control) skip waiting for responses.
- `src/js/worker/emulator-worker.js` — Classic Worker (not module, for `importScripts` compatibility). Loads WASM, handles RPC, generates audio samples on request.
- `src/js/worker/rpc-protocol.js` — Shared message type constants.
- `src/js/worker/shared-buffers.js` — SharedArrayBuffer layouts, allocation and control-block offsets.

Key patterns:
- **Fire-and-forget**: Input/control calls (`_keyDown`, `_setPaused`, `_writeMemory`, etc.) post to Worker without waiting for a response.
- **Batch queries**: `wasmProxy.batch([['_getPC'], ['_getA'], ...])` collapses multiple reads into one round-trip. Prefer ONE batch per window update — the Worker services RPCs on the same thread that runs the emulation, so sequential round-trips directly steal emulation time. `CPUDebuggerWindow.update()` is the reference example: a single 25-call batch, indexed via `UPDATE_BATCH`.
- **String returns**: `wasmProxy.callString(fn, ...args)` calls a `char*`-returning export and decodes it in the Worker, so a string costs one round-trip instead of two.
- **Heap access**: Direct `HEAPU8`/`HEAPF32` access is forbidden from the main thread. Use `wasmProxy.heapRead(ptr, size)`, `heapWrite(ptr, data)`, `heapReadU32()`, `heapReadF32()`, `heapDataViewU32()` instead. These return **typed arrays** and transfer their buffers; never box heap data into plain Arrays.
- **Transferable**: Disk images sent to Worker via `wasmProxy.transfer()` for zero-copy ownership transfer.
- **Pushed pause state**: The Worker posts `MSG_PAUSE_STATE` whenever pause changes, cached on `wasmProxy.isPaused`. Per-frame code reads that synchronously instead of awaiting `_isPaused()`.
- **Bulk work belongs in C++**: A loop that would make one RPC per iteration should become one export. `_disassembleRange` and `_getBasicHeatMapData` exist for this reason.

### Shared Memory Transport

When `SharedArrayBuffer` is available (requires the COOP/COEP headers Vite sets), `main.js:setupSharedBuffers()` allocates three buffers and both the framebuffer and audio bypass `postMessage` entirely:

- **Framebuffer** — double-buffered (`FB_SLOTS`). The Worker writes the slot the renderer is not reading and publishes the index via `CTRL_FRAME_INDEX` + `CTRL_FRAME_READY`; `pollSharedFrame()` claims it with `Atomics.exchange`. This replaced allocating a fresh 860KB array every frame.
- **Audio ring** — the AudioWorklet reads generated samples directly, so the main thread is no longer in the audio critical path. Only the small refill request still routes through it.
- **Control block** — Int32 status fields (see `CTRL_*` in `shared-buffers.js`). Currently only pause and frame state are consumed; the register fields are groundwork for removing debug-window RPCs.

The `postMessage` path remains as a fallback and must keep working — do not delete it.

### Audio-Driven Timing

The emulator uses Web Audio API for precise timing:

1. AudioWorklet `process()` fires at 48kHz hardware rate
2. When the ring buffer runs low, the AudioWorklet requests samples from the main thread
3. Main thread forwards request to Worker via `MSG_REQUEST_SAMPLES`
4. Worker generates samples (running ~21.3 CPU cycles per sample)
5. Worker writes them into the shared audio ring, which the AudioWorklet reads directly

Sample *data* therefore never crosses the main thread; only the refill request does. Without `SharedArrayBuffer` the Worker falls back to posting samples for the main thread to relay, which works but puts a busy main thread in the audio path — and because audio paces the emulation, that shows up as speed instability rather than just crackle.

This ensures consistent speed driven by the audio hardware clock.

### WASM Interface Pattern

Single global `Emulator` instance in C++ (`wasm_interface.cpp`). WASM runs inside a Web Worker; all JS code accesses it via `WasmProxy` which returns Promises. Heap operations use `wasmProxy.heapRead()`/`heapWrite()` instead of direct `HEAPU8` access. `_malloc()` must be awaited; `_free()` is fire-and-forget. `stringToUTF8()`/`UTF8ToString()` are async. New WASM exports must be added to `CMakeLists.txt` EXPORTED_FUNCTIONS list.

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
- `Apple Parallel Interface Card ROM - 341-0057.bin` (512 bytes; upper half is 341-0005 "Parallel Printer" firmware)

## Code Organization

```
src/
├── core/               # C++ emulator (namespace a2e::)
│   ├── cpu/
│   │   └── 6502/          # Cycle-accurate 65C02 processor
│   ├── mmu/            # Memory management and soft switches
│   ├── video/          # Per-scanline video rendering
│   ├── audio/          # Speaker audio
│   ├── disk-image/     # Disk image formats (DSK/DO/PO/NIB/WOZ) and GCR encoding
│   ├── disassembler/   # 65C02 disassembler
│   ├── input/          # Keyboard handling
│   ├── cards/          # Expansion card system
│   │   ├── disk2/         # Disk II controller card
│   │   ├── mockingboard/  # AY-3-8910 + VIA 6522 + Mockingboard card
│   │   ├── mouse/         # Apple Mouse Interface Card
│   │   ├── parallel/      # Centronics parallel card
│   │   ├── smartport/     # SmartPort hard drive controller
│   │   ├── softcard/      # Microsoft Z-80 SoftCard
│   │   │   └── z80/       # Z80 CPU emulation core
│   │   ├── ssc/           # Super Serial Card + ACIA 6551
│   │   └── thunderclock/  # Thunderclock Plus real-time clock
│   ├── filesystem/     # DOS 3.3 and ProDOS parsers
│   ├── basic/          # BASIC tokenizer, detokenizer, Applesoft variable model
│   ├── debug/          # Condition evaluator, host debug log sink
│   ├── emulator/       # Split emulator implementation files
│   │   ├── emulator_state.cpp  # State serialization (exportState/importState)
│   │   └── emulator_debug.cpp  # Debug facilities (breakpoints, watchpoints, trace, beam)
│   ├── noslot_clock.cpp # DS1215 No-Slot Clock (ProDOS RTC at $C300)
│   ├── emulator.cpp    # Core coordinator
│   ├── emulator.hpp    # Emulator class declaration
│   └── types.hpp       # Shared constants and types
├── bindings/           # wasm_interface.cpp - WASM export glue
└── js/                 # ES6 modules, no framework
    ├── main.js         # Entry point, AppleIIeEmulator class
    ├── agent/          # AI agent tools and manager (MCP/AG-UI)
    ├── audio/          # Web Audio API driver and worklet
    ├── config/         # App version
    ├── debug/          # Debug window implementations
    ├── disk-manager/   # Disk drive operations, persistence, surface rendering, sounds
    ├── display/        # WebGL renderer, CRT shaders, display settings, no-signal screen
    ├── file-explorer/  # DOS 3.3 and ProDOS file browser, disassembler
    ├── help/           # Documentation and release notes
    ├── input/          # Keyboard input, text selection, joystick, mouse
    ├── state/          # Save state manager and persistence
    ├── ui/             # Menu wiring, reminders, slot configuration
    ├── utils/          # Shared utilities (storage, string, BASIC)
    ├── windows/        # Base window class and window manager
    └── worker/         # Web Worker: WASM proxy, emulator worker, RPC protocol
├── css/                # Stylesheets (bundled by Vite)
public/                 # Static assets, built WASM files, shaders
├── shaders/           # CRT vertex/fragment shaders
├── assets/            # Images and sounds
└── index.html         # Main HTML entry point
functions/
└── proxy/              # Cloudflare Pages Function — CORS proxy for URL-loaded media
plugins/
├── dev-proxy-plugin.js  # Vite dev-server middleware serving /proxy/url (mirrors the Pages Function)
├── serial-proxy-plugin.js  # WebSocket-to-TCP proxy
tests/
├── unit/               # Catch2 unit tests (CPU, cards, disk, audio, etc.)
├── integration/        # Catch2 integration tests (full emulator)
├── common/             # Shared test helpers (disk image builder, BASIC program builder)
└── catch2/             # Catch2 header-only framework
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
| 7    | $C0F0-$C0FF | $C700-$C7FF | SmartPort                   |

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

- `Disk2Card` (`cards/disk2/`) - Wraps Disk2Controller (slot 6)
- `MockingboardCard` (`cards/mockingboard/`) - Dual AY-3-8910 + VIA 6522, stereo output (slot 4)
- `MouseCard` (`cards/mouse/`) - Apple Mouse Interface Card via MC6821 PIA command protocol (slot 4)
- `ParallelCard` (`cards/parallel/`) - Centronics parallel port; drives Epson FX-80 and Apple DMP virtual printers (slots 1–2)
- `SmartPortCard` (`cards/smartport/`) - SmartPort hard drive controller, 2 block devices, self-built ROM (user-configurable slot)
- `SoftCardZ80` (`cards/softcard/`) - Microsoft Z-80 SoftCard with Z80 CPU emulation (`cards/softcard/z80/`)
- `SSCCard` (`cards/ssc/`) - Super Serial Card with ACIA 6551; drives ImageWriter I and ImageWriter II virtual printers (slots 1–2)
- `ThunderclockCard` (`cards/thunderclock/`) - ProDOS-compatible real-time clock (slots 5, 7)
- `NoSlotClock` - DS1215 real-time clock piggybacking on $C300 ROM (not a slot card; toggle in Expansion Slots UI)

## State Serialization

Binary format with versioned header. Includes CPU state, 128KB RAM, Language Card (16KB), soft switches, disk images with modifications, filenames, and debugger state. Autosave slot plus 5 manual save slots. Stored in browser IndexedDB. Window option state (toggles, view modes, mute states) is persisted separately via localStorage.

## Release Process

When the user says "release", perform all of the following steps:

1. **Review git log** since the last release notes entry to identify all changes
2. **Bump version** in `src/js/config/version.js`
3. **Update release notes** in `src/js/help/release-notes.js`
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

The Joystick window has a **Cursor Keys** toggle that also drives the joystick from the arrow keys (full deflection 0/255 per axis). The arrows keep reaching the emulator's keyboard as normal, so ProDOS selectors, catalog menus and BASIC line editing still work while the toggle is on. When enabled, a "CURSOR KEYS" chip appears in the Monitor title bar. The same toggle is in the View menu (`btn-cursor-keys-joystick`), which is how it is reached in the layouts that have no Monitor title bar; menu item, header switch and state restores are kept in sync through `JoystickWindow.onCursorKeysChanged`. The setting persists via localStorage.

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
- `captureScreenshot` — capture display as base64 PNG
- `captureScreenText` — read text from screen (optional row/col range)

**BASIC Program** (`basic-program-tools.js`)
- `directReadBasic` / `directWriteBasic` / `directRunBasic` / `directNewBasic` — direct memory operations
- `basicProgramLoadFromMemory` / `basicProgramLoadIntoEmulator` — transfer between editor and emulator
- `basicProgramRun` / `basicProgramPause` / `basicProgramNew` / `basicProgramRenumber` / `basicProgramFormat`
- `basicProgramGet` / `basicProgramSet` / `basicProgramLineCount`
- `basicProgramLoadFile` — load a sandbox file into the editor server-side (source bypasses LLM context); pairs with `save_to from:"basic-editor"`
- `saveBasicInEditorToLocal` — export from editor

**Assembler** (`assembler-tools.js`)
- `asmAssemble` — compile source code
- `asmWrite` — load assembled code into memory
- `asmLoadExample` — load template program
- `asmNew` / `asmGet` / `asmSet` — editor operations
- `asmLoadFile` — load a sandbox file into the editor server-side (source bypasses LLM context); pairs with `save_to from:"asm-editor"`
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
