# CLAUDE.md

Guidance for Claude Code in this repository. This file holds what is needed on
every task; the design detail behind each rule lives in `docs/design/` (index
at the end). Read the relevant design doc before changing a subsystem.

## Project Overview

ApplEm: a cycle-accurate Apple II emulator (II Plus, //e, //c and IIgs). A C++
core compiled to WebAssembly with a WebGL front end in vanilla ES6 modules
(Vite, no framework), plus a native macOS front end (Dear ImGui over Metal) on
the same core.

## Build Commands

```bash
npm install           # Install dependencies
npm run build:wasm    # Build WASM module (required first time and after C++ changes)
npm run dev           # Start dev server at localhost:3000 (hot-reload for JS only)
npm run build         # Full production build (WASM + Vite bundle)
npm run clean         # Clean build artifacts
npm run deploy        # Deploy to the configured rsync target (see .env.deploy.example)
npm test              # JavaScript tests (Vitest)
npm run check         # check:exports + check:core-purity + check:basic-tokens + npm test
npm run generate:basic-tokens  # Regenerate src/js/utils/basic-tokens.js from C++
npm run native:build  # Build build-macos/native/ApplEm.app
```

C++ changes need `npm run build:wasm`; JS changes hot-reload. Keep build
parallelism at `-j 4`.

### ROMs

ROMs are embedded into the WASM at compile time from `roms/`:

- `342-0349-B-C0-FF.bin` (16KB //e system ROM)
- `342-0273-A-US-UK.bin` (4KB character ROM, US/UK), `341-0160-A-US-UK.bin` (alternate)
- `341-0027.bin` (256 bytes Disk II ROM)
- `Thunderclock Plus ROM.bin`, `Apple Mouse Interface Card ROM - 342-0270-C.bin`,
  `Apple Parallel Interface Card ROM - 341-0057.bin`

**II Plus ROMs are optional**: `341-0011.bin` to `341-0015.bin` plus
`341-0020.bin`, or one 12KB `apple2plus.rom`, and `341-0036.bin` for the
character generator. Without them the II+ is listed but reports itself
unrunnable (`Emulator::isMachineRunnable`).

## Testing

- **JavaScript**: `npm test` runs `tests/js/` with `vitest.config.js` (kept
  separate from `vite.config.js`). Modules under test are pure logic in plain
  node; a new DOM dependency in one is a smell, not a reason to add jsdom.
- **Consistency checks** (`npm run check`): `check-exports.sh` (every
  `EMSCRIPTEN_KEEPALIVE` is in `EXPORTED_FUNCTIONS` in `CMakeLists.txt` and the
  reverse), `check-core-purity.sh` (no host-platform dependencies in
  `src/core/` or `src/host/`), and the BASIC token table check.
- **C++ (Catch2)**: `tests/unit/`, `tests/integration/`, helpers in
  `tests/common/`.

  ```bash
  mkdir -p build-native && cd build-native && cmake .. && make -j 4 && ctest --verbose
  ```

  Some tests skip unless an external fixture is pointed at:
  `A2E_65816_VECTORS` (SingleStepTests 65816 vectors, 3GB) and
  `A2E_BANDITS_WOZ` (the Bandits flux disk).

## Native macOS Front End (ImGui + Metal)

`native/` is a second front end, not a wrapper: Dear ImGui's docking branch
(submodule at `native/third_party/imgui`) over Metal, multi-viewport on.
`docs/NATIVE.md` has the detail and the plan. Load-bearing:

- **`src/host/machine_host.*` is shared with the browser build.** It decides
  which of `Emulator` and `IIgsMachine` is alive and routes what every host
  asks of a machine; `wasm_interface.cpp` sits on it. Logic both front ends
  need goes there, never into one front end. `test_machine_host` boots every
  machine through it.
- **Timing is the browser's**: Core Audio's callback wakes the emulation
  thread below two frames of samples, a refill is one frame, and frames go
  through a port of `frame-queue.js`. Everything else touches the machine
  through `Emulation::withMachine`.
- **ImGui swaps Cmd and Ctrl on a Mac** (`ImGuiKey_LeftCtrl` is physical ⌘);
  modifiers come from ImGui's modifier flags. `key_mapper` turns ImGui keys
  into the browser keycodes the core expects (`test_native_input`).
- **The slot layout is applied before the power comes on.** The `Emulator`
  constructor fits only the drives, the Mockingboard and a //c's ports; the
  SmartPort and Thunderclock come from the layout. Order: cards, floppies,
  hard drive images, then power.
- **A disk from a file writes back to that file** on idle, eject, replace,
  machine change and quit (`MachineHost::markDiskSaved` and twins), under one
  hold of the machine. A disk with no file asks instead.
- **`native/shaders/crt.metal` ports `public/shaders/crt.glsl`.** Change one,
  change the other, and run `scripts/compare-crt.mjs`.

## Architecture

### Layout

```
src/core/      C++ emulation, namespace a2e::, no host dependencies
  cpu/6502/      cycle-accurate 6502/65C02 (models which cycle touches which address)
  cpu/65816/     the IIgs CPU, separate class (cycle counts only)
  mmu/           128KB map, soft switches, slots, video scanner / floating bus
  video/         signal stage (dot stream) + decode stage (ntsc.cpp)
  audio/         speaker
  disk-image/    DSK/DO/PO/NIB/WOZ, gcr_encoding, gcr35, disk_converter, disk_inspection
  disassembler/  6502 and 65816 disassemblers
  assembler/     Merlin-compatible 65C02 assembler
  input/         keyboard, Sirius Joyport, //c IOU mouse
  iigs/          everything only a IIgs has (memory, video, ADB, clock, Ensoniq, SCC, machine)
  machine/       machine_profile.hpp: per-machine data and the registry
  cards/         ExpansionCard implementations, disk_controller shared by Disk II and IWM
  filesystem/    DOS 3.3, ProDOS, Pascal readers; DOS 3.3/ProDOS writers
  basic/         Applesoft/Integer tokenizer, detokenizer, variables
  debug/         MachineDebug, condition evaluator, debug_log sink
  emulator.*     8-bit machine coordinator (+ emulator/ state and debug files)
src/host/      machine_host.*, shared by the browser and native hosts
src/bindings/  wasm_interface.cpp, the WASM export glue
src/js/        browser host (kebab-case files, PascalCase classes)
  main.js, worker/, audio/, display/, disk-manager/, file-explorer/, debug/,
  help/, input/, machine/, state/, ui/, utils/, windows/, agent/, config/
native/        ImGui + Metal front end
public/        static assets, built WASM, shaders
docs/design/   design notes moved out of this file
wiki/          mirror of the published GitHub wiki (the published wiki wins)
```

### Rules that apply everywhere

- **The core is host-free.** No console, no platform calls in `src/core/`;
  logging goes through `debug_log`, file access through callbacks the host
  installs.
- **A number or a flag goes in the machine profile; a different mechanism
  goes in a different class the profile names.** No virtual calls or
  per-machine branches on per-cycle paths. The IIgs is its own family built
  from `core/iigs/`; nothing outside it grows an `if (IIgs)`. See
  `docs/design/machines.md`.
- **Share a mechanism, not a resemblance**: the //c's IWM and the Disk II
  share `DiskController`; the //c's serial ports compose the SSC's
  `ACIA6551` rather than inheriting from a card.
- **Host preferences are not machine state.** Speed multiplier, game port
  device, video standard, Mockingboard phase lock and mono, paste buffer: none
  is in a save state, and `reset()` keeps them.
- **Remembered per machine** in localStorage: slot layout, display settings,
  video standard, ⌘ as Open Apple, autosave.
- **Hidden, not disabled**: menu items a machine cannot use are hidden
  (`src/js/ui/machine-availability.js`).
- **A peek must never read a card** (`peekROM`, not `readROM`): a SmartPort's
  entry points are traps.

### Browser host

The WASM module runs in a Web Worker; the main thread talks to it through
`WasmProxy` (`src/js/worker/`). Details in `docs/design/host-runtime.md`.

- Every `_fn()` on the proxy is an async RPC to the thread that runs the
  emulation, so round trips steal emulation time. **One `wasmProxy.batch()`
  per window update**; `callString` for `char*` returns; a loop of RPCs should
  become one C++ export.
- **No direct `HEAPU8`/`HEAPF32` from the main thread**: use `heapRead`,
  `heapWrite` and friends, which return typed arrays.
- `_malloc()` must be awaited; `_free()` is fire-and-forget. New exports go
  in `EXPORTED_FUNCTIONS` in `CMakeLists.txt`.
- **Audio paces the machine**: the AudioWorklet asks for a refill of one
  frame (800 samples) when below two; a free-run clock stands in while the
  `AudioContext` is suspended.
- `SharedArrayBuffer` carries the frame queue and audio ring; **the
  `postMessage` fallback must keep working.** `emulator-worker.js` is a
  classic Worker with its own copy of the frame-queue producer; keep the two
  in step.

### Video

The 8-bit machines emit a 1-bit dot stream that `ntsc.cpp` decodes; colour is
made by the receiver. The calibration constants were fitted, the luma filter
must null 3.58 and 7.16 MHz, the sharp modes apply no composite effects, and
double-resolution modes are one dot late. Read `docs/design/display.md` before
touching `video.cpp`, `ntsc.*` or the shaders.

**Animated shader effects must stay within photosensitive-epilepsy limits**
(no more than three flashes a second or a 10% luminance change).

### UI and theming

- Light, dark and system themes via `ThemeManager` (`data-theme` on
  `<html>`). Accent colours derive from the six-stripe Apple palette: Green
  `#61BB46`, Yellow `#FDB827`, Orange `#F5821F`, Red `#E03A3E`, Purple
  `#963D97`, Blue `#009DDC`.
- Control styles, sizes and layout must be consistent across the app.
- **Window surfaces are opaque with no `backdrop-filter`**: use
  `--glass-bg`, `--glass-bg-solid`, `--glass-bg-header`. A blur over a canvas
  repainting at 60Hz re-blurs every window every frame.

### Expansion cards

Cards implement `ExpansionCard` (`src/core/cards/expansion_card.hpp`) and get
the profile through `setMachine()`. A card that can hold IRQ must be in the
`Emulator`'s IRQ predicate to re-interrupt a handler. Details, the slot map
and per-card notes in `docs/design/cards.md`.

## Design docs

| Doc | Covers |
| --- | ------ |
| `docs/design/machines.md` | Machine profiles, II Plus, //c, NTSC/PAL, choosing a machine, menus, adding a machine |
| `docs/design/iigs.md` | 65816, IIgs memory and shadowing, clocks, video and border, ADB, clock chip, Ensoniq, SCC, slots, SmartPort, 3.5" drives |
| `docs/design/cards.md` | Interrupts, slot map, card interface, Mockingboard, printers and paper canvas |
| `docs/design/disks.md` | WOZ flux tracks, Disk Inspector |
| `docs/design/display.md` | Theming, CRT shader, composite video and colour decoding, display settings and profiles |
| `docs/design/input.md` | Paste buffer, AKD, game port and Joyport, CPU speed, keyboard mapping and shortcuts |
| `docs/design/host-runtime.md` | URL media parameters, Worker, shared memory, audio timing, free-run clock, WASM interface |
| `docs/design/state.md` | Save state formats for both families, autosave |
| `docs/design/debugging.md` | Debug windows, debugging any machine (MachineDebug, memory spaces, breakpoints, disassembly) |
| `docs/design/assembler.md` | Merlin assembler semantics |
| `docs/design/agent-mcp.md` | MCP server, multi-emulator routing, sandbox, agent tools |
| `docs/NATIVE.md` | Native front end |

When a change alters something a design doc describes, update that doc in the
same change.

## Deployment

`npm run deploy` and `npm run deploy:staging` run `scripts/deploy.sh`, one
rsync of `dist/` to `DEPLOY_TARGET` / `DEPLOY_STAGING_TARGET` from
`.env.deploy` (gitignored; see `.env.deploy.example`). **One SSH session
only**: the host locks out concurrent sessions, so verify over HTTPS.

## Release Process

When the user says "release":

1. Review the git log since the last release notes entry
2. Bump the version in `src/js/config/version.js`
3. Update release notes in `src/js/help/release-notes.js` (short entries)
4. Update `README.md` for new features, commands or project information
5. Update this file and the relevant `docs/design/` doc for architectural or structural changes
