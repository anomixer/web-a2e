/*
 * ui-controller.js - Main UI controller and menu wiring
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

/**
 * UIController - Manages all toolbar and control UI interactions
 * Handles button clicks, popups, menus, and UI state updates
 */

import { clearStateFromStorage } from "../state/state-persistence.js";
import { ThemeManager } from "./theme-manager.js";
import { showConfirm } from "./confirm.js";
import { FullscreenDrivePopouts } from "./fullscreen-drive-popouts.js";
import { getMachineProfile } from "../machine/machine-profile.js";
import { SoundSettings } from "../audio/sound-settings.js";

// Timing constants
const REMINDER_DISMISS_DELAY_MS = 2000;
const NOTIFICATION_DISPLAY_MS = 3000;
const STATE_BUTTON_FLASH_MS = 600;

/**
 * @typedef {Object} UIControllerDeps
 * @property {Object} emulator - The emulator instance (for start/stop/running state)
 * @property {Object} wasmModule - The WASM module
 * @property {Object} audioDriver - Audio driver for volume/mute
 * @property {Object} diskManager - Disk manager for drive sounds
 * @property {Object} fileExplorer - File explorer window
 * @property {Object} windowManager - Debug window manager
 * @property {Object} screenWindow - Screen window instance
 * @property {Object} reminderController - Reminder controller
 * @property {Object} emulationSpeed - EmulationSpeed controller (CPU speed selector)
 */

export class UIController {
  /**
   * @param {UIControllerDeps} deps - Dependencies
   */
  constructor(deps) {
    this.emulator = deps.emulator;
    this.wasmModule = deps.wasmModule;
    this.audioDriver = deps.audioDriver;
    this.diskManager = deps.diskManager;
    this.fileExplorer = deps.fileExplorer;
    this.windowManager = deps.windowManager;
    this.screenWindow = deps.screenWindow;
    this.reminderController = deps.reminderController;
    this.inputHandler = deps.inputHandler;
    this.themeManager = deps.themeManager;
    this.windowSwitcher = deps.windowSwitcher;
    this.emulationSpeed = deps.emulationSpeed;

    this.isFullPageMode = false;
    this.canvas = null;
  }

  /**
   * Initialize all UI controls
   */
  init() {
    this.canvas = document.getElementById("screen");
    if (!this.canvas) {
      console.error("Required DOM element not found: screen");
      return;
    }

    this.setupMenus();
    this.setupPowerControls();
    this.setupAgentButton();
    this.setupFullPageModeControls();
    this.setupSoundControls();
    this.setupResetButtons();
    this.setupWindowSwitcher();
  }

  /**
   * Hand over the menu bar (menu-bar.js), made once the machine menu and the
   * state manager it reads from exist. It gets the cards already applied.
   */
  setMenuBar(menuBar) {
    this.menuBar = menuBar;
    menuBar.setCards(this.installedCards);
  }

  /**
   * Helper to refocus canvas after button clicks
   */
  refocusCanvas() {
    if (this.canvas) {
      setTimeout(() => this.canvas.focus(), 0);
    }
  }

  /**
   * Close all open header menus
   */
  closeAllMenus() {
    document.querySelectorAll(".header-menu-container.open").forEach((c) => {
      c.classList.remove("open");
    });
  }

  /**
   * Set up generic menu open/close behavior for all header-menu-container elements
   */
  setupMenus() {
    // The menu bar's own menus open themselves (menu-bar.js); this is the
    // machine badge's, and anything else built in the same idiom.
    const containers = document.querySelectorAll(".header-menu-container:not(.menu-bar-menu)");

    containers.forEach((container) => {
      const trigger = container.querySelector(".header-menu-trigger");
      if (!trigger) return;

      trigger.addEventListener("click", (e) => {
        e.stopPropagation();
        const wasOpen = container.classList.contains("open");

        // Close all menus first
        this.closeAllMenus();

        // Toggle this one
        if (!wasOpen) {
          container.classList.add("open");
        }
      });

      // Hovering over a different menu trigger while one is open switches menus
      trigger.addEventListener("mouseenter", () => {
        const anyOpen = document.querySelector(".header-menu-container.open");
        if (anyOpen && anyOpen !== container) {
          this.closeAllMenus();
          container.classList.add("open");
        }
      });
    });

    // Close menus when clicking outside
    document.addEventListener("click", (e) => {
      const inMenu = e.target.closest(".header-menu-container");
      if (!inMenu) {
        this.closeAllMenus();
      }
    });

    // Close menus on Escape
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.closeAllMenus();
      }
    });

    // Close menus on window resize
    window.addEventListener("resize", () => {
      this.closeAllMenus();
    });
  }

  /**
   * Set up power button and reset controls (System menu items)
   */
  setupPowerControls() {
    const powerBtn = document.getElementById("btn-power");
    if (!powerBtn) {
      console.error("Required DOM element not found: btn-power");
      return;
    }

    powerBtn.addEventListener("click", () => this.togglePower());
  }

  /** The power button, and Machine › Power. */
  togglePower() {
    this.reminderController.dismissPowerReminder();
    if (this.emulator.isRunning()) {
      this.emulator.stop();
      this.reminderController.showBasicReminder(false);
    } else {
      this.emulator.start();
      // "No disk?" is the wrong advice while a disk boots.
      this.reminderController.showBasicReminder(!this.anyMediaInserted());
    }
    this.refocusCanvas();
  }

  /** Whether any drive holds anything: a floppy, a 3.5" disk or a SmartPort image. */
  anyMediaInserted() {
    const units = [
      ...(this.emulator.diskManager?.drives ?? []),
      ...(this.emulator.disk35Manager?.drives ?? []),
      ...(this.emulator.hardDriveManager?.devices ?? []),
    ];
    return units.some((unit) => unit.filename);
  }

  /**
   * Power the machine on from something other than the power button.
   *
   * The reminder is hidden rather than dismissed: dismissal is permanent, and
   * a visitor whose machine started on its own has not decided they no longer
   * need the hint — they may never have seen it. `showBasicHint` is off when a
   * disk is already in the drive, because "No disk? Press Ctrl+Reset" is
   * misleading advice to give someone watching a disk boot.
   *
   * @param {{showBasicHint?: boolean}} [options]
   */
  powerOn({ showBasicHint = true } = {}) {
    if (this.emulator.isRunning()) return;

    this.reminderController.showPowerReminder(false);
    this.emulator.start();
    if (showBasicHint) this.reminderController.showBasicReminder(true);
    this.refocusCanvas();
  }

  /**
   * Set up agent button for MCP server connection
   */
  setupAgentButton() {
    console.log("[UIController] setupAgentButton() called");
    const agentBtn = document.getElementById("btn-agent");
    const agentBtnLabel = agentBtn?.querySelector(".agent-btn-label");
    console.log("[UIController] agentBtn:", agentBtn);
    if (!agentBtn) {
      console.warn("[UIController] Agent button not found");
      return;
    }

    const agentManager = this.emulator.agentManager;
    if (!agentManager) {
      console.warn("[UIController] AgentManager not available");
      return;
    }

    console.log("[UIController] Agent button initialized");

    // Hide button by default
    agentBtn.classList.add("hidden");

    const updateButtonState = () => {
      const state = agentManager.getState();

      // Remove all state classes
      agentBtn.classList.remove("connected", "disconnected", "severed", "hidden");

      if (!state.serverAvailable) {
        // Hide button when server is not available
        agentBtn.classList.add("hidden");
        agentBtn.title = "MCP Server not available";
      } else if (state.connected) {
        // Connected - yellow
        agentBtn.classList.add("connected");
        agentBtn.title = "Disconnect";
      } else if (state.reconnecting) {
        // Connection severed but reconnecting - light red
        agentBtn.classList.add("severed");
        agentBtn.title = "Connection lost - Click to abort reconnection";
      } else {
        // Server available but not connected - default appearance
        agentBtn.classList.add("disconnected");
        agentBtn.title = "Connect to Agent";
      }
    };

    // Set up callbacks
    agentManager.onServerAvailable = () => {
      console.log("[UIController] Server became available - showing button");
      updateButtonState();
    };

    agentManager.onServerUnavailable = () => {
      console.log("[UIController] Server became unavailable - hiding button");
      updateButtonState();
    };

    agentManager.onConnectionChange = (connected, acceptedName) => {
      console.log(`[UIController] Connection changed: ${connected}${acceptedName ? ` (${acceptedName})` : ""}`);
      if (acceptedName && agentBtnLabel) {
        agentBtnLabel.textContent = acceptedName;
      }
      updateButtonState();
    };

    // Handle button click — delay when connected to allow double-click rename to cancel first
    let _clickTimer = null;

    agentBtn.addEventListener("click", () => {
      console.log("[UIController] Agent button clicked");
      const state = agentManager.getState();

      if (agentManager.isConnected()) {
        // Delay 250ms so double-click on label can cancel before disconnect fires
        clearTimeout(_clickTimer);
        _clickTimer = setTimeout(() => {
          _clickTimer = null;
          console.log("[UIController] Disconnecting...");
          agentManager.disconnect();
          agentManager.startHeartbeatPolling();
          updateButtonState();
          this.refocusCanvas();
        }, 250);
      } else if (state.reconnecting) {
        // Reconnecting - abort reconnection and reset to disconnected
        console.log("[UIController] Aborting reconnection attempts...");
        agentManager.disconnect();
        updateButtonState();
        this.refocusCanvas();
      } else {
        // Disconnected - connect (preferred name comes from sessionStorage via agent-manager)
        console.log("[UIController] Connecting...");
        agentManager.connect();
        setTimeout(() => updateButtonState(), 100);
        updateButtonState();
        this.refocusCanvas();
      }
    });

    // Double-click on label enters inline rename mode (connected state only)
    agentBtnLabel.addEventListener("dblclick", (e) => {
      if (!agentManager.isConnected()) return;
      e.stopPropagation();
      clearTimeout(_clickTimer);
      _clickTimer = null;

      const currentName = agentBtnLabel.textContent;
      const input = document.createElement("input");
      input.type = "text";
      input.value = currentName;
      input.className = "agent-btn-rename-input";
      input.size = Math.max(4, currentName.length + 1);

      agentBtnLabel.textContent = "";
      agentBtnLabel.appendChild(input);
      input.focus();
      input.select();

      let handled = false;

      const cancel = () => {
        if (handled) return;
        handled = true;
        agentBtnLabel.textContent = currentName;
        this.refocusCanvas();
      };

      const confirm = async () => {
        if (handled) return;
        handled = true;
        const newName = input.value;
        if (!newName || newName === currentName) {
          agentBtnLabel.textContent = currentName;
          this.refocusCanvas();
          return;
        }
        try {
          const response = await fetch(`${agentManager.serverUrl}/emulator-rename`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ oldName: currentName, newName }),
          });
          const result = await response.json();
          if (result.success) {
            agentBtnLabel.textContent = newName;
            sessionStorage.setItem("agent-emulator-name", newName);
          } else {
            input.classList.add("error");
            setTimeout(() => { agentBtnLabel.textContent = currentName; }, 800);
          }
        } catch (e) {
          agentBtnLabel.textContent = currentName;
        }
        this.refocusCanvas();
      };

      input.addEventListener("input", () => {
        const before = input.value;
        const pos = input.selectionStart;
        const cleaned = before.replace(/[^\p{L}_-]/gu, "");
        if (cleaned !== before) {
          const removedBeforeCursor = before.slice(0, pos).replace(/[^\p{L}_-]/gu, "").length;
          input.value = cleaned;
          input.setSelectionRange(removedBeforeCursor, removedBeforeCursor);
        }
        input.size = Math.max(4, input.value.length + 1);
      });

      input.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Enter") { e.preventDefault(); confirm(); }
        else if (e.key === "Escape") { e.preventDefault(); cancel(); }
      });

      input.addEventListener("blur", cancel);
    });

    // Start heartbeat polling to detect when server becomes available
    agentManager.startHeartbeatPolling();

    updateButtonState();
  }

  /** The header's Ctrl+Reset and Reboot buttons. */
  setupResetButtons() {
    document.getElementById("btn-warm-reset")?.addEventListener("click", () => this.controlReset());
    document.getElementById("btn-cold-reset")?.addEventListener("click", () => this.reboot());
  }

  /** Control-Reset: a warm reset, memory kept. */
  controlReset() {
    if (this.inputHandler) this.inputHandler.cancelPaste();
    this.wasmModule._warmReset();
    setTimeout(() => {
      this.reminderController.dismissBasicReminder();
    }, REMINDER_DISMISS_DELAY_MS);
    this.refocusCanvas();
  }

  /** Reboot: a cold start, and the machine's autosave forgotten. */
  async reboot() {
    if (this.inputHandler) this.inputHandler.cancelPaste();
    this.wasmModule._reset();
    await clearStateFromStorage(getMachineProfile().key);
    this.refocusCanvas();
  }

  /** File › Reset Defaults: clear all persisted data and reload. */
  async resetDefaults() {
    const confirmed = await showConfirm(
      "Reset all settings, save states, and window positions to factory defaults? This cannot be undone.",
      "Reset Defaults",
    );
    if (!confirmed) return;

    localStorage.clear();

    const dbNames = ["a2e-state-persistence", "a2e-hd-persistence"];
    await Promise.all(
      dbNames.map(
        (name) =>
          new Promise((resolve) => {
            const req = indexedDB.deleteDatabase(name);
            req.onsuccess = resolve;
            req.onerror = resolve;
            req.onblocked = resolve;
          }),
      ),
    );

    // Prevent beforeunload from re-saving state, then reload
    window._resettingDefaults = true;
    window.location.reload();
  }

  /**
   * Hide what the running machine cannot use.
   *
   * Called at startup, after a machine switch, and whenever the cards change,
   * because each answer is about the machine or about what is fitted to it.
   * The menu bar asks menuAvailability() as each menu opens; this tells it
   * which cards are fitted and redraws it.
   *
   * @param {object} installedCards - slot number → card id, fixed slots included
   */
  applyMachineMenus(installedCards) {
    this.installedCards = installedCards;
    this.menuBar?.setCards(installedCards);
  }

  /** Help › Check for Updates, on an installed app: drop the cache and reload. */
  async checkForUpdates() {
    if (!("serviceWorker" in navigator)) {
      window.location.reload(true);
      return;
    }
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        await registration.unregister();
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map((name) => caches.delete(name)));
        this.showNotification("Updating... page will reload");
        setTimeout(() => window.location.reload(true), 500);
      } else {
        this.showNotification("No service worker registered");
      }
    } catch (error) {
      console.error("Update failed:", error);
      this.showNotification("Update failed: " + error.message);
    }
  }

  /**
   * Set up Ctrl+` shortcut to toggle the window switcher
   */
  setupWindowSwitcher() {
    if (!this.windowSwitcher) return;

    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.code === 'Backquote') {
        e.preventDefault();
        e.stopPropagation();

        // Exit full-page mode first so the selected window is visible
        if (this.isFullPageMode) {
          const fullscreenBtn = document.getElementById('btn-fullscreen');
          if (fullscreenBtn) fullscreenBtn.click();
        }

        this.windowSwitcher.toggle();
      }

      // Option+Tab / Option+Shift+Tab to cycle through visible windows
      if (e.altKey && e.code === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        this.windowManager.cycleWindow(e.shiftKey);
      }
    }, { capture: true });
  }

  /**
   * Sync the full-page toolbar power button with emulator state
   */
  syncFullPagePowerButton() {
    const fpPower = document.getElementById("fp-power");
    if (!fpPower) return;

    if (this.emulator.isRunning()) {
      fpPower.classList.remove("off");
      fpPower.title = "Power Off";
    } else {
      fpPower.classList.add("off");
      fpPower.title = "Power On";
    }
  }

  /**
   * Set up fullscreen/full page mode controls
   */
  /** View › Full Page: the picture alone, filling the page, every window put away. */
  enterFullPageMode() {
    if (this.isFullPageMode) return;
    this.closeAllMenus();

    // Remember which windows are visible before hiding them
    this._windowsBeforeFullPage = this.windowManager.getVisibleWindowIds();

    // Detach canvas from ScreenWindow into monitor-frame for full-page rendering
    if (this.screenWindow && this.screenWindow.isVisible) {
      this.screenWindow.detachCanvas();
      this.screenWindow.isVisible = false;
      this.screenWindow.element.classList.add("hidden");
    }

    this.windowManager.hideAll();
    document.body.classList.add("full-page-mode");
    this.isFullPageMode = true;
    this.syncFullPagePowerButton();
    this.refocusCanvas();
  }

  exitFullPageMode() {
    if (!this.isFullPageMode) return;
    document.body.classList.remove("full-page-mode");
    this.isFullPageMode = false;

    // Restore ScreenWindow and re-attach canvas from monitor-frame
    if (this.screenWindow) {
      this.screenWindow.show();
      this.screenWindow.attachCanvas();
    }

    // Restore windows that were visible before entering full page mode
    if (this._windowsBeforeFullPage) {
      for (const id of this._windowsBeforeFullPage) {
        this.windowManager.showWindow(id);
      }
      this._windowsBeforeFullPage = null;
    }

    this.refocusCanvas();
  }

  /** The browser's own full screen: the header button and View › Enter Full Screen. */
  setFullScreen(on) {
    if (!on && document.fullscreenElement) {
      document.exitFullscreen();
    } else if (on && !document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.warn("Fullscreen request failed:", err);
      });
    }
    this.refocusCanvas();
  }

  isHeaderAutoHidden() {
    return !!document.querySelector("header")?.classList.contains("auto-hide");
  }

  /** View › Auto-hide Menu Bar: the header slides away until the pointer reaches the top. */
  setHeaderAutoHidden(on) {
    const headerEl = document.querySelector("header");
    if (!headerEl) return;
    headerEl.classList.toggle("auto-hide", on);
    if (!on) headerEl.classList.remove("header-visible");
    localStorage.setItem("a2e-auto-hide-header", on);
  }

  setupFullPageModeControls() {
    const fullscreenBtn = document.getElementById("btn-fullscreen");
    if (!fullscreenBtn) return;

    fullscreenBtn.addEventListener("click", () => this.setFullScreen(!document.fullscreenElement));

    const headerEl = document.querySelector("header");

    document.addEventListener("fullscreenchange", () => {
      const isFullscreen = !!document.fullscreenElement;

      // Wait a frame so viewport dimensions are settled
      requestAnimationFrame(() => {
        if (isFullscreen) {
          // Remember pre-fullscreen state of the screen window
          this._wasViewportLocked = this.screenWindow?._viewportLocked;
          this._windowsBeforeFullscreen = this.windowManager.getVisibleWindowIds()
            .filter(id => id !== "screen-window");

          // Hide all windows except screen, then maximize screen
          for (const id of this._windowsBeforeFullscreen) {
            this.windowManager.hideWindow(id);
          }
          if (this.screenWindow && !this.screenWindow._viewportLocked) {
            this.screenWindow.setViewportLocked(true);
          } else if (this.screenWindow) {
            // Already locked — just re-constrain for the new viewport size
            this.screenWindow.constrainToViewport();
          }
        } else {
          // Exiting fullscreen — restore previous state
          if (headerEl) headerEl.classList.remove("header-visible");

          if (this.screenWindow && !this._wasViewportLocked) {
            // Remove chromeless mode without the internal repositioning,
            // then fitToViewport handles sizing and centering in one pass
            this.screenWindow._viewportLocked = false;
            if (this.screenWindow._lockBtn) {
              this.screenWindow._lockBtn.classList.remove("active");
              this.screenWindow._lockBtn.title = "Fit to viewport";
            }
            if (this.screenWindow.element) {
              this.screenWindow.element.classList.remove("chromeless");
            }
            if (this.screenWindow.onStateChange) this.screenWindow.onStateChange();
            // Double-rAF: first frame lets the browser lay out the
            // now-visible window header, second frame measures it
            requestAnimationFrame(() =>
              requestAnimationFrame(() => this.screenWindow.fitToViewport())
            );
          } else if (this.screenWindow) {
            this.screenWindow.constrainToViewport();
          }

          // Restore windows that were visible
          if (this._windowsBeforeFullscreen) {
            for (const id of this._windowsBeforeFullscreen) {
              this.windowManager.showWindow(id);
            }
            this._windowsBeforeFullscreen = null;
          }
        }
      });
    });

    // The auto-hide header, as it was left.
    if (headerEl && localStorage.getItem("a2e-auto-hide-header") === "true") {
      headerEl.classList.add("auto-hide");
    }

    // Show/hide header based on mouse proximity to top edge (auto-hide only)
    const triggerZone = 8;
    document.addEventListener("mousemove", (e) => {
      if (!headerEl) return;
      if (!headerEl.classList.contains("auto-hide")) return;

      if (e.clientY <= triggerZone) {
        headerEl.classList.add("header-visible");
      } else {
        // Only hide if mouse isn't over the header itself
        if (!headerEl.contains(e.target)) {
          headerEl.classList.remove("header-visible");
        }
      }
    });

    // Control-Escape goes into full page and back out, as View › Full Page does.
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && e.ctrlKey) {
        e.preventDefault();
        if (this.isFullPageMode) this.exitFullPageMode();
        else this.enterFullPageMode();
      }
    });

    // Exit full page mode on click (on the black background area)
    const mainEl = document.querySelector("main");
    if (mainEl) {
      mainEl.addEventListener("click", (e) => {
        if (this.isFullPageMode && e.target.tagName !== "CANVAS") {
          this.exitFullPageMode();
        }
      });
    }

    // --- Full-page toolbar button handlers ---

    const fpPower = document.getElementById("fp-power");
    if (fpPower) {
      fpPower.addEventListener("click", (e) => {
        e.stopPropagation();
        this.reminderController.dismissPowerReminder();
        if (this.emulator.isRunning()) {
          this.emulator.stop();
        } else {
          this.emulator.start();
        }
        this.syncFullPagePowerButton();
        this.refocusCanvas();
      });
    }

    const fpWarmReset = document.getElementById("fp-warm-reset");
    if (fpWarmReset) {
      fpWarmReset.addEventListener("click", (e) => {
        e.stopPropagation();
        if (this.inputHandler) this.inputHandler.cancelPaste();
        this.wasmModule._warmReset();
        this.refocusCanvas();
      });
    }

    const fpColdReset = document.getElementById("fp-cold-reset");
    if (fpColdReset) {
      fpColdReset.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (this.inputHandler) this.inputHandler.cancelPaste();
        this.wasmModule._reset();
        await clearStateFromStorage(getMachineProfile().key);
        this.refocusCanvas();
      });
    }

    const fpExit = document.getElementById("fp-exit");
    if (fpExit) {
      fpExit.addEventListener("click", (e) => {
        e.stopPropagation();
        this.exitFullPageMode();
      });
    }

    // Slide-out drive popouts for full-page/fullscreen modes
    this._drivePopouts = new FullscreenDrivePopouts(
      this.diskManager,
      this.emulator.hardDriveManager
    );
    this._drivePopouts.init();
  }

  /**
   * The sound popup on the header's speaker button. Machine › Sound offers
   * the same settings, so the popup reads them afresh each time it opens.
   */
  setupSoundControls() {
    this.soundSettings = new SoundSettings({
      wasmModule: this.wasmModule,
      diskManager: this.diskManager,
    });
    this.soundSettings.apply();
    this.diskManager.setMasterVolume(this.audioDriver.isMuted() ? 0 : this.audioDriver.getVolume());
    this.updateSoundButton();
    this.setupCharacterSetToggle();

    const soundBtn = document.getElementById("btn-sound");
    const soundPopup = document.getElementById("sound-popup");
    if (!soundBtn || !soundPopup) return;

    const volumeSlider = document.getElementById("volume-slider");
    const volumeValue = document.getElementById("volume-value");
    const toggles = {
      mute: document.getElementById("mute-toggle"),
      driveSounds: document.getElementById("drive-sounds-toggle"),
      phaseLock: document.getElementById("mockingboard-phase-lock-toggle"),
      mono: document.getElementById("mockingboard-mono-toggle"),
      printerSounds: document.getElementById("printer-sounds-toggle"),
    };

    const sync = () => {
      const percent = Math.round(this.audioDriver.getVolume() * 100);
      if (volumeSlider) volumeSlider.value = percent;
      if (volumeValue) volumeValue.textContent = `${percent}%`;
      if (toggles.mute) toggles.mute.checked = this.audioDriver.isMuted();
      if (toggles.driveSounds) toggles.driveSounds.checked = this.soundSettings.driveSounds;
      if (toggles.phaseLock) toggles.phaseLock.checked = this.soundSettings.phaseLock;
      if (toggles.mono) toggles.mono.checked = this.soundSettings.mono;
      if (toggles.printerSounds) toggles.printerSounds.checked = this.soundSettings.printerSounds;
    };

    soundBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.closeAllMenus();
      sync();
      soundPopup.classList.toggle("hidden");
    });

    // Close popup when clicking outside
    document.addEventListener("click", (e) => {
      if (!soundPopup.contains(e.target) && e.target !== soundBtn) {
        soundPopup.classList.add("hidden");
      }
    });

    // Prevent popup from closing when clicking inside
    soundPopup.addEventListener("click", (e) => {
      e.stopPropagation();
    });

    volumeSlider?.addEventListener("input", (e) => {
      const percent = parseInt(e.target.value, 10);
      if (volumeValue) volumeValue.textContent = `${percent}%`;
      this.setVolume(percent / 100);
    });
    toggles.mute?.addEventListener("change", (e) => this.setMuted(e.target.checked));
    toggles.driveSounds?.addEventListener("change", (e) => this.soundSettings.setDriveSounds(e.target.checked));
    toggles.phaseLock?.addEventListener("change", (e) => this.soundSettings.setPhaseLock(e.target.checked));
    toggles.mono?.addEventListener("change", (e) => this.soundSettings.setMono(e.target.checked));
    toggles.printerSounds?.addEventListener("change", (e) => this.soundSettings.setPrinterSounds(e.target.checked));
  }

  /** Machine › Sound › Mute, and the popup's switch. */
  setMuted(muted) {
    if (muted) {
      this.audioDriver.mute();
      this.diskManager.setMasterVolume(0);
    } else {
      this.audioDriver.unmute();
      this.diskManager.setMasterVolume(this.audioDriver.getVolume());
    }
    this.updateSoundButton();
  }

  /** Machine › Sound › Volume, and the popup's slider: 0 to 1. */
  setVolume(volume) {
    this.audioDriver.setVolume(volume);
    if (!this.audioDriver.isMuted()) this.diskManager.setMasterVolume(volume);
  }

  /**
   * The US/UK switch in the screen window's title bar. Checked is UK: the
   * switch reads "US [toggle] UK" and the stylesheet lights the label on the
   * side the knob is on.
   */
  setupCharacterSetToggle() {
    const toggle = document.getElementById("screen-window-charset-toggle");
    const isUK = this.applyCharacterSet();
    if (!toggle) return;
    toggle.checked = isUK;
    toggle.addEventListener("change", (e) => this.setCharacterSet(e.target.checked));
  }

  /** Machine › Keyboard › UK Character Set, and the screen window's switch. */
  setCharacterSet(isUK) {
    this.wasmModule._setUKCharacterSet(isUK);
    localStorage.setItem("a2e-charset", isUK ? "uk" : "us");
    const toggle = document.getElementById("screen-window-charset-toggle");
    if (toggle) toggle.checked = isUK;
  }

  /**
   * Update sound button icon based on mute state
   */
  updateSoundButton() {
    const soundBtn = document.getElementById("btn-sound");
    if (!soundBtn) return;

    const iconUnmuted = soundBtn.querySelector(".icon-unmuted");
    const iconMuted = soundBtn.querySelector(".icon-muted");

    if (this.audioDriver.isMuted()) {
      iconUnmuted?.classList.add("hidden");
      iconMuted?.classList.remove("hidden");
    } else {
      iconUnmuted?.classList.remove("hidden");
      iconMuted?.classList.add("hidden");
    }
  }

  /**
   * Update power button appearance based on running state
   * @param {boolean} isRunning - Whether the emulator is running
   */
  /**
   * Push the saved character set into the core and report whether it is UK.
   *
   * Called at startup, and again after a machine switch: rebuilding the
   * emulator gives us a core that has never been told which character set the
   * user picked.
   */
  applyCharacterSet() {
    const machine = getMachineProfile();
    // Only offer the switch on a machine that has a second set. A II+'s
    // character generator holds one, and asking for another would leave the
    // screen blank; the toggle is hidden rather than left there doing harm.
    const supported = machine.caps?.hasUkCharSet !== false;

    const toggle = document.getElementById("screen-window-charset-toggle");
    // The whole switch, not the label immediately around the checkbox. That
    // label *is* the knob, so hiding it left the words "US" and "UK" sitting
    // in the title bar of a machine that has only one character set, with
    // nothing between them to click.
    const row = toggle?.closest(".screen-window-charset-switch");
    if (row) row.hidden = !supported;
    if (toggle) {
      toggle.disabled = !supported;
      // A machine with one set is always US, so the switch must not be left
      // showing whatever the last machine was set to.
      if (!supported) toggle.checked = false;
    }

    const isUK = supported && localStorage.getItem("a2e-charset") === "uk";
    this.wasmModule._setUKCharacterSet(isUK);
    return isUK;
  }

  updatePowerButton(isRunning) {
    const powerBtn = document.getElementById("btn-power");

    if (isRunning) {
      powerBtn?.classList.remove("off");
      if (powerBtn) powerBtn.title = "Power Off";
    } else {
      powerBtn?.classList.add("off");
      if (powerBtn) powerBtn.title = "Power On";
    }

    this.syncFullPagePowerButton();
  }

  /**
   * Flash the system menu trigger to indicate saving
   */
  flashStateButton() {
    const trigger = document.getElementById("btn-file-menu");
    if (!trigger) return;

    trigger.classList.add("saving");
    setTimeout(() => {
      trigger.classList.remove("saving");
    }, STATE_BUTTON_FLASH_MS);
  }

  /**
   * Show a notification message
   * @param {string} message - The message to display
   */
  showNotification(message) {
    let notification = document.getElementById("state-notification");
    if (!notification) {
      notification = document.createElement("div");
      notification.id = "state-notification";
      notification.className = "state-notification";
      document.body.appendChild(notification);
    }

    notification.textContent = message;
    notification.classList.add("visible");

    setTimeout(() => {
      notification.classList.remove("visible");
    }, NOTIFICATION_DISPLAY_MS);
  }

  /**
   * Check if in full page mode
   * @returns {boolean}
   */
  isInFullPageMode() {
    return this.isFullPageMode;
  }

  /**
   * Get the ID of the window that currently has focus, or null if none
   * @returns {string|null}
   */
  get hasFocus() {
    for (const [id, win] of this.windowManager.windows) {
      if (win.isVisible && win.element.classList.contains('focused')) {
        return id;
      }
    }
    return null;
  }

  /**
   * Bring a window to the front and give it focus
   * @param {string} id - The window ID to focus
   */
  focusWindow(id) {
    const win = this.windowManager.getWindow(id);
    if (win) {
      if (!win.isVisible) {
        this.windowManager.showWindow(id);
      } else {
        this.windowManager.bringToFront(id);
      }
    }
  }
}
