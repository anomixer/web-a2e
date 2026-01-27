/**
 * StateManager - Manages emulator state save/restore and UI
 * Handles auto-save, manual save/restore, and state popup UI
 */

import {
  saveStateToStorage,
  loadStateFromStorage,
  hasSavedState,
  getSavedStateTimestamp,
} from "./state-persistence.js";

// Constants
const AUTO_SAVE_INTERVAL_MS = 5000;

/**
 * @typedef {Object} StateManagerDeps
 * @property {Object} emulator - The emulator instance
 * @property {Object} wasmModule - The WASM module
 * @property {Object} uiController - UI controller for notifications
 * @property {Object} diskManager - Disk manager for state sync
 * @property {Object} reminderController - Reminder controller
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

    this.autoSaveEnabled = true;
    this.autoSaveInterval = null;
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
    this.autoSaveEnabled = savedAutosave !== "false";

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

    // Periodic auto-save while running
    this.autoSaveInterval = setInterval(() => {
      if (this.emulator.isRunning() && !document.hidden && this.autoSaveEnabled) {
        this.saveState();
      }
    }, AUTO_SAVE_INTERVAL_MS);
  }

  /**
   * Set up state popup UI
   */
  setupStatePopup() {
    const stateBtn = document.getElementById("btn-state");
    const statePopup = document.getElementById("state-popup");
    const autosaveToggle = document.getElementById("autosave-toggle");
    const saveStateBtn = document.getElementById("btn-save-state");
    const restoreStateBtn = document.getElementById("btn-restore-state");

    if (!stateBtn || !statePopup) return;

    // Initialize toggle state
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
        if (!this.emulator.isRunning()) {
          this.uiController.showNotification("Power on the emulator first to save state");
          return;
        }
        await this.saveState();
        this.updateLastSavedTime();
        this.uiController.showNotification("State saved");
      });
    }

    // Restore state button
    if (restoreStateBtn) {
      restoreStateBtn.addEventListener("click", async () => {
        const hasState = await hasSavedState();
        if (!hasState) {
          this.uiController.showNotification("No saved state to restore");
          return;
        }
        const restored = await this.restoreState();
        if (restored) {
          this.uiController.showNotification("State restored");
          statePopup.classList.add("hidden");
        } else {
          this.uiController.showNotification("Failed to restore state");
        }
        this.uiController.refocusCanvas();
      });
    }
  }

  /**
   * Update state popup UI elements
   */
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

    // Disable save button when auto-save is on
    if (saveStateBtn) {
      saveStateBtn.disabled = this.autoSaveEnabled;
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
   * Save the current emulator state to IndexedDB
   * @returns {Promise<void>}
   */
  async saveState() {
    if (!this.emulator.isRunning() || !this.wasmModule) {
      return;
    }

    try {
      this.uiController.flashStateButton();

      const sizePtr = this.wasmModule._malloc(4);
      const statePtr = this.wasmModule._exportState(sizePtr);

      if (statePtr && sizePtr) {
        const heapU32 = new Uint32Array(this.wasmModule.HEAPU8.buffer);
        const size = heapU32[sizePtr / 4];

        if (size > 0) {
          const stateData = new Uint8Array(size);
          stateData.set(
            new Uint8Array(this.wasmModule.HEAPU8.buffer, statePtr, size)
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
      const wasRunning = this.emulator.isRunning();
      if (wasRunning) {
        this.emulator.stop();
      }

      // Start fresh
      this.emulator.start();

      // Copy state data to WASM memory
      const statePtr = this.wasmModule._malloc(stateData.length);
      this.wasmModule.HEAPU8.set(stateData, statePtr);

      // Import state
      const success = this.wasmModule._importState(statePtr, stateData.length);

      this.wasmModule._free(statePtr);

      if (success) {
        if (this.reminderController) {
          this.reminderController.dismissPowerReminder();
          this.reminderController.showBasicReminder(false);
        }
        if (this.diskManager) {
          this.diskManager.syncWithEmulatorState();
        }
        console.log("Restored emulator state from storage");
        return true;
      } else {
        this.emulator.stop();
      }
    } catch (error) {
      console.error("Failed to restore emulator state:", error);
    }

    return false;
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
