/*
 * native-menu.js - The desktop build's menu bar
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { isTauri } from "./runtime.js";
import { VERSION } from "../config/version.js";

/*
 * The desktop build has no header. Everything it offered is here instead, in
 * the operating system's menu bar, and the window is all picture.
 *
 * The header is still in the page, hidden, and it is still the app. Every
 * native item clicks the control it stands for, so the handlers, the
 * confirmations and the state they keep are the ones the browser build runs;
 * nothing here knows what a menu item does. What this module owns is the shape
 * of the bar and how to read a control's state: which button in a group is
 * lit, whether a checkbox is ticked, whether the machine is powered.
 *
 * The bar is described as a plain model read off the DOM, and rebuilt only
 * when that model changes. A rebuild is a hundred or so round trips to the
 * native side, and the header churns constantly for reasons a menu does not
 * care about (the File trigger flashes on every autosave), so watching the DOM
 * and rebuilding on every mutation would be rebuilding every few seconds.
 */

const APP_NAME = "ApplEm";
const SITE_URL = "https://retrotech71.co.uk";
const SITE_LABEL = "RetroTech71.co.uk";

/** Volumes the Sound menu offers, as the slider's percentages. */
const VOLUME_STEPS = [10, 25, 50, 75, 100];

/** Header menu items that mean nothing without a header. */
const SKIPPED_ITEMS = new Set(["btn-auto-hide-header"]);

// ---------------------------------------------------------------------------
// Reading the DOM into a model
// ---------------------------------------------------------------------------

const item = (text, action, extra = {}) => ({ type: "item", text, action, enabled: true, ...extra });
const check = (text, checked, action, extra = {}) => ({ type: "check", text, checked: !!checked, action, enabled: true, ...extra });
const separator = () => ({ type: "separator" });
const submenu = (text, items) => ({ type: "submenu", text, items });

function isHidden(el) {
  for (let node = el; node && node !== document.body; node = node.parentElement) {
    if (node.hidden || node.style.display === "none" || node.classList.contains("hidden")) {
      // The whole header is hidden under Tauri; that is not the item's own
      // state, so stop before reaching it.
      if (node.tagName === "HEADER") return false;
      return true;
    }
    if (node.tagName === "HEADER") return false;
  }
  return false;
}

function isEnabled(el) {
  return !el.disabled && !el.classList.contains("disabled");
}

/** A menu item's label: its first text span, or its own text. */
function labelOf(el) {
  const span = el.querySelector(":scope > span:not(.menu-check-icon):not(.menu-hint)");
  return (span ? span.textContent : el.textContent).replace(/\s+/g, " ").trim();
}

/** Click a control, if it is still in the page. */
function clickEl(el) {
  if (el && el.isConnected) el.click();
}

/** A row holding a group of buttons, one of them lit: a submenu of ticks. */
function buttonGroupSubmenu(row) {
  const label = labelOf(row);
  const group = row.querySelector("[class$='-btn-group']");
  const items = [...group.querySelectorAll("button")]
    .filter((b) => !isHidden(b))
    .map((b) =>
      check(
        // The button's own words ("1x", "Window") where it has them; the
        // theme buttons are icons, so their tooltip.
        (b.textContent.trim() || b.title).replace(/\s+/g, " ").trim(),
        b.classList.contains("active"),
        () => clickEl(b),
        { enabled: isEnabled(b) },
      ),
    );
  return items.length ? submenu(label, items) : null;
}

/** A row with a toggle switch in it: a tick. */
function toggleRowCheck(row, input) {
  const labelEl = row.querySelector(".state-row-label > span, label:not(.toggle-switch), span");
  const text = (labelEl ? labelEl.textContent : row.textContent).replace(/\s+/g, " ").trim();
  return check(text, input.checked, () => clickEl(input), { enabled: !input.disabled });
}

/**
 * Walk one of the header's dropdown panels.
 *
 * The panels are built from a handful of shapes, and each has one natural
 * native form: a button is an item, a button with a check icon is a tick, a
 * row of mutually exclusive buttons is a submenu of ticks, and a row with a
 * toggle switch is a tick.
 */
function readPanel(panel) {
  const items = [];
  for (const el of panel.children) {
    if (isHidden(el) || SKIPPED_ITEMS.has(el.id)) continue;

    if (el.classList.contains("header-menu-separator")) {
      items.push(separator());
      continue;
    }
    if (!el.classList.contains("header-menu-item")) continue;

    if (el.querySelector("[class$='-btn-group']")) {
      const sub = buttonGroupSubmenu(el);
      if (sub) items.push(sub);
      continue;
    }

    const input = el.querySelector("input[type='checkbox']");
    if (input) {
      items.push(toggleRowCheck(el, input));
      continue;
    }

    const text = labelOf(el);
    if (!text) continue;
    const extra = { enabled: isEnabled(el) };
    items.push(
      el.querySelector(".menu-check-icon")
        ? check(text, el.classList.contains("active"), () => clickEl(el), extra)
        : item(text, () => clickEl(el), extra),
    );
  }
  return tidySeparators(items);
}

/** No separator at either end, and never two together. */
function tidySeparators(items) {
  const out = [];
  for (const it of items) {
    if (it.type === "separator" && (!out.length || out[out.length - 1].type === "separator")) continue;
    out.push(it);
  }
  while (out.length && out[out.length - 1].type === "separator") out.pop();
  return out;
}

function readMachineMenu() {
  const power = document.getElementById("btn-power");
  const running = power && !power.classList.contains("off");
  const items = [
    item(running ? "Power Off" : "Power On", () => clickEl(power)),
    item("Ctrl+Reset", () => clickEl(document.getElementById("btn-warm-reset"))),
    item("Reboot", () => clickEl(document.getElementById("btn-cold-reset"))),
  ];

  const machineMenu = document.getElementById("machine-menu");
  const machines = machineMenu ? [...machineMenu.querySelectorAll(".machine-menu-item")] : [];
  if (machines.length) items.push(separator());
  for (const el of machines) {
    const name = el.querySelector(".machine-menu-name")?.textContent.trim() || el.dataset.key;
    const unavailable = el.classList.contains("unavailable");
    items.push(
      check(unavailable ? `${name} (no ROM)` : name, el.classList.contains("current"), () => clickEl(el), {
        enabled: !el.disabled,
      }),
    );
  }

  // A IIgs's memory is offered for the machine in use only, as in the header.
  const chips = machineMenu ? [...machineMenu.querySelectorAll(".machine-menu-ram-chip")] : [];
  if (chips.length) {
    items.push(
      submenu(
        "Memory",
        chips.map((c) => check(c.textContent.trim(), c.classList.contains("on"), () => clickEl(c))),
      ),
    );
  }
  return items;
}

function readSoundMenu() {
  const mute = document.getElementById("mute-toggle");
  const slider = document.getElementById("volume-slider");
  const drive = document.getElementById("drive-sounds-toggle");
  const printer = document.getElementById("printer-sounds-toggle");

  const setVolume = (percent) => {
    if (!slider) return;
    slider.value = String(percent);
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const current = slider ? parseInt(slider.value, 10) : null;
  // A volume set by some other means (or saved from the browser build's
  // slider) may be none of the steps; the nearest one is ticked.
  const nearest = VOLUME_STEPS.reduce((a, b) => (Math.abs(b - current) < Math.abs(a - current) ? b : a));

  const items = [];
  if (mute) items.push(check("Mute", mute.checked, () => clickEl(mute)));
  if (slider) {
    items.push(
      submenu(
        "Volume",
        VOLUME_STEPS.map((p) => check(`${p}%`, p === nearest, () => setVolume(p))),
      ),
    );
  }
  items.push(separator());
  if (drive) items.push(check("Drive Sounds", drive.checked, () => clickEl(drive)));
  if (printer) items.push(check("Printer Sounds", printer.checked, () => clickEl(printer)));
  return tidySeparators(items);
}

/** The agent's button, when there is a server to connect to. */
function readAgentItems() {
  const agent = document.getElementById("btn-agent");
  if (!agent || agent.classList.contains("hidden")) return [];
  return [separator(), item(agent.title || "Connect to Agent", () => clickEl(agent))];
}

function readViewMenu() {
  const items = readPanel(document.getElementById("view-menu"));
  const fullPage = document.getElementById("btn-fullscreen");
  if (fullPage) items.push(separator(), item("Full Page Mode", () => clickEl(fullPage)));
  return tidySeparators(items);
}

/** The whole bar, between the standard App/Edit and Window menus. */
function readModel() {
  const panel = (id) => {
    const el = document.getElementById(id);
    return el ? readPanel(el) : [];
  };
  return [
    submenu("File", panel("file-menu")),
    { type: "edit" },
    submenu("Machine", readMachineMenu()),
    submenu("View", readViewMenu()),
    submenu("Debug", panel("debug-menu")),
    submenu("Dev", tidySeparators([...panel("dev-menu"), ...readAgentItems()])),
    submenu("Sound", readSoundMenu()),
    { type: "window" },
    submenu("Help", panel("help-menu")),
  ].filter((m) => m.type !== "submenu" || m.items.length);
}

/** Everything about a model except its actions, for spotting a change. */
function signature(model) {
  return JSON.stringify(model, (key, value) => (key === "action" ? undefined : value));
}

// ---------------------------------------------------------------------------
// Building the native bar
// ---------------------------------------------------------------------------

let M = null;

async function nativeItems(items) {
  const out = [];
  for (const it of items) out.push(await nativeItem(it));
  return out;
}

function nativeItem(it) {
  // Every action ends with a rebuild, whether or not the page changed. The
  // operating system flips a check item's tick itself when it is chosen, so
  // choosing the theme that is already set would leave it unticked while the
  // page, and so the model, stayed exactly as it was.
  const action = it.action
    ? () => {
        it.action();
        lastSignature = null;
        scheduleSync();
      }
    : undefined;
  switch (it.type) {
    case "separator":
      return M.PredefinedMenuItem.new({ item: "Separator" });
    case "check":
      return M.CheckMenuItem.new({ text: it.text, checked: it.checked, enabled: it.enabled, action });
    case "submenu":
      return nativeItems(it.items).then((items) => M.Submenu.new({ text: it.text, items }));
    default:
      return M.MenuItem.new({ text: it.text, enabled: it.enabled, action });
  }
}

async function openSite() {
  try {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(SITE_URL);
  } catch (err) {
    console.error("[native-menu] could not open the site:", err);
  }
}

const predefined = (item) => M.PredefinedMenuItem.new({ item });

async function appMenu() {
  return M.Submenu.new({
    text: APP_NAME,
    items: [
      // website and websiteLabel show on Windows and Linux; macOS ignores
      // them, which is what the item below is for.
      await predefined({
        About: { name: APP_NAME, version: VERSION, website: SITE_URL, websiteLabel: SITE_LABEL },
      }),
      await M.MenuItem.new({ text: SITE_LABEL, action: openSite }),
      await predefined("Separator"),
      await predefined("Services"),
      await predefined("Separator"),
      await predefined("Hide"),
      await predefined("HideOthers"),
      await predefined("ShowAll"),
      await predefined("Separator"),
      await predefined("Quit"),
    ],
  });
}

async function editMenu() {
  // The text fields in the editors and dialogs only get cut, copy and paste
  // on macOS if the menu bar has them.
  return M.Submenu.new({
    text: "Edit",
    items: await Promise.all(
      ["Undo", "Redo", "Separator", "Cut", "Copy", "Paste", "SelectAll"].map(predefined),
    ),
  });
}

async function windowMenu() {
  return M.Submenu.new({
    text: "Window",
    items: await Promise.all(
      ["Minimize", "Maximize", "Separator", "Fullscreen", "Separator", "CloseWindow"].map(predefined),
    ),
  });
}

async function buildMenu(model) {
  const top = [await appMenu()];
  for (const entry of model) {
    if (entry.type === "edit") top.push(await editMenu());
    else if (entry.type === "window") top.push(await windowMenu());
    else top.push(await nativeItem(entry));
  }
  const menu = await M.Menu.new({ items: top });
  await menu.setAsAppMenu();
}

// ---------------------------------------------------------------------------
// Keeping it in step
// ---------------------------------------------------------------------------

let lastSignature = null;
let syncing = false;
let syncAgain = false;
let syncTimer = null;

async function sync() {
  if (syncing) {
    syncAgain = true;
    return;
  }
  syncing = true;
  try {
    const model = readModel();
    const sig = signature(model);
    if (sig !== lastSignature) {
      await buildMenu(model);
      lastSignature = sig;
    }
  } catch (err) {
    console.error("[native-menu] could not build the menu bar:", err);
  } finally {
    syncing = false;
    if (syncAgain) {
      syncAgain = false;
      scheduleSync();
    }
  }
}

function scheduleSync() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(sync, 150);
}

/** The native window's title follows the page's, which names the machine. */
async function followTitle() {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  const win = getCurrentWindow();
  const apply = () => win.setTitle(document.title).catch(() => {});
  apply();
  const titleEl = document.querySelector("title");
  if (titleEl) new MutationObserver(apply).observe(titleEl, { childList: true, characterData: true, subtree: true });
}

/**
 * Build the menu bar and keep it matching the page. Does nothing in a browser.
 *
 * Call once the UI is wired, so the controls it reads have their state.
 */
export async function initNativeMenu() {
  if (!isTauri()) return;
  try {
    M = await import("@tauri-apps/api/menu");
    await sync();

    const header = document.querySelector("header");
    if (header) {
      new MutationObserver(scheduleSync).observe(header, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["class", "style", "hidden", "disabled", "title"],
      });
      // A checkbox's state is a property, not an attribute, so no observer
      // sees it change.
      header.addEventListener("change", scheduleSync, true);
      header.addEventListener("input", scheduleSync, true);
    }

    followTitle().catch((err) => console.error("[native-menu] could not follow the title:", err));
  } catch (err) {
    console.error("[native-menu] init failed:", err);
  }
}
