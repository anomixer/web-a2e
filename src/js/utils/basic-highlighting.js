/*
 * basic-highlighting.js - BASIC syntax highlighting with smart formatting
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { escapeHtml } from "./string-utils.js";
import { APPLESOFT_TOKENS } from "./basic-tokens.js";

// BASIC keyword categories for syntax highlighting
// Colors follow the Apple II rainbow theme (Green, Yellow, Orange, Red, Purple, Blue)
export const BASIC_CATEGORIES = {
  // RED - Flow control that changes execution path
  flow: [
    "GOTO", "GOSUB", "RETURN", "IF", "THEN", "ON", "ONERR", "RESUME",
    "END", "STOP", "RUN",
  ],
  // PURPLE - Loop constructs
  loop: ["FOR", "TO", "STEP", "NEXT"],
  // BLUE - Input/Output operations
  io: ["PRINT", "INPUT", "GET", "DATA", "READ", "RESTORE"],
  // GREEN - Graphics and display
  graphics: [
    "GR", "HGR", "HGR2", "TEXT", "PLOT", "HPLOT", "HLIN", "VLIN",
    "COLOR=", "HCOLOR=", "DRAW", "XDRAW", "ROT=", "SCALE=", "SCRN(",
    "HOME", "HTAB", "VTAB", "NORMAL", "INVERSE", "FLASH",
  ],
  // ORANGE - Memory and system
  memory: ["PEEK", "POKE", "CALL", "HIMEM:", "LOMEM:", "USR", "DEF", "FN"],
  // CYAN - Built-in functions
  functions: [
    "SGN", "INT", "ABS", "SQR", "RND", "LOG", "EXP", "COS", "SIN",
    "TAN", "ATN", "LEN", "ASC", "VAL", "STR$", "CHR$", "LEFT$",
    "RIGHT$", "MID$", "FRE", "PDL", "POS", "TAB(", "SPC(",
  ],
  // YELLOW - Variable declarations
  variable: ["DIM", "LET", "DEL", "NEW", "CLR", "CLEAR"],
  // MUTED - Miscellaneous
  misc: [
    "REM", "LOAD", "SAVE", "SHLOAD", "STORE", "RECALL", "PR#", "IN#",
    "WAIT", "CONT", "LIST", "TRACE", "NOTRACE", "SPEED=", "POP",
    "NOT", "AND", "OR", "&",
  ],
};

// Keywords that increase indentation level
const INDENT_INCREASE = new Set(["FOR", "GOSUB"]);
// Keywords that decrease indentation level (before the line)
const INDENT_DECREASE = new Set(["NEXT", "RETURN"]);

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
 * Calculate the indentation level for each line based on control structures
 * Handles multiple FOR/NEXT on the same line (e.g., FOR A=1 TO 2:FOR B=1 TO 2)
 * @param {string[]} lines - Array of BASIC lines
 * @returns {number[]} Array of indentation levels (0-8)
 */
function calculateIndentLevels(lines) {
  const levels = [];
  let currentLevel = 0;

  for (const line of lines) {
    const upper = line.toUpperCase();

    // Count all FOR and NEXT occurrences on this line
    const forMatches = upper.match(/\bFOR\b/g);
    const nextMatches = upper.match(/\bNEXT\b/g);
    const forCount = forMatches ? forMatches.length : 0;
    const nextCount = nextMatches ? nextMatches.length : 0;

    // Decrease level for each NEXT (before rendering the line)
    if (nextCount > 0) {
      currentLevel = Math.max(0, currentLevel - nextCount);
    }

    levels.push(Math.min(currentLevel, 8)); // Cap at 8 levels

    // Increase level for each FOR (after rendering the line)
    if (forCount > 0) {
      currentLevel += forCount;
    }
  }

  return levels;
}

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

  // Calculate indent levels for all lines
  const indentLevels = calculateIndentLevels(lines);

  for (let i = 0; i < lines.length; i++) {
    const highlighted = highlightBasicLine(lines[i], preserveCase);
    const indentClass = indentLevels[i] > 0 ? ` indent-${indentLevels[i]}` : "";
    // We don't wrap here - the wrapper will add indentation class if needed
    highlightedLines.push({ html: highlighted, indent: indentLevels[i] });
  }

  // Return just the HTML - caller will handle indent classes
  return highlightedLines.map(l => l.html).join("\n");
}

/**
 * Highlight BASIC source with indent information
 * @param {string} source - BASIC source code
 * @param {Object} options - Options
 * @param {boolean} options.preserveCase - Keep original case (default: false)
 * @returns {{html: string, indent: number}[]} Array of highlighted lines with indent levels
 */
export function highlightBasicSourceWithIndent(source, options = {}) {
  const { preserveCase = false } = options;
  const lines = source.split(/\r?\n/);
  const indentLevels = calculateIndentLevels(lines);
  const result = [];

  for (let i = 0; i < lines.length; i++) {
    result.push({
      html: highlightBasicLine(lines[i], preserveCase),
      indent: indentLevels[i],
    });
  }

  return result;
}

/**
 * Auto-format BASIC source code
 * - Sorts lines by line number (so changing a line number moves it to correct position)
 * - Right-aligns line numbers to consistent width
 * - Adds indentation for control structures (FOR/NEXT loops)
 * @param {string} source - BASIC source code
 * @returns {string} Formatted source code
 */
export function formatBasicSource(source) {
  const rawLines = source.split(/\r?\n/);

  // Parse lines and extract line numbers for sorting
  const parsedLines = [];
  for (const line of rawLines) {
    const trimmed = line.trim();
    if (!trimmed) continue; // Skip empty lines

    const match = trimmed.match(/^(\d+)\s*(.*)/);
    if (match) {
      parsedLines.push({
        lineNumber: parseInt(match[1], 10),
        lineNumStr: match[1],
        code: match[2] || "",
      });
    } else {
      // Lines without line numbers are kept but won't be sorted
      // (unusual in BASIC but handle gracefully)
      parsedLines.push({
        lineNumber: -1, // Sort to top
        lineNumStr: null,
        code: trimmed,
      });
    }
  }

  // Sort by line number (lines without numbers stay at top)
  parsedLines.sort((a, b) => a.lineNumber - b.lineNumber);

  // Rebuild lines array for indent calculation
  const sortedLines = parsedLines.map((p) =>
    p.lineNumStr ? `${p.lineNumStr} ${p.code}` : p.code
  );

  // Calculate indentation on sorted lines
  const indentLevels = calculateIndentLevels(sortedLines);

  // Find max line number width for alignment
  let maxLineNumWidth = 0;
  for (const p of parsedLines) {
    if (p.lineNumStr) {
      maxLineNumWidth = Math.max(maxLineNumWidth, p.lineNumStr.length);
    }
  }

  // Format each line
  const formattedLines = [];
  for (let i = 0; i < sortedLines.length; i++) {
    formattedLines.push(formatBasicLine(sortedLines[i], maxLineNumWidth, indentLevels[i]));
  }

  return formattedLines.join("\n");
}

// Indent string constant (2 spaces per level)
const INDENT_CHARS = "  ";

/**
 * Convert BASIC code to uppercase while preserving string contents
 * @param {string} code - BASIC code
 * @returns {string} Code with keywords/variables uppercase, strings preserved
 */
function toUppercasePreservingStrings(code) {
  let result = "";
  let inString = false;

  for (let i = 0; i < code.length; i++) {
    const char = code[i];

    if (char === '"') {
      inString = !inString;
      result += char;
    } else if (inString) {
      // Inside string - preserve case
      result += char;
    } else {
      // Outside string - convert to uppercase
      result += char.toUpperCase();
    }
  }

  return result;
}

/**
 * Format a single line of BASIC source
 * @param {string} line - Single line of BASIC
 * @param {number} maxLineNumWidth - Width to pad line numbers to
 * @param {number} indentLevel - Indentation level (0-8)
 * @returns {string} Formatted line
 */
function formatBasicLine(line, maxLineNumWidth, indentLevel) {
  const trimmed = line.trim();
  if (!trimmed) {
    return "";
  }

  // Parse line number and code
  const match = trimmed.match(/^(\d+)\s*(.*)/);

  if (match) {
    const lineNum = match[1];
    const code = toUppercasePreservingStrings(match[2]);

    // Right-align line number by left-padding with spaces
    const padding = " ".repeat(Math.max(0, maxLineNumWidth - lineNum.length));

    // Add indentation
    const indent = indentLevel > 0 ? INDENT_CHARS.repeat(indentLevel) : "";

    return `${padding}${lineNum} ${indent}${code}`;
  }

  // No line number - just return trimmed with indent (also uppercase)
  const indent = indentLevel > 0 ? INDENT_CHARS.repeat(indentLevel) : "";
  return `${indent}${toUppercasePreservingStrings(trimmed)}`;
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
