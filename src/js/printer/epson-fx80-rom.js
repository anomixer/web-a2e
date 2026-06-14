/*
 * epson-fx80-rom.js - Epson FX-80 character ROM data
 *
 * Format: one byte per dot-column (left to right), bit 0 = top pin.
 *   Roman / Italic: 12 columns × 9 pins (bits 0-8). The FX-80 is a 9-pin head;
 *   proportional widths span 5–12 of the 12 columns (FX Vol 2 Reference App A).
 *
 * Authored in rom-editor.html (printer "Epson FX-80"):
 *   EPSON_FX_ROM         — mode "Roman"   (12×9 USA Roman font, the default).
 *   EPSON_FX_ITALIC_ROM  — mode "Italic"  (12×9 USA Italic font, ESC 4).
 *   EPSON_FX_PROP_ROM    — mode "Roman~"  (proportional 5–12 × 9; authoring
 *                          scaffold — proportional render path is deferred).
 *
 * Until a glyph is transcribed here, EpsonFX80._romChar falls back to the
 * ImageWriter II draft ROM so the printer keeps working while the font is built.
 *
 * Source: Epson FX Printer Manual Vol 2 (Reference), Appendix A.
 */

// USA Roman font — the power-on default. Populate via rom-editor.html → Export.
export const EPSON_FX_ROM = {};
export const EPSON_FX_ROM_LOCALES = {};

// USA Italic font — selected by ESC 4 / Master Select italic bit.
export const EPSON_FX_ITALIC_ROM = {};
export const EPSON_FX_ITALIC_ROM_LOCALES = {};

// Proportional-width bank (authoring scaffold — render path deferred, Phase 6).
export const EPSON_FX_PROP_ROM = {};
