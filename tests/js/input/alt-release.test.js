/*
 * alt-release.test.js - Reconciling Alt key releases to Apple buttons
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { describe, it, expect } from "vitest";
import { reconcileAltRelease } from "../../../src/js/input/input-handler.js";

const both = () => new Set(["left", "right"]);

describe("reconcileAltRelease", () => {
  it("keeps the other side held when one of two is released", () => {
    // The bug this exists for: releasing left while right is still down used to
    // clear the wrong button and leave Closed Apple latched.
    const { held, release } = reconcileAltRelease(both(), "left", true);

    expect([...held]).toEqual(["right"]);
    expect(release).toEqual(["left"]);
  });

  it("releases both when the last Alt goes up", () => {
    const { held, release } = reconcileAltRelease(new Set(["right"]), "right", false);

    expect(held.size).toBe(0);
    expect(release).toEqual(["left", "right"]);
  });

  it("clears everything when altKey says nothing is held, whatever we believed", () => {
    // Self-correcting: if an earlier keyup was attributed to the wrong side, our
    // idea of what is down is stale. altKey false is authoritative.
    const { held, release } = reconcileAltRelease(both(), "left", false);

    expect(held.size).toBe(0);
    expect(release).toEqual(["left", "right"]);
  });

  it("still releases a side we never saw pressed", () => {
    // A keyup arriving for a side with no matching keydown must not latch it.
    const { held, release } = reconcileAltRelease(new Set(), "right", false);

    expect(held.size).toBe(0);
    expect(release).toEqual(["left", "right"]);
  });

  it("does not mutate the set it is given", () => {
    const original = both();
    reconcileAltRelease(original, "left", true);

    expect([...original].sort()).toEqual(["left", "right"]);
  });

  it("releasing the same side twice is stable", () => {
    const first = reconcileAltRelease(both(), "left", true);
    const second = reconcileAltRelease(first.held, "left", true);

    expect([...second.held]).toEqual(["right"]);
    expect(second.release).toEqual(["left"]);
  });
});
