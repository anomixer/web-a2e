/*
 * is-right-alt.test.js - Which Alt key maps to which Apple button
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { describe, it, expect } from "vitest";
import { isRightAlt } from "../../../src/js/input/input-handler.js";

// KeyboardEvent.DOM_KEY_LOCATION_*
const STANDARD = 0;
const LEFT = 1;
const RIGHT = 2;

describe("isRightAlt", () => {
  it("treats location 2 as the right Alt", () => {
    expect(isRightAlt({ location: RIGHT })).toBe(true);
  });

  it("treats location 1 as the left Alt", () => {
    expect(isRightAlt({ location: LEFT })).toBe(false);
  });

  it("treats an unspecified location as the left Alt", () => {
    // Location 0 means the browser did not say which side. Falling back to
    // left keeps Open Apple working rather than silently producing Closed
    // Apple on a synthetic or unusual event.
    expect(isRightAlt({ location: STANDARD })).toBe(false);
    expect(isRightAlt({})).toBe(false);
  });

  it("does not treat a numeric-keypad location as right", () => {
    // DOM_KEY_LOCATION_NUMPAD is 3; only 2 is the right-hand modifier.
    expect(isRightAlt({ location: 3 })).toBe(false);
  });
});
