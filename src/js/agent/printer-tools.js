/*
 * printer-tools.js - Printer window agent tools
 *
 * Drives the Printer output window (dot-matrix ImageWriter / Epson): power,
 * open/close, clear paper, line/form feed, online state, model + ribbon + paper
 * select, a combined setup tool, status, and a PNG capture of the printed paper.
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 *  Shawn Bullock <shawn@agenticexpert.ai>
 */

import { PRINTER_MODELS, RIBBONS } from "../printer/printer-manager.js";

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
   * Power the printer on/off (mains switch). Parameters: { on: boolean }.
   * Off ignores incoming bytes and forces the panel offline; printed paper is
   * preserved. On brings it back online.
   */
  printerSetPower: async (params = {}) => {
    const { on } = params;
    if (typeof on !== "boolean") {
      throw new Error("on parameter (boolean) is required");
    }
    const state = getPrinterWindow().setPower(on);
    return { success: true, power: state, message: `Printer powered ${state ? "on" : "off"}` };
  },

  /**
   * Swap the ribbon cartridge. Parameters: { ribbon: "bw" | "color" }.
   * Future ink lands in the new colour; ink already on the paper is unchanged.
   */
  printerSetRibbon: async (params = {}) => {
    const { ribbon } = params;
    if (!ribbon) throw new Error("ribbon parameter is required");
    if (!RIBBONS.some((r) => r.id === ribbon)) {
      throw new Error(`Unknown ribbon: ${ribbon} (use ${RIBBONS.map((r) => r.id).join(", ")})`);
    }
    const state = getPrinterWindow().setRibbon(ribbon);
    return { success: true, ribbon: state, message: `Ribbon set to ${state}` };
  },

  /**
   * Advance/reverse the paper one or more lines. Parameters:
   *   { direction: "up" | "down" (default "down"), count: number (default 1) }.
   */
  printerLineFeed: async (params = {}) => {
    const direction = params.direction ?? "down";
    if (!["up", "down"].includes(direction)) {
      throw new Error('direction must be "up" or "down"');
    }
    const count = Math.max(1, Math.floor(params.count ?? 1));
    const pw = getPrinterWindow();
    for (let i = 0; i < count; i++) pw.feed(direction);
    return { success: true, direction, count, message: `Line feed ${direction} ×${count}` };
  },

  /**
   * Form feed: advance the paper to the next top-of-form.
   */
  printerFormFeed: async () => {
    getPrinterWindow().feed("ff");
    return { success: true, message: "Form feed" };
  },

  /**
   * Configure the printer in one call and return the full setup. All fields
   * optional — any supplied are applied, then current state + valid options are
   * returned. Parameters:
   *   { power?, online?: boolean, model?, ribbon?, pageSize?: string }.
   * Call with no parameters to just read the available options + current state.
   */
  printerSetup: async (params = {}) => {
    const pw = getPrinterWindow();
    const applied = {};
    if (typeof params.power === "boolean")  { pw.setPower(params.power);   applied.power = params.power; }
    if (params.model)                       { if (!pw.setModel(params.model))        throw new Error(`Unknown printer model: ${params.model}`); applied.model = params.model; }
    if (params.ribbon)                      { pw.setRibbon(params.ribbon);  applied.ribbon = params.ribbon; }
    if (params.pageSize)                    { if (!pw.setPageSize(params.pageSize))  throw new Error(`Unknown form length: ${params.pageSize}`); applied.pageSize = params.pageSize; }
    if (typeof params.online === "boolean") { pw.setOnline(params.online);  applied.online = params.online; }

    const state   = pw.getState();
    const printer = window.emulator?.printerManager?.getActivePrinter?.();
    const pageSizes = printer?.constructor?.PAGE_SIZES ?? [];
    return {
      success: true,
      applied,
      state,
      options: {
        models:  PRINTER_MODELS.map((m) => ({ id: m.id, name: m.name })),
        ribbons: RIBBONS.map((r) => ({ id: r.id, name: r.name })),
        pageSizes: pageSizes.map((p) => ({ id: p.id, name: p.name })),
      },
      message: "Printer setup",
    };
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
   * Select the form length. The ImageWriter II is continuous-feed with a fixed
   * 8" printable width, so this sets form length only — not a paper size.
   * Parameters: { size: "form11" | "form12" | "legal" | "a4" }.
   */
  printerSetPageSize: async (params = {}) => {
    const { size } = params;
    if (!size) throw new Error("size parameter is required");
    const ok = getPrinterWindow().setPageSize(size);
    if (!ok) throw new Error(`Unknown or unsupported form length: ${size}`);
    return { success: true, size, message: `Form length set to ${size}` };
  },

  /**
   * Dump the current //e screen to the printer as an ImageWriter II bit-image
   * graphics stream (the classic "screen dump"). Works for whatever is on
   * screen — HGR, DHGR, LORES, or text. Requires an ImageWriter model active.
   * Optional { threshold } (0-255) tunes which pixels count as ink.
   */
  printerDumpScreen: async (params = {}) => {
    const opts = {};
    if (typeof params.threshold === "number") opts.threshold = params.threshold;
    const result = getPrinterWindow().dumpScreen(null, undefined, undefined, opts);
    if (!result.success) throw new Error(result.message);
    return result;
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
