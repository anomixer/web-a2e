/*
 * menu-bar.js - The header's menu bar, drawn from menu-model.js
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { buildMenuBar } from "./menu-model.js";
import { menuAvailability } from "./machine-availability.js";
import { showToast } from "./toast.js";
import { getMachineProfile, machineTiming } from "../machine/machine-profile.js";
import { IIGS_MEMORY_SIZES } from "../machine/iigs-memory.js";
import { profileStandard } from "../machine/video-standard.js";
import { commandKeyIsOpenApple, setCommandKeyIsOpenApple } from "../input/apple-keys.js";
import { getRecentDisks, clearRecentDisks } from "../disk-manager/disk-persistence.js";
import { MOCKINGBOARD_CHIPS } from "../audio/sound-settings.js";
import { featureFlags } from "../config/feature-flags.js";

/** The menus, in the order the native app's menu bar has them. */
const MENU_IDS = ["file", "edit", "machine", "view", "debug", "develop", "window", "help"];

/** How many of each drive's recent disks Open Recent lists. */
const RECENT_LIMIT = 10;

const SUBMENU_ARROW = `<svg class="menu-submenu-arrow" viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
  <path d="M4.5 3l3 3-3 3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`;

function escapeHTML(text) {
  return String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/**
 * MenuBar - File, Edit, Machine, View, Debug, Develop, Window and Help.
 *
 * Each menu is rebuilt from a fresh snapshot of the app as it opens, so a
 * tick, a greyed item or an item the machine cannot use is always current.
 * The few facts that need a round trip (the recent disks, whether the CPU is
 * paused) are fetched as the menu opens and the menu is redrawn if they
 * changed.
 */
export class MenuBar {
  /**
   * @param {object} deps
   * @param {object} deps.app - the emulator app (main.js)
   * @param {object} deps.ui - the UIController
   */
  constructor({ app, ui }) {
    this.app = app;
    this.ui = ui;
    this.root = document.getElementById("menu-bar");
    this.cards = {};
    this.recent = [[], []];
    this.paused = false;
    this.containers = new Map();
    this.actions = this.createActions();
  }

  init() {
    if (!this.root) return;
    for (const id of MENU_IDS) {
      const container = document.createElement("div");
      container.className = "header-menu-container menu-bar-menu";
      // "menubar-" keeps these apart from the machine badge's #machine-menu.
      container.id = `menubar-${id}`;
      container.innerHTML = `
        <button class="header-menu-trigger" id="btn-${id}-menu" type="button" aria-haspopup="menu">
          <span class="menu-bar-title"></span>${id === "help" ? '<span class="update-badge"></span>' : ""}
        </button>
        <div class="header-menu" id="menubar-${id}-panel" role="menu"></div>`;
      this.root.appendChild(container);
      this.containers.set(id, container);

      const trigger = container.querySelector(".header-menu-trigger");
      // A new version found before the bar was drawn (main.js).
      if (id === "help" && window._a2eUpdateAvailable) trigger.classList.add("update-available");
      trigger.addEventListener("click", (e) => {
        e.stopPropagation();
        const wasOpen = container.classList.contains("open");
        this.ui.closeAllMenus();
        if (!wasOpen) this.open(id);
      });
      // With one menu open, moving across the bar opens the next, as a
      // desktop menu bar does.
      trigger.addEventListener("mouseenter", () => {
        const anyOpen = document.querySelector(".header-menu-container.open");
        if (anyOpen && anyOpen !== container) {
          this.ui.closeAllMenus();
          this.open(id);
        }
      });
    }
    this.refresh();
  }

  /** The cards fitted, which decide some of what the machine can use. */
  setCards(cards) {
    this.cards = cards || {};
    this.refresh();
  }

  /** Redraw the titles, hiding a menu left with nothing in it, and any open menu. */
  refresh() {
    if (!this.root) return;
    const menus = new Map(buildMenuBar(this.snapshot(), this.actions).map((m) => [m.id, m]));
    for (const [id, container] of this.containers) {
      const menu = menus.get(id);
      container.hidden = !menu;
      if (!menu) {
        container.classList.remove("open");
        continue;
      }
      container.querySelector(".menu-bar-title").textContent = menu.title;
      if (container.classList.contains("open")) this.renderMenu(container, menu);
    }
  }

  async open(id) {
    const container = this.containers.get(id);
    if (!container) return;
    container.classList.add("open");
    this.refresh();

    // Then what needs asking, redrawn only if it changed so a submenu the
    // pointer is already in is not pulled out from under it.
    const before = JSON.stringify([this.recent, this.paused]);
    await this.fetchAsyncFacts(id);
    if (JSON.stringify([this.recent, this.paused]) !== before && container.classList.contains("open")) {
      this.refresh();
    }
  }

  async fetchAsyncFacts(id) {
    try {
      if (id === "file") {
        const lists = await Promise.all([getRecentDisks(0), getRecentDisks(1)]);
        this.recent = lists.map((list) =>
          list.slice(0, RECENT_LIMIT).map(({ id: diskId, filename }) => ({ id: diskId, filename })),
        );
      } else if (id === "debug" && this.app.isRunning()) {
        this.paused = !!(await this.app.wasmModule._isPaused());
      }
    } catch (err) {
      console.warn("[menu] could not read the menu's state:", err);
    }
  }

  /** Everything the model needs to know, read synchronously. */
  snapshot() {
    const app = this.app;
    const ui = this.ui;
    const profile = getMachineProfile();
    const machines = app.machineMenu?.machines ?? [];
    const current = machines.find((m) => m.key === profile.key);
    const available = menuAvailability(profile, this.cards);
    available.serialPort = available.serialPort && featureFlags.isEnabled("serialPort");
    const hasUkCharSet = profile.caps?.hasUkCharSet !== false;

    const windows = {};
    for (const [id, win] of app.windowManager?.windows ?? []) windows[id] = !!win.isVisible;

    const focused = ui.hasFocus;
    const sound = app.soundSettings;

    let ukCharacterSet = false;
    let installed = false;
    try {
      ukCharacterSet = hasUkCharSet && localStorage.getItem("a2e-charset") === "uk";
      installed = window.matchMedia("(display-mode: standalone)").matches || !!navigator.standalone;
    } catch {
      // Storage or media queries unavailable: the defaults stand.
    }

    return {
      powered: app.isRunning(),
      machines,
      machineKey: profile.key,
      isIIgs: profile.family === "apple2gs",
      hasPal: !!current?.hasPal,
      videoStandard: profileStandard(profile),
      clockMHz: (machineTiming()?.cpuClockHz ?? 1022727) / 1e6,
      speed: app.emulationSpeed?.multiplier ?? 1,
      iigsMemorySizes: IIGS_MEMORY_SIZES,
      iigsMemoryKB: app.machineMenu?.iigsMemoryKB ?? null,
      available,
      hasUkCharSet,
      ukCharacterSet,
      commandIsOpenApple: commandKeyIsOpenApple(),
      cursorKeys: !!app.joystickWindow?.cursorKeysEnabled,
      mousePresent: !!app.mouseHandler?.enabled,
      muted: !!app.audioDriver?.isMuted(),
      volume: app.audioDriver?.getVolume() ?? 0,
      phaseLock: !!sound?.phaseLock,
      mockingboardMono: !!sound?.mono,
      mockingboardChips: MOCKINGBOARD_CHIPS,
      mockingboardChip: sound?.chip ?? "ay",
      driveSounds: !!sound?.driveSounds,
      printerSounds: !!sound?.printerSounds,
      appearance: ui.themeManager?.getPreference() ?? "system",
      layout: app.windowManager?.dockManager?._activePreset ?? null,
      popoutSide: ui._drivePopouts?.getSide() || "left",
      autoHideHeader: ui.isHeaderAutoHidden(),
      fullPage: ui.isInFullPageMode(),
      fullScreen: !!document.fullscreenElement,
      windows,
      paused: this.paused,
      drives: (app.diskManager?.drives ?? []).map((d) => d.filename || null),
      drives35: (app.disk35Manager?.drives ?? []).map((d) => d.filename || null),
      hardDrives: (app.hardDriveManager?.devices ?? []).map((d) => d.filename || null),
      recent: this.recent,
      autoSave: !!app.stateManager?.autoSaveEnabled,
      closableWindow: !!focused && focused !== "screen-window",
      installed,
    };
  }

  /** What each item does: a thin layer over the app's own methods. */
  createActions() {
    const app = this.app;
    const ui = this.ui;
    const wasm = () => app.wasmModule;
    const cpu = () => app.cpuDebuggerWindow;
    return {
      // File
      insertDisk: (n) => app.diskManager.drives[n]?.input?.click(),
      insertRecent: (drive, id) => app.diskManager.loadRecentDiskInDrive(drive, id),
      clearRecent: async () => {
        await clearRecentDisks(0);
        await clearRecentDisks(1);
        this.recent = [[], []];
      },
      ejectDisk: (n) => app.diskManager.ejectDisk(n),
      insertDisk35: (n) => app.disk35Manager.drives[n]?.input?.click(),
      ejectDisk35: (n) => app.disk35Manager.ejectImage(n),
      insertHardDisk: (n) => app.hardDriveManager.devices[n]?.input?.click(),
      ejectHardDisk: (n) => app.hardDriveManager.ejectImage(n),
      saveScreenshot: () => this.saveScreenshot(),
      setAutoSave: (on) => app.stateManager.setAutoSaveEnabled(on),
      resetDefaults: () => ui.resetDefaults(),
      closeWindow: () => {
        const id = ui.hasFocus;
        if (id && id !== "screen-window") app.windowManager.hideWindow(id);
      },

      // Edit
      copyScreenText: () => this.copyScreenText(),
      paste: () => this.paste(),

      // Machine
      setPowered: (on) => (on !== app.isRunning() ? ui.togglePower() : undefined),
      controlReset: () => ui.controlReset(),
      reboot: () => ui.reboot(),
      selectMachine: (key) => app.machineMenu.choose(key),
      setSpeed: (multiple) => app.emulationSpeed.setSpeed(multiple),
      setVideoStandard: (standard) => app.machineMenu.chooseStandard(standard),
      setIIgsMemory: (kb) => app.machineMenu.chooseMemory(kb),
      setCommandIsOpenApple: (on) => {
        setCommandKeyIsOpenApple(on);
        app.inputHandler?.applyAppleKeys?.();
      },
      setCursorKeys: (on) => app.joystickWindow?.setCursorKeysEnabled(on),
      setUkCharacterSet: (on) => ui.setCharacterSet(on),
      captureMouse: () => app.mouseHandler?.capture(),
      setMuted: (on) => ui.setMuted(on),
      setVolume: (volume) => ui.setVolume(volume),
      setPhaseLock: (on) => app.soundSettings.setPhaseLock(on),
      setMockingboardMono: (on) => app.soundSettings.setMono(on),
      setMockingboardChip: (chip) => app.soundSettings.setChip(chip),
      setDriveSounds: (on) => app.soundSettings.setDriveSounds(on),
      setPrinterSounds: (on) => app.soundSettings.setPrinterSounds(on),

      // View
      setAppearance: (pref) => ui.themeManager?.setPreference(pref),
      setLayout: (layout) => app.windowManager.dockManager?.loadPreset(layout),
      setPopoutSide: (side) => ui._drivePopouts?.setSide(side),
      setAutoHideHeader: (on) => ui.setHeaderAutoHidden(on),
      setFullPage: (on) => (on ? ui.enterFullPageMode() : ui.exitFullPageMode()),
      setFullScreen: (on) => ui.setFullScreen(on),

      // Debug, Develop, Window, Help
      toggleWindow: (id) => app.windowManager.toggleWindow(id),
      continueOrPause: async () => {
        if (await wasm()._isPaused()) {
          wasm()._setPaused(false);
        } else {
          cpu()?.bpManager.clearTemp();
          wasm()._setPaused(true);
        }
      },
      stepInto: () => {
        cpu()?.bpManager.clearTemp();
        wasm()._stepInstruction();
      },
      stepOver: () => cpu()?.stepOver(),
      stepOut: () => cpu()?.stepOut(),
      checkForUpdates: () => ui.checkForUpdates(),
    };
  }

  /** The picture as the machine made it, saved as a PNG named for the machine. */
  saveScreenshot() {
    const url = this.app.captureScreenshot();
    if (!url) {
      showToast("There is no picture to save yet", "info");
      return;
    }
    const profile = getMachineProfile();
    const link = document.createElement("a");
    link.href = url;
    link.download = `${profile.shortName || profile.name || "Apple II"} Screenshot.png`;
    link.click();
  }

  /** Every character on a text screen, onto the clipboard. */
  async copyScreenText() {
    const selection = this.app.textSelection;
    if (!selection) return;
    await selection.selectAll();
    const copied = await selection.copyToClipboard();
    selection.clearSelection();
    if (!copied) showToast("The screen is not showing text", "info");
  }

  /** The clipboard's text, typed into the machine as a paste is. */
  async paste() {
    let text = "";
    try {
      text = await navigator.clipboard.readText();
    } catch {
      showToast("The browser would not share the clipboard. Click the screen and paste with the keyboard instead.", "warning");
      return;
    }
    if (text) this.app.inputHandler?.queueTextInput(text, { speedMultiplier: 8 });
  }

  renderMenu(container, menu) {
    const panel = container.querySelector(".header-menu");
    panel.replaceChildren(...this.renderEntries(menu.children));
  }

  renderEntries(entries) {
    return entries.map((entry) => {
      if (entry.separator) {
        const sep = document.createElement("div");
        sep.className = "header-menu-separator";
        return sep;
      }
      if (entry.children) return this.renderSubmenu(entry);
      return this.renderItem(entry);
    });
  }

  renderItem(entry) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "header-menu-item menu-bar-item";
    el.dataset.menuId = entry.id;
    el.setAttribute("role", entry.checked === null ? "menuitem" : "menuitemcheckbox");
    if (entry.checked !== null) el.setAttribute("aria-checked", String(!!entry.checked));
    if (entry.danger) el.classList.add("menu-item-danger");
    if (!entry.run) el.classList.add("menu-bar-heading");
    el.disabled = !entry.enabled;
    el.innerHTML = `
      <span class="menu-bar-tick">${entry.checked ? "✓" : ""}</span>
      <span class="menu-bar-label">${escapeHTML(entry.label)}</span>
      ${entry.hint ? `<span class="menu-hint">${escapeHTML(entry.hint)}</span>` : ""}`;
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!entry.run || !entry.enabled) return;
      this.ui.closeAllMenus();
      // Run inside the click, not after it: a file picker, the clipboard and
      // pointer capture are each allowed only in answer to the click itself.
      try {
        const result = entry.run();
        if (result?.catch) result.catch((err) => console.error(`[menu] ${entry.id}:`, err));
      } catch (err) {
        console.error(`[menu] ${entry.id}:`, err);
      }
      this.ui.refocusCanvas();
    });
    return el;
  }

  renderSubmenu(entry) {
    const el = document.createElement("div");
    el.className = "header-menu-item menu-bar-item menu-bar-parent";
    el.dataset.menuId = entry.id;
    el.setAttribute("role", "menuitem");
    el.setAttribute("aria-haspopup", "menu");
    el.tabIndex = entry.enabled ? 0 : -1;
    if (!entry.enabled) el.classList.add("disabled");
    el.innerHTML = `
      <span class="menu-bar-tick"></span>
      <span class="menu-bar-label">${escapeHTML(entry.label)}</span>
      ${SUBMENU_ARROW}`;
    if (!entry.enabled) return el;

    const panel = document.createElement("div");
    panel.className = "header-menu menu-bar-submenu";
    panel.setAttribute("role", "menu");
    panel.replaceChildren(...this.renderEntries(entry.children));
    el.appendChild(panel);

    // Opens toward the side with room: rightward, unless that runs off the page.
    el.addEventListener("mouseenter", () => this.placeSubmenu(el, panel));
    // A tap, where there is no hover to open it.
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      if (e.target.closest(".menu-bar-submenu") !== panel) {
        el.classList.toggle("open");
        this.placeSubmenu(el, panel);
      }
    });
    return el;
  }

  placeSubmenu(parent, panel) {
    parent.classList.remove("flip");
    const rect = panel.getBoundingClientRect();
    if (rect.right > window.innerWidth - 4) parent.classList.add("flip");
  }
}
