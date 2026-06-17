/*
 * print-utils.js - Shared browser-print helpers for the printer windows
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 *  Shawn Bullock <shawn@agenticexpert.ai>
 */

// Print HTML through a throwaway hidden iframe instead of a popup tab (no
// visible window, and popup blockers never fire). The iframe holds a whole
// document — and, for the dot-matrix path, a base64 PNG per page — so it MUST
// be torn down or it leaks. onafterprint removes it when the dialog closes;
// a fallback timer covers browsers that never fire it, and the `done` guard
// makes cleanup idempotent regardless of which path wins the race.
export function printViaIframe(html) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  // Off-screen but at a real rendered size: a 0x0 or visibility:hidden frame
  // prints blank in some engines. `srcdoc` (vs document.write) fires a proper
  // load event AFTER the page images decode, so the dot-matrix preview isn't
  // captured blank.
  frame.style.cssText =
    "position:fixed;left:-10000px;top:0;width:8.5in;height:11in;border:0;";
  frame.srcdoc = html;
  document.body.appendChild(frame);

  let done = false;
  const cleanup = () => {
    if (done) return;
    done = true;
    frame.remove();            // detach node → its doc + PNG data URLs become GC-able
  };

  frame.addEventListener("load", () => {
    const fwin = frame.contentWindow;
    fwin.onafterprint = cleanup;                // primary: print dialog dismissed
    try { fwin.focus(); fwin.print(); }
    catch (_) { cleanup(); return; }            // print threw → don't leak the frame
    setTimeout(cleanup, 60000);                 // fallback if onafterprint never fires
  }, { once: true });
}

// Print one or more page images full-bleed, one sheet each, at an exact paper
// size (inches) — so the output keeps the printer's true dimensions and aspect.
// This is the dot-matrix PDF layout shared by the printer window (whole run) and
// the Print Browser (a single page or a whole job).
export function printPagesViaIframe(dataUrls, wIn, hIn) {
  const body = dataUrls.map((src) => `<img class="page" src="${src}"/>`).join("");
  printViaIframe(
    `<!DOCTYPE html><html><head><title>Printer Output</title><style>` +
    `@page { size: ${wIn}in ${hIn}in; margin: 0; }` +
    `html,body { margin:0; padding:0; background:#fff; }` +
    // full bleed: image fills the whole page, one page per image
    `img.page { display:block; width:${wIn}in; height:${hIn}in; page-break-after: always; }` +
    `img.page:last-child { page-break-after: auto; }` +
    `</style></head><body>${body}</body></html>`
  );
}

// Convenience: print a single page image full-bleed at an exact paper size.
export function printImageViaIframe(dataUrl, wIn, hIn) {
  printPagesViaIframe([dataUrl], wIn, hIn);
}
