/*
 * state-manager.js - Emulator state serialization and management
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

/**
 * StateManager - Manages emulator state save/restore and UI
 * Handles auto-save, manual save/restore, slot saves, and state popup UI
 */

import {
  saveStateToStorage,
  loadStateFromStorage,
  hasSavedState,
  getSavedStateTimestamp,
  saveStateToSlot,
  loadStateFromSlot,
} from "./state-persistence.js";

// Constants
const AUTO_SAVE_INTERVAL_MS = 5000;
const THUMBNAIL_WIDTH = 140;
const THUMBNAIL_HEIGHT = 96;
const PREVIEW_WIDTH = 560;
const PREVIEW_HEIGHT = 384;

/**
 * @typedef {Object} StateManagerDeps
 * @property {Object} emulator - The emulator instance
 * @property {Object} wasmModule - The WASM module
 * @property {Object} uiController - UI controller for notifications
 * @property {Object} diskManager - Disk manager for state sync
 * @property {Object} reminderController - Reminder controller
 * @property {Object} [cpuDebuggerWindow] - CPU debugger window (for resync after import)
 */

export class StateManager {
  /**
   * @param {StateManagerDeps} deps - Dependencies
   */
  constructor(deps) {
    this.emulator = deps.emulator;
    this.wasmModule = deps.wasmModule;
    this.uiController = deps.uiController;
    this.diskManager = deps.diskManager;
    this.reminderController = deps.reminderController;
    this.cpuDebuggerWindow = deps.cpuDebuggerWindow || null;
    this.basicProgramWindow = deps.basicProgramWindow || null;

    this.autoSaveEnabled = false;
    this.autoSaveInterval = null;

    /** @type {function|null} Called after each autosave completes */
    this.onAutosave = null;
  }

  /**
   * Initialize state management
   */
  init() {
    this.setupAutoSave();
    this.setupStatePopup();
  }

  /**
   * Set up auto-save functionality
   */
  setupAutoSave() {
    // Load saved auto-save setting (default to enabled)
    const savedAutosave = localStorage.getItem("a2e-autosave-state");
    this.autoSaveEnabled = savedAutosave === "true";

    // Save window states and emulator state when page is closed
    window.addEventListener("beforeunload", () => {
      if (this.autoSaveEnabled) {
        this.saveState();
      }
    });

    // Save state when page becomes hidden (tab switch, minimize, mobile)
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && this.emulator.isRunning() && this.autoSaveEnabled) {
        this.saveState();
      }
    });

    // Periodic auto-save while running, deferred to idle time to avoid
    // stalling the audio/render loop (which causes stutters in Safari/Brave)
    this.autoSavePending = false;
    this.autoSaveIdleHandle = null;
    this.autoSaveInterval = setInterval(() => {
      if (this.emulator.isRunning() && !document.hidden && this.autoSaveEnabled && !this.autoSavePending) {
        this.autoSavePending = true;
        const doSave = () => {
          this.autoSavePending = false;
          this.saveState();
        };
        if (typeof requestIdleCallback === "function") {
          this.autoSaveIdleHandle = requestIdleCallback(doSave, { timeout: AUTO_SAVE_INTERVAL_MS });
        } else {
          // Safari <16.4 fallback — setTimeout(0) yields to the render loop
          this.autoSaveIdleHandle = setTimeout(doSave, 0);
        }
      }
    }, AUTO_SAVE_INTERVAL_MS);
  }

  /**
   * Set up state controls within the System menu
   */
  setupStatePopup() {
    const autosaveToggle = document.getElementById("autosave-toggle");

    // Initialize toggle state
    if (autosaveToggle) {
      autosaveToggle.checked = this.autoSaveEnabled;
    }

    // Update last saved time when system menu opens
    const systemMenuContainer = document.getElementById("file-menu-container");
    if (systemMenuContainer) {
      const observer = new MutationObserver(() => {
        if (systemMenuContainer.classList.contains("open")) {
          this.updateLastSavedTime();
        }
      });
      observer.observe(systemMenuContainer, { attributes: true, attributeFilter: ["class"] });
    }

    // Auto-save toggle
    if (autosaveToggle) {
      autosaveToggle.addEventListener("change", () => {
        this.autoSaveEnabled = autosaveToggle.checked;
        localStorage.setItem("a2e-autosave-state", this.autoSaveEnabled);
      });
    }
  }

  /**
   * Update the "last saved" time display
   */
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

  /**
   * Capture current emulator state as a Uint8Array
   * @returns {Uint8Array|null}
   */
  async captureStateData() {
    if (!this.emulator.isRunning() || !this.wasmModule) {
      return null;
    }

    const sizePtr = await this.wasmModule._malloc(4);
    try {
      const statePtr = await this.wasmModule._exportState(sizePtr);

      if (statePtr && sizePtr) {
        const size = await this.wasmModule.heapDataViewU32(sizePtr);

        if (size > 0) {
          const stateData = await this.wasmModule.heapRead(statePtr, size);
          return stateData;
        }
      }
      return null;
    } finally {
      await this.wasmModule._free(sizePtr);
    }
  }

  /**
   * Import raw state data into the emulator (power cycles first)
   * @param {Uint8Array} stateData
   * @returns {boolean} True if state was imported successfully
   */
  async importStateData(stateData) {
    if (!this.wasmModule || !stateData) {
      return false;
    }

    // Power cycle: stop and restart the emulator for a clean slate
    const wasRunning = this.emulator.isRunning();
    if (wasRunning) {
      this.emulator.stop();
    }

    // Start fresh
    this.emulator.start();

    // Copy state data to WASM memory
    const statePtr = await this.wasmModule._malloc(stateData.length);
    await this.wasmModule.heapWrite(statePtr, stateData);

    // Import state
    const success = await this.wasmModule._importState(statePtr, stateData.length);

    await this.wasmModule._free(statePtr);

    if (success) {
      if (this.reminderController) {
        this.reminderController.dismissPowerReminder();
        this.reminderController.showBasicReminder(false);
      }
      if (this.diskManager) {
        this.diskManager.syncWithEmulatorState();
      }
      // Re-push JS-side breakpoints/watchpoints/beam breakpoints to C++
      // since importState() calls reset() which clears them on the WASM side
      if (this.cpuDebuggerWindow) {
        this.cpuDebuggerWindow.bpManager.resyncToWasm();
        this.cpuDebuggerWindow.resyncBeamToWasm();
      }
      // Re-sync BASIC breakpoints
      if (this.basicProgramWindow) {
        this.basicProgramWindow.getBreakpointManager().resyncToWasm();
      }
      return true;
    } else {
      this.emulator.stop();
      return false;
    }
  }

  /**
   * Capture a thumbnail screenshot of the current emulator display
   * @returns {string|null} Data URL of the thumbnail, or null
   */
  captureScreenshot() {
    const canvas = document.getElementById("screen");
    if (!canvas) return null;

    try {
      const offscreen = document.createElement("canvas");
      offscreen.width = THUMBNAIL_WIDTH;
      offscreen.height = THUMBNAIL_HEIGHT;
      const ctx = offscreen.getContext("2d");
      ctx.drawImage(canvas, 0, 0, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT);
      return offscreen.toDataURL("image/jpeg", 0.85);
    } catch (error) {
      console.error("Failed to capture screenshot:", error);
      return null;
    }
  }

  /**
   * Capture a high-resolution preview of the current emulator display
   * @returns {string|null} Data URL of the preview, or null
   */
  capturePreview() {
    const canvas = document.getElementById("screen");
    if (!canvas) return null;

    try {
      const offscreen = document.createElement("canvas");
      offscreen.width = PREVIEW_WIDTH;
      offscreen.height = PREVIEW_HEIGHT;
      const ctx = offscreen.getContext("2d");
      ctx.drawImage(canvas, 0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);
      return offscreen.toDataURL("image/jpeg", 0.85);
    } catch (error) {
      console.error("Failed to capture preview:", error);
      return null;
    }
  }

  /**
   * Save the current emulator state to IndexedDB (auto-save)
   * @returns {Promise<void>}
   */
  async saveState() {
    if (!this.emulator.isRunning() || !this.wasmModule) {
      return;
    }

    try {
      this.uiController.flashStateButton();
      const stateData = await this.captureStateData();
      if (stateData) {
        const thumbnail = this.captureScreenshot();
        const preview = this.capturePreview();
        await saveStateToStorage(stateData, thumbnail, preview);
        if (this.onAutosave) this.onAutosave();
      }
    } catch (error) {
      console.error("Failed to save emulator state:", error);
    }
  }

  /**
   * Restore emulator state from IndexedDB (auto-save)
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

      const success = await this.importStateData(stateData);
      if (success) {
        console.log("Restored emulator state from storage");
        return true;
      }
    } catch (error) {
      console.error("Failed to restore emulator state:", error);
    }

    return false;
  }

  /**
   * Save current state to a numbered slot with screenshot
   * @param {number} slotNumber - Slot number (1-5)
   * @returns {Promise<boolean>}
   */
  async saveToSlot(slotNumber) {
    const stateData = await this.captureStateData();
    if (!stateData) return false;

    const thumbnail = this.captureScreenshot();
    const preview = this.capturePreview();
    await saveStateToSlot(slotNumber, stateData, thumbnail, preview);
    return true;
  }

  /**
   * Restore state from a numbered slot
   * @param {number} slotNumber - Slot number (1-5)
   * @returns {Promise<boolean>}
   */
  async restoreFromSlot(slotNumber) {
    const slot = await loadStateFromSlot(slotNumber);
    if (!slot) return false;

    return await this.importStateData(slot.data);
  }

  /**
   * Restore state from raw file data (e.g. uploaded .a2state file)
   * @param {Uint8Array} stateData
   * @returns {boolean}
   */
  async restoreFromFileData(stateData) {
    return await this.importStateData(stateData);
  }

  /**
   * Check if there's a saved state available
   * @returns {Promise<boolean>}
   */
  async hasSavedState() {
    return hasSavedState();
  }

  /**
   * Check if auto-save is enabled
   * @returns {boolean}
   */
  isAutoSaveEnabled() {
    return this.autoSaveEnabled;
  }

  /**
   * Clean up resources
   */
  destroy() {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }
  }
}
