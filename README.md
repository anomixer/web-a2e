# Apple //e Browser Emulator

A cycle-accurate Apple //e Enhanced emulator that runs in the browser using WebAssembly and WebGL.

## Features

- **Cycle-accurate 65C02 CPU emulation** - All legal opcodes plus 65C02 extensions
- **Full Apple //e memory architecture** - 128KB RAM, language card, auxiliary memory, soft switches
- **Multiple display modes** - Text (40/80 col), LoRes, Double LoRes, HiRes, Double HiRes
- **Audio-driven timing** - Speaker emulation with Web Audio API driving frame timing
- **WebGL rendering** - Hardware-accelerated display with optional CRT effects
- **Disk II controller** - DSK, DO, PO, NIB, and WOZ format support with write support
- **State persistence** - Auto-save and manual save/restore of complete emulator state
- **Built-in debugger** - CPU debugger, memory browser, heat map, soft switch monitor, and more

## Prerequisites

- [Emscripten SDK](https://emscripten.org/docs/getting_started/downloads.html) (3.0+)
- CMake 3.20+
- Node.js 18+ (for development server)

## Building

### Install Emscripten

```bash
# Clone emsdk
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk

# Install and activate latest version
./emsdk install latest
./emsdk activate latest

# Add to PATH (add to your shell profile for persistence)
source ./emsdk_env.sh
```

### Build the Emulator

```bash
# Install npm dependencies
npm install

# Build WASM module
npm run build:wasm

# Or manually:
mkdir -p build
cd build
emcmake cmake ..
emmake make -j$(sysctl -n hw.ncpu)
```

### Development

```bash
# Start development server
npm run dev
```

Open http://localhost:3000 in your browser.

## ROM Files

Place the following ROM files in the `roms/` directory:

| File | Size | Description |
|------|------|-------------|
| `342-0349-B-C0-FF.bin` | 16KB | Combined Apple IIe system ROM (C0-FF) |
| `342-0273-A-US-UK.bin` | 4KB | Character generator ROM (US/UK enhanced) |
| `341-0027.bin` | 256 bytes | Disk II controller ROM |

ROMs are embedded into the WASM binary at build time via `scripts/generate_roms.sh`.

## Usage

### Quick Start

1. Click **Power** to start the emulator
2. Click on the screen to give it keyboard focus
3. Use **Insert** buttons to load disk images (DSK, WOZ, DO, PO, NIB formats)
4. Type `PR#6` and press Return to boot from drive 1
5. Or press **Ctrl+Reset** to enter Applesoft BASIC

### Controls

| Button | Function |
|--------|----------|
| Power | Start/stop the emulator |
| Ctrl+Reset | Warm reset (preserves memory) |
| Reboot | Cold reset (full restart) |
| Full Page | Expand display to fill browser window |
| Drives | Show/hide the disk drive panel |
| State | Save/restore emulator state |
| Sound | Volume and mute controls |
| Display | CRT effects and image settings |
| Debug | CPU debugger and memory tools |
| Help | In-app documentation (F1) |

### State Management

The emulator can save and restore its complete state, including CPU registers, all memory (main + auxiliary), soft switch states, and disk contents.

**Auto-Save**: When enabled (default), the emulator automatically saves state every 5 seconds while running. This allows you to close the browser and resume exactly where you left off.

**Manual Save/Restore**:
- Click **Save Now** to immediately save the current state
- Click **Restore** to reload the last saved state (performs a full power cycle)
- State is stored in browser IndexedDB storage

**How It Works**:
1. State is serialized to a binary format with version control
2. Includes: CPU state, 128KB RAM, Language Card RAM, all soft switches, disk images with modifications
3. Restore performs a full power cycle (stop → start → import state)
4. Disk filenames are preserved and displayed in the drive UI after restore

### Disk Drives

Each drive supports:
- **Insert** - Load a disk image from file
- **Recent** - Quick access to last 20 used disks (per drive)
- **Blank** - Create a new formatted blank disk
- **Eject** - Remove disk (prompts to save if modified)

Drag and drop disk files directly onto drives. Modified disks can be saved when ejecting.

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

### Text Selection

Click and drag on the screen to select text. The selection is automatically copied to the clipboard when you release the mouse.

## Architecture

```
┌─────────────────────────────────────────────┐
│            Browser Environment               │
├─────────────────────────────────────────────┤
│  WebGL Renderer │ Web Audio │ IndexedDB     │
├─────────────────────────────────────────────┤
│           JavaScript Bridge                  │
│  ┌─────────────────────────────────────┐    │
│  │ Emulator │ DiskManager │ Debugger   │    │
│  └─────────────────────────────────────┘    │
├─────────────────────────────────────────────┤
│           WebAssembly Module                 │
│  ┌─────┬─────┬───────┬──────┬────────┐     │
│  │ CPU │ MMU │ Video │Audio │ Disk II│     │
│  │65C02│     │       │      │        │     │
│  └─────┴─────┴───────┴──────┴────────┘     │
│  ┌─────────────────────────────────────┐    │
│  │     State Serialization (Binary)    │    │
│  └─────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
```

### Audio-Driven Timing

The emulator uses the Web Audio API to drive timing:

1. AudioWorklet requests samples at 48kHz sample rate
2. WASM runs CPU for required cycles (~21.3 cycles per sample)
3. Speaker toggle events ($C030) generate audio waveform
4. Video frame rendered when cycle count crosses ~17030 cycles (60 Hz)

This approach ensures:
- Consistent emulation speed tied to audio playback
- No audio drift or crackling
- Works even when browser tab is in background (AudioWorklet)

### State Serialization

The emulator state is serialized to a versioned binary format:

```
┌──────────────────────────────────────┐
│ Header: Magic (4) + Version (4)      │
├──────────────────────────────────────┤
│ CPU: PC, SP, A, X, Y, P, Cycles      │
├──────────────────────────────────────┤
│ MMU: Soft switches, banking state    │
├──────────────────────────────────────┤
│ Memory: 64KB Main + 64KB Aux RAM     │
├──────────────────────────────────────┤
│ Language Card: 16KB RAM banks        │
├──────────────────────────────────────┤
│ Disk Controller: Drive state, data   │
│ - Track/phase positions              │
│ - Motor state, Q6/Q7 latches         │
│ - Full disk images with modifications│
│ - Filenames for UI restoration       │
└──────────────────────────────────────┘
```

State version is incremented when format changes to ensure compatibility.

## Project Structure

```
web-a2e/
├── src/
│   ├── core/           # C++ emulator core
│   │   ├── cpu/        # 65C02 CPU emulation
│   │   ├── mmu/        # Memory management unit
│   │   ├── video/      # Display rendering
│   │   ├── audio/      # Speaker emulation
│   │   ├── disk/       # Disk II controller
│   │   └── input/      # Keyboard handling
│   ├── bindings/       # WASM interface (wasm_interface.cpp)
│   └── js/             # JavaScript layer
│       ├── main.js           # Main emulator controller
│       ├── disk-manager/     # Disk drive UI management
│       ├── display-settings/ # Display configuration
│       ├── sound-settings/   # Audio configuration
│       ├── state-storage.js  # IndexedDB state persistence
│       └── debug/            # Debug window implementations
├── public/             # Static assets and built WASM
│   ├── css/            # Stylesheets
│   └── assets/         # Images and sounds
├── roms/               # ROM files (not included)
├── tests/              # Klaus Dormann CPU tests
└── scripts/            # Build scripts
```

## Debug Tools

The emulator includes comprehensive debugging capabilities:

| Tool | Description |
|------|-------------|
| **CPU Debugger** | View registers (A, X, Y, SP, PC, flags), step through instructions, set breakpoints |
| **Drive Monitor** | Watch disk drive activity, track position, motor state, read/write operations |
| **Soft Switches** | Monitor Apple II soft switches for memory banking, display modes, I/O |
| **Memory Browser** | Examine full 128KB address space with hex and ASCII views |
| **Memory Heat Map** | Real-time visualization of memory read/write activity |
| **Stack Viewer** | Monitor 6502 stack page ($0100-$01FF) |
| **Zero Page Watch** | Track changes to zero page locations ($00-$FF) |

## Testing

The project includes Klaus Dormann's comprehensive 6502/65C02 test suites:

```bash
# Build and run native tests
mkdir -p build-native && cd build-native
cmake ..
make -j$(sysctl -n hw.ncpu)
ctest --verbose
```

## License

This is a hobby project for educational purposes.

## Acknowledgments

- Based on the native [a2e](https://github.com/mikedaley/a2e) emulator
- CPU emulation derived from [MOS6502](https://github.com/mikedaley/MOS6502)
- Klaus Dormann's [6502 functional tests](https://github.com/Klaus2m5/6502_65C02_functional_tests)
