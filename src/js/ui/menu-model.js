/*
 * menu-model.js - The menu bar as data, laid out as the native app's
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

/*
 * The browser's menus follow the native app's (applem's App::buildMenus):
 * File, Edit, Machine, View, Debug, Develop, Window and Help, with the same
 * items in the same places. Where the browser has something the native app
 * does not (a heat map, a printer, layouts) it sits in the menu it belongs
 * to; where the native app has something the browser does not, the item is
 * left out rather than offered and left to fail.
 *
 * The bar is rebuilt from a snapshot of the app every time a menu opens, so it
 * always says what is true. This module is pure: it turns the snapshot and a
 * table of actions into plain objects, and menu-bar.js draws them.
 *
 * An entry is one of
 *   { separator: true }
 *   { id, label, run, checked, enabled, hint, danger }   checked: null = not a toggle
 *   { id, label, children, enabled }                      a submenu
 * A null or false in a list is something this machine does not have; tidy()
 * takes it out, along with any separator left with nothing to divide.
 */

export const SEPARATOR = { separator: true };

export function item(id, label, run, { checked = null, enabled = true, hint = "", danger = false } = {}) {
  return { id, label, run, checked, enabled, hint, danger };
}

export function submenu(id, label, children, { enabled = true } = {}) {
  return { id, label, children: tidy(children), enabled };
}

/** A heading inside a menu: a label that cannot be chosen. */
function heading(id, label) {
  return item(id, label, null, { enabled: false });
}

/**
 * Drop what is absent, and separators at either end or next to one another.
 * @param {Array} entries
 */
export function tidy(entries) {
  const out = [];
  for (const entry of entries) {
    if (!entry) continue;
    if (entry.separator) {
      if (out.length === 0 || out[out.length - 1].separator) continue;
    }
    out.push(entry);
  }
  while (out.length && out[out.length - 1].separator) out.pop();
  return out;
}

const SPEEDS = [1, 2, 4, 8];

const VIDEO_STANDARDS = [
  { id: "ntsc", label: "NTSC  (60Hz, 262 lines)" },
  { id: "pal", label: "PAL  (50Hz, 312 lines)" },
];

const VOLUMES = [25, 50, 75, 100];

const APPEARANCES = [
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

const LAYOUTS = [
  { id: "window", label: "Window" },
  { id: "play", label: "Play" },
  { id: "code", label: "Code" },
  { id: "debug", label: "Debug" },
];

/** "4x  (4.092 MHz)", from the machine's own clock, as the native menu says it. */
export function speedTitle(multiple, clockMHz) {
  return `${multiple}x  (${(clockMHz * multiple).toFixed(3)} MHz)`;
}

function fileMenu(s, act) {
  // Each drive's recent disks under its own heading, as the native app lists them.
  const recent = [];
  s.recent.forEach((disks, drive) => {
    if (!disks.length) return;
    recent.push(SEPARATOR, heading(`file.recent.heading.${drive}`, `Drive ${drive + 1}`));
    disks.forEach((disk, i) =>
      recent.push(item(`file.recent.${drive}.${i}`, disk.filename, () => act.insertRecent(drive, disk.id))),
    );
  });
  const anyRecent = recent.length > 0;
  if (anyRecent) recent.push(SEPARATOR, item("file.recent.clear", "Clear Menu", () => act.clearRecent()));

  const units = (count, name, run) =>
    Array.from({ length: count }, (_, n) => item(`${name}.${n}`, run.label(n), () => run.go(n), { enabled: run.enabled(n) }));

  return {
    id: "file",
    title: "File",
    children: tidy([
      item("file.insert.0", "Insert in Drive 1…", () => act.insertDisk(0)),
      item("file.insert.1", "Insert in Drive 2…", () => act.insertDisk(1)),
      submenu("file.recent", "Open Recent", recent, { enabled: anyRecent }),
      SEPARATOR,
      item("file.eject.0", "Eject Drive 1", () => act.ejectDisk(0), { enabled: !!s.drives[0] }),
      item("file.eject.1", "Eject Drive 2", () => act.ejectDisk(1), { enabled: !!s.drives[1] }),
      // A IIgs's 3.5" drives.
      s.available.drives35 && SEPARATOR,
      s.available.drives35 &&
        submenu(
          "file.d35.insert",
          'Insert 3.5" Disk',
          units(2, "file.d35.insert", {
            label: (n) => `3.5" Drive ${n + 1}…`,
            go: (n) => act.insertDisk35(n),
            enabled: () => true,
          }),
        ),
      s.available.drives35 &&
        submenu(
          "file.d35.eject",
          'Eject 3.5" Disk',
          units(2, "file.d35.eject", {
            label: (n) => `3.5" Drive ${n + 1}`,
            go: (n) => act.ejectDisk35(n),
            enabled: (n) => !!s.drives35[n],
          }),
          { enabled: s.drives35.some(Boolean) },
        ),
      // The SmartPort's, when there is one: a IIgs's, or a card.
      s.available.hardDrives && SEPARATOR,
      s.available.hardDrives &&
        submenu(
          "file.hd.insert",
          "Insert Hard Disk Image",
          units(2, "file.hd.insert", {
            label: (n) => `Device ${n + 1}…`,
            go: (n) => act.insertHardDisk(n),
            enabled: () => true,
          }),
        ),
      s.available.hardDrives &&
        submenu(
          "file.hd.eject",
          "Eject Hard Disk Image",
          units(2, "file.hd.eject", {
            label: (n) => `Device ${n + 1}`,
            go: (n) => act.ejectHardDisk(n),
            enabled: (n) => !!s.hardDrives[n],
          }),
          { enabled: s.hardDrives.some(Boolean) },
        ),
      SEPARATOR,
      item("file.screenshot", "Save Screenshot…", () => act.saveScreenshot(), { enabled: s.powered }),
      SEPARATOR,
      item("file.autosave", "Auto-Save", () => act.setAutoSave(!s.autoSave), { checked: s.autoSave }),
      item("file.resetdefaults", "Reset Defaults…", () => act.resetDefaults(), { danger: true }),
      SEPARATOR,
      item("file.close", "Close Window", () => act.closeWindow(), { enabled: s.closableWindow }),
    ]),
  };
}

function editMenu(s, act) {
  return {
    id: "edit",
    title: "Edit",
    children: tidy([
      item("edit.copyscreen", "Copy Screen Text", () => act.copyScreenText(), { enabled: s.powered }),
      item("edit.paste", "Paste to Machine", () => act.paste()),
    ]),
  };
}

function machineMenu(s, act) {
  const machines = [...s.machines]
    .sort((a, b) => (a.released || 0) - (b.released || 0))
    .map((m) => {
      const runnable = m.runnable !== false;
      return item(
        `machine.select.${m.key}`,
        runnable ? m.name : `${m.name} (ROM missing)`,
        () => act.selectMachine(m.key),
        { checked: m.key === s.machineKey, enabled: runnable },
      );
    });

  const keyboard = [
    item("machine.commandapple", "Command as Open Apple", () => act.setCommandIsOpenApple(!s.commandIsOpenApple), {
      checked: s.commandIsOpenApple,
    }),
    item("machine.cursorkeys", "Cursor Keys as Joystick", () => act.setCursorKeys(!s.cursorKeys), {
      checked: s.cursorKeys,
    }),
    // The //e's generator alone holds a second set.
    s.hasUkCharSet &&
      item("machine.ukcharset", "UK Character Set", () => act.setUkCharacterSet(!s.ukCharacterSet), {
        checked: s.ukCharacterSet,
      }),
  ];

  const volumes = VOLUMES.map((percent) =>
    item(`machine.volume.${percent}`, `${percent}%`, () => act.setVolume(percent / 100), {
      checked: Math.round(s.volume * 100) === percent,
    }),
  );

  const chips = s.mockingboardChips.map((chip) =>
    item(`machine.mockingboardchip.${chip.id}`, chip.label, () => act.setMockingboardChip(chip.id), {
      checked: s.mockingboardChip === chip.id,
    }),
  );

  return {
    id: "machine",
    title: "Machine",
    children: tidy([
      item("machine.power", "Power", () => act.setPowered(!s.powered), { checked: s.powered }),
      item("machine.ctrlreset", "Control-Reset", () => act.controlReset(), { enabled: s.powered }),
      item("machine.reboot", "Reboot", () => act.reboot(), { enabled: s.powered }),
      SEPARATOR,
      ...machines,
      SEPARATOR,
      // A IIgs keeps its own speed register, so it is not offered one here.
      s.available.speed &&
        submenu(
          "machine.speed",
          "CPU Speed",
          SPEEDS.map((multiple) =>
            item(`machine.speed.${multiple}`, speedTitle(multiple, s.clockMHz), () => act.setSpeed(multiple), {
              checked: s.speed === multiple,
            }),
          ),
        ),
      // Only for a machine Apple also made for PAL countries.
      s.hasPal &&
        submenu(
          "machine.standard",
          "Video Standard",
          VIDEO_STANDARDS.map((v) =>
            item(`machine.standard.${v.id}`, v.label, () => act.setVideoStandard(v.id), {
              checked: s.videoStandard === v.id,
            }),
          ),
        ),
      // Only while a IIgs is running: on any other machine it would do nothing.
      s.isIIgs &&
        s.iigsMemorySizes.length > 0 &&
        submenu(
          "machine.iigsmemory",
          "IIgs Memory",
          s.iigsMemorySizes.map((size) =>
            item(`machine.iigsmemory.${size.kb}`, size.label, () => act.setIIgsMemory(size.kb), {
              checked: s.iigsMemoryKB === size.kb,
            }),
          ),
        ),
      SEPARATOR,
      submenu("machine.keyboard", "Keyboard", keyboard),
      item("machine.mouse", "Capture Mouse", () => act.captureMouse(), {
        enabled: s.mousePresent && s.powered,
      }),
      submenu("machine.sound", "Sound", [
        item("machine.mute", "Mute", () => act.setMuted(!s.muted), { checked: s.muted }),
        submenu("machine.volume", "Volume", volumes),
        SEPARATOR,
        item("machine.mockingboardphaselock", "Mockingboard Phase Lock", () => act.setPhaseLock(!s.phaseLock), {
          checked: s.phaseLock,
        }),
        item("machine.mockingboardmono", "Mockingboard Mono", () => act.setMockingboardMono(!s.mockingboardMono), {
          checked: s.mockingboardMono,
        }),
        // The chips on the card: the original AY-3-8910s, or Yamaha's
        // YM2149F, whose envelopes are smoother and fixed levels a little
        // different.
        submenu("machine.mockingboardchip", "Mockingboard Chip", chips),
        SEPARATOR,
        item("machine.drivesounds", "Drive Sounds", () => act.setDriveSounds(!s.driveSounds), {
          checked: s.driveSounds,
        }),
        item("machine.printersounds", "Printer Sounds", () => act.setPrinterSounds(!s.printerSounds), {
          checked: s.printerSounds,
        }),
      ]),
    ]),
  };
}

function viewMenu(s, act) {
  return {
    id: "view",
    title: "View",
    children: tidy([
      // Light, dark, or whatever the system is.
      submenu(
        "view.appearance",
        "Appearance",
        APPEARANCES.map((a) =>
          item(`view.appearance.${a.id}`, a.label, () => act.setAppearance(a.id), { checked: s.appearance === a.id }),
        ),
      ),
      submenu(
        "view.layout",
        "Layout",
        LAYOUTS.map((l) => item(`view.layout.${l.id}`, l.label, () => act.setLayout(l.id), { checked: s.layout === l.id })),
      ),
      submenu("view.popoutside", "Drive Popouts", [
        item("view.popoutside.left", "Left", () => act.setPopoutSide("left"), { checked: s.popoutSide === "left" }),
        item("view.popoutside.right", "Right", () => act.setPopoutSide("right"), { checked: s.popoutSide === "right" }),
      ]),
      item("view.autohideheader", "Auto-hide Menu Bar", () => act.setAutoHideHeader(!s.autoHideHeader), {
        checked: s.autoHideHeader,
      }),
      SEPARATOR,
      item("view.fullpage", s.fullPage ? "Leave Full Page" : "Full Page", () => act.setFullPage(!s.fullPage), {
        checked: s.fullPage,
        hint: "⌃Esc",
      }),
      item("view.fullscreen", s.fullScreen ? "Exit Full Screen" : "Enter Full Screen", () =>
        act.setFullScreen(!s.fullScreen),
      ),
    ]),
  };
}

function debugMenu(s, act) {
  const window = (id, label, windowId, extra = {}) =>
    item(id, label, () => act.toggleWindow(windowId), { checked: !!s.windows[windowId], ...extra });
  const on = s.powered;
  return {
    id: "debug",
    title: "Debug",
    children: tidy([
      window("debug.cpu", "CPU Debugger", "cpu-debugger"),
      window("debug.memory", "Memory Browser", "memory-browser"),
      // Applesoft, on the 8-bit machines.
      s.available.basic && window("debug.basic", "Applesoft BASIC", "basic-program"),
      window("debug.switches", "Soft Switches", "soft-switches"),
      window("debug.memmap", "Memory Map", "memory-map"),
      window("debug.heatmap", "Memory Heat Map", "memory-heatmap"),
      window("debug.stack", "Stack Viewer", "stack-viewer"),
      window("debug.zeropage", "Zero Page Watch", "zeropage-watch"),
      window("debug.trace", "Instruction Trace", "trace-panel"),
      s.available.mockingboard && window("debug.mockingboard", "Mockingboard", "mockingboard-debug"),
      s.available.mouseCard && window("debug.mousecard", "Mouse Card", "mouse-card-debug"),
      SEPARATOR,
      item("debug.continue", s.paused ? "Continue" : "Pause", () => act.continueOrPause(), {
        enabled: on,
        hint: "F5",
      }),
      item("debug.stepover", "Step Over", () => act.stepOver(), { enabled: on, hint: "F10" }),
      item("debug.stepinto", "Step Into", () => act.stepInto(), { enabled: on, hint: "F11" }),
      item("debug.stepout", "Step Out", () => act.stepOut(), { enabled: on, hint: "⇧F11" }),
    ]),
  };
}

/** Building a program and running it here: the native app's Develop menu. */
function developMenu(s, act) {
  return {
    id: "develop",
    title: "Develop",
    children: tidy([
      s.available.assembler &&
        item("develop.assembler", "Assembler", () => act.toggleWindow("assembler-editor"), {
          checked: !!s.windows["assembler-editor"],
        }),
    ]),
  };
}

/** The app's windows: each shows or hides its window, and is ticked while it is open. */
function windowMenu(s, act) {
  const window = (id, label, windowId) =>
    item(id, label, () => act.toggleWindow(windowId), { checked: !!s.windows[windowId] });
  return {
    id: "window",
    title: "Window",
    children: tidy([
      window("window.screen", "Screen", "screen-window"),
      window("window.drives", '5.25" Drives', "disk-drives"),
      s.available.drives35 && window("window.disk35", '3.5" Drives', "disk35-drives"),
      s.available.hardDrives && window("window.harddrives", "SmartPort Drives", "hard-drives"),
      window("window.joystick", "Joystick", "joystick"),
      // Not on a //c, whose every slot is soldered down.
      s.available.slots && window("window.slots", "Expansion Slots", "slot-configuration"),
      window("window.states", "Save States", "save-states"),
      window("window.display", "Display Settings", "display-settings"),
      SEPARATOR,
      window("window.fileexplorer", "File Explorer", "file-explorer-window"),
      window("window.diskinspector", "Disk Inspector", "disk-inspector"),
      SEPARATOR,
      s.available.serialPort && window("window.serial", "Serial Port", "serial-connection"),
      s.available.printer && window("window.printer", "Printer", "printer-output"),
      window("window.printbrowser", "Print Browser", "print-browser"),
    ]),
  };
}

function helpMenu(s, act) {
  return {
    id: "help",
    title: "Help",
    children: tidy([
      item("help.book", "ApplEm Help", () => act.toggleWindow("documentation-window"), { hint: "F1" }),
      item("help.releasenotes", "Release Notes", () => act.toggleWindow("release-notes")),
      // Only an installed app has a cache of its own to throw away.
      s.installed && SEPARATOR,
      s.installed && item("help.update", "Check for Updates", () => act.checkForUpdates()),
    ]),
  };
}

/**
 * The whole bar, in the native app's order. A menu left with nothing in it
 * (Develop, on a IIgs) is left out.
 *
 * @param {object} s - the snapshot (see MenuBar.snapshot)
 * @param {object} act - the actions, each a function
 * @returns {Array<{id:string, title:string, children:Array}>}
 */
export function buildMenuBar(s, act) {
  return [
    fileMenu(s, act),
    editMenu(s, act),
    machineMenu(s, act),
    viewMenu(s, act),
    debugMenu(s, act),
    developMenu(s, act),
    windowMenu(s, act),
    helpMenu(s, act),
  ].filter((menu) => menu.children.length > 0);
}
