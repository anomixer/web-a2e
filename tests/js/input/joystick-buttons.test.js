/*
 * joystick-buttons.test.js - Apple button state from the soft switch word
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { describe, it, expect } from "vitest";
import { buttonsFromSoftSwitchState } from "../../../src/js/input/joystick-window.js";

// BTN0 ($C061) and BTN1 ($C062) are bits 24 and 25, matching soft-switch-window.js
const BTN0 = 1 << 24;
const BTN1 = 1 << 25;

describe("buttonsFromSoftSwitchState", () => {
  it("reports both buttons released for a zero word", () => {
    expect(buttonsFromSoftSwitchState(0)).toEqual({ button0: false, button1: false });
  });

  it("picks out each button independently", () => {
    expect(buttonsFromSoftSwitchState(BTN0)).toEqual({ button0: true, button1: false });
    expect(buttonsFromSoftSwitchState(BTN1)).toEqual({ button0: false, button1: true });
    expect(buttonsFromSoftSwitchState(BTN0 | BTN1)).toEqual({ button0: true, button1: true });
  });

  it("ignores unrelated switches", () => {
    // Every other bit set: neither button should read as pressed.
    const others = ~(BTN0 | BTN1);
    expect(buttonsFromSoftSwitchState(others)).toEqual({ button0: false, button1: false });
  });

  it("is not confused by the sign bit", () => {
    // Bit 31 makes the word negative in JS, which naive masking can trip over.
    const withSignBit = (BTN1 | (1 << 31)) | 0;
    expect(buttonsFromSoftSwitchState(withSignBit)).toEqual({ button0: false, button1: true });
  });
});
