import { describe, expect, it } from "vitest";
import {
  frameSlotToWrite,
  publishFrame,
  takeFrame,
  MAX_FRAME_BACKLOG,
} from "../../../src/js/worker/frame-queue.js";
import {
  FB_SLOTS,
  CTRL_BLOCK_INTS,
  CTRL_FRAMES_WRITTEN,
  CTRL_FRAMES_SHOWN,
} from "../../../src/js/worker/shared-buffers.js";

const control = () => new Int32Array(new SharedArrayBuffer(CTRL_BLOCK_INTS * 4));

function publish(ctl) {
  const slot = frameSlotToWrite(ctl);
  if (slot >= 0) publishFrame(ctl);
  return slot;
}

describe("the frame queue", () => {
  it("shows nothing until a frame arrives, and each frame once", () => {
    const ctl = control();
    expect(takeFrame(ctl)).toBe(-1);
    const slot = publish(ctl);
    expect(takeFrame(ctl)).toBe(slot);
    expect(takeFrame(ctl)).toBe(-1);
  });

  it("shows two frames that arrived together on successive refreshes", () => {
    // The reason it exists: with only the newest kept, the first was lost.
    const ctl = control();
    const first = publish(ctl);
    const second = publish(ctl);
    expect(first).not.toBe(second);
    expect(takeFrame(ctl)).toBe(first);
    expect(takeFrame(ctl)).toBe(second);
  });

  it("jumps to the newest frame rather than let the delay grow", () => {
    const ctl = control();
    // The renderer holds a frame, as it always does once running.
    publish(ctl);
    takeFrame(ctl);
    const slots = [];
    for (let i = 0; i <= MAX_FRAME_BACKLOG; i++) slots.push(publish(ctl));
    expect(slots).not.toContain(-1);
    expect(takeFrame(ctl)).toBe(slots[slots.length - 1]);
    expect(takeFrame(ctl)).toBe(-1);
  });

  it("drops new frames once a renderer that stopped taking them is full", () => {
    const ctl = control();
    let accepted = 0;
    for (let i = 0; i < 10; i++) if (publish(ctl) >= 0) accepted++;
    expect(accepted).toBe(FB_SLOTS - 1);
    expect(takeFrame(ctl)).toBeGreaterThanOrEqual(0);
    expect(publish(ctl)).toBeGreaterThanOrEqual(0);
  });

  it("never writes into the slot the renderer is holding", () => {
    // A random interleaving of publishes and refreshes, bursts included. The
    // held slot is what a paused machine keeps redrawing and a screenshot
    // reads, so a write landing there would tear it.
    const ctl = control();
    let held = -1;
    let seed = 12345;
    const random = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
    for (let step = 0; step < 100000; step++) {
      if (random() < 0.5) {
        const slot = frameSlotToWrite(ctl);
        if (slot >= 0) {
          expect(slot).not.toBe(held);
          publishFrame(ctl);
        }
      } else {
        const slot = takeFrame(ctl);
        if (slot >= 0) held = slot;
      }
    }
  });

  it("keeps working when the counters wrap", () => {
    const ctl = control();
    ctl[CTRL_FRAMES_WRITTEN] = 0x7fffffff;
    ctl[CTRL_FRAMES_SHOWN] = 0x7fffffff;
    const first = publish(ctl);
    const second = publish(ctl);
    expect(takeFrame(ctl)).toBe(first);
    expect(takeFrame(ctl)).toBe(second);
    expect(takeFrame(ctl)).toBe(-1);
  });
});
