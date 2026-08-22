/*
 * The editor's directive lists exist so it can highlight, autocomplete and
 * validate a line without asking the assembler. That only works while they say
 * the same thing the assembler does, and there is no way to find out they have
 * drifted except by typing a directive and being told it does not exist — so
 * these read the lists straight out of the C++ and compare.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  DIRECTIVES,
  STRING_DIRECTIVES,
  SWEET16_MNEMONICS,
} from "../../../src/js/utils/merlin-highlighting.js";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(
  join(here, "../../../src/core/assembler/assembler.cpp"),
  "utf8",
);

/** Pull the string literals out of a `static const char* NAME[] = { ... };` */
function literalsFrom(declaration) {
  const start = source.indexOf(declaration);
  expect(start, `${declaration} not found in assembler.cpp`).toBeGreaterThan(-1);
  const body = source.slice(start, source.indexOf("};", start));
  return new Set([...body.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]));
}

describe("Merlin directive tables", () => {
  it("matches the assembler's directive list", () => {
    const cpp = literalsFrom("static const char* DIRECTIVES[]");
    expect([...cpp].sort()).toEqual([...DIRECTIVES].sort());
  });

  it("matches the assembler's string directives", () => {
    // isStringDirective() compares against a run of literals rather than a
    // table, so the names are read out of the comparison itself.
    const start = source.indexOf("static bool isStringDirective");
    const body = source.slice(start, source.indexOf("}", start));
    const cpp = new Set([...body.matchAll(/"([A-Z]+)"/g)].map((m) => m[1]));
    expect([...cpp].sort()).toEqual([...STRING_DIRECTIVES].sort());
  });

  it("matches the assembler's Sweet-16 mnemonics", () => {
    const start = source.indexOf("const S16Op SWEET16_OPS[]");
    const body = source.slice(start, source.indexOf("};", start));
    const cpp = new Set([...body.matchAll(/\{"([A-Z0-9]+)"/g)].map((m) => m[1]));
    expect([...cpp].sort()).toEqual([...SWEET16_MNEMONICS].sort());
  });

  it("every directive has an autocomplete description", async () => {
    const support = readFileSync(
      join(here, "../../../src/js/utils/merlin-editor-support.js"),
      "utf8",
    );
    const infoStart = support.indexOf("const DIRECTIVE_INFO = {");
    const info = support.slice(infoStart, support.indexOf("\n};", infoStart));
    for (const directive of DIRECTIVES) {
      expect(
        info.includes(`\n  ${directive}:`) ||
          info.includes(`\n  '${directive}':`) ||
          info.includes(`\n  "${directive}":`),
        `${directive} has no DIRECTIVE_INFO entry`,
      ).toBe(true);
    }
  });
});
