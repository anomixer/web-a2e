import { describe, expect, it, vi } from "vitest";

import { SEPARATOR, buildMenuBar, item, speedTitle, tidy } from "../../../src/js/ui/menu-model.js";
import { menuAvailability } from "../../../src/js/ui/machine-availability.js";
import { MOCKINGBOARD_CHIPS } from "../../../src/js/audio/sound-settings.js";

const IIE = { key: "apple2e", name: "Apple IIe Enhanced", released: 1985, hasPal: true };
const IIGS = { key: "apple2gs", name: "Apple IIgs", released: 1986 };

/** A //e with a Mockingboard in slot 4, powered off, nothing inserted. */
function snapshot(overrides = {}) {
  const profile = overrides.isIIgs
    ? { family: "apple2gs", caps: { hasExpansionSlots: true } }
    : { family: "apple2e", caps: { hasExpansionSlots: true } };
  return {
    powered: false,
    machines: [IIGS, IIE],
    machineKey: overrides.isIIgs ? "apple2gs" : "apple2e",
    isIIgs: false,
    hasPal: true,
    videoStandard: "ntsc",
    clockMHz: 1.0227,
    speed: 1,
    iigsMemorySizes: [
      { kb: 256, label: "256K" },
      { kb: 1024, label: "1M" },
    ],
    iigsMemoryKB: 256,
    available: menuAvailability(profile, { 4: "mockingboard" }),
    hasUkCharSet: true,
    ukCharacterSet: false,
    commandIsOpenApple: false,
    cursorKeys: false,
    mousePresent: false,
    muted: false,
    volume: 0.5,
    phaseLock: true,
    mockingboardMono: true,
    mockingboardChips: MOCKINGBOARD_CHIPS,
    mockingboardChip: "ay",
    driveSounds: true,
    printerSounds: true,
    appearance: "system",
    layout: null,
    popoutSide: "left",
    autoHideHeader: false,
    fullPage: false,
    fullScreen: false,
    windows: {},
    paused: false,
    drives: [null, null],
    drives35: [null, null],
    hardDrives: [null, null],
    recent: [[], []],
    autoSave: true,
    closableWindow: false,
    installed: false,
    ...overrides,
  };
}

/** Every action the model can call, each a spy. */
function actions() {
  return new Proxy({}, { get: (target, name) => (target[name] ??= vi.fn()) });
}

const titles = (bar) => bar.map((m) => m.title);
const menu = (bar, id) => bar.find((m) => m.id === id);
const labels = (entries) => entries.map((e) => (e.separator ? "-" : e.label));

/** The entry with this id, anywhere in the bar. */
function find(bar, id) {
  const walk = (entries) => {
    for (const e of entries) {
      if (e.id === id) return e;
      if (e.children) {
        const hit = walk(e.children);
        if (hit) return hit;
      }
    }
    return null;
  };
  return walk(bar.flatMap((m) => m.children));
}

describe("tidy", () => {
  it("drops absent entries and separators with nothing to divide", () => {
    const a = item("a", "A", () => {});
    const b = item("b", "B", () => {});
    expect(labels(tidy([SEPARATOR, null, a, SEPARATOR, false, SEPARATOR, b, SEPARATOR]))).toEqual(["A", "-", "B"]);
  });
});

describe("buildMenuBar", () => {
  it("has the native app's menus in its order", () => {
    expect(titles(buildMenuBar(snapshot(), actions()))).toEqual([
      "File",
      "Edit",
      "Machine",
      "View",
      "Debug",
      "Develop",
      "Window",
      "Help",
    ]);
  });

  it("leaves Develop out on a IIgs, which has no assembler yet", () => {
    const profile = { family: "apple2gs", caps: { hasExpansionSlots: true } };
    const bar = buildMenuBar(snapshot({ isIIgs: true, available: menuAvailability(profile, {}) }), actions());
    expect(titles(bar)).not.toContain("Develop");
  });

  it("lists the machines in the order Apple sold them, the running one ticked", () => {
    const machine = menu(buildMenuBar(snapshot(), actions()), "machine");
    const choices = machine.children.filter((e) => e.id?.startsWith("machine.select."));
    expect(choices.map((e) => e.label)).toEqual(["Apple IIe Enhanced", "Apple IIgs"]);
    expect(choices.map((e) => e.checked)).toEqual([true, false]);
  });

  it("greys a machine whose ROM is missing", () => {
    const bar = buildMenuBar(snapshot({ machines: [IIE, { ...IIGS, runnable: false }] }), actions());
    const gs = find(bar, "machine.select.apple2gs");
    expect(gs.label).toBe("Apple IIgs (ROM missing)");
    expect(gs.enabled).toBe(false);
  });

  it("offers a speed on a //e and IIgs memory on a IIgs, never both", () => {
    const iie = buildMenuBar(snapshot(), actions());
    expect(find(iie, "machine.speed")).not.toBeNull();
    expect(find(iie, "machine.iigsmemory")).toBeNull();

    const profile = { family: "apple2gs", caps: { hasExpansionSlots: true } };
    const iigs = buildMenuBar(snapshot({ isIIgs: true, hasPal: false, available: menuAvailability(profile, {}) }), actions());
    expect(find(iigs, "machine.speed")).toBeNull();
    expect(find(iigs, "machine.iigsmemory").children.map((e) => e.label)).toEqual(["256K", "1M"]);
    expect(find(iigs, "machine.standard")).toBeNull();
  });

  it("names each speed with the machine's own clock", () => {
    expect(speedTitle(4, 1.0227)).toBe("4x  (4.091 MHz)");
  });

  it("offers both Mockingboard chips, ticking the one fitted", () => {
    const bar = buildMenuBar(snapshot({ mockingboardChip: "ym" }), actions());
    const chips = find(bar, "machine.mockingboardchip").children;
    expect(chips.map((e) => e.label)).toEqual(["AY-3-8910", "YM2149F"]);
    expect(chips.map((e) => e.checked)).toEqual([false, true]);
  });

  it("asks for the YM2149F when it is chosen", () => {
    const act = actions();
    find(buildMenuBar(snapshot(), act), "machine.mockingboardchip.ym").run();
    expect(act.setMockingboardChip).toHaveBeenCalledWith("ym");
  });

  it("greys an eject with no disk, and Open Recent with no recent disks", () => {
    const bar = buildMenuBar(snapshot({ drives: ["Choplifter.dsk", null] }), actions());
    expect(find(bar, "file.eject.0").enabled).toBe(true);
    expect(find(bar, "file.eject.1").enabled).toBe(false);
    expect(find(bar, "file.recent").enabled).toBe(false);
  });

  it("lists recent disks under a heading per drive, with Clear Menu last", () => {
    const recent = [[{ id: 1, filename: "Karateka.dsk" }], [{ id: 2, filename: "Lode Runner.dsk" }]];
    const bar = buildMenuBar(snapshot({ recent }), actions());
    expect(labels(find(bar, "file.recent").children)).toEqual([
      "Drive 1",
      "Karateka.dsk",
      "-",
      "Drive 2",
      "Lode Runner.dsk",
      "-",
      "Clear Menu",
    ]);
  });

  it("puts 3.5\" and hard disk items in File only where there are such drives", () => {
    const iie = buildMenuBar(snapshot(), actions());
    expect(find(iie, "file.d35.insert")).toBeNull();
    expect(find(iie, "file.hd.insert")).toBeNull();

    const profile = { family: "apple2gs", caps: { hasExpansionSlots: true } };
    const iigs = buildMenuBar(snapshot({ isIIgs: true, available: menuAvailability(profile, {}) }), actions());
    expect(find(iigs, "file.d35.insert")).not.toBeNull();
    expect(find(iigs, "file.hd.insert")).not.toBeNull();
  });

  it("ticks a window while it is open", () => {
    const bar = buildMenuBar(snapshot({ windows: { joystick: true } }), actions());
    expect(find(bar, "window.joystick").checked).toBe(true);
    expect(find(bar, "window.display").checked).toBe(false);
  });

  it("hides the Mockingboard view without a card, and Expansion Slots on a //c", () => {
    const iic = { family: "apple2c", caps: { hasExpansionSlots: false } };
    const bar = buildMenuBar(snapshot({ available: menuAvailability(iic, {}) }), actions());
    expect(find(bar, "debug.mockingboard")).toBeNull();
    expect(find(bar, "window.slots")).toBeNull();
  });

  it("says Continue while the CPU is paused, and greys stepping while it is off", () => {
    const off = buildMenuBar(snapshot({ paused: false }), actions());
    expect(find(off, "debug.continue").label).toBe("Pause");
    expect(find(off, "debug.stepinto").enabled).toBe(false);

    const paused = buildMenuBar(snapshot({ powered: true, paused: true }), actions());
    expect(find(paused, "debug.continue").label).toBe("Continue");
    expect(find(paused, "debug.stepinto").enabled).toBe(true);
  });

  it("offers Check for Updates only to an installed app", () => {
    expect(find(buildMenuBar(snapshot(), actions()), "help.update")).toBeNull();
    expect(find(buildMenuBar(snapshot({ installed: true }), actions()), "help.update")).not.toBeNull();
  });
});
