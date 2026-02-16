/*
 * wasm-proxy.js - Main-thread proxy replacing wasmModule
 *
 * ES6 Proxy auto-generates async RPC for any _function() call.
 * Fire-and-forget calls (input, control) skip waiting for response.
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import {
  MSG_RPC_CALL, MSG_RPC_BATCH, MSG_INIT, MSG_TRANSFER_DATA,
  MSG_RPC_RESULT, MSG_RPC_BATCH_RESULT, MSG_RPC_ERROR,
  MSG_READY, MSG_AUDIO_SAMPLES, MSG_FRAME_READY,
  MSG_AUDIO_CONFIG, MSG_FRAMEBUFFER_CONFIG, MSG_REQUEST_SAMPLES,
} from './rpc-protocol.js';

// Functions that don't need return values — fire and forget
const FIRE_AND_FORGET = new Set([
  '_handleRawKeyDown', '_handleRawKeyUp', '_keyDown',
  '_mouseMove', '_mouseButton',
  '_setPaused', '_setAudioVolume', '_setAudioMuted',
  '_setMockingboardDebugLogging',
  '_setUKCharacterSet', '_setSerialTxCallback',
  '_stopDiskMotor',
  '_enableBreakpoint', '_addBreakpoint', '_removeBreakpoint',
  '_clearTempBreakpoint',
  '_addWatchpoint', '_removeWatchpoint',
  '_clearBasicBreakpoints', '_clearBasicBreakpointHit',
  '_addBasicBreakpoint', '_removeBasicBreakpoint',
  '_clearBasicConditionRules', '_addBasicConditionRule',
  '_setBasicHeatMapEnabled', '_clearBasicHeatMap',
  '_setTraceEnabled', '_clearTrace',
  '_enableMemoryHeatMap', '_clearMemoryHeatMap',
  '_setMockingboardChannelMute',
  '_enableBeamBreakpoint', '_clearAllBeamBreakpoints',
  '_writeMemory',
  '_setRegPC', '_setRegA', '_setRegX', '_setRegY', '_setRegSP',
  '_forceRenderFrame',
  '_setSpeedMultiplier',
  '_setButton', '_setPaddleValue',
  '_runCycles',
  '_stepInstruction',
  '_stepBasicStatement', '_stepBasicLine',
  '_removeBeamBreakpoint',
  '_loadAsmIntoMemory',
  '_serialReceive',
  '_setSerialTxCallback',
  '_setMonochrome',
  '_enableNoSlotClock',
  '_reset',
  '_warmReset',
  '_ejectDisk',
  '_ejectSmartPortImage',
]);

let rpcIdCounter = 0;

export class WasmProxy {
  constructor() {
    this.worker = null;
    this.pendingCalls = new Map(); // id → { resolve, reject }
    this.onAudioSamples = null;   // callback(Float32Array)
    this.onFrameReady = null;     // callback(Uint8Array)
    this._ready = false;
    this._readyPromise = null;
    this._readyResolve = null;

    // Return an ES6 Proxy so any property access auto-generates RPC
    return new Proxy(this, {
      get(target, prop) {
        // Allow direct access to WasmProxy's own methods/properties
        if (prop in target || typeof prop === 'symbol') {
          return target[prop];
        }

        // Properties that start with _ are WASM function calls
        if (typeof prop === 'string' && prop.startsWith('_')) {
          return (...args) => target._call(prop, args);
        }

        // Special heap/string helpers — exposed as methods
        if (prop === 'stringToUTF8') {
          return (str, ptr, maxLen) => target._call('__stringToUTF8', [str, ptr, maxLen]);
        }
        if (prop === 'UTF8ToString') {
          return (ptr) => target._call('__UTF8ToString', [ptr]);
        }

        // HEAPU8, HEAPF32, etc. are not directly accessible.
        // Callers must use heapRead/heapWrite helpers instead.
        if (prop === 'HEAPU8' || prop === 'HEAPF32' || prop === 'HEAPU32') {
          throw new Error(
            `Direct heap access (${prop}) is not available in Worker mode. ` +
            `Use wasmProxy.heapRead(ptr, size) / wasmProxy.heapWrite(ptr, data) instead.`
          );
        }

        return undefined;
      }
    });
  }

  /**
   * Initialize the Worker and load the WASM module.
   * @param {string} wasmUrl - URL to the a2e.js loader script
   * @returns {Promise} Resolves when the Worker is ready
   */
  async init(wasmUrl) {
    this._readyPromise = new Promise(resolve => {
      this._readyResolve = resolve;
    });

    // Classic Worker (not module) — required for importScripts() compatibility
    // In dev mode, load from src; in production, load from root
    const workerPath = import.meta.env.DEV
      ? '/src/js/worker/emulator-worker.js'
      : '/emulator-worker.js';
    this.worker = new Worker(workerPath);

    this.worker.onmessage = (event) => this._handleMessage(event.data);
    this.worker.onerror = (err) => console.error('Worker error:', err);

    // Send init message
    this.worker.postMessage({ type: MSG_INIT, wasmUrl });

    return this._readyPromise;
  }

  _handleMessage(msg) {
    switch (msg.type) {
      case MSG_READY:
        this._ready = true;
        if (this._readyResolve) this._readyResolve();
        break;

      case MSG_RPC_RESULT: {
        const pending = this.pendingCalls.get(msg.id);
        if (pending) {
          this.pendingCalls.delete(msg.id);
          pending.resolve(msg.result);
        }
        break;
      }

      case MSG_RPC_BATCH_RESULT: {
        const pending = this.pendingCalls.get(msg.id);
        if (pending) {
          this.pendingCalls.delete(msg.id);
          pending.resolve(msg.results);
        }
        break;
      }

      case MSG_RPC_ERROR: {
        const pending = this.pendingCalls.get(msg.id);
        if (pending) {
          this.pendingCalls.delete(msg.id);
          pending.reject(new Error(msg.error));
        } else {
          console.error('Worker RPC error (no pending call):', msg.error);
        }
        break;
      }

      case MSG_AUDIO_SAMPLES: {
        if (this.onAudioSamples) {
          this.onAudioSamples(new Float32Array(msg.samples));
        }
        break;
      }

      case MSG_FRAME_READY: {
        if (this.onFrameReady) {
          this.onFrameReady(new Uint8Array(msg.framebuffer));
        }
        break;
      }
    }
  }

  /**
   * Call a WASM function. Fire-and-forget functions return a resolved promise.
   * Others wait for the Worker's response.
   */
  _call(fn, args) {
    if (!this.worker) {
      return Promise.reject(new Error('Worker not initialized'));
    }

    if (FIRE_AND_FORGET.has(fn)) {
      const id = ++rpcIdCounter;
      this.worker.postMessage({ type: MSG_RPC_CALL, id, fn, args });
      return Promise.resolve();
    }

    const id = ++rpcIdCounter;
    return new Promise((resolve, reject) => {
      this.pendingCalls.set(id, { resolve, reject });
      this.worker.postMessage({ type: MSG_RPC_CALL, id, fn, args });
    });
  }

  /**
   * Execute multiple WASM calls in a single round-trip.
   * @param {Array} calls - Array of [fnName, ...args]
   * @returns {Promise<Array>} Array of results
   */
  batch(calls) {
    if (!this.worker) {
      return Promise.reject(new Error('Worker not initialized'));
    }

    const id = ++rpcIdCounter;
    const formattedCalls = calls.map(c => ({
      fn: c[0],
      args: c.slice(1),
    }));

    return new Promise((resolve, reject) => {
      this.pendingCalls.set(id, { resolve, reject });
      this.worker.postMessage({ type: MSG_RPC_BATCH, id, calls: formattedCalls });
    });
  }

  /**
   * Send data to Worker as Transferable (zero-copy).
   * Used for disk images, state data, etc.
   */
  transfer(fn, args, transferIndex) {
    const id = ++rpcIdCounter;
    const transferable = [args[transferIndex]];
    return new Promise((resolve, reject) => {
      this.pendingCalls.set(id, { resolve, reject });
      this.worker.postMessage(
        { type: MSG_TRANSFER_DATA, id, fn, args, transferIndex },
        transferable
      );
    });
  }

  /**
   * Read bytes from WASM heap.
   * @returns {Promise<Uint8Array>}
   */
  heapRead(ptr, size) {
    return this._call('__heapU8Slice', [ptr, size]);
  }

  /**
   * Write bytes to WASM heap.
   * @param {number} ptr - WASM heap pointer
   * @param {Uint8Array|Array} data - Data to write
   */
  heapWrite(ptr, data) {
    return this._call('__heapWrite', [ptr, Array.from(data)]);
  }

  /**
   * Read Float32 values from WASM heap.
   * @returns {Promise<Float32Array>}
   */
  heapReadF32(ptr, count) {
    return this._call('__heapReadF32', [ptr, count]);
  }

  /**
   * Read Uint32 values from WASM heap.
   * @returns {Promise<Array<number>>}
   */
  heapReadU32(ptr, count) {
    return this._call('__heapU32Read', [ptr, count]);
  }

  /**
   * Read Uint16 values from WASM heap.
   * @returns {Promise<Array<number>>}
   */
  heapReadU16(ptr, count) {
    return this._call('__heapU16Read', [ptr, count]);
  }

  /**
   * Read a 32-bit unsigned int from WASM heap via DataView (little-endian).
   * @returns {Promise<number>}
   */
  heapDataViewU32(ptr) {
    return this._call('__heapDataViewU32', [ptr]);
  }

  /**
   * Request the Worker to generate audio samples (audio-driven timing).
   * Called when the AudioWorklet's buffer runs low.
   */
  requestSamples(count) {
    if (this.worker) {
      this.worker.postMessage({ type: MSG_REQUEST_SAMPLES, count });
    }
  }

  /**
   * Configure shared audio buffer (Phase 2).
   */
  configureSharedAudio(sharedAudioBuffer) {
    this.worker.postMessage(
      { type: MSG_AUDIO_CONFIG, sharedAudioBuffer },
    );
  }

  /**
   * Configure shared framebuffer and control block (Phase 3).
   */
  configureSharedBuffers(sharedFramebuffer, sharedControl) {
    this.worker.postMessage(
      { type: MSG_FRAMEBUFFER_CONFIG, sharedFramebuffer, sharedControl },
    );
  }

  /**
   * Terminate the worker.
   */
  destroy() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.pendingCalls.clear();
  }
}
