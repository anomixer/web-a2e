/*
 * video-standard.test.js - NTSC or PAL, chosen and remembered per machine
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_STANDARD,
  applyStandard,
  loadRememberedStandard,
  normaliseStandard,
  profileStandard,
  rememberStandard,
} from "../../../src/js/machine/video-standard.js";

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

describe("remembering a standard", () => {
  it("starts every machine on NTSC", () => {
    expect(DEFAULT_STANDARD).toBe("ntsc");
    expect(loadRememberedStandard("apple2e")).toBe("ntsc");
  });

  it("keeps each machine's choice apart", () => {
    rememberStandard("apple2e", "pal");
    expect(loadRememberedStandard("apple2e")).toBe("pal");
    expect(loadRememberedStandard("apple2c")).toBe("ntsc");
  });

  it("reads anything it does not know as NTSC", () => {
    localStorage.setItem("a2e-video-standard:apple2e", "secam");
    expect(loadRememberedStandard("apple2e")).toBe("ntsc");
    expect(normaliseStandard(undefined)).toBe("ntsc");
  });

  it("survives storage that throws", () => {
    globalThis.localStorage = {
      getItem() { throw new Error("blocked"); },
      setItem() { throw new Error("blocked"); },
    };
    expect(() => rememberStandard("apple2e", "pal")).not.toThrow();
    expect(loadRememberedStandard("apple2e")).toBe("ntsc");
  });
});

describe("talking to the core", () => {
  it("reads the standard off a profile", () => {
    expect(profileStandard({ timing: { standard: "pal" } })).toBe("pal");
    expect(profileStandard({ timing: { standard: "ntsc" } })).toBe("ntsc");
    expect(profileStandard({ timing: {} })).toBe("ntsc");
  });

  it("passes PAL as 1 and NTSC as 0, and reports what the core said", async () => {
    const calls = [];
    const core = { _setVideoStandard: async (s) => { calls.push(s); return s === 1; } };
    expect(await applyStandard(core, "pal")).toBe(true);
    expect(await applyStandard(core, "ntsc")).toBe(false);
    expect(calls).toEqual([1, 0]);
  });

  it("leaves a core without the export alone", async () => {
    expect(await applyStandard({}, "pal")).toBe(false);
  });
});
