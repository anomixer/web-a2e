#!/usr/bin/env node
/*
 * generate-basic-tokens.mjs - Generate the JS Applesoft token table from C++
 *
 * src/core/basic/basic_tokens.hpp is the authority: the detokenizer, the
 * tokenizer and the assembler all read it. The JS copy existed alongside it as
 * a hand-maintained duplicate, so the two could disagree with nothing to catch
 * it.
 *
 * The JS table is still needed at runtime — syntax highlighting and
 * autocomplete run per-keystroke and cannot afford a round trip through the
 * ABI for every keyword — so it is generated from the header rather than
 * removed.
 *
 * Usage:
 *   node scripts/generate-basic-tokens.mjs           # write the file
 *   node scripts/generate-basic-tokens.mjs --check   # verify it is current
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HEADER = resolve(ROOT, "src/core/basic/basic_tokens.hpp");
const OUTPUT = resolve(ROOT, "src/js/utils/basic-tokens.js");

/**
 * Pull one `static constexpr const char* NAME[] = { ... };` array out of the
 * header and return its string literals in order.
 */
function extractTable(source, name) {
  const start = source.indexOf(`${name}[] = {`);
  if (start === -1) throw new Error(`generate-basic-tokens: ${name} not found in ${HEADER}`);

  const open = source.indexOf("{", start);
  const close = source.indexOf("};", open);
  if (close === -1) throw new Error(`generate-basic-tokens: unterminated ${name}`);

  const body = source.slice(open + 1, close);

  // Only take string literals, so trailing comments (// $80) are ignored.
  // Escaped quotes do not occur in these tables, but are handled anyway.
  const tokens = [...body.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
  if (tokens.length === 0) throw new Error(`generate-basic-tokens: ${name} is empty`);

  return tokens;
}

function render(tokens) {
  const width = Math.max(...tokens.map((t) => JSON.stringify(t).length));

  const entries = tokens
    .map((token, i) => {
      const literal = JSON.stringify(token);
      const code = (0x80 + i).toString(16).toUpperCase();
      return `  ${literal.padEnd(width)}, // $${code}`;
    })
    .join("\n");

  return `/*
 * basic-tokens.js - Applesoft BASIC token definitions
 *
 * GENERATED FILE - DO NOT EDIT.
 * Source: src/core/basic/basic_tokens.hpp
 * Regenerate with: npm run generate:basic-tokens
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

// Applesoft BASIC tokens - array index = token value - 0x80
export const APPLESOFT_TOKENS = [
${entries}
];
`;
}

const header = readFileSync(HEADER, "utf8");
const generated = render(extractTable(header, "APPLESOFT_TOKENS"));

if (process.argv.includes("--check")) {
  let current;
  try {
    current = readFileSync(OUTPUT, "utf8");
  } catch {
    console.error(`generate-basic-tokens: ${OUTPUT} is missing — run npm run generate:basic-tokens`);
    process.exit(1);
  }

  if (current !== generated) {
    console.error(
      "generate-basic-tokens: src/js/utils/basic-tokens.js is out of date with\n" +
      "  src/core/basic/basic_tokens.hpp — run npm run generate:basic-tokens"
    );
    process.exit(1);
  }

  const count = extractTable(header, "APPLESOFT_TOKENS").length;
  console.log(`generate-basic-tokens: OK (${count} tokens in sync)`);
  process.exit(0);
}

writeFileSync(OUTPUT, generated);
console.log(`generate-basic-tokens: wrote ${extractTable(header, "APPLESOFT_TOKENS").length} tokens to ${OUTPUT}`);
