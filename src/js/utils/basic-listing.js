/*
 * basic-listing.js - Parse the core's formatted Applesoft listing
 *
 * a2e::BasicDetokenizer is the single Applesoft detokenizer. It returns a whole
 * program as formatted text: one line per program line, each a right-aligned
 * line number, a single separator space, then FOR/NEXT indentation and the
 * statement text.
 *
 * Both the agent tools and the BASIC debugger window need that text split back
 * into records, so the split lives here rather than being written twice.
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

// Right-aligned line number, exactly one separator space, then the rest of the
// line. Only that one space is consumed, so indentation stays part of the text
// and the listing reads the way the core formatted it.
const LISTING_LINE = /^\s*(\d+) (.*)$/;

/**
 * Split a formatted listing into per-line records.
 *
 * Lines that do not start with a line number are skipped rather than throwing:
 * the detokenizer truncates at its output limit, which can leave a partial
 * final line, and a debugger view should still show everything before it.
 *
 * @param {string} listing  Output of _detokenizeApplesoft
 * @returns {Array<{lineNumber: number, text: string}>}
 */
export function parseBasicListing(listing) {
  if (!listing) return [];

  const lines = [];
  for (const raw of listing.split("\n")) {
    const match = raw.match(LISTING_LINE);
    if (!match) continue;
    lines.push({ lineNumber: parseInt(match[1], 10), text: match[2] });
  }
  return lines;
}

/**
 * Same split, keyed by line number.
 *
 * Callers that pair the text with their own structural walk of program memory
 * use this: matching on line number means a disagreement about where the
 * program ends cannot silently shift every line's text by one.
 *
 * @param {string} listing
 * @returns {Map<number, string>}
 */
export function indexBasicListing(listing) {
  const byLine = new Map();
  for (const { lineNumber, text } of parseBasicListing(listing)) {
    byLine.set(lineNumber, text);
  }
  return byLine;
}
