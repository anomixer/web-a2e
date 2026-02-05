/*
 * assembler-editor-window.js - 65C02 assembler editor window
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { BaseWindow } from "../windows/base-window.js";
import { highlightMerlinSourceInline } from "../utils/merlin-highlighting.js";
import { MerlinEditorSupport } from "../utils/merlin-editor-support.js";
import { ROM_ROUTINES, ROM_CATEGORIES, searchRoutines, getRoutinesByCategory } from "../data/apple2-rom-routines.js";

export class AssemblerEditorWindow extends BaseWindow {
  constructor(wasmModule, breakpointManager) {
    super({
      id: "assembler-editor",
      title: "Assembler",
      defaultWidth: 640,
      defaultHeight: 600,
      minWidth: 480,
      minHeight: 400,
      defaultPosition: { x: 180, y: 60 },
    });
    this.wasmModule = wasmModule;
    this.bpManager = breakpointManager;
    this.lastAssembledSize = 0;
    this.lastOrigin = 0;
    this.errors = new Map(); // line number -> error message (from assembler)
    this.syntaxErrors = new Map(); // line number -> error message (from live validation)
    this.currentLine = -1; // Track current line for auto-assemble
    this.lineBytes = new Map(); // line number -> hex bytes string
    this.linePCs = new Map(); // line number -> PC address
    this.symbols = new Map(); // symbol name -> value (from last assembly)
    this.lineBreakpoints = new Map(); // line number -> breakpoint address
  }

  renderContent() {
    return `
      <div class="asm-editor-content">
        <div class="asm-toolbar">
          <div class="asm-toolbar-group asm-toolbar-actions">
            <button class="asm-btn asm-assemble-btn" title="Assemble (⌘/Ctrl+Enter)">
              <span class="asm-btn-icon">▶</span> Assemble
            </button>
            <button class="asm-btn asm-load-btn" disabled title="Load assembled code into memory">
              <span class="asm-btn-icon">↓</span> Load
            </button>
            <button class="asm-btn asm-rom-btn" title="ROM Routines Reference (F2)">
              <span class="asm-btn-icon">📖</span> ROM
            </button>
          </div>
          <div class="asm-toolbar-spacer"></div>
          <div class="asm-toolbar-group asm-toolbar-status">
            <span class="asm-status"></span>
          </div>
          <div class="asm-toolbar-group asm-toolbar-position">
            <span class="asm-cursor-position">Ln 1, Col 0</span>
            <span class="asm-column-indicator"></span>
          </div>
        </div>
        <div class="asm-split-container">
          <div class="asm-editor-pane">
            <div class="asm-editor-wrapper">
              <div class="asm-gutter-column">
                <div class="asm-gutter-header">
                  <span class="asm-gutter-header-bp" title="Breakpoints (F9 to toggle)"></span>
                  <span class="asm-gutter-header-ln">#</span>
                  <span class="asm-gutter-header-cyc">Cyc</span>
                  <span class="asm-gutter-header-bytes">Bytes</span>
                </div>
                <div class="asm-gutter-content"></div>
              </div>
              <div class="asm-editor-container">
                <div class="asm-editor-header">
                  <span class="asm-editor-header-label">Label</span>
                  <span class="asm-editor-header-opcode">Opcode</span>
                  <span class="asm-editor-header-operand">Operand</span>
                  <span class="asm-editor-header-comment">Comment</span>
                </div>
                <div class="asm-editor-scroll-area">
                  <div class="asm-column-guides">
                    <div class="asm-column-guide" data-col="9" title="Opcode column"></div>
                    <div class="asm-column-guide" data-col="14" title="Operand column"></div>
                    <div class="asm-column-guide" data-col="25" title="Comment column"></div>
                  </div>
                  <div class="asm-line-highlight"></div>
                  <pre class="asm-highlight" aria-hidden="true"></pre>
                  <div class="asm-errors-overlay"></div>
                  <textarea class="asm-textarea" spellcheck="false"></textarea>
                </div>
              </div>
            </div>
          </div>
          <div class="asm-splitter asm-splitter-h" data-direction="horizontal">
            <div class="asm-splitter-handle"></div>
          </div>
          <div class="asm-output-pane">
            <div class="asm-output-panels">
              <div class="asm-panel asm-symbols-panel">
                <div class="asm-panel-header">
                  <span class="asm-panel-title">Symbols</span>
                  <span class="asm-panel-count"></span>
                </div>
                <div class="asm-panel-content asm-symbols-content">
                  <div class="asm-panel-empty">
                    <div class="asm-empty-icon">{ }</div>
                    <div class="asm-empty-text">Symbols will appear here</div>
                  </div>
                </div>
              </div>
              <div class="asm-splitter asm-splitter-v" data-direction="vertical">
                <div class="asm-splitter-handle"></div>
              </div>
              <div class="asm-panel asm-hex-panel">
                <div class="asm-panel-header">
                  <span class="asm-panel-title">Hex Output</span>
                  <span class="asm-panel-count"></span>
                </div>
                <div class="asm-panel-content asm-hex-content">
                  <div class="asm-panel-empty">
                    <div class="asm-empty-icon">[ ]</div>
                    <div class="asm-empty-text">Machine code will appear here</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="asm-shortcuts-bar">
          <span class="asm-shortcut"><kbd>Tab</kbd> Next column</span>
          <span class="asm-shortcut"><kbd>⌘/</kbd> Comment</span>
          <span class="asm-shortcut"><kbd>⌘D</kbd> Duplicate</span>
          <span class="asm-shortcut"><kbd>⌘↵</kbd> Assemble</span>
          <span class="asm-shortcut"><kbd>F9</kbd> Breakpoint</span>
          <span class="asm-shortcut"><kbd>F2</kbd> ROM Reference</span>
        </div>
        <div class="asm-rom-panel hidden">
          <div class="asm-rom-header">
            <span class="asm-rom-title">ROM Routines</span>
            <button class="asm-rom-close" title="Close (Esc)">×</button>
          </div>
          <div class="asm-rom-search-bar">
            <input type="text" class="asm-rom-search" placeholder="Search routines..." spellcheck="false" />
            <select class="asm-rom-category">
              <option value="All">All Categories</option>
            </select>
          </div>
          <div class="asm-rom-list"></div>
          <div class="asm-rom-detail hidden">
            <div class="asm-rom-detail-header">
              <button class="asm-rom-back" title="Back to list">← Back</button>
              <span class="asm-rom-detail-name"></span>
            </div>
            <div class="asm-rom-detail-content"></div>
            <div class="asm-rom-detail-actions">
              <button class="asm-btn asm-rom-insert-equ">Insert EQU</button>
              <button class="asm-btn asm-rom-insert-jsr">Insert JSR</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  onContentRendered() {
    this.textarea = this.contentElement.querySelector(".asm-textarea");
    this.highlight = this.contentElement.querySelector(".asm-highlight");
    this.lineHighlight = this.contentElement.querySelector(".asm-line-highlight");
    this.errorsOverlay = this.contentElement.querySelector(".asm-errors-overlay");
    this.gutterContent = this.contentElement.querySelector(".asm-gutter-content");
    this.assembleBtn = this.contentElement.querySelector(".asm-assemble-btn");
    this.loadBtn = this.contentElement.querySelector(".asm-load-btn");
    this.statusSpan = this.contentElement.querySelector(".asm-status");
    this.columnIndicator = this.contentElement.querySelector(".asm-column-indicator");
    this.cursorPosition = this.contentElement.querySelector(".asm-cursor-position");
    this.symbolsContent = this.contentElement.querySelector(".asm-symbols-content");
    this.symbolsCount = this.contentElement.querySelector(".asm-symbols-panel .asm-panel-count");
    this.hexContent = this.contentElement.querySelector(".asm-hex-content");
    this.hexCount = this.contentElement.querySelector(".asm-hex-panel .asm-panel-count");
    this.columnGuides = this.contentElement.querySelectorAll(".asm-column-guide");
    this.editorHeader = this.contentElement.querySelector(".asm-editor-header");

    // ROM panel elements
    this.romBtn = this.contentElement.querySelector(".asm-rom-btn");
    this.romPanel = this.contentElement.querySelector(".asm-rom-panel");
    this.romSearch = this.contentElement.querySelector(".asm-rom-search");
    this.romCategory = this.contentElement.querySelector(".asm-rom-category");
    this.romList = this.contentElement.querySelector(".asm-rom-list");
    this.romDetail = this.contentElement.querySelector(".asm-rom-detail");
    this.romDetailName = this.contentElement.querySelector(".asm-rom-detail-name");
    this.romDetailContent = this.contentElement.querySelector(".asm-rom-detail-content");
    this.selectedRoutine = null;

    // Initialize ROM panel
    this.initRomPanel();

    const editorContainer = this.contentElement.querySelector(".asm-editor-scroll-area");

    // Position column guides and header labels based on character width
    this.positionColumnGuides();

    // Set placeholder with proper Merlin formatting
    this.setPlaceholder();

    // Sync highlighting on input
    this.textarea.addEventListener("input", () => {
      this.updateHighlighting();
      this.updateCurrentLineHighlight();
      this.updateGutter();
      this.updateCursorPosition();
    });

    // Sync scroll position
    this.textarea.addEventListener("scroll", () => {
      this.highlight.scrollTop = this.textarea.scrollTop;
      this.highlight.scrollLeft = this.textarea.scrollLeft;
      this.gutterContent.scrollTop = this.textarea.scrollTop;
      this.errorsOverlay.style.top = `-${this.textarea.scrollTop}px`;
      this.updateCurrentLineHighlight();
    });

    // Track cursor for line highlight and auto-format on line change
    this.textarea.addEventListener("click", () => {
      this.updateCurrentLineHighlight();
      this.checkLineChangeAndFormat();
      this.updateCursorPosition();
    });
    this.textarea.addEventListener("keyup", (e) => {
      // Check for navigation keys that might change lines
      if (["ArrowUp", "ArrowDown", "Enter", "PageUp", "PageDown", "Home", "End"].includes(e.key)) {
        this.checkLineChangeAndFormat();
        this.scrollCursorIntoView();
      }
      this.updateCursorPosition();
    });
    this.textarea.addEventListener("keydown", (e) => {
      requestAnimationFrame(() => {
        this.updateCurrentLineHighlight();
        this.updateCursorPosition();
        // Scroll for navigation keys
        if (["ArrowUp", "ArrowDown", "Enter", "PageUp", "PageDown", "Home", "End"].includes(e.key)) {
          this.scrollCursorIntoView();
        }
      });
    });
    this.textarea.addEventListener("focus", () => {
      this.lineHighlight.classList.add("visible");
      this.updateCurrentLineHighlight();
      this.currentLine = this.getCurrentLineNumber();
      this.updateCursorPosition();
    });
    this.textarea.addEventListener("blur", () => {
      this.lineHighlight.classList.remove("visible");
    });

    // Assemble button
    this.assembleBtn.addEventListener("click", () => this.doAssemble());

    // Load button
    this.loadBtn.addEventListener("click", () => this.doLoad());

    // Editor support (Tab nav, smart enter, autocomplete, etc.)
    this.editorSupport = new MerlinEditorSupport(this.textarea, editorContainer, {
      onColumnChange: (name, col) => this.updateColumnIndicator(name, col),
      onAssemble: () => this.doAssemble(),
    });

    // Splitters
    this.initSplitters();

    // Reposition column guides on window resize
    const resizeObserver = new ResizeObserver(() => {
      this.positionColumnGuides();
    });
    resizeObserver.observe(editorContainer);

    // Gutter click handler for breakpoints
    this.gutterContent.addEventListener("click", (e) => {
      const gutterLine = e.target.closest(".asm-gutter-line");
      if (gutterLine) {
        const lineNumber = parseInt(gutterLine.dataset.line, 10);
        if (lineNumber) {
          this.toggleBreakpoint(lineNumber);
        }
      }
    });

    // F9 keyboard shortcut for breakpoint toggle, F2 for ROM reference
    this.textarea.addEventListener("keydown", (e) => {
      if (e.key === "F9") {
        e.preventDefault();
        const lineNumber = this.getCurrentLineNumber();
        this.toggleBreakpoint(lineNumber);
      } else if (e.key === "F2") {
        e.preventDefault();
        this.toggleRomPanel();
      }
    });

    // Listen for breakpoint changes from the manager
    if (this.bpManager) {
      this.bpManager.onChange(() => this.syncBreakpointsFromManager());
    }

    this.updateHighlighting();
    this.validateAllLines();
    this.encodeAllLineBytes();
    this.updateGutter();
    this.updateCursorPosition();
  }

  setPlaceholder() {
    // Set a well-formatted Hello World example as placeholder
    const example = `**********************************
*                                *
*      HELLO WORLD FOR 6502      *
*    APPLE ][, MERLIN ASSEMBLER  *
*                                *
**********************************

STROUT   EQU  $DB3A      ;Outputs AY-pointed null-terminated string

         ORG  $0800      ;Standard BASIC program area

START    LDY  #>HELLO
         LDA  #<HELLO
         JMP  STROUT

HELLO    ASC  "HELLO WORLD!!!!!!",00`;
    this.textarea.placeholder = example;
  }

  positionColumnGuides() {
    // Calculate character width based on font metrics
    const style = getComputedStyle(this.textarea);
    const fontSize = parseFloat(style.fontSize) || 12;
    const charWidth = fontSize * 0.6; // Approximate monospace character width
    const paddingLeft = parseFloat(style.paddingLeft) || 8;

    // Position column guide lines
    this.columnGuides.forEach(guide => {
      const col = parseInt(guide.dataset.col, 10);
      guide.style.left = `${paddingLeft + col * charWidth}px`;
    });

    // Position header labels at Merlin column positions
    if (this.editorHeader) {
      const labelEl = this.editorHeader.querySelector('.asm-editor-header-label');
      const opcodeEl = this.editorHeader.querySelector('.asm-editor-header-opcode');
      const operandEl = this.editorHeader.querySelector('.asm-editor-header-operand');
      const commentEl = this.editorHeader.querySelector('.asm-editor-header-comment');

      if (labelEl) labelEl.style.left = `${paddingLeft}px`;
      if (opcodeEl) opcodeEl.style.left = `${paddingLeft + 9 * charWidth}px`;
      if (operandEl) operandEl.style.left = `${paddingLeft + 14 * charWidth}px`;
      if (commentEl) commentEl.style.left = `${paddingLeft + 25 * charWidth}px`;
    }
  }

  initSplitters() {
    const splitters = this.contentElement.querySelectorAll(".asm-splitter");
    for (const splitter of splitters) {
      splitter.addEventListener("mousedown", (e) => this.onSplitterMouseDown(e, splitter));
    }
  }

  onSplitterMouseDown(e, splitter) {
    e.preventDefault();
    const direction = splitter.dataset.direction;
    const isHorizontal = direction === "horizontal";

    const container = splitter.parentElement;
    const prevEl = splitter.previousElementSibling;
    const nextEl = splitter.nextElementSibling;

    const containerRect = container.getBoundingClientRect();
    const startPos = isHorizontal ? e.clientY : e.clientX;
    const prevSize = isHorizontal ? prevEl.getBoundingClientRect().height : prevEl.getBoundingClientRect().width;

    const totalSize = isHorizontal
      ? containerRect.height - splitter.offsetHeight
      : containerRect.width - splitter.offsetWidth;

    const minSize = 60;

    const onMouseMove = (e) => {
      const currentPos = isHorizontal ? e.clientY : e.clientX;
      const delta = currentPos - startPos;
      let newPrevSize = prevSize + delta;

      // Clamp
      newPrevSize = Math.max(minSize, Math.min(totalSize - minSize, newPrevSize));

      const prevPercent = (newPrevSize / totalSize) * 100;
      const nextPercent = 100 - prevPercent;

      prevEl.style.flex = `0 0 ${prevPercent}%`;
      nextEl.style.flex = `0 0 ${nextPercent}%`;
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.body.style.cursor = isHorizontal ? "row-resize" : "col-resize";
    document.body.style.userSelect = "none";
  }

  updateColumnIndicator(name, col) {
    if (!this.columnIndicator) return;
    const displayNames = {
      label: 'Label',
      opcode: 'Opcode',
      operand: 'Operand',
      comment: 'Comment',
    };
    const display = displayNames[name] || name;
    this.columnIndicator.textContent = display;
    this.columnIndicator.className = `asm-column-indicator asm-col-${name}`;
  }

  updateCursorPosition() {
    if (!this.cursorPosition || !this.textarea) return;
    const text = this.textarea.value.substring(0, this.textarea.selectionStart);
    const lines = text.split('\n');
    const lineNum = lines.length;
    const col = lines[lines.length - 1].length;
    this.cursorPosition.textContent = `Ln ${lineNum}, Col ${col}`;
  }

  /**
   * Scroll the textarea to keep the cursor line visible
   */
  scrollCursorIntoView() {
    if (!this.textarea) return;

    const text = this.textarea.value.substring(0, this.textarea.selectionStart);
    const lineIndex = text.split('\n').length - 1;

    const style = getComputedStyle(this.textarea);
    const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.4;
    const paddingTop = parseFloat(style.paddingTop) || 8;
    const paddingBottom = parseFloat(style.paddingBottom) || 8;

    const cursorTop = paddingTop + lineIndex * lineHeight;
    const cursorBottom = cursorTop + lineHeight;

    const viewportTop = this.textarea.scrollTop;
    const viewportBottom = viewportTop + this.textarea.clientHeight - paddingBottom;

    // Scroll up if cursor is above viewport
    if (cursorTop < viewportTop + paddingTop) {
      this.textarea.scrollTop = cursorTop - paddingTop;
    }
    // Scroll down if cursor is below viewport
    else if (cursorBottom > viewportBottom) {
      this.textarea.scrollTop = cursorBottom - this.textarea.clientHeight + paddingBottom + paddingTop;
    }
  }

  updateCurrentLineHighlight() {
    if (!this.lineHighlight || !this.textarea) return;
    const text = this.textarea.value.substring(0, this.textarea.selectionStart);
    const lineIndex = text.split("\n").length - 1;
    const style = getComputedStyle(this.textarea);
    const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.4;
    const paddingTop = parseFloat(style.paddingTop) || 0;
    const top = paddingTop + lineIndex * lineHeight - this.textarea.scrollTop;
    this.lineHighlight.style.top = `${top}px`;
    this.lineHighlight.style.height = `${lineHeight}px`;
  }

  getCurrentLineNumber() {
    if (!this.textarea) return 0;
    const text = this.textarea.value.substring(0, this.textarea.selectionStart);
    return text.split("\n").length;
  }

  checkLineChangeAndFormat() {
    const newLine = this.getCurrentLineNumber();
    if (newLine !== this.currentLine && this.currentLine !== -1) {
      // Format, validate, and encode the line we're leaving
      this.formatLine(this.currentLine);
      this.validateLine(this.currentLine);
      this.encodeLineBytes(this.currentLine);
      this.updateGutter();
      this.updateErrorsOverlay();
      this.currentLine = newLine;
    } else {
      this.currentLine = newLine;
    }
  }

  formatLine(lineNumber) {
    if (!this.textarea) return;

    const lines = this.textarea.value.split('\n');
    if (lineNumber < 1 || lineNumber > lines.length) return;

    const lineIndex = lineNumber - 1;
    const line = lines[lineIndex];

    // Skip empty lines or comment-only lines
    if (!line.trim() || line.trim().startsWith(';') || line.trim().startsWith('*')) {
      return;
    }

    // Parse the line into components
    const parsed = this.parseLine(line);
    if (!parsed) return;

    // Rebuild with proper column alignment
    const formatted = this.buildFormattedLine(parsed);

    // Only update if different
    if (formatted !== line) {
      lines[lineIndex] = formatted;
      const cursorPos = this.textarea.selectionStart;
      this.textarea.value = lines.join('\n');
      this.textarea.selectionStart = this.textarea.selectionEnd = cursorPos;
      this.updateHighlighting();
    }
  }

  formatAllLines() {
    if (!this.textarea) return;

    const lines = this.textarea.value.split('\n');
    let changed = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Skip empty lines or comment-only lines
      if (!line.trim() || line.trim().startsWith(';') || line.trim().startsWith('*')) {
        continue;
      }

      // Parse the line into components
      const parsed = this.parseLine(line);
      if (!parsed) continue;

      // Rebuild with proper column alignment
      const formatted = this.buildFormattedLine(parsed);

      if (formatted !== line) {
        lines[i] = formatted;
        changed = true;
      }
    }

    if (changed) {
      const cursorPos = this.textarea.selectionStart;
      this.textarea.value = lines.join('\n');
      this.textarea.selectionStart = this.textarea.selectionEnd = cursorPos;
      this.updateHighlighting();
    }
  }

  parseLine(line) {
    // Merlin column layout: Label(0), Opcode(9), Operand(14), Comment(25+)
    let label = '';
    let opcode = '';
    let operand = '';
    let comment = '';

    // Check for comment at start of line (full-line comment)
    if (line.trim().startsWith(';') || line.trim().startsWith('*')) {
      return null;
    }

    // Find comment (starts with ;)
    let commentIdx = -1;
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' || ch === "'") inQuote = !inQuote;
      if (ch === ';' && !inQuote) {
        commentIdx = i;
        break;
      }
    }

    let mainPart = commentIdx >= 0 ? line.substring(0, commentIdx) : line;
    comment = commentIdx >= 0 ? line.substring(commentIdx) : '';

    // Check if line starts with whitespace (no label)
    const startsWithSpace = mainPart.length > 0 && (mainPart[0] === ' ' || mainPart[0] === '\t');

    // Split main part by whitespace
    const tokens = mainPart.trim().split(/\s+/);

    if (tokens.length === 0 || (tokens.length === 1 && tokens[0] === '')) {
      return null;
    }

    if (startsWithSpace) {
      // No label - first token is opcode
      opcode = tokens[0] || '';
      operand = tokens.slice(1).join(' ');
    } else {
      // First token is label
      label = tokens[0] || '';
      opcode = tokens[1] || '';
      operand = tokens.slice(2).join(' ');
    }

    return { label, opcode, operand, comment };
  }

  buildFormattedLine(parsed) {
    const { label, opcode, operand, comment } = parsed;

    // Column positions: Label=0, Opcode=9, Operand=14, Comment=25
    let result = '';

    // Label column (0-8)
    result = label.padEnd(9, ' ');

    // Opcode column (9-13)
    if (opcode) {
      result = result.substring(0, 9) + opcode.toUpperCase().padEnd(5, ' ');
    }

    // Operand column (14-24)
    if (operand) {
      result = result.substring(0, 14) + operand;
    }

    // Comment column (25+)
    if (comment) {
      // Ensure we're at least at column 25 for comments, or add space after operand
      const currentLen = result.trimEnd().length;
      if (currentLen < 25) {
        result = result.trimEnd().padEnd(25, ' ') + comment;
      } else {
        result = result.trimEnd() + ' ' + comment;
      }
    }

    return result.trimEnd();
  }

  // 65C02 instruction info: { cycles, bytes } by mnemonic
  // Cycles shown are base cycles (some modes add +1 for page crossing)
  getInstructionInfo() {
    return {
      // Branch / Flow
      'JMP': { cycles: 3, bytes: 3 }, 'JSR': { cycles: 6, bytes: 3 },
      'BCC': { cycles: 2, bytes: 2 }, 'BCS': { cycles: 2, bytes: 2 },
      'BEQ': { cycles: 2, bytes: 2 }, 'BMI': { cycles: 2, bytes: 2 },
      'BNE': { cycles: 2, bytes: 2 }, 'BPL': { cycles: 2, bytes: 2 },
      'BRA': { cycles: 3, bytes: 2 }, 'BVC': { cycles: 2, bytes: 2 },
      'BVS': { cycles: 2, bytes: 2 }, 'RTS': { cycles: 6, bytes: 1 },
      'RTI': { cycles: 6, bytes: 1 }, 'BRK': { cycles: 7, bytes: 1 },
      // Load / Store
      'LDA': { cycles: 2, bytes: 2 }, 'LDX': { cycles: 2, bytes: 2 },
      'LDY': { cycles: 2, bytes: 2 }, 'STA': { cycles: 3, bytes: 2 },
      'STX': { cycles: 3, bytes: 2 }, 'STY': { cycles: 3, bytes: 2 },
      'STZ': { cycles: 3, bytes: 2 },
      // Math / Logic
      'ADC': { cycles: 2, bytes: 2 }, 'SBC': { cycles: 2, bytes: 2 },
      'AND': { cycles: 2, bytes: 2 }, 'ORA': { cycles: 2, bytes: 2 },
      'EOR': { cycles: 2, bytes: 2 }, 'ASL': { cycles: 2, bytes: 1 },
      'LSR': { cycles: 2, bytes: 1 }, 'ROL': { cycles: 2, bytes: 1 },
      'ROR': { cycles: 2, bytes: 1 }, 'INC': { cycles: 2, bytes: 1 },
      'DEC': { cycles: 2, bytes: 1 }, 'INA': { cycles: 2, bytes: 1 },
      'DEA': { cycles: 2, bytes: 1 }, 'INX': { cycles: 2, bytes: 1 },
      'DEX': { cycles: 2, bytes: 1 }, 'INY': { cycles: 2, bytes: 1 },
      'DEY': { cycles: 2, bytes: 1 }, 'CMP': { cycles: 2, bytes: 2 },
      'CPX': { cycles: 2, bytes: 2 }, 'CPY': { cycles: 2, bytes: 2 },
      'BIT': { cycles: 2, bytes: 2 }, 'TRB': { cycles: 5, bytes: 2 },
      'TSB': { cycles: 5, bytes: 2 },
      // Stack / Transfer
      'PHA': { cycles: 3, bytes: 1 }, 'PHP': { cycles: 3, bytes: 1 },
      'PHX': { cycles: 3, bytes: 1 }, 'PHY': { cycles: 3, bytes: 1 },
      'PLA': { cycles: 4, bytes: 1 }, 'PLP': { cycles: 4, bytes: 1 },
      'PLX': { cycles: 4, bytes: 1 }, 'PLY': { cycles: 4, bytes: 1 },
      'TAX': { cycles: 2, bytes: 1 }, 'TAY': { cycles: 2, bytes: 1 },
      'TSX': { cycles: 2, bytes: 1 }, 'TXA': { cycles: 2, bytes: 1 },
      'TXS': { cycles: 2, bytes: 1 }, 'TYA': { cycles: 2, bytes: 1 },
      // Flags
      'CLC': { cycles: 2, bytes: 1 }, 'CLD': { cycles: 2, bytes: 1 },
      'CLI': { cycles: 2, bytes: 1 }, 'CLV': { cycles: 2, bytes: 1 },
      'SEC': { cycles: 2, bytes: 1 }, 'SED': { cycles: 2, bytes: 1 },
      'SEI': { cycles: 2, bytes: 1 }, 'NOP': { cycles: 2, bytes: 1 },
      'WAI': { cycles: 3, bytes: 1 }, 'STP': { cycles: 3, bytes: 1 },
      // 65C02 BBR/BBS (3 bytes: opcode, zp address, relative offset)
      'BBR0': { cycles: 5, bytes: 3 }, 'BBR1': { cycles: 5, bytes: 3 },
      'BBR2': { cycles: 5, bytes: 3 }, 'BBR3': { cycles: 5, bytes: 3 },
      'BBR4': { cycles: 5, bytes: 3 }, 'BBR5': { cycles: 5, bytes: 3 },
      'BBR6': { cycles: 5, bytes: 3 }, 'BBR7': { cycles: 5, bytes: 3 },
      'BBS0': { cycles: 5, bytes: 3 }, 'BBS1': { cycles: 5, bytes: 3 },
      'BBS2': { cycles: 5, bytes: 3 }, 'BBS3': { cycles: 5, bytes: 3 },
      'BBS4': { cycles: 5, bytes: 3 }, 'BBS5': { cycles: 5, bytes: 3 },
      'BBS6': { cycles: 5, bytes: 3 }, 'BBS7': { cycles: 5, bytes: 3 },
      // 65C02 RMB/SMB (2 bytes: opcode, zp address)
      'RMB0': { cycles: 5, bytes: 2 }, 'RMB1': { cycles: 5, bytes: 2 },
      'RMB2': { cycles: 5, bytes: 2 }, 'RMB3': { cycles: 5, bytes: 2 },
      'RMB4': { cycles: 5, bytes: 2 }, 'RMB5': { cycles: 5, bytes: 2 },
      'RMB6': { cycles: 5, bytes: 2 }, 'RMB7': { cycles: 5, bytes: 2 },
      'SMB0': { cycles: 5, bytes: 2 }, 'SMB1': { cycles: 5, bytes: 2 },
      'SMB2': { cycles: 5, bytes: 2 }, 'SMB3': { cycles: 5, bytes: 2 },
      'SMB4': { cycles: 5, bytes: 2 }, 'SMB5': { cycles: 5, bytes: 2 },
      'SMB6': { cycles: 5, bytes: 2 }, 'SMB7': { cycles: 5, bytes: 2 },
    };
  }

  updateGutter() {
    if (!this.gutterContent || !this.textarea) return;

    const lines = this.textarea.value.split('\n');
    const instrInfo = this.getInstructionInfo();
    const opcodeTable = this.getOpcodeTable();
    const gutterLines = [];
    const numWidth = Math.max(2, String(lines.length).length);

    for (let i = 0; i < lines.length; i++) {
      const lineNum = String(i + 1).padStart(numWidth, ' ');
      const lineNumber = i + 1;
      const parsed = this.parseLine(lines[i]);
      let cycles = '';
      let bytesHex = this.lineBytes.get(lineNumber) || '';
      const hasError = this.errors.has(lineNumber) || this.syntaxErrors.has(lineNumber);
      const errorClass = hasError ? ' asm-gutter-error' : '';

      // Check if this line has an actual instruction (not a directive, comment, or label-only)
      const isInstruction = parsed && parsed.opcode && opcodeTable[parsed.opcode.toUpperCase()];

      // Check for breakpoint at this line's address (only for instruction lines)
      const lineAddr = this.linePCs.get(lineNumber);
      const hasBreakpoint = isInstruction && lineAddr !== undefined && this.bpManager?.has(lineAddr);
      const bpClass = hasBreakpoint ? ' asm-gutter-bp' : '';

      // Breakpoint indicator: red dot for breakpoint, clickable space for instruction lines, nothing for non-instructions
      let bpIndicator;
      if (hasBreakpoint) {
        bpIndicator = '<span class="asm-gutter-bp-dot"></span>';
      } else if (isInstruction) {
        bpIndicator = '<span class="asm-gutter-bp-space asm-gutter-bp-clickable"></span>';
      } else {
        bpIndicator = '<span class="asm-gutter-bp-space"></span>';
      }

      if (parsed && parsed.opcode) {
        const mnem = parsed.opcode.toUpperCase();
        const info = instrInfo[mnem];
        if (info) {
          cycles = String(info.cycles);
        }
      }

      gutterLines.push(
        `<div class="asm-gutter-line${errorClass}${bpClass}" data-line="${lineNumber}">` +
        `${bpIndicator}` +
        `<span class="asm-gutter-ln">${lineNum}</span>` +
        `<span class="asm-gutter-cyc">${cycles || ''}</span>` +
        `<span class="asm-gutter-bytes">${bytesHex || ''}</span>` +
        `</div>`
      );
    }

    this.gutterContent.innerHTML = gutterLines.join('');
  }

  // Compatibility alias
  updateCyclesGutter() {
    this.updateGutter();
  }

  // 65C02 opcode encoding table: mnemonic -> { mode: opcode }
  // Modes: IMP, ACC, IMM, ZP, ZPX, ZPY, ABS, ABX, ABY, IND, IZX, IZY, ZPI, REL
  getOpcodeTable() {
    return {
      'ADC': { IMM: 0x69, ZP: 0x65, ZPX: 0x75, ABS: 0x6D, ABX: 0x7D, ABY: 0x79, IZX: 0x61, IZY: 0x71, ZPI: 0x72 },
      'AND': { IMM: 0x29, ZP: 0x25, ZPX: 0x35, ABS: 0x2D, ABX: 0x3D, ABY: 0x39, IZX: 0x21, IZY: 0x31, ZPI: 0x32 },
      'ASL': { IMP: 0x0A, ACC: 0x0A, ZP: 0x06, ZPX: 0x16, ABS: 0x0E, ABX: 0x1E },
      'BCC': { REL: 0x90 }, 'BCS': { REL: 0xB0 }, 'BEQ': { REL: 0xF0 },
      'BIT': { IMM: 0x89, ZP: 0x24, ZPX: 0x34, ABS: 0x2C, ABX: 0x3C },
      'BMI': { REL: 0x30 }, 'BNE': { REL: 0xD0 }, 'BPL': { REL: 0x10 },
      'BRA': { REL: 0x80 }, 'BRK': { IMP: 0x00 }, 'BVC': { REL: 0x50 }, 'BVS': { REL: 0x70 },
      'CLC': { IMP: 0x18 }, 'CLD': { IMP: 0xD8 }, 'CLI': { IMP: 0x58 }, 'CLV': { IMP: 0xB8 },
      'CMP': { IMM: 0xC9, ZP: 0xC5, ZPX: 0xD5, ABS: 0xCD, ABX: 0xDD, ABY: 0xD9, IZX: 0xC1, IZY: 0xD1, ZPI: 0xD2 },
      'CPX': { IMM: 0xE0, ZP: 0xE4, ABS: 0xEC },
      'CPY': { IMM: 0xC0, ZP: 0xC4, ABS: 0xCC },
      'DEC': { IMP: 0x3A, ACC: 0x3A, ZP: 0xC6, ZPX: 0xD6, ABS: 0xCE, ABX: 0xDE },
      'DEA': { IMP: 0x3A }, 'DEX': { IMP: 0xCA }, 'DEY': { IMP: 0x88 },
      'EOR': { IMM: 0x49, ZP: 0x45, ZPX: 0x55, ABS: 0x4D, ABX: 0x5D, ABY: 0x59, IZX: 0x41, IZY: 0x51, ZPI: 0x52 },
      'INC': { IMP: 0x1A, ACC: 0x1A, ZP: 0xE6, ZPX: 0xF6, ABS: 0xEE, ABX: 0xFE },
      'INA': { IMP: 0x1A }, 'INX': { IMP: 0xE8 }, 'INY': { IMP: 0xC8 },
      'JMP': { ABS: 0x4C, IND: 0x6C, IAX: 0x7C },
      'JSR': { ABS: 0x20 },
      'LDA': { IMM: 0xA9, ZP: 0xA5, ZPX: 0xB5, ABS: 0xAD, ABX: 0xBD, ABY: 0xB9, IZX: 0xA1, IZY: 0xB1, ZPI: 0xB2 },
      'LDX': { IMM: 0xA2, ZP: 0xA6, ZPY: 0xB6, ABS: 0xAE, ABY: 0xBE },
      'LDY': { IMM: 0xA0, ZP: 0xA4, ZPX: 0xB4, ABS: 0xAC, ABX: 0xBC },
      'LSR': { IMP: 0x4A, ACC: 0x4A, ZP: 0x46, ZPX: 0x56, ABS: 0x4E, ABX: 0x5E },
      'NOP': { IMP: 0xEA },
      'ORA': { IMM: 0x09, ZP: 0x05, ZPX: 0x15, ABS: 0x0D, ABX: 0x1D, ABY: 0x19, IZX: 0x01, IZY: 0x11, ZPI: 0x12 },
      'PHA': { IMP: 0x48 }, 'PHP': { IMP: 0x08 }, 'PHX': { IMP: 0xDA }, 'PHY': { IMP: 0x5A },
      'PLA': { IMP: 0x68 }, 'PLP': { IMP: 0x28 }, 'PLX': { IMP: 0xFA }, 'PLY': { IMP: 0x7A },
      'ROL': { IMP: 0x2A, ACC: 0x2A, ZP: 0x26, ZPX: 0x36, ABS: 0x2E, ABX: 0x3E },
      'ROR': { IMP: 0x6A, ACC: 0x6A, ZP: 0x66, ZPX: 0x76, ABS: 0x6E, ABX: 0x7E },
      'RTI': { IMP: 0x40 }, 'RTS': { IMP: 0x60 },
      'SBC': { IMM: 0xE9, ZP: 0xE5, ZPX: 0xF5, ABS: 0xED, ABX: 0xFD, ABY: 0xF9, IZX: 0xE1, IZY: 0xF1, ZPI: 0xF2 },
      'SEC': { IMP: 0x38 }, 'SED': { IMP: 0xF8 }, 'SEI': { IMP: 0x78 },
      'STA': { ZP: 0x85, ZPX: 0x95, ABS: 0x8D, ABX: 0x9D, ABY: 0x99, IZX: 0x81, IZY: 0x91, ZPI: 0x92 },
      'STX': { ZP: 0x86, ZPY: 0x96, ABS: 0x8E },
      'STY': { ZP: 0x84, ZPX: 0x94, ABS: 0x8C },
      'STZ': { ZP: 0x64, ZPX: 0x74, ABS: 0x9C, ABX: 0x9E },
      'TAX': { IMP: 0xAA }, 'TAY': { IMP: 0xA8 }, 'TRB': { ZP: 0x14, ABS: 0x1C },
      'TSB': { ZP: 0x04, ABS: 0x0C }, 'TSX': { IMP: 0xBA }, 'TXA': { IMP: 0x8A },
      'TXS': { IMP: 0x9A }, 'TYA': { IMP: 0x98 },
      'WAI': { IMP: 0xCB }, 'STP': { IMP: 0xDB },
      // BBR/BBS (zero page relative - 3 bytes)
      'BBR0': { ZPR: 0x0F }, 'BBR1': { ZPR: 0x1F }, 'BBR2': { ZPR: 0x2F }, 'BBR3': { ZPR: 0x3F },
      'BBR4': { ZPR: 0x4F }, 'BBR5': { ZPR: 0x5F }, 'BBR6': { ZPR: 0x6F }, 'BBR7': { ZPR: 0x7F },
      'BBS0': { ZPR: 0x8F }, 'BBS1': { ZPR: 0x9F }, 'BBS2': { ZPR: 0xAF }, 'BBS3': { ZPR: 0xBF },
      'BBS4': { ZPR: 0xCF }, 'BBS5': { ZPR: 0xDF }, 'BBS6': { ZPR: 0xEF }, 'BBS7': { ZPR: 0xFF },
      // RMB/SMB (zero page - 2 bytes)
      'RMB0': { ZP: 0x07 }, 'RMB1': { ZP: 0x17 }, 'RMB2': { ZP: 0x27 }, 'RMB3': { ZP: 0x37 },
      'RMB4': { ZP: 0x47 }, 'RMB5': { ZP: 0x57 }, 'RMB6': { ZP: 0x67 }, 'RMB7': { ZP: 0x77 },
      'SMB0': { ZP: 0x87 }, 'SMB1': { ZP: 0x97 }, 'SMB2': { ZP: 0xA7 }, 'SMB3': { ZP: 0xB7 },
      'SMB4': { ZP: 0xC7 }, 'SMB5': { ZP: 0xD7 }, 'SMB6': { ZP: 0xE7 }, 'SMB7': { ZP: 0xF7 },
    };
  }

  /**
   * Parse an operand and determine addressing mode + value
   * Returns { mode, value, value2 } or null if unparseable
   */
  parseOperand(operand, mnemonic) {
    if (!operand || operand.trim() === '') {
      return { mode: 'IMP', value: null };
    }

    operand = operand.trim();
    const opcodes = this.getOpcodeTable()[mnemonic];
    if (!opcodes) return null;

    // Immediate: #$xx or #value
    if (operand.startsWith('#')) {
      const val = this.parseValue(operand.substring(1));
      if (val !== null) {
        return { mode: 'IMM', value: val & 0xFF };
      }
      return null; // Unresolved symbol
    }

    // Indirect modes
    if (operand.startsWith('(')) {
      // (addr,X) - Indexed indirect
      if (operand.match(/^\([^)]+,\s*X\)$/i)) {
        const inner = operand.match(/^\(([^,]+),/i)[1];
        const val = this.parseValue(inner);
        if (val !== null) return { mode: 'IZX', value: val & 0xFF };
        return null;
      }
      // (addr),Y - Indirect indexed
      if (operand.match(/^\([^)]+\)\s*,\s*Y$/i)) {
        const inner = operand.match(/^\(([^)]+)\)/i)[1];
        const val = this.parseValue(inner);
        if (val !== null) return { mode: 'IZY', value: val & 0xFF };
        return null;
      }
      // (addr,X) for JMP
      if (operand.match(/^\([^)]+,\s*X\)$/i) && opcodes.IAX) {
        const inner = operand.match(/^\(([^,]+),/i)[1];
        const val = this.parseValue(inner);
        if (val !== null) return { mode: 'IAX', value: val & 0xFFFF };
        return null;
      }
      // (addr) - Indirect (JMP) or Zero Page Indirect (65C02)
      if (operand.match(/^\([^)]+\)$/)) {
        const inner = operand.match(/^\(([^)]+)\)$/)[1];
        const val = this.parseValue(inner);
        if (val !== null) {
          if (opcodes.IND && val > 0xFF) return { mode: 'IND', value: val & 0xFFFF };
          if (opcodes.ZPI) return { mode: 'ZPI', value: val & 0xFF };
          if (opcodes.IND) return { mode: 'IND', value: val & 0xFFFF };
        }
        return null;
      }
    }

    // addr,X or addr,Y
    if (operand.match(/,\s*X$/i)) {
      const addrPart = operand.replace(/,\s*X$/i, '').trim();
      const val = this.parseValue(addrPart);
      if (val !== null) {
        if (val <= 0xFF && opcodes.ZPX) return { mode: 'ZPX', value: val };
        if (opcodes.ABX) return { mode: 'ABX', value: val & 0xFFFF };
      }
      return null;
    }
    if (operand.match(/,\s*Y$/i)) {
      const addrPart = operand.replace(/,\s*Y$/i, '').trim();
      const val = this.parseValue(addrPart);
      if (val !== null) {
        if (val <= 0xFF && opcodes.ZPY) return { mode: 'ZPY', value: val };
        if (opcodes.ABY) return { mode: 'ABY', value: val & 0xFFFF };
      }
      return null;
    }

    // Accumulator mode (A or empty for shift/rotate)
    if (operand.toUpperCase() === 'A' && opcodes.ACC) {
      return { mode: 'ACC', value: null };
    }

    // Branch relative - just parse the target, we'll show ?? for offset
    if (opcodes.REL) {
      const val = this.parseValue(operand);
      // For branches, we can't calculate offset without knowing current PC
      // Just return the mode with the target value
      return { mode: 'REL', value: val };
    }

    // Plain address - zero page or absolute
    const val = this.parseValue(operand);
    if (val !== null) {
      if (val <= 0xFF && opcodes.ZP) return { mode: 'ZP', value: val };
      if (opcodes.ABS) return { mode: 'ABS', value: val & 0xFFFF };
    }

    return null; // Unresolved
  }

  /**
   * Parse a numeric value: $hex, %binary, decimal, or symbol
   */
  parseValue(str) {
    if (!str) return null;
    str = str.trim();

    // Handle < (low byte) and > (high byte) operators
    if (str.startsWith('<')) {
      const inner = this.parseValue(str.substring(1));
      return inner !== null ? (inner & 0xFF) : null;
    }
    if (str.startsWith('>')) {
      const inner = this.parseValue(str.substring(1));
      return inner !== null ? ((inner >> 8) & 0xFF) : null;
    }

    // Hex: $xxxx
    if (str.startsWith('$')) {
      const hex = parseInt(str.substring(1), 16);
      return isNaN(hex) ? null : hex;
    }

    // Binary: %01010101
    if (str.startsWith('%')) {
      const bin = parseInt(str.substring(1), 2);
      return isNaN(bin) ? null : bin;
    }

    // Character: 'A'
    if (str.match(/^'.'$/)) {
      return str.charCodeAt(1);
    }

    // Decimal
    if (str.match(/^\d+$/)) {
      return parseInt(str, 10);
    }

    // Symbol lookup
    if (this.symbols.has(str.toUpperCase())) {
      return this.symbols.get(str.toUpperCase());
    }

    return null; // Unresolved symbol
  }

  /**
   * Encode a line and store the bytes
   */
  encodeLineBytes(lineNumber) {
    if (!this.textarea) return;

    const lines = this.textarea.value.split('\n');
    if (lineNumber < 1 || lineNumber > lines.length) return;

    const line = lines[lineNumber - 1];
    const parsed = this.parseLine(line);

    if (!parsed || !parsed.opcode) {
      this.lineBytes.delete(lineNumber);
      return;
    }

    const mnemonic = parsed.opcode.toUpperCase();
    const opcodes = this.getOpcodeTable()[mnemonic];

    // Skip directives - they don't have opcodes in our table
    if (!opcodes) {
      this.lineBytes.delete(lineNumber);
      return;
    }

    const operandInfo = this.parseOperand(parsed.operand, mnemonic);
    if (!operandInfo) {
      this.lineBytes.delete(lineNumber);
      return;
    }

    const opcode = opcodes[operandInfo.mode];
    if (opcode === undefined) {
      this.lineBytes.delete(lineNumber);
      return;
    }

    // Build the byte string
    let bytes = opcode.toString(16).toUpperCase().padStart(2, '0');

    if (operandInfo.mode === 'IMP' || operandInfo.mode === 'ACC') {
      // 1 byte - just the opcode
    } else if (operandInfo.mode === 'REL') {
      // Branch - calculate relative offset if we know target and current PC
      const targetAddr = operandInfo.value;
      const currentPC = this.linePCs?.get(lineNumber);

      if (targetAddr !== null && currentPC !== undefined) {
        // Branch offset is relative to PC after the instruction (PC + 2)
        const nextPC = currentPC + 2;
        const offset = targetAddr - nextPC;

        // Check if offset is in valid range (-128 to +127)
        if (offset >= -128 && offset <= 127) {
          const signedByte = offset < 0 ? (256 + offset) : offset;
          bytes += ' ' + signedByte.toString(16).toUpperCase().padStart(2, '0');
        } else {
          bytes += ' ??'; // Out of range
        }
      } else {
        bytes += ' ??'; // Unknown target
      }
    } else if (['IMM', 'ZP', 'ZPX', 'ZPY', 'IZX', 'IZY', 'ZPI'].includes(operandInfo.mode)) {
      // 2 bytes
      if (operandInfo.value !== null) {
        bytes += ' ' + (operandInfo.value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
      } else {
        bytes += ' ??';
      }
    } else if (['ABS', 'ABX', 'ABY', 'IND', 'IAX'].includes(operandInfo.mode)) {
      // 3 bytes (little-endian)
      if (operandInfo.value !== null) {
        const lo = operandInfo.value & 0xFF;
        const hi = (operandInfo.value >> 8) & 0xFF;
        bytes += ' ' + lo.toString(16).toUpperCase().padStart(2, '0');
        bytes += ' ' + hi.toString(16).toUpperCase().padStart(2, '0');
      } else {
        bytes += ' ?? ??';
      }
    } else if (operandInfo.mode === 'ZPR') {
      // 3 bytes: opcode, zp addr, relative offset
      bytes += ' ?? ??';
    }

    this.lineBytes.set(lineNumber, bytes);
  }

  /**
   * Encode all lines (called after successful assembly)
   */
  encodeAllLineBytes() {
    this.lineBytes.clear();
    this.linePCs = new Map(); // Track PC for each line

    const lines = this.textarea.value.split('\n');

    // Find ORG from source code, default to $0800 if not found yet
    let pc = 0x0800;

    // First pass: calculate PC for each line
    for (let i = 0; i < lines.length; i++) {
      const lineNumber = i + 1;
      const parsed = this.parseLine(lines[i]);

      // Check for ORG directive and update PC
      if (parsed && parsed.opcode && parsed.opcode.toUpperCase() === 'ORG') {
        const orgValue = this.parseValue(parsed.operand);
        if (orgValue !== null) {
          pc = orgValue;
        }
      }

      this.linePCs.set(lineNumber, pc);

      if (parsed && parsed.opcode) {
        const size = this.getInstructionSize(parsed.opcode.toUpperCase(), parsed.operand);
        pc += size;
      }
    }

    // Second pass: encode with known PCs
    for (let i = 1; i <= lines.length; i++) {
      this.encodeLineBytes(i);
    }
  }

  /**
   * Get the size of an instruction in bytes
   */
  getInstructionSize(mnemonic, operand) {
    const opcodes = this.getOpcodeTable()[mnemonic];
    if (!opcodes) {
      // Check if it's a directive
      const upper = mnemonic.toUpperCase();
      if (upper === 'ORG' || upper === 'EQU') return 0;
      if (upper === 'DFB' || upper === 'DB') {
        // Count comma-separated values
        if (!operand) return 1;
        return operand.split(',').length;
      }
      if (upper === 'DW' || upper === 'DA') {
        if (!operand) return 2;
        return operand.split(',').length * 2;
      }
      if (upper === 'ASC' || upper === 'DCI') {
        // String length (rough estimate)
        const match = operand?.match(/["']([^"']*)["']/);
        if (match) return match[1].length;
        return 0;
      }
      if (upper === 'DS') {
        const val = this.parseValue(operand);
        return val || 0;
      }
      if (upper === 'HEX') {
        // Count hex digits / 2
        const hex = operand?.replace(/[^0-9A-Fa-f]/g, '') || '';
        return Math.floor(hex.length / 2);
      }
      return 0;
    }

    const operandInfo = this.parseOperand(operand, mnemonic);
    if (!operandInfo) return 0;

    // Size based on addressing mode
    switch (operandInfo.mode) {
      case 'IMP':
      case 'ACC':
        return 1;
      case 'IMM':
      case 'ZP':
      case 'ZPX':
      case 'ZPY':
      case 'IZX':
      case 'IZY':
      case 'ZPI':
      case 'REL':
        return 2;
      case 'ABS':
      case 'ABX':
      case 'ABY':
      case 'IND':
      case 'IAX':
      case 'ZPR':
        return 3;
      default:
        return 1;
    }
  }

  /**
   * Validate a line for syntax errors (stray characters, malformed syntax)
   */
  validateLine(lineNumber) {
    if (!this.textarea) return;

    const lines = this.textarea.value.split('\n');
    if (lineNumber < 1 || lineNumber > lines.length) return;

    const line = lines[lineNumber - 1];

    // Clear any previous syntax error for this line
    this.syntaxErrors.delete(lineNumber);

    // Empty lines are valid
    if (!line.trim()) return;

    // Full-line comments are valid
    const trimmed = line.trim();
    if (trimmed.startsWith(';') || trimmed.startsWith('*')) return;

    // Parse the line to validate structure
    const error = this.checkLineSyntax(line);
    if (error) {
      this.syntaxErrors.set(lineNumber, error);
    }
  }

  /**
   * Check line syntax and return error message or null if valid
   */
  checkLineSyntax(line) {
    // Extract comment first (respecting quotes)
    let commentIdx = -1;
    let inQuote = false;
    let quoteChar = null;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if ((ch === '"' || ch === "'") && !inQuote) {
        inQuote = true;
        quoteChar = ch;
      } else if (ch === quoteChar && inQuote) {
        inQuote = false;
        quoteChar = null;
      } else if (ch === ';' && !inQuote) {
        commentIdx = i;
        break;
      }
    }

    const mainPart = commentIdx >= 0 ? line.substring(0, commentIdx) : line;

    // If line is just whitespace before comment, that's valid
    if (!mainPart.trim()) return null;

    // Check if line starts with whitespace (no label)
    const hasLabel = mainPart.length > 0 && mainPart[0] !== ' ' && mainPart[0] !== '\t';

    // Tokenize the main part
    const tokens = [];
    let current = '';
    let inStr = false;
    let strChar = null;

    for (let i = 0; i < mainPart.length; i++) {
      const ch = mainPart[i];

      if ((ch === '"' || ch === "'") && !inStr) {
        inStr = true;
        strChar = ch;
        current += ch;
      } else if (ch === strChar && inStr) {
        inStr = false;
        strChar = null;
        current += ch;
      } else if ((ch === ' ' || ch === '\t') && !inStr) {
        if (current) {
          tokens.push({ text: current, pos: i - current.length });
          current = '';
        }
      } else {
        current += ch;
      }
    }
    if (current) {
      tokens.push({ text: current, pos: mainPart.length - current.length });
    }

    if (tokens.length === 0) return null;

    // Validate token count based on whether there's a label
    // Valid patterns:
    // - Label only: 1 token at col 0
    // - Opcode only: 1 token not at col 0
    // - Label + Opcode: 2 tokens, first at col 0
    // - Opcode + Operand: 2 tokens, first not at col 0
    // - Label + Opcode + Operand: 3 tokens, first at col 0

    const firstAtCol0 = tokens[0].pos === 0;

    if (hasLabel) {
      // First token is label
      if (tokens.length === 1) {
        // Just a label - valid
        return null;
      } else if (tokens.length === 2) {
        // Label + opcode OR label + something invalid
        if (!this.isValidOpcode(tokens[1].text)) {
          return `Unknown mnemonic or directive: ${tokens[1].text}`;
        }
        return null;
      } else if (tokens.length === 3) {
        // Label + opcode + operand
        if (!this.isValidOpcode(tokens[1].text)) {
          return `Unknown mnemonic or directive: ${tokens[1].text}`;
        }
        return null;
      } else if (tokens.length > 3) {
        // Too many tokens - find the extra one
        const extra = tokens.slice(3).map(t => t.text).join(' ');
        return `Unexpected: ${extra}`;
      }
    } else {
      // No label - first token should be opcode
      if (tokens.length === 1) {
        // Just opcode
        if (!this.isValidOpcode(tokens[0].text)) {
          return `Unknown mnemonic or directive: ${tokens[0].text}`;
        }
        return null;
      } else if (tokens.length === 2) {
        // Opcode + operand
        if (!this.isValidOpcode(tokens[0].text)) {
          return `Unknown mnemonic or directive: ${tokens[0].text}`;
        }
        return null;
      } else if (tokens.length > 2) {
        // Too many tokens
        const extra = tokens.slice(2).map(t => t.text).join(' ');
        return `Unexpected: ${extra}`;
      }
    }

    return null;
  }

  /**
   * Check if a token is a valid opcode/mnemonic or directive
   */
  isValidOpcode(token) {
    const upper = token.toUpperCase();

    // Check against opcode table
    if (this.getOpcodeTable()[upper]) return true;

    // Check common directives
    const directives = new Set([
      'ORG', 'EQU', 'DS', 'DFB', 'DB', 'DW', 'DA', 'DDB', 'ASC', 'DCI', 'HEX',
      'PUT', 'USE', 'OBJ', 'LST', 'DO', 'ELSE', 'FIN', 'LUP', '--^', 'REL',
      'TYP', 'SAV', 'DSK', 'CHN', 'ENT', 'EXT', 'DUM', 'DEND', 'ERR', 'CYC',
      'DAT', 'EXP', 'PAU', 'SW', 'USR', 'XC', 'MX', 'TR', 'KBD', 'PMC',
      'PAG', 'TTL', 'SKP', 'CHK', 'IF', 'ELUP', 'END', 'MAC', 'EOM', '<<<',
      'ADR', 'ADRL', 'LNK', 'STR', 'STRL', 'REV'
    ]);

    return directives.has(upper);
  }

  /**
   * Validate all lines
   */
  validateAllLines() {
    this.syntaxErrors.clear();
    const lines = this.textarea.value.split('\n');
    for (let i = 1; i <= lines.length; i++) {
      this.validateLine(i);
    }
  }

  updateHighlighting() {
    const text = this.textarea.value;
    const highlighted = highlightMerlinSourceInline(text);

    // Just render the syntax highlighting - errors are shown via overlay
    this.highlight.innerHTML = highlighted + "\n";

    // Update error highlights and messages overlay
    this.updateErrorsOverlay();
  }

  updateErrorsOverlay() {
    if (!this.errorsOverlay) return;

    // Combine assembler errors and syntax errors
    const allErrors = new Map();
    for (const [lineNum, msg] of this.syntaxErrors) {
      allErrors.set(lineNum, msg);
    }
    // Assembler errors override syntax errors
    for (const [lineNum, msg] of this.errors) {
      allErrors.set(lineNum, msg);
    }

    if (allErrors.size === 0) {
      this.errorsOverlay.innerHTML = '';
      return;
    }

    const style = getComputedStyle(this.textarea);
    const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.4;
    const paddingTop = parseFloat(style.paddingTop) || 8;

    let html = '';
    for (const [lineNum, msg] of allErrors) {
      // Position at the top of the error line
      const top = paddingTop + (lineNum - 1) * lineHeight;
      // Center of the line for the message
      const centerY = top + lineHeight / 2;
      // Error highlight bar (background)
      html += `<div class="asm-error-highlight" style="top: ${top}px; height: ${lineHeight}px"></div>`;
      // Error message (right side, vertically centered)
      html += `<div class="asm-error-msg" style="top: ${centerY}px">${this.escapeHtml(msg)}</div>`;
    }

    this.errorsOverlay.innerHTML = html;
  }

  doAssemble() {
    // Format all lines before assembling
    this.formatAllLines();

    const text = this.textarea.value;
    if (!text.trim()) {
      this.setStatus("Nothing to assemble", false);
      return;
    }

    // Check if source has ORG directive before any code
    const hasOrg = text.match(/^\s*ORG\b/mi);
    if (!hasOrg) {
      this.setStatus("ORG directive required before code", false);
      return;
    }

    // Allocate source string in WASM heap
    const wasm = this.wasmModule;
    const sourceLen = source.length + 1;
    const sourcePtr = wasm._malloc(sourceLen);
    wasm.stringToUTF8(source, sourcePtr, sourceLen);

    const success = wasm._assembleSource(sourcePtr);
    wasm._free(sourcePtr);

    // Clear previous errors (both assembler and syntax)
    this.errors.clear();
    this.syntaxErrors.clear();

    if (success) {
      const size = wasm._getAsmOutputSize();
      const origin = wasm._getAsmOrigin();
      this.lastAssembledSize = size;
      this.lastOrigin = origin;
      this.setStatus(`OK: ${size} bytes at $${origin.toString(16).toUpperCase().padStart(4, "0")}`, true);
      this.loadBtn.disabled = false;

      // Store symbols for byte encoding
      this.symbols.clear();
      const symbolCount = wasm._getAsmSymbolCount();
      for (let i = 0; i < symbolCount; i++) {
        const namePtr = wasm._getAsmSymbolName(i);
        const name = wasm.UTF8ToString(namePtr);
        const value = wasm._getAsmSymbolValue(i);
        this.symbols.set(name.toUpperCase(), value);
      }

      // Re-encode all lines with resolved symbols
      this.encodeAllLineBytes();

      this.updateSymbolTable(wasm);
      this.updateHexOutput(wasm, origin, size);
    } else {
      const errorCount = wasm._getAsmErrorCount();
      this.setStatus(`${errorCount} error${errorCount !== 1 ? "s" : ""}`, false);
      this.loadBtn.disabled = true;

      // Collect errors, adjusting line numbers for prepended ORG
      for (let i = 0; i < errorCount; i++) {
        let line = wasm._getAsmErrorLine(i);
        const msgPtr = wasm._getAsmErrorMessage(i);
        const msg = wasm.UTF8ToString(msgPtr);

        // Adjust for prepended ORG line
        line = line - lineOffset;
        if (line >= 1) {
          this.errors.set(line, msg);
          // Clear bytes for error lines
          this.lineBytes.delete(line);
        }
      }

      this.clearOutputPanels();
    }

    // Re-render highlighting with error markers
    this.updateHighlighting();
    this.updateCyclesGutter();
  }

  updateSymbolTable(wasm) {
    const count = wasm._getAsmSymbolCount();

    // Update count badge
    if (this.symbolsCount) {
      this.symbolsCount.textContent = count > 0 ? count : '';
    }

    if (count === 0) {
      this.symbolsContent.innerHTML = `
        <div class="asm-panel-empty">
          <div class="asm-empty-icon">{ }</div>
          <div class="asm-empty-text">No symbols defined</div>
        </div>`;
      return;
    }

    // Separate symbols into labels and equates
    const labels = [];
    const equates = [];

    for (let i = 0; i < count; i++) {
      const namePtr = wasm._getAsmSymbolName(i);
      const name = wasm.UTF8ToString(namePtr);
      const value = wasm._getAsmSymbolValue(i);
      const hex = "$" + (value & 0xFFFF).toString(16).toUpperCase().padStart(4, "0");
      const isLocal = name.startsWith(':') || name.startsWith(']');
      const item = { name, hex, isLocal };

      // Heuristic: values in ROM range ($F800+) or under $0100 are likely equates
      if (value >= 0xF800 || value < 0x0100) {
        equates.push(item);
      } else {
        labels.push(item);
      }
    }

    let html = '<div class="asm-symbol-list">';

    if (labels.length > 0) {
      html += '<div class="asm-symbol-group">';
      html += '<div class="asm-symbol-group-header">Labels</div>';
      for (const item of labels) {
        const cls = item.isLocal ? 'asm-sym-local' : 'asm-sym-global';
        html += `<div class="asm-symbol-row">
          <span class="asm-sym-name ${cls}">${this.escapeHtml(item.name)}</span>
          <span class="asm-sym-value">${item.hex}</span>
        </div>`;
      }
      html += '</div>';
    }

    if (equates.length > 0) {
      html += '<div class="asm-symbol-group">';
      html += '<div class="asm-symbol-group-header">Equates</div>';
      for (const item of equates) {
        html += `<div class="asm-symbol-row">
          <span class="asm-sym-name asm-sym-equ">${this.escapeHtml(item.name)}</span>
          <span class="asm-sym-value">${item.hex}</span>
        </div>`;
      }
      html += '</div>';
    }

    html += '</div>';
    this.symbolsContent.innerHTML = html;
  }

  updateHexOutput(wasm, origin, size) {
    // Update count badge
    if (this.hexCount) {
      this.hexCount.textContent = size > 0 ? `${size} bytes` : '';
    }

    if (size === 0) {
      this.hexContent.innerHTML = `
        <div class="asm-panel-empty">
          <div class="asm-empty-icon">[ ]</div>
          <div class="asm-empty-text">No output</div>
        </div>`;
      return;
    }

    const bufPtr = wasm._getAsmOutputBuffer();
    const data = new Uint8Array(wasm.HEAPU8.buffer, bufPtr, size);

    // Header showing range
    const endAddr = origin + size - 1;
    const rangeStr = `$${origin.toString(16).toUpperCase().padStart(4, "0")} - $${(endAddr & 0xFFFF).toString(16).toUpperCase().padStart(4, "0")}`;

    let html = `<div class="asm-hex-header">
      <span class="asm-hex-range">${rangeStr}</span>
      <span class="asm-hex-size">${size} bytes</span>
    </div>`;

    html += '<div class="asm-hex-dump">';
    const bytesPerRow = 8; // Use 8 bytes for cleaner display

    for (let offset = 0; offset < size; offset += bytesPerRow) {
      const addr = origin + offset;
      const addrStr = "$" + (addr & 0xFFFF).toString(16).toUpperCase().padStart(4, "0");

      let hexPart = "";
      let asciiPart = "";

      for (let i = 0; i < bytesPerRow; i++) {
        if (offset + i < size) {
          const byte = data[offset + i];
          hexPart += byte.toString(16).toUpperCase().padStart(2, "0") + " ";
          asciiPart += (byte >= 0x20 && byte <= 0x7E) ? String.fromCharCode(byte) : "·";
        } else {
          hexPart += "   ";
          asciiPart += " ";
        }
      }

      html += `<div class="asm-hex-row">` +
        `<span class="asm-hex-addr">${addrStr}</span>` +
        `<span class="asm-hex-sep">│</span>` +
        `<span class="asm-hex-bytes">${hexPart}</span>` +
        `<span class="asm-hex-sep">│</span>` +
        `<span class="asm-hex-ascii">${this.escapeHtml(asciiPart)}</span>` +
        `</div>`;
    }

    html += '</div>';
    this.hexContent.innerHTML = html;
  }

  clearOutputPanels() {
    // Clear count badges
    if (this.symbolsCount) this.symbolsCount.textContent = '';
    if (this.hexCount) this.hexCount.textContent = '';

    this.symbolsContent.innerHTML = `
      <div class="asm-panel-empty asm-panel-error">
        <div class="asm-empty-icon">⚠</div>
        <div class="asm-empty-text">Fix errors to see symbols</div>
      </div>`;
    this.hexContent.innerHTML = `
      <div class="asm-panel-empty asm-panel-error">
        <div class="asm-empty-icon">⚠</div>
        <div class="asm-empty-text">Fix errors to see output</div>
      </div>`;
  }

  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  doLoad() {
    this.wasmModule._loadAsmIntoMemory();
    this.showLoadedFeedback();
  }

  showLoadedFeedback() {
    const originalHtml = this.loadBtn.innerHTML;
    this.loadBtn.innerHTML = `<span class="asm-btn-icon">✓</span> Loaded!`;
    this.loadBtn.classList.add("asm-btn-success");

    setTimeout(() => {
      this.loadBtn.innerHTML = originalHtml;
      this.loadBtn.classList.remove("asm-btn-success");
    }, 1500);
  }

  setStatus(text, ok) {
    this.statusSpan.textContent = text;
    this.statusSpan.className = "asm-status" + (ok ? " asm-status-ok" : " asm-status-error");
  }

  goToLine(lineNumber) {
    if (!this.textarea) return;
    const lines = this.textarea.value.split("\n");
    let pos = 0;
    for (let i = 0; i < lineNumber - 1 && i < lines.length; i++) {
      pos += lines[i].length + 1;
    }
    this.textarea.focus();
    this.textarea.setSelectionRange(pos, pos);
    this.updateCurrentLineHighlight();

    // Scroll line into view
    const style = getComputedStyle(this.textarea);
    const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.4;
    const targetScroll = (lineNumber - 1) * lineHeight - this.textarea.clientHeight / 2;
    this.textarea.scrollTop = Math.max(0, targetScroll);
  }

  /**
   * Toggle a breakpoint for the given line number
   */
  toggleBreakpoint(lineNumber) {
    if (!this.bpManager) return;

    // Get the PC address for this line
    const address = this.linePCs.get(lineNumber);
    if (address === undefined) {
      // No instruction on this line (empty, comment, or directive)
      return;
    }

    // Check if line has an actual instruction (not just a label or directive)
    const lines = this.textarea.value.split('\n');
    if (lineNumber < 1 || lineNumber > lines.length) return;

    const parsed = this.parseLine(lines[lineNumber - 1]);
    if (!parsed || !parsed.opcode) return;

    // Skip directives - they don't generate code
    const opcodes = this.getOpcodeTable();
    if (!opcodes[parsed.opcode.toUpperCase()]) return;

    // Toggle the breakpoint
    this.bpManager.toggle(address);

    // Update our local tracking
    if (this.bpManager.has(address)) {
      this.lineBreakpoints.set(lineNumber, address);
    } else {
      this.lineBreakpoints.delete(lineNumber);
    }

    this.updateGutter();
  }

  /**
   * Sync breakpoint state from the manager (called when breakpoints change externally)
   */
  syncBreakpointsFromManager() {
    if (!this.bpManager) return;

    // Clear our local tracking and rebuild from manager state
    this.lineBreakpoints.clear();

    // Check each line's PC against the manager's breakpoints
    for (const [lineNumber, address] of this.linePCs) {
      if (this.bpManager.has(address)) {
        this.lineBreakpoints.set(lineNumber, address);
      }
    }

    this.updateGutter();
  }

  // ============================================================================
  // ROM Routines Panel
  // ============================================================================

  initRomPanel() {
    // Populate category dropdown
    ROM_CATEGORIES.forEach(cat => {
      const opt = document.createElement("option");
      opt.value = cat;
      opt.textContent = cat === "All" ? "All Categories" : cat;
      this.romCategory.appendChild(opt);
    });

    // ROM button click
    this.romBtn.addEventListener("click", () => this.toggleRomPanel());

    // Close button
    this.romPanel.querySelector(".asm-rom-close").addEventListener("click", () => {
      this.hideRomPanel();
    });

    // Search input
    this.romSearch.addEventListener("input", () => this.filterRomRoutines());

    // Category filter
    this.romCategory.addEventListener("change", () => this.filterRomRoutines());

    // Back button in detail view
    this.romPanel.querySelector(".asm-rom-back").addEventListener("click", () => {
      this.romDetail.classList.add("hidden");
      this.romList.classList.remove("hidden");
    });

    // Insert buttons
    this.romPanel.querySelector(".asm-rom-insert-equ").addEventListener("click", () => {
      if (this.selectedRoutine) this.insertRoutineEqu(this.selectedRoutine);
    });
    this.romPanel.querySelector(".asm-rom-insert-jsr").addEventListener("click", () => {
      if (this.selectedRoutine) this.insertRoutineJsr(this.selectedRoutine);
    });

    // Escape key to close panel
    this.romPanel.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.hideRomPanel();
      }
    });

    // Populate initial list
    this.renderRomList(ROM_ROUTINES);
  }

  toggleRomPanel() {
    if (this.romPanel.classList.contains("hidden")) {
      this.showRomPanel();
    } else {
      this.hideRomPanel();
    }
  }

  showRomPanel() {
    this.romPanel.classList.remove("hidden");
    this.romSearch.focus();
    this.romSearch.select();
  }

  hideRomPanel() {
    this.romPanel.classList.add("hidden");
    this.romDetail.classList.add("hidden");
    this.romList.classList.remove("hidden");
    this.textarea.focus();
  }

  filterRomRoutines() {
    const query = this.romSearch.value.trim();
    const category = this.romCategory.value;

    let routines;
    if (query) {
      routines = searchRoutines(query);
      if (category !== "All") {
        routines = routines.filter(r => r.category === category);
      }
    } else {
      routines = getRoutinesByCategory(category);
    }

    this.renderRomList(routines);
  }

  renderRomList(routines) {
    if (routines.length === 0) {
      this.romList.innerHTML = `
        <div class="asm-rom-empty">
          <div class="asm-rom-empty-icon">🔍</div>
          <div class="asm-rom-empty-text">No routines found</div>
        </div>`;
      return;
    }

    const html = routines.map(r => `
      <div class="asm-rom-item" data-name="${r.name}">
        <div class="asm-rom-item-header">
          <span class="asm-rom-item-name">${r.name}</span>
          <span class="asm-rom-item-addr">$${r.address.toString(16).toUpperCase().padStart(4, "0")}</span>
        </div>
        <div class="asm-rom-item-desc">${r.description}</div>
        <div class="asm-rom-item-cat">${r.category}</div>
      </div>
    `).join("");

    this.romList.innerHTML = html;

    // Add click handlers
    this.romList.querySelectorAll(".asm-rom-item").forEach(item => {
      item.addEventListener("click", () => {
        const name = item.dataset.name;
        const routine = ROM_ROUTINES.find(r => r.name === name);
        if (routine) this.showRoutineDetail(routine);
      });
    });
  }

  showRoutineDetail(routine) {
    this.selectedRoutine = routine;
    this.romDetailName.textContent = `${routine.name} ($${routine.address.toString(16).toUpperCase().padStart(4, "0")})`;

    let html = `
      <div class="asm-rom-section">
        <div class="asm-rom-section-title">Description</div>
        <div class="asm-rom-section-content">${routine.description}</div>
      </div>
    `;

    if (routine.inputs && routine.inputs.length > 0) {
      html += `
        <div class="asm-rom-section">
          <div class="asm-rom-section-title">Inputs</div>
          <div class="asm-rom-section-content">
            ${routine.inputs.map(i => `
              <div class="asm-rom-param">
                <span class="asm-rom-param-reg">${i.register}</span>
                <span class="asm-rom-param-desc">${i.description}</span>
              </div>
            `).join("")}
          </div>
        </div>
      `;
    }

    if (routine.outputs && routine.outputs.length > 0) {
      html += `
        <div class="asm-rom-section">
          <div class="asm-rom-section-title">Outputs</div>
          <div class="asm-rom-section-content">
            ${routine.outputs.map(o => `
              <div class="asm-rom-param">
                <span class="asm-rom-param-reg">${o.register}</span>
                <span class="asm-rom-param-desc">${o.description}</span>
              </div>
            `).join("")}
          </div>
        </div>
      `;
    }

    if (routine.preserves && routine.preserves.length > 0) {
      html += `
        <div class="asm-rom-section asm-rom-section-inline">
          <span class="asm-rom-section-label">Preserves:</span>
          <span class="asm-rom-regs">${routine.preserves.join(", ")}</span>
        </div>
      `;
    }

    if (routine.clobbers && routine.clobbers.length > 0) {
      html += `
        <div class="asm-rom-section asm-rom-section-inline">
          <span class="asm-rom-section-label">Clobbers:</span>
          <span class="asm-rom-regs asm-rom-regs-warn">${routine.clobbers.join(", ")}</span>
        </div>
      `;
    }

    if (routine.notes) {
      html += `
        <div class="asm-rom-section">
          <div class="asm-rom-section-title">Notes</div>
          <div class="asm-rom-section-content asm-rom-notes">${routine.notes}</div>
        </div>
      `;
    }

    if (routine.example) {
      html += `
        <div class="asm-rom-section">
          <div class="asm-rom-section-title">Example</div>
          <pre class="asm-rom-example">${this.escapeHtml(routine.example)}</pre>
        </div>
      `;
    }

    this.romDetailContent.innerHTML = html;
    this.romList.classList.add("hidden");
    this.romDetail.classList.remove("hidden");
  }

  insertRoutineEqu(routine) {
    const equ = `${routine.name.padEnd(8)} EQU  $${routine.address.toString(16).toUpperCase().padStart(4, "0")}`;
    this.insertAtCursor(equ + "\n");
    this.hideRomPanel();
  }

  insertRoutineJsr(routine) {
    // Check if EQU already exists
    const hasEqu = this.textarea.value.toUpperCase().includes(`${routine.name.toUpperCase()} `);

    this.textarea.focus();

    if (!hasEqu) {
      // Need to insert EQU at top (after header comments) AND JSR at cursor
      // Save current cursor position
      const savedCursor = this.textarea.selectionStart;
      const lines = this.textarea.value.split("\n");

      // Find insert point for EQU (after header comments)
      let insertIdx = 0;
      let charPos = 0;
      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (trimmed && !trimmed.startsWith("*") && !trimmed.startsWith(";")) {
          insertIdx = i;
          break;
        }
        charPos += lines[i].length + 1; // +1 for newline
        insertIdx = i + 1;
      }

      const equ = `${routine.name.padEnd(8)} EQU  $${routine.address.toString(16).toUpperCase().padStart(4, "0")}\n`;

      // Move cursor to EQU insert position and insert
      this.textarea.selectionStart = this.textarea.selectionEnd = charPos;
      document.execCommand("insertText", false, equ);

      // Move cursor back to original position (adjusted for inserted EQU line)
      const newCursorPos = savedCursor + equ.length;
      this.textarea.selectionStart = this.textarea.selectionEnd = newCursorPos;
    }

    // Insert JSR at cursor
    const jsr = `         JSR  ${routine.name}`;
    this.insertAtCursor(jsr);
    this.hideRomPanel();
  }

  insertAtCursor(text) {
    this.textarea.focus();

    const start = this.textarea.selectionStart;
    const value = this.textarea.value;

    // If not at start of line, add newline first
    let insertText = text;
    if (start > 0 && value[start - 1] !== "\n") {
      insertText = "\n" + text;
    }

    // Use execCommand to preserve undo history
    // This inserts text at the current selection and is undoable with Cmd+Z
    document.execCommand("insertText", false, insertText);

    // Update display
    this.updateHighlighting();
    this.updateGutter();
  }

  update() {
    // No periodic update needed
  }

  getState() {
    const baseState = super.getState();
    return {
      ...baseState,
      content: this.textarea ? this.textarea.value : "",
    };
  }

  restoreState(state) {
    super.restoreState(state);
    if (state.content !== undefined && this.textarea) {
      this.textarea.value = state.content;
      this.updateHighlighting();
      this.validateAllLines();
      this.encodeAllLineBytes();
      this.updateGutter();
    }
  }
}
