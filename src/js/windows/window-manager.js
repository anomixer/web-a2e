/**
 * WindowManager - Coordinates debug windows and handles persistence
 */
export class WindowManager {
  constructor() {
    this.windows = new Map();
    this.highestZIndex = 1000;
    this.storageKey = 'a2e-debug-windows';
  }

  /**
   * Register a window with the manager
   */
  register(window) {
    this.windows.set(window.id, window);

    // Set up callbacks
    window.onFocus = (id) => this.bringToFront(id);
    window.onStateChange = () => this.saveState();
  }

  /**
   * Get a window by ID
   */
  getWindow(id) {
    return this.windows.get(id);
  }

  /**
   * Show a specific window
   */
  showWindow(id) {
    const window = this.windows.get(id);
    if (window) {
      window.show();
      this.bringToFront(id);
      this.saveState();
    }
  }

  /**
   * Hide a specific window
   */
  hideWindow(id) {
    const window = this.windows.get(id);
    if (window) {
      window.hide();
      this.saveState();
    }
  }

  /**
   * Toggle a window's visibility
   */
  toggleWindow(id) {
    const window = this.windows.get(id);
    if (window) {
      window.toggle();
      if (window.isVisible) {
        this.bringToFront(id);
      }
      this.saveState();
    }
  }

  /**
   * Check if a window is visible
   */
  isWindowVisible(id) {
    const window = this.windows.get(id);
    return window ? window.isVisible : false;
  }

  /**
   * Hide all windows
   */
  hideAll() {
    for (const window of this.windows.values()) {
      window.hide();
    }
    this.saveState();
  }

  /**
   * Bring a window to the front
   */
  bringToFront(id) {
    this.highestZIndex++;
    const window = this.windows.get(id);
    if (window) {
      window.setZIndex(this.highestZIndex);
    }
  }

  /**
   * Save all window states to localStorage
   */
  saveState() {
    try {
      const state = {};
      for (const [id, window] of this.windows) {
        state[id] = window.getState();
      }
      localStorage.setItem(this.storageKey, JSON.stringify(state));
    } catch (e) {
      console.warn('Could not save debug window state:', e);
    }
  }

  /**
   * Load window states from localStorage
   */
  loadState() {
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved) {
        const state = JSON.parse(saved);
        for (const [id, windowState] of Object.entries(state)) {
          const window = this.windows.get(id);
          if (window) {
            window.restoreState(windowState);
          }
        }
      }
    } catch (e) {
      console.warn('Could not load debug window state:', e);
    }
  }

  /**
   * Clear all saved window state (useful for debugging)
   */
  clearState() {
    try {
      localStorage.removeItem(this.storageKey);
      console.log('Debug window state cleared');
    } catch (e) {
      console.warn('Could not clear debug window state:', e);
    }
  }

  /**
   * Update all visible windows
   */
  updateAll(wasmModule) {
    for (const window of this.windows.values()) {
      if (window.isVisible) {
        window.update(wasmModule);
      }
    }
  }

  /**
   * Get IDs of all visible windows
   */
  getVisibleWindowIds() {
    const ids = [];
    for (const [id, window] of this.windows) {
      if (window.isVisible) {
        ids.push(id);
      }
    }
    return ids;
  }

  /**
   * Constrain all windows to the visible viewport
   * Call this on window resize to prevent windows from being off-screen
   */
  constrainAllToViewport() {
    for (const window of this.windows.values()) {
      window.constrainToViewport();
    }
  }
}
