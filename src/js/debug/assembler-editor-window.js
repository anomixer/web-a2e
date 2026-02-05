/*
 * assembler-editor-window.js - 65C02 assembler editor window
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { BaseWindow } from "../windows/base-window.js";
import { highlightMerlinSourceInline } from "../utils/merlin-highlighting.js";
import { MerlinEditorSupport } from "../utils/merlin-editor-support.js";

export class AssemblerEditorWindow extends BaseWindow {
  constructor(wasmModule) {
    super({
      id: "assembler-editor",
      title: "Assembler",
      defaultWidth: 580,
      defaultHeight: 560,
      minWidth: 400,
      minHeight: 400,
      defaultPosition: { x: 200, y: 80 },
    });
    this.wasmModule = wasmModule;
    this.lastAssembledSize = 0;
    this.lastOrigin = 0;
    this.errors = new Map(); // line number -> error message
    this.currentLine = -1; // Track current line for auto-assemble
  }

  renderContent() {
    return `
      <div class="asm-editor-content">
        <div class="asm-toolbar">
          <button class="asm-btn asm-assemble-btn">Assemble</button>
          <div class="asm-org-group">
            <label class="asm-org-label">ORG</label>
            <input class="asm-org-input" type="text" value="$0800" spellcheck="false" />
          </div>
          <button class="asm-btn asm-load-btn" disabled>Load into Memory</button>
          <span class="asm-column-indicator"></span>
          <span class="asm-status"></span>
        </div>
        <div class="asm-split-container">
          <div class="asm-editor-pane">
            <div class="asm-editor-wrapper">
              <div class="asm-cycles-column">
                <div class="asm-cycles-header">Cyc</div>
                <div class="asm-cycles-gutter"></div>
              </div>
              <div class="asm-editor-container">
                <div class="asm-line-highlight"></div>
                <pre class="asm-highlight" aria-hidden="true"></pre>
                <div class="asm-errors-overlay"></div>
                <textarea class="asm-textarea" placeholder="Type or paste 65C02 assembly here...

Example:
         ORG  $0800
LOOP     LDA  #$C1
         JSR  $FDED
         JMP  LOOP" spellcheck="false"></textarea>
              </div>
            </div>
          </div>
          <div class="asm-splitter asm-splitter-h" data-direction="horizontal">
            <div class="asm-splitter-handle"></div>
          </div>
          <div class="asm-output-pane">
            <div class="asm-output-panels">
              <div class="asm-panel asm-symbols-panel">
                <div class="asm-panel-header">Symbols</div>
                <div class="asm-panel-content asm-symbols-content">
                  <div class="asm-panel-empty">Assemble to see symbols</div>
                </div>
              </div>
              <div class="asm-splitter asm-splitter-v" data-direction="vertical">
                <div class="asm-splitter-handle"></div>
              </div>
              <div class="asm-panel asm-hex-panel">
                <div class="asm-panel-header">Hex Output</div>
                <div class="asm-panel-content asm-hex-content">
                  <div class="asm-panel-empty">Assemble to see output</div>
                </div>
              </div>
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
    this.cyclesGutter = this.contentElement.querySelector(".asm-cycles-gutter");
    this.assembleBtn = this.contentElement.querySelector(".asm-assemble-btn");
    this.loadBtn = this.contentElement.querySelector(".asm-load-btn");
    this.orgInput = this.contentElement.querySelector(".asm-org-input");
    this.statusSpan = this.contentElement.querySelector(".asm-status");
    this.columnIndicator = this.contentElement.querySelector(".asm-column-indicator");
    this.symbolsContent = this.contentElement.querySelector(".asm-symbols-content");
    this.hexContent = this.contentElement.querySelector(".asm-hex-content");

    const editorContainer = this.contentElement.querySelector(".asm-editor-container");

    // Sync highlighting on input
    this.textarea.addEventListener("input", () => {
      this.updateHighlighting();
      this.updateCurrentLineHighlight();
      this.updateCyclesGutter();
    });

    // Sync scroll position
    this.textarea.addEventListener("scroll", () => {
      this.highlight.scrollTop = this.textarea.scrollTop;
      this.highlight.scrollLeft = this.textarea.scrollLeft;
      this.cyclesGutter.scrollTop = this.textarea.scrollTop;
      this.errorsOverlay.style.top = `-${this.textarea.scrollTop}px`;
      this.updateCurrentLineHighlight();
    });

    // Track cursor for line highlight and auto-format on line change
    this.textarea.addEventListener("click", () => {
      this.updateCurrentLineHighlight();
      this.checkLineChangeAndFormat();
    });
    this.textarea.addEventListener("keyup", (e) => {
      // Check for navigation keys that might change lines
      if (["ArrowUp", "ArrowDown", "Enter", "PageUp", "PageDown", "Home", "End"].includes(e.key)) {
        this.checkLineChangeAndFormat();
      }
    });
    this.textarea.addEventListener("keydown", () => {
      requestAnimationFrame(() => this.updateCurrentLineHighlight());
    });
    this.textarea.addEventListener("focus", () => {
      this.lineHighlight.classList.add("visible");
      this.updateCurrentLineHighlight();
      this.currentLine = this.getCurrentLineNumber();
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

    this.updateHighlighting();
    this.updateCyclesGutter();
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
    this.columnIndicator.textContent = `Col ${col}: ${display}`;
    this.columnIndicator.className = `asm-column-indicator asm-col-${name}`;
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
      // Format the line we're leaving
      this.formatLine(this.currentLine);
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

  // 65C02 base cycle counts by mnemonic (common addressing modes)
  // Format: { mnemonic: [implied, immediate, zp, zpx/zpy, abs, absx/absy, indirect, etc.] }
  getCycleCounts() {
    // Simplified: returns typical cycle count for each mnemonic
    return {
      'ADC': 2, 'AND': 2, 'ASL': 2, 'BCC': 2, 'BCS': 2, 'BEQ': 2, 'BIT': 2,
      'BMI': 2, 'BNE': 2, 'BPL': 2, 'BRA': 3, 'BRK': 7, 'BVC': 2, 'BVS': 2,
      'CLC': 2, 'CLD': 2, 'CLI': 2, 'CLV': 2, 'CMP': 2, 'CPX': 2, 'CPY': 2,
      'DEC': 2, 'DEX': 2, 'DEY': 2, 'EOR': 2, 'INC': 2, 'INX': 2, 'INY': 2,
      'JMP': 3, 'JSR': 6, 'LDA': 2, 'LDX': 2, 'LDY': 2, 'LSR': 2, 'NOP': 2,
      'ORA': 2, 'PHA': 3, 'PHP': 3, 'PHX': 3, 'PHY': 3, 'PLA': 4, 'PLP': 4,
      'PLX': 4, 'PLY': 4, 'ROL': 2, 'ROR': 2, 'RTI': 6, 'RTS': 6, 'SBC': 2,
      'SEC': 2, 'SED': 2, 'SEI': 2, 'STA': 3, 'STX': 3, 'STY': 3, 'STZ': 3,
      'TAX': 2, 'TAY': 2, 'TRB': 5, 'TSB': 5, 'TSX': 2, 'TXA': 2, 'TXS': 2,
      'TYA': 2, 'WAI': 3, 'STP': 3,
      // 65C02 BBR/BBS
      'BBR0': 5, 'BBR1': 5, 'BBR2': 5, 'BBR3': 5, 'BBR4': 5, 'BBR5': 5, 'BBR6': 5, 'BBR7': 5,
      'BBS0': 5, 'BBS1': 5, 'BBS2': 5, 'BBS3': 5, 'BBS4': 5, 'BBS5': 5, 'BBS6': 5, 'BBS7': 5,
      // 65C02 RMB/SMB
      'RMB0': 5, 'RMB1': 5, 'RMB2': 5, 'RMB3': 5, 'RMB4': 5, 'RMB5': 5, 'RMB6': 5, 'RMB7': 5,
      'SMB0': 5, 'SMB1': 5, 'SMB2': 5, 'SMB3': 5, 'SMB4': 5, 'SMB5': 5, 'SMB6': 5, 'SMB7': 5,
    };
  }

  updateCyclesGutter() {
    if (!this.cyclesGutter || !this.textarea) return;

    const lines = this.textarea.value.split('\n');
    const cycleCounts = this.getCycleCounts();
    const gutterLines = [];

    for (let i = 0; i < lines.length; i++) {
      const parsed = this.parseLine(lines[i]);
      let cycles = '';

      if (parsed && parsed.opcode) {
        const mnem = parsed.opcode.toUpperCase();
        if (cycleCounts[mnem] !== undefined) {
          cycles = cycleCounts[mnem].toString();
        }
      }

      gutterLines.push(`<div class="asm-gutter-line">${cycles || '&nbsp;'}</div>`);
    }

    this.cyclesGutter.innerHTML = gutterLines.join('');
  }

  updateHighlighting() {
    const text = this.textarea.value;
    const highlighted = highlightMerlinSourceInline(text);

    // If there are errors, wrap error lines with background highlight
    if (this.errors.size > 0) {
      const lines = highlighted.split('\n');
      const wrappedLines = lines.map((lineHtml, index) => {
        const lineNum = index + 1; // 1-indexed
        if (this.errors.has(lineNum)) {
          return `<span class="asm-error-line">${lineHtml || ' '}</span>`;
        }
        return lineHtml;
      });
      this.highlight.innerHTML = wrappedLines.join('\n') + "\n";
    } else {
      this.highlight.innerHTML = highlighted + "\n";
    }

    // Update error messages overlay
    this.updateErrorsOverlay();
  }

  updateErrorsOverlay() {
    if (!this.errorsOverlay) return;

    if (this.errors.size === 0) {
      this.errorsOverlay.innerHTML = '';
      return;
    }

    const style = getComputedStyle(this.textarea);
    const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.4;
    const paddingTop = parseFloat(style.paddingTop) || 8;

    let html = '';
    for (const [lineNum, msg] of this.errors) {
      // Position at the top of the error line
      const top = paddingTop + (lineNum - 1) * lineHeight;
      html += `<div class="asm-error-msg" style="top: ${top}px">${this.escapeHtml(msg)}</div>`;
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

    // Check if source already has ORG directive
    const hasOrg = text.match(/^\s*ORG\b/mi);
    const orgValue = this.orgInput.value.trim();
    let source = text;
    let lineOffset = 0;

    // Prepend ORG from toolbar if source doesn't contain one
    if (orgValue && !hasOrg) {
      source = `         ORG  ${orgValue}\n${text}`;
      lineOffset = 1; // Errors will be 1 line off
    }

    // Allocate source string in WASM heap
    const wasm = this.wasmModule;
    const sourceLen = source.length + 1;
    const sourcePtr = wasm._malloc(sourceLen);
    wasm.stringToUTF8(source, sourcePtr, sourceLen);

    const success = wasm._assembleSource(sourcePtr);
    wasm._free(sourcePtr);

    // Clear previous errors
    this.errors.clear();

    if (success) {
      const size = wasm._getAsmOutputSize();
      const origin = wasm._getAsmOrigin();
      this.lastAssembledSize = size;
      this.lastOrigin = origin;
      this.setStatus(`OK: ${size} bytes at $${origin.toString(16).toUpperCase().padStart(4, "0")}`, true);
      this.loadBtn.disabled = false;
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
    if (count === 0) {
      this.symbolsContent.innerHTML = '<div class="asm-panel-empty">No symbols defined</div>';
      return;
    }

    let html = '<table class="asm-symbol-table"><thead><tr><th>Symbol</th><th>Value</th></tr></thead><tbody>';
    for (let i = 0; i < count; i++) {
      const namePtr = wasm._getAsmSymbolName(i);
      const name = wasm.UTF8ToString(namePtr);
      const value = wasm._getAsmSymbolValue(i);
      const hex = "$" + (value & 0xFFFF).toString(16).toUpperCase().padStart(4, "0");
      html += `<tr><td class="asm-sym-name">${this.escapeHtml(name)}</td><td class="asm-sym-value">${hex}</td></tr>`;
    }
    html += '</tbody></table>';
    this.symbolsContent.innerHTML = html;
  }

  updateHexOutput(wasm, origin, size) {
    if (size === 0) {
      this.hexContent.innerHTML = '<div class="asm-panel-empty">No output</div>';
      return;
    }

    const bufPtr = wasm._getAsmOutputBuffer();
    const data = new Uint8Array(wasm.HEAPU8.buffer, bufPtr, size);

    let html = '<div class="asm-hex-dump">';
    const bytesPerRow = 16;

    for (let offset = 0; offset < size; offset += bytesPerRow) {
      const addr = origin + offset;
      const addrStr = "$" + (addr & 0xFFFF).toString(16).toUpperCase().padStart(4, "0");

      let hexPart = "";
      let asciiPart = "";

      for (let i = 0; i < bytesPerRow; i++) {
        if (offset + i < size) {
          const byte = data[offset + i];
          hexPart += byte.toString(16).toUpperCase().padStart(2, "0") + " ";
          asciiPart += (byte >= 0x20 && byte <= 0x7E) ? String.fromCharCode(byte) : ".";
        } else {
          hexPart += "   ";
          asciiPart += " ";
        }
        if (i === 7) hexPart += " ";
      }

      html += `<div class="asm-hex-row">` +
        `<span class="asm-hex-addr">${addrStr}</span>` +
        `<span class="asm-hex-bytes">${hexPart}</span>` +
        `<span class="asm-hex-ascii">${this.escapeHtml(asciiPart)}</span>` +
        `</div>`;
    }

    html += '</div>';
    this.hexContent.innerHTML = html;
  }

  clearOutputPanels() {
    this.symbolsContent.innerHTML = '<div class="asm-panel-empty">Fix errors to see symbols</div>';
    this.hexContent.innerHTML = '<div class="asm-panel-empty">Fix errors to see output</div>';
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
    const original = this.loadBtn.textContent;
    this.loadBtn.textContent = `Loaded ${this.lastAssembledSize} bytes!`;
    this.loadBtn.classList.add("asm-btn-success");

    setTimeout(() => {
      this.loadBtn.textContent = original;
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

  update() {
    // No periodic update needed
  }

  getState() {
    const baseState = super.getState();
    return {
      ...baseState,
      content: this.textarea ? this.textarea.value : "",
      org: this.orgInput ? this.orgInput.value : "$0800",
    };
  }

  restoreState(state) {
    super.restoreState(state);
    if (state.content !== undefined && this.textarea) {
      this.textarea.value = state.content;
      this.updateHighlighting();
    }
    if (state.org !== undefined && this.orgInput) {
      this.orgInput.value = state.org;
    }
  }
}
