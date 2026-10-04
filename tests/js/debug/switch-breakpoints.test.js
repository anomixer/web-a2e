import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CONDITION_CHANGES,
  CONDITION_EQUALS,
  SwitchBreakpointManager,
  describe as describeBp,
  parseByte,
  parseSaved,
  toCoreArgs,
} from "../../../src/js/debug/switch-breakpoints.js";

const PAGE2 = { key: "page2", name: "PAGE2", source: 0, bit: 2 };
const KEYAVAIL = { key: "keyavail", name: "KEYAVAIL", source: 0, bit: 27 };
const NEWVIDEO = { key: "newvideo", name: "NEWVIDEO", source: 0xc029, bit: 0 };

// The catalog as the core sends it for a //e and for a IIgs.
const IIE = [PAGE2, KEYAVAIL];
const IIGS = [NEWVIDEO, PAGE2, KEYAVAIL];

// A core that hands out ids and records what it is asked.
function fakeCore(catalog) {
  const calls = [];
  let nextId = 1;
  return {
    calls,
    catalog,
    callString: async () => JSON.stringify(catalog()),
    _clearSwitchBreakpoints: () => calls.push(["clear"]),
    _addSwitchBreakpoint: async (...args) => {
      calls.push(["add", ...args]);
      return nextId++;
    },
    _removeSwitchBreakpoint: (id) => calls.push(["remove", id]),
  };
}

function fakeStorage() {
  const data = {};
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = String(v);
    },
  };
}

describe("toCoreArgs", () => {
  it("puts a switch's bit in the mask and turns on into that bit", () => {
    expect(toCoreArgs({ condition: CONDITION_EQUALS, value: 1 }, PAGE2)).toEqual([0, 4, 1, 4]);
    expect(toCoreArgs({ condition: CONDITION_EQUALS, value: 0 }, PAGE2)).toEqual([0, 4, 1, 0]);
    expect(toCoreArgs({ condition: CONDITION_CHANGES }, PAGE2)).toEqual([0, 4, 0, 0]);
  });
  it("keeps a high bit's mask positive", () => {
    expect(toCoreArgs({ condition: CONDITION_CHANGES }, { source: 0, bit: 31 })[1]).toBe(0x80000000);
  });
  it("reads a register at its address, with the value under the mask", () => {
    expect(
      toCoreArgs({ condition: CONDITION_EQUALS, value: 0xc1, mask: 0x80 }, NEWVIDEO),
    ).toEqual([0xc029, 0x80, 1, 0x80]);
  });
});

describe("describe", () => {
  it("says what stops the machine", () => {
    expect(describeBp({ key: "page2", condition: CONDITION_CHANGES }, PAGE2)).toBe("PAGE2 changes");
    expect(describeBp({ key: "page2", condition: CONDITION_EQUALS, value: 1 }, PAGE2)).toBe("PAGE2 on");
    expect(describeBp({ key: "page2", condition: CONDITION_EQUALS, value: 0 }, PAGE2)).toBe("PAGE2 off");
    expect(
      describeBp({ key: "newvideo", condition: CONDITION_EQUALS, value: 0x80, mask: 0x80 }, NEWVIDEO),
    ).toBe("NEWVIDEO & $80 = $80");
    expect(
      describeBp({ key: "newvideo", condition: CONDITION_EQUALS, value: 0xc1, mask: 0xff }, NEWVIDEO),
    ).toBe("NEWVIDEO = $C1");
  });
  it("names a switch the machine does not have by its key", () => {
    expect(describeBp({ key: "newvideo", condition: CONDITION_CHANGES }, undefined)).toBe(
      "NEWVIDEO changes",
    );
  });
});

describe("parseByte and parseSaved", () => {
  it("reads a byte however the debugger writes one", () => {
    expect(parseByte("$C1")).toBe(0xc1);
    expect(parseByte("c1")).toBe(0xc1);
    expect(parseByte("0x8")).toBe(8);
    expect(parseByte("")).toBeNull();
    expect(parseByte("$100")).toBeNull();
    expect(parseByte("zz")).toBeNull();
  });
  it("drops what is malformed and what is there twice", () => {
    const saved = JSON.stringify([
      { key: "page2", condition: "change" },
      { key: "page2", condition: "change" },
      { key: "text", condition: "sometimes" },
      { condition: "change" },
      { key: "text", condition: "equals", value: 1, enabled: false },
    ]);
    expect(parseSaved(saved)).toEqual([
      { key: "page2", condition: "change", value: 0, mask: 0xff, enabled: true },
      { key: "text", condition: "equals", value: 1, mask: 0xff, enabled: false },
    ]);
    expect(parseSaved("not json")).toEqual([]);
    expect(parseSaved(null)).toEqual([]);
  });
});

describe("SwitchBreakpointManager", () => {
  let storage;
  beforeEach(() => {
    storage = fakeStorage();
    vi.stubGlobal("localStorage", storage);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("arms what the machine has, and keeps the rest for one that does", async () => {
    let machine = IIGS;
    const core = fakeCore(() => machine);
    const bps = new SwitchBreakpointManager(core);
    await bps.loadCatalog();
    await bps.add({ key: "newvideo", condition: CONDITION_EQUALS, value: 0x80, mask: 0x80 });
    await bps.add({ key: "page2", condition: CONDITION_CHANGES });
    expect(core.calls.filter((c) => c[0] === "add")).toEqual([
      ["add", 0xc029, 0x80, 1, 0x80],
      ["add", 0, 4, 0, 0],
    ]);

    // A //e has PAGE2 and no NEWVIDEO: the one is armed afresh, the other kept.
    machine = IIE;
    core.calls.length = 0;
    await bps.loadCatalog();
    expect(core.calls).toEqual([["clear"], ["add", 0, 4, 0, 0]]);
    expect(bps.breakpoints).toHaveLength(2);
    expect(bps.isApplicable(bps.breakpoints[0])).toBe(false);
  });

  it("finds the breakpoint behind a stop by the core's id", async () => {
    const core = fakeCore(() => IIE);
    const bps = new SwitchBreakpointManager(core);
    await bps.loadCatalog();
    await bps.add({ key: "page2", condition: CONDITION_CHANGES });
    await bps.add({ key: "keyavail", condition: CONDITION_EQUALS, value: 1 });
    expect(bps.findByCoreId(2)?.key).toBe("keyavail");
    expect(bps.findByCoreId(9)).toBeNull();
  });

  it("toggles, disarms when disabled, and remembers across a reload", async () => {
    const core = fakeCore(() => IIE);
    const bps = new SwitchBreakpointManager(core);
    await bps.loadCatalog();
    await bps.toggle({ key: "page2", condition: CONDITION_EQUALS, value: 1 });
    expect(await bps.add({ key: "page2", condition: CONDITION_EQUALS, value: 1 })).toBe(false);
    await bps.setEnabled(bps.breakpoints[0], false);
    expect(core.calls.at(-1)).toEqual(["remove", 1]);

    const again = new SwitchBreakpointManager(fakeCore(() => IIE));
    expect(again.breakpoints).toEqual([
      { key: "page2", condition: CONDITION_EQUALS, value: 1, mask: 0xff, enabled: false, hits: 0 },
    ]);

    await bps.toggle({ key: "page2", condition: CONDITION_EQUALS, value: 1 });
    expect(bps.breakpoints).toEqual([]);
  });
});
