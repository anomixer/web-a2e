/*
 * window-tools.js - Window management tools
 *
 * Written by
 *  Shawn Bullock <shawn@agenticexpert.ai>
 */

export const windowTools = {
  /**
   * Show or focus a window
   */
  showWindow: async (args) => {
    const { windowId } = args;

    if (!windowId) {
      throw new Error("windowId parameter is required");
    }

    const windowManager = window.emulator?.windowManager;
    if (!windowManager) {
      throw new Error("Window manager not available");
    }

    windowManager.showWindow(windowId);

    return {
      success: true,
      windowId: windowId,
      message: `Window '${windowId}' is now visible`,
    };
  },

  /**
   * Hide a window
   */
  hideWindow: async (args) => {
    const { windowId } = args;

    if (!windowId) {
      throw new Error("windowId parameter is required");
    }

    const windowManager = window.emulator?.windowManager;
    if (!windowManager) {
      throw new Error("Window manager not available");
    }

    windowManager.hideWindow(windowId);

    return {
      success: true,
      windowId: windowId,
      message: `Window '${windowId}' is now hidden`,
    };
  },

  /**
   * Focus a window (bring to front)
   */
  focusWindow: async (args) => {
    const { windowId } = args;

    if (!windowId) {
      throw new Error("windowId parameter is required");
    }

    const windowManager = window.emulator?.windowManager;
    if (!windowManager) {
      throw new Error("Window manager not available");
    }

    windowManager.bringToFront(windowId);

    return {
      success: true,
      windowId: windowId,
      message: `Window '${windowId}' is now focused`,
    };
  },
};
