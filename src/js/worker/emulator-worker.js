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
const MSG_RPC_RESULT = 'rpc-result';
const MSG_RPC_BATCH_RESULT = 'rpc-batch-result';
const MSG_RPC_ERROR = 'rpc-error';
const MSG_READY = 'ready';
const MSG_AUDIO_SAMPLES = 'audio-samples';
const MSG_FRAME_READY = 'frame-ready';

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

let wasmModule = null;

// Shared buffers (Phase 2+3, null in Phase 1)
let sharedAudioBuffer = null;
let sharedAudioData = null;
let sharedAudioWritePos = null;
let sharedAudioReadPos = null;

let sharedFramebuffer = null;
let sharedFramebufferU8 = null;

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
    case '__heapRead':
      return Array.from(new Uint8Array(wasmModule.HEAPU8.buffer, args[0], args[1]));
    case '__heapWrite':
      wasmModule.HEAPU8.set(new Uint8Array(args[1]), args[0]);
      return true;
    case '__heapReadF32':
      return Array.from(new Float32Array(wasmModule.HEAPF32.buffer, args[0], args[1]));
    case '__stringToUTF8':
      wasmModule.stringToUTF8(args[0], args[1], args[2]);
      return true;
    case '__UTF8ToString':
      return wasmModule.UTF8ToString(args[0]);
    case '__heapU8Slice': {
      const slice = new Uint8Array(wasmModule.HEAPU8.buffer, args[0], args[1]).slice();
      return slice;
    }
    case '__heapU32Read':
      return Array.from(new Uint32Array(wasmModule.HEAPU8.buffer, args[0], args[1]));
    case '__heapI32Read':
      return Array.from(new Int32Array(wasmModule.HEAPU8.buffer, args[0], args[1]));
    case '__heapU16Read':
      return Array.from(new Uint16Array(wasmModule.HEAPU8.buffer, args[0], args[1]));
    case '__heapDataViewU32':
      return new DataView(wasmModule.HEAPU8.buffer).getUint32(args[0], true);
    default:
      throw new Error('Unknown function: ' + fn);
  }
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
    // Phase 3: copy to shared buffer, set atomic flag
    sharedFramebufferU8.set(new Uint8Array(wasmModule.HEAPU8.buffer, fbPtr, fbSize));
    Atomics.store(sharedControlI32, CTRL_FRAME_READY, 1);
    updateControlBlock();
  } else {
    // Phase 1: copy and post as Transferable
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
  const totalCycles = wasmModule._getTotalCycles();
  sharedControlI32[CTRL_TOTAL_CYCLES_LO] = totalCycles | 0;
  sharedControlI32[CTRL_TOTAL_CYCLES_HI] = 0;
}

/**
 * Start the audio-driven emulation loop.
 */
/**
 * Handle a sample request from the AudioWorklet (via main thread).
 * This is the timing master — the AudioWorklet drives emulation speed.
 */
function handleSampleRequest(count) {
  if (!wasmModule || wasmModule._isPaused()) return;
  generateAndSendAudio(count);
}

// --- Message handler ---
self.onmessage = function(event) {
  var msg = event.data;

  switch (msg.type) {
    case MSG_INIT:
      try {
        importScripts(msg.wasmUrl);
        // Override locateFile so Emscripten finds a2e.wasm at the root,
        // not relative to this Worker's URL path.
        self.createA2EModule({
          locateFile: function(path) { return '/' + path; }
        }).then(function(module) {
          wasmModule = module;
          wasmModule._init();
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
        // For __heapU8Slice, transfer the ArrayBuffer
        if (msg.fn === '__heapU8Slice' && result && result.buffer) {
          self.postMessage(
            { type: MSG_RPC_RESULT, id: msg.id, result: result },
            [result.buffer]
          );
        } else {
          self.postMessage({ type: MSG_RPC_RESULT, id: msg.id, result: result });
        }
      } catch (err) {
        self.postMessage({ type: MSG_RPC_ERROR, id: msg.id, error: err.message });
      }
      break;

    case MSG_RPC_BATCH:
      try {
        var results = msg.calls.map(function(c) { return execCall(c.fn, c.args); });
        self.postMessage({ type: MSG_RPC_BATCH_RESULT, id: msg.id, results: results });
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
      handleSampleRequest(msg.count);
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
      sharedControl = msg.sharedControl;
      sharedControlI32 = new Int32Array(sharedControl);
      break;

    default:
      console.warn('Worker: unknown message type', msg.type);
  }
};
