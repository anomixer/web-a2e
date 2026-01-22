// Apple //e Emulator - Main Entry Point

import { WebGLRenderer } from "./webgl-renderer.js";
import { AudioDriver } from "./audio-driver.js";
import { InputHandler } from "./input-handler.js";
import { DiskManager } from "./disk-manager/index.js";
import { TextSelection } from "./TextSelection.js";
import { MonitorResizer } from "./ui/MonitorResizer.js";
import { ReminderController } from "./ui/ReminderController.js";
import { DocumentationDialog } from "./ui/DocumentationDialog.js";
import {
  WindowManager,
  CPUDebuggerWindow,
  DriveDetailWindow,
  SoftSwitchWindow,
  DisplaySettingsWindow,
  MemoryBrowserWindow,
  MemoryHeatMapWindow,
  StackViewerWindow,
  ZeroPageWatchWindow,
} from "./debug/index.js";
import {
  saveStateToStorage,
  loadStateFromStorage,
  hasSavedState,
  clearStateFromStorage,
  getSavedStateTimestamp,
} from "./state-persistence.js";

class AppleIIeEmulator {
  constructor() {
    this.wasmModule = null;
    this.renderer = null;
    this.audioDriver = null;
    this.inputHandler = null;
    this.diskManager = null;
    this.windowManager = null;
    this.displaySettings = null;
    this.textSelection = null;
    this.monitorResizer = null;
    this.reminderController = null;
    this.documentationDialog = null;

    this.running = false;
    this.isFullPageMode = false;
    this.autoSaveInterval = null;
    this.autoSaveEnabled = true;
  }

  async init() {
    this.showLoading(true);

    try {
      // Load WASM module - use global function loaded via script tag
      this.wasmModule = await window.createA2EModule();

      // Initialize emulator
      this.wasmModule._init();

      // Set up renderer
      const canvas = document.getElementById("screen");
      this.renderer = new WebGLRenderer(canvas);
      await this.renderer.init();

      // Set up audio driver (drives timing)
      this.audioDriver = new AudioDriver(this.wasmModule);

      // Connect audio-driven frame sync to rendering
      this.audioDriver.onFrameReady = (frameCount) => {
        this.renderFrame();
      };

      // Set up input handler
      this.inputHandler = new InputHandler(this.wasmModule);
      this.inputHandler.init();

      // Set up disk manager
      this.diskManager = new DiskManager(this.wasmModule);
      this.diskManager.init();
      this.diskManager.onDiskLoaded = () => {
        this.reminderController.dismissBasicReminder();
      };

      // Set up debug windows
      this.windowManager = new WindowManager();

      const cpuWindow = new CPUDebuggerWindow(this.wasmModule);
      cpuWindow.create();
      this.windowManager.register(cpuWindow);

      const driveWindow = new DriveDetailWindow(this.wasmModule);
      driveWindow.create();
      this.windowManager.register(driveWindow);

      const switchWindow = new SoftSwitchWindow(this.wasmModule);
      switchWindow.create();
      this.windowManager.register(switchWindow);

      // Set up display settings window (pass renderer for shader control, wasmModule for video settings)
      this.displaySettings = new DisplaySettingsWindow(
        this.renderer,
        this.wasmModule,
      );
      this.displaySettings.create();
      this.windowManager.register(this.displaySettings);

      // Set up new debug windows
      const memBrowserWindow = new MemoryBrowserWindow(this.wasmModule);
      memBrowserWindow.create();
      this.windowManager.register(memBrowserWindow);

      const memHeatMapWindow = new MemoryHeatMapWindow(this.wasmModule);
      memHeatMapWindow.create();
      this.windowManager.register(memHeatMapWindow);

      // Connect heat map to memory browser for click-to-jump
      memHeatMapWindow.setJumpCallback((addr) => {
        memBrowserWindow.jumpToAddress(addr);
        this.windowManager.showWindow("memory-browser");
      });

      const stackWindow = new StackViewerWindow(this.wasmModule);
      stackWindow.create();
      this.windowManager.register(stackWindow);

      const zpWatchWindow = new ZeroPageWatchWindow(this.wasmModule);
      zpWatchWindow.create();
      this.windowManager.register(zpWatchWindow);

      // Load saved window states
      this.windowManager.loadState();

      // Save window states and emulator state when page is closed
      window.addEventListener("beforeunload", () => {
        if (this.windowManager) {
          this.windowManager.saveState();
        }
        // Save emulator state if auto-save is enabled
        if (this.autoSaveEnabled) {
          this.saveState();
        }
      });

      // Also save state when page becomes hidden (tab switch, minimize, mobile)
      // Only if auto-save is enabled
      document.addEventListener("visibilitychange", () => {
        if (document.hidden && this.running && this.autoSaveEnabled) {
          this.saveState();
        }
      });

      // Periodic auto-save while running (every 5 seconds)
      // This ensures state is saved even if beforeunload doesn't complete
      this.autoSaveInterval = setInterval(() => {
        if (this.running && !document.hidden && this.autoSaveEnabled) {
          this.saveState();
        }
      }, 5000);

      // Start with TV static "no signal" since emulator is off
      this.renderer.setNoSignal(true);

      // Set up text selection for copying screen contents
      this.textSelection = new TextSelection(canvas, this.wasmModule);

      // Set up reminder controller
      this.reminderController = new ReminderController();

      // Set up documentation dialog
      this.documentationDialog = new DocumentationDialog();
      this.documentationDialog.init();

      // Set up monitor resizer
      this.monitorResizer = new MonitorResizer({
        aspectRatio: 4 / 3,
        onResize: (width, height) => {
          if (this.renderer) {
            this.renderer.resize(width, height);
          }
          if (this.textSelection) {
            this.textSelection.resize();
          }
          if (this.windowManager) {
            this.windowManager.constrainAllToViewport();
          }
          this.reminderController.repositionAll();
        },
        onResizeComplete: () => {},
      });
      this.monitorResizer.init();

      // Set up UI controls
      this.setupControls();

      // Start render loop
      this.startRenderLoop();

      this.showLoading(false);
      this.reminderController.showPowerReminder(true);
      this.reminderController.showDrivesReminder(true);

      console.log("Apple //e Emulator initialized");
    } catch (error) {
      console.error("Failed to initialize emulator:", error);
      this.showLoading(false);
      alert("Failed to initialize emulator: " + error.message);
    }
  }

  setupControls() {
    const powerBtn = document.getElementById("btn-power");
    const canvas = document.getElementById("screen");

    if (!powerBtn || !canvas) {
      console.error("Required DOM elements not found: btn-power or screen");
      return;
    }

    // Helper to refocus canvas after button clicks
    const refocusCanvas = () => {
      setTimeout(() => canvas.focus(), 0);
    };

    // Power button - simple on/off, no state save/restore
    powerBtn.addEventListener("click", () => {
      this.reminderController.showPowerReminder(false);
      if (this.running) {
        this.stop();
        this.reminderController.showBasicReminder(false);
      } else {
        this.start();
        this.reminderController.showBasicReminder(true);
      }
      refocusCanvas();
    });

    // Warm reset button (preserves memory)
    document.getElementById("btn-warm-reset").addEventListener("click", () => {
      this.wasmModule._warmReset();
      // Dismiss BASIC reminder after a short delay
      setTimeout(() => {
        this.reminderController.dismissBasicReminder();
      }, 2000);
      refocusCanvas();
    });

    // Cold reset button (full restart)
    document.getElementById("btn-cold-reset").addEventListener("click", async () => {
      this.wasmModule._reset();
      // Clear saved state on cold reset so next power-on starts fresh
      await clearStateFromStorage();
      refocusCanvas();
    });

    // Full page mode button
    const fullscreenBtn = document.getElementById("btn-fullscreen");
    const exitFullPageMode = () => {
      document.body.classList.remove("full-page-mode");
      this.isFullPageMode = false;
      refocusCanvas();
    };

    const enterFullPageMode = () => {
      this.windowManager.hideAll();
      document.body.classList.add("full-page-mode");
      this.isFullPageMode = true;
      refocusCanvas();
    };

    fullscreenBtn.addEventListener("click", () => {
      if (this.isFullPageMode) {
        exitFullPageMode();
      } else {
        enterFullPageMode();
      }
    });

    // Exit full page mode on Ctrl+Escape (plain Escape goes to emulator)
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && e.ctrlKey && this.isFullPageMode) {
        e.preventDefault();
        exitFullPageMode();
      }
    });

    // Exit full page mode on click (on the black background area)
    document.querySelector("main").addEventListener("click", (e) => {
      if (this.isFullPageMode && e.target.tagName !== "CANVAS") {
        exitFullPageMode();
      }
    });

    // Disk drives visibility toggle
    const drivesBtn = document.getElementById("btn-drives");
    const drivesContainer = document.querySelector(".disk-drives-container");

    if (!drivesBtn || !drivesContainer) {
      console.warn("Disk drive UI elements not found");
    }

    // Load saved drives visibility setting (default to visible)
    const savedDrivesVisible = localStorage.getItem("a2e-show-drives");
    if (savedDrivesVisible === "false" && drivesBtn && drivesContainer) {
      // Skip animation on initial load
      drivesContainer.classList.add("no-transition");
      drivesContainer.classList.add("collapsed");
      drivesBtn.classList.add("off");
      // Force reflow then remove no-transition class
      drivesContainer.offsetHeight;
      requestAnimationFrame(() => {
        drivesContainer.classList.remove("no-transition");
        this.monitorResizer.handleResize();
      });
    }

    if (drivesBtn && drivesContainer) {
      drivesBtn.addEventListener("click", () => {
        const isCurrentlyCollapsed =
          drivesContainer.classList.contains("collapsed");

        drivesContainer.classList.toggle("collapsed");
        drivesBtn.classList.toggle("off", !isCurrentlyCollapsed);
        localStorage.setItem("a2e-show-drives", isCurrentlyCollapsed);

        // Resize monitor continuously during animation
        const startTime = performance.now();
        const duration = 280; // Slightly longer than CSS transition
        const animateResize = () => {
          this.monitorResizer.handleResize();
          if (performance.now() - startTime < duration) {
            requestAnimationFrame(animateResize);
          }
        };
        requestAnimationFrame(animateResize);

        this.reminderController.dismissDrivesReminder();
        refocusCanvas();
      });
    }

    // State management popup
    this.setupStateManagement(refocusCanvas);

    // Sound popup
    const soundBtn = document.getElementById("btn-sound");
    const soundPopup = document.getElementById("sound-popup");
    const volumeSlider = document.getElementById("volume-slider");
    const volumeValue = document.getElementById("volume-value");
    const muteToggle = document.getElementById("mute-toggle");
    const driveSoundsToggle = document.getElementById("drive-sounds-toggle");

    // Load saved drive sounds setting
    const savedDriveSounds = localStorage.getItem("a2e-drive-sounds");
    const driveSoundsEnabled = savedDriveSounds !== "false";
    driveSoundsToggle.checked = driveSoundsEnabled;
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
    if (volumeSlider) {
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
    muteToggle.checked = this.audioDriver.isMuted();
    muteToggle.addEventListener("change", (e) => {
      if (e.target.checked) {
        this.audioDriver.mute();
      } else {
        this.audioDriver.unmute();
      }
      this.updateSoundButton();
    });

    // Drive sounds toggle
    driveSoundsToggle.addEventListener("change", (e) => {
      const enabled = e.target.checked;
      this.diskManager.setSeekSoundEnabled(enabled);
      this.diskManager.setMotorSoundEnabled(enabled);
      localStorage.setItem("a2e-drive-sounds", enabled);
    });

    // Character set toggle (UK/US)
    const charsetToggle = document.getElementById("charset-toggle");
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
        refocusCanvas();
      });
    }

    // Debug dropdown menu
    const debugMenuContainer = document.querySelector(".debug-menu-container");
    const debugMenuBtn = document.getElementById("btn-debug-menu");
    const debugMenu = document.getElementById("debug-menu");

    if (debugMenuBtn && debugMenu) {
      debugMenuBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        debugMenuContainer.classList.toggle("open");
      });

      debugMenu.querySelectorAll(".debug-menu-item").forEach((item) => {
        item.addEventListener("click", () => {
          const windowType = item.dataset.window;
          const windowMap = {
            cpu: "cpu-debugger",
            drives: "drive-detail",
            switches: "soft-switches",
            memory: "memory-browser",
            heatmap: "memory-heatmap",
            stack: "stack-viewer",
            zeropage: "zeropage-watch",
          };
          if (windowMap[windowType]) {
            this.windowManager.toggleWindow(windowMap[windowType]);
          }
          debugMenuContainer.classList.remove("open");
          refocusCanvas();
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

    // Display settings button
    const displayBtn = document.getElementById("btn-display");
    if (displayBtn) {
      displayBtn.addEventListener("click", () => {
        this.windowManager.toggleWindow("display-settings");
        refocusCanvas();
      });
    }
  }

  updateSoundButton() {
    const soundBtn = document.getElementById("btn-sound");
    const iconUnmuted = soundBtn.querySelector(".icon-unmuted");
    const iconMuted = soundBtn.querySelector(".icon-muted");

    if (this.audioDriver.isMuted()) {
      iconUnmuted.classList.add("hidden");
      iconMuted.classList.remove("hidden");
    } else {
      iconUnmuted.classList.remove("hidden");
      iconMuted.classList.add("hidden");
    }
  }

  updatePowerButton() {
    const powerBtn = document.getElementById("btn-power");
    const powerLed = document.getElementById("monitor-power-led");
    if (this.running) {
      powerBtn.classList.remove("off");
      powerBtn.title = "Power Off";
      powerLed?.classList.add("on");
    } else {
      powerBtn.classList.add("off");
      powerBtn.title = "Power On";
      powerLed?.classList.remove("on");
    }
  }

  setupStateManagement(refocusCanvas) {
    const stateBtn = document.getElementById("btn-state");
    const statePopup = document.getElementById("state-popup");
    const autosaveToggle = document.getElementById("autosave-toggle");
    const saveStateBtn = document.getElementById("btn-save-state");
    const restoreStateBtn = document.getElementById("btn-restore-state");
    const stateStatus = document.getElementById("state-status");
    const lastSavedEl = document.getElementById("state-last-saved");

    if (!stateBtn || !statePopup) return;

    // Load saved auto-save setting (default to enabled)
    const savedAutosave = localStorage.getItem("a2e-autosave-state");
    this.autoSaveEnabled = savedAutosave !== "false";
    if (autosaveToggle) {
      autosaveToggle.checked = this.autoSaveEnabled;
    }
    this.updateStateUI();

    // Toggle popup
    stateBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      statePopup.classList.toggle("hidden");
      if (!statePopup.classList.contains("hidden")) {
        this.updateStateUI();
        this.updateLastSavedTime();
      }
    });

    // Close popup when clicking outside
    document.addEventListener("click", (e) => {
      if (!statePopup.contains(e.target) && e.target !== stateBtn) {
        statePopup.classList.add("hidden");
      }
    });

    // Prevent popup from closing when clicking inside
    statePopup.addEventListener("click", (e) => {
      e.stopPropagation();
    });

    // Auto-save toggle
    if (autosaveToggle) {
      autosaveToggle.addEventListener("change", () => {
        this.autoSaveEnabled = autosaveToggle.checked;
        localStorage.setItem("a2e-autosave-state", this.autoSaveEnabled);
        this.updateStateUI();
      });
    }

    // Save state button
    if (saveStateBtn) {
      saveStateBtn.addEventListener("click", async () => {
        if (!this.running) {
          this.showNotification("Power on the emulator first to save state");
          return;
        }
        await this.saveState();
        this.updateLastSavedTime();
        this.showNotification("State saved");
      });
    }

    // Restore state button
    if (restoreStateBtn) {
      restoreStateBtn.addEventListener("click", async () => {
        const hasState = await hasSavedState();
        if (!hasState) {
          this.showNotification("No saved state to restore");
          return;
        }
        // Restore does a full power cycle, so it works whether running or not
        const restored = await this.restoreState();
        if (restored) {
          this.showNotification("State restored");
          statePopup.classList.add("hidden");
        } else {
          this.showNotification("Failed to restore state");
        }
        refocusCanvas();
      });
    }
  }

  updateStateUI() {
    const stateBtn = document.getElementById("btn-state");
    const stateStatus = document.getElementById("state-status");
    const saveStateBtn = document.getElementById("btn-save-state");

    if (stateBtn) {
      stateBtn.classList.toggle("has-autosave", this.autoSaveEnabled);
    }

    if (stateStatus) {
      if (this.autoSaveEnabled) {
        stateStatus.textContent = "AUTO";
        stateStatus.className = "state-status on";
      } else {
        stateStatus.textContent = "OFF";
        stateStatus.className = "state-status off";
      }
    }

    // Disable save button when auto-save is on (it's already saving automatically)
    if (saveStateBtn) {
      saveStateBtn.disabled = this.autoSaveEnabled;
    }
  }

  async updateLastSavedTime() {
    const lastSavedEl = document.getElementById("state-last-saved");
    if (!lastSavedEl) return;

    const timestamp = await getSavedStateTimestamp();
    if (timestamp) {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);

      let timeStr;
      if (diffMins < 1) {
        timeStr = "just now";
      } else if (diffMins < 60) {
        timeStr = `${diffMins} minute${diffMins === 1 ? "" : "s"} ago`;
      } else if (diffHours < 24) {
        timeStr = `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
      } else {
        timeStr = date.toLocaleDateString();
      }
      lastSavedEl.textContent = `Last saved: ${timeStr}`;
    } else {
      lastSavedEl.textContent = "No saved state";
    }
  }

  showNotification(message) {
    // Create notification element if it doesn't exist
    let notification = document.getElementById("state-notification");
    if (!notification) {
      notification = document.createElement("div");
      notification.id = "state-notification";
      notification.className = "state-notification";
      document.body.appendChild(notification);
    }

    // Set message and show
    notification.textContent = message;
    notification.classList.add("visible");

    // Hide after 3 seconds
    setTimeout(() => {
      notification.classList.remove("visible");
    }, 3000);
  }

  start() {
    if (this.running) return;

    this.wasmModule._reset();
    this.running = true;
    this.renderer.setNoSignal(false);
    this.audioDriver.start();
    this.updatePowerButton();
    console.log("Emulator powered on");
  }

  stop() {
    if (!this.running) return;

    this.running = false;
    this.audioDriver.stop();

    if (this.wasmModule._stopDiskMotor) {
      this.wasmModule._stopDiskMotor();
    }

    this.renderer.setNoSignal(true);
    this.updatePowerButton();
    console.log("Emulator powered off");
  }

  /**
   * Flash the state button to indicate saving
   */
  flashStateButton() {
    const stateBtn = document.getElementById("btn-state");
    if (!stateBtn) return;

    // Add saving class
    stateBtn.classList.add("saving");

    // Remove after animation
    setTimeout(() => {
      stateBtn.classList.remove("saving");
    }, 600);
  }

  /**
   * Save the current emulator state to IndexedDB
   * @returns {Promise<void>}
   */
  async saveState() {
    if (!this.running || !this.wasmModule) {
      return;
    }

    try {
      // Flash state button to indicate saving
      this.flashStateButton();

      // Get size pointer in WASM memory
      const sizePtr = this.wasmModule._malloc(4);
      const statePtr = this.wasmModule._exportState(sizePtr);

      if (statePtr && sizePtr) {
        // Access HEAPU32 fresh each time (typed arrays can be detached on memory growth)
        const heapU32 = new Uint32Array(this.wasmModule.HEAPU8.buffer);
        const size = heapU32[sizePtr / 4];

        if (size > 0) {
          // Copy state data from WASM memory
          const stateData = new Uint8Array(size);
          stateData.set(
            new Uint8Array(this.wasmModule.HEAPU8.buffer, statePtr, size),
          );
          await saveStateToStorage(stateData);
        }
      }

      this.wasmModule._free(sizePtr);
    } catch (error) {
      console.error("Failed to save emulator state:", error);
    }
  }

  /**
   * Restore emulator state from IndexedDB
   * This is equivalent to powering off, powering on, and loading state.
   * @returns {Promise<boolean>} True if state was restored
   */
  async restoreState() {
    if (!this.wasmModule) {
      return false;
    }

    try {
      const stateData = await loadStateFromStorage();
      if (!stateData) {
        return false;
      }

      // Power cycle: stop and restart the emulator for a clean slate
      const wasRunning = this.running;
      if (wasRunning) {
        this.stop();
      }

      // Start fresh (this calls _reset internally)
      this.start();

      // Copy state data to WASM memory
      const statePtr = this.wasmModule._malloc(stateData.length);
      this.wasmModule.HEAPU8.set(stateData, statePtr);

      // Import state (this also calls reset() internally for safety)
      const success = this.wasmModule._importState(statePtr, stateData.length);

      this.wasmModule._free(statePtr);

      if (success) {
        // Hide power reminder since we're now running
        if (this.reminderController) {
          this.reminderController.showPowerReminder(false);
          this.reminderController.showBasicReminder(false);
        }
        // Sync disk manager UI with restored disk state
        if (this.diskManager) {
          this.diskManager.syncWithEmulatorState();
        }
        console.log("Restored emulator state from storage");
        return true;
      } else {
        // If restore failed, stop the emulator
        this.stop();
      }
    } catch (error) {
      console.error("Failed to restore emulator state:", error);
    }

    return false;
  }

  /**
   * Start the emulator and restore saved state if available
   */
  async startWithRestore() {
    if (this.running) return;

    // Check if there's a saved state
    const hasState = await hasSavedState();

    if (hasState) {
      // Initialize without full reset
      this.running = true;
      this.renderer.setNoSignal(false);
      this.audioDriver.start();
      this.updatePowerButton();

      // Try to restore state
      const restored = await this.restoreState();
      if (restored) {
        return;
      }

      // If restore failed, do a normal reset
      this.wasmModule._reset();
    } else {
      // Normal start with reset
      this.start();
    }
  }

  renderFrame() {
    const fbPtr = this.wasmModule._getFramebuffer();
    const fbSize = this.wasmModule._getFramebufferSize();
    const framebuffer = new Uint8Array(
      this.wasmModule.HEAPU8.buffer,
      fbPtr,
      fbSize,
    );

    this.renderer.updateTexture(framebuffer);
    this.renderer.draw();
  }

  startRenderLoop() {
    const render = () => {
      this.windowManager.updateAll(this.wasmModule);
      this.diskManager.updateLEDs();

      if (!this.running) {
        this.renderer.draw();
      }

      requestAnimationFrame(render);
    };

    requestAnimationFrame(render);
  }

  showLoading(show) {
    const loading = document.getElementById("loading");
    if (show) {
      loading.classList.remove("hidden");
    } else {
      loading.classList.add("hidden");
    }
  }

  /**
   * Clean up resources and remove event listeners.
   */
  destroy() {
    if (this.running) {
      this.stop();
    }

    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }

    if (this.monitorResizer) {
      this.monitorResizer.destroy();
      this.monitorResizer = null;
    }

    if (this.textSelection) {
      this.textSelection.destroy();
      this.textSelection = null;
    }

    if (this.windowManager) {
      this.windowManager.saveState();
      this.windowManager = null;
    }

    if (this.audioDriver) {
      this.audioDriver.stop();
      this.audioDriver = null;
    }

    this.renderer = null;
    this.diskManager = null;
    this.inputHandler = null;
    this.reminderController = null;

    console.log("Apple //e Emulator destroyed");
  }
}

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  const emulator = new AppleIIeEmulator();
  emulator.init();

  // Make emulator accessible globally for debugging
  window.a2e = emulator;
});
