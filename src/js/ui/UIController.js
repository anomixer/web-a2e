/**
 * UIController - Manages all toolbar and control UI interactions
 * Handles button clicks, popups, and UI state updates
 */

import { clearStateFromStorage } from "../state-persistence.js";

// Timing constants
const REMINDER_DISMISS_DELAY_MS = 2000;
const NOTIFICATION_DISPLAY_MS = 3000;
const STATE_BUTTON_FLASH_MS = 600;
const DRIVE_ANIMATION_DURATION_MS = 280;

/**
 * @typedef {Object} UIControllerDeps
 * @property {Object} emulator - The emulator instance (for start/stop/running state)
 * @property {Object} wasmModule - The WASM module
 * @property {Object} audioDriver - Audio driver for volume/mute
 * @property {Object} diskManager - Disk manager for drive sounds
 * @property {Object} fileExplorer - File explorer window
 * @property {Object} windowManager - Debug window manager
 * @property {Object} monitorResizer - Monitor resize handler
 * @property {Object} reminderController - Reminder controller
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
    this.monitorResizer = deps.monitorResizer;
    this.reminderController = deps.reminderController;

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

    this.setupPowerControls();
    this.setupFullPageModeControls();
    this.setupDrivesToggle();
    this.setupSoundControls();
    this.setupDebugMenuControls();
    this.setupMiscControls();
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
   * Set up power button and reset controls
   */
  setupPowerControls() {
    const powerBtn = document.getElementById("btn-power");
    if (!powerBtn) {
      console.error("Required DOM element not found: btn-power");
      return;
    }

    // Power button - simple on/off
    powerBtn.addEventListener("click", () => {
      this.reminderController.dismissPowerReminder();
      if (this.emulator.isRunning()) {
        this.emulator.stop();
        this.reminderController.showBasicReminder(false);
      } else {
        this.emulator.start();
        this.reminderController.showBasicReminder(true);
      }
      this.refocusCanvas();
    });

    // Warm reset button (preserves memory)
    const warmResetBtn = document.getElementById("btn-warm-reset");
    if (warmResetBtn) {
      warmResetBtn.addEventListener("click", () => {
        this.wasmModule._warmReset();
        setTimeout(() => {
          this.reminderController.dismissBasicReminder();
        }, REMINDER_DISMISS_DELAY_MS);
        this.refocusCanvas();
      });
    }

    // Cold reset button (full restart)
    const coldResetBtn = document.getElementById("btn-cold-reset");
    if (coldResetBtn) {
      coldResetBtn.addEventListener("click", async () => {
        this.wasmModule._reset();
        await clearStateFromStorage();
        this.refocusCanvas();
      });
    }
  }

  /**
   * Set up fullscreen/full page mode controls
   */
  setupFullPageModeControls() {
    const fullscreenBtn = document.getElementById("btn-fullscreen");
    if (!fullscreenBtn) return;

    const exitFullPageMode = () => {
      document.body.classList.remove("full-page-mode");
      this.isFullPageMode = false;
      this.refocusCanvas();
    };

    const enterFullPageMode = () => {
      this.windowManager.hideAll();
      document.body.classList.add("full-page-mode");
      this.isFullPageMode = true;
      this.refocusCanvas();
    };

    fullscreenBtn.addEventListener("click", () => {
      if (this.isFullPageMode) {
        exitFullPageMode();
      } else {
        enterFullPageMode();
      }
    });

    // Exit full page mode on Ctrl+Escape
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && e.ctrlKey && this.isFullPageMode) {
        e.preventDefault();
        exitFullPageMode();
      }
    });

    // Exit full page mode on click (on the black background area)
    const mainEl = document.querySelector("main");
    if (mainEl) {
      mainEl.addEventListener("click", (e) => {
        if (this.isFullPageMode && e.target.tagName !== "CANVAS") {
          exitFullPageMode();
        }
      });
    }
  }

  /**
   * Set up disk drives visibility toggle
   */
  setupDrivesToggle() {
    const drivesBtn = document.getElementById("btn-drives");
    const drivesContainer = document.querySelector(".disk-drives-container");

    if (!drivesBtn || !drivesContainer) {
      console.warn("Disk drive UI elements not found");
      return;
    }

    // Load saved drives visibility setting (default to visible)
    const savedDrivesVisible = localStorage.getItem("a2e-show-drives");
    if (savedDrivesVisible === "false") {
      // Skip animation on initial load
      drivesContainer.classList.add("no-transition");
      drivesContainer.classList.add("collapsed");
      drivesBtn.classList.add("off");
      drivesContainer.offsetHeight; // Force reflow
      requestAnimationFrame(() => {
        drivesContainer.classList.remove("no-transition");
        this.monitorResizer.handleResize();
      });
    }

    drivesBtn.addEventListener("click", () => {
      const isCurrentlyCollapsed = drivesContainer.classList.contains("collapsed");

      drivesContainer.classList.toggle("collapsed");
      drivesBtn.classList.toggle("off", !isCurrentlyCollapsed);
      localStorage.setItem("a2e-show-drives", isCurrentlyCollapsed);

      // Resize monitor continuously during animation
      const startTime = performance.now();
      const animateResize = () => {
        this.monitorResizer.handleResize();
        if (performance.now() - startTime < DRIVE_ANIMATION_DURATION_MS) {
          requestAnimationFrame(animateResize);
        }
      };
      requestAnimationFrame(animateResize);

      this.reminderController.dismissDrivesReminder();
      this.refocusCanvas();
    });
  }

  /**
   * Set up sound controls popup
   */
  setupSoundControls() {
    const soundBtn = document.getElementById("btn-sound");
    const soundPopup = document.getElementById("sound-popup");
    const volumeSlider = document.getElementById("volume-slider");
    const volumeValue = document.getElementById("volume-value");
    const muteToggle = document.getElementById("mute-toggle");
    const driveSoundsToggle = document.getElementById("drive-sounds-toggle");
    const charsetToggle = document.getElementById("charset-toggle");

    if (!soundBtn || !soundPopup) return;

    // Load saved drive sounds setting
    const savedDriveSounds = localStorage.getItem("a2e-drive-sounds");
    const driveSoundsEnabled = savedDriveSounds !== "false";
    if (driveSoundsToggle) {
      driveSoundsToggle.checked = driveSoundsEnabled;
    }
    this.diskManager.setSeekSoundEnabled(driveSoundsEnabled);
    this.diskManager.setMotorSoundEnabled(driveSoundsEnabled);

    // Toggle popup on button click
    soundBtn.addEventListener("click", (e) => {
      e.stopPropagation();
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

    // Volume slider
    if (volumeSlider && volumeValue) {
      const initialVolume = Math.round(this.audioDriver.getVolume() * 100);
      volumeSlider.value = initialVolume;
      volumeValue.textContent = `${initialVolume}%`;

      volumeSlider.addEventListener("input", (e) => {
        const volume = parseInt(e.target.value, 10);
        volumeValue.textContent = `${volume}%`;
        this.audioDriver.setVolume(volume / 100);
      });
    }

    // Mute toggle
    if (muteToggle) {
      muteToggle.checked = this.audioDriver.isMuted();
      muteToggle.addEventListener("change", (e) => {
        if (e.target.checked) {
          this.audioDriver.mute();
        } else {
          this.audioDriver.unmute();
        }
        this.updateSoundButton();
      });
    }

    // Drive sounds toggle
    if (driveSoundsToggle) {
      driveSoundsToggle.addEventListener("change", (e) => {
        const enabled = e.target.checked;
        this.diskManager.setSeekSoundEnabled(enabled);
        this.diskManager.setMotorSoundEnabled(enabled);
        localStorage.setItem("a2e-drive-sounds", enabled);
      });
    }

    // Character set toggle (UK/US)
    if (charsetToggle) {
      const savedCharset = localStorage.getItem("a2e-charset");
      if (savedCharset === "uk") {
        charsetToggle.checked = false;
        this.wasmModule._setUKCharacterSet(true);
      } else {
        charsetToggle.checked = true;
        this.wasmModule._setUKCharacterSet(false);
      }

      charsetToggle.addEventListener("change", (e) => {
        const isUK = !e.target.checked;
        this.wasmModule._setUKCharacterSet(isUK);
        localStorage.setItem("a2e-charset", isUK ? "uk" : "us");
      });
    }
  }

  /**
   * Set up debug menu dropdown
   */
  setupDebugMenuControls() {
    const debugMenuContainer = document.querySelector(".debug-menu-container");
    const debugMenuBtn = document.getElementById("btn-debug-menu");
    const debugMenu = document.getElementById("debug-menu");

    if (!debugMenuBtn || !debugMenu || !debugMenuContainer) return;

    const windowMap = {
      cpu: "cpu-debugger",
      drives: "drive-detail",
      switches: "soft-switches",
      memmap: "memory-map",
      memory: "memory-browser",
      heatmap: "memory-heatmap",
      stack: "stack-viewer",
      zeropage: "zeropage-watch",
      mockingboard: "mockingboard-debug",
    };

    debugMenuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      debugMenuContainer.classList.toggle("open");
    });

    debugMenu.querySelectorAll(".debug-menu-item").forEach((item) => {
      item.addEventListener("click", () => {
        const windowType = item.dataset.window;
        if (windowMap[windowType]) {
          this.windowManager.toggleWindow(windowMap[windowType]);
        }
        debugMenuContainer.classList.remove("open");
        this.refocusCanvas();
      });
    });

    document.addEventListener("click", (e) => {
      if (!debugMenuContainer.contains(e.target)) {
        debugMenuContainer.classList.remove("open");
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        debugMenuContainer.classList.remove("open");
      }
    });
  }

  /**
   * Set up miscellaneous controls (file explorer, display settings)
   */
  setupMiscControls() {
    // File explorer button
    const fileExplorerBtn = document.getElementById("btn-file-explorer");
    if (fileExplorerBtn) {
      fileExplorerBtn.addEventListener("click", () => {
        this.fileExplorer.toggle();
      });
    }

    // Display settings button
    const displayBtn = document.getElementById("btn-display");
    if (displayBtn) {
      displayBtn.addEventListener("click", () => {
        this.windowManager.toggleWindow("display-settings");
        this.refocusCanvas();
      });
    }

    // Joystick button
    const joystickBtn = document.getElementById("btn-joystick");
    if (joystickBtn) {
      joystickBtn.addEventListener("click", () => {
        this.windowManager.toggleWindow("joystick");
        this.refocusCanvas();
      });
    }

    // Update/refresh button - force service worker update
    const updateBtn = document.getElementById("btn-update");
    if (updateBtn) {
      updateBtn.addEventListener("click", async () => {
        if ("serviceWorker" in navigator) {
          try {
            const registration = await navigator.serviceWorker.getRegistration();
            if (registration) {
              // Unregister the service worker
              await registration.unregister();
              // Clear all caches
              const cacheNames = await caches.keys();
              await Promise.all(cacheNames.map((name) => caches.delete(name)));
              // Reload the page to get fresh content
              this.showNotification("Updating... page will reload");
              setTimeout(() => window.location.reload(true), 500);
            } else {
              this.showNotification("No service worker registered");
            }
          } catch (error) {
            console.error("Update failed:", error);
            this.showNotification("Update failed: " + error.message);
          }
        } else {
          // No service worker, just reload
          window.location.reload(true);
        }
      });
    }
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
  updatePowerButton(isRunning) {
    const powerBtn = document.getElementById("btn-power");
    const powerLed = document.getElementById("monitor-power-led");

    if (isRunning) {
      powerBtn?.classList.remove("off");
      if (powerBtn) powerBtn.title = "Power Off";
      powerLed?.classList.add("on");
    } else {
      powerBtn?.classList.add("off");
      if (powerBtn) powerBtn.title = "Power On";
      powerLed?.classList.remove("on");
    }
  }

  /**
   * Flash the state button to indicate saving
   */
  flashStateButton() {
    const stateBtn = document.getElementById("btn-state");
    if (!stateBtn) return;

    stateBtn.classList.add("saving");
    setTimeout(() => {
      stateBtn.classList.remove("saving");
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
}
