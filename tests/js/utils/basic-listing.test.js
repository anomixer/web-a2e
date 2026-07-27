/*
 * basic-listing.test.js - Tests for parsing the core's Applesoft listing
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { describe, it, expect } from "vitest";
import { parseBasicListing, indexBasicListing } from "../../../src/js/utils/basic-listing.js";

// The core right-aligns line numbers in a 5-wide field, then one separator
// space, then three spaces of indent per FOR nesting level.
const pad = (n) => String(n).padStart(5, " ");
const line = (n, text, indent = 0) => `${pad(n)} ${" ".repeat(indent * 3)}${text}`;

describe("parseBasicListing", () => {
  it("splits a simple listing into records", () => {
    const listing = [line(10, 'PRINT "HELLO"'), line(20, "END")].join("\n");

    expect(parseBasicListing(listing)).toEqual([
      { lineNumber: 10, text: 'PRINT "HELLO"' },
      { lineNumber: 20, text: "END" },
    ]);
  });

  it("strips only the single separator space, preserving indentation", () => {
    const listing = [
      line(10, "FOR I = 1 TO 10"),
      line(20, 'PRINT I', 1),
      line(30, "NEXT I"),
    ].join("\n");

    const parsed = parseBasicListing(listing);
    expect(parsed[1]).toEqual({ lineNumber: 20, text: "   PRINT I" });
  });

  it("handles wide line numbers that fill or exceed the padding field", () => {
    // 63999 is the Applesoft maximum and exactly fills the 5-wide field, so
    // there is no leading whitespace to absorb.
    const listing = [line(1, "END"), line(63999, "END")].join("\n");

    expect(parseBasicListing(listing)).toEqual([
      { lineNumber: 1, text: "END" },
      { lineNumber: 63999, text: "END" },
    ]);
  });

  it("keeps text that itself contains digits and spaces", () => {
    const listing = line(10, 'PRINT "10  20": REM  SPACED');
    expect(parseBasicListing(listing)).toEqual([
      { lineNumber: 10, text: 'PRINT "10  20": REM  SPACED' },
    ]);
  });

  it("allows an empty statement body", () => {
    expect(parseBasicListing(`${pad(10)} `)).toEqual([{ lineNumber: 10, text: "" }]);
  });

  it("skips a trailing partial line rather than throwing", () => {
    // The detokenizer truncates at its output limit, which can leave a final
    // line with no line number. Everything before it should still parse.
    const listing = [line(10, "END"), "  PARTIAL"].join("\n");
    expect(parseBasicListing(listing)).toEqual([{ lineNumber: 10, text: "END" }]);
  });

  it("returns an empty array for empty, null and undefined input", () => {
    expect(parseBasicListing("")).toEqual([]);
    expect(parseBasicListing(null)).toEqual([]);
    expect(parseBasicListing(undefined)).toEqual([]);
  });
});

describe("indexBasicListing", () => {
  it("keys the same records by line number", () => {
    const listing = [line(10, "HOME"), line(20, "END")].join("\n");
    const byLine = indexBasicListing(listing);

    expect(byLine.get(10)).toBe("HOME");
    expect(byLine.get(20)).toBe("END");
    expect(byLine.size).toBe(2);
  });

  it("returns an empty map for empty input", () => {
    expect(indexBasicListing("").size).toBe(0);
  });

  it("misses cleanly for a line the listing does not contain", () => {
    // Callers pair this with their own walk of program memory and fall back to
    // an empty string, so a miss must be undefined rather than a throw.
    expect(indexBasicListing(line(10, "END")).get(999)).toBeUndefined();
  });
});
