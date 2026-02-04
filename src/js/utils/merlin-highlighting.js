/*
 * merlin-highlighting.js - Merlin assembler syntax highlighting
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { escapeHtml } from "./string-utils.js";

// 6502/65C02 mnemonics grouped by category (matching disassembler colour scheme)
const BRANCH_MNEMONICS = new Set([
  'JMP', 'JSR', 'BCC', 'BCS', 'BEQ', 'BMI', 'BNE', 'BPL', 'BRA', 'BVC',
  'BVS', 'RTS', 'RTI', 'BRK',
  'BBR0', 'BBR1', 'BBR2', 'BBR3', 'BBR4', 'BBR5', 'BBR6', 'BBR7',
  'BBS0', 'BBS1', 'BBS2', 'BBS3', 'BBS4', 'BBS5', 'BBS6', 'BBS7',
]);

const LOAD_MNEMONICS = new Set([
  'LDA', 'LDX', 'LDY', 'STA', 'STX', 'STY', 'STZ',
]);

const MATH_MNEMONICS = new Set([
  'ADC', 'SBC', 'AND', 'ORA', 'EOR', 'ASL', 'LSR', 'ROL', 'ROR',
  'INC', 'DEC', 'INA', 'DEA', 'INX', 'DEX', 'INY', 'DEY',
  'CMP', 'CPX', 'CPY', 'BIT', 'TRB', 'TSB',
  'RMB0', 'RMB1', 'RMB2', 'RMB3', 'RMB4', 'RMB5', 'RMB6', 'RMB7',
  'SMB0', 'SMB1', 'SMB2', 'SMB3', 'SMB4', 'SMB5', 'SMB6', 'SMB7',
]);

const STACK_MNEMONICS = new Set([
  'PHA', 'PHP', 'PHX', 'PHY', 'PLA', 'PLP', 'PLX', 'PLY',
  'TAX', 'TAY', 'TSX', 'TXA', 'TXS', 'TYA',
]);

const FLAG_MNEMONICS = new Set([
  'CLC', 'CLD', 'CLI', 'CLV', 'SEC', 'SED', 'SEI', 'NOP', 'WAI', 'STP',
]);

// All mnemonics combined for detection
const ALL_MNEMONICS = new Set([
  ...BRANCH_MNEMONICS, ...LOAD_MNEMONICS, ...MATH_MNEMONICS,
  ...STACK_MNEMONICS, ...FLAG_MNEMONICS,
]);

// Merlin directives (pseudo-ops)
const DIRECTIVES = new Set([
  'ORG', 'EQU', 'DS', 'DFB', 'DW', 'DA', 'DDB', 'ASC', 'DCI', 'HEX',
  'PUT', 'USE', 'OBJ', 'LST', 'DO', 'ELSE', 'FIN', 'LUP', '--^', 'REL',
  'TYP', 'SAV', 'DSK', 'CHN', 'ENT', 'EXT', 'DUM', 'DEND', 'ERR', 'CYC',
  'DAT', 'EXP', 'PAU', 'SW', 'USR', 'XC', 'MX', 'TR', 'KBD', 'PMC',
  'PAG', 'TTL', 'SKP', 'CHK', 'IF', 'ELUP', 'END', 'MAC', 'EOM', '<<<',
  'ADR', 'ADRL', 'DB', 'LNK', 'STR', 'STRL', 'REV',
]);

// Combined set for detection heuristic
const OPCODE_SET = new Set([...ALL_MNEMONICS, ...DIRECTIVES]);

/**
 * Get CSS class for a mnemonic based on its category
 */
function getMnemonicClass(mnemonic) {
  const upper = mnemonic.toUpperCase();
  if (BRANCH_MNEMONICS.has(upper)) return 'mer-branch';
  if (LOAD_MNEMONICS.has(upper)) return 'mer-load';
  if (MATH_MNEMONICS.has(upper)) return 'mer-math';
  if (STACK_MNEMONICS.has(upper)) return 'mer-stack';
  if (FLAG_MNEMONICS.has(upper)) return 'mer-flag';
  return 'mer-macro';
}

/**
 * Detect if text content appears to be Merlin assembler source.
 * Scans first ~20 non-empty lines looking for recognised mnemonics/directives
 * in the opcode column position.
 * @param {string} text - Plain text (high bits already stripped, CRs converted)
 * @returns {boolean}
 */
export function isMerlinSource(text) {
  const lines = text.split('\n');
  let hits = 0;
  let checked = 0;

  for (const line of lines) {
    if (checked >= 20) break;

    const trimmed = line.trim();
    if (!trimmed) continue;

    checked++;

    // Full-line comments are consistent with Merlin but don't count as hits
    if (trimmed[0] === '*' || trimmed[0] === ';') continue;

    // Parse opcode column: either first token (if line starts with whitespace)
    // or second token (if line starts with a label)
    const tokens = trimmed.split(/\s+/);
    let opcode = null;

    if (/^\s/.test(line)) {
      // Line starts with whitespace: first token is the opcode
      opcode = tokens[0];
    } else if (tokens.length >= 2) {
      // Line starts with a label: second token is the opcode
      opcode = tokens[1];
    }

    if (opcode && OPCODE_SET.has(opcode.toUpperCase())) {
      hits++;
    }
  }

  return hits >= 3;
}

/**
 * Highlight Merlin assembler source code with column-aligned output.
 * @param {string} text - Plain text source (high bits stripped, CRs converted to newlines)
 * @returns {string} HTML with syntax highlighting spans
 */
export function highlightMerlinSource(text) {
  const lines = text.split('\n');
  const highlighted = [];

  for (const line of lines) {
    highlighted.push(highlightMerlinLine(line));
  }

  return highlighted.join('');
}

/**
 * Highlight a single Merlin source line, rendered as a flex row with
 * fixed-width columns for label, opcode, operand, and comment.
 * @param {string} line
 * @returns {string} HTML
 */
function highlightMerlinLine(line) {
  if (!line) return '<span class="mer-line"></span>';

  const trimmed = line.trim();
  if (!trimmed) return '<span class="mer-line"></span>';

  // Full-line comment: starts with * or ;
  if (trimmed[0] === '*' || trimmed[0] === ';') {
    return `<span class="mer-line mer-comment-line"><span class="mer-comment">${escapeHtml(trimmed)}</span></span>`;
  }

  // Parse into columns: LABEL  OPCODE  OPERAND  ;COMMENT
  const hasLabel = !/^\s/.test(line);
  const parts = splitMerlinColumns(line, hasLabel);

  // Build the four column spans
  const labelHtml = renderLabel(parts.label);
  const opcodeHtml = renderOpcode(parts.opcode);
  const operandHtml = renderOperandCol(parts.operand);
  const commentHtml = parts.comment !== null
    ? `<span class="mer-col mer-col-comment"><span class="mer-comment">${escapeHtml(parts.comment)}</span></span>`
    : '';

  return `<span class="mer-line">${labelHtml}${opcodeHtml}${operandHtml}${commentHtml}</span>`;
}

/**
 * Render the label column
 */
function renderLabel(label) {
  if (label === null) {
    return '<span class="mer-col mer-col-label"></span>';
  }
  const cls = isLocalLabel(label) ? 'mer-local' : 'mer-label';
  return `<span class="mer-col mer-col-label"><span class="${cls}">${escapeHtml(label)}</span></span>`;
}

/**
 * Render the opcode column with category-based colouring
 */
function renderOpcode(opcode) {
  if (opcode === null) {
    return '<span class="mer-col mer-col-opcode"></span>';
  }
  const upper = opcode.toUpperCase();
  let cls;
  if (ALL_MNEMONICS.has(upper)) {
    cls = getMnemonicClass(opcode);
  } else if (DIRECTIVES.has(upper)) {
    cls = 'mer-directive';
  } else {
    cls = 'mer-macro';
  }
  return `<span class="mer-col mer-col-opcode"><span class="${cls}">${escapeHtml(opcode)}</span></span>`;
}

/**
 * Render the operand column with sub-token highlighting
 */
function renderOperandCol(operand) {
  if (operand === null) {
    return '<span class="mer-col mer-col-operand"></span>';
  }
  return `<span class="mer-col mer-col-operand">${highlightOperand(operand)}</span>`;
}

/**
 * Split a Merlin source line into its column components.
 * @param {string} line - The source line
 * @param {boolean} hasLabel - Whether the line starts with a label
 * @returns {Object} Column parts
 */
function splitMerlinColumns(line, hasLabel) {
  const result = {
    label: null,
    opcode: null,
    operand: null,
    comment: null,
  };

  let pos = 0;

  if (hasLabel) {
    // Extract label (runs until whitespace)
    const labelMatch = line.match(/^(\S+)/);
    if (labelMatch) {
      result.label = labelMatch[1];
      pos = labelMatch[1].length;
    }
  }

  // Skip whitespace to reach opcode
  const spaceMatch = line.substring(pos).match(/^(\s+)/);
  if (spaceMatch) {
    pos += spaceMatch[1].length;
  }

  if (pos >= line.length) return result;

  // Extract opcode
  const opcodeMatch = line.substring(pos).match(/^(\S+)/);
  if (opcodeMatch) {
    result.opcode = opcodeMatch[1];
    pos += opcodeMatch[1].length;
  }

  // Skip whitespace to reach operand
  const afterOpcodeSpace = line.substring(pos).match(/^(\s+)/);
  if (afterOpcodeSpace) {
    pos += afterOpcodeSpace[1].length;
  }

  if (pos >= line.length) return result;

  // The rest is operand + possibly inline comment
  const rest = line.substring(pos);
  const { operand, comment } = splitOperandAndComment(rest);

  result.operand = operand;
  result.comment = comment;

  return result;
}

/**
 * Split the remainder of a line into operand and inline comment.
 * Respects string delimiters so semicolons inside strings aren't treated as comments.
 * @param {string} rest
 * @returns {Object} { operand, comment }
 */
function splitOperandAndComment(rest) {
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let i = 0; i < rest.length; i++) {
    const ch = rest[i];

    if (ch === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
    } else if (ch === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
    } else if (ch === ';' && !inSingleQuote && !inDoubleQuote) {
      const before = rest.substring(0, i).trimEnd();
      return {
        operand: before || null,
        comment: rest.substring(i),
      };
    }
  }

  return {
    operand: rest.trimEnd() || null,
    comment: null,
  };
}

/**
 * Check if a label is a Merlin local label (starts with : or ])
 * @param {string} label
 * @returns {boolean}
 */
function isLocalLabel(label) {
  return label[0] === ':' || label[0] === ']';
}

/**
 * Highlight an operand field, identifying strings, numbers, label refs, and symbols.
 * @param {string} operand
 * @returns {string} HTML
 */
function highlightOperand(operand) {
  let html = '';
  let i = 0;

  while (i < operand.length) {
    const ch = operand[i];

    // String literal (single or double quoted)
    if (ch === "'" || ch === '"') {
      const quote = ch;
      let j = i + 1;
      while (j < operand.length && operand[j] !== quote) {
        j++;
      }
      if (j < operand.length) j++; // include closing quote
      html += `<span class="mer-string">${escapeHtml(operand.substring(i, j))}</span>`;
      i = j;
      continue;
    }

    // Hex number: $xx...
    if (ch === '$') {
      let j = i + 1;
      while (j < operand.length && /[0-9A-Fa-f]/.test(operand[j])) {
        j++;
      }
      if (j > i + 1) {
        html += `<span class="mer-number">${escapeHtml(operand.substring(i, j))}</span>`;
        i = j;
        continue;
      }
    }

    // Binary number: %01...
    if (ch === '%') {
      let j = i + 1;
      while (j < operand.length && /[01]/.test(operand[j])) {
        j++;
      }
      if (j > i + 1) {
        html += `<span class="mer-number">${escapeHtml(operand.substring(i, j))}</span>`;
        i = j;
        continue;
      }
    }

    // Decimal number
    if (/[0-9]/.test(ch)) {
      let j = i;
      while (j < operand.length && /[0-9]/.test(operand[j])) {
        j++;
      }
      html += `<span class="mer-number">${escapeHtml(operand.substring(i, j))}</span>`;
      i = j;
      continue;
    }

    // Local label reference (: or ] prefix)
    if (ch === ':' || ch === ']') {
      let j = i + 1;
      while (j < operand.length && /[A-Za-z0-9_]/.test(operand[j])) {
        j++;
      }
      if (j > i + 1) {
        html += `<span class="mer-local">${escapeHtml(operand.substring(i, j))}</span>`;
        i = j;
        continue;
      }
    }

    // Immediate prefix (#)
    if (ch === '#') {
      html += `<span class="mer-immediate">${escapeHtml(ch)}</span>`;
      i++;
      continue;
    }

    // Label / symbol reference (identifier)
    if (/[A-Za-z_]/.test(ch)) {
      let j = i + 1;
      while (j < operand.length && /[A-Za-z0-9_.]/.test(operand[j])) {
        j++;
      }
      html += `<span class="mer-symbol">${escapeHtml(operand.substring(i, j))}</span>`;
      i = j;
      continue;
    }

    // Operators and punctuation (, + - * / < > ^ | & ( ))
    if (',+-*/<>^|&()'.includes(ch)) {
      html += `<span class="mer-punct">${escapeHtml(ch)}</span>`;
      i++;
      continue;
    }

    // Anything else
    html += escapeHtml(ch);
    i++;
  }

  return html;
}
