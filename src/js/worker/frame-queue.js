/*
 * frame-queue.js - The shared framebuffer as a queue of frames
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

// The Worker publishes a frame whenever audio has run the machine through one,
// and audio's timing is not the display's: most frames arrive 16ms apart, but
// some come in pairs a few milliseconds apart. With one "newest frame" slot the
// first of a pair was drawn over before a refresh ever showed it, so a machine
// making 60 frames a second put about 53 on the screen. A queue keeps both and
// shows them on successive refreshes.
//
// Two counters in the control block run it. The Worker is the only writer of
// WRITTEN and the renderer the only writer of SHOWN, so neither needs a lock.
// Frame n lives in slot n % FB_SLOTS. The renderer owns the slot of the last
// frame it took, because it keeps drawing from it (a paused machine redraws the
// same frame, and screenshots read it), and the producer rule below is what
// guarantees the Worker never writes there.
//
// emulator-worker.js is a classic Worker and cannot import this module, so it
// carries its own copy of the producer half. Keep the two in step.

import {
  FB_SLOTS,
  CTRL_FRAMES_WRITTEN,
  CTRL_FRAMES_SHOWN,
} from "./shared-buffers.js";

// The furthest the renderer lets itself fall behind. Past this it jumps to the
// newest frame, so a backlog (a refresh rate below the machine's, or a tab
// that was hidden) costs a skipped frame rather than growing delay.
export const MAX_FRAME_BACKLOG = 2;

/**
 * Producer: the slot the next frame may be written into, or -1 if the queue is
 * full and this frame should be dropped.
 *
 * At most FB_SLOTS - 2 frames wait unshown, which leaves one slot for the frame
 * being written and one for the frame the renderer is holding.
 *
 * @param {Int32Array} control
 * @returns {number}
 */
export function frameSlotToWrite(control) {
  const written = Atomics.load(control, CTRL_FRAMES_WRITTEN);
  const shown = Atomics.load(control, CTRL_FRAMES_SHOWN);
  if (((written - shown) | 0) >= FB_SLOTS - 1) return -1;
  return written & (FB_SLOTS - 1);
}

/**
 * Producer: the frame in the slot frameSlotToWrite() returned is complete.
 * @param {Int32Array} control
 */
export function publishFrame(control) {
  Atomics.add(control, CTRL_FRAMES_WRITTEN, 1);
}

/**
 * Consumer: the slot of the frame to show at this refresh, or -1 if nothing new
 * has arrived. Taking a frame hands the previously held slot back.
 *
 * The oldest unshown frame is taken, so two frames that arrived together are
 * shown one refresh apart instead of one hiding the other.
 *
 * @param {Int32Array} control
 * @returns {number}
 */
export function takeFrame(control) {
  const written = Atomics.load(control, CTRL_FRAMES_WRITTEN);
  const shown = Atomics.load(control, CTRL_FRAMES_SHOWN);
  const backlog = (written - shown) | 0;
  if (backlog <= 0) return -1;
  const frame = backlog > MAX_FRAME_BACKLOG ? (written - 1) | 0 : shown;
  Atomics.store(control, CTRL_FRAMES_SHOWN, (frame + 1) | 0);
  return frame & (FB_SLOTS - 1);
}
