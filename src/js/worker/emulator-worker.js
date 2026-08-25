/*
 * emulator-worker.js - Web Worker: loads WASM, runs emulation loop, handles RPC
 *
 * Classic Worker (not module) — loaded via importScripts for Emscripten compatibility.
 * Must be copied to dist by Vite (like audio-worklet.js).
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

// Message type constants (mirrored from rpc-protocol.js — no ES6 imports in classic Worker)
const MSG_RPC_CALL = 'rpc-call';
const MSG_RPC_BATCH = 'rpc-batch';
const MSG_INIT = 'init';
const MSG_TRANSFER_DATA = 'transfer-data';
const MSG_AUDIO_CONFIG = 'audio-config';
const MSG_FRAMEBUFFER_CONFIG = 'fb-config';
const MSG_REQUEST_SAMPLES = 'request-samples';
const MSG_SET_FREE_RUN = 'set-free-run';
const MSG_RPC_RESULT = 'rpc-result';
const MSG_RPC_BATCH_RESULT = 'rpc-batch-result';
const MSG_RPC_ERROR = 'rpc-error';
const MSG_READY = 'ready';
const MSG_AUDIO_SAMPLES = 'audio-samples';
const MSG_FRAME_READY = 'frame-ready';
const MSG_PRINTER_BYTE = 'printer-byte';
const MSG_PAUSE_STATE = 'pause-state';

// Shared buffer constants (mirrored from shared-buffers.js)
const AUDIO_WRITE_POS_OFFSET = 0;
const AUDIO_READ_POS_OFFSET = 4;
const AUDIO_DATA_OFFSET = 8;
const AUDIO_RING_FLOATS = 16384 * 2;

const CTRL_FRAME_READY = 0;
const CTRL_IS_PAUSED = 1;
const CTRL_PC = 2;
const CTRL_A = 3;
const CTRL_X = 4;
const CTRL_Y = 5;
const CTRL_SP = 6;
const CTRL_P = 7;
const CTRL_BEAM_SCANLINE = 8;
const CTRL_BEAM_HPOS = 9;
const CTRL_BEAM_COLUMN = 10;
const CTRL_FRAME_CYCLE = 11;
const CTRL_BP_HIT = 12;
const CTRL_BP_ADDR = 13;
const CTRL_TOTAL_CYCLES_LO = 14;
const CTRL_TOTAL_CYCLES_HI = 15;
const CTRL_FRAME_INDEX = 16;

let wasmModule = null;

// Shared buffers (Phase 2+3, null in Phase 1)
let sharedAudioBuffer = null;
let sharedAudioData = null;
let sharedAudioWritePos = null;
let sharedAudioReadPos = null;

let sharedFramebuffer = null;
let sharedFramebufferU8 = null;
let sharedFramebufferSlotBytes = 0;
let fbWriteSlot = 0;

let sharedControl = null;
let sharedControlI32 = null;

// Audio generation state
let wasmAudioBufferPtr = 0;
let wasmAudioBufferSamples = 0;

function ensureAudioBuffer(count) {
  if (wasmAudioBufferSamples < count) {
    if (wasmAudioBufferPtr) wasmModule._free(wasmAudioBufferPtr);
    wasmAudioBufferPtr = wasmModule._malloc(count * 2 * 4);
    wasmAudioBufferSamples = count;
  }
}

/**
 * Execute a WASM function call. Handles string conversion and heap operations.
 */
function execCall(fn, args) {
  const func = wasmModule[fn];
  if (typeof func === 'function') {
    return func.apply(wasmModule, args || []);
  }

  // Special heap/string operations for cross-thread data access
  switch (fn) {
    // Heap reads all return a copy detached from the WASM heap (which can be
    // reallocated under us) as a TYPED array, transferred back to the caller.
    // These used to hand back Array.from(...) — a boxed JS array of doubles,
    // structured-cloned rather than transferred, which turned a 256KB read into
    // multiple megabytes of serialization on both threads.
    case '__heapRead':
      return new Uint8Array(wasmModule.HEAPU8.buffer, args[0], args[1]).slice();
    case '__heapWrite':
      wasmModule.HEAPU8.set(new Uint8Array(args[1]), args[0]);
      return true;
    case '__heapReadF32':
      return new Float32Array(wasmModule.HEAPF32.buffer, args[0], args[1]).slice();
    case '__stringToUTF8':
      wasmModule.stringToUTF8(args[0], args[1], args[2]);
      return true;
    case '__UTF8ToString':
      return wasmModule.UTF8ToString(args[0]);
    case '__callString': {
      // Call a WASM function that returns a char* and decode it here, so a
      // string result costs one round-trip instead of two (call, then
      // UTF8ToString on the returned pointer).
      var strFn = wasmModule[args[0]];
      if (typeof strFn !== 'function') {
        throw new Error('Unknown function: ' + args[0]);
      }
      var ptr = strFn.apply(wasmModule, args.slice(1));
      return ptr ? wasmModule.UTF8ToString(ptr) : '';
    }
    case '__heapU8Slice': {
      const slice = new Uint8Array(wasmModule.HEAPU8.buffer, args[0], args[1]).slice();
      return slice;
    }
    case '__heapU32Read':
      return new Uint32Array(wasmModule.HEAPU8.buffer, args[0], args[1]).slice();
    case '__heapI32Read':
      return new Int32Array(wasmModule.HEAPU8.buffer, args[0], args[1]).slice();
    case '__heapU16Read':
      return new Uint16Array(wasmModule.HEAPU8.buffer, args[0], args[1]).slice();
    case '__heapDataViewU32':
      return new DataView(wasmModule.HEAPU8.buffer).getUint32(args[0], true);
    default:
      throw new Error('Unknown function: ' + fn);
  }
}

// Last pause state pushed to the main thread. Kept so the render loop can read
// pause state from a local cache instead of awaiting _isPaused() every frame —
// that await put a full worker round-trip in front of every GL draw, pushing
// the draw out of its requestAnimationFrame task and off the vsync deadline.
var lastReportedPaused = -1;

/**
 * Push pause state to the main thread, but only when it actually changes.
 *
 * Called from the RPC path (so an explicit _setPaused is reflected at once)
 * and from the audio/frame path (so a breakpoint hit, which originates inside
 * the worker, is reflected within a sample request).
 */
function reportPauseState() {
  if (!wasmModule) return;
  var paused = wasmModule._isPaused() ? 1 : 0;
  if (paused === lastReportedPaused) return;
  lastReportedPaused = paused;
  if (sharedControlI32) {
    Atomics.store(sharedControlI32, CTRL_IS_PAUSED, paused);
  }
  self.postMessage({ type: MSG_PAUSE_STATE, paused: paused === 1 });
}

/**
 * Collect the ArrayBuffers of any typed arrays in an RPC result so they can be
 * transferred rather than structured-cloned.
 *
 * Every typed array returned by execCall() is a fresh .slice() copy, never a
 * live view onto the WASM heap, so handing ownership away is always safe here.
 * A batch may mix plain numbers and typed arrays, hence the array walk.
 */
function collectTransferables(result) {
  var out = [];
  var values = Array.isArray(result) ? result : [result];
  for (var i = 0; i < values.length; i++) {
    var v = values[i];
    if (v && v.buffer instanceof ArrayBuffer) {
      out.push(v.buffer);
    }
  }
  return out;
}

/**
 * Generate audio samples and post to main thread (Phase 1)
 * or write to SharedArrayBuffer (Phase 2).
 */
function generateAndSendAudio(count) {
  if (!wasmModule) return;

  ensureAudioBuffer(count);
  wasmModule._generateStereoAudioSamples(wasmAudioBufferPtr, count);

  const totalFloats = count * 2;

  if (sharedAudioData) {
    // Phase 2: write to shared ring buffer
    const writePos = Atomics.load(sharedAudioWritePos, 0);
    const readPos = Atomics.load(sharedAudioReadPos, 0);
    const capacity = AUDIO_RING_FLOATS;
    const used = (writePos - readPos + capacity) % capacity;
    const available = capacity - used - 1;

    if (available >= totalFloats) {
      const srcView = new Float32Array(wasmModule.HEAPF32.buffer, wasmAudioBufferPtr, totalFloats);
      const ringPos = writePos % capacity;
      const firstPart = capacity - ringPos;
      if (totalFloats <= firstPart) {
        sharedAudioData.set(srcView, ringPos);
      } else {
        sharedAudioData.set(srcView.subarray(0, firstPart), ringPos);
        sharedAudioData.set(srcView.subarray(firstPart), 0);
      }
      Atomics.store(sharedAudioWritePos, 0, (writePos + totalFloats) % capacity);
    }
  } else {
    // Phase 1: postMessage with Transferable
    const samples = new Float32Array(totalFloats);
    samples.set(new Float32Array(wasmModule.HEAPF32.buffer, wasmAudioBufferPtr, totalFloats));
    self.postMessage(
      { type: MSG_AUDIO_SAMPLES, samples: samples.buffer },
      [samples.buffer]
    );
  }

  // Check for frame readiness
  const framesReady = wasmModule._consumeFrameSamples();
  if (framesReady > 0) {
    sendFramebuffer();
  }
}

/**
 * Send framebuffer to main thread.
 */
function sendFramebuffer() {
  const fbPtr = wasmModule._getFramebuffer();
  const fbSize = wasmModule._getFramebufferSize();

  if (sharedFramebufferU8) {
    // Shared path: write into whichever half the renderer is not reading, then
    // publish it. No allocation and no postMessage — the postMessage path below
    // allocated a fresh 860KB array on every single frame, roughly 51MB/s of
    // garbage at 60fps and a reliable source of GC hitching.
    sharedFramebufferU8.set(
      new Uint8Array(wasmModule.HEAPU8.buffer, fbPtr, fbSize),
      fbWriteSlot * sharedFramebufferSlotBytes
    );
    Atomics.store(sharedControlI32, CTRL_FRAME_INDEX, fbWriteSlot);
    Atomics.store(sharedControlI32, CTRL_FRAME_READY, 1);
    fbWriteSlot = 1 - fbWriteSlot;
    updateControlBlock();
  } else {
    // Fallback: copy and post as Transferable
    const fb = new Uint8Array(fbSize);
    fb.set(new Uint8Array(wasmModule.HEAPU8.buffer, fbPtr, fbSize));
    self.postMessage(
      { type: MSG_FRAME_READY, framebuffer: fb.buffer },
      [fb.buffer]
    );
  }
}

/**
 * Update shared control block with current emulator state (Phase 3).
 */
function updateControlBlock() {
  if (!sharedControlI32) return;
  sharedControlI32[CTRL_IS_PAUSED] = wasmModule._isPaused();
  sharedControlI32[CTRL_PC] = wasmModule._getPC();
  sharedControlI32[CTRL_A] = wasmModule._getA();
  sharedControlI32[CTRL_X] = wasmModule._getX();
  sharedControlI32[CTRL_Y] = wasmModule._getY();
  sharedControlI32[CTRL_SP] = wasmModule._getSP();
  sharedControlI32[CTRL_P] = wasmModule._getP();
  sharedControlI32[CTRL_BEAM_SCANLINE] = wasmModule._getBeamScanline();
  sharedControlI32[CTRL_BEAM_HPOS] = wasmModule._getBeamHPos();
  sharedControlI32[CTRL_BEAM_COLUMN] = wasmModule._getBeamColumn();
  sharedControlI32[CTRL_FRAME_CYCLE] = wasmModule._getFrameCycle();
  sharedControlI32[CTRL_BP_HIT] = wasmModule._isBreakpointHit();
  sharedControlI32[CTRL_BP_ADDR] = wasmModule._getBreakpointAddress();
  // _getTotalCycles() is a uint64 and comes back as a BigInt, so it cannot be
  // mixed with Number operators — `totalCycles | 0` threw on every frame. Split
  // it into the two halves the control block is laid out for rather than
  // truncating it to 32 bits.
  const totalCycles = wasmModule._getTotalCycles();
  const cycles = typeof totalCycles === 'bigint'
    ? totalCycles
    : BigInt(Math.floor(totalCycles || 0));
  sharedControlI32[CTRL_TOTAL_CYCLES_LO] = Number(cycles & 0xFFFFFFFFn) | 0;
  sharedControlI32[CTRL_TOTAL_CYCLES_HI] = Number((cycles >> 32n) & 0xFFFFFFFFn) | 0;
}

/**
 * Start the audio-driven emulation loop.
 */
/**
 * Handle a sample request from the AudioWorklet (via main thread).
 * This is the timing master — the AudioWorklet drives emulation speed.
 */
// --- Free-run clock ---
//
// The emulation is normally paced by the AudioWorklet asking for samples, one
// request at a time. No browser will start an AudioContext before a user
// gesture, so on a page nobody has touched yet there is nothing asking, and a
// machine that has been powered on sits frozen — powered, but not running.
//
// This timer stands in for the audio clock until audio can take over. It asks
// for the samples the elapsed real time is worth, so the machine runs at the
// right speed; the ring buffer drops them once it is full, since nothing is
// reading, and the frames the emulation produces are published exactly as they
// are under audio pacing.
//
// It is a stand-in and not a replacement. A timer is coarser than the audio
// hardware clock and browsers throttle it in background tabs, which is why the
// AudioWorklet takes back over the moment it exists.
const SAMPLE_RATE = 48000;
const FREE_RUN_INTERVAL_MS = 16;
// A tab that was throttled or backgrounded comes back with a huge elapsed time.
// Chasing all of it in one tick would freeze the worker while it caught up, so
// the machine loses that time instead — the same choice the audio path makes
// when the ring runs dry.
const FREE_RUN_MAX_SAMPLES = SAMPLE_RATE / 10;

var freeRunTimer = null;
var freeRunLast = 0;

function freeRunTick() {
  if (!wasmModule) return;

  var now = performance.now();
  var elapsed = now - freeRunLast;
  freeRunLast = now;

  reportPauseState();
  if (wasmModule._isPaused()) return;

  var count = Math.min(
    Math.round((elapsed / 1000) * SAMPLE_RATE),
    FREE_RUN_MAX_SAMPLES
  );
  if (count > 0) generateAndSendAudio(count);
}

function startFreeRun() {
  if (freeRunTimer !== null) return;
  freeRunLast = performance.now();
  freeRunTimer = setInterval(freeRunTick, FREE_RUN_INTERVAL_MS);
}

function stopFreeRun() {
  if (freeRunTimer === null) return;

  clearInterval(freeRunTimer);
  freeRunTimer = null;

  // Drop whatever free-running left in the ring. Nothing was reading it, so it
  // is seconds of stale audio that the AudioWorklet would otherwise play as its
  // first sound. The worker owns the write position, so moving it to the read
  // position empties the ring without touching the reader's side.
  if (sharedAudioWritePos && sharedAudioReadPos) {
    Atomics.store(sharedAudioWritePos, 0, Atomics.load(sharedAudioReadPos, 0));
  }
}

function handleSampleRequest(count) {
  if (!wasmModule) return;
  reportPauseState();
  if (wasmModule._isPaused()) {
    // Send empty samples so the AudioWorklet clears its pendingRequest flag.
    // Without this, the worklet permanently stops requesting samples after a
    // pause, starving the emulator even after it is unpaused.
    self.postMessage(
      { type: MSG_AUDIO_SAMPLES, samples: new ArrayBuffer(0) }
    );
    return;
  }
  generateAndSendAudio(count);
}

// --- Message handler ---
self.onmessage = function(event) {
  var msg = event.data;

  switch (msg.type) {
    case MSG_INIT:
      try {
        importScripts(msg.wasmUrl);
        // Carry the loader's cache-bust query (?v=...) onto the .wasm fetch too,
        // otherwise Emscripten loads a stale a2e.wasm from cache after a rebuild.
        var bustQuery = (msg.wasmUrl.indexOf('?') >= 0) ? msg.wasmUrl.slice(msg.wasmUrl.indexOf('?')) : '';
        // Override locateFile so Emscripten finds a2e.wasm at the root,
        // not relative to this Worker's URL path.
        self.createA2EModule({
          locateFile: function(path) { return '/' + path + bustQuery; }
        }).then(function(module) {
          wasmModule = module;
          wasmModule._init();
          self.emulator = self.emulator || {};
          self.emulator.printer = { receiveByte: function(byte) { self.postMessage({ type: MSG_PRINTER_BYTE, byte: byte }); } };
          self.postMessage({ type: MSG_READY });
        }).catch(function(err) {
          self.postMessage({ type: MSG_RPC_ERROR, id: '__init__', error: err.message });
        });
      } catch (err) {
        self.postMessage({ type: MSG_RPC_ERROR, id: '__init__', error: err.message });
      }
      break;

    case MSG_RPC_CALL:
      try {
        var result = execCall(msg.fn, msg.args);
        self.postMessage(
          { type: MSG_RPC_RESULT, id: msg.id, result: result },
          collectTransferables(result)
        );
        // Catches _setPaused / _stepInstruction / _reset without the main
        // thread having to ask what they did.
        reportPauseState();
      } catch (err) {
        self.postMessage({ type: MSG_RPC_ERROR, id: msg.id, error: err.message });
      }
      break;

    case MSG_RPC_BATCH:
      try {
        var results = msg.calls.map(function(c) { return execCall(c.fn, c.args); });
        self.postMessage(
          { type: MSG_RPC_BATCH_RESULT, id: msg.id, results: results },
          collectTransferables(results)
        );
      } catch (err) {
        self.postMessage({ type: MSG_RPC_ERROR, id: msg.id, error: err.message });
      }
      break;

    case MSG_TRANSFER_DATA:
      try {
        var tdResult = execCall(msg.fn, msg.args);
        self.postMessage({ type: MSG_RPC_RESULT, id: msg.id, result: tdResult });
      } catch (err) {
        self.postMessage({ type: MSG_RPC_ERROR, id: msg.id, error: err.message });
      }
      break;

    case MSG_REQUEST_SAMPLES:
      // Audio is asking, so it is awake and free-running would double-drive the
      // machine. This also covers an AudioContext that resumes on its own.
      stopFreeRun();
      handleSampleRequest(msg.count);
      break;

    case MSG_SET_FREE_RUN:
      if (msg.enabled) startFreeRun();
      else stopFreeRun();
      break;

    case MSG_AUDIO_CONFIG:
      sharedAudioBuffer = msg.sharedAudioBuffer;
      sharedAudioWritePos = new Int32Array(sharedAudioBuffer, AUDIO_WRITE_POS_OFFSET, 1);
      sharedAudioReadPos = new Int32Array(sharedAudioBuffer, AUDIO_READ_POS_OFFSET, 1);
      sharedAudioData = new Float32Array(sharedAudioBuffer, AUDIO_DATA_OFFSET);
      break;

    case MSG_FRAMEBUFFER_CONFIG:
      sharedFramebuffer = msg.sharedFramebuffer;
      sharedFramebufferU8 = new Uint8Array(sharedFramebuffer);
      sharedFramebufferSlotBytes = msg.slotBytes;
      fbWriteSlot = 0;
      sharedControl = msg.sharedControl;
      sharedControlI32 = new Int32Array(sharedControl);
      break;

    default:
      console.warn('Worker: unknown message type', msg.type);
  }
};
