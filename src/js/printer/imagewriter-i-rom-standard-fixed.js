/*
 * imagewriter-i-rom-standard-fixed.js - ImageWriter I standard FIXED ROM
 *
 * The IW-I's single fixed-pitch print face: 8 columns × 9 wires per glyph
 * (bit 0 = top wire), the documented standard-character matrix (User's Manual
 * Appendix D / E). Companion to imagewriter-i-rom-standard-prop.js (the
 * proportional face selected by ESC p/P).
 *
 * Not yet authored — until a glyph is transcribed here the IW-I model falls
 * back to the IW-II correspondence (fixed) ROM so the printer stays usable
 * while the font is built.
 *
 * Locale overrides replace the alternate-language code points
 * ($23 $40 $5B-$5D $60 $7B-$7E) per DIP / software language switch. The IW-I has
 * no Danish set (Danish arrived with the IW-II), so DK is absent here.
 *
 * Authored in rom-editor.html (printer "ImageWriter I", mode "Fixed",
 * exportBase IW1_STANDARD_FIXED).
 *
 * Source: ImageWriter I User's Manual (Apple), Appendix D/E. See IW1-protocols.md.
 */

// Locale config: which (locale, code) pairs have fixed-face overrides.
export const IW1_STANDARD_FIXED_LOCALE_MAP = [];

// Standard 8×9 character glyphs — populate via rom-editor.html → Export.
export const IW1_STANDARD_FIXED = {};

// Per-locale overrides for the alternate-language code points.
export const IW1_STANDARD_FIXED_LOCALES = {};
