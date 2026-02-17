/*
 * shared-buffers.js - SharedArrayBuffer layouts, allocation, constants
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

// --- Framebuffer ---
export const FB_WIDTH = 560;
export const FB_HEIGHT = 384;
export const FB_BYTES = FB_WIDTH * FB_HEIGHT * 4; // 860,160 bytes RGBA

// --- Audio ring buffer (Phase 2) ---
// Layout: [writePos:i32][readPos:i32][ringData:f32[RING_SIZE]]
export const AUDIO_HEADER_BYTES = 8;               // 2 x Int32 (writePos, readPos)
export const AUDIO_RING_FRAMES = 16384;             // stereo frames
export const AUDIO_RING_FLOATS = AUDIO_RING_FRAMES * 2; // interleaved L/R
export const AUDIO_RING_BYTES = AUDIO_RING_FLOATS * 4;
export const AUDIO_BUFFER_TOTAL = AUDIO_HEADER_BYTES + AUDIO_RING_BYTES;
export const AUDIO_WRITE_POS_OFFSET = 0;            // byte offset of writePos Int32
export const AUDIO_READ_POS_OFFSET = 4;             // byte offset of readPos Int32
export const AUDIO_DATA_OFFSET = AUDIO_HEADER_BYTES; // byte offset of ring data

// --- Control/status block (Phase 3) ---
// All Int32 values, indexed by Int32 offset
export const CTRL_FRAME_READY = 0;
export const CTRL_IS_PAUSED = 1;
export const CTRL_PC = 2;
export const CTRL_A = 3;
export const CTRL_X = 4;
export const CTRL_Y = 5;
export const CTRL_SP = 6;
export const CTRL_P = 7;
export const CTRL_BEAM_SCANLINE = 8;
export const CTRL_BEAM_HPOS = 9;
export const CTRL_BEAM_COLUMN = 10;
export const CTRL_FRAME_CYCLE = 11;
export const CTRL_BP_HIT = 12;
export const CTRL_BP_ADDR = 13;
export const CTRL_TOTAL_CYCLES_LO = 14;
export const CTRL_TOTAL_CYCLES_HI = 15;
export const CTRL_BLOCK_INTS = 64;                  // 256 bytes
export const CTRL_BLOCK_BYTES = CTRL_BLOCK_INTS * 4;

/**
 * Check if SharedArrayBuffer is available (requires COOP/COEP headers)
 */
export function isSharedArrayBufferAvailable() {
  try {
    return typeof SharedArrayBuffer !== 'undefined' &&
           typeof Atomics !== 'undefined';
  } catch (e) {
    return false;
  }
}

/**
 * Allocate shared buffers for Phase 2+3
 */
export function allocateSharedBuffers() {
  if (!isSharedArrayBufferAvailable()) {
    return null;
  }
  return {
    audio: new SharedArrayBuffer(AUDIO_BUFFER_TOTAL),
    framebuffer: new SharedArrayBuffer(FB_BYTES),
    control: new SharedArrayBuffer(CTRL_BLOCK_BYTES),
  };
}
