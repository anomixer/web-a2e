import { describe, expect, it } from "vitest";
import {
  BreakpointManager,
  STACK_KEY_BASE,
  parseAddressRange,
} from "../../../src/js/debug/breakpoint-manager.js";

// A core that records what it is asked, as the proxy would send it.
function fakeCore() {
  const calls = [];
  return new Proxy({ calls }, {
    get(target, name) {
      if (name === "calls") return calls;
      return (...args) => { calls.push([name, ...args]); return 0; };
    },
  });
}

const hex = (part) => {
  const m = part.match(/^\$?([0-9A-Fa-f]{1,6})$/);
  return m ? parseInt(m[1], 16) : null;
};

describe("parseAddressRange", () => {
  it("reads a single address as a range of one", () => {
    expect(parseAddressRange("$2000", hex)).toEqual({ start: 0x2000, end: 0x2000 });
  });
  it("reads a range, with or without the dollars", () => {
    expect(parseAddressRange("$2000-$20FF", hex)).toEqual({ start: 0x2000, end: 0x20ff });
    expect(parseAddressRange("2000 - 20ff", hex)).toEqual({ start: 0x2000, end: 0x20ff });
  });
  it("puts a range written backwards the right way round", () => {
    expect(parseAddressRange("$20FF-$2000", hex)).toEqual({ start: 0x2000, end: 0x20ff });
  });
  it("resolves each end, so symbols work", () => {
    const symbols = (part) => ({ HOME: 0xfc58, COUT: 0xfded }[part] ?? hex(part));
    expect(parseAddressRange("HOME-COUT", symbols)).toEqual({ start: 0xfc58, end: 0xfded });
  });
  it("refuses what it cannot read", () => {
    expect(parseAddressRange("", hex)).toBeNull();
    expect(parseAddressRange("nonsense", hex)).toBeNull();
    expect(parseAddressRange("$2000-", hex)).toBeNull();
    expect(parseAddressRange("-$2000", hex)).toBeNull();
  });
});

describe("BreakpointManager", () => {
  it("sends a single address to the core as a breakpoint", () => {
    const core = fakeCore();
    const bm = new BreakpointManager(core);
    bm.add(0x0300);
    expect(core.calls).toContainEqual(["_addBreakpoint", 0x0300]);
  });

  it("sends an execution range to the core as a range", () => {
    const core = fakeCore();
    const bm = new BreakpointManager(core);
    bm.add(0x2000, { type: "exec", endAddress: 0x20ff });
    expect(core.calls).toContainEqual(["_addBreakpointRange", 0x2000, 0x20ff]);
    expect(core.calls.some(([n]) => n === "_addBreakpoint")).toBe(false);

    bm.setEnabled(0x2000, false);
    expect(core.calls).toContainEqual(["_enableBreakpointRange", 0x2000, false]);
    bm.remove(0x2000);
    expect(core.calls).toContainEqual(["_removeBreakpointRange", 0x2000]);
  });

  it("finds the range the PC entered, or the exact breakpoint first", () => {
    const bm = new BreakpointManager(fakeCore());
    bm.add(0x2000, { type: "exec", endAddress: 0x20ff });
    bm.add(0x2080);
    expect(bm.findExec(0x2010).key).toBe(0x2000);
    expect(bm.findExec(0x2080).key).toBe(0x2080);
    expect(bm.findExec(0x3000)).toBeNull();
  });

  it("keeps a stack breakpoint apart from an address with the same number", () => {
    const core = fakeCore();
    const bm = new BreakpointManager(core);
    bm.add(0x00f0);
    bm.add(0xf0, { type: "stack" });
    expect(bm.getAll().size).toBe(2);
    expect(bm.has(0x00f0)).toBe(true); // the disassembly's marker is untouched
    expect(core.calls).toContainEqual(["_addStackBreakpoint", 0xf0, 0xf0]);

    const entry = bm.findStack(0xf0);
    expect(entry.key).toBe(STACK_KEY_BASE + 0xf0);
    expect(entry.address).toBe(0xf0);

    bm.setEnabled(entry.key, false);
    expect(core.calls).toContainEqual(["_enableStackBreakpoint", 0xf0, false]);
    bm.remove(entry.key);
    expect(core.calls).toContainEqual(["_removeStackBreakpoint", 0xf0]);
    expect(bm.has(0x00f0)).toBe(true);
  });

  it("does not offer a stack breakpoint as a watchpoint match", () => {
    const bm = new BreakpointManager(fakeCore());
    bm.add(0x00, { type: "stack", endAddress: 0x3f });
    expect(bm.findByAddress(0x10)).toBeNull();
  });

  it("puts every kind back into a core that was reset", () => {
    const bm = new BreakpointManager(fakeCore());
    bm.add(0x0300);
    bm.add(0x2000, { type: "exec", endAddress: 0x20ff });
    bm.add(0x00, { type: "stack", endAddress: 0x3f });
    bm.add(0xc000, { type: "write" });
    const core = fakeCore();
    bm.wasmModule = core;
    bm.resyncToWasm();
    expect(core.calls).toContainEqual(["_addBreakpoint", 0x0300]);
    expect(core.calls).toContainEqual(["_addBreakpointRange", 0x2000, 0x20ff]);
    expect(core.calls).toContainEqual(["_addStackBreakpoint", 0x00, 0x3f]);
    expect(core.calls).toContainEqual(["_addWatchpoint", 0xc000, 0xc000, 2]);
  });
});
