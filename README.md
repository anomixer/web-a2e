# Apple //e Browser Based Emulator

A cycle-accurate Apple //e Enhanced emulator running in the browser using WebAssembly and WebGL. No JavaScript frameworks — vanilla ES6 modules with Vite for bundling. Having built native emulators in the past, this is my first attempt at a browser-based emulator, hopefully making it easier to allow cross platform users from making use of it :)

## Features

- **Cycle-accurate 65C02 CPU** — All legal 6502 opcodes plus 65C02 extensions at 1.023 MHz
- **Full Apple //e memory architecture** — 128KB RAM (64KB main + 64KB auxiliary), language card, soft switches
- **Multiple display modes** — Text (40/80 col), LoRes, Double LoRes, HiRes, Double HiRes, monochrome
- **WebGL rendering** — Hardware-accelerated display with configurable CRT shader effects
- **Audio-driven timing** — Web Audio API AudioWorklet drives frame timing at 48kHz
- **Disk II controller** — DSK, DO, PO, and WOZ format support with write capability
- **Expansion cards** — Mockingboard sound card, Thunderclock Plus, Apple Mouse Interface Card
- **File explorer** — Browse DOS 3.3 and ProDOS disk contents with BASIC detokenizer and disassembler
- **Save states** — Autosave slot plus 5 manual save slots, stored in IndexedDB
- **Built-in debugger** — CPU debugger, memory browser, heat map, soft switch monitor, and more
- **Light/Dark/System themes** — Switchable colour scheme with Apple rainbow logo accent palette
- **PWA support** — Install as a standalone app with offline functionality

## Prerequisites

- [Emscripten SDK](https://emscripten.org/docs/getting_started/downloads.html) (3.0+)
- CMake 3.20+
- Node.js 18+

## ROM Files

Place the following ROM files in the `roms/` directory before building. ROMs are embedded into the WASM binary at compile time via `scripts/generate_roms.sh`.

| File | Size | Description |
|------|------|-------------|
| `342-0349-B-C0-FF.bin` | 16KB | Apple IIe system ROM |
| `342-0273-A-US-UK.bin` | 4KB | Character generator ROM (US/UK enhanced) |
| `341-0027.bin` | 256 bytes | Disk II controller ROM |
| `Thunderclock Plus ROM.bin` | 2KB | Thunderclock card ROM |
| `Apple Mouse Interface Card ROM - 342-0270-C.bin` | 2KB | Mouse Interface Card ROM |

An alternate character ROM variant `341-0160-A-US-UK.bin` (8KB) is also supported.

## Building

### Install Emscripten

```bash
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk
./emsdk install latest
./emsdk activate latest
source ./emsdk_env.sh
```

### Build and Run

```bash
npm install           # Install dependencies
npm run build:wasm    # Build WASM module (required first time and after C++ changes)
npm run dev           # Start dev server at localhost:3000 (hot-reload for JS only)
```

Open http://localhost:3000 in your browser.

### Other Commands

```bash
npm run build         # Full production build (WASM + Vite bundle)
npm run clean         # Clean build artifacts
npm run deploy        # Deploy to VPS via rsync
```

## Usage

### Quick Start

1. Click **Power** to start the emulator
2. Click on the screen to give it keyboard focus
3. Use **Insert** buttons to load disk images (DSK, DO, PO, WOZ)
4. Type `PR#6` and press Return to boot from drive 1
5. Or press **Ctrl+Reset** to enter Applesoft BASIC

### Keyboard Mapping

| PC Key | Apple II |
|--------|----------|
| Backspace | Delete (left arrow) |
| Arrow Keys | Arrow Keys |
| Left Alt | Open Apple (joystick button 0) |
| Right Alt / Win | Closed Apple (joystick button 1) |
| Ctrl+Letter | Control characters |
| Escape | ESC |
| Enter | Return |
| Ctrl+Break | Reset (Ctrl+Reset) |

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| F1 | Open help and documentation |
| Ctrl+Escape | Toggle full-page mode |
| Ctrl+V | Paste text into keyboard buffer |
| Ctrl+` | Open window switcher |
| Option+Tab | Cycle to next window |
| Option+Shift+Tab | Cycle to previous window |

### Text Selection

Click and drag on the screen to select text. The selection is automatically copied to the clipboard when you release the mouse.

### Disk Drives

Each drive supports:
- **Insert** — Load a disk image from file
- **Recent** — Quick access to last 20 used disks (tracked per drive)
- **Blank** — Create a new formatted blank disk
- **Eject** — Remove disk (prompts to save if modified)

Drag and drop disk files directly onto drives. Drive seek and motor sounds can be toggled on or off.

### File Explorer

Browse the contents of inserted disks:
- **DOS 3.3** — Catalog listing with file type icons (Text, Integer BASIC, Applesoft BASIC, Binary, etc.)
- **ProDOS** — Folder navigation with full ProDOS file type support
- **File viewer** — View files as hex, BASIC listing (detokenized), or disassembly
- **Disassembler** — Recursive descent flow analysis with symbol resolution

### Save States

- **Autosave** — Saves every 5 seconds while running (enabled by default)
- **5 manual slots** — Save and restore at any time from the Save States window
- State includes CPU registers, 128KB RAM, language card, soft switches, disk images with modifications, filenames, and debugger state
- Stored in browser IndexedDB

### Display Settings

The display settings window provides configurable CRT shader effects:

- Screen curvature, scanlines, shadow mask
- Phosphor glow, vignette, NTSC fringing
- Flicker, static noise, jitter, horizontal sync lines
- Brightness, contrast, saturation
- Sharp pixels toggle, overscan/border control
- Monochrome modes: Green, Amber, White

### Expansion Cards

Cards are configured via **View > Expansion Slots**.

| Slot | Default | Available Cards |
|------|---------|-----------------|
| 1 | Empty | — |
| 2 | Empty | — |
| 3 | 80-Column | Built-in (fixed) |
| 4 | Mockingboard | Mouse Card, Empty |
| 5 | Thunderclock Plus | Empty |
| 6 | Disk II | Empty |
| 7 | Empty | Thunderclock Plus |

**Mockingboard** — Dual AY-3-8910 sound chips with VIA 6522 timers. Stereo output with per-channel mute controls. All audio (speaker, Mockingboard, drive sounds) is unified under a single volume slider and mute toggle.

**Thunderclock Plus** — ProDOS-compatible real-time clock card.

**Apple Mouse Interface Card** — Mouse input via MC6821 PIA command protocol.

### Joystick

A floating joystick window provides visual paddle/joystick controls that map to the Apple II game ports ($C064-$C067).

## Architecture

```
+---------------------------------------------+
|            Browser Environment              |
|---------------------------------------------|
|  WebGL Renderer | Web Audio | IndexedDB     |
|---------------------------------------------|
|           JavaScript Layer (ES6)            |
|  +-------------------------------------+    |
|  | Emulator | DiskManager | Debugger   |    |
|  | Display  | FileExplorer| SaveStates |    |
|  +-------------------------------------+    |
|---------------------------------------------|
|           WebAssembly Module (C++)          |
|  +------+-----+-------+------+--------+     |
|  | CPU  | MMU | Video | Audio| Disk II|     |
|  |65C02 |128KB|       |      |        |     |
|  +------+-----+-------+------+--------+     |
|                                             |
|  +-------+------------+-------+-------+     |
|  | Cards | Filesystem | BASIC | Disasm|     |
|  +-------+------------+-------+-------+     |
+---------------------------------------------+
```

### Audio-Driven Timing

The emulator uses Web Audio API to drive timing:

1. AudioWorklet requests samples at 48kHz
2. WASM runs CPU for ~21.3 cycles per audio sample
3. Speaker toggle events ($C030) generate the audio waveform
4. Video frame rendered when cycle count crosses ~17,030 cycles (60 Hz)

This ensures consistent emulation speed, no audio drift, and operation even when the browser tab is backgrounded.

### WASM Interface

Single global `Emulator` instance in C++ (`wasm_interface.cpp`). JavaScript allocates WASM heap memory with `_malloc`/`_free` and uses `stringToUTF8()`/`UTF8ToString()` for string conversion. New WASM exports must be added to the `EXPORTED_FUNCTIONS` list in `CMakeLists.txt`.

## Debug Tools

All debug windows are accessible from the **Debug** menu.

| Tool | Description |
|------|-------------|
| **CPU Debugger** | Registers (REGS, FLAGS, TIMING, BEAM sections), breakpoints, step/over/out, disassembly with symbols |
| **Memory Browser** | Full 128KB hex/ASCII view with search |
| **Memory Heat Map** | Real-time memory access visualization (read/write/combined) |
| **Memory Map** | Address space layout overview |
| **Stack Viewer** | Monitor stack page ($0100-$01FF) |
| **Zero Page Watch** | Monitor zero page locations with predefined and custom watches |
| **Soft Switch Monitor** | Apple II soft switch states ($C000-$C0FF) |
| **Mockingboard** | Unified channel-centric view: AY-3-8910 and VIA registers, inline waveforms, level meters, per-channel mute controls |
| **Mouse Card** | PIA registers, position, mode, interrupt state |
| **Rule Builder** | Complex conditional breakpoints with C-style expressions |

The CPU debugger supports breakpoints (conditional with expression evaluation), watchpoints, beam breakpoints (video position with wildcard-scanline support), execution tracing, and a call stack viewer. Labels and symbols are supported for both system routines and user-defined addresses. Debugger state (breakpoints, watches, settings) persists across save/load.

## Dev Tools

Development tools are accessible from the **Dev** menu.

| Tool | Description |
|------|-------------|
| **BASIC Program** | Write, edit, and paste Applesoft BASIC programs into the emulator with syntax highlighting and autocomplete |
| **Assembler** | Full 65C02 assembler with Merlin-style syntax, live validation, ROM routines reference, breakpoint support, and file save/load |

### Assembler Features

- **Syntax highlighting** for opcodes, directives, labels, operands, and comments
- **Column guides** for Merlin's column-based format (Label, Opcode, Operand, Comment)
- **Live validation** with inline error messages
- **ROM Routines Reference** (F2) — searchable database of Apple II ROM routines with insert capability
- **Breakpoints** — click gutter or press F9 to toggle breakpoints on instruction lines
- **File operations** — New, Open, Save with Ctrl/Cmd+N/O/S shortcuts
- **Symbols panel** — view all defined labels and their addresses
- **Hex output** — view assembled machine code bytes

## Testing

### CPU Compliance Tests

Klaus Dormann's 6502/65C02 functional test suites:

```bash
mkdir -p build-native && cd build-native
cmake ..
make -j$(sysctl -n hw.ncpu)
ctest --verbose
```

Test executables: `klaus_6502_test` (NMOS 6502), `klaus_65c02_test` (65C02 extended opcodes).

### Thunderclock Tests

Native C++ tests for Thunderclock card emulation, including MMU integration:

```bash
# Built and run via the same native CMake build above
```

### GCR Encoding Tests

Native C++ tests for Group Code Recording disk encoding logic.

### Integration Tests

JavaScript tests for disk boot, memory, and debugging:

```bash
node tests/integration/disk-boot-test.js
```

## Project Structure

```
web-a2e/
├── src/
│   ├── core/                # C++ emulator core (namespace a2e::)
│   │   ├── cpu/             # 65C02 CPU emulation
│   │   ├── mmu/             # Memory management, soft switches
│   │   ├── video/           # Per-scanline video rendering
│   │   ├── audio/           # Speaker emulation
│   │   ├── disk-image/      # Disk formats (DSK/DO/PO/WOZ), GCR encoding
│   │   ├── disassembler/    # 65C02 disassembler
│   │   ├── input/           # Keyboard handling
│   │   ├── cards/           # Expansion card system
│   │   │   └── mockingboard/  # AY-3-8910 + VIA 6522
│   │   ├── filesystem/      # DOS 3.3 and ProDOS parsers
│   │   ├── basic/           # BASIC detokenizer
│   │   ├── assembler/       # 65C02 assembler (Merlin-style syntax)
│   │   ├── debug/           # Condition evaluator
│   │   ├── emulator.cpp     # Core coordinator, state serialization
│   │   └── types.hpp        # Shared constants
│   ├── bindings/            # wasm_interface.cpp (WASM exports)
│   └── js/                  # ES6 modules
│       ├── main.js          # AppleIIeEmulator entry point
│       ├── audio/           # Web Audio API driver and AudioWorklet
│       ├── config/          # App version
│       ├── debug/           # Debug window implementations
│       ├── disk-manager/    # Drive UI, persistence, surface renderer, sounds
│       ├── display/         # WebGL renderer, CRT shaders, display settings
│       ├── file-explorer/   # DOS 3.3/ProDOS browser, file viewer, disassembler
│       ├── help/            # Documentation and release notes
│       ├── input/           # Keyboard, text selection, joystick, mouse
│       ├── state/           # Save state manager and persistence
│       ├── ui/              # Menu wiring, reminders, slot configuration
│       ├── utils/           # Storage, string, BASIC utilities
│       └── windows/         # Base window class and window manager
├── public/                  # Static assets, built WASM, shaders
│   ├── css/                 # Stylesheets
│   ├── shaders/             # CRT vertex/fragment shaders
│   ├── assets/              # Images and sounds
│   └── index.html           # Main HTML entry point
├── roms/                    # ROM files (not included)
├── tests/
│   ├── klaus/               # Klaus Dormann CPU compliance tests
│   ├── thunderclock/        # Thunderclock card tests
│   ├── integration/         # JS integration tests
│   └── gcr/                 # GCR encoding tests
├── scripts/                 # Build scripts (generate_roms.sh)
├── CMakeLists.txt           # C++ build configuration
├── vite.config.js           # Vite bundler configuration
└── package.json
```

## Development Workflow

**C++ changes** require rebuilding WASM: `npm run build:wasm`

**JavaScript changes** auto-reload via the Vite dev server.

**Full build** for production: `npm run build` (outputs to `dist/`).

## Browser Compatibility

Requires WebAssembly, WebGL 2.0, Web Audio API (AudioWorklet), IndexedDB, and Service Worker support. Works in current versions of Chrome, Firefox, Safari, and Edge.

## TODO

### Expansion Cards
- **Microsoft Softcard (Z80)** — Z80 co-processor card for running CP/M software
- **Super Serial Card** — RS-232 serial interface for printer and modem emulation
- **Parallel Printer Card** — Centronics parallel port for printing to file/PDF

### Input
- **Host game controller support** — Map physical USB/Bluetooth gamepads to Apple II joystick via the Gamepad API
- **Configurable key bindings** — Allow remapping of Apple II keys and shortcuts

### Disk & Storage
- **Improved WOZ copy protection compatibility** — Better support for timing-sensitive copy protection schemes (quarter-track stepping, weak/flux bits, cross-track sync)
- **2IMG format support** — Universal disk image format with metadata
- **SmartPort / 3.5" drive emulation** — ProDOS block devices and 800KB disk support
- **Hard disk emulation** — Virtual hard disk image for large ProDOS volumes

### Development Tools
- **Source-level debugging** — Step through assembly source with symbol mapping from assembler
- **Profiler** — Cycle-accurate performance profiling with per-routine breakdown and heat maps
- **I/O trace log** — Record and replay soft switch and card I/O activity

### Audio
- **Mockingboard speech synthesis** — SC-01 Votrax speech chip emulation
- **SAM speech synthesizer** — Software Automatic Mouth support

### Display
- **Video recording** — Capture emulator screen to video file
- **Screenshot export** — Save screen contents as PNG

### Networking
- **Uthernet / Ethernet emulation** — TCP/IP networking via WebSocket bridge for Contiki, etc.

### Platform
- **Disk image library** — Browse and load from a curated online software archive
- **URL disk loading** — Load disk images directly from a URL parameter
- **Mobile touch controls** — On-screen keyboard and virtual joystick optimized for touch devices

## License

MIT License. See [LICENSE](LICENSE) for details.

## Acknowledgments

- Based on the native [a2e](https://github.com/mikedaley/a2e) emulator
- CPU emulation derived from [MOS6502](https://github.com/mikedaley/MOS6502)
- Klaus Dormann's [6502 functional tests](https://github.com/Klaus2m5/6502_65C02_functional_tests)
- Inspired by [AppleWin](https://github.com/AppleWin/AppleWin) and [Apple2TS](https://github.com/nickmcummins/apple2ts), both outstanding Apple II emulators that have been invaluable references for hardware accuracy and feature direction
