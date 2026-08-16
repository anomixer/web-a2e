import { describe, expect, it, vi } from "vitest";

import {
  PROFILE_STORAGE_KEY,
  captureProfileValues,
  deleteProfile,
  findProfile,
  isProfileId,
  loadProfiles,
  profileId,
  saveProfiles,
  upsertProfile,
  validateProfileName,
} from "../../../src/js/display/display-profiles.js";

/** Minimal stand-in for localStorage — the module only needs get and set. */
function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

const SETTINGS = {
  preset: "custom",
  brightness: 110,
  contrast: 95,
  curvature: 20,
  colorMode: 3,
  bezelColor: "#c8b89a",
  sharpPixels: false,
};

describe("profile identity", () => {
  it("identifies profiles by name, case- and space-insensitively", () => {
    expect(profileId("My TV")).toBe(profileId("  my tv  "));
  });

  it("never collides with a built-in preset id", () => {
    for (const builtin of ["flat", "composite", "rgb", "green", "amber", "custom"]) {
      expect(profileId(builtin)).not.toBe(builtin);
      expect(isProfileId(builtin)).toBe(false);
    }
    expect(isProfileId(profileId("flat"))).toBe(true);
  });
});

describe("name validation", () => {
  it("rejects empty and whitespace-only names", () => {
    for (const bad of ["", "   ", "\t"]) {
      expect(validateProfileName(bad).ok).toBe(false);
    }
  });

  it("rejects 'Custom' in any casing, since it labels a different state", () => {
    for (const bad of ["Custom", "custom", "CUSTOM", "  Custom "]) {
      const result = validateProfileName(bad);
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/reserved/i);
    }
  });

  it("rejects names that are too long", () => {
    expect(validateProfileName("x".repeat(41)).ok).toBe(false);
    expect(validateProfileName("x".repeat(40)).ok).toBe(true);
  });

  it("trims accepted names", () => {
    expect(validateProfileName("  My TV  ")).toEqual({ ok: true, name: "My TV" });
  });
});

describe("upsert", () => {
  it("adds a new profile", () => {
    const { profiles, replaced } = upsertProfile([], "My TV", SETTINGS);
    expect(replaced).toBe(false);
    expect(profiles).toHaveLength(1);
    expect(profiles[0].name).toBe("My TV");
  });

  it("replaces in place when the name already exists, keeping the order", () => {
    let profiles = [];
    ({ profiles } = upsertProfile(profiles, "One", { brightness: 1 }));
    ({ profiles } = upsertProfile(profiles, "Two", { brightness: 2 }));

    const result = upsertProfile(profiles, "one", { brightness: 99 });
    expect(result.replaced).toBe(true);
    expect(result.profiles).toHaveLength(2);
    expect(result.profiles[0].values.brightness).toBe(99);
    expect(result.profiles[1].name).toBe("Two");
  });

  it("does not mutate the array it was given", () => {
    const profiles = [];
    upsertProfile(profiles, "My TV", SETTINGS);
    expect(profiles).toHaveLength(0);
  });

  it("copies values, so later edits to the live settings do not leak in", () => {
    const live = { ...SETTINGS };
    const { profiles } = upsertProfile([], "My TV", live);
    live.brightness = 999;
    expect(profiles[0].values.brightness).toBe(110);
  });
});

describe("capture", () => {
  it("keeps calibration and bezel, unlike a built-in preset", () => {
    // The whole point of a profile: restoring it gives back the picture that
    // was saved, not a partly-reverted version of it.
    const values = captureProfileValues(SETTINGS);
    expect(values.brightness).toBe(110);
    expect(values.contrast).toBe(95);
    expect(values.bezelColor).toBe("#c8b89a");
  });

  it("drops preset, so a profile cannot point at itself", () => {
    expect(captureProfileValues(SETTINGS)).not.toHaveProperty("preset");
  });
});

describe("persistence", () => {
  it("round-trips through storage", () => {
    const storage = fakeStorage();
    const { profiles } = upsertProfile([], "My TV", SETTINGS);

    expect(saveProfiles(profiles, storage)).toBe(true);
    const loaded = loadProfiles(storage);

    expect(loaded).toHaveLength(1);
    expect(loaded[0].name).toBe("My TV");
    expect(loaded[0].id).toBe(profileId("My TV"));
    expect(loaded[0].values.brightness).toBe(110);
  });

  it("returns an empty list when nothing is stored", () => {
    expect(loadProfiles(fakeStorage())).toEqual([]);
  });

  it("survives malformed JSON without throwing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const storage = fakeStorage({ [PROFILE_STORAGE_KEY]: "{not json" });
    expect(loadProfiles(storage)).toEqual([]);
    warn.mockRestore();
  });

  it("survives a stored value that is not an array", () => {
    const storage = fakeStorage({ [PROFILE_STORAGE_KEY]: '{"nope":1}' });
    expect(loadProfiles(storage)).toEqual([]);
  });

  it("drops only the malformed entries, keeping the good ones", () => {
    // A corrupted entry should cost that one profile, not the whole window.
    const storage = fakeStorage({
      [PROFILE_STORAGE_KEY]: JSON.stringify([
        { name: "Good", values: { brightness: 50 } },
        { name: "", values: { brightness: 1 } },
        { name: "No values" },
        null,
        "nonsense",
        { values: { brightness: 2 } },
        { name: "Also good", values: { contrast: 70 } },
      ]),
    });

    const loaded = loadProfiles(storage);
    expect(loaded.map((p) => p.name)).toEqual(["Good", "Also good"]);
  });

  it("reports failure rather than throwing when storage is full", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(saveProfiles([{ name: "x", values: {} }], storage)).toBe(false);
    warn.mockRestore();
  });
});

describe("delete and find", () => {
  it("removes by id and leaves the rest alone", () => {
    let profiles = [];
    ({ profiles } = upsertProfile(profiles, "One", {}));
    ({ profiles } = upsertProfile(profiles, "Two", {}));

    const next = deleteProfile(profiles, profileId("One"));
    expect(next.map((p) => p.name)).toEqual(["Two"]);
    // Original untouched.
    expect(profiles).toHaveLength(2);
  });

  it("finds by id and returns null for anything else", () => {
    const { profiles } = upsertProfile([], "My TV", SETTINGS);
    expect(findProfile(profiles, profileId("my tv")).name).toBe("My TV");
    expect(findProfile(profiles, "composite")).toBeNull();
    expect(findProfile(profiles, "custom")).toBeNull();
  });
});
