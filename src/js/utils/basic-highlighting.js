/**
 * BASIC Syntax Highlighting Utilities
 * Shared between file viewer (detokenized display) and BASIC program editor
 */

import { escapeHtml } from "./string-utils.js";
import { APPLESOFT_TOKENS } from "./basic-tokens.js";

// BASIC keyword categories for syntax highlighting
export const BASIC_CATEGORIES = {
  flow: [
    "GOTO", "GOSUB", "RETURN", "IF", "THEN", "ON", "ONERR", "RESUME",
    "END", "STOP", "RUN",
  ],
  loop: ["FOR", "TO", "STEP", "NEXT"],
  io: ["PRINT", "INPUT", "GET", "DATA", "READ", "RESTORE"],
  graphics: [
    "GR", "HGR", "HGR2", "TEXT", "PLOT", "HPLOT", "HLIN", "VLIN",
    "COLOR=", "HCOLOR=", "DRAW", "XDRAW", "ROT=", "SCALE=", "SCRN(",
    "HOME", "HTAB", "VTAB", "NORMAL", "INVERSE", "FLASH",
  ],
  memory: ["PEEK", "POKE", "CALL", "HIMEM:", "LOMEM:", "USR", "DEF", "FN"],
  functions: [
    "SGN", "INT", "ABS", "SQR", "RND", "LOG", "EXP", "COS", "SIN",
    "TAN", "ATN", "LEN", "ASC", "VAL", "STR$", "CHR$", "LEFT$",
    "RIGHT$", "MID$", "FRE", "PDL", "POS", "TAB(", "SPC(",
  ],
  variable: ["DIM", "LET", "DEL", "NEW", "CLR", "CLEAR"],
  misc: [
    "REM", "LOAD", "SAVE", "SHLOAD", "STORE", "RECALL", "PR#", "IN#",
    "WAIT", "CONT", "LIST", "TRACE", "NOTRACE", "SPEED=", "POP",
    "NOT", "AND", "OR", "&",
  ],
};

// Build a set of all keywords for quick lookup
const ALL_KEYWORDS = new Set();
for (const category of Object.values(BASIC_CATEGORIES)) {
  for (const keyword of category) {
    ALL_KEYWORDS.add(keyword);
  }
}

// Also add any tokens not in categories
for (const token of APPLESOFT_TOKENS) {
  if (token && token.length > 0) {
    ALL_KEYWORDS.add(token);
  }
}

/**
 * Get CSS class for a BASIC keyword
 * @param {string} keyword - The keyword (uppercase)
 * @returns {string} CSS class name
 */
export function getBasicKeywordClass(keyword) {
  const kw = keyword.trim().toUpperCase();
  if (BASIC_CATEGORIES.flow.includes(kw)) return "bas-flow";
  if (BASIC_CATEGORIES.loop.includes(kw)) return "bas-loop";
  if (BASIC_CATEGORIES.io.includes(kw)) return "bas-io";
  if (BASIC_CATEGORIES.graphics.includes(kw)) return "bas-graphics";
  if (BASIC_CATEGORIES.memory.includes(kw)) return "bas-memory";
  if (BASIC_CATEGORIES.functions.includes(kw)) return "bas-func";
  if (BASIC_CATEGORIES.variable.includes(kw)) return "bas-var";
  if (BASIC_CATEGORIES.misc.includes(kw)) return "bas-misc";
  return "bas-keyword";
}

// Sort keywords by length (longest first) for matching
const SORTED_KEYWORDS = Array.from(ALL_KEYWORDS)
  .filter(k => k.length > 1 || /[&]/.test(k))  // Include & but not single operators
  .sort((a, b) => b.length - a.length);

/**
 * Highlight BASIC source code (text input, not tokenized)
 * @param {string} source - BASIC source code
 * @param {Object} options - Options
 * @param {boolean} options.preserveCase - Keep original case (default: false, converts to uppercase)
 * @returns {string} HTML with syntax highlighting spans
 */
export function highlightBasicSource(source, options = {}) {
  const { preserveCase = false } = options;
  const lines = source.split(/\r?\n/);
  const highlightedLines = [];

  for (const line of lines) {
    highlightedLines.push(highlightBasicLine(line, preserveCase));
  }

  return highlightedLines.join("\n");
}

/**
 * Highlight a single line of BASIC source
 * @param {string} line - Single line of BASIC
 * @param {boolean} preserveCase - Keep original case
 * @returns {string} HTML with syntax highlighting
 */
function highlightBasicLine(line, preserveCase) {
  if (!line.trim()) {
    return escapeHtml(line);
  }

  const upper = line.toUpperCase();
  let result = "";
  let i = 0;

  // Check for line number at start
  const lineNumMatch = upper.match(/^(\s*)(\d+)(\s*)/);
  if (lineNumMatch) {
    result += escapeHtml(lineNumMatch[1]); // Leading whitespace
    result += `<span class="bas-linenum">${lineNumMatch[2]}</span>`;
    result += escapeHtml(lineNumMatch[3]); // Trailing whitespace
    i = lineNumMatch[0].length;
  }

  let inString = false;
  let inRem = false;
  let stringStart = -1;
  let remStart = -1;

  while (i < line.length) {
    const char = line[i];
    const upperChar = upper[i];

    // Handle REM - rest of line is comment
    if (inRem) {
      if (remStart === -1) remStart = i;
      i++;
      continue;
    }

    // Handle strings
    if (char === '"') {
      if (inString) {
        // End of string
        const str = line.substring(stringStart, i + 1);
        result += `<span class="bas-string">${escapeHtml(str)}</span>`;
        inString = false;
        stringStart = -1;
        i++;
        continue;
      } else {
        // Start of string
        inString = true;
        stringStart = i;
        i++;
        continue;
      }
    }

    if (inString) {
      i++;
      continue;
    }

    // Try to match a keyword
    const remaining = upper.substring(i);
    let matched = false;

    for (const keyword of SORTED_KEYWORDS) {
      if (remaining.startsWith(keyword)) {
        // Check it's not part of a longer identifier
        const nextChar = remaining[keyword.length];
        const isKeywordEnd = !nextChar || !/[A-Z0-9]/.test(nextChar);
        const isSpecial = /[=(:&]$/.test(keyword) || keyword === "&";

        if (isKeywordEnd || isSpecial) {
          const originalCase = preserveCase ? line.substring(i, i + keyword.length) : keyword;
          const kwClass = getBasicKeywordClass(keyword);
          result += `<span class="${kwClass}">${escapeHtml(originalCase)}</span>`;
          i += keyword.length;
          matched = true;

          // Check for REM
          if (keyword === "REM") {
            inRem = true;
            remStart = i;
          }
          break;
        }
      }
    }

    if (matched) continue;

    // Check for numbers
    if (/[0-9]/.test(upperChar)) {
      let num = char;
      let j = i + 1;
      while (j < line.length && /[0-9.]/.test(line[j])) {
        num += line[j];
        j++;
      }
      // Check for E notation
      if (j < line.length && /[Ee]/.test(line[j])) {
        num += line[j];
        j++;
        if (j < line.length && /[+-]/.test(line[j])) {
          num += line[j];
          j++;
        }
        while (j < line.length && /[0-9]/.test(line[j])) {
          num += line[j];
          j++;
        }
      }
      result += `<span class="bas-number">${escapeHtml(num)}</span>`;
      i = j;
      continue;
    }

    // Check for variable names
    if (/[A-Za-z]/.test(char)) {
      let varName = char;
      let j = i + 1;
      while (j < line.length && /[A-Za-z0-9]/.test(line[j])) {
        varName += line[j];
        j++;
      }
      // Check for type suffix
      if (j < line.length && /[$%]/.test(line[j])) {
        varName += line[j];
        j++;
      }
      const displayName = preserveCase ? varName : varName.toUpperCase();
      result += `<span class="bas-variable">${escapeHtml(displayName)}</span>`;
      i = j;
      continue;
    }

    // Check for operators
    if ("+-*/^=<>".includes(char)) {
      result += `<span class="bas-operator">${escapeHtml(char)}</span>`;
      i++;
      continue;
    }

    // Check for punctuation
    if ("(),;:".includes(char)) {
      result += `<span class="bas-punct">${escapeHtml(char)}</span>`;
      i++;
      continue;
    }

    // Default: just output the character
    result += escapeHtml(char);
    i++;
  }

  // Flush remaining content
  if (inString && stringStart !== -1) {
    const str = line.substring(stringStart);
    result += `<span class="bas-string">${escapeHtml(str)}</span>`;
  }
  if (inRem && remStart !== -1) {
    const rem = line.substring(remStart);
    result += `<span class="bas-comment">${escapeHtml(rem)}</span>`;
  }

  return result;
}
