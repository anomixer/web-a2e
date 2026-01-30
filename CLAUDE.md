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

### Thunderclock Tests

Native C++ tests for Thunderclock card emulation (`tests/thunderclock/`). Built and run via the same native CMake build above.

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
- `mmu/mmu.cpp` - 128KB memory management, soft switches ($C000-$CFFF), expansion slots
- `video/video.cpp` - TEXT/LORES/HIRES/DHIRES per-scanline rendering
- `audio/audio.cpp` - Speaker emulation from $C030 toggles
- `disk-image/` - Disk image format support (DSK/DO/PO/WOZ) with GCR encoding
- `disassembler/` - 65C02 instruction disassembler
- `input/keyboard.cpp` - Keyboard input handling
- `cards/` - Pluggable expansion card system (ExpansionCard interface)
- `cards/mockingboard/` - AY-3-8910 sound chip + VIA 6522 timer
- `emulator.cpp` - Core coordinator, state serialization

**JavaScript Layer (src/js/)** - Browser integration:
- `main.js` - AppleIIeEmulator class orchestrating all subsystems
- `audio/` - Web Audio API driver and AudioWorklet
- `display/` - WebGL renderer with CRT shader effects
- `disk-manager/` - Disk drive UI, persistence, surface rendering, drive sounds
- `file-explorer/` - DOS 3.3 and ProDOS disk browser with disassembler
- `debug/` - Debug window implementations (see Debugging section)
- `ui/` - UI controls, display settings, slot configuration, joystick, screen window
- `input/` - Keyboard input and text selection
- `state/` - State serialization and persistence
- `config/` - Version and release notes
- `utils/` - Shared utilities (storage, string, BASIC)
- `windows/` - Base window class and window manager

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
- `342-0273-A-US-UK.bin` (4KB character ROM, US/UK)
- `341-0160-A-US-UK.bin` (alternate character ROM variant)
- `341-0027.bin` (256 bytes Disk II ROM)
- `Thunderclock Plus ROM.bin` (2KB Thunderclock card ROM)

## Code Organization

```
src/
├── core/               # C++ emulator (namespace a2e::)
│   ├── cpu/            # 65C02 processor
│   ├── mmu/            # Memory management and soft switches
│   ├── video/          # Per-scanline video rendering
│   ├── audio/          # Speaker audio
│   ├── disk-image/     # Disk image formats (DSK/WOZ) and GCR encoding
│   ├── disassembler/   # 65C02 disassembler
│   ├── input/          # Keyboard handling
│   ├── cards/          # Expansion card system
│   │   └── mockingboard/  # AY-3-8910 + VIA 6522
│   ├── emulator.cpp    # Core coordinator
│   └── types.hpp       # Shared constants and types
├── bindings/           # wasm_interface.cpp - WASM export glue
└── js/                 # ES6 modules, no framework
    ├── main.js         # Entry point, AppleIIeEmulator class
    ├── audio/          # Web Audio API driver and worklet
    ├── config/         # Version and release notes
    ├── debug/          # Debug window implementations
    ├── disk-manager/   # Disk drive operations, persistence, surface rendering
    ├── display/        # WebGL renderer with CRT effects
    ├── file-explorer/  # DOS 3.3 and ProDOS file browser, disassembler
    ├── input/          # Keyboard input and text selection
    ├── state/          # State serialization and persistence
    ├── ui/             # UI controls, display settings, slot config, joystick
    ├── utils/          # Shared utilities (storage, string, BASIC)
    └── windows/        # Base window class and window manager
public/                 # Static assets, built WASM files, shaders
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

| Slot | I/O Space | ROM Space | Typical Card |
|------|-----------|-----------|--------------|
| 1 | $C090-$C09F | $C100-$C1FF | Printer |
| 2 | $C0A0-$C0AF | $C200-$C2FF | Serial |
| 3 | $C0B0-$C0BF | $C300-$C3FF | 80-column (built-in) |
| 4 | $C0C0-$C0CF | $C400-$C4FF | Mockingboard |
| 5 | $C0D0-$C0DF | $C500-$C5FF | Thunderclock |
| 6 | $C0E0-$C0EF | $C600-$C6FF | Disk II |
| 7 | $C0F0-$C0FF | $C700-$C7FF | ProDOS RAM disk |

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
- `MockingboardCard` - Wraps Mockingboard AY-3-8910 + VIA 6522 (slot 4)
- `ThunderclockCard` - ProDOS-compatible real-time clock (slot 5)

## State Serialization

Binary format with versioned header. Includes CPU state, 128KB RAM, Language Card (16KB), soft switches, disk images with modifications, and filenames. Stored in browser IndexedDB. Window option state (toggles, view modes, mute states) is persisted separately via localStorage.

## Git Commits

Do not add `Co-Authored-By` or any other attribution lines for Claude in commit messages.

## Debugging

Built-in debug windows accessible via Debug menu:
- CPU Debugger: registers, breakpoints, stepping, disassembly with symbols
- Memory Browser: hex/ASCII view of 128KB address space
- Memory Heat Map: real-time memory access visualization (read/write/combined modes)
- Memory Map: address space layout overview
- Stack Viewer: live stack contents
- Zero Page Watch: monitor zero page locations with predefined and custom watches
- Soft Switch Monitor: Apple II switch states
- Mockingboard Detail: AY-3-8910 and VIA register inspection
- Mockingboard Scope: per-channel waveforms, level meters, and mute controls
- BASIC Program Viewer: list BASIC programs from memory
