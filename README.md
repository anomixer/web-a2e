# Apple //e Browser Emulator

A cycle-accurate Apple //e emulator that runs in the browser using WebAssembly and WebGL.

## Features

- **Cycle-accurate 65C02 CPU emulation** - All legal opcodes plus 65C02 extensions
- **Full Apple //e memory architecture** - 128KB RAM, language card, soft switches
- **Multiple display modes** - Text (40/80 col), LoRes, HiRes, Double HiRes
- **Audio-driven timing** - Speaker emulation with Web Audio API driving frame timing
- **WebGL rendering** - Hardware-accelerated display with optional CRT effects
- **Disk II controller** - DSK, DO, PO, and WOZ format support
- **Built-in debugger** - Breakpoints, memory viewer, disassembly, soft switch monitor

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

- `342-0135-A-CD.bin` - CD ROM (8KB)
- `342-0134-A-EF.bin` - EF ROM (8KB)
- `341-0160-A.bin` - Character ROM (8KB)
- `341-0027.bin` - Disk II ROM (256 bytes)

Alternatively, a combined ROM file `342-0349-B-C0-FF.bin` (16KB) can be used.

## Usage

1. Click **Power** to start the emulator
2. Use **Insert** buttons to load disk images (DSK, WOZ, DO, PO formats)
3. Type on your keyboard - keys are mapped to Apple II equivalents
4. Click **Debugger** to open the debugging panel

### Keyboard Mapping

| PC Key | Apple II |
|--------|----------|
| Backspace | Left Arrow (Delete) |
| Arrow Keys | Arrow Keys |
| Ctrl+Letter | Control characters |
| Escape | ESC |
| Enter | Return |

## Architecture

```
┌─────────────────────────────────────────┐
│           Browser Environment            │
├─────────────────────────────────────────┤
│  WebGL Renderer │ Web Audio │ Input     │
├─────────────────────────────────────────┤
│          JavaScript Bridge               │
├─────────────────────────────────────────┤
│          WebAssembly Module              │
│  ┌─────┬─────┬───────┬──────────────┐   │
│  │ CPU │ MMU │ Video │ Disk II      │   │
│  │65C02│     │       │              │   │
│  ├─────┴─────┴───────┴──────────────┤   │
│  │      Audio Buffer Driver          │   │
│  └───────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

### Audio-Driven Timing

The emulator uses the Web Audio API to drive timing:

1. Audio callback requests samples from WASM
2. WASM runs CPU for the required cycles (~21.3 cycles per sample at 48kHz)
3. Audio samples generated from speaker toggle events
4. Video frame rendered when cycle count crosses frame boundary

This approach ensures:
- Consistent emulation speed tied to audio playback
- No audio drift or crackling
- Works even when tab is in background (AudioWorklet)

## Project Structure

```
web-a2e/
├── src/
│   ├── core/           # C++ emulator core
│   │   ├── cpu/        # 65C02 CPU
│   │   ├── mmu/        # Memory management
│   │   ├── video/      # Display rendering
│   │   ├── audio/      # Speaker emulation
│   │   └── disk/       # Disk II controller
│   ├── bindings/       # WASM interface
│   └── js/             # JavaScript layer
├── public/             # Static assets
├── roms/               # ROM files (not included)
└── scripts/            # Build scripts
```

## License

This is a hobby project for educational purposes.

## Acknowledgments

- Based on the native [a2e](https://github.com/mikedaley/a2e) emulator
- CPU emulation derived from [MOS6502](https://github.com/mikedaley/MOS6502)
