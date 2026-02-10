/*
 * basic-program-window.js - BASIC program editor with integrated debugger
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { BaseWindow } from "../windows/base-window.js";
import {
  highlightBasicSourceWithIndent,
  formatBasicSource,
} from "../utils/basic-highlighting.js";
import { escapeHtml } from "../utils/string-utils.js";
import { BasicAutocomplete } from "../utils/basic-autocomplete.js";
import { tokenizeProgram } from "../utils/basic-tokenizer.js";
import { BasicBreakpointManager } from "./basic-breakpoint-manager.js";
import { BasicVariableInspector } from "./basic-variable-inspector.js";
import { BasicProgramParser } from "./basic-program-parser.js";
import { showToast } from "../ui/toast.js";

const BASIC_ERRORS = {
  0x00: "NEXT WITHOUT FOR",
  0x10: "SYNTAX ERROR",
  0x16: "RETURN WITHOUT GOSUB",
  0x2A: "OUT OF DATA",
  0x35: "ILLEGAL QUANTITY",
  0x45: "OVERFLOW",
  0x4D: "OUT OF MEMORY",
  0x5A: "UNDEF'D STATEMENT",
  0x6B: "BAD SUBSCRIPT",
  0x78: "REDIM'D ARRAY",
  0x85: "DIVISION BY ZERO",
  0x95: "ILLEGAL DIRECT",
  0xA3: "TYPE MISMATCH",
  0xB0: "STRING TOO LONG",
  0xBF: "FORMULA TOO COMPLEX",
  0xD2: "CAN'T CONTINUE",
  0xE0: "UNDEF'D FUNCTION",
};

export class BasicProgramWindow extends BaseWindow {
  constructor(wasmModule, inputHandler, isRunningCallback) {
    super({
      id: "basic-program",
      title: "Applesoft BASIC",
      defaultWidth: 700,
      defaultHeight: 500,
      minWidth: 450,
      minHeight: 400,
      defaultPosition: { x: 150, y: 100 },
    });
    this.wasmModule = wasmModule;
    this.inputHandler = inputHandler;
    this.isRunningCallback = isRunningCallback;

    // Debugger components
    this.breakpointManager = new BasicBreakpointManager(wasmModule);
    this.variableInspector = new BasicVariableInspector(wasmModule);
    this.programParser = new BasicProgramParser(wasmModule);

    // Debugger state
    this.previousVariables = new Map();
    this.changeTimestamps = new Map();
    this.currentLineNumber = null;
    this.currentStatementInfo = null;
    this.expandedArrays = new Set(); // Track which arrays are expanded
    this._varAutoRefresh = false; // Auto-refresh variables while program is running

    // Runtime error state
    this.errorLineNumber = null;
    this.errorStatementInfo = null;
    this.errorMessage = null;
    this.errorLineContent = null; // Code portion (after line number) for tracking across renumbers

    // Editor line map (text line index -> BASIC line number)
    this.lineMap = [];

    this.breakpointManager.onChange(() => {
      this.updateGutter();
      this.updateHighlighting();
      this.renderBreakpointList();
    });
  }

  renderContent() {
    return `
      <div class="basic-unified-container">
        <div class="basic-dbg-toolbar">
          <button class="basic-dbg-btn basic-dbg-run" title="Run Applesoft BASIC program">
            <span class="basic-dbg-icon">▶</span> Run
          </button>
          <button class="basic-dbg-btn basic-dbg-pause" title="Pause at next BASIC line">
            <span class="basic-dbg-icon">❚❚</span> Pause
          </button>
          <button class="basic-dbg-btn basic-dbg-step-line" title="Step to next BASIC statement">
            <span class="basic-dbg-icon">↓</span> Step
          </button>
          <div style="width:1px;height:16px;background:var(--separator-bg);margin:0 2px;flex-shrink:0;"></div>
          <button class="basic-dbg-btn basic-load-btn" title="Load program from emulator memory">Read</button>
          <button class="basic-dbg-btn basic-insert-btn" title="Load program into emulator memory">Write</button>
          <button class="basic-dbg-btn basic-format-btn" title="Format code">Format</button>
          <button class="basic-dbg-btn basic-renumber-btn" title="Renumber lines">Renum</button>
          <div style="width:1px;height:16px;background:var(--separator-bg);margin:0 2px;flex-shrink:0;"></div>
          <button class="basic-dbg-btn basic-dbg-new-btn" title="New">New</button>
          <button class="basic-dbg-btn basic-dbg-open-btn" title="Open File">Open</button>
          <button class="basic-dbg-btn basic-dbg-save-btn" title="Save File">Save</button>
        </div>
        <div class="basic-dbg-status-bar" data-state="idle">
          <div class="basic-dbg-status">
            <span class="basic-dbg-status-dot"></span>
            <span class="basic-dbg-status-chip basic-dbg-status-idle">Idle</span>
          </div>
          <div class="basic-dbg-info">
            <span class="basic-dbg-line">LINE: ---</span>
            <span class="basic-dbg-ptr">PTR: $----</span>
            <span class="basic-lines">0 lines</span>
            <span class="basic-chars">0 chars</span>
          </div>
        </div>

        <div class="basic-main-area">
          <div class="basic-editor-section">
            <div class="basic-editor-with-gutter">
              <div class="basic-gutter"></div>
              <div class="basic-editor-container">
                <div class="basic-line-highlight"></div>
                <pre class="basic-highlight" aria-hidden="true"></pre>
                <textarea class="basic-textarea" placeholder="Enter your Applesoft BASIC program...

10 REM EXAMPLE PROGRAM
20 HOME
30 FOR I = 1 TO 10
40 PRINT &quot;HELLO WORLD &quot;;I
50 NEXT I
60 END" spellcheck="false"></textarea>
              </div>
            </div>
          </div>

          <div class="basic-splitter" title="Drag to resize"><div class="basic-splitter-handle"></div></div>

          <div class="basic-dbg-sidebar">
            <div class="basic-dbg-var-section">
              <div class="basic-dbg-var-header">Variables</div>
              <div class="basic-dbg-var-panel"></div>
            </div>
            <div class="basic-sidebar-splitter" title="Drag to resize"><div class="basic-sidebar-splitter-handle"></div></div>
            <div class="basic-dbg-breakpoints">
              <div class="basic-dbg-bp-header">
                <span>Breakpoints</span>
              </div>
              <div class="basic-dbg-bp-toolbar">
                <input type="text" class="basic-dbg-bp-input" placeholder="Line #" maxlength="5">
                <button class="basic-dbg-bp-add-btn" title="Add breakpoint">+</button>
                <button class="basic-dbg-bp-info-btn" title="Breakpoint help">i</button>
              </div>
              <div class="basic-dbg-bp-list"></div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  onContentRendered() {
    // Editor elements
    this.textarea = this.contentElement.querySelector(".basic-textarea");
    this.highlight = this.contentElement.querySelector(".basic-highlight");
    this.lineHighlight = this.contentElement.querySelector(
      ".basic-line-highlight",
    );
    this.gutter = this.contentElement.querySelector(".basic-gutter");
    this.linesSpan = this.contentElement.querySelector(".basic-lines");
    this.charsSpan = this.contentElement.querySelector(".basic-chars");
    this.loadBtn = this.contentElement.querySelector(".basic-load-btn");
    this.loadBtn.disabled = true;
    this.insertBtn = this.contentElement.querySelector(".basic-insert-btn");
    this.insertBtn.disabled = true;
    this.formatBtn = this.contentElement.querySelector(".basic-format-btn");
    this.renumberBtn = this.contentElement.querySelector(".basic-renumber-btn");

    this.infoBtn = this.contentElement.querySelector(".basic-dbg-bp-info-btn");

    // Debugger elements
    this.varPanel = this.contentElement.querySelector(".basic-dbg-var-panel");
    // Handle array expand/collapse and variable edit clicks via delegation
    this.varPanel.addEventListener("click", (e) => {
      const header = e.target.closest(".basic-dbg-arr-header");
      if (header) {
        const arrName = header.dataset.arrName;
        if (arrName) {
          if (this.expandedArrays.has(arrName)) {
            this.expandedArrays.delete(arrName);
          } else {
            this.expandedArrays.add(arrName);
          }
          // Force full rebuild since expanded/collapsed state changed
          this._varStructureKey = null;
          this.renderVariables();
        }
        return;
      }

      // Handle editable variable value clicks
      const valueSpan = e.target.closest(".basic-dbg-var-value.editable");
      if (valueSpan) {
        e.stopPropagation();
        this._startVariableEdit(valueSpan);
        return;
      }

      // Handle editable array value clicks
      const arrVal = e.target.closest(".basic-dbg-arr-val.editable");
      if (arrVal) {
        e.stopPropagation();
        this._startArrayElementEdit(arrVal);
      }
    });
    this.bpList = this.contentElement.querySelector(".basic-dbg-bp-list");
    this.bpInput = this.contentElement.querySelector(".basic-dbg-bp-input");
    this.lineSpan = this.contentElement.querySelector(".basic-dbg-line");
    this.ptrSpan = this.contentElement.querySelector(".basic-dbg-ptr");
    this.statusChip = this.contentElement.querySelector(".basic-dbg-status-chip");

    // Track current editing line for auto-format on line change
    this.lastEditLine = -1;

    // Editor event listeners
    this.textarea.addEventListener("input", () => {
      this.updateGutter();
      this._trackErrorLine();
      this.updateHighlighting();
      this.updateStats();
      this.updateCurrentLineHighlight();
    });

    this.textarea.addEventListener("scroll", () => {
      this.highlight.scrollTop = this.textarea.scrollTop;
      this.highlight.scrollLeft = this.textarea.scrollLeft;
      this.gutter.scrollTop = this.textarea.scrollTop;
      this.updateCurrentLineHighlight();
    });

    this.textarea.addEventListener("keydown", (e) => {
      // Handle Enter: format current line and insert next line number
      if (e.key === "Enter") {
        e.preventDefault();
        this.handleEnterKey();
      }
    });

    this.textarea.addEventListener("keyup", (e) => {
      // Check for line change on navigation keys
      if (
        ["ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(
          e.key,
        )
      ) {
        this.checkLineChange();
      }
      this.updateCurrentLineHighlight();
    });

    this.textarea.addEventListener("click", () => {
      this.checkLineChange();
      this.updateCurrentLineHighlight();
    });

    this.textarea.addEventListener("focus", () => {
      this.lineHighlight.classList.add("visible");
      this.lastEditLine = this.getCurrentLineIndex();
      this.updateCurrentLineHighlight();
    });

    this.textarea.addEventListener("blur", () => {
      this.lineHighlight.classList.remove("visible");
      // Auto-format when leaving the editor
      this.autoFormatCode();
    });

    this.textarea.addEventListener("paste", () => {
      // Format after the pasted content has been inserted
      setTimeout(() => this.autoFormatCode(), 0);
    });

    this.insertBtn.addEventListener("click", () => {
      this.loadIntoMemory();
    });



    this.loadBtn.addEventListener("click", () => {
      this.loadFromMemory();
    });

    // File management buttons
    this.contentElement.querySelector(".basic-dbg-new-btn").addEventListener("click", () => this.newFile());
    this.contentElement.querySelector(".basic-dbg-open-btn").addEventListener("click", () => this.openFile());
    this.contentElement.querySelector(".basic-dbg-save-btn").addEventListener("click", () => this.saveFile());

    this.formatBtn.addEventListener("click", () => {
      this.autoFormatCode();
    });

    this.renumberBtn.addEventListener("click", () => {
      this.renumberProgram();
    });

    this.infoBtn.addEventListener("click", () => {
      this._showBreakpointHelp();
    });

    // Option+click on textarea to toggle statement-level breakpoints.
    // Calculates which line/statement was clicked by matching coordinates
    // against the highlight overlay's .basic-statement span positions.
    this.textarea.addEventListener('click', (e) => {
      if (!e.altKey) return;
      if (!this.highlight || !this.lineMap) return;

      // Find which highlight line div the click Y falls into
      const lineDivs = this.highlight.children;
      let targetLineDiv = null;
      let lineIndex = -1;
      for (let i = 0; i < lineDivs.length; i++) {
        const rect = lineDivs[i].getBoundingClientRect();
        if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
          targetLineDiv = lineDivs[i];
          lineIndex = i;
          break;
        }
      }
      if (!targetLineDiv) return;

      const lineNumber = this.lineMap[lineIndex];
      if (lineNumber === null || lineNumber === undefined) return;

      // Find which statement span the click X falls into
      const stmtSpans = targetLineDiv.querySelectorAll('.basic-statement');
      if (stmtSpans.length === 0) return;

      let stmtIndex = -1;
      for (let i = 0; i < stmtSpans.length; i++) {
        const rect = stmtSpans[i].getBoundingClientRect();
        if (e.clientX >= rect.left && e.clientX <= rect.right) {
          stmtIndex = i;
          break;
        }
      }
      if (stmtIndex < 0) return;

      this.breakpointManager.toggle(lineNumber, stmtIndex);
      this.updateGutter();
      this.updateHighlighting();
      this.renderBreakpointList();
      e.preventDefault();
    });

    // Initialize autocomplete
    const editorContainer = this.contentElement.querySelector(
      ".basic-editor-container",
    );
    this.autocomplete = new BasicAutocomplete(this.textarea, editorContainer);

    // Debugger toolbar buttons
    this.contentElement
      .querySelector(".basic-dbg-run")
      .addEventListener("click", () => this.handleRun());
    this.contentElement
      .querySelector(".basic-dbg-pause")
      .addEventListener("click", () => this.handlePause());
    this.contentElement
      .querySelector(".basic-dbg-step-line")
      .addEventListener("click", () => this.handleStepLine());

    // Breakpoint input
    this.contentElement
      .querySelector(".basic-dbg-bp-add-btn")
      .addEventListener("click", () => this.addBreakpointFromInput());
    this.bpInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.addBreakpointFromInput();
    });

    // Splitter for resizable panels (editor <-> sidebar)
    this.splitter = this.contentElement.querySelector(".basic-splitter");
    this.sidebar = this.contentElement.querySelector(".basic-dbg-sidebar");
    this.editorSection = this.contentElement.querySelector(
      ".basic-editor-section",
    );
    this.setupSplitter();

    // Splitter for sidebar panels (variables <-> breakpoints)
    this.sidebarSplitter = this.contentElement.querySelector(
      ".basic-sidebar-splitter",
    );
    this.varSection = this.contentElement.querySelector(
      ".basic-dbg-var-section",
    );
    this.bpSection = this.contentElement.querySelector(
      ".basic-dbg-breakpoints",
    );
    this.setupSidebarSplitter();

    this.setupGutterClickHandler();
    this.updateGutter();
    this.updateHighlighting();
    this.updateStats();
    this.renderVariables();
    this.renderBreakpointList();
  }

  /**
   * Set up a drag-to-resize splitter. Returns a cleanup function to remove
   * document-level listeners when the window is destroyed.
   * @param {Object} options
   * @param {HTMLElement} options.handle - The splitter element to drag
   * @param {string} options.cursor - Cursor style during drag ('col-resize' or 'row-resize')
   * @param {function} options.onDrag - Called with (startValue, delta) during drag
   * @param {function} options.getStartValue - Returns the initial size value on drag start
   */
  setupDragSplitter({ handle, cursor, getStartValue, onDrag }) {
    let isDragging = false;
    let startPos = 0;
    let startValue = 0;
    const isHorizontal = cursor === "col-resize";

    const onMouseDown = (e) => {
      isDragging = true;
      startPos = isHorizontal ? e.clientX : e.clientY;
      startValue = getStartValue();
      document.body.style.cursor = cursor;
      document.body.style.userSelect = "none";
      e.preventDefault();
    };

    const onMouseMove = (e) => {
      if (!isDragging) return;
      const delta = startPos - (isHorizontal ? e.clientX : e.clientY);
      onDrag(startValue, delta);
    };

    const onMouseUp = () => {
      if (!isDragging) return;
      isDragging = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      if (this.onStateChange) this.onStateChange();
    };

    handle.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);

    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }

  setupSplitter() {
    const MIN_EDITOR_WIDTH = 380;
    const MIN_SIDEBAR_WIDTH = 120;
    const MAX_SIDEBAR_WIDTH = 600;
    const SPLITTER_WIDTH = 8;

    this._cleanupSplitter = this.setupDragSplitter({
      handle: this.splitter,
      cursor: "col-resize",
      getStartValue: () => this.sidebar.offsetWidth,
      onDrag: (startWidth, delta) => {
        let newWidth = startWidth + delta;
        const mainArea = this.contentElement.querySelector(".basic-main-area");
        const containerWidth = mainArea ? mainArea.offsetWidth : 800;
        const maxSidebarForEditor = containerWidth - MIN_EDITOR_WIDTH - SPLITTER_WIDTH;
        newWidth = Math.max(newWidth, MIN_SIDEBAR_WIDTH);
        newWidth = Math.min(newWidth, MAX_SIDEBAR_WIDTH);
        newWidth = Math.min(newWidth, maxSidebarForEditor);
        this.sidebar.style.width = `${newWidth}px`;
      },
    });
  }

  setupSidebarSplitter() {
    this._cleanupSidebarSplitter = this.setupDragSplitter({
      handle: this.sidebarSplitter,
      cursor: "row-resize",
      getStartValue: () => this.bpSection.offsetHeight,
      onDrag: (startHeight, delta) => {
        const newHeight = Math.min(Math.max(startHeight + delta, 80), 400);
        this.bpSection.style.height = `${newHeight}px`;
      },
    });
  }

  // ========================================
  // Gutter Methods
  // ========================================

  /**
   * Set up event delegation for gutter clicks (called once during init)
   * Using delegation so clicks work even when DOM is updated during program execution
   */
  setupGutterClickHandler() {
    this.gutter.addEventListener("click", (e) => {
      // Find the gutter line element that was clicked
      const gutterLine = e.target.closest(".basic-gutter-line");
      if (!gutterLine) return;

      const index = parseInt(gutterLine.dataset.index, 10);
      if (isNaN(index)) return;

      const lineNumber = this.lineMap[index];
      if (lineNumber !== null) {
        // If line has any breakpoints (whole-line or statement), remove them all
        if (this.breakpointManager.hasAnyForLine(lineNumber)) {
          this.breakpointManager.removeAllForLine(lineNumber);
        } else {
          // Otherwise add a whole-line breakpoint
          this.breakpointManager.add(lineNumber, -1);
        }
        this.updateHighlighting();
        this.renderBreakpointList();
      }
    });
  }

  updateGutter() {
    const text = this.textarea.value;
    const rawLines = text.split(/\r?\n/);

    // Build line map (text line index -> BASIC line number) and gutter HTML
    this.lineMap = [];
    let html = "";

    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i];
      const trimmed = line.trim();
      const match = trimmed.match(/^(\d+)/);
      const lineNumber = match ? parseInt(match[1], 10) : null;

      this.lineMap[i] = lineNumber;

      const hasBp =
        lineNumber !== null && this.breakpointManager.hasAnyForLine(lineNumber);
      const isCurrent =
        lineNumber !== null && this.currentLineNumber === lineNumber;
      const isError =
        lineNumber !== null && this.errorLineNumber === lineNumber;

      const bpClass = hasBp ? "has-bp" : "";
      const currentClass = isCurrent ? "is-current" : "";
      const errorClass = isError ? "has-error" : "";
      const clickable = lineNumber !== null ? "clickable" : "";

      // Gutter shows breakpoint markers with subtle line number tooltip
      const marker = isError ? "!" : (hasBp ? "●" : "");
      html += `
        <div class="basic-gutter-line ${bpClass} ${currentClass} ${errorClass} ${clickable}" data-index="${i}">
          <span class="basic-gutter-bp" title="${lineNumber !== null ? `Line ${lineNumber} - Click to toggle breakpoint` : ""}">${marker}</span>
          <span class="basic-gutter-current">${isCurrent ? "►" : ""}</span>
        </div>
      `;
    }

    // Ensure at least one line for empty editor
    if (rawLines.length === 0) {
      html =
        '<div class="basic-gutter-line"><span class="basic-gutter-bp"></span><span class="basic-gutter-current"></span></div>';
    }

    this.gutter.innerHTML = html;

    // Scroll the current line into view within the editor
    if (this.currentLineNumber !== null && this.lineMap) {
      const lineIndex = this.lineMap.indexOf(this.currentLineNumber);
      if (lineIndex >= 0) {
        const style = getComputedStyle(this.textarea);
        const lineHeight =
          parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5;
        const paddingTop = parseFloat(style.paddingTop) || 8;
        const lineTop = paddingTop + lineIndex * lineHeight;
        const scrollTop = this.textarea.scrollTop;
        const viewHeight = this.textarea.clientHeight;

        if (lineTop < scrollTop || lineTop + lineHeight > scrollTop + viewHeight) {
          this.textarea.scrollTop = lineTop - viewHeight / 2 + lineHeight / 2;
          this.highlight.scrollTop = this.textarea.scrollTop;
          this.gutter.scrollTop = this.textarea.scrollTop;
        }
      }
    }
  }

  // ========================================
  // Editor Methods
  // ========================================

  updateCurrentLineHighlight() {
    if (!this.lineHighlight || !this.textarea) return;
    const text = this.textarea.value.substring(0, this.textarea.selectionStart);
    const lineIndex = text.split("\n").length - 1;
    const style = getComputedStyle(this.textarea);
    // Use computed line height or calculate from font size (11px * 1.5 = 16.5px)
    const lineHeight =
      parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5;
    const paddingTop = parseFloat(style.paddingTop) || 8;
    const top = paddingTop + lineIndex * lineHeight - this.textarea.scrollTop;
    this.lineHighlight.style.top = `${top}px`;
    this.lineHighlight.style.height = `${lineHeight}px`;
  }

  /**
   * Get the current line index (0-based) based on cursor position
   */
  getCurrentLineIndex() {
    if (!this.textarea) return 0;
    const text = this.textarea.value.substring(0, this.textarea.selectionStart);
    return text.split("\n").length - 1;
  }

  /**
   * Check if cursor moved to a different line and auto-format if so
   */
  checkLineChange() {
    const currentLine = this.getCurrentLineIndex();
    if (this.lastEditLine !== -1 && currentLine !== this.lastEditLine) {
      // Line changed - auto-format preserving cursor position
      this.autoFormatPreserveCursor();
    }
    this.lastEditLine = currentLine;
  }

  /**
   * Handle Enter key: split line at cursor, moving text after cursor to new line
   */
  handleEnterKey() {
    const text = this.textarea.value;
    const cursorPos = this.textarea.selectionStart;

    // Get current line info
    const beforeCursor = text.substring(0, cursorPos);
    const lines = text.split("\n");
    const currentLineIndex = beforeCursor.split("\n").length - 1;
    const currentLine = lines[currentLineIndex] || "";

    // Find where cursor is within the current line
    const lineStart = beforeCursor.lastIndexOf("\n") + 1;
    const cursorOffsetInLine = cursorPos - lineStart;

    // Split current line at cursor position
    const lineBeforeCursor = currentLine.substring(0, cursorOffsetInLine);
    const lineAfterCursor = currentLine.substring(cursorOffsetInLine);

    // Find line number for the new line
    const lineNumMatch = currentLine.trim().match(/^(\d+)/);
    let nextLineNum = 10; // Default starting line number

    if (lineNumMatch) {
      const currentLineNum = parseInt(lineNumMatch[1], 10);
      nextLineNum = currentLineNum + 10;
    } else {
      // No line number on current line, look at previous lines
      for (let i = currentLineIndex - 1; i >= 0; i--) {
        const prevMatch = lines[i].trim().match(/^(\d+)/);
        if (prevMatch) {
          nextLineNum = parseInt(prevMatch[1], 10) + 10;
          break;
        }
      }
    }

    // Build new content:
    // - Keep text before cursor on current line
    // - Create new line with next line number + text after cursor (trimmed)
    const textAfterTrimmed = lineAfterCursor.trimStart();
    lines[currentLineIndex] = lineBeforeCursor;
    const newLine = `${nextLineNum} ${textAfterTrimmed}`;
    lines.splice(currentLineIndex + 1, 0, newLine);

    const newText = lines.join("\n");

    // Format the result
    const formatted = formatBasicSource(newText);

    // Update textarea
    this.textarea.value = formatted;

    // Position cursor at the start of the code on the new line (after line number and space)
    const formattedLines = formatted.split("\n");
    let newCursorPos = 0;
    for (let i = 0; i <= currentLineIndex; i++) {
      newCursorPos += formattedLines[i].length + 1; // +1 for newline
    }
    // Position after line number and space on the new line
    const newLineContent = formattedLines[currentLineIndex + 1] || "";
    const newLineMatch = newLineContent.match(/^(\s*\d+\s*)/);
    if (newLineMatch) {
      newCursorPos += newLineMatch[1].length;
    }

    this.textarea.selectionStart = this.textarea.selectionEnd = newCursorPos;

    // Update displays
    this.updateHighlighting();
    this.updateStats();
    this.updateGutter();
    this.updateCurrentLineHighlight();

    // Update line tracking
    this.lastEditLine = this.getCurrentLineIndex();
  }

  /**
   * Auto-format while preserving the cursor position on the current line
   */
  autoFormatPreserveCursor() {
    const text = this.textarea.value;
    if (!text.trim()) return;

    // Get current cursor position info
    const cursorPos = this.textarea.selectionStart;
    const beforeCursor = text.substring(0, cursorPos);
    const currentLineIndex = beforeCursor.split("\n").length - 1;
    const lines = text.split("\n");
    const currentLineStart = beforeCursor.lastIndexOf("\n") + 1;
    const cursorOffsetInLine = cursorPos - currentLineStart;

    // Format the code
    const formatted = formatBasicSource(text);

    // Only update if different
    if (formatted !== text) {
      // Calculate new cursor position
      const formattedLines = formatted.split("\n");
      let newCursorPos = 0;

      // Sum up lengths of lines before current line
      for (let i = 0; i < currentLineIndex && i < formattedLines.length; i++) {
        newCursorPos += formattedLines[i].length + 1; // +1 for newline
      }

      // Add offset within current line (clamped to line length)
      if (currentLineIndex < formattedLines.length) {
        const newLineLength = formattedLines[currentLineIndex].length;
        newCursorPos += Math.min(cursorOffsetInLine, newLineLength);
      }

      this.textarea.value = formatted;
      this.textarea.selectionStart = this.textarea.selectionEnd = newCursorPos;

      this.updateHighlighting();
      this.updateStats();
      this.updateGutter();
    }
  }

  updateHighlighting() {
    const text = this.textarea.value;

    // Use indent-aware highlighting for smart formatting
    const highlightedData = highlightBasicSourceWithIndent(text, {
      preserveCase: true,
    });

    const highlightedLines = [];

    for (let i = 0; i < highlightedData.length; i++) {
      const { html, indent } = highlightedData[i];

      // Build classes for the line
      const isCurrentLine =
        this.currentLineNumber !== null &&
        this.lineMap[i] === this.currentLineNumber;

      let lineClass = "basic-line";
      if (isCurrentLine) lineClass += " basic-current-line";
      if (indent > 0) lineClass += ` indent-${Math.min(indent, 4)}`;

      // For multi-statement lines, wrap each statement in a span
      let lineHtml = html || "&nbsp;";
      const lineNumber = this.lineMap[i];
      const stmtBPs = lineNumber !== null ? this.breakpointManager.getForLine(lineNumber) : [];
      const isMultiStatement = html && html.includes('<span class="bas-punct">:</span>');

      const isErrorLine = this.errorLineNumber !== null && lineNumber === this.errorLineNumber;

      if (isErrorLine) {
        lineClass += " basic-error-line";
      }

      if (isCurrentLine && this.currentStatementInfo && this.currentStatementInfo.statementCount > 1) {
        lineClass += " basic-has-statements";
        lineHtml = this._wrapStatements(html, this.currentStatementInfo, stmtBPs);
      } else if (isErrorLine && this.errorStatementInfo && this.errorStatementInfo.statementCount > 1 && isMultiStatement) {
        lineHtml = this._wrapStatementsForError(html, this.errorStatementInfo, stmtBPs);
      } else if (isMultiStatement && lineNumber !== null) {
        // Wrap all multi-statement lines so statements are clickable for breakpoints
        lineHtml = this._wrapStatementsForBreakpoints(html, stmtBPs);
      }

      if (isErrorLine && this.errorMessage) {
        lineHtml += `<span class="basic-error-msg">${this.errorMessage}</span>`;
      }

      // Wrap each line in a div with appropriate classes
      const highlighted = `<div class="${lineClass}">${lineHtml}</div>`;
      highlightedLines.push(highlighted);
    }

    this.highlight.innerHTML = highlightedLines.join("");
  }

  updateStats() {
    const text = this.textarea.value;
    const lines = text ? text.split(/\r?\n/).filter((l) => l.trim()).length : 0;
    const chars = text.length;

    this.linesSpan.textContent = `${lines} line${lines !== 1 ? "s" : ""}`;
    this.charsSpan.textContent = `${chars} char${chars !== 1 ? "s" : ""}`;
  }

  /**
   * Auto-format the BASIC code in the editor
   * - Aligns line numbers to the right
   * - Adds indentation for FOR/NEXT loops
   */
  autoFormatCode() {
    const text = this.textarea.value;
    if (!text.trim()) return;

    // Format the code
    const formatted = formatBasicSource(text);

    // Only update if different (prevents unnecessary cursor reset)
    if (formatted !== text) {
      this.textarea.value = formatted;
      this.updateGutter();
      this.updateHighlighting();
      this.updateStats();
    }
  }

  /**
   * Renumber all lines in increments of 10, updating GOTO/GOSUB references
   */
  renumberProgram() {
    const text = this.textarea.value;
    if (!text.trim()) return;

    const rawLines = text.split(/\r?\n/);

    // Parse lines and extract line numbers
    const parsedLines = [];
    for (const line of rawLines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const match = trimmed.match(/^(\d+)\s*(.*)/);
      if (match) {
        parsedLines.push({
          oldLineNumber: parseInt(match[1], 10),
          code: match[2] || "",
        });
      }
    }

    if (parsedLines.length === 0) return;

    // Sort by old line number
    parsedLines.sort((a, b) => a.oldLineNumber - b.oldLineNumber);

    // Build mapping from old line numbers to new line numbers
    const lineMap = new Map();
    for (let i = 0; i < parsedLines.length; i++) {
      const newLineNum = (i + 1) * 10;
      lineMap.set(parsedLines[i].oldLineNumber, newLineNum);
      parsedLines[i].newLineNumber = newLineNum;
    }

    // Update line references in code
    for (const line of parsedLines) {
      line.code = this.updateLineReferences(line.code, lineMap);
    }

    // Rebuild the program
    const newLines = parsedLines.map((p) => `${p.newLineNumber} ${p.code}`);
    const renumbered = newLines.join("\n");

    // Format and update
    this.textarea.value = formatBasicSource(renumbered);
    this.updateGutter();
    this.updateHighlighting();
    this.updateStats();

    // Update breakpoints to new line numbers
    this.updateBreakpointsAfterRenumber(lineMap);
  }

  /**
   * Update line number references in BASIC code
   * Handles: GOTO, GOSUB, THEN, ON...GOTO, ON...GOSUB, ONERR GOTO, RESUME
   * @param {string} code - The BASIC code (without line number)
   * @param {Map<number, number>} lineMap - Mapping from old to new line numbers
   * @returns {string} Code with updated line references
   */
  updateLineReferences(code, lineMap) {
    // Convert to uppercase for matching, but preserve original for strings
    let result = "";
    let i = 0;
    let inString = false;

    while (i < code.length) {
      const char = code[i];

      // Track string state
      if (char === '"') {
        inString = !inString;
        result += char;
        i++;
        continue;
      }

      // Inside string - don't modify
      if (inString) {
        result += char;
        i++;
        continue;
      }

      // Check for keywords that take line numbers
      const remaining = code.substring(i).toUpperCase();

      // GOTO linenum
      if (remaining.startsWith("GOTO")) {
        result += code.substring(i, i + 4);
        i += 4;
        const updated = this.updateLineNumberList(code.substring(i), lineMap);
        result += updated.text;
        i += updated.consumed;
        continue;
      }

      // GOSUB linenum
      if (remaining.startsWith("GOSUB")) {
        result += code.substring(i, i + 5);
        i += 5;
        const updated = this.updateLineNumberList(code.substring(i), lineMap);
        result += updated.text;
        i += updated.consumed;
        continue;
      }

      // THEN can be followed by line number (short GOTO) or statements
      if (remaining.startsWith("THEN")) {
        result += code.substring(i, i + 4);
        i += 4;
        // Skip whitespace and check if followed by a digit
        let ws = "";
        let j = i;
        while (j < code.length && /\s/.test(code[j])) {
          ws += code[j];
          j++;
        }
        if (j < code.length && /\d/.test(code[j])) {
          // It's THEN linenum
          result += ws;
          i = j;
          const updated = this.updateSingleLineNumber(
            code.substring(i),
            lineMap,
          );
          result += updated.text;
          i += updated.consumed;
        }
        continue;
      }

      // RESUME linenum (optional - can be just RESUME)
      if (remaining.startsWith("RESUME")) {
        result += code.substring(i, i + 6);
        i += 6;
        // Skip whitespace and check if followed by a digit
        let ws = "";
        let j = i;
        while (j < code.length && /\s/.test(code[j])) {
          ws += code[j];
          j++;
        }
        if (j < code.length && /\d/.test(code[j])) {
          result += ws;
          i = j;
          const updated = this.updateSingleLineNumber(
            code.substring(i),
            lineMap,
          );
          result += updated.text;
          i += updated.consumed;
        }
        continue;
      }

      // Default: copy character
      result += char;
      i++;
    }

    return result;
  }

  /**
   * Update a comma-separated list of line numbers (for ON...GOTO/GOSUB)
   * @param {string} text - Text starting after GOTO/GOSUB keyword
   * @param {Map<number, number>} lineMap - Mapping from old to new line numbers
   * @returns {{text: string, consumed: number}} Updated text and characters consumed
   */
  updateLineNumberList(text, lineMap) {
    let result = "";
    let i = 0;

    // Skip leading whitespace
    while (i < text.length && /\s/.test(text[i])) {
      result += text[i];
      i++;
    }

    // Parse line numbers separated by commas
    while (i < text.length) {
      // Check for digit
      if (/\d/.test(text[i])) {
        let numStr = "";
        while (i < text.length && /\d/.test(text[i])) {
          numStr += text[i];
          i++;
        }
        const oldNum = parseInt(numStr, 10);
        const newNum = lineMap.has(oldNum) ? lineMap.get(oldNum) : oldNum;
        result += newNum.toString();

        // Skip whitespace after number
        while (i < text.length && /\s/.test(text[i])) {
          result += text[i];
          i++;
        }

        // Check for comma (more line numbers follow)
        if (i < text.length && text[i] === ",") {
          result += ",";
          i++;
          // Skip whitespace after comma
          while (i < text.length && /\s/.test(text[i])) {
            result += text[i];
            i++;
          }
          continue;
        }
      }
      // End of line number list
      break;
    }

    return { text: result, consumed: i };
  }

  /**
   * Update a single line number
   * @param {string} text - Text starting at the line number
   * @param {Map<number, number>} lineMap - Mapping from old to new line numbers
   * @returns {{text: string, consumed: number}} Updated text and characters consumed
   */
  updateSingleLineNumber(text, lineMap) {
    let numStr = "";
    let i = 0;

    while (i < text.length && /\d/.test(text[i])) {
      numStr += text[i];
      i++;
    }

    if (numStr) {
      const oldNum = parseInt(numStr, 10);
      const newNum = lineMap.has(oldNum) ? lineMap.get(oldNum) : oldNum;
      return { text: newNum.toString(), consumed: i };
    }

    return { text: "", consumed: 0 };
  }

  /**
   * Update breakpoints to new line numbers after renumbering
   * @param {Map<number, number>} lineMap - Mapping from old to new line numbers
   */
  updateBreakpointsAfterRenumber(lineMap) {
    const allEntries = this.breakpointManager.getAllEntries();

    // Save all entries with their states
    const savedEntries = allEntries.map(e => ({
      lineNumber: e.lineNumber,
      statementIndex: e.statementIndex,
      enabled: e.enabled,
    }));

    // Clear all breakpoints
    this.breakpointManager.clear();

    // Re-add at new line numbers
    for (const entry of savedEntries) {
      const newLine = lineMap.get(entry.lineNumber);
      if (newLine !== undefined) {
        this.breakpointManager.add(newLine, entry.statementIndex);
        if (!entry.enabled) {
          this.breakpointManager.setEnabled(newLine, entry.statementIndex, false);
        }
      }
    }

    this.renderBreakpointList();
  }

  parseProgram(text) {
    const lines = [];
    const rawLines = text.split(/\r?\n/);

    for (const rawLine of rawLines) {
      const trimmed = rawLine.trim().toUpperCase();
      if (!trimmed) continue;

      const match = trimmed.match(/^(\d+)\s*(.*)/);
      if (!match) {
        console.warn("Skipping line without line number:", rawLine);
        continue;
      }

      const lineNum = parseInt(match[1], 10);
      if (lineNum < 0 || lineNum > 63999) {
        console.warn("Invalid line number:", lineNum);
        continue;
      }

      lines.push({
        lineNumber: lineNum,
        content: match[2] || "",
      });
    }

    lines.sort((a, b) => a.lineNumber - b.lineNumber);
    return lines;
  }

  /**
   * Load the current BASIC program from emulator memory into the textarea
   */
  newFile() {
    if (this.textarea.value.trim() && !confirm("Clear current source and start new file?")) return;
    this.textarea.value = "";
    this._fileHandle = null;
    this.updateGutter();
    this.updateHighlighting();
    this.updateStats();
  }

  async openFile() {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: "BASIC source files", accept: { "text/plain": [".bas", ".txt"] } }],
        multiple: false,
      });
      const file = await handle.getFile();
      this.textarea.value = await file.text();
      this._fileHandle = handle;
      this.updateGutter();
      this.updateHighlighting();
      this.updateStats();
    } catch (err) {
      if (err.name !== "AbortError") console.error("Failed to open file:", err);
    }
  }

  async saveFile() {
    const content = this.textarea.value;
    if (!content.trim()) return;
    try {
      if (!this._fileHandle) {
        this._fileHandle = await window.showSaveFilePicker({
          suggestedName: "program.bas",
          types: [{ description: "BASIC source files", accept: { "text/plain": [".bas", ".txt"] } }],
        });
      }
      const writable = await this._fileHandle.createWritable();
      await writable.write(content);
      await writable.close();
    } catch (err) {
      if (err.name !== "AbortError") console.error("Failed to save file:", err);
    }
  }

  loadFromMemory() {
    const lines = this.programParser.getLines();
    if (lines.length === 0) {
      console.log("No BASIC program in memory");
      return;
    }

    if (this.errorLineNumber !== null) this._clearError();

    // Build textarea content from parsed program lines
    const textLines = lines.map((line) => `${line.lineNumber} ${line.text}`);
    const rawContent = textLines.join("\n");

    // Auto-format the loaded content
    this.textarea.value = formatBasicSource(rawContent);

    this.updateGutter();
    this.updateHighlighting();
    this.updateStats();

    console.log(`Loaded ${lines.length} lines from memory`);
  }

  loadIntoMemory() {
    if (this.isRunningCallback && !this.isRunningCallback()) {
      showToast("Emulator is off", "error");
      return;
    }

    const text = this.textarea.value;
    if (!text.trim()) {
      showToast("No program to load", "warning");
      return;
    }

    const lines = this.parseProgram(text);
    if (lines.length === 0) {
      showToast("No valid BASIC lines found", "error");
      return;
    }

    const txttab = 0x0801;
    const { bytes, endAddr } = tokenizeProgram(lines, txttab);

    // Write tokenized program bytes into emulator memory
    for (let i = 0; i < bytes.length; i++) {
      this.wasmModule._writeMemory(txttab + i, bytes[i]);
    }

    // Helper to write a 16-bit little-endian pointer to zero page
    const writePtr = (zpAddr, value) => {
      this.wasmModule._writeMemory(zpAddr, value & 0xFF);
      this.wasmModule._writeMemory(zpAddr + 1, (value >> 8) & 0xFF);
    };

    // Read MEMSIZE ($73) - the ROM sets FRETOP to this on CLR/NEW
    const memsizeLo = this.wasmModule._readMemory(0x73);
    const memsizeHi = this.wasmModule._readMemory(0x74);
    const memsize = memsizeLo | (memsizeHi << 8);

    // Update Applesoft zero page pointers to match what NEW + CLEARC set up:
    //   SCRTCH ($D64B): TXTTAB, VARTAB, PRGEND
    //   CLEARC ($D66C): FRETOP=MEMSIZE, ARYTAB=VARTAB, STREND=VARTAB
    writePtr(0x67, txttab);     // TXTTAB - start of program
    writePtr(0x69, endAddr);    // VARTAB - start of variable space
    writePtr(0x6B, endAddr);    // ARYTAB - start of array space
    writePtr(0x6D, endAddr);    // STREND - end of numeric storage
    writePtr(0x6F, memsize);    // FRETOP - end of string storage (top of free memory)
    writePtr(0xAF, endAddr);    // PRGEND - end of program (used by line editor)

    // Set interpreter state for direct mode
    writePtr(0xB8, txttab - 1); // TXTPTR - interpreter text pointer
    this.wasmModule._writeMemory(0x76, 0xFF); // CURLIN+1 high byte = $FF (direct mode)

    // Invalidate the program parser cache so Load from Memory sees new data
    this.programParser.invalidateCache();

    showToast(`Loaded ${lines.length} lines into emulator`, "info");
    console.log(`BASIC program loaded into memory: ${lines.length} lines, ${bytes.length} bytes`);
  }

  _showBreakpointHelp() {
    // Remove existing popover if shown
    const existing = this.contentElement.querySelector(".basic-info-popover");
    if (existing) {
      existing.remove();
      return;
    }

    const popover = document.createElement("div");
    popover.className = "basic-info-popover";
    popover.innerHTML = `
      <div class="basic-info-popover-title">Breakpoints</div>
      <div class="basic-info-popover-row">
        <span class="basic-info-popover-key">Click gutter</span>
        <span class="basic-info-popover-desc">Toggle line breakpoint</span>
      </div>
      <div class="basic-info-popover-row">
        <span class="basic-info-popover-key">${navigator.platform.includes("Mac") ? "Option" : "Alt"}+Click statement</span>
        <span class="basic-info-popover-desc">Toggle statement breakpoint</span>
      </div>
    `;

    // Position below the toolbar button
    const btnRect = this.infoBtn.getBoundingClientRect();
    popover.style.top = `${btnRect.bottom + 4}px`;
    popover.style.left = `${btnRect.right - 260}px`;
    document.body.appendChild(popover);

    // Close on click outside
    const close = (e) => {
      if (!popover.contains(e.target) && e.target !== this.infoBtn) {
        popover.remove();
        document.removeEventListener("mousedown", close);
      }
    };
    setTimeout(() => document.addEventListener("mousedown", close), 0);
  }

  // ========================================
  // Debugger Methods
  // ========================================

  /**
   * Run - Type RUN command into emulator to start BASIC program
   */
  handleRun() {
    if (!this.isRunningCallback || !this.isRunningCallback()) {
      console.log("Emulator not running");
      return;
    }

    const isPaused = this.wasmModule._isPaused();

    if (isPaused) {
      // Continue from pause
      this._varAutoRefresh = true;
      this._lastBasicBreakpointHit = false;
      this.currentLineNumber = null;
      this.currentStatementInfo = null;
      this.updateGutter();
      this.updateHighlighting();

      // Just unpause - the C++ setPaused(false) automatically handles:
      // - Setting skipBasicBreakpointLine_ if we're at a BASIC breakpoint
      // - Clearing the breakpoint hit flags
      this.wasmModule._setPaused(false);
    } else {
      // Fresh run
      this._lastBasicBreakpointHit = false;
      this._lastProgramRunning = false;
      this.currentLineNumber = null;
      this.currentStatementInfo = null;
      if (this.errorLineNumber !== null) this._clearError();

      this.wasmModule._setPaused(false);

      if (this.wasmModule._clearBasicBreakpointHit) {
        this.wasmModule._clearBasicBreakpointHit();
      }

      this.updateGutter();
      this.updateHighlighting();
      this._varAutoRefresh = true;

      this.inputHandler.queueTextInput("RUN\r");
    }
  }

  /**
   * Pause - Pause the emulator, then step to the next BASIC line so
   * the program stops cleanly at a line boundary with highlighting.
   */
  handlePause() {
    if (!this.isRunningCallback || !this.isRunningCallback()) {
      return;
    }

    // Stop auto-refreshing variables (breakpoint hit will do a final render)
    this._varAutoRefresh = false;

    // Pause first so the step machinery can read consistent state
    this.wasmModule._setPaused(true);

    // Reset tracking flag so we detect the next breakpoint hit
    this._lastBasicBreakpointHit = false;

    // Now step to the next BASIC statement - unpauses and runs until
    // PC hits $D820 (JSR EXECUTE_STATEMENT), the start of the next statement
    if (this.wasmModule._stepBasicStatement) {
      this.wasmModule._stepBasicStatement();
    }
  }

  /**
   * Step - Execute current BASIC statement and stop at next statement.
   * Uses C++ stepBasicStatement() which breaks at $D820 (JSR EXECUTE_STATEMENT),
   * the ROM point where both new-line and colon paths converge.
   */
  handleStepLine() {
    // Check if BASIC is actually running (not in direct mode)
    const state = this.programParser.getExecutionState();
    if (state.currentLine === null) {
      // BASIC not running - clear any stale state
      // Unpause first, then clear to remove any skip logic
      this.wasmModule._setPaused(false);
      if (this.wasmModule._clearBasicBreakpointHit) {
        this.wasmModule._clearBasicBreakpointHit();
      }
      return;
    }

    // Reset tracking flag so we detect the next breakpoint hit
    this._lastBasicBreakpointHit = false;

    // Use C++ statement stepping - breaks at ROM's EXECUTE_STATEMENT entry
    if (this.wasmModule._stepBasicStatement) {
      this.wasmModule._stepBasicStatement();
    } else {
      console.error("_stepBasicStatement not available - rebuild WASM");
    }
  }

  addBreakpointFromInput() {
    const value = this.bpInput.value.trim();
    if (!value) return;

    const lineNumber = parseInt(value, 10);
    if (isNaN(lineNumber) || lineNumber < 0 || lineNumber > 63999) {
      this.bpInput.classList.add("error");
      setTimeout(() => this.bpInput.classList.remove("error"), 500);
      return;
    }

    this.breakpointManager.add(lineNumber, -1);
    this.bpInput.value = "";
    this.updateGutter();
    this.updateHighlighting();
    this.renderBreakpointList();
  }

  /**
   * Build a structural fingerprint of the current variable set.
   * When this changes, a full DOM rebuild is needed; otherwise values update in-place.
   */
  _getVarStructureKey(variables, arrays) {
    let key = "";
    for (const v of variables) key += `${v.name}:${v.type};`;
    key += "|";
    for (const a of arrays) key += `${a.name}:${a.type}:${a.dimensions.join(",")};`;
    return key;
  }

  renderVariables() {
    const now = Date.now();
    const fadeTime = 1000;

    const variables = this.variableInspector.getSimpleVariables();
    const arrays = this.variableInspector.getArrayVariables();

    if (variables.length === 0 && arrays.length === 0) {
      if (this._varStructureKey !== "empty") {
        this._varStructureKey = "empty";
        this.varPanel.innerHTML =
          '<div class="basic-dbg-empty">No variables</div>';
      }
      return;
    }

    const structureKey = this._getVarStructureKey(variables, arrays);
    const structureChanged = structureKey !== this._varStructureKey;

    if (structureChanged) {
      this._varStructureKey = structureKey;
      this._fullRenderVariables(variables, arrays);
      return;
    }

    // In-place value update — no DOM rebuild
    this._updateVariableValues(variables, arrays);
  }

  _fullRenderVariables(variables, arrays) {
    let html = "";

    if (variables.length > 0) {
      html += '<div class="basic-dbg-var-list">';
      for (const v of variables) {
        const displayValue = this.variableInspector.formatValue(v);
        this.previousVariables.set(v.name, displayValue);

        const typeClass = `var-type-${v.type}`;
        const isPaused = this.wasmModule._isPaused && this.wasmModule._isPaused();
        const editableClass = isPaused ? "editable" : "";
        html += `
          <div class="basic-dbg-var-row ${typeClass}" data-var-addr="${v.addr}" data-var-type="${v.type}">
            <span class="basic-dbg-var-name">${v.name}</span>
            <span class="basic-dbg-var-value ${editableClass}">${escapeHtml(displayValue)}</span>
          </div>
        `;
      }
      html += "</div>";
    }

    if (arrays.length > 0) {
      html += '<div class="basic-dbg-arr-list">';
      for (const arr of arrays) {
        const dimsStr = arr.dimensions.map((d) => d - 1).join(",");
        const isExpanded = this.expandedArrays.has(arr.name);

        html += `
          <div class="basic-dbg-arr-item ${isExpanded ? "expanded" : ""}" data-arr-addr="${arr.addr}" data-arr-type="${arr.type}" data-arr-numdims="${arr.numDims}">
            <div class="basic-dbg-arr-header" data-arr-name="${arr.name}">
              <span class="basic-dbg-arr-toggle">${isExpanded ? "▼" : "▶"}</span>
              <span class="basic-dbg-arr-name">${arr.name}(${dimsStr})</span>
              <span class="basic-dbg-arr-info">${arr.totalElements} el</span>
            </div>
            <div class="basic-dbg-arr-body" style="display: ${isExpanded ? "block" : "none"}">
              ${this.renderArrayContents(arr)}
            </div>
          </div>
        `;
      }
      html += "</div>";
    }

    this.varPanel.innerHTML = html;
  }

  _updateVariableValues(variables, arrays) {
    const isPaused = this.wasmModule._isPaused && this.wasmModule._isPaused();
    // Update simple variable values in-place
    const rows = this.varPanel.querySelectorAll(".basic-dbg-var-row");
    for (let i = 0; i < variables.length && i < rows.length; i++) {
      const v = variables[i];
      const row = rows[i];
      const key = v.name;
      const prevValue = this.previousVariables.get(key);
      const displayValue = this.variableInspector.formatValue(v);
      const changed = prevValue !== undefined && prevValue !== displayValue;
      this.previousVariables.set(key, displayValue);

      // Update value text
      const valueSpan = row.querySelector(".basic-dbg-var-value");
      if (valueSpan && !valueSpan.querySelector("input")) {
        valueSpan.textContent = displayValue;
      }

      // Flash on change — restart animation by removing and re-adding class
      if (changed) {
        row.classList.remove("changed");
        void row.offsetWidth;
        row.classList.add("changed");
      }

      // Update editable state based on pause status
      if (valueSpan) {
        if (isPaused) {
          valueSpan.classList.add("editable");
        } else {
          valueSpan.classList.remove("editable");
        }
      }

      // Update address in case memory shifted
      row.dataset.varAddr = v.addr;
    }

    // Update expanded array values in-place
    const arrItems = this.varPanel.querySelectorAll(".basic-dbg-arr-item");
    for (let i = 0; i < arrays.length && i < arrItems.length; i++) {
      const arr = arrays[i];

      // Update array address data in case memory shifted
      arrItems[i].dataset.arrAddr = arr.addr;

      if (!this.expandedArrays.has(arr.name)) continue;

      const valEls = arrItems[i].querySelectorAll(".basic-dbg-arr-val");
      for (let j = 0; j < arr.values.length && j < valEls.length; j++) {
        const formatted = this.variableInspector.formatValue({ type: arr.type, value: arr.values[j] });
        if (valEls[j].textContent !== formatted && !valEls[j].querySelector("input")) {
          valEls[j].textContent = formatted;
          // Flash on change
          valEls[j].classList.remove("changed");
          void valEls[j].offsetWidth;
          valEls[j].classList.add("changed");
        }
        // Update editable state
        if (isPaused) {
          valEls[j].classList.add("editable");
        } else {
          valEls[j].classList.remove("editable");
        }
      }
    }
  }

  /**
   * Start inline editing of a variable value
   */
  _startVariableEdit(valueSpan) {
    if (valueSpan.querySelector("input")) return; // already editing

    const row = valueSpan.closest(".basic-dbg-var-row");
    const addr = parseInt(row.dataset.varAddr, 10);
    const type = row.dataset.varType;
    const currentText = valueSpan.textContent;

    const input = document.createElement("input");
    input.type = "text";
    input.className = "basic-dbg-var-edit";
    input.value = currentText;

    valueSpan.textContent = "";
    valueSpan.appendChild(input);
    input.focus();
    input.select();

    const commit = () => {
      const newVal = input.value.trim();
      if (newVal !== currentText) {
        const varInfo = { addr, type };
        this.variableInspector.setVariableValue(varInfo, newVal);
      }
      // Force full rebuild to remove the input element from the DOM
      this._varStructureKey = null;
      this.renderVariables();
    };

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); commit(); }
      if (e.key === "Escape") { e.preventDefault(); this._varStructureKey = null; this.renderVariables(); }
      e.stopPropagation();
    });
    input.addEventListener("blur", commit);
  }

  /**
   * Start inline editing of an array element value
   */
  _startArrayElementEdit(valEl) {
    if (valEl.querySelector("input")) return;

    const arrItem = valEl.closest(".basic-dbg-arr-item");
    if (!arrItem) return;

    const addr = parseInt(arrItem.dataset.arrAddr, 10);
    const type = arrItem.dataset.arrType;
    const numDims = parseInt(arrItem.dataset.arrNumdims, 10);
    const elementIndex = parseInt(valEl.dataset.elemIdx, 10);
    const currentText = valEl.textContent;

    const input = document.createElement("input");
    input.type = "text";
    input.className = "basic-dbg-var-edit";
    input.value = currentText;

    valEl.textContent = "";
    valEl.appendChild(input);
    input.focus();
    input.select();

    const commit = () => {
      const newVal = input.value.trim();
      if (newVal !== currentText) {
        this.variableInspector.setArrayElementValue(
          { addr, type, numDims, elementIndex },
          newVal,
        );
      }
      // Force full rebuild to reflect changes
      this._varStructureKey = null;
      this.renderVariables();
    };

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); commit(); }
      if (e.key === "Escape") { e.preventDefault(); this._varStructureKey = null; this.renderVariables(); }
      e.stopPropagation();
    });
    input.addEventListener("blur", commit);
  }

  /**
   * Render array contents as a grid or table
   */
  renderArrayContents(arr) {
    const dims = arr.dimensions;
    const values = arr.values;
    const type = arr.type;
    const isPaused = this.wasmModule._isPaused && this.wasmModule._isPaused();
    const editClass = isPaused ? " editable" : "";

    // Format a single value using the same logic as simple variables
    const formatVal = (v) => {
      return escapeHtml(this.variableInspector.formatValue({ type, value: v }));
    };

    // 1D array - simple indexed list
    if (dims.length === 1) {
      let html = '<div class="basic-dbg-arr-contents basic-dbg-arr-1d">';
      for (let i = 0; i < values.length; i++) {
        html += `<div class="basic-dbg-arr-cell">
          <span class="basic-dbg-arr-idx">${i}</span>
          <span class="basic-dbg-arr-val${editClass}" data-elem-idx="${i}">${formatVal(values[i])}</span>
        </div>`;
      }
      html += "</div>";
      return html;
    }

    // 2D array - table view
    if (dims.length === 2) {
      const rows = dims[0];
      const cols = dims[1];
      let html = '<div class="basic-dbg-arr-contents basic-dbg-arr-2d">';
      html += '<table class="basic-dbg-arr-table"><thead><tr><th></th>';
      for (let c = 0; c < cols; c++) {
        html += `<th>${c}</th>`;
      }
      html += "</tr></thead><tbody>";
      for (let r = 0; r < rows; r++) {
        html += `<tr><th>${r}</th>`;
        for (let c = 0; c < cols; c++) {
          const idx = r * cols + c;
          const val = idx < values.length ? formatVal(values[idx]) : "?";
          html += `<td class="basic-dbg-arr-val${editClass}" data-elem-idx="${idx}">${val}</td>`;
        }
        html += "</tr>";
      }
      html += "</tbody></table></div>";
      return html;
    }

    // 3D+ array - indexed list with full indices
    let html = '<div class="basic-dbg-arr-contents basic-dbg-arr-nd">';
    for (let i = 0; i < values.length; i++) {
      // Calculate multi-dimensional index
      const indices = [];
      let remaining = i;
      for (let d = dims.length - 1; d >= 0; d--) {
        indices.unshift(remaining % dims[d]);
        remaining = Math.floor(remaining / dims[d]);
      }
      const idxStr = indices.join(",");
      html += `<div class="basic-dbg-arr-cell">
        <span class="basic-dbg-arr-idx">(${idxStr})</span>
        <span class="basic-dbg-arr-val${editClass}" data-elem-idx="${i}">${formatVal(values[i])}</span>
      </div>`;
    }
    html += "</div>";
    return html;
  }

  renderBreakpointList() {
    const entries = this.breakpointManager.getAllEntries();

    if (entries.length === 0) {
      this.bpList.innerHTML =
        '<div class="basic-dbg-bp-empty">Click a line number in the gutter to toggle a breakpoint, or add one above.</div>';
      return;
    }

    let html = "";
    for (const entry of entries) {
      const enabledClass = entry.enabled ? "" : "disabled";
      const label = entry.statementIndex >= 0
        ? `Line ${entry.lineNumber} : ${entry.statementIndex}`
        : `Line ${entry.lineNumber}`;

      html += `
        <div class="basic-dbg-bp-item ${enabledClass}" data-line="${entry.lineNumber}" data-stmt="${entry.statementIndex}">
          <input type="checkbox" class="basic-dbg-bp-enabled"
                 ${entry.enabled ? "checked" : ""} data-line="${entry.lineNumber}" data-stmt="${entry.statementIndex}">
          <span class="basic-dbg-bp-line">${label}</span>
          <button class="basic-dbg-bp-remove" data-line="${entry.lineNumber}" data-stmt="${entry.statementIndex}" title="Remove">×</button>
        </div>
      `;
    }

    this.bpList.innerHTML = html;

    this.bpList.querySelectorAll(".basic-dbg-bp-enabled").forEach((cb) => {
      cb.addEventListener("change", () => {
        const lineNum = parseInt(cb.dataset.line, 10);
        const stmtIdx = parseInt(cb.dataset.stmt, 10);
        this.breakpointManager.setEnabled(lineNum, stmtIdx, cb.checked);
        this.updateGutter();
        this.updateHighlighting();
      });
    });

    this.bpList.querySelectorAll(".basic-dbg-bp-remove").forEach((btn) => {
      btn.addEventListener("click", () => {
        const lineNum = parseInt(btn.dataset.line, 10);
        const stmtIdx = parseInt(btn.dataset.stmt, 10);
        this.breakpointManager.remove(lineNum, stmtIdx);
        this.updateGutter();
        this.updateHighlighting();
        this.renderBreakpointList();
      });
    });
  }

  // ========================================
  // Update Loop
  // ========================================

  update(wasmModule) {
    if (!this.isVisible) return;

    const now = Date.now();
    const state = this.programParser.getExecutionState();
    const isPaused = wasmModule._isPaused();

    // Track BASIC program running state from C++ ROM hooks ($D912=RUN, $D43C=RESTART)
    const isEditing = this.varPanel && this.varPanel.querySelector(".basic-dbg-var-edit");
    const programRunning = this.wasmModule._isBasicProgramRunning
      ? this.wasmModule._isBasicProgramRunning()
      : false;

    // Enable/disable Read and Write buttons based on emulator state
    const emulatorOn = this.isRunningCallback ? this.isRunningCallback() : false;
    this.loadBtn.disabled = !emulatorOn;
    this.insertBtn.disabled = !emulatorOn;

    // Update program status indicator
    if (isPaused && programRunning) {
      this.setStatus("paused");
    } else if (programRunning) {
      this.setStatus("running");
    } else {
      this.setStatus("idle");
    }

    // Auto-start refresh when program starts running (even from emulator directly)
    if (programRunning && !this._varAutoRefresh && !isPaused) {
      this._varAutoRefresh = true;
    }

    // Auto-stop refresh when program ends or pauses
    if (this._varAutoRefresh && (!programRunning || isPaused)) {
      this._varAutoRefresh = false;
      this.renderVariables();
    }

    // Refresh variables at 10fps while auto-refresh is active
    if (this._varAutoRefresh) {
      if (!this._lastVarUpdateTime || now - this._lastVarUpdateTime >= 100) {
        this._lastVarUpdateTime = now;
        this.renderVariables();
      }
    }

    // Throttle other updates to 10fps (100ms) to reduce CPU load
    if (this._lastUpdateTime && now - this._lastUpdateTime < 100) {
      return;
    }
    this._lastUpdateTime = now;

    // Check for BASIC breakpoint hit (breakpoint or step completion)
    // Track state transition to detect NEW breakpoint hits (not just being paused at one)
    const basicBreakpointHit = isPaused && wasmModule._isBasicBreakpointHit();
    if (basicBreakpointHit && !this._lastBasicBreakpointHit) {
      const breakLine = wasmModule._getBasicBreakLine();
      this.currentLineNumber = breakLine;
      // Get statement info using TXTPTR from execution state
      if (wasmModule._getBasicTxtptr) {
        const txtptr = wasmModule._getBasicTxtptr();
        this.currentStatementInfo = this.programParser.getCurrentStatementInfo(breakLine, txtptr);
      } else {
        this.currentStatementInfo = null;
      }
      this.updateGutter();
      this.updateHighlighting();
      this.renderVariables();
    }
    this._lastBasicBreakpointHit = basicBreakpointHit;

    // Reset breakpoint tracking when BASIC stops running (program ended)
    // so next RUN will properly detect the first breakpoint hit
    if (!state.running && this._lastProgramRunning) {
      // Check if program stopped due to a runtime error
      if (this.wasmModule._isBasicErrorHit && this.wasmModule._isBasicErrorHit()) {
        const errorLine = this.wasmModule._getBasicErrorLine();
        const errorTxtptr = this.wasmModule._getBasicErrorTxtptr();
        const errorCode = this.wasmModule._getBasicErrorCode();
        this._setError(errorLine, errorTxtptr, errorCode);
        this.wasmModule._clearBasicError();
      }

      this._varAutoRefresh = false;
      this._lastBasicBreakpointHit = false;
      // First unpause, then clear all breakpoint state
      // This order ensures any skip logic from unpausing gets cleared
      this.wasmModule._setPaused(false);
      if (this.wasmModule._clearBasicBreakpointHit) {
        this.wasmModule._clearBasicBreakpointHit();
      }
      // Clear current line highlight when program ends
      if (this.currentLineNumber !== null) {
        this.currentLineNumber = null;
        this.currentStatementInfo = null;
        this.updateGutter();
        this.updateHighlighting();
      }
    }
    this._lastProgramRunning = state.running;

    // Update line/ptr display (only show when paused, otherwise it flickers too fast)
    if (
      isPaused &&
      state.currentLine !== null
    ) {
      let lineText = `LINE: ${state.currentLine}`;
      if (this.currentStatementInfo && this.currentStatementInfo.statementCount > 1) {
        lineText += ` [${this.currentStatementInfo.statementIndex + 1}/${this.currentStatementInfo.statementCount}]`;
      }
      this.lineSpan.textContent = lineText;
      this.ptrSpan.textContent = `PTR: $${this.formatHex(state.txtptr, 4)}`;
    } else {
      this.lineSpan.textContent = "LINE: ---";
      this.ptrSpan.textContent = "PTR: $----";
    }

    // Only update gutter/highlighting for current line when paused
    // This prevents constant rebuilding that interferes with click events
    if (isPaused) {
      // Update statement info even if line hasn't changed (statement may have changed)
      let stmtInfo = null;
      if (wasmModule._getBasicTxtptr && state.currentLine !== null) {
        const txtptr = wasmModule._getBasicTxtptr();
        stmtInfo = this.programParser.getCurrentStatementInfo(state.currentLine, txtptr);
      }
      const stmtChanged = this._statementInfoChanged(this.currentStatementInfo, stmtInfo);

      if (state.currentLine !== this.currentLineNumber || stmtChanged) {
        this.currentLineNumber = state.currentLine;
        this.currentStatementInfo = stmtInfo;
        this.updateGutter();
        this.updateHighlighting();
      }
    } else if (this.currentLineNumber !== null) {
      // Clear line highlighting when not paused
      this.currentLineNumber = null;
      this.currentStatementInfo = null;
      this.updateHighlighting();
    }
  }

  /**
   * Wrap statement segments in spans for multi-statement line highlighting.
   * Finds colon boundaries in the text content (ignoring HTML tags) and wraps
   * each statement. The active statement gets the basic-current-statement class.
   */
  /**
   * Wrap statement segments in spans for multi-statement line highlighting.
   * Splits the highlighted HTML at colon punctuation spans (<span class="bas-punct">:</span>)
   * which the syntax highlighter produces for statement-separating colons.
   * The colon span is included as the last element of the preceding statement segment.
   */
  /**
   * Split HTML at colon boundaries and return segments
   */
  _splitAtColons(html) {
    const colonPattern = /<span class="bas-punct">:<\/span>/g;
    const colonMatches = [];
    let match;
    while ((match = colonPattern.exec(html)) !== null) {
      colonMatches.push({ index: match.index, length: match[0].length });
    }

    if (colonMatches.length === 0) {
      return [html];
    }

    const segments = [];
    let pos = 0;
    for (let i = 0; i < colonMatches.length; i++) {
      const colonEnd = colonMatches[i].index + colonMatches[i].length;
      segments.push(html.substring(pos, colonEnd));
      pos = colonEnd;
    }
    if (pos < html.length) {
      segments.push(html.substring(pos));
    }
    return segments;
  }

  _wrapStatements(html, stmtInfo, stmtBPs = []) {
    const segments = this._splitAtColons(html);

    // Build a set of statement indices with breakpoints
    const bpStmtSet = new Set();
    for (const bp of stmtBPs) {
      if (bp.statementIndex >= 0) bpStmtSet.add(bp.statementIndex);
    }

    let result = "";
    for (let i = 0; i < segments.length; i++) {
      let cls = "";
      if (i === stmtInfo.statementIndex) cls += " basic-current-statement";
      if (bpStmtSet.has(i)) cls += " basic-statement-bp";
      result += `<span class="basic-statement${cls}">${segments[i]}</span>`;
    }
    return result;
  }

  /**
   * Wrap statements for breakpoint display on non-current lines.
   * Similar to _wrapStatements but without current-statement highlighting.
   */
  _wrapStatementsForBreakpoints(html, stmtBPs) {
    const segments = this._splitAtColons(html);

    // If only 1 segment, no colons found - can't split into statements
    if (segments.length <= 1) return html;

    const bpStmtSet = new Set();
    for (const bp of stmtBPs) {
      if (bp.statementIndex >= 0) bpStmtSet.add(bp.statementIndex);
    }

    let result = "";
    for (let i = 0; i < segments.length; i++) {
      const cls = bpStmtSet.has(i) ? " basic-statement-bp" : "";
      result += `<span class="basic-statement${cls}">${segments[i]}</span>`;
    }
    return result;
  }

  _statementInfoChanged(a, b) {
    if (a === b) return false;
    if (!a || !b) return true;
    return a.statementIndex !== b.statementIndex ||
           a.statementCount !== b.statementCount;
  }

  _setError(lineNumber, txtptr, errorCode) {
    this.errorLineNumber = lineNumber;
    this.errorMessage = BASIC_ERRORS[errorCode] || `ERROR ${errorCode}`;
    this.errorStatementInfo = this.programParser.getCurrentStatementInfo(lineNumber, txtptr);

    // Capture the code portion of the error line for tracking across renumbers
    this.errorLineContent = this._getLineContent(lineNumber);

    this.setStatus("error");
    this.updateGutter();
    this.updateHighlighting();
  }

  _clearError() {
    this.errorLineNumber = null;
    this.errorStatementInfo = null;
    this.errorMessage = null;
    this.errorLineContent = null;
    this.setStatus("idle");
  }

  /**
   * Get the code portion (after the line number) for a given BASIC line number
   */
  _getLineContent(lineNumber) {
    if (!this.textarea) return null;
    const rawLines = this.textarea.value.split(/\r?\n/);
    for (const line of rawLines) {
      const match = line.trim().match(/^(\d+)\s*(.*)/);
      if (match && parseInt(match[1], 10) === lineNumber) {
        return match[2];
      }
    }
    return null;
  }

  /**
   * Track the error line across edits. If the BASIC line number still exists,
   * keep it. If it was renumbered, find the line with matching code content
   * and follow it. If the code content itself was edited or removed, clear.
   */
  _trackErrorLine() {
    if (this.errorLineNumber === null) return;

    const rawLines = this.textarea.value.split(/\r?\n/);

    // Check if the original BASIC line number still exists with the same content
    for (const line of rawLines) {
      const match = line.trim().match(/^(\d+)\s*(.*)/);
      if (match && parseInt(match[1], 10) === this.errorLineNumber) {
        const content = match[2];
        if (content === this.errorLineContent) {
          return; // Line still exists with same content, keep error
        }
        // Line number exists but content changed — error no longer applies
        this._clearError();
        return;
      }
    }

    // Line number not found — check if it was renumbered (same content, different number)
    if (this.errorLineContent !== null) {
      for (const line of rawLines) {
        const match = line.trim().match(/^(\d+)\s*(.*)/);
        if (match && match[2] === this.errorLineContent) {
          // Found the same code under a new line number
          this.errorLineNumber = parseInt(match[1], 10);
          return;
        }
      }
    }

    // Line was removed entirely
    this._clearError();
  }

  _wrapStatementsForError(html, stmtInfo, stmtBPs = []) {
    const segments = this._splitAtColons(html);

    const bpStmtSet = new Set();
    for (const bp of stmtBPs) {
      if (bp.statementIndex >= 0) bpStmtSet.add(bp.statementIndex);
    }

    let result = "";
    for (let i = 0; i < segments.length; i++) {
      let cls = "";
      if (i === stmtInfo.statementIndex) cls += " basic-error-statement";
      if (bpStmtSet.has(i)) cls += " basic-statement-bp";
      result += `<span class="basic-statement${cls}">${segments[i]}</span>`;
    }
    return result;
  }

  setStatus(status) {
    if (!this.statusChip || this._currentStatus === status) return;
    this._currentStatus = status;
    this.statusChip.className = "basic-dbg-status-chip";
    this.statusChip.classList.add(`basic-dbg-status-${status}`);
    const labels = { idle: "Idle", running: "Running", paused: "Paused", error: "Error" };
    this.statusChip.textContent = labels[status] || status;
    const statusBar = this.contentElement.querySelector(".basic-dbg-status-bar");
    if (statusBar) statusBar.dataset.state = status;
  }

  /**
   * Get the breakpoint manager for external access
   */
  getBreakpointManager() {
    return this.breakpointManager;
  }

  // ========================================
  // State Persistence
  // ========================================

  getState() {
    const baseState = super.getState();
    return {
      ...baseState,
      content: this.textarea ? this.textarea.value : "",
      sidebarWidth: this.sidebar ? this.sidebar.offsetWidth : 200,
      breakpointsHeight: this.bpSection ? this.bpSection.offsetHeight : 150,
    };
  }

  restoreState(state) {
    super.restoreState(state);
    if (state.content !== undefined && this.textarea) {
      this.textarea.value = state.content;
      this.updateGutter();
      this.updateHighlighting();
      this.updateStats();
    }
    if (state.sidebarWidth && this.sidebar) {
      this.sidebar.style.width = `${state.sidebarWidth}px`;
    }
    if (state.breakpointsHeight && this.bpSection) {
      this.bpSection.style.height = `${state.breakpointsHeight}px`;
    }
  }

  destroy() {
    if (this._cleanupSplitter) this._cleanupSplitter();
    if (this._cleanupSidebarSplitter) this._cleanupSidebarSplitter();
    super.destroy();
  }
}
