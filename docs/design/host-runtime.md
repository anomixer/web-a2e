# Browser host runtime

Moved out of CLAUDE.md; this is the detail behind the rules summarised there.

## URL Media Parameters

`?disk=`, `?disk1=`, `?disk2=`, `?hd=`, `?hd2=`, `?name=` and `?autostart=` let a link open with images already inserted. Two modules:

- `src/js/utils/url-params.js` — pure parsing and URL validation (http/https only; relative paths resolve against the page). Unit-tested in `tests/js/utils/url-params.test.js`.
- `src/js/disk-manager/url-media-loader.js` — fetches (`credentials: "omit"`, size-capped) and inserts.

`main.js` parses the URL *before* `DiskManager.init()` / `HardDriveManager.init()` and populates `urlOwnedDrives` / `urlOwnedDevices`, which those managers use to skip restoring persisted images into units a link is about to claim — otherwise the two loads race.

**A link that names any image restores no persisted image at all**, floppy or hard drive, not just the units it names (`skipRestore` on both managers, set from `hasMediaParams`). A disk left in drive 2 from the last visit, or a hard drive the machine boots from ahead of the floppy, would change what the link does. The persisted images are not cleared: they come back on the next plain visit. `skipRestore` is deliberately separate from `urlOwnedDrives`, which also stops a drive being persisted, and a drive the link left empty is the visitor's to use.

`?autostart=` (or a bare `?autostart`) powers the machine on at the end of
`init()` with **no interaction at all** — `main.js:autostart()`. It runs
immediately because the Worker paces itself while the `AudioContext` is still
suspended (see Free-Run Clock below); the one thing a browser genuinely
forbids before a gesture is *sound*, so the machine starts silent and the
speaker joins in when the visitor first clicks or types.

It routes through `UIController.powerOn()` rather than the power button's
handler, so the power reminder is *hidden* rather than permanently dismissed (a
machine that started on its own may have started before the visitor ever read
the hint), and the "No disk? Press Ctrl+Reset for BASIC" hint is suppressed
when the URL put a floppy in the drive.

Loads are transient: `DiskManager.loadDiskFromUrlData()` deliberately skips `saveDiskToStorage`/`addToRecentDisks`, and `StateManager.suspendAutoSave()` is called for the session so the periodic autosave cannot persist the URL disk by the back door. The stored autosave preference is untouched.

## Worker Architecture

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

## Shared Memory Transport

When `SharedArrayBuffer` is available (requires the COOP/COEP headers Vite sets), `main.js:setupSharedBuffers()` allocates three buffers and both the framebuffer and audio bypass `postMessage` entirely:

- **Framebuffer** is a queue of four slots (`FB_SLOTS`, rules in `worker/frame-queue.js`, unit-tested). The Worker counts frames written (`CTRL_FRAMES_WRITTEN`) and the renderer counts frames taken (`CTRL_FRAMES_SHOWN`), each the only writer of its own counter, so no lock. Each refresh `pollFrame()` takes the *oldest* unshown frame, and jumps to the newest past `MAX_FRAME_BACKLOG`, so frames that arrive together are shown on successive refreshes instead of one hiding the other. At most `FB_SLOTS - 2` wait, which keeps the Worker out of the slot the renderer holds (a paused machine redraws it, a screenshot reads it). A full queue drops the new frame. `emulator-worker.js` is a classic Worker and carries its own copy of the producer half; keep the two in step. The postMessage fallback queues posted frames by the same rule. This replaced allocating a fresh 860KB array every frame.
- **Audio ring** — the AudioWorklet reads generated samples directly, so the main thread is no longer in the audio critical path. Only the small refill request still routes through it.
- **Control block** — Int32 status fields (see `CTRL_*` in `shared-buffers.js`). Currently only pause and frame state are consumed; the register fields are groundwork for removing debug-window RPCs.

The `postMessage` path remains as a fallback and must keep working — do not delete it.

## Audio-Driven Timing

The emulator uses Web Audio API for precise timing:

1. AudioWorklet `process()` fires at 48kHz hardware rate
2. When the ring buffer runs low, the AudioWorklet requests samples from the main thread
3. Main thread forwards request to Worker via `MSG_REQUEST_SAMPLES`
4. Worker generates samples (running ~21.3 CPU cycles per sample)
5. Worker writes them into the shared audio ring, which the AudioWorklet reads directly

Sample *data* therefore never crosses the main thread; only the refill request does. Without `SharedArrayBuffer` the Worker falls back to posting samples for the main thread to relay, which works but puts a busy main thread in the audio path — and because audio paces the emulation, that shows up as speed instability rather than just crackle.

This ensures consistent speed driven by the audio hardware clock.

**A refill is one video frame, 800 samples, and the low-water mark is two.**
The Worker publishes one picture per request, after running all of it, so a
request spanning two frames drew both into the same framebuffer and the screen
got 30 pictures a second (`REFILL_FRAMES` in `audio-worklet.js`). Frames
still arrive with a few milliseconds of jitter against the display's refresh,
which the frame queue absorbs: measured, 60 published and 60 shown, on both
transports. **A picture is published when the video finishes a frame**, not
per 800 samples: `consumeFrameSamples` counts the frames the core completed,
which is what lets a PAL machine publish 50 a second rather than 60.
**And what is published is the finished frame, never the one being drawn.**
`Video` draws into one buffer and `renderFrame` copies it to the one
`getFramebuffer()` returns; a refill ends wherever in a frame it happens to,
so a single buffer published two frames split at the beam, and the split
drifted down the screen. A run stopped early by a breakpoint shows the frame
in progress instead (`showFrameInProgress`), so the screen of a stopped
machine is where its beam is, and a IIgs reads the Mega II's lines from
`frameInProgress()` as they are drawn. `test_emulator.cpp` pins it.

## Free-Run Clock

Audio pacing has a hole in it: no browser starts an `AudioContext` before a
user gesture, so on a page nobody has touched there is nothing asking the
Worker for samples, and a machine that has been powered on **sits frozen** —
powered, but not running. That is what `?autostart` originally ran into.

`AudioDriver.start()` therefore turns on a stand-in when it finds the context
suspended (and when audio fails outright): `MSG_SET_FREE_RUN` puts a 16ms
`setInterval` in the Worker which asks for the samples the elapsed real time is
worth. Measured at 1.019 MHz against audio pacing's 1.022 MHz. The generated
audio goes nowhere — the ring drops writes once full, since nothing is reading
— but frames publish exactly as they do under audio.

Three details keep it honest:

- **The Worker stops free-running the instant a real sample request arrives**,
  not only when told to. Two clocks driving one emulation would run it at
  roughly double speed, and this also covers a context that resumes on its own.
- **`stopFreeRun()` empties the ring** by moving the write position to the read
  position (the Worker owns the write side, so no race with the reader).
  Otherwise the AudioWorklet's first sound would be seconds of stale audio.
- **A tick is capped at 100ms of emulated time.** A throttled or backgrounded
  tab returns with a huge elapsed time, and chasing all of it would freeze the
  Worker catching up; the machine loses that time instead, as it does when the
  audio ring runs dry.

## WASM Interface Pattern

Single global `Emulator` instance in C++ (`wasm_interface.cpp`). WASM runs inside a Web Worker; all JS code accesses it via `WasmProxy` which returns Promises. Heap operations use `wasmProxy.heapRead()`/`heapWrite()` instead of direct `HEAPU8` access. `_malloc()` must be awaited; `_free()` is fire-and-forget. `stringToUTF8()`/`UTF8ToString()` are async. New WASM exports must be added to `CMakeLists.txt` EXPORTED_FUNCTIONS list.

## Key Constants (core/src/core/types.hpp)

- CPU: 1.023 MHz clock
- Audio: 48kHz sample rate
- Screen: 560x384 pixels (280x192 doubled)
- Memory: 64KB main + 64KB aux RAM, 16KB ROM
