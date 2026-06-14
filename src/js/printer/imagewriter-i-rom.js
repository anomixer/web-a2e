/*
 * imagewriter-i-rom.js - Apple ImageWriter I character ROM data
 *
 * Format: one byte per dot-column (left to right), bit 0 = top wire.
 *   Standard characters: 7 columns × 8 wires (bits 0-7) — the IW-I's documented
 *   standard-character matrix (User's Manual Appendix D / E).
 *
 * Authored in rom-editor.html (printer "ImageWriter I", mode "Std"). Until a
 * glyph is transcribed here, ImageWriterI.getCorrChar falls back to the IW-II
 * correspondence ROM so the printer keeps working while the IW-I font is built.
 *
 * IW1_CUSTOM_ROM holds the proportional 1–16 × 8 downloadable-character bank
 * authored in the editor (mode "Custom"). It is authoring scaffolding only —
 * runtime downloaded glyphs arrive from the host via ESC commands, not this ROM —
 * and is exported here so the editor has a home for the data.
 *
 * Source: ImageWriter I User's Manual (Apple), Appendix D/E. See IW1-protocols.md.
 */

// Locale config: which (locale, code) pairs have overrides
export const IW1_ROM_LOCALE_MAP = [];

// Standard 7×8 character glyphs — populate via rom-editor.html → Export.
export const IW1_ROM = {};

// Per-locale overrides for the alternate-language code points.
export const IW1_ROM_LOCALES = {};

// Proportional downloadable-character bank (authoring scaffold — see header).
export const IW1_CUSTOM_ROM = {};
