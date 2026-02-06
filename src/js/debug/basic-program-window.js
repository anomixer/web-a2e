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
import { BasicBreakpointManager } from "./basic-breakpoint-manager.js";
import { BasicVariableInspector } from "./basic-variable-inspector.js";
import { BasicProgramParser } from "./basic-program-parser.js";

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
    this.isPasting = false;

    // Debugger components
    this.breakpointManager = new BasicBreakpointManager(wasmModule);
    this.variableInspector = new BasicVariableInspector(wasmModule);
    this.programParser = new BasicProgramParser(wasmModule);

    // Debugger state
    this.previousVariables = new Map();
    this.changeTimestamps = new Map();
    this.currentLineNumber = null;
    this.expandedArrays = new Set(); // Track which arrays are expanded

    // Editor line map (text line index -> BASIC line number)
    this.lineMap = [];

    this.breakpointManager.onChange(() => {
      this.updateGutter();
    });
  }

  renderContent() {
    return `
      <div class="basic-unified-container">
        <div class="basic-dbg-toolbar">
          <button class="basic-dbg-btn basic-dbg-run" title="Run Applesoft BASIC program">
            <span class="basic-dbg-icon">▶</span> Run
          </button>
          <button class="basic-dbg-btn basic-dbg-stop" title="Stop (Ctrl+C)">
            <span class="basic-dbg-icon">■</span> Stop
          </button>
          <button class="basic-dbg-btn basic-dbg-continue" title="Continue execution">
            <span class="basic-dbg-icon">▶▶</span> Cont
          </button>
          <button class="basic-dbg-btn basic-dbg-step-line" title="Step to next BASIC line">
            <span class="basic-dbg-icon">↓</span> Step
          </button>
          <div class="basic-dbg-status">
            <span class="basic-dbg-state">STOPPED</span>
          </div>
          <div class="basic-dbg-info">
            <span class="basic-dbg-line">LINE: ---</span>
            <span class="basic-dbg-ptr">PTR: $----</span>
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
            <div class="basic-editor-footer">
              <div class="basic-status">
                <span class="basic-lines">0 lines</span>
                <span class="basic-chars">0 chars</span>
              </div>
              <div class="basic-actions">
                <button class="basic-btn basic-load-btn" title="Load program from emulator memory">Load from Memory</button>
                <button class="basic-btn basic-insert-btn" title="Paste program into emulator">Paste into Emulator</button>
                <button class="basic-btn basic-format-btn" title="Format code (align line numbers, indent loops)">Format</button>
                <button class="basic-btn basic-renumber-btn" title="Renumber lines in increments of 10, updating GOTO/GOSUB references">Renumber</button>
                <button class="basic-btn basic-clear-btn">Clear</button>
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
                <div class="basic-dbg-bp-add">
                  <input type="text" class="basic-dbg-bp-input" placeholder="Line #" maxlength="5">
                  <button class="basic-dbg-bp-add-btn" title="Add breakpoint">+</button>
                </div>
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
    this.formatBtn = this.contentElement.querySelector(".basic-format-btn");
    this.renumberBtn = this.contentElement.querySelector(".basic-renumber-btn");
    this.insertBtn = this.contentElement.querySelector(".basic-insert-btn");
    this.clearBtn = this.contentElement.querySelector(".basic-clear-btn");

    // Debugger elements
    this.varPanel = this.contentElement.querySelector(".basic-dbg-var-panel");
    // Handle array expand/collapse clicks
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
          this.renderVariables();
        }
      }
    });
    this.bpList = this.contentElement.querySelector(".basic-dbg-bp-list");
    this.bpInput = this.contentElement.querySelector(".basic-dbg-bp-input");
    this.stateSpan = this.contentElement.querySelector(".basic-dbg-state");
    this.lineSpan = this.contentElement.querySelector(".basic-dbg-line");
    this.ptrSpan = this.contentElement.querySelector(".basic-dbg-ptr");

    // Track current editing line for auto-format on line change
    this.lastEditLine = -1;

    // Editor event listeners
    this.textarea.addEventListener("input", () => {
      this.updateHighlighting();
      this.updateStats();
      this.updateGutter();
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

    this.insertBtn.addEventListener("click", () => {
      if (this.isPasting) {
        this.cancelPaste();
      } else {
        this.loadIntoMemory();
      }
    });

    this.clearBtn.addEventListener("click", () => {
      this.textarea.value = "";
      this.updateHighlighting();
      this.updateStats();
      this.updateGutter();
    });

    this.loadBtn.addEventListener("click", () => {
      this.loadFromMemory();
    });

    this.formatBtn.addEventListener("click", () => {
      this.autoFormatCode();
    });

    this.renumberBtn.addEventListener("click", () => {
      this.renumberProgram();
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
      .querySelector(".basic-dbg-stop")
      .addEventListener("click", () => this.handleStop());
    this.contentElement
      .querySelector(".basic-dbg-continue")
      .addEventListener("click", () => this.handleContinue());
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

    this.updateHighlighting();
    this.updateStats();
    this.setupGutterClickHandler();
    this.updateGutter();
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
        this.breakpointManager.toggle(lineNumber);
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
        lineNumber !== null && this.breakpointManager.has(lineNumber);
      const isCurrent =
        lineNumber !== null && this.currentLineNumber === lineNumber;

      const bpClass = hasBp ? "has-bp" : "";
      const currentClass = isCurrent ? "is-current" : "";
      const clickable = lineNumber !== null ? "clickable" : "";

      // Gutter shows breakpoint markers with subtle line number tooltip
      html += `
        <div class="basic-gutter-line ${bpClass} ${currentClass} ${clickable}" data-index="${i}">
          <span class="basic-gutter-bp" title="${lineNumber !== null ? `Line ${lineNumber} - Click to toggle breakpoint` : ""}">${hasBp ? "●" : ""}</span>
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

      // Wrap each line in a div with appropriate classes
      const highlighted = `<div class="${lineClass}">${html || "&nbsp;"}</div>`;
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
      this.updateHighlighting();
      this.updateStats();
      this.updateGutter();
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
    this.updateHighlighting();
    this.updateStats();
    this.updateGutter();

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
    const oldBreakpoints = this.breakpointManager.getLineNumbers();
    const breakpointStates = new Map();

    // Save enabled state for each breakpoint
    for (const oldLine of oldBreakpoints) {
      const entry = this.breakpointManager.get(oldLine);
      if (entry) {
        breakpointStates.set(oldLine, entry.enabled);
      }
    }

    // Clear all breakpoints
    for (const oldLine of oldBreakpoints) {
      this.breakpointManager.remove(oldLine);
    }

    // Add breakpoints at new line numbers
    for (const [oldLine, enabled] of breakpointStates) {
      const newLine = lineMap.get(oldLine);
      if (newLine !== undefined) {
        this.breakpointManager.add(newLine);
        this.breakpointManager.setEnabled(newLine, enabled);
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
  loadFromMemory() {
    const lines = this.programParser.getLines();
    if (lines.length === 0) {
      console.log("No BASIC program in memory");
      return;
    }

    // Build textarea content from parsed program lines
    const textLines = lines.map((line) => `${line.lineNumber} ${line.text}`);
    const rawContent = textLines.join("\n");

    // Auto-format the loaded content
    this.textarea.value = formatBasicSource(rawContent);

    this.updateHighlighting();
    this.updateStats();
    this.updateGutter();

    console.log(`Loaded ${lines.length} lines from memory`);
  }

  loadIntoMemory() {
    // Prevent multiple simultaneous pastes
    if (this.isPasting) {
      return;
    }

    if (this.isRunningCallback && !this.isRunningCallback()) {
      this.showButtonFeedback("Emulator is off", "basic-btn-error");
      return;
    }

    const text = this.textarea.value;
    if (!text.trim()) return;

    const lines = this.parseProgram(text);
    if (lines.length === 0) {
      console.warn("No valid BASIC lines found");
      return;
    }

    // Set flag immediately to prevent double-clicks
    this.isPasting = true;
    this.insertBtn.textContent = "Cancel";
    this.insertBtn.classList.add("basic-btn-cancel");

    let inputText = "NEW\r";
    for (const line of lines) {
      if (line.content) {
        inputText += `${line.lineNumber} ${line.content}\r`;
      }
    }

    const lineCount = lines.length;

    this.inputHandler.queueTextInput(inputText, {
      speedMultiplier: 8,
      onComplete: (cancelled) => {
        this.isPasting = false;
        this.insertBtn.classList.remove("basic-btn-cancel");
        if (cancelled) {
          this.showButtonFeedback("Cancelled", "basic-btn-error");
        } else {
          this.showButtonFeedback(`Loaded ${lineCount} lines!`, "basic-btn-success");
        }
      },
    });

    console.log(`BASIC program queued for input: ${lines.length} lines`);
  }

  cancelPaste() {
    this.inputHandler.cancelPaste();
  }

  showButtonFeedback(message, cssClass) {
    const originalText = this.insertBtn.textContent;
    this.insertBtn.textContent = message;
    this.insertBtn.classList.add(cssClass);

    setTimeout(() => {
      this.insertBtn.textContent = originalText;
      this.insertBtn.classList.remove(cssClass);
    }, 1500);
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
    // Reset all tracking state for a fresh run
    this._lastBasicBreakpointHit = false;
    this._lastProgramRunning = false;
    this.currentLineNumber = null;

    // First unpause - this sets skip logic if we were at a breakpoint
    // so the current line's breakpoint won't fire immediately
    this.wasmModule._setPaused(false);

    // Clear step mode (but keep skip logic so current breakpoint is skipped)
    // Skip logic will clear naturally when CURLIN changes after RUN executes
    if (this.wasmModule._clearBasicBreakpointHit) {
      this.wasmModule._clearBasicBreakpointHit();
    }

    // Update UI to clear any line highlighting
    this.updateGutter();
    this.updateHighlighting();

    // Type "RUN" followed by Return
    this.inputHandler.queueTextInput("RUN\r");
  }

  /**
   * Stop - Send Ctrl+C to stop BASIC program and let emulator continue running
   */
  handleStop() {
    if (!this.isRunningCallback || !this.isRunningCallback()) {
      return;
    }
    // Ctrl+C is ASCII 3
    this.wasmModule._keyDown(3);
    setTimeout(() => this.wasmModule._keyUp(3), 50);

    // Unpause and let emulator run - BASIC will see Ctrl+C and stop
    this.wasmModule._setPaused(false);
  }

  /**
   * Continue - Resume execution from pause
   */
  handleContinue() {
    // Reset tracking flag so we detect the next breakpoint hit
    this._lastBasicBreakpointHit = false;

    // Clear current line highlight
    this.currentLineNumber = null;
    this.updateGutter();
    this.updateHighlighting();

    // Just unpause - the C++ setPaused(false) automatically handles:
    // - Setting skipBasicBreakpointLine_ if we're at a BASIC breakpoint
    // - Clearing the breakpoint hit flags
    // DON'T call clearBasicBreakpointHit() first - it would clear the flag
    // that setPaused() needs to detect we're at a breakpoint!
    this.wasmModule._setPaused(false);
  }

  /**
   * Step Line - Execute current BASIC line and stop at next line
   * Uses C++ stepBasicLine() for reliable stepping
   */
  handleStepLine() {
    // Check if BASIC is actually running (CURLIN != $FFFF)
    const state = this.programParser.getExecutionState();
    if (state.currentLine === 0xffff) {
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

    // Use C++ stepping - it handles everything properly
    if (this.wasmModule._stepBasicLine) {
      this.wasmModule._stepBasicLine();
    } else {
      console.error("_stepBasicLine not available - rebuild WASM");
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

    this.breakpointManager.add(lineNumber);
    this.bpInput.value = "";
    this.updateGutter();
    this.renderBreakpointList();
  }

  renderVariables() {
    const now = Date.now();
    const fadeTime = 1000;

    const variables = this.variableInspector.getSimpleVariables();
    const arrays = this.variableInspector.getArrayVariables();

    if (variables.length === 0 && arrays.length === 0) {
      this.varPanel.innerHTML =
        '<div class="basic-dbg-empty">No variables</div>';
      return;
    }

    let html = "";

    // Simple variables section
    if (variables.length > 0) {
      html += '<div class="basic-dbg-var-list">';
      for (const v of variables) {
        const key = v.name;
        const prevValue = this.previousVariables.get(key);
        const displayValue = this.variableInspector.formatValue(v);

        if (prevValue !== undefined && prevValue !== displayValue) {
          this.changeTimestamps.set(key, now);
        }
        this.previousVariables.set(key, displayValue);

        let changeClass = "";
        if (this.changeTimestamps.has(key)) {
          const elapsed = now - this.changeTimestamps.get(key);
          if (elapsed < fadeTime) {
            changeClass = "changed";
          } else {
            this.changeTimestamps.delete(key);
          }
        }

        const typeClass = `var-type-${v.type}`;
        html += `
          <div class="basic-dbg-var-row ${changeClass} ${typeClass}">
            <span class="basic-dbg-var-name">${v.name}</span>
            <span class="basic-dbg-var-value">${escapeHtml(displayValue)}</span>
          </div>
        `;
      }
      html += "</div>";
    }

    // Arrays section
    if (arrays.length > 0) {
      html += '<div class="basic-dbg-arr-list">';
      for (const arr of arrays) {
        const dimsStr = arr.dimensions.map((d) => d - 1).join(",");
        const isExpanded = this.expandedArrays.has(arr.name);

        html += `
          <div class="basic-dbg-arr-item ${isExpanded ? "expanded" : ""}">
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

  /**
   * Render array contents as a grid or table
   */
  renderArrayContents(arr) {
    const dims = arr.dimensions;
    const values = arr.values;
    const type = arr.type;

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
          <span class="basic-dbg-arr-val">${formatVal(values[i])}</span>
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
          html += `<td>${val}</td>`;
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
        <span class="basic-dbg-arr-val">${formatVal(values[i])}</span>
      </div>`;
    }
    html += "</div>";
    return html;
  }

  renderBreakpointList() {
    const lineNumbers = this.breakpointManager.getLineNumbers();

    if (lineNumbers.length === 0) {
      this.bpList.innerHTML =
        '<div class="basic-dbg-empty">No breakpoints</div>';
      return;
    }

    let html = "";
    for (const lineNum of lineNumbers) {
      const entry = this.breakpointManager.get(lineNum);
      const enabledClass = entry.enabled ? "" : "disabled";

      html += `
        <div class="basic-dbg-bp-item ${enabledClass}" data-line="${lineNum}">
          <input type="checkbox" class="basic-dbg-bp-enabled"
                 ${entry.enabled ? "checked" : ""} data-line="${lineNum}">
          <span class="basic-dbg-bp-line">Line ${lineNum}</span>
          <button class="basic-dbg-bp-remove" data-line="${lineNum}" title="Remove">×</button>
        </div>
      `;
    }

    this.bpList.innerHTML = html;

    this.bpList.querySelectorAll(".basic-dbg-bp-enabled").forEach((cb) => {
      cb.addEventListener("change", () => {
        const lineNum = parseInt(cb.dataset.line, 10);
        this.breakpointManager.setEnabled(lineNum, cb.checked);
        this.updateGutter();
      });
    });

    this.bpList.querySelectorAll(".basic-dbg-bp-remove").forEach((btn) => {
      btn.addEventListener("click", () => {
        const lineNum = parseInt(btn.dataset.line, 10);
        this.breakpointManager.remove(lineNum);
        this.updateGutter();
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

    // Update variables twice per second (500ms)
    if (state.running || isPaused) {
      if (!this._lastVarUpdateTime || now - this._lastVarUpdateTime >= 500) {
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
    if (basicBreakpointHit) {
      const breakLine = wasmModule._getBasicBreakLine();
      this.currentLineNumber = breakLine;
      this.updateGutter();
      this.updateHighlighting();
    }
    this._lastBasicBreakpointHit = basicBreakpointHit;

    // Reset breakpoint tracking when BASIC stops running (program ended)
    // so next RUN will properly detect the first breakpoint hit
    if (!state.running && this._lastProgramRunning) {
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
        this.updateGutter();
        this.updateHighlighting();
      }
    }
    this._lastProgramRunning = state.running;

    // Update status display
    if (isPaused) {
      if (state.running) {
        this.stateSpan.textContent = "PAUSED";
        this.stateSpan.className = "basic-dbg-state paused";
      } else {
        this.stateSpan.textContent = "READY";
        this.stateSpan.className = "basic-dbg-state stopped";
      }
    } else if (state.running) {
      this.stateSpan.textContent = "RUNNING";
      this.stateSpan.className = "basic-dbg-state running";
    } else {
      this.stateSpan.textContent = "READY";
      this.stateSpan.className = "basic-dbg-state stopped";
    }

    // Update line/ptr display (only show when paused, otherwise it flickers too fast)
    if (
      isPaused &&
      state.currentLine !== null &&
      state.currentLine !== 0xffff
    ) {
      this.lineSpan.textContent = `LINE: ${state.currentLine}`;
      this.ptrSpan.textContent = `PTR: $${this.formatHex(state.txtptr, 4)}`;
    } else {
      this.lineSpan.textContent = "LINE: ---";
      this.ptrSpan.textContent = "PTR: $----";
    }

    // Only update gutter/highlighting for current line when paused
    // This prevents constant rebuilding that interferes with click events
    if (isPaused) {
      if (state.currentLine !== this.currentLineNumber) {
        this.currentLineNumber = state.currentLine;
        this.updateGutter();
        this.updateHighlighting();
      }
    } else if (this.currentLineNumber !== null) {
      // Clear line highlighting when not paused
      this.currentLineNumber = null;
      this.updateHighlighting();
    }
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
      this.updateHighlighting();
      this.updateStats();
      this.updateGutter();
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
