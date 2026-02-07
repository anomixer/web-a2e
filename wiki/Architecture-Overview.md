# Architecture Overview

This page describes the internal architecture of the Apple //e emulator, covering the two-layer design, audio-driven timing model, WebAssembly interface, and build system.

---

## Table of Contents

- [Two-Layer Design](#two-layer-design)
- [Component Wiring](#component-wiring)
- [Audio-Driven Timing](#audio-driven-timing)
- [Frame Synchronization](#frame-synchronization)
- [WASM Interface](#wasm-interface)
- [Rendering Pipeline](#rendering-pipeline)
- [Build System](#build-system)
- [Key Constants](#key-constants)

---

## Two-Layer Design

The emulator is split into two distinct layers:

**C++ Core** (`src/core/`) -- Pure emulation logic compiled to WebAssembly. This layer has no browser dependencies and contains:

| Component | File | Responsibility |
|-----------|------|----------------|
| CPU | `cpu/cpu6502.cpp` | Cycle-accurate 65C02 processor |
| MMU | `mmu/mmu.cpp` | 128KB memory, soft switches, expansion slots |
| Video | `video/video.cpp` | Per-scanline rendering of all 6 video modes |
| Audio | `audio/audio.cpp` | Speaker toggle tracking and sample generation |
| Disk | `disk-image/` | DSK/DO/PO/NIB/WOZ format support with GCR encoding |
| Input | `input/keyboard.cpp` | Browser keycode to Apple II keycode translation |
| Cards | `cards/` | Pluggable expansion card system (Disk II, Mockingboard, Thunderclock, Mouse) |
| Emulator | `emulator.cpp` | Core coordinator, state serialization |

**JavaScript Layer** (`src/js/`) -- Browser integration using vanilla ES6 modules (no frameworks):

| Component | Directory | Responsibility |
|-----------|-----------|----------------|
| Main | `main.js` | `AppleIIeEmulator` class, initialization, render loop |
| Audio | `audio/` | Web Audio API driver, AudioWorklet processor |
| Display | `display/` | WebGL renderer, CRT shader effects |
| Disk Manager | `disk-manager/` | Disk drive UI, persistence, surface rendering |
| File Explorer | `file-explorer/` | DOS 3.3 and ProDOS disk browser |
| Debug | `debug/` | CPU debugger, memory browser, soft switch monitor, etc. |
| State | `state/` | Save state manager (autosave + 5 manual slots) |
| Input | `input/` | Keyboard handling, text selection, joystick, mouse |
| Windows | `windows/` | Base window class and window manager |

The C++ core is compiled to WebAssembly using Emscripten and exposed to JavaScript through a flat C function interface defined in `src/bindings/wasm_interface.cpp`.

---

## Component Wiring

The `Emulator` class (in `emulator.cpp`) acts as the central coordinator. During construction, it creates all subsystems and wires them together using callbacks:

```
Emulator
  |
  +-- CPU6502  (read/write callbacks -> MMU)
  |
  +-- MMU      (keyboard, speaker, button, cycle callbacks -> Emulator)
  |     |
  |     +-- ExpansionCard slots[1..7]
  |           +-- Slot 3: 80-column (built-in)
  |           +-- Slot 4: MockingboardCard
  |           +-- Slot 5: ThunderclockCard
  |           +-- Slot 6: Disk2Card
  |
  +-- Video    (cycle callback -> CPU, switch callback -> MMU)
  |
  +-- Audio    (Mockingboard pointer for stereo mixing)
  |
  +-- Keyboard (key callback -> Emulator)
```

The CPU does not access memory directly. Instead, it calls lambda functions provided at construction time that route through the MMU:

```cpp
cpu_ = std::make_unique<CPU6502>(
    [this](uint16_t addr) { return cpuRead(addr); },
    [this](uint16_t addr, uint8_t val) { cpuWrite(addr, val); },
    CPUVariant::CMOS_65C02);
```

The MMU in turn delegates I/O space reads/writes to expansion cards based on the address range, and invokes speaker, keyboard, and button callbacks to communicate back to the Emulator.

---

## Audio-Driven Timing

The emulator uses the Web Audio API as its primary timing source rather than `requestAnimationFrame` or `setInterval`. This approach provides several advantages:

1. **Precise timing** -- The audio callback runs at exactly 48,000 Hz, providing consistent sample-level timing.
2. **Background tab support** -- Web Audio continues to fire in background tabs, keeping emulation running when the tab is not visible.
3. **Synchronized audio** -- Speaker clicks and Mockingboard output are generated in lockstep with CPU execution, preventing drift.

### How It Works

The timing chain flows as follows:

```
AudioWorklet (48kHz)
  --> requests 1600 sample frames from main thread
    --> AudioDriver.generateSamples(count)
      --> WASM _generateStereoAudioSamples(buffer, count)
        --> Emulator::runCycles(count * CYCLES_PER_SAMPLE * speedMultiplier)
          --> CPU executes instructions
          --> Video renders scanlines progressively
          --> Disk controller updates per instruction
          --> Mockingboard timers tick
        --> Audio::generateStereoSamples() produces speaker + Mockingboard output
      --> JS copies samples from WASM heap
    --> Samples sent back to AudioWorklet via postMessage
  --> AudioWorklet deinterleaves into L/R channels for output
```

The AudioWorklet processor (`audio-worklet.js`) runs on a separate thread. It processes 128 samples at a time in its `process()` method, consuming from an internal buffer. When the buffer drops below 1,600 frames, it sends a `requestSamples` message to the main thread. The main thread responds by running the emulator for the required number of cycles and returning the generated samples.

Each audio sample requires approximately 21.3 CPU cycles (`1,023,000 / 48,000`). The WASM function `generateStereoAudioSamples` runs the emulator for `sampleCount * CYCLES_PER_SAMPLE * speedMultiplier` cycles, then generates interleaved stereo samples (speaker centered on both channels, Mockingboard PSG1 on left, PSG2 on right).

### Fallback Timing

When Web Audio is unavailable (suspended by autoplay policy, no audio hardware), the `AudioDriver` falls back to a `setInterval` at 60 Hz, running approximately 17,050 cycles per tick. Audio resumes automatically on the first user interaction.

---

## Frame Synchronization

Frame boundaries are detected inside the emulator's main execution loop. After each instruction, the emulator checks whether `CYCLES_PER_FRAME` (17,030) cycles have elapsed since the last frame:

```cpp
if (currentCycle - lastFrameCycle_ >= CYCLES_PER_FRAME) {
    lastFrameCycle_ += CYCLES_PER_FRAME;  // Aligned increment, no drift
    video_->renderFrame();
    video_->beginNewFrame(lastFrameCycle_);
    frameReady_ = true;
}
```

The frame boundary is advanced by exactly `CYCLES_PER_FRAME` rather than set to the current cycle count. This prevents drift and keeps the VBL detection at `$C019` synchronized with raster effects.

On the JavaScript side, `consumeFrameSamples()` tracks how many audio samples have been generated. At 48,000 Hz / 60 Hz = 800 samples per frame, this provides frame-level synchronization. When one or more frames' worth of samples are generated, `AudioDriver` triggers `onFrameReady`, which calls `renderFrame()` to upload the framebuffer to the WebGL texture.

The `requestAnimationFrame` render loop handles display updates for the non-audio path: debug window updates, beam crosshair overlays, drive LED animations, and forced re-renders when the CPU is paused.

---

## WASM Interface

The C++ core is exposed to JavaScript through a single global `Emulator` instance accessed via flat C functions in `wasm_interface.cpp`. A single static pointer `g_emulator` holds the instance:

```cpp
static a2e::Emulator *g_emulator = nullptr;
```

### Memory Management

JavaScript uses Emscripten's `_malloc` / `_free` for WASM heap allocation and `HEAPU8` / `HEAPF32` for direct memory access. String conversion uses `stringToUTF8()` and `UTF8ToString()`. Example pattern for audio:

```javascript
const bufferPtr = wasmModule._malloc(count * 2 * 4);  // stereo floats
wasmModule._generateStereoAudioSamples(bufferPtr, count);
for (let i = 0; i < count * 2; i++) {
    samples[i] = wasmModule.HEAPF32[(bufferPtr >> 2) + i];
}
wasmModule._free(bufferPtr);
```

### Exported Functions

All WASM exports are listed explicitly in `CMakeLists.txt` under `EXPORTED_FUNCTIONS`. To add a new export:

1. Define the `extern "C"` function in `wasm_interface.cpp` with `EMSCRIPTEN_KEEPALIVE`
2. Add the mangled name (prefixed with `_`) to the `EXPORTED_FUNCTIONS` list in `CMakeLists.txt`
3. Rebuild WASM with `npm run build:wasm`

The exported API covers:

| Category | Examples |
|----------|----------|
| Lifecycle | `_init`, `_reset`, `_warmReset` |
| Execution | `_runCycles`, `_generateStereoAudioSamples`, `_stepInstruction` |
| CPU State | `_getPC`, `_getA`, `_getX`, `_getY`, `_getSP`, `_getP`, `_getTotalCycles` |
| Memory | `_readMemory`, `_writeMemory`, `_peekMemory`, `_readMainRAM` |
| Video | `_getFramebuffer`, `_getFramebufferSize`, `_isFrameReady`, `_forceRenderFrame` |
| Audio | `_setAudioVolume`, `_setAudioMuted` |
| Disk | `_insertDisk`, `_ejectDisk`, `_getDiskData`, `_isDiskInserted` |
| Debug | `_addBreakpoint`, `_stepOver`, `_stepOut`, `_addWatchpoint`, `_setTraceEnabled` |
| Expansion | `_getSlotCard`, `_setSlotCard`, `_isSlotEmpty` |
| Filesystem | `_isDOS33Format`, `_isProDOSFormat`, `_getDOS33Catalog`, `_getProDOSCatalog` |

---

## Rendering Pipeline

The rendering pipeline has two stages:

**C++ Video Rendering** -- The `Video` class renders into a 560x384 RGBA framebuffer (280x192 doubled). Rendering is progressive: `renderUpToCycle()` is called after each CPU instruction to render scanlines up to the current beam position. At frame boundaries, `renderFrame()` finalizes the current frame using a change log that records video switch changes at specific cycles.

**WebGL Display** -- The JavaScript `WebGLRenderer` uploads the framebuffer as a texture and applies CRT shader effects (scanlines, curvature, bloom, phosphor glow). The display pipeline:

```
WASM Framebuffer (560x384 RGBA)
  --> JS reads via HEAPU8[fbPtr..fbPtr+fbSize]
  --> WebGLRenderer.updateTexture(framebuffer)
  --> Fragment shader applies CRT effects
  --> Canvas displays final output
```

---

## Build System

The project uses CMake for C++ compilation and Vite for JavaScript bundling.

### WASM Build

```bash
npm run build:wasm
```

This invokes Emscripten's `emcmake cmake` and `emmake make` to compile the C++ core to WebAssembly. Key Emscripten settings:

| Setting | Value | Purpose |
|---------|-------|---------|
| `WASM` | 1 | Output WebAssembly |
| `MODULARIZE` | 1 | Wrap in factory function |
| `EXPORT_NAME` | `createA2EModule` | Global factory name |
| `ALLOW_MEMORY_GROWTH` | 1 | Dynamic heap expansion |
| `INITIAL_MEMORY` | 32 MB | Starting heap size |
| `MAXIMUM_MEMORY` | 64 MB | Maximum heap size |
| `NO_EXIT_RUNTIME` | 1 | Keep runtime alive |
| `ASYNCIFY` | 0 | Disabled (not needed) |
| Optimization | `-O3 -flto` | Full optimization with LTO |

Output files (`a2e.js` and `a2e.wasm`) are copied to `public/` after compilation.

### ROM Embedding

ROM files are embedded at compile time. A shell script (`scripts/generate_roms.sh`) converts binary ROM files into C arrays in `generated/roms.cpp`, which is `#include`-ed by `emulator.cpp`. The embedded ROMs are:

| ROM File | Size | Purpose |
|----------|------|---------|
| `342-0349-B-C0-FF.bin` | 16 KB | System ROM ($C000-$FFFF) |
| `342-0273-A-US-UK.bin` | 4 KB | Character ROM (US/UK) |
| `341-0027.bin` | 256 bytes | Disk II controller ROM |
| `Thunderclock Plus ROM.bin` | 2 KB | Thunderclock card ROM |
| `Apple Mouse Interface Card ROM` | 2 KB | Mouse card ROM |

### JavaScript Build

```bash
npm run dev      # Vite dev server at localhost:3000 with hot reload
npm run build    # Production build (WASM + Vite bundle) to dist/
```

The Vite build handles ES6 module bundling, CSS processing, and asset optimization. The audio worklet (`audio-worklet.js`) is loaded separately since worklets cannot be bundled.

### Native Build (Testing)

```bash
mkdir -p build-native && cd build-native
cmake ..
make -j$(sysctl -n hw.ncpu)
ctest --verbose
```

The native build compiles test executables for CPU compliance (Klaus Dormann), Thunderclock card behavior, and GCR encoding. The emulator itself does not have a native runtime target.

---

## Key Constants

Defined in `src/core/types.hpp`:

| Constant | Value | Description |
|----------|-------|-------------|
| `CPU_CLOCK_HZ` | 1,023,000 | CPU clock frequency (1.023 MHz) |
| `AUDIO_SAMPLE_RATE` | 48,000 | Audio output sample rate |
| `CYCLES_PER_SAMPLE` | ~21.3125 | CPU cycles per audio sample |
| `CYCLES_PER_SCANLINE` | 65 | CPU cycles per horizontal scanline |
| `SCANLINES_PER_FRAME` | 262 | Total scanlines per frame (192 visible + 70 VBL) |
| `CYCLES_PER_FRAME` | 17,030 | CPU cycles per video frame (65 x 262) |
| `SCREEN_WIDTH` | 560 | Framebuffer width (280 x 2) |
| `SCREEN_HEIGHT` | 384 | Framebuffer height (192 x 2) |
| `FRAMEBUFFER_SIZE` | 860,160 | Framebuffer byte size (560 x 384 x 4 RGBA) |
| `MAIN_RAM_SIZE` | 65,536 | Main RAM (64 KB) |
| `AUX_RAM_SIZE` | 65,536 | Auxiliary RAM (64 KB) |
| `ROM_SIZE` | 16,384 | System ROM (16 KB) |

---

## See Also

- [[CPU-Emulation]] -- 65C02 processor details
- [[Memory-System]] -- MMU, bank switching, soft switches
- [[Video-Rendering]] -- Per-scanline rendering and video modes
- [[Audio-System]] -- Speaker and Mockingboard audio
- [[Expansion-Slots]] -- Card architecture and slot memory map
- [[Save-States]] -- Binary state serialization format
