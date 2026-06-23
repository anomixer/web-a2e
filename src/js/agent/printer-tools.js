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
import { getAllPages } from "../printer/printer-page-store.js";
import { setPrinterStrike, getPrinterStrike, setPrinterSS, getPrinterSS } from "../printer/printer-window.js";

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

function getPrinterManager() {
  const pm = window.emulator?.printerManager;
  if (!pm) throw new Error("Printer manager not available");
  return pm;
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
   * Inject a raw byte stream straight into the active virtual printer,
   * bypassing the Apple-side PR#/CSW redirect. Useful for testing glyph
   * rendering and printer control codes directly. The bytes go through the
   * head model and scheduler exactly like host-sent output. Parameters:
   *   { bytes?: number[], text?: string }.
   *   bytes — array of integers; each is clamped to 0-255, non-finite ignored.
   *   text  — convenience: each char sent as (charCodeAt(i) & 0xFF).
   * If both are given, bytes wins. At least one is required.
   */
  printerSendBytes: async (params = {}) => {
    let byteArray;
    if (Array.isArray(params.bytes)) {
      byteArray = params.bytes
        .filter((b) => Number.isFinite(b))
        .map((b) => Math.max(0, Math.min(255, Math.round(b))));
    } else if (typeof params.text === "string") {
      byteArray = Array.from(params.text, (ch) => ch.charCodeAt(0) & 0xff);
    } else {
      throw new Error("bytes (number[]) or text (string) is required");
    }
    getPrinterManager().feedBytes(byteArray);
    return { success: true, count: byteArray.length, message: `Sent ${byteArray.length} byte(s) to printer` };
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
   * Parameters:
   *   { threshold } (0-255) — B/W ribbon: pixels at/above this count as ink.
   *   { invert }            — greyscale polarity (colour ribbon only):
   *       false → WYSIWYG: screen black = black ink, screen white = bare paper.
   *       true  → inverted: screen black = bare paper, screen white = black ink
   *               (the classic "white-is-black" dump for sparse/light screens).
   *       omitted → auto-pick by lit density (sparse screens invert).
   * The colour dump manages the Auto-LF DIP itself for the duration of the pass.
   */
  printerDumpScreen: async (params = {}) => {
    const opts = {};
    if (typeof params.threshold === "number") opts.threshold = params.threshold;
    if (typeof params.invert === "boolean") opts.invert = params.invert;
    const result = getPrinterWindow().dumpScreen(null, undefined, undefined, opts);
    if (!result.success) throw new Error(result.message);
    return result;
  },

  /**
   * Flip the Automatic Line Feed DIP (SW2-1). Parameters: { on: boolean }.
   *   ON  — a CR also advances the paper one line (plain text / Applesoft, which
   *         emits CR only); a trailing LF is coalesced.
   *   OFF — a CR returns the head WITHOUT feeding, so colour graphics overprint
   *         passes register on the same band (DazzleDraw, Print Shop colour).
   */
  printerSetAutoLineFeed: async (params = {}) => {
    const { on } = params;
    if (typeof on !== "boolean") {
      throw new Error("on parameter (boolean) is required");
    }
    const state = getPrinterWindow().setAutoLineFeed(on);
    return { success: true, autoLineFeed: state, message: `Auto Line Feed ${state ? "on" : "off"}` };
  },

  /**
   * Return current printer/paper status (model, online, ribbon, paper height).
   */
  printerGetState: async () => {
    return { success: true, ...getPrinterWindow().getState() };
  },

  /**
   * Tune the dot STRIKE live (no reload). The strike is the per-dot ink mark on
   * native text glyphs. Parameters (all optional — omit to just read state):
   *   { round?: boolean, diaPx?: number }.
   *   round — round fixed-size pin dot (true) vs square footprint (false).
   *   diaPx — pin dot DIAMETER in canvas px (0.5–6), fixed across all densities.
   * Persists to localStorage. Re-print the paper to see the change.
   */
  printerStrike: async (params = {}) => {
    const strike = setPrinterStrike(params);
    return { success: true, strike, message: `Strike: round=${strike.round} diaPx=${strike.diaPx}` };
  },

  /**
   * Set the paper-canvas supersample factor (1–4). The dot raster is ~120 px/inch;
   * at 1:1 a pin dot is too small to hold a solid core, so canvas anti-aliases it
   * to grey. Rendering the backing store at SS× density (then CSS-downscaling)
   * gives dots a real black core + clean round edge. Persists to localStorage and
   * rebuilds the live canvas immediately (content is wiped — re-print after).
   * Param: { ss }.
   */
  printerSuper: async (params = {}) => {
    const ss = setPrinterSS(params.ss);
    return { success: true, ss, message: `Supersample: ${ss}× (re-print to populate)` };
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

  /**
   * Set the paper dimensions to any arbitrary size in 1/4-inch increments.
   * The active printer model enforces its own min/max bounds and returns the
   * actual committed value, which may differ from the requested value.
   * Omit either field to leave that dimension unchanged.
   * Parameters: { widthInch?: number, lengthInch?: number }.
   */
  printerSetPaperDimensions: async (params = {}) => {
    const pw = getPrinterWindow();
    const result = {};
    if (params.widthInch !== undefined) {
      const quantized = Math.round(params.widthInch * 4) / 4;
      result.widthInch = pw.setPaperWidth(quantized);
    }
    if (params.lengthInch !== undefined) {
      const quantized = Math.round(params.lengthInch * 4) / 4;
      result.lengthInch = pw.setPaperLength(quantized);
    }
    if (!Object.keys(result).length) throw new Error("widthInch or lengthInch (or both) is required");
    return { success: true, ...result, message: `Paper dimensions set: ${JSON.stringify(result)}` };
  },

  /**
   * List all stored print jobs (from the browser's print history).
   * Returns a summary array grouped by job — no PNG data, just metadata.
   * Each entry: { jobId, pageCount, model, ribbon, formInches, paperWidthInch, savedAt }.
   */
  printerListHistory: async () => {
    const pages = await getAllPages();
    const jobMap = new Map();
    pages.forEach((p) => {
      if (!jobMap.has(p.jobId)) {
        jobMap.set(p.jobId, {
          jobId:          p.jobId,
          pageCount:      0,
          model:          p.model,
          ribbon:         p.ribbon,
          formInches:     p.formInches,
          paperWidthInch: p.paperWidthInch,
          savedAt:        p.savedAt,
        });
      }
      jobMap.get(p.jobId).pageCount++;
    });
    const jobs = [...jobMap.values()];
    return { success: true, jobs, message: `${jobs.length} print job(s) in history` };
  },

  /**
   * Retrieve a single printed page as a base64 PNG (no data: URI prefix) so
   * it can be passed to save_to or inspected directly.
   * Parameters: { jobId: number, pageIndex: number (0-based) }.
   */
  printerGetPage: async (params = {}) => {
    const { jobId, pageIndex } = params;
    if (jobId === undefined)    throw new Error("jobId is required");
    if (pageIndex === undefined) throw new Error("pageIndex is required");
    const pages = await getAllPages();
    const record = pages.find((p) => p.jobId === jobId && p.pageIndex === pageIndex);
    if (!record) throw new Error(`Page not found: job ${jobId}, page ${pageIndex}`);
    const base64 = record.pngDataUrl.replace(/^data:image\/png;base64,/, "");
    return {
      success: true,
      imageBase64: base64,
      jobId:          record.jobId,
      pageIndex:      record.pageIndex,
      model:          record.model,
      ribbon:         record.ribbon,
      formInches:     record.formInches,
      paperWidthInch: record.paperWidthInch,
      savedAt:        record.savedAt,
      message:        `Job ${jobId} page ${pageIndex} retrieved`,
    };
  },

  /**
   * Re-preview a stored print job on the virtual printer paper — the same
   * operation as the Print Browser's "Re-preview" button. Loads all pages of
   * the job back onto the paper canvas at their original paper size.
   * Parameters: { jobId: number }.
   */
  printerReloadJob: async (params = {}) => {
    const { jobId } = params;
    if (jobId === undefined) throw new Error("jobId is required");
    const pages = await getAllPages();
    const jobPages = pages
      .filter((p) => p.jobId === jobId)
      .sort((a, b) => a.pageIndex - b.pageIndex);
    if (!jobPages.length) throw new Error(`No pages found for job ${jobId}`);
    getPrinterWindow().loadJobToPaper({ pages: jobPages });
    return { success: true, jobId, pageCount: jobPages.length, message: `Job ${jobId} reloaded (${jobPages.length} page(s))` };
  },
};
