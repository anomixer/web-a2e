/*
 * printer-tools.js - Printer window agent tools
 *
 * Drives the Printer output window (dot-matrix ImageWriter / Epson): open/close,
 * clear paper, line/form feed, online state, model select, status, and a PNG
 * capture of the printed paper.
 *
 * Written by
 *  Shawn Bullock <shawn@agenticexpert.ai>
 */

function getPrinterWindow() {
  const pw = window.emulator?.printerWindow;
  if (!pw) throw new Error("Printer window not available");
  return pw;
}

function getWindowManager() {
  const wm = window.emulator?.windowManager;
  if (!wm) throw new Error("Window manager not available");
  return wm;
}

const PRINTER_WINDOW_ID = "printer-output";

export const printerTools = {
  /**
   * Open (show + focus) the Printer window.
   */
  printerOpen: async () => {
    const wm = getWindowManager();
    wm.showWindow(PRINTER_WINDOW_ID);
    wm.bringToFront(PRINTER_WINDOW_ID);
    return { success: true, message: "Printer window opened" };
  },

  /**
   * Hide the Printer window. Output still captures in the background.
   */
  printerClose: async () => {
    getWindowManager().hideWindow(PRINTER_WINDOW_ID);
    return { success: true, message: "Printer window hidden" };
  },

  /**
   * Clear the paper: resets glyph state and the canvas/text buffer.
   */
  printerClear: async () => {
    getPrinterWindow().clearPaper();
    return { success: true, message: "Printer paper cleared" };
  },

  /**
   * Panel feed. Parameters: { kind: "up" | "down" | "ff" } (default "ff").
   *   up/down = one line; ff = form feed to the next top-of-form.
   */
  printerFeed: async (params = {}) => {
    const kind = params.kind ?? "ff";
    if (!["up", "down", "ff"].includes(kind)) {
      throw new Error('kind must be "up", "down", or "ff"');
    }
    getPrinterWindow().feed(kind);
    return { success: true, kind, message: `Printer feed: ${kind}` };
  },

  /**
   * Set the printer online/offline. Parameters: { online: boolean }.
   */
  printerSetOnline: async (params = {}) => {
    const { online } = params;
    if (typeof online !== "boolean") {
      throw new Error("online parameter (boolean) is required");
    }
    const state = getPrinterWindow().setOnline(online);
    return { success: true, online: state, message: `Printer ${state ? "online" : "offline"}` };
  },

  /**
   * Select the active printer model.
   * Parameters: { model: "imagewriter-ii" | "imagewriter-i" | "epson-fx80" }.
   */
  printerSetModel: async (params = {}) => {
    const { model } = params;
    if (!model) throw new Error("model parameter is required");
    const ok = getPrinterWindow().setModel(model);
    if (!ok) throw new Error(`Unknown printer model: ${model}`);
    return { success: true, model, message: `Printer model set to ${model}` };
  },

  /**
   * Return current printer/paper status (model, online, ribbon, paper height).
   */
  printerGetState: async () => {
    return { success: true, ...getPrinterWindow().getState() };
  },

  /**
   * Capture the printed paper as a PNG.
   * Returns { imageBase64, width, height } — base64 has no data: URI prefix.
   */
  printerCapturePaper: async () => {
    const { imageBase64, width, height } = getPrinterWindow().capturePaper();
    return {
      success: true,
      imageBase64,
      width,
      height,
      message: `Printer paper captured as ${width}x${height} PNG`,
    };
  },
};
