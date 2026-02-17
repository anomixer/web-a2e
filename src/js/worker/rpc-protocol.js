/*
 * rpc-protocol.js - Shared message type constants for Worker RPC
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

// Main thread → Worker
export const MSG_RPC_CALL = 'rpc-call';           // { id, fn, args }
export const MSG_RPC_BATCH = 'rpc-batch';          // { id, calls: [{fn, args}] }
export const MSG_INIT = 'init';                     // { wasmUrl }
export const MSG_TRANSFER_DATA = 'transfer-data';   // { id, fn, args, transferIndex } — args[transferIndex] is Transferable
export const MSG_AUDIO_CONFIG = 'audio-config';     // { sharedAudioBuffer } (Phase 2)
export const MSG_FRAMEBUFFER_CONFIG = 'fb-config';  // { sharedFramebuffer, sharedControl } (Phase 3)
export const MSG_REQUEST_SAMPLES = 'request-samples'; // { count } — AudioWorklet requesting sample generation

// Worker → Main thread
export const MSG_RPC_RESULT = 'rpc-result';         // { id, result }
export const MSG_RPC_BATCH_RESULT = 'rpc-batch-result'; // { id, results }
export const MSG_RPC_ERROR = 'rpc-error';           // { id, error }
export const MSG_READY = 'ready';                   // Worker initialized
export const MSG_AUDIO_SAMPLES = 'audio-samples';   // { samples } (Phase 1 postMessage audio)
export const MSG_FRAME_READY = 'frame-ready';       // { framebuffer } (Phase 1 postMessage framebuffer)
export const MSG_HEAP_ACCESS = 'heap-access';       // { id, data } — result of heap read operations
