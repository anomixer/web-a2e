/*
 * window-manager.js - Window manager for all windows
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

export class WindowManager {
  constructor() {
    this.windows = new Map();
    this.highestZIndex = 1000;
    this.storageKey = 'a2e-debug-windows';

    // Bind and set up window resize listener to keep windows in viewport
    this.handleWindowResize = this.handleWindowResize.bind(this);
    window.addEventListener('resize', this.handleWindowResize);
  }

  /**
   * Handle browser window resize - constrain all windows to viewport
   */
  handleWindowResize() {
    this.constrainAllToViewport();
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
   * Bring a window to the front.
   * Caps z-index below 2000 so header dropdown menus always render on top.
   */
  bringToFront(id) {
    this.highestZIndex++;
    if (this.highestZIndex >= 1900) {
      this.normalizeZIndices(id);
      return;
    }
    const window = this.windows.get(id);
    if (window) {
      window.setZIndex(this.highestZIndex);
    }
  }

  /**
   * Reassign z-indices starting from 1000, preserving the current stacking order.
   * The window identified by frontId is placed on top.
   */
  normalizeZIndices(frontId) {
    // Collect windows that have a z-index (visible or not) and sort by current z
    const ordered = [...this.windows.entries()]
      .filter(([id]) => id !== frontId)
      .sort((a, b) => (a[1].zIndex || 0) - (b[1].zIndex || 0));

    let z = 1000;
    for (const [, win] of ordered) {
      win.setZIndex(z++);
    }
    const front = this.windows.get(frontId);
    if (front) {
      front.setZIndex(z);
    }
    this.highestZIndex = z;
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

  /**
   * Apply default layout for first-time users (no saved state).
   * Each entry: { id, x, y, width, height, visible, position, viewportLocked }
   * Use position: "viewport-fill" for a window that should fill the viewport.
   */
  applyDefaultLayout(layout) {
    const savedState = localStorage.getItem(this.storageKey);
    if (savedState) {
      try {
        const parsed = JSON.parse(savedState);
        if (parsed && Object.keys(parsed).length > 0) return;
      } catch (e) { /* proceed with defaults */ }
    }

    for (const entry of layout) {
      const win = this.windows.get(entry.id);
      if (!win) continue;

      if (entry.position === 'viewport-fill') {
        const header = document.querySelector('header');
        const footer = document.querySelector('footer');
        const headerH = header ? header.offsetHeight : 0;
        const footerH = footer ? footer.offsetHeight : 0;
        const margin = 8;

        const w = window.innerWidth - margin * 2;
        const h = window.innerHeight - headerH - footerH - margin * 2;
        const x = margin;
        const y = headerH + margin;

        win.element.style.left = `${x}px`;
        win.element.style.top = `${y}px`;
        win.element.style.width = `${w}px`;
        win.element.style.height = `${h}px`;
        win.currentX = x;
        win.currentY = y;
        win.currentWidth = w;
        win.currentHeight = h;
      } else {
        if (entry.x !== undefined) {
          win.element.style.left = `${entry.x}px`;
          win.currentX = entry.x;
        }
        if (entry.y !== undefined) {
          win.element.style.top = `${entry.y}px`;
          win.currentY = entry.y;
        }
        if (entry.width !== undefined) {
          win.element.style.width = `${entry.width}px`;
          win.currentWidth = entry.width;
        }
        if (entry.height !== undefined) {
          win.element.style.height = `${entry.height}px`;
          win.currentHeight = entry.height;
        }
      }

      if (entry.viewportLocked && typeof win.setViewportLocked === 'function') {
        win.setViewportLocked(true);
      }

      if (entry.visible) {
        win.show();
        this.bringToFront(entry.id);
      }
    }
  }

  /**
   * Arrange all visible windows in a grid layout
   */
  arrangeWindows() {
    const visible = [];
    for (const win of this.windows.values()) {
      if (win.isVisible && win.id !== 'screen-window') visible.push(win);
    }
    if (visible.length === 0) return;

    // Get viewport bounds
    const header = document.querySelector('header');
    const footer = document.querySelector('footer');
    const top = header ? header.offsetHeight : 0;
    const footerH = footer ? footer.offsetHeight : 0;
    const availW = window.innerWidth;
    const availH = window.innerHeight - top - footerH;

    // Grid dimensions
    const n = visible.length;
    const cols = Math.ceil(Math.sqrt(n));
    const rows = Math.ceil(n / cols);
    const gap = 8;

    const cellW = availW / cols;
    const cellH = availH / rows;

    visible.forEach((win, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cellLeft = col * cellW;
      const cellTop = top + row * cellH;

      // Keep current size, just center in cell
      const w = win.currentWidth;
      const h = win.currentHeight;
      const x = cellLeft + Math.max(0, (cellW - w) / 2);
      const y = cellTop + Math.max(0, (cellH - h) / 2);

      win.element.style.left = `${x}px`;
      win.element.style.top = `${y}px`;
      win.currentX = x;
      win.currentY = y;
      win.updateEdgeDistances();
    });

    this.saveState();
  }
}
