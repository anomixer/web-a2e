/*
 * merlin-editor-support.js - Merlin assembler editor enhancements
 *
 * Column-aware editing, smart shortcuts, and contextual autocomplete
 * for the 4-column Merlin layout: LABEL (0), OPCODE (9), OPERAND (14), COMMENT (25)
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import {
  BRANCH_MNEMONICS, LOAD_MNEMONICS, MATH_MNEMONICS,
  STACK_MNEMONICS, FLAG_MNEMONICS, ALL_MNEMONICS,
  DIRECTIVES, getMnemonicClass,
} from "./merlin-highlighting.js";

// Merlin column stops
export const MERLIN_COLUMNS = [0, 9, 14, 25];

/**
 * Get cursor line info from a textarea
 */
export function getCursorLineAndCol(textarea) {
  const pos = textarea.selectionStart;
  const text = textarea.value;
  const lineStart = text.lastIndexOf('\n', pos - 1) + 1;
  const col = pos - lineStart;
  const lineEnd = text.indexOf('\n', pos);
  const line = text.substring(lineStart, lineEnd === -1 ? text.length : lineEnd);
  return { lineStart, col, line, pos };
}

/**
 * Detect which Merlin column a cursor position falls in
 */
export function detectMerlinColumn(line, col) {
  if (col >= 25) return 'comment';
  if (col >= 14) return 'operand';
  if (col >= 9) return 'opcode';
  return 'label';
}

// Mnemonic info for autocomplete hints
const MNEMONIC_INFO = {
  // Branch / Flow
  JMP: { syntax: "JMP addr", desc: "Jump to address" },
  JSR: { syntax: "JSR addr", desc: "Jump to subroutine" },
  BCC: { syntax: "BCC label", desc: "Branch if carry clear" },
  BCS: { syntax: "BCS label", desc: "Branch if carry set" },
  BEQ: { syntax: "BEQ label", desc: "Branch if equal (Z=1)" },
  BMI: { syntax: "BMI label", desc: "Branch if minus (N=1)" },
  BNE: { syntax: "BNE label", desc: "Branch if not equal (Z=0)" },
  BPL: { syntax: "BPL label", desc: "Branch if plus (N=0)" },
  BRA: { syntax: "BRA label", desc: "Branch always (65C02)" },
  BVC: { syntax: "BVC label", desc: "Branch if overflow clear" },
  BVS: { syntax: "BVS label", desc: "Branch if overflow set" },
  RTS: { syntax: "RTS", desc: "Return from subroutine" },
  RTI: { syntax: "RTI", desc: "Return from interrupt" },
  BRK: { syntax: "BRK", desc: "Software interrupt" },
  // Load / Store
  LDA: { syntax: "LDA #val | addr", desc: "Load accumulator" },
  LDX: { syntax: "LDX #val | addr", desc: "Load X register" },
  LDY: { syntax: "LDY #val | addr", desc: "Load Y register" },
  STA: { syntax: "STA addr", desc: "Store accumulator" },
  STX: { syntax: "STX addr", desc: "Store X register" },
  STY: { syntax: "STY addr", desc: "Store Y register" },
  STZ: { syntax: "STZ addr", desc: "Store zero (65C02)" },
  // Math / Logic
  ADC: { syntax: "ADC #val | addr", desc: "Add with carry" },
  SBC: { syntax: "SBC #val | addr", desc: "Subtract with borrow" },
  AND: { syntax: "AND #val | addr", desc: "Bitwise AND" },
  ORA: { syntax: "ORA #val | addr", desc: "Bitwise OR" },
  EOR: { syntax: "EOR #val | addr", desc: "Bitwise exclusive OR" },
  ASL: { syntax: "ASL [addr]", desc: "Arithmetic shift left" },
  LSR: { syntax: "LSR [addr]", desc: "Logical shift right" },
  ROL: { syntax: "ROL [addr]", desc: "Rotate left through carry" },
  ROR: { syntax: "ROR [addr]", desc: "Rotate right through carry" },
  INC: { syntax: "INC [addr]", desc: "Increment memory" },
  DEC: { syntax: "DEC [addr]", desc: "Decrement memory" },
  INA: { syntax: "INA", desc: "Increment accumulator (65C02)" },
  DEA: { syntax: "DEA", desc: "Decrement accumulator (65C02)" },
  INX: { syntax: "INX", desc: "Increment X" },
  DEX: { syntax: "DEX", desc: "Decrement X" },
  INY: { syntax: "INY", desc: "Increment Y" },
  DEY: { syntax: "DEY", desc: "Decrement Y" },
  CMP: { syntax: "CMP #val | addr", desc: "Compare accumulator" },
  CPX: { syntax: "CPX #val | addr", desc: "Compare X register" },
  CPY: { syntax: "CPY #val | addr", desc: "Compare Y register" },
  BIT: { syntax: "BIT #val | addr", desc: "Bit test" },
  TRB: { syntax: "TRB addr", desc: "Test and reset bits (65C02)" },
  TSB: { syntax: "TSB addr", desc: "Test and set bits (65C02)" },
  // Stack / Transfer
  PHA: { syntax: "PHA", desc: "Push accumulator" },
  PHP: { syntax: "PHP", desc: "Push processor status" },
  PHX: { syntax: "PHX", desc: "Push X (65C02)" },
  PHY: { syntax: "PHY", desc: "Push Y (65C02)" },
  PLA: { syntax: "PLA", desc: "Pull accumulator" },
  PLP: { syntax: "PLP", desc: "Pull processor status" },
  PLX: { syntax: "PLX", desc: "Pull X (65C02)" },
  PLY: { syntax: "PLY", desc: "Pull Y (65C02)" },
  TAX: { syntax: "TAX", desc: "Transfer A to X" },
  TAY: { syntax: "TAY", desc: "Transfer A to Y" },
  TSX: { syntax: "TSX", desc: "Transfer SP to X" },
  TXA: { syntax: "TXA", desc: "Transfer X to A" },
  TXS: { syntax: "TXS", desc: "Transfer X to SP" },
  TYA: { syntax: "TYA", desc: "Transfer Y to A" },
  // Flags
  CLC: { syntax: "CLC", desc: "Clear carry flag" },
  CLD: { syntax: "CLD", desc: "Clear decimal mode" },
  CLI: { syntax: "CLI", desc: "Clear interrupt disable" },
  CLV: { syntax: "CLV", desc: "Clear overflow flag" },
  SEC: { syntax: "SEC", desc: "Set carry flag" },
  SED: { syntax: "SED", desc: "Set decimal mode" },
  SEI: { syntax: "SEI", desc: "Set interrupt disable" },
  NOP: { syntax: "NOP", desc: "No operation" },
  WAI: { syntax: "WAI", desc: "Wait for interrupt (65C02)" },
  STP: { syntax: "STP", desc: "Stop processor (65C02)" },
};

// Directive info for autocomplete hints
const DIRECTIVE_INFO = {
  ORG: { syntax: "ORG addr", desc: "Set origin address" },
  EQU: { syntax: "label EQU value", desc: "Equate label to value" },
  DS: { syntax: "DS count[,fill]", desc: "Define storage (fill bytes)" },
  DFB: { syntax: "DFB byte[,byte]...", desc: "Define byte(s)" },
  DW: { syntax: "DW word[,word]...", desc: "Define word(s)" },
  DA: { syntax: "DA addr[,addr]...", desc: "Define address(es)" },
  DDB: { syntax: "DDB word[,word]...", desc: "Define double byte (big-endian)" },
  ASC: { syntax: 'ASC "text"', desc: "ASCII string" },
  DCI: { syntax: 'DCI "text"', desc: "Dextral char inverted string" },
  HEX: { syntax: "HEX bytes", desc: "Hex data (no $ prefix)" },
  PUT: { syntax: "PUT filename", desc: "Include source file" },
  USE: { syntax: "USE filename", desc: "Include macro file" },
  OBJ: { syntax: "OBJ pathname", desc: "Set object file path" },
  LST: { syntax: "LST ON|OFF", desc: "Listing control" },
  DO: { syntax: "DO expr", desc: "Conditional assembly" },
  ELSE: { syntax: "ELSE", desc: "Conditional else" },
  FIN: { syntax: "FIN", desc: "End conditional" },
  LUP: { syntax: "LUP count", desc: "Loop (repeat) block" },
  '--^': { syntax: "--^", desc: "End of LUP block" },
  REL: { syntax: "REL", desc: "Relocatable code" },
  TYP: { syntax: "TYP type", desc: "Set ProDOS file type" },
  SAV: { syntax: "SAV filename", desc: "Save object file" },
  DSK: { syntax: "DSK filename", desc: "Save as DOS binary" },
  CHN: { syntax: "CHN filename", desc: "Chain to source file" },
  ENT: { syntax: "ENT", desc: "Entry point (export)" },
  EXT: { syntax: "EXT", desc: "External reference (import)" },
  DUM: { syntax: "DUM addr", desc: "Dummy section start" },
  DEND: { syntax: "DEND", desc: "Dummy section end" },
  ERR: { syntax: "ERR expr", desc: "Force error if true" },
  CYC: { syntax: "CYC ON|OFF|AVE", desc: "Cycle count listing" },
  DAT: { syntax: "DAT", desc: "Date stamp" },
  EXP: { syntax: "EXP ON|OFF", desc: "Macro expansion listing" },
  PAU: { syntax: "PAU", desc: "Pause listing" },
  SW: { syntax: "SW", desc: "Sweet-16 mode" },
  USR: { syntax: "USR macro", desc: "User-defined directive" },
  XC: { syntax: "XC [OFF]", desc: "Extended opcodes (65C02)" },
  MX: { syntax: "MX %bits", desc: "Memory/index width (65816)" },
  TR: { syntax: "TR ON|OFF|ADR", desc: "Truncation control" },
  KBD: { syntax: "KBD prompt", desc: "Keyboard input during assembly" },
  PMC: { syntax: "PMC macro[,params]", desc: "Pseudo macro call" },
  PAG: { syntax: "PAG", desc: "Page eject in listing" },
  TTL: { syntax: "TTL text", desc: "Listing title" },
  SKP: { syntax: "SKP count", desc: "Skip lines in listing" },
  CHK: { syntax: "CHK", desc: "Checksum verification" },
  IF: { syntax: "IF expr", desc: "Conditional (alt syntax)" },
  ELUP: { syntax: "ELUP", desc: "End of LUP (alt syntax)" },
  END: { syntax: "END", desc: "End of source" },
  MAC: { syntax: "label MAC", desc: "Macro definition" },
  EOM: { syntax: "EOM", desc: "End of macro" },
  '<<<': { syntax: "<<<", desc: "End of macro (alt syntax)" },
  ADR: { syntax: "ADR addr", desc: "3-byte address" },
  ADRL: { syntax: "ADRL addr", desc: "4-byte address" },
  DB: { syntax: "DB byte[,byte]...", desc: "Define byte (alt)" },
  LNK: { syntax: "LNK filename", desc: "Link object file" },
  STR: { syntax: 'STR "text"', desc: "Length-prefixed string" },
  STRL: { syntax: 'STRL "text"', desc: "2-byte length-prefixed string" },
  REV: { syntax: 'REV "text"', desc: "Reversed string" },
};

// Build sorted autocomplete items for mnemonics + directives
const MNEMONIC_ITEMS = [];
for (const m of ALL_MNEMONICS) {
  const info = MNEMONIC_INFO[m] || { syntax: m, desc: "" };
  MNEMONIC_ITEMS.push({
    keyword: m,
    syntax: info.syntax,
    desc: info.desc,
    cssClass: getMnemonicClass(m),
    category: 'mnemonic',
  });
}
for (const d of DIRECTIVES) {
  const info = DIRECTIVE_INFO[d] || { syntax: d, desc: "" };
  MNEMONIC_ITEMS.push({
    keyword: d,
    syntax: info.syntax,
    desc: info.desc,
    cssClass: 'mer-directive',
    category: 'directive',
  });
}
MNEMONIC_ITEMS.sort((a, b) => a.keyword.localeCompare(b.keyword));


/**
 * MerlinSourceContext - Parses source to extract labels for autocomplete
 */
class MerlinSourceContext {
  constructor() {
    this.labels = []; // { name, line, type: 'global'|'local'|'equ' }
    this.parseTimer = null;
  }

  /**
   * Schedule a debounced parse
   */
  scheduleParse(text) {
    if (this.parseTimer) clearTimeout(this.parseTimer);
    this.parseTimer = setTimeout(() => this.parseSource(text), 300);
  }

  /**
   * Parse source text to extract label definitions
   */
  parseSource(text) {
    this.labels = [];
    const lines = text.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line || /^\s/.test(line)) continue; // no label on this line

      const trimmed = line.trim();
      if (!trimmed || trimmed[0] === '*' || trimmed[0] === ';') continue;

      // First non-whitespace token is the label
      const match = line.match(/^(\S+)/);
      if (!match) continue;

      const name = match[1];

      // Determine type
      const tokens = line.trim().split(/\s+/);
      const opcode = tokens.length >= 2 ? tokens[1].toUpperCase() : '';

      if (opcode === 'EQU') {
        this.labels.push({ name, line: i + 1, type: 'equ' });
      } else if (name[0] === ':' || name[0] === ']') {
        this.labels.push({ name, line: i + 1, type: 'local' });
      } else {
        this.labels.push({ name, line: i + 1, type: 'global' });
      }
    }
  }

  /**
   * Get label items matching a filter string
   */
  getLabels(filter) {
    const upper = filter.toUpperCase();
    return this.labels
      .filter(l => l.name.toUpperCase().startsWith(upper))
      .map(l => ({
        keyword: l.name,
        syntax: `Line ${l.line}`,
        desc: l.type === 'equ' ? 'Equate constant' : l.type === 'local' ? 'Local label' : 'Global label',
        cssClass: l.type === 'local' ? 'mer-local' : 'mer-label',
        category: 'label',
        labelType: l.type,
      }));
  }

  destroy() {
    if (this.parseTimer) clearTimeout(this.parseTimer);
  }
}


/**
 * MerlinAutocomplete - Dropdown UI for mnemonic and label completion
 */
class MerlinAutocomplete {
  constructor(textarea, container, sourceContext) {
    this.textarea = textarea;
    this.container = container;
    this.sourceContext = sourceContext;
    this.dropdown = null;
    this.listEl = null;
    this.hintEl = null;
    this.matches = [];
    this.selectedIndex = 0;
    this.isVisible = false;
    this.currentWord = '';
    this.wordStart = 0;
    this.isInserting = false;
    this.onAccept = null; // callback(keyword, column) after accepting

    this.createDropdown();
    this.bindEvents();
  }

  createDropdown() {
    this.dropdown = document.createElement('div');
    this.dropdown.className = 'asm-autocomplete-dropdown';
    this.dropdown.innerHTML = `
      <div class="autocomplete-list"></div>
      <div class="autocomplete-hint"></div>
    `;
    this.container.appendChild(this.dropdown);
    this.listEl = this.dropdown.querySelector('.autocomplete-list');
    this.hintEl = this.dropdown.querySelector('.autocomplete-hint');
  }

  bindEvents() {
    // Capture-phase keydown registered BEFORE MerlinEditorSupport's handler
    this.boundOnKeyDown = (e) => this.onKeyDown(e);
    this.textarea.addEventListener('keydown', this.boundOnKeyDown, true);

    this.textarea.addEventListener('blur', () => {
      setTimeout(() => this.hide(), 200);
    });

    this.listEl.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const item = e.target.closest('.autocomplete-item');
      if (item) {
        this.selectedIndex = parseInt(item.dataset.index, 10);
        this.insertSelected();
      }
    });

    this.listEl.addEventListener('mouseover', (e) => {
      const item = e.target.closest('.autocomplete-item');
      if (item) {
        this.selectItem(parseInt(item.dataset.index, 10));
      }
    });
  }

  /**
   * Called on input event from the support class
   */
  onInput() {
    if (this.isInserting) return;

    const { col, line, pos } = getCursorLineAndCol(this.textarea);
    const column = detectMerlinColumn(line, col);

    if (column === 'opcode') {
      this.handleOpcodeAutocomplete(col, line, pos);
    } else if (column === 'operand') {
      this.handleOperandAutocomplete(col, line, pos);
    } else {
      this.hide();
    }
  }

  handleOpcodeAutocomplete(col, line, pos) {
    // Extract the word being typed in the opcode column
    const word = this.extractWord(col, line);
    if (word.length < 1) {
      this.hide();
      return;
    }

    this.currentWord = word;
    this.wordStart = pos - word.length;

    const upper = word.toUpperCase();
    this.matches = MNEMONIC_ITEMS
      .filter(item => item.keyword.startsWith(upper))
      .slice(0, 12);

    this.selectedIndex = 0;
    if (this.matches.length > 0) {
      this.show();
      this.render();
    } else {
      this.hide();
    }
  }

  handleOperandAutocomplete(col, line, pos) {
    const word = this.extractWord(col, line);
    if (word.length < 1) {
      this.hide();
      return;
    }

    this.currentWord = word;
    this.wordStart = pos - word.length;

    this.matches = this.sourceContext.getLabels(word).slice(0, 12);
    this.selectedIndex = 0;

    if (this.matches.length > 0) {
      this.show();
      this.render();
    } else {
      this.hide();
    }
  }

  /**
   * Extract the current word being typed backwards from cursor col
   */
  extractWord(col, line) {
    let start = col;
    while (start > 0 && /[A-Za-z0-9_:$\]<>^]/.test(line[start - 1])) {
      start--;
    }
    // Skip leading # for immediate mode
    if (line[start] === '#') start++;
    return line.substring(start, col);
  }

  onKeyDown(e) {
    if (!this.isVisible) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        e.stopPropagation();
        this.selectItem(this.selectedIndex + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        e.stopPropagation();
        this.selectItem(this.selectedIndex - 1);
        break;
      case 'Tab':
        if (this.matches.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          this.insertSelected(true); // advance = true
        }
        break;
      case 'Enter':
        if (this.matches.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          this.insertSelected(false);
        }
        break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        this.hide();
        break;
    }
  }

  selectItem(index) {
    if (this.matches.length === 0) return;
    if (index < 0) index = this.matches.length - 1;
    if (index >= this.matches.length) index = 0;
    this.selectedIndex = index;
    this.render();
  }

  insertSelected(advance) {
    if (this.matches.length === 0) return;

    const selected = this.matches[this.selectedIndex];
    const text = this.textarea.value;
    const pos = this.textarea.selectionStart;
    const before = text.substring(0, this.wordStart);
    const after = text.substring(pos);

    this.isInserting = true;
    this.textarea.value = before + selected.keyword + after;
    const newPos = this.wordStart + selected.keyword.length;
    this.textarea.selectionStart = newPos;
    this.textarea.selectionEnd = newPos;

    this.hide();

    // Trigger input for highlighting
    this.textarea.dispatchEvent(new Event('input', { bubbles: true }));

    // Notify support class
    const { col } = getCursorLineAndCol(this.textarea);
    const column = detectMerlinColumn(this.textarea.value.substring(
      this.textarea.value.lastIndexOf('\n', this.textarea.selectionStart - 1) + 1,
      this.textarea.selectionStart
    ), col);

    if (this.onAccept) {
      this.onAccept(selected.keyword, column, advance);
    }

    setTimeout(() => { this.isInserting = false; }, 10);
    this.textarea.focus();
  }

  render() {
    this.listEl.innerHTML = this.matches.map((item, index) => {
      const sel = index === this.selectedIndex ? ' selected' : '';
      return `
        <div class="autocomplete-item${sel}" data-index="${index}" data-css-class="${item.cssClass}">
          <span class="autocomplete-keyword ${item.cssClass}">${this.highlightMatch(item.keyword)}</span>
          <span class="autocomplete-category">${item.category}</span>
        </div>
      `;
    }).join('');

    if (this.matches.length > 0) {
      const selected = this.matches[this.selectedIndex];
      this.hintEl.innerHTML = `
        <div class="hint-syntax">${selected.syntax}</div>
        <div class="hint-desc">${selected.desc}</div>
      `;
      this.hintEl.style.display = 'block';
    } else {
      this.hintEl.style.display = 'none';
    }

    const selectedEl = this.listEl.querySelector('.selected');
    if (selectedEl) selectedEl.scrollIntoView({ block: 'nearest' });
  }

  highlightMatch(keyword) {
    const len = this.currentWord.length;
    return `<span class="match">${keyword.substring(0, len)}</span>${keyword.substring(len)}`;
  }

  show() {
    if (this.isVisible) return;
    this.isVisible = true;
    this.dropdown.classList.add('visible');
    this.positionDropdown();
  }

  hide() {
    if (!this.isVisible) return;
    this.isVisible = false;
    this.dropdown.classList.remove('visible');
  }

  positionDropdown() {
    const text = this.textarea.value.substring(0, this.textarea.selectionStart);
    const lines = text.split('\n');
    const currentLine = lines.length - 1;
    const currentCol = lines[lines.length - 1].length;

    const style = getComputedStyle(this.textarea);
    const fontSize = parseFloat(style.fontSize) || 12;
    const charWidth = fontSize * 0.6;
    const lineHeight = parseFloat(style.lineHeight) || fontSize * 1.4;
    const paddingLeft = parseFloat(style.paddingLeft) || 8;
    const paddingTop = parseFloat(style.paddingTop) || 8;

    let left = paddingLeft + currentCol * charWidth;
    let top = paddingTop + (currentLine + 1) * lineHeight - this.textarea.scrollTop;

    const dropdownWidth = 260;
    const dropdownHeight = 280;

    if (left + dropdownWidth > this.container.clientWidth - 10) {
      left = this.container.clientWidth - dropdownWidth - 10;
    }
    left = Math.max(5, left);

    if (top + dropdownHeight > this.container.clientHeight) {
      top = Math.max(5, top - dropdownHeight - lineHeight);
    }

    this.dropdown.style.left = left + 'px';
    this.dropdown.style.top = top + 'px';
  }

  destroy() {
    if (this.boundOnKeyDown) {
      this.textarea.removeEventListener('keydown', this.boundOnKeyDown, true);
    }
    if (this.dropdown && this.dropdown.parentNode) {
      this.dropdown.parentNode.removeChild(this.dropdown);
    }
  }
}


/**
 * MerlinEditorSupport - Main coordinator for editor enhancements
 *
 * Provides: Tab/Shift+Tab column navigation, Smart Enter, auto-uppercase,
 * comment toggle, duplicate line, column indicator, autocomplete
 */
export class MerlinEditorSupport {
  constructor(textarea, container, options = {}) {
    this.textarea = textarea;
    this.container = container;
    this.onColumnChange = options.onColumnChange || null;
    this.onAssemble = options.onAssemble || null;

    this.sourceContext = new MerlinSourceContext();
    this.autocomplete = new MerlinAutocomplete(textarea, container, this.sourceContext);

    // Wire autocomplete accept callback
    this.autocomplete.onAccept = (keyword, column, advance) => {
      if (advance) {
        // After accepting in opcode column, advance to operand (col 14)
        this.advanceToColumn(14);
      }
      // Re-fire column change
      this.fireColumnChange();
    };

    this.bindEvents();

    // Initial parse
    this.sourceContext.parseSource(textarea.value);
    this.fireColumnChange();
  }

  bindEvents() {
    // Keydown handler (capture phase, registered AFTER autocomplete's)
    this.boundOnKeyDown = (e) => this.onKeyDown(e);
    this.textarea.addEventListener('keydown', this.boundOnKeyDown, true);

    // Input handler for auto-uppercase and autocomplete trigger
    this.boundOnInput = () => this.onInputEvent();
    this.textarea.addEventListener('input', this.boundOnInput);

    // Track cursor movement for column indicator
    this.textarea.addEventListener('click', () => this.fireColumnChange());
    this.textarea.addEventListener('keyup', () => this.fireColumnChange());
  }

  onKeyDown(e) {
    const isMod = e.ctrlKey || e.metaKey;

    // Ctrl/Cmd + Enter: assemble
    if (e.key === 'Enter' && isMod && !e.shiftKey) {
      e.preventDefault();
      if (this.onAssemble) this.onAssemble();
      return;
    }

    // Ctrl/Cmd + /: comment toggle
    if (e.key === '/' && isMod) {
      e.preventDefault();
      this.toggleComment();
      return;
    }

    // Ctrl/Cmd + D: duplicate line
    if ((e.key === 'd' || e.key === 'D') && isMod && !e.shiftKey) {
      e.preventDefault();
      this.duplicateLine();
      return;
    }

    // Tab / Shift+Tab: column navigation (only if autocomplete not visible)
    if (e.key === 'Tab' && !this.autocomplete.isVisible) {
      e.preventDefault();
      if (e.shiftKey) {
        this.tabBackward();
      } else {
        this.tabForward();
      }
      return;
    }

    // Enter: smart indent (only if autocomplete not visible)
    if (e.key === 'Enter' && !isMod && !this.autocomplete.isVisible) {
      e.preventDefault();
      this.smartEnter();
      return;
    }
  }

  onInputEvent() {
    // Auto-uppercase in opcode column
    this.autoUppercase();

    // Trigger autocomplete
    this.autocomplete.onInput();

    // Schedule source context parse
    this.sourceContext.scheduleParse(this.textarea.value);

    // Fire column change
    this.fireColumnChange();
  }

  /**
   * Tab forward to next column stop
   */
  tabForward() {
    const { lineStart, col, line } = getCursorLineAndCol(this.textarea);
    const nextCol = MERLIN_COLUMNS.find(c => c > col);
    const target = nextCol !== undefined ? nextCol : col + 4; // past comment, just add spaces

    this.padToColumn(lineStart, col, line, target);
    this.fireColumnChange();
  }

  /**
   * Shift+Tab backward to previous column stop
   */
  tabBackward() {
    const { lineStart, col } = getCursorLineAndCol(this.textarea);

    // Find previous column stop
    let target = 0;
    for (let i = MERLIN_COLUMNS.length - 1; i >= 0; i--) {
      if (MERLIN_COLUMNS[i] < col) {
        target = MERLIN_COLUMNS[i];
        break;
      }
    }

    const newPos = lineStart + target;
    this.textarea.selectionStart = newPos;
    this.textarea.selectionEnd = newPos;
    this.fireColumnChange();
  }

  /**
   * Pad the current line with spaces to reach target column
   */
  padToColumn(lineStart, currentCol, line, targetCol) {
    const pos = this.textarea.selectionStart;
    const text = this.textarea.value;

    if (currentCol < targetCol) {
      // Insert spaces to reach target
      const spaces = ' '.repeat(targetCol - currentCol);
      const before = text.substring(0, pos);
      const after = text.substring(pos);
      this.textarea.value = before + spaces + after;
      const newPos = pos + spaces.length;
      this.textarea.selectionStart = newPos;
      this.textarea.selectionEnd = newPos;
      this.textarea.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      // Already at or past target, just position cursor
      const newPos = lineStart + targetCol;
      this.textarea.selectionStart = newPos;
      this.textarea.selectionEnd = newPos;
    }
  }

  /**
   * Advance cursor to a specific column on the current line
   */
  advanceToColumn(targetCol) {
    const { lineStart, col, line } = getCursorLineAndCol(this.textarea);
    this.padToColumn(lineStart, col, line, targetCol);
    this.fireColumnChange();
  }

  /**
   * Smart Enter: new line pre-indented to col 9 (opcode), unless at col 0 or empty line
   */
  smartEnter() {
    const { lineStart, col, line, pos } = getCursorLineAndCol(this.textarea);
    const text = this.textarea.value;
    const trimmed = line.trim();

    // If on an empty line or cursor is at column 0 typing a label, new line at col 0
    const startAtZero = !trimmed || col === 0;
    const indent = startAtZero ? '' : ' '.repeat(9);

    const before = text.substring(0, pos);
    const after = text.substring(pos);
    this.textarea.value = before + '\n' + indent + after;

    const newPos = pos + 1 + indent.length;
    this.textarea.selectionStart = newPos;
    this.textarea.selectionEnd = newPos;
    this.textarea.dispatchEvent(new Event('input', { bubbles: true }));
    this.fireColumnChange();
  }

  /**
   * Auto-uppercase characters typed in the opcode column (cols 9-13)
   */
  autoUppercase() {
    if (this.autocomplete.isInserting) return;

    const { col, line, pos } = getCursorLineAndCol(this.textarea);
    // Only auto-uppercase in opcode column range
    if (col < 10 || col > 14) return; // col 10 means at least 1 char typed at col 9
    if (detectMerlinColumn(line, col - 1) !== 'opcode') return;

    const ch = this.textarea.value[pos - 1];
    if (!ch || !/[a-z]/.test(ch)) return;

    // Replace the character with uppercase
    const text = this.textarea.value;
    this.textarea.value = text.substring(0, pos - 1) + ch.toUpperCase() + text.substring(pos);
    this.textarea.selectionStart = pos;
    this.textarea.selectionEnd = pos;
    // Don't dispatch input here - we're already in the input handler
  }

  /**
   * Toggle comment (;) at column 0 of current or selected lines
   */
  toggleComment() {
    const text = this.textarea.value;
    const start = this.textarea.selectionStart;
    const end = this.textarea.selectionEnd;

    // Find line range
    const lineStartIdx = text.lastIndexOf('\n', start - 1) + 1;
    let lineEndIdx = text.indexOf('\n', end);
    if (lineEndIdx === -1) lineEndIdx = text.length;

    const block = text.substring(lineStartIdx, lineEndIdx);
    const lines = block.split('\n');

    // Check if all lines are commented
    const allCommented = lines.every(l => l.trimStart().startsWith(';') || !l.trim());

    let newLines;
    if (allCommented) {
      // Remove leading ;
      newLines = lines.map(l => {
        if (!l.trim()) return l;
        const idx = l.indexOf(';');
        return l.substring(0, idx) + l.substring(idx + 1);
      });
    } else {
      // Add ; at column 0
      newLines = lines.map(l => {
        if (!l.trim()) return l;
        return ';' + l;
      });
    }

    const newBlock = newLines.join('\n');
    const before = text.substring(0, lineStartIdx);
    const after = text.substring(lineEndIdx);
    this.textarea.value = before + newBlock + after;

    // Adjust selection
    const diff = newBlock.length - block.length;
    this.textarea.selectionStart = lineStartIdx;
    this.textarea.selectionEnd = lineStartIdx + newBlock.length;

    this.textarea.dispatchEvent(new Event('input', { bubbles: true }));
    this.fireColumnChange();
  }

  /**
   * Duplicate current line or selected lines below
   */
  duplicateLine() {
    const text = this.textarea.value;
    const start = this.textarea.selectionStart;
    const end = this.textarea.selectionEnd;

    const lineStartIdx = text.lastIndexOf('\n', start - 1) + 1;
    let lineEndIdx = text.indexOf('\n', end);
    if (lineEndIdx === -1) lineEndIdx = text.length;

    const block = text.substring(lineStartIdx, lineEndIdx);

    // Insert duplicate after the line(s)
    const before = text.substring(0, lineEndIdx);
    const after = text.substring(lineEndIdx);
    this.textarea.value = before + '\n' + block + after;

    // Move cursor to the duplicate
    const newStart = lineEndIdx + 1 + (start - lineStartIdx);
    const newEnd = lineEndIdx + 1 + (end - lineStartIdx);
    this.textarea.selectionStart = newStart;
    this.textarea.selectionEnd = newEnd;

    this.textarea.dispatchEvent(new Event('input', { bubbles: true }));
    this.fireColumnChange();
  }

  /**
   * Fire column change callback
   */
  fireColumnChange() {
    if (!this.onColumnChange) return;
    const { col, line } = getCursorLineAndCol(this.textarea);
    const name = detectMerlinColumn(line, col);
    this.onColumnChange(name, col);
  }

  destroy() {
    if (this.boundOnKeyDown) {
      this.textarea.removeEventListener('keydown', this.boundOnKeyDown, true);
    }
    if (this.boundOnInput) {
      this.textarea.removeEventListener('input', this.boundOnInput);
    }
    this.autocomplete.destroy();
    this.sourceContext.destroy();
  }
}
