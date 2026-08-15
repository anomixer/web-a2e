import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  BASE_CLOCK_MHZ,
  EmulationSpeed,
  SPEED_OPTIONS,
  clampSpeed,
  clockLabel,
  loadStoredSpeed,
  speedLabel,
  storeSpeed,
} from "../../../src/js/ui/emulation-speed.js";

/** Minimal stand-in for localStorage. */
function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = String(v);
    },
  };
}

beforeEach(() => {
  globalThis.localStorage = fakeStorage();
});

afterEach(() => {
  delete globalThis.localStorage;
});

describe("clampSpeed", () => {
  it("passes supported multipliers through", () => {
    for (const option of SPEED_OPTIONS) {
      expect(clampSpeed(option)).toBe(option);
    }
  });

  it("snaps unsupported values to the nearest option", () => {
    expect(clampSpeed(3)).toBe(2); // equidistant: first wins
    expect(clampSpeed(5)).toBe(4);
    expect(clampSpeed(7)).toBe(8);
  });

  it("never exceeds what the core accepts", () => {
    expect(clampSpeed(64)).toBe(8);
    expect(clampSpeed(0)).toBe(1);
    expect(clampSpeed(-4)).toBe(1);
  });

  it("falls back to 1x for junk, since it parses stored strings", () => {
    for (const junk of [undefined, null, "", "fast", NaN]) {
      expect(clampSpeed(junk)).toBe(1);
    }
    expect(clampSpeed("4")).toBe(4);
  });
});

describe("labels", () => {
  it("labels the multiplier and the clock it implies", () => {
    expect(speedLabel(4)).toBe("4x");
    expect(clockLabel(1)).toBe(`${BASE_CLOCK_MHZ.toFixed(2)} MHz`);
    expect(clockLabel(8)).toBe("8.18 MHz");
  });
});

describe("persistence", () => {
  it("defaults to 1x when nothing is stored", () => {
    expect(loadStoredSpeed()).toBe(1);
  });

  it("round-trips a stored speed", () => {
    storeSpeed(4);
    expect(loadStoredSpeed()).toBe(4);
  });

  it("ignores a corrupted stored value rather than throwing", () => {
    globalThis.localStorage = fakeStorage({ "emulation-speed": "banana" });
    expect(loadStoredSpeed()).toBe(1);
  });

  it("survives storage being unavailable", () => {
    delete globalThis.localStorage;
    expect(loadStoredSpeed()).toBe(1);
    expect(() => storeSpeed(2)).not.toThrow();
  });
});

describe("EmulationSpeed", () => {
  it("restores the stored speed and pushes it into WASM on apply", () => {
    storeSpeed(2);
    const wasmModule = { _setSpeedMultiplier: vi.fn() };
    const speed = new EmulationSpeed({ wasmModule });

    expect(speed.multiplier).toBe(2);
    speed.apply();
    expect(wasmModule._setSpeedMultiplier).toHaveBeenCalledWith(2);
  });

  it("notifies listeners immediately and on every change", () => {
    const wasmModule = { _setSpeedMultiplier: vi.fn() };
    const speed = new EmulationSpeed({ wasmModule });
    const seen = [];
    speed.onChange((m) => seen.push(m));

    speed.setSpeed(8);
    expect(seen).toEqual([1, 8]);
    expect(loadStoredSpeed()).toBe(8);
  });

  it("hands the baseline to the input handler so a paste boost is not fought over", () => {
    const wasmModule = { _setSpeedMultiplier: vi.fn() };
    const inputHandler = { setBaseSpeed: vi.fn() };
    const speed = new EmulationSpeed({ wasmModule, inputHandler });

    speed.setSpeed(4);
    expect(inputHandler.setBaseSpeed).toHaveBeenCalledWith(4);
    expect(wasmModule._setSpeedMultiplier).not.toHaveBeenCalled();
  });
});
