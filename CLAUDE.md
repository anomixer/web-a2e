# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Apple //e Browser Emulator - A cycle-accurate Apple II Enhanced emulator running in the browser using WebAssembly (C++ backend) and WebGL rendering. No JavaScript frameworks; vanilla ES6 modules with Vite for bundling.

## Build Commands

```bash
npm install           # Install dependencies
npm run build:wasm    # Build WASM module (required first time and after C++ changes)
npm run dev           # Start dev server at localhost:3000 (hot-reload for JS only)
npm run build         # Full production build (WASM + Vite bundle)
npm run clean         # Clean build artifacts
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

Test executables: `klaus_6502_test` (6502), `klaus_65c02_test` (65C02 extended opcodes)

### Integration Tests

Ad-hoc JavaScript tests for disk, memory, and boot debugging (`tests/integration/`). Run with Node.js:

```bash
node tests/integration/disk-boot-test.js
```

### GCR Encoding Tests

GCR (Group Code Recording) encoding tests (`tests/gcr/`). Native C++ tests for disk encoding logic.

## Architecture

### Two-Layer Design

**C++ Core (src/core/)** - Pure emulation logic compiled to WebAssembly:
- `cpu/cpu6502.cpp` - Cycle-accurate 65C02 processor
- `mmu/mmu.cpp` - 128KB memory management, soft switches ($C000-$CFFF)
- `video/video.cpp` - TEXT/LORES/HIRES/DHIRES rendering
- `audio/audio.cpp` - Speaker emulation from $C030 toggles
- `disk/disk2.cpp` - Disk II controller (DSK/DO/PO/NIB/WOZ formats)
- `mockingboard/` - AY-3-8910 sound card + VIA 6522 timer
- `emulator.cpp` - Core coordinator, state serialization

**JavaScript Layer (src/js/)** - Browser integration:
- `main.js` - AppleIIeEmulator class orchestrating all subsystems
- `webgl-renderer.js` - WebGL display with CRT shader effects
- `audio-driver.js` - Web Audio API with AudioWorklet timing
- `disk-manager/` - Disk drive UI, persistence, operations
- `file-explorer/` - DOS 3.3 and ProDOS disk browser
- `debug/` - CPU debugger, memory browser, heat map, Mockingboard windows

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

**ROM files** are embedded into WASM at compile time. Place in `roms/` directory before building:
- `342-0349-B-C0-FF.bin` (16KB system ROM)
- `342-0273-A-US-UK.bin` (4KB character ROM)
- `341-0027.bin` (256 bytes Disk II ROM)

## Code Organization

```
src/
├── core/           # C++ emulator (namespace a2e::)
├── bindings/       # wasm_interface.cpp - WASM export glue
└── js/             # ES6 modules, no framework
    ├── main.js         # Entry point, AppleIIeEmulator class
    ├── audio/          # Web Audio API driver and worklet
    ├── config/         # Version and release notes
    ├── debug/          # Debug window implementations
    ├── disk-manager/   # Disk drive operations and persistence
    ├── display/        # WebGL renderer with CRT effects
    ├── file-explorer/  # DOS 3.3 and ProDOS file browser
    ├── input/          # Keyboard input and text selection
    ├── state/          # State serialization and persistence
    ├── ui/             # UI controls and non-debug windows
    ├── utils/          # Shared utilities (storage, string, BASIC)
    └── windows/        # Base window class and window manager
public/             # Static assets, built WASM files
tests/
├── klaus/          # Klaus Dormann CPU compliance tests
├── integration/    # JS integration/debug tests
└── gcr/            # GCR encoding tests
```

### File Naming Convention

All JavaScript files use **kebab-case** (e.g., `audio-driver.js`, `cpu-debugger-window.js`). Class names remain PascalCase in the code.

## State Serialization

Binary format with versioned header. Includes CPU state, 128KB RAM, Language Card (16KB), soft switches, disk images with modifications, and filenames. Stored in browser IndexedDB.

## Debugging

Built-in debug windows accessible via Debug menu:
- CPU Debugger: registers, breakpoints, stepping, disassembly with symbols
- Memory Browser: hex/ASCII view of 128KB address space
- Memory Heat Map: real-time memory access visualization
- Soft Switch Monitor: Apple II switch states
- Mockingboard: AY-3-8910 and VIA register inspection
