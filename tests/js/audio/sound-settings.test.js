import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SoundSettings, chipCode, parseChip } from "../../../src/js/audio/sound-settings.js";

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

function deps() {
  return {
    wasmModule: {
      _setMockingboardPhaseLock: vi.fn(),
      _setMockingboardMono: vi.fn(),
      _setMockingboardChip: vi.fn(),
    },
    diskManager: { setSeekSoundEnabled: vi.fn(), setMotorSoundEnabled: vi.fn() },
  };
}

beforeEach(() => {
  globalThis.localStorage = fakeStorage();
});

afterEach(() => {
  delete globalThis.localStorage;
});

describe("the Mockingboard chip", () => {
  it("is the AY-3-8910 unless the YM2149F was chosen", () => {
    expect(parseChip(null)).toBe("ay");
    expect(parseChip("nonsense")).toBe("ay");
    expect(parseChip("ym")).toBe("ym");
  });

  it("is 0 for the AY-3-8910 and 1 for the YM2149F in the core", () => {
    expect(chipCode("ay")).toBe(0);
    expect(chipCode("ym")).toBe(1);
  });

  it("is pushed into the core at startup as it was left", () => {
    globalThis.localStorage = fakeStorage({ "a2e-mockingboard-chip": "ym" });
    const d = deps();
    new SoundSettings(d).apply();
    expect(d.wasmModule._setMockingboardChip).toHaveBeenCalledWith(1);
  });

  it("is remembered and pushed into the core when changed", () => {
    const d = deps();
    const settings = new SoundSettings(d);
    settings.setChip("ym");
    expect(settings.chip).toBe("ym");
    expect(localStorage.data["a2e-mockingboard-chip"]).toBe("ym");
    expect(d.wasmModule._setMockingboardChip).toHaveBeenLastCalledWith(1);
  });
});

describe("the other sound settings", () => {
  it("are on until turned off", () => {
    const settings = new SoundSettings(deps());
    expect([settings.phaseLock, settings.mono, settings.driveSounds, settings.printerSounds]).toEqual([
      true,
      true,
      true,
      true,
    ]);
  });

  it("turn the drive sounds off together", () => {
    const d = deps();
    new SoundSettings(d).setDriveSounds(false);
    expect(d.diskManager.setSeekSoundEnabled).toHaveBeenCalledWith(false);
    expect(d.diskManager.setMotorSoundEnabled).toHaveBeenCalledWith(false);
    expect(localStorage.data["a2e-drive-sounds"]).toBe("false");
  });
});
