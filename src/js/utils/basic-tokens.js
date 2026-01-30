/**
 * Applesoft BASIC Token Definitions
 * Shared utility for tokenization and detokenization
 */

// Applesoft BASIC tokens - array index = token value - 0x80
// This is the authoritative list used by both tokenization and detokenization
export const APPLESOFT_TOKENS = [
  "END",      // $80
  "FOR",      // $81
  "NEXT",     // $82
  "DATA",     // $83
  "INPUT",    // $84
  "DEL",      // $85
  "DIM",      // $86
  "READ",     // $87
  "GR",       // $88
  "TEXT",     // $89
  "PR#",      // $8A
  "IN#",      // $8B
  "CALL",     // $8C
  "PLOT",     // $8D
  "HLIN",     // $8E
  "VLIN",     // $8F
  "HGR2",     // $90
  "HGR",      // $91
  "HCOLOR=",  // $92
  "HPLOT",    // $93
  "DRAW",     // $94
  "XDRAW",    // $95
  "HTAB",     // $96
  "HOME",     // $97
  "ROT=",     // $98
  "SCALE=",   // $99
  "SHLOAD",   // $9A
  "TRACE",    // $9B
  "NOTRACE",  // $9C
  "NORMAL",   // $9D
  "INVERSE",  // $9E
  "FLASH",    // $9F
  "COLOR=",   // $A0
  "POP",      // $A1
  "VTAB",     // $A2
  "HIMEM:",   // $A3
  "LOMEM:",   // $A4
  "ONERR",    // $A5
  "RESUME",   // $A6
  "RECALL",   // $A7
  "STORE",    // $A8
  "SPEED=",   // $A9
  "LET",      // $AA
  "GOTO",     // $AB
  "RUN",      // $AC
  "IF",       // $AD
  "RESTORE",  // $AE
  "&",        // $AF - Ampersand (machine language hook)
  "GOSUB",    // $B0
  "RETURN",   // $B1
  "REM",      // $B2
  "STOP",     // $B3
  "ON",       // $B4
  "WAIT",     // $B5
  "LOAD",     // $B6
  "SAVE",     // $B7
  "DEF",      // $B8
  "POKE",     // $B9
  "PRINT",    // $BA
  "CONT",     // $BB
  "LIST",     // $BC
  "CLEAR",    // $BD
  "GET",      // $BE
  "NEW",      // $BF
  "TAB(",     // $C0
  "TO",       // $C1
  "FN",       // $C2
  "SPC(",     // $C3
  "THEN",     // $C4
  "AT",       // $C5
  "NOT",      // $C6
  "STEP",     // $C7
  "+",        // $C8
  "-",        // $C9
  "*",        // $CA
  "/",        // $CB
  "^",        // $CC
  "AND",      // $CD
  "OR",       // $CE
  ">",        // $CF
  "=",        // $D0
  "<",        // $D1
  "SGN",      // $D2
  "INT",      // $D3
  "ABS",      // $D4
  "USR",      // $D5
  "FRE",      // $D6
  "SCRN(",    // $D7
  "PDL",      // $D8
  "POS",      // $D9
  "SQR",      // $DA
  "RND",      // $DB
  "LOG",      // $DC
  "EXP",      // $DD
  "COS",      // $DE
  "SIN",      // $DF
  "TAN",      // $E0
  "ATN",      // $E1
  "PEEK",     // $E2
  "LEN",      // $E3
  "STR$",     // $E4
  "VAL",      // $E5
  "ASC",      // $E6
  "CHR$",     // $E7
  "LEFT$",    // $E8
  "RIGHT$",   // $E9
  "MID$",     // $EA
];

// Build reverse lookup: keyword -> token byte
const keywordToToken = new Map();
for (let i = 0; i < APPLESOFT_TOKENS.length; i++) {
  const keyword = APPLESOFT_TOKENS[i];
  if (keyword) {
    keywordToToken.set(keyword, 0x80 + i);
  }
}

// Also add "?" as alias for PRINT
keywordToToken.set("?", keywordToToken.get("PRINT"));

// Sort keywords by length (longest first) for proper tokenization matching
const sortedKeywords = Array.from(keywordToToken.keys())
  .filter(k => k.length > 0)
  .sort((a, b) => b.length - a.length);

/**
 * Get token byte for a keyword
 * @param {string} keyword - Uppercase keyword
 * @returns {number|undefined} Token byte or undefined if not found
 */
export function getTokenForKeyword(keyword) {
  return keywordToToken.get(keyword);
}

/**
 * Get keyword for a token byte
 * @param {number} token - Token byte (0x80-0xEA)
 * @returns {string|undefined} Keyword or undefined if invalid
 */
export function getKeywordForToken(token) {
  if (token >= 0x80 && token < 0x80 + APPLESOFT_TOKENS.length) {
    return APPLESOFT_TOKENS[token - 0x80];
  }
  return undefined;
}

/**
 * Get sorted keywords for tokenization (longest first)
 * @returns {string[]} Array of keywords sorted by length descending
 */
export function getSortedKeywords() {
  return sortedKeywords;
}

/**
 * Check if a keyword should always match (operators and keywords ending with special chars)
 * @param {string} keyword
 * @returns {boolean}
 */
export function isAlwaysMatchKeyword(keyword) {
  return /^[+\-*/^<>=&]$/.test(keyword) ||
         keyword.endsWith("=") ||
         keyword.endsWith("(") ||
         keyword.endsWith(":");
}

// Keywords that end with special suffixes (=, (, :)
// Map from base keyword to full token info
const SUFFIX_KEYWORDS = new Map();
for (const keyword of APPLESOFT_TOKENS) {
  if (keyword && (keyword.endsWith("=") || keyword.endsWith("(") || keyword.endsWith(":"))) {
    const base = keyword.slice(0, -1);
    const suffix = keyword.slice(-1);
    SUFFIX_KEYWORDS.set(base, { full: keyword, suffix, token: keywordToToken.get(keyword) });
  }
}

// Sort base keywords by length (longest first) for matching
const sortedBaseKeywords = Array.from(SUFFIX_KEYWORDS.keys()).sort((a, b) => b.length - a.length);

/**
 * Tokenize a line of BASIC code
 * @param {string} content - Line content (without line number), uppercase
 * @returns {number[]} Array of bytes
 */
export function tokenizeLine(content) {
  const bytes = [];
  let i = 0;
  let inString = false;
  let inRem = false;
  let inData = false;

  while (i < content.length) {
    const char = content[i];

    // Handle string literals - don't tokenize inside quotes
    if (char === '"') {
      inString = !inString;
      bytes.push(char.charCodeAt(0));
      i++;
      continue;
    }

    if (inString || inRem) {
      // Inside string or REM - copy literally
      bytes.push(char.charCodeAt(0));
      i++;
      continue;
    }

    // Handle DATA statements - copy literally until colon or end
    if (inData) {
      if (char === ':') {
        inData = false;
      }
      bytes.push(char.charCodeAt(0));
      i++;
      continue;
    }

    // Try to match a keyword
    let matched = false;
    const remaining = content.substring(i);

    // First, check for suffix keywords with optional spaces (e.g., "HCOLOR = 3")
    // This must be checked BEFORE regular keywords to avoid "HCOLOR" matching "HCOL" + "OR"
    for (const base of sortedBaseKeywords) {
      if (remaining.startsWith(base)) {
        // Check it's not part of a longer identifier
        const nextChar = remaining[base.length];
        if (!nextChar || !/[A-Z0-9]/.test(nextChar)) {
          // Check if followed by optional spaces and then the suffix
          const suffixInfo = SUFFIX_KEYWORDS.get(base);
          let j = base.length;
          while (j < remaining.length && remaining[j] === ' ') {
            j++;
          }
          if (j < remaining.length && remaining[j] === suffixInfo.suffix) {
            // Match! Use the full keyword token
            bytes.push(suffixInfo.token);
            i += j + 1; // Skip base + spaces + suffix
            matched = true;
            break;
          }
        }
      }
    }

    if (matched) continue;

    // Then check regular keywords
    for (const keyword of sortedKeywords) {
      if (remaining.startsWith(keyword)) {
        // Check it's not part of a longer identifier
        // (e.g., "FORMULA" shouldn't match "FOR")
        const nextChar = remaining[keyword.length];
        const isKeywordEnd = !nextChar || !/[A-Z0-9]/.test(nextChar);

        // Operators and keywords with special chars always match
        const alwaysMatch = isAlwaysMatchKeyword(keyword);

        if (isKeywordEnd || alwaysMatch) {
          bytes.push(keywordToToken.get(keyword));
          i += keyword.length;
          matched = true;

          // Check for REM - rest of line is literal
          if (keyword === "REM") {
            inRem = true;
          }
          // Check for DATA - rest until colon is literal
          if (keyword === "DATA") {
            inData = true;
          }
          break;
        }
      }
    }

    if (!matched) {
      // Not a keyword, copy the character
      bytes.push(char.charCodeAt(0));
      i++;
    }
  }

  return bytes;
}

// Zero page locations for Applesoft BASIC
export const BASIC_POINTERS = {
  TEMPPT: 0x52,    // Next available temp string descriptor slot (1 byte, init $55)
  TXTTAB: 0x67,    // Start of program text (2 bytes)
  VARTAB: 0x69,    // Start of variable storage (2 bytes)
  ARYTAB: 0x6B,    // Start of array storage (2 bytes)
  STREND: 0x6D,    // End of string storage (2 bytes)
  FRETOP: 0x6F,    // Top of string free space (2 bytes)
  MEMSIZ: 0x73,    // Top of memory (2 bytes)
  CURLIN: 0x75,    // Current line number (2 bytes, $FFFF = direct mode)
  DATPTR: 0x7D,    // DATA read pointer (2 bytes)
};
