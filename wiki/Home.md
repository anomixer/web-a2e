# Apple //e Emulator

A cycle-accurate Apple II Enhanced emulator running entirely in the browser. Built with WebAssembly (C++ backend) and WebGL rendering, it faithfully reproduces the 1MHz 65C02 processor, 128KB memory architecture, all standard video modes, Disk II controller, expansion cards, and speaker audio -- no plugins or installs required.

---

## Feature Highlights

- **Cycle-accurate 65C02 CPU** at 1.023 MHz with full NMOS 6502 and 65C02 extended opcode support
- **128KB memory** (64KB main + 64KB auxiliary) with Language Card and double hi-res capability
- **All Apple IIe video modes** -- Text, Lo-Res, Hi-Res, Double Hi-Res, Double Lo-Res, and 80-column text
- **CRT shader effects** -- scanlines, phosphor glow, screen curvature, chromatic aberration, vignette, and analog noise via WebGL
- **Disk II emulation** with DSK, DO, PO, NIB, and WOZ format support and real-time surface visualization
- **Expansion card system** -- Mockingboard (dual AY-3-8910), Thunderclock Plus, Mouse Interface Card
- **Audio-driven timing** using Web Audio API at 48 kHz for accurate, drift-free emulation even when backgrounded
- **Save states** -- autosave plus five manual slots stored in IndexedDB
- **Built-in debugger suite** -- CPU debugger, memory browser, heat map, stack viewer, soft switch monitor, and more
- **Applesoft BASIC editor** and **6502 assembler** with direct memory injection
- **File Explorer** for browsing DOS 3.3 and ProDOS disk contents
- **Installable PWA** with light, dark, and system-follow themes
- **Paste support** (Ctrl+V) and full-page mode

## Quick Start

1. Open the emulator in a modern browser (Chrome, Firefox, Safari, or Edge).
2. Click the **Power** button in the toolbar to turn on the Apple //e.
3. If no disk is inserted you will see the Applesoft BASIC prompt after pressing **Ctrl+Reset**.
4. To load software, open **View > Disk Drives**, drag a disk image onto a drive slot or click **Load** to browse.
5. Press **F1** at any time for built-in documentation.

See [[Getting-Started]] for a full walkthrough.

---

## Wiki Contents

### User Guide

| Page | Description |
|------|-------------|
| [[Getting-Started]] | First-time setup, powering on, inserting disks, keyboard basics, paste, and full-page mode |
| [[Display-Settings]] | CRT effects, analog noise, image controls, colour modes, and rendering options |
| [[Disk-Drives]] | Disk formats, drive UI, surface visualization, write protection, and drive sounds |
| [[File-Explorer]] | Browsing DOS 3.3 and ProDOS disk contents, viewing files, and disassembly |
| [[Save-States]] | Autosave, manual save slots, and state management |
| [[Expansion-Slots]] | Slot configuration, Mockingboard, Thunderclock, Mouse Card |
| [[Input-Devices]] | Keyboard mapping, joystick/paddle configuration, mouse support |
| [[Keyboard-Shortcuts]] | Complete keyboard shortcut reference |

### Developer Guide

| Page | Description |
|------|-------------|
| [[Architecture-Overview]] | Two-layer design, audio-driven timing, WASM interface pattern |
| [[CPU-Emulation]] | 65C02 implementation, cycle accuracy, Klaus Dormann test compliance |
| [[Memory-System]] | MMU soft switches, Language Card, bank switching, auxiliary memory |
| [[Video-Rendering]] | Scanline rendering, WebGL pipeline, CRT shader architecture |
| [[Audio-System]] | Speaker toggle emulation, Mockingboard synthesis, AudioWorklet pipeline |
| [[Disk-System-Internals]] | GCR encoding, WOZ format handling, Disk II controller state machine |
| [[Debugger]] | CPU debugger, breakpoints, rule builder, memory tools, and debug windows |

---

## Version

Current release: **1.5.0**

Open **Help > Release Notes** inside the emulator to see what's new.
