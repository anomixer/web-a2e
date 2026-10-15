import { describe, expect, it } from "vitest";

import { APP_DATABASES, databasesToDelete } from "../../../src/js/state/site-data.js";

describe("databasesToDelete", () => {
  it("names every database the emulator opens, disks included", () => {
    for (const name of [
      "a2e-state-persistence",
      "a2e-disk-persistence",
      "a2e-35-persistence",
      "a2e-hd-persistence",
      "a2e-disk-library-cache",
      "a2e-printer-pages",
    ]) {
      expect(APP_DATABASES).toContain(name);
    }
  });

  it("adds any other a2e- database the browser lists, and nobody else's", async () => {
    const idb = {
      databases: async () => [{ name: "a2e-something-new" }, { name: "another-site" }, { name: "a2e-disk-persistence" }],
    };
    const names = await databasesToDelete(idb);
    expect(names).toContain("a2e-something-new");
    expect(names).not.toContain("another-site");
    expect(names.filter((n) => n === "a2e-disk-persistence")).toHaveLength(1);
  });

  it("falls back to the known list where the browser cannot list databases", async () => {
    expect(await databasesToDelete({})).toEqual(APP_DATABASES);
    const failing = { databases: async () => { throw new Error("no"); } };
    expect(await databasesToDelete(failing)).toEqual(APP_DATABASES);
  });
});
