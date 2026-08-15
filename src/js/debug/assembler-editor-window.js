/*
 * assembler-editor-window.js - 65C02 assembler editor window
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { BaseWindow } from "../windows/base-window.js";
import { highlightMerlinLineInline } from "../utils/merlin-highlighting.js";
import {
  MerlinEditorSupport,
  COL_OPCODE,
  COL_OPERAND,
  COL_COMMENT,
  OPCODE_WIDTH,
} from "../utils/merlin-editor-support.js";
import {
  ROM_ROUTINES,
  ROM_CATEGORIES,
  searchRoutines,
  getRoutinesByCategory,
} from "../data/apple2-rom-routines.js";
import { showConfirm, showPrompt } from "../ui/confirm.js";
import { escapeHtml } from "../utils/string-utils.js";

export class AssemblerEditorWindow extends BaseWindow {
  constructor(wasmModule, breakpointManager, isRunningCallback, cpuDebuggerWindow) {
    super({
      id: "assembler-editor",
      title: "Assembler",
      defaultWidth: 640,
      defaultHeight: 600,
      minWidth: 480,
      minHeight: 400,
    });
    this.wasmModule = wasmModule;
    this.bpManager = breakpointManager;
    this.isRunningCallback = isRunningCallback || (() => false);
    this.cpuDebugger = cpuDebuggerWindow;
    this.lastAssembledSize = 0;
    this.lastOrigin = 0;
    this.errors = new Map(); // line number -> error message (from assembler)
    this.syntaxErrors = new Map(); // line number -> error message (from live validation)
    this.currentLine = -1; // Track current line for auto-assemble
    this.lineBytes = new Map(); // line number -> hex bytes string
    this.linePCs = new Map(); // line number -> PC address
    this.symbols = new Map(); // symbol name -> value (from last assembly)
    this.currentPC = undefined; // current PC for expression evaluation
    this.lineBreakpoints = new Map(); // line number -> breakpoint address

    // ---- Viewport rendering state ------------------------------------
    // Only the lines on screen are put in the DOM. A large source otherwise
    // costs a full-document re-highlight on every keystroke and a repaint of
    // tens of thousands of lines on every scroll event, which is main-thread
    // work the emulator's render loop and audio refill are competing with.
    this._lineMetrics = null;     // { lineHeight, paddingTop } — cached
    this._cursorLine = 0;         // Cached: scrolling never moves the cursor
    this._viewportFrame = 0;      // Pending rAF id, 0 when idle
    this._renderedRange = null;   // { start, end } currently in the DOM
    this._sourceLines = null;     // Cached split of the textarea value

    // Set by main.js: called after a DSK directive writes an object file, so
    // the disk manager can persist the changed image and the file explorer can
    // show the new file. (driveNum, filename) => Promise
    this.onObjectFileWritten = null;
  }

  renderContent() {
    return `
      <div class="asm-editor-content">
        <div class="asm-toolbar">
          <div class="asm-toolbar-group asm-toolbar-actions">
            <button class="asm-btn asm-assemble-btn" title="Assemble (⌘/Ctrl+Enter)">
              <span class="asm-btn-icon">▶</span> Assemble
            </button>
            <button class="asm-btn asm-load-btn" disabled title="Write assembled code into memory">
              Write
            </button>
            <button class="asm-btn asm-debug-btn" disabled title="Open CPU debugger at ORG address">
              Debug
            </button>
            <button class="asm-btn asm-example-btn" title="Load example program">
              <span class="asm-btn-icon">Example</span>
            </button>
            <button class="asm-btn asm-rom-btn" title="ROM Routines Reference (F2)">
              ROM Routines
            </button>
          </div>
          <div class="asm-toolbar-separator"></div>
          <div class="asm-toolbar-group asm-toolbar-file">
            <button class="asm-btn asm-new-btn" title="New (⌘/Ctrl+N)">New</button>
            <button class="asm-btn asm-open-btn" title="Open File (⌘/Ctrl+O)">Open</button>
            <button class="asm-btn asm-save-btn" title="Save File (⌘/Ctrl+S)">Save</button>
            <button class="asm-btn asm-saveas-btn" title="Save As… (⌘/Ctrl+Shift+S)">Save As…</button>
          </div>
        </div>
        <div class="asm-status-bar">
          <span class="asm-status"></span>
          <div style="display:flex;align-items:center;gap:8px;margin-left:auto;">
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
                <div class="asm-gutter-content">
                  <div class="asm-gutter-lines"></div>
                </div>
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
                    <div class="asm-column-guide" data-col="${COL_OPCODE}" title="Opcode column"></div>
                    <div class="asm-column-guide" data-col="${COL_OPERAND}" title="Operand column"></div>
                    <div class="asm-column-guide" data-col="${COL_COMMENT}" title="Comment column"></div>
                  </div>
                  <div class="asm-line-highlight"></div>
                  <pre class="asm-highlight" aria-hidden="true"><code class="asm-highlight-lines"></code></pre>
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
    this.lineHighlight = this.contentElement.querySelector(
      ".asm-line-highlight",
    );
    this.errorsOverlay = this.contentElement.querySelector(
      ".asm-errors-overlay",
    );
    this.gutterContent = this.contentElement.querySelector(
      ".asm-gutter-content",
    );
    // Inner layers holding only the lines currently on screen; both are moved
    // with a transform rather than scrolled. See renderVisibleLines().
    this.highlightLines = this.contentElement.querySelector(
      ".asm-highlight-lines",
    );
    this.gutterLines = this.contentElement.querySelector(".asm-gutter-lines");
    this.assembleBtn = this.contentElement.querySelector(".asm-assemble-btn");
    this.loadBtn = this.contentElement.querySelector(".asm-load-btn");
    this.debugBtn = this.contentElement.querySelector(".asm-debug-btn");
    this.newBtn = this.contentElement.querySelector(".asm-new-btn");
    this.openBtn = this.contentElement.querySelector(".asm-open-btn");
    this.saveBtn = this.contentElement.querySelector(".asm-save-btn");
    this.saveAsBtn = this.contentElement.querySelector(".asm-saveas-btn");
    this.statusSpan = this.contentElement.querySelector(".asm-status");
    this.currentFileName = null;
    this._fileHandle = null;
    this.columnIndicator = this.contentElement.querySelector(
      ".asm-column-indicator",
    );
    this.cursorPosition = this.contentElement.querySelector(
      ".asm-cursor-position",
    );
    this.symbolsContent = this.contentElement.querySelector(
      ".asm-symbols-content",
    );
    this.symbolsCount = this.contentElement.querySelector(
      ".asm-symbols-panel .asm-panel-count",
    );
    this.hexContent = this.contentElement.querySelector(".asm-hex-content");
    this.hexCount = this.contentElement.querySelector(
      ".asm-hex-panel .asm-panel-count",
    );
    this.columnGuides =
      this.contentElement.querySelectorAll(".asm-column-guide");
    this.editorHeader = this.contentElement.querySelector(".asm-editor-header");

    // ROM panel elements
    this.romBtn = this.contentElement.querySelector(".asm-rom-btn");
    this.romPanel = this.contentElement.querySelector(".asm-rom-panel");
    this.romSearch = this.contentElement.querySelector(".asm-rom-search");
    this.romCategory = this.contentElement.querySelector(".asm-rom-category");
    this.romList = this.contentElement.querySelector(".asm-rom-list");
    this.romDetail = this.contentElement.querySelector(".asm-rom-detail");
    this.romDetailName = this.contentElement.querySelector(
      ".asm-rom-detail-name",
    );
    this.romDetailContent = this.contentElement.querySelector(
      ".asm-rom-detail-content",
    );
    this.selectedRoutine = null;

    // Initialize ROM panel
    this.initRomPanel();

    const editorContainer = this.contentElement.querySelector(
      ".asm-editor-scroll-area",
    );

    // Position column guides and header labels based on character width
    this.positionColumnGuides();

    // Set placeholder with proper Merlin formatting
    this.setPlaceholder();

    // Sync highlighting on input
    this.textarea.addEventListener("input", () => {
      this.invalidateSourceLines();
      this.updateHighlighting();
      this.updateCurrentLineHighlight();
      this.updateGutter();
      this.updateCursorPosition();
    });

    // Scrolling only moves the view: the text, the cursor line and the error
    // list are all unchanged, so the handler does no work of its own beyond
    // asking for one viewport update per frame. Doing it here — reading
    // scrollTop and writing overlay positions in the same event — forced a
    // synchronous layout of the whole editor on every scroll event.
    this.textarea.addEventListener("scroll", () => this.scheduleViewportUpdate(), {
      passive: true,
    });

    // Track cursor for line highlight and auto-format on line change
    this.textarea.addEventListener("click", () => {
      this.updateCurrentLineHighlight();
      this.checkLineChangeAndFormat();
      this.updateCursorPosition();
    });
    this.textarea.addEventListener("keyup", (e) => {
      // Check for navigation keys that might change lines
      if (
        [
          "ArrowUp",
          "ArrowDown",
          "Enter",
          "PageUp",
          "PageDown",
          "Home",
          "End",
        ].includes(e.key)
      ) {
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
        if (
          [
            "ArrowUp",
            "ArrowDown",
            "Enter",
            "PageUp",
            "PageDown",
            "Home",
            "End",
          ].includes(e.key)
        ) {
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

    // Debug button
    this.debugBtn.addEventListener("click", () => {
      if (this.cpuDebugger) {
        this.cpuDebugger.show();
        this.cpuDebugger.disasmViewAddress = this.lastOrigin;
        this.cpuDebugger.updateDisassembly();
      }
    });

    // Clear button

    // Example button
    this.contentElement
      .querySelector(".asm-example-btn")
      .addEventListener("click", () => this.loadExample());

    // File management buttons
    this.newBtn.addEventListener("click", () => this.newFile());
    this.openBtn.addEventListener("click", () => this.openFile());
    this.saveBtn.addEventListener("click", () => this.saveFile());
    this.saveAsBtn.addEventListener("click", () => this.saveFile({ saveAs: true }));

    // Editor support (Tab nav, smart enter, autocomplete, etc.)
    this.editorSupport = new MerlinEditorSupport(
      this.textarea,
      editorContainer,
      {
        onColumnChange: (name, col) => this.updateColumnIndicator(name, col),
        onAssemble: () => this.doAssemble(),
      },
    );

    // Splitters
    this.initSplitters();

    // Reposition column guides on window resize, and re-render the viewport:
    // a resized window shows a different number of lines, and a hidden window
    // has no size at all — so this also fires the first render on open.
    const resizeObserver = new ResizeObserver(() => {
      this.positionColumnGuides();
      this.invalidateLineMetrics();
      this._renderedRange = null;
      this.scheduleViewportUpdate();
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

    // Keyboard shortcuts
    this.textarea.addEventListener("keydown", (e) => {
      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const modKey = isMac ? e.metaKey : e.ctrlKey;

      if (e.key === "F9") {
        e.preventDefault();
        const lineNumber = this.getCurrentLineNumber();
        this.toggleBreakpoint(lineNumber);
      } else if (e.key === "F2") {
        e.preventDefault();
        this.toggleRomPanel();
      } else if (modKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        this.newFile();
      } else if (modKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        this.openFile();
      } else if (modKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        this.saveFile({ saveAs: e.shiftKey });
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

STROUT      EQU  $DB3A         ;Outputs AY-pointed null-terminated string

            ORG  $0800         ;Standard BASIC program area

START       LDY  #>HELLO
            LDA  #<HELLO
            JMP  STROUT

HELLO       ASC  "HELLO WORLD!!!!!!",00`;
    this.textarea.placeholder = example;
  }

  positionColumnGuides() {
    // Calculate character width based on font metrics
    const style = getComputedStyle(this.textarea);
    const fontSize = parseFloat(style.fontSize) || 12;
    const charWidth = fontSize * 0.6; // Approximate monospace character width
    const paddingLeft = parseFloat(style.paddingLeft) || 8;

    // Position column guide lines
    this.columnGuides.forEach((guide) => {
      const col = parseInt(guide.dataset.col, 10);
      guide.style.left = `${paddingLeft + col * charWidth}px`;
    });

    // Position header labels at Merlin column positions
    if (this.editorHeader) {
      const labelEl = this.editorHeader.querySelector(
        ".asm-editor-header-label",
      );
      const opcodeEl = this.editorHeader.querySelector(
        ".asm-editor-header-opcode",
      );
      const operandEl = this.editorHeader.querySelector(
        ".asm-editor-header-operand",
      );
      const commentEl = this.editorHeader.querySelector(
        ".asm-editor-header-comment",
      );

      if (labelEl) labelEl.style.left = `${paddingLeft}px`;
      if (opcodeEl)
        opcodeEl.style.left = `${paddingLeft + COL_OPCODE * charWidth}px`;
      if (operandEl)
        operandEl.style.left = `${paddingLeft + COL_OPERAND * charWidth}px`;
      if (commentEl)
        commentEl.style.left = `${paddingLeft + COL_COMMENT * charWidth}px`;
    }
  }

  initSplitters() {
    const splitters = this.contentElement.querySelectorAll(".asm-splitter");
    for (const splitter of splitters) {
      splitter.addEventListener("mousedown", (e) =>
        this.onSplitterMouseDown(e, splitter),
      );
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
    const prevSize = isHorizontal
      ? prevEl.getBoundingClientRect().height
      : prevEl.getBoundingClientRect().width;

    const totalSize = isHorizontal
      ? containerRect.height - splitter.offsetHeight
      : containerRect.width - splitter.offsetWidth;

    const minSize = 60;

    const onMouseMove = (e) => {
      const currentPos = isHorizontal ? e.clientY : e.clientX;
      const delta = currentPos - startPos;
      let newPrevSize = prevSize + delta;

      // Clamp
      newPrevSize = Math.max(
        minSize,
        Math.min(totalSize - minSize, newPrevSize),
      );

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
      label: "Label",
      opcode: "Opcode",
      operand: "Operand",
      comment: "Comment",
    };
    const display = displayNames[name] || name;
    this.columnIndicator.textContent = display;
    this.columnIndicator.className = `asm-column-indicator asm-col-${name}`;
  }

  updateCursorPosition() {
    if (!this.cursorPosition || !this.textarea) return;
    const { line, column } = this.cursorLineAndColumn();
    this.cursorPosition.textContent = `Ln ${line + 1}, Col ${column}`;
  }

  /**
   * Where the cursor is, without copying the document to find out.
   *
   * The obvious `value.substring(0, selectionStart).split("\n")` allocates a
   * copy of everything above the cursor plus an array of every line in it —
   * half a megabyte and twelve thousand strings in a large source, which is
   * far too much to do on a scroll or keystroke.
   *
   * @returns {{line: number, column: number}} Zero-based line, zero-based column
   */
  cursorLineAndColumn() {
    const value = this.textarea.value;
    const caret = this.textarea.selectionStart;

    let line = 0;
    let lineStart = 0;
    for (let i = value.indexOf("\n"); i !== -1 && i < caret; i = value.indexOf("\n", i + 1)) {
      line++;
      lineStart = i + 1;
    }

    this._cursorLine = line;
    return { line, column: caret - lineStart };
  }

  /**
   * Scroll the textarea to keep the cursor line visible
   */
  scrollCursorIntoView() {
    if (!this.textarea) return;

    const lineIndex = this.cursorLineAndColumn().line;
    const { lineHeight, paddingTop } = this.getLineMetrics();
    const paddingBottom = paddingTop;

    const cursorTop = paddingTop + lineIndex * lineHeight;
    const cursorBottom = cursorTop + lineHeight;

    const viewportTop = this.textarea.scrollTop;
    const viewportBottom =
      viewportTop + this.textarea.clientHeight - paddingBottom;

    // Scroll up if cursor is above viewport
    if (cursorTop < viewportTop + paddingTop) {
      this.textarea.scrollTop = cursorTop - paddingTop;
    }
    // Scroll down if cursor is below viewport
    else if (cursorBottom > viewportBottom) {
      this.textarea.scrollTop =
        cursorBottom - this.textarea.clientHeight + paddingBottom + paddingTop;
    }
  }

  updateCurrentLineHighlight() {
    if (!this.lineHighlight || !this.textarea) return;
    // The caret moved, so the cached line is stale; the viewport update below
    // paints the bar in its new place.
    this.cursorLineAndColumn();
    this.scheduleViewportUpdate();
  }

  getCurrentLineNumber() {
    if (!this.textarea) return 0;
    return this.cursorLineAndColumn().line + 1;
  }

  // ===================================================================
  // Viewport rendering
  //
  // The highlight layer and the gutter show only the lines on screen. The
  // textarea keeps the real scrollbar and the real geometry — it is the one
  // element that must hold the whole document — and the two overlays are moved
  // to match it with a transform, which the compositor can do without a
  // layout or a repaint of the text.
  // ===================================================================

  /**
   * Line height and top padding of the editor, cached.
   *
   * getComputedStyle forces a style recalculation, so it must not be called
   * per scroll event. The values only change when the font or the layout
   * does; invalidateLineMetrics() drops them then.
   */
  getLineMetrics() {
    if (this._lineMetrics) return this._lineMetrics;
    if (!this.textarea) return { lineHeight: 16.8, paddingTop: 8 };

    const style = getComputedStyle(this.textarea);
    const paddingTop = parseFloat(style.paddingTop) || 0;
    const paddingBottom = parseFloat(style.paddingBottom) || paddingTop;
    let lineHeight =
      parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.4 || 16.8;

    // The computed line-height is the *specified* value rounded for display —
    // 16.8px where the browser actually lays lines out 16.797px apart. That
    // difference is invisible over a screenful and half a line over two
    // thousand, which is exactly the multiplication a viewport offset does, so
    // take the real pitch from the textarea's own scroll height instead.
    const lineCount = this.getSourceLines().length;
    if (lineCount > 1) {
      const measured =
        (this.textarea.scrollHeight - paddingTop - paddingBottom) / lineCount;
      // scrollHeight falls back to the visible height when the text does not
      // fill the box, which would give a nonsense pitch
      if (measured > 1 && Math.abs(measured - lineHeight) < lineHeight * 0.2) {
        lineHeight = measured;
      }
    }

    this._lineMetrics = { lineHeight, paddingTop };
    return this._lineMetrics;
  }

  invalidateLineMetrics() {
    this._lineMetrics = null;
  }

  /** The source split into lines, cached until the text changes. */
  getSourceLines() {
    if (!this._sourceLines) {
      this._sourceLines = this.textarea ? this.textarea.value.split("\n") : [];
    }
    return this._sourceLines;
  }

  invalidateSourceLines() {
    this._sourceLines = null;
    // The line pitch is measured against the document's own height, so it has
    // to be taken again whenever the number of lines changes.
    this.invalidateLineMetrics();
  }

  /**
   * Ask for a viewport update on the next frame.
   *
   * Wheel and trackpad scrolling can deliver several scroll events between two
   * frames; coalescing them means the work happens once per frame at most, and
   * happens in a rAF callback where a read of scrollTop costs nothing because
   * layout is already clean.
   */
  scheduleViewportUpdate() {
    if (this._viewportFrame) return;
    this._viewportFrame = requestAnimationFrame(() => {
      this._viewportFrame = 0;
      this.updateViewport();
    });
  }

  /**
   * Re-render the visible slice and move every overlay to match the textarea.
   */
  updateViewport() {
    if (!this.textarea || !this.highlightLines) return;

    // Read everything first, then write: interleaving the two is what makes
    // the browser lay out the editor again mid-handler.
    const scrollTop = this.textarea.scrollTop;
    const scrollLeft = this.textarea.scrollLeft;
    const viewHeight = this.textarea.clientHeight;
    const { lineHeight, paddingTop } = this.getLineMetrics();

    const lines = this.getSourceLines();
    const totalLines = lines.length;

    // Render a margin either side of the viewport, and snap the slice to
    // block boundaries. Without the snapping the range changes every frame a
    // scroll moves at all, so every frame rebuilds the DOM; with it, most
    // frames find the slice already rendered and only move a transform.
    const OVERSCAN = 16;
    const BLOCK = 64;
    const firstVisible = Math.floor((scrollTop - paddingTop) / lineHeight);
    const visibleCount = Math.ceil(viewHeight / lineHeight) + 1;
    const start = Math.max(0, Math.floor((firstVisible - OVERSCAN) / BLOCK) * BLOCK);
    const end = Math.min(
      totalLines,
      Math.ceil((firstVisible + visibleCount + OVERSCAN) / BLOCK) * BLOCK,
    );

    const rendered = this._renderedRange;
    if (!rendered || rendered.start !== start || rendered.end !== end) {
      this.renderVisibleLines(start, end, lines);
      this._renderedRange = { start, end };
    }

    // Both layers hold only lines [start, end), so they are offset by where
    // that slice begins as well as by how far the textarea has scrolled.
    const offsetY = start * lineHeight - scrollTop;
    this.highlightLines.style.transform = `translate(${-scrollLeft}px, ${offsetY}px)`;
    this.gutterLines.style.transform = `translateY(${offsetY}px)`;

    // The error overlay is positioned in document space, so it only needs the
    // scroll offset.
    if (this.errorsOverlay) {
      this.errorsOverlay.style.transform = `translateY(${-scrollTop}px)`;
    }

    if (this.lineHighlight) {
      const top = paddingTop + this._cursorLine * lineHeight - scrollTop;
      this.lineHighlight.style.transform = `translateY(${top}px)`;
      this.lineHighlight.style.height = `${lineHeight}px`;
    }
  }

  /**
   * Put lines [start, end) into the highlight layer and the gutter.
   */
  renderVisibleLines(start, end, lines) {
    const highlighted = [];
    for (let i = start; i < end; i++) {
      highlighted.push(highlightMerlinLineInline(lines[i]));
    }
    this.highlightLines.innerHTML = highlighted.join("\n") + "\n";

    if (this.gutterLines) {
      this.gutterLines.innerHTML = this.buildGutterLines(start, end, lines);
    }
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

    const lines = this.textarea.value.split("\n");
    if (lineNumber < 1 || lineNumber > lines.length) return;

    const lineIndex = lineNumber - 1;
    const line = lines[lineIndex];

    // Skip empty lines or comment-only lines
    if (
      !line.trim() ||
      line.trim().startsWith(";") ||
      line.trim().startsWith("*")
    ) {
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
      this.textarea.value = lines.join("\n");
      this.textarea.selectionStart = this.textarea.selectionEnd = cursorPos;
      this.updateHighlighting();
    }
  }

  formatAllLines() {
    if (!this.textarea) return;

    const lines = this.textarea.value.split("\n");
    let changed = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Skip empty lines or comment-only lines
      if (
        !line.trim() ||
        line.trim().startsWith(";") ||
        line.trim().startsWith("*")
      ) {
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
      this.textarea.value = lines.join("\n");
      this.textarea.selectionStart = this.textarea.selectionEnd = cursorPos;
      this.updateHighlighting();
    }
  }

  parseLine(line) {
    // Merlin column layout: Label, Opcode, Operand, Comment (see COL_* constants)
    let label = "";
    let opcode = "";
    let operand = "";
    let comment = "";

    // Check for comment at start of line (full-line comment)
    if (line.trim().startsWith(";") || line.trim().startsWith("*")) {
      return null;
    }

    // Find comment (starts with ;)
    let commentIdx = -1;
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' || ch === "'") inQuote = !inQuote;
      if (ch === ";" && !inQuote) {
        commentIdx = i;
        break;
      }
    }

    let mainPart = commentIdx >= 0 ? line.substring(0, commentIdx) : line;
    comment = commentIdx >= 0 ? line.substring(commentIdx) : "";

    // Check if line starts with whitespace (no label)
    const startsWithSpace =
      mainPart.length > 0 && (mainPart[0] === " " || mainPart[0] === "\t");

    // Split main part by whitespace
    const tokens = mainPart.trim().split(/\s+/);

    if (tokens.length === 0 || (tokens.length === 1 && tokens[0] === "")) {
      return null;
    }

    if (startsWithSpace) {
      // No label - first token is opcode
      opcode = tokens[0] || "";
      operand = tokens.slice(1).join(" ");
    } else {
      // First token is label
      label = tokens[0] || "";
      opcode = tokens[1] || "";
      operand = tokens.slice(2).join(" ");
    }

    return { label, opcode, operand, comment };
  }

  buildFormattedLine(parsed) {
    const { label, opcode, operand, comment } = parsed;

    let result = "";

    // Label column
    result = label.padEnd(COL_OPCODE, " ");

    // Opcode column
    if (opcode) {
      result =
        result.substring(0, COL_OPCODE) +
        opcode.toUpperCase().padEnd(OPCODE_WIDTH, " ");
    }

    // Operand column
    if (operand) {
      result = result.substring(0, COL_OPERAND) + operand;
    }

    // Comment column
    if (comment) {
      const currentLen = result.trimEnd().length;
      if (currentLen < COL_COMMENT) {
        result = result.trimEnd().padEnd(COL_COMMENT, " ") + comment;
      } else {
        result = result.trimEnd() + " " + comment;
      }
    }

    return result.trimEnd();
  }

  // 65C02 instruction info: { cycles, bytes } by mnemonic
  // Cycles shown are base cycles (some modes add +1 for page crossing)
  getInstructionInfo() {
    return {
      // Branch / Flow
      JMP: { cycles: 3, bytes: 3 },
      JSR: { cycles: 6, bytes: 3 },
      BCC: { cycles: 2, bytes: 2 },
      BCS: { cycles: 2, bytes: 2 },
      BEQ: { cycles: 2, bytes: 2 },
      BMI: { cycles: 2, bytes: 2 },
      BNE: { cycles: 2, bytes: 2 },
      BPL: { cycles: 2, bytes: 2 },
      BRA: { cycles: 3, bytes: 2 },
      BVC: { cycles: 2, bytes: 2 },
      BVS: { cycles: 2, bytes: 2 },
      RTS: { cycles: 6, bytes: 1 },
      RTI: { cycles: 6, bytes: 1 },
      BRK: { cycles: 7, bytes: 1 },
      // Load / Store
      LDA: { cycles: 2, bytes: 2 },
      LDX: { cycles: 2, bytes: 2 },
      LDY: { cycles: 2, bytes: 2 },
      STA: { cycles: 3, bytes: 2 },
      STX: { cycles: 3, bytes: 2 },
      STY: { cycles: 3, bytes: 2 },
      STZ: { cycles: 3, bytes: 2 },
      // Math / Logic
      ADC: { cycles: 2, bytes: 2 },
      SBC: { cycles: 2, bytes: 2 },
      AND: { cycles: 2, bytes: 2 },
      ORA: { cycles: 2, bytes: 2 },
      EOR: { cycles: 2, bytes: 2 },
      ASL: { cycles: 2, bytes: 1 },
      LSR: { cycles: 2, bytes: 1 },
      ROL: { cycles: 2, bytes: 1 },
      ROR: { cycles: 2, bytes: 1 },
      INC: { cycles: 2, bytes: 1 },
      DEC: { cycles: 2, bytes: 1 },
      INA: { cycles: 2, bytes: 1 },
      DEA: { cycles: 2, bytes: 1 },
      INX: { cycles: 2, bytes: 1 },
      DEX: { cycles: 2, bytes: 1 },
      INY: { cycles: 2, bytes: 1 },
      DEY: { cycles: 2, bytes: 1 },
      CMP: { cycles: 2, bytes: 2 },
      CPX: { cycles: 2, bytes: 2 },
      CPY: { cycles: 2, bytes: 2 },
      BIT: { cycles: 2, bytes: 2 },
      TRB: { cycles: 5, bytes: 2 },
      TSB: { cycles: 5, bytes: 2 },
      // Stack / Transfer
      PHA: { cycles: 3, bytes: 1 },
      PHP: { cycles: 3, bytes: 1 },
      PHX: { cycles: 3, bytes: 1 },
      PHY: { cycles: 3, bytes: 1 },
      PLA: { cycles: 4, bytes: 1 },
      PLP: { cycles: 4, bytes: 1 },
      PLX: { cycles: 4, bytes: 1 },
      PLY: { cycles: 4, bytes: 1 },
      TAX: { cycles: 2, bytes: 1 },
      TAY: { cycles: 2, bytes: 1 },
      TSX: { cycles: 2, bytes: 1 },
      TXA: { cycles: 2, bytes: 1 },
      TXS: { cycles: 2, bytes: 1 },
      TYA: { cycles: 2, bytes: 1 },
      // Flags
      CLC: { cycles: 2, bytes: 1 },
      CLD: { cycles: 2, bytes: 1 },
      CLI: { cycles: 2, bytes: 1 },
      CLV: { cycles: 2, bytes: 1 },
      SEC: { cycles: 2, bytes: 1 },
      SED: { cycles: 2, bytes: 1 },
      SEI: { cycles: 2, bytes: 1 },
      NOP: { cycles: 2, bytes: 1 },
      WAI: { cycles: 3, bytes: 1 },
      STP: { cycles: 3, bytes: 1 },
      // 65C02 BBR/BBS (3 bytes: opcode, zp address, relative offset)
      BBR0: { cycles: 5, bytes: 3 },
      BBR1: { cycles: 5, bytes: 3 },
      BBR2: { cycles: 5, bytes: 3 },
      BBR3: { cycles: 5, bytes: 3 },
      BBR4: { cycles: 5, bytes: 3 },
      BBR5: { cycles: 5, bytes: 3 },
      BBR6: { cycles: 5, bytes: 3 },
      BBR7: { cycles: 5, bytes: 3 },
      BBS0: { cycles: 5, bytes: 3 },
      BBS1: { cycles: 5, bytes: 3 },
      BBS2: { cycles: 5, bytes: 3 },
      BBS3: { cycles: 5, bytes: 3 },
      BBS4: { cycles: 5, bytes: 3 },
      BBS5: { cycles: 5, bytes: 3 },
      BBS6: { cycles: 5, bytes: 3 },
      BBS7: { cycles: 5, bytes: 3 },
      // 65C02 RMB/SMB (2 bytes: opcode, zp address)
      RMB0: { cycles: 5, bytes: 2 },
      RMB1: { cycles: 5, bytes: 2 },
      RMB2: { cycles: 5, bytes: 2 },
      RMB3: { cycles: 5, bytes: 2 },
      RMB4: { cycles: 5, bytes: 2 },
      RMB5: { cycles: 5, bytes: 2 },
      RMB6: { cycles: 5, bytes: 2 },
      RMB7: { cycles: 5, bytes: 2 },
      SMB0: { cycles: 5, bytes: 2 },
      SMB1: { cycles: 5, bytes: 2 },
      SMB2: { cycles: 5, bytes: 2 },
      SMB3: { cycles: 5, bytes: 2 },
      SMB4: { cycles: 5, bytes: 2 },
      SMB5: { cycles: 5, bytes: 2 },
      SMB6: { cycles: 5, bytes: 2 },
      SMB7: { cycles: 5, bytes: 2 },
    };
  }

  updateGutter() {
    if (!this.gutterContent || !this.textarea) return;
    // The gutter shows the same slice the highlight layer does, so re-rendering
    // it is part of a viewport update. Setting the total height here keeps the
    // gutter's own scroll geometry in step with the textarea's.
    this._renderedRange = null;
    this.scheduleViewportUpdate();
  }

  /**
   * Build the gutter rows for lines [start, end).
   */
  buildGutterLines(start, end, lines) {
    const instrInfo = this.getInstructionInfo();
    const opcodeTable = this.getOpcodeTable();
    const gutterLines = [];
    const numWidth = Math.max(2, String(lines.length).length);

    for (let i = start; i < end; i++) {
      const lineNum = String(i + 1).padStart(numWidth, " ");
      const lineNumber = i + 1;
      const parsed = this.parseLine(lines[i]);
      let cycles = "";
      let bytesHex = this.lineBytes.get(lineNumber) || "";
      const hasError =
        this.errors.has(lineNumber) || this.syntaxErrors.has(lineNumber);
      const errorClass = hasError ? " asm-gutter-error" : "";

      // Check if this line has an actual instruction (not a directive, comment, or label-only)
      const isInstruction =
        parsed && parsed.opcode && opcodeTable[parsed.opcode.toUpperCase()];

      // Check for breakpoint at this line's address (only for instruction lines)
      const lineAddr = this.linePCs.get(lineNumber);
      const hasBreakpoint =
        isInstruction &&
        lineAddr !== undefined &&
        this.bpManager?.has(lineAddr);
      const bpClass = hasBreakpoint ? " asm-gutter-bp" : "";

      // Breakpoint indicator: red dot for breakpoint, clickable space for instruction lines, nothing for non-instructions
      let bpIndicator;
      if (hasBreakpoint) {
        bpIndicator = '<span class="asm-gutter-bp-dot"></span>';
      } else if (isInstruction) {
        bpIndicator =
          '<span class="asm-gutter-bp-space asm-gutter-bp-clickable"></span>';
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
          `<span class="asm-gutter-cyc">${cycles || ""}</span>` +
          `<span class="asm-gutter-bytes">${bytesHex || ""}</span>` +
          `</div>`,
      );
    }

    return gutterLines.join("");
  }

  // Compatibility alias
  updateCyclesGutter() {
    this.updateGutter();
  }

  // 65C02 opcode encoding table: mnemonic -> { mode: opcode }
  // Modes: IMP, ACC, IMM, ZP, ZPX, ZPY, ABS, ABX, ABY, IND, IZX, IZY, ZPI, REL
  getOpcodeTable() {
    return {
      ADC: {
        IMM: 0x69,
        ZP: 0x65,
        ZPX: 0x75,
        ABS: 0x6d,
        ABX: 0x7d,
        ABY: 0x79,
        IZX: 0x61,
        IZY: 0x71,
        ZPI: 0x72,
      },
      AND: {
        IMM: 0x29,
        ZP: 0x25,
        ZPX: 0x35,
        ABS: 0x2d,
        ABX: 0x3d,
        ABY: 0x39,
        IZX: 0x21,
        IZY: 0x31,
        ZPI: 0x32,
      },
      ASL: { IMP: 0x0a, ACC: 0x0a, ZP: 0x06, ZPX: 0x16, ABS: 0x0e, ABX: 0x1e },
      BCC: { REL: 0x90 },
      BCS: { REL: 0xb0 },
      BEQ: { REL: 0xf0 },
      BIT: { IMM: 0x89, ZP: 0x24, ZPX: 0x34, ABS: 0x2c, ABX: 0x3c },
      BMI: { REL: 0x30 },
      BNE: { REL: 0xd0 },
      BPL: { REL: 0x10 },
      BRA: { REL: 0x80 },
      BRK: { IMP: 0x00 },
      BVC: { REL: 0x50 },
      BVS: { REL: 0x70 },
      CLC: { IMP: 0x18 },
      CLD: { IMP: 0xd8 },
      CLI: { IMP: 0x58 },
      CLV: { IMP: 0xb8 },
      CMP: {
        IMM: 0xc9,
        ZP: 0xc5,
        ZPX: 0xd5,
        ABS: 0xcd,
        ABX: 0xdd,
        ABY: 0xd9,
        IZX: 0xc1,
        IZY: 0xd1,
        ZPI: 0xd2,
      },
      CPX: { IMM: 0xe0, ZP: 0xe4, ABS: 0xec },
      CPY: { IMM: 0xc0, ZP: 0xc4, ABS: 0xcc },
      DEC: { IMP: 0x3a, ACC: 0x3a, ZP: 0xc6, ZPX: 0xd6, ABS: 0xce, ABX: 0xde },
      DEA: { IMP: 0x3a },
      DEX: { IMP: 0xca },
      DEY: { IMP: 0x88 },
      EOR: {
        IMM: 0x49,
        ZP: 0x45,
        ZPX: 0x55,
        ABS: 0x4d,
        ABX: 0x5d,
        ABY: 0x59,
        IZX: 0x41,
        IZY: 0x51,
        ZPI: 0x52,
      },
      INC: { IMP: 0x1a, ACC: 0x1a, ZP: 0xe6, ZPX: 0xf6, ABS: 0xee, ABX: 0xfe },
      INA: { IMP: 0x1a },
      INX: { IMP: 0xe8 },
      INY: { IMP: 0xc8 },
      JMP: { ABS: 0x4c, IND: 0x6c, IAX: 0x7c },
      JSR: { ABS: 0x20 },
      LDA: {
        IMM: 0xa9,
        ZP: 0xa5,
        ZPX: 0xb5,
        ABS: 0xad,
        ABX: 0xbd,
        ABY: 0xb9,
        IZX: 0xa1,
        IZY: 0xb1,
        ZPI: 0xb2,
      },
      LDX: { IMM: 0xa2, ZP: 0xa6, ZPY: 0xb6, ABS: 0xae, ABY: 0xbe },
      LDY: { IMM: 0xa0, ZP: 0xa4, ZPX: 0xb4, ABS: 0xac, ABX: 0xbc },
      LSR: { IMP: 0x4a, ACC: 0x4a, ZP: 0x46, ZPX: 0x56, ABS: 0x4e, ABX: 0x5e },
      NOP: { IMP: 0xea },
      ORA: {
        IMM: 0x09,
        ZP: 0x05,
        ZPX: 0x15,
        ABS: 0x0d,
        ABX: 0x1d,
        ABY: 0x19,
        IZX: 0x01,
        IZY: 0x11,
        ZPI: 0x12,
      },
      PHA: { IMP: 0x48 },
      PHP: { IMP: 0x08 },
      PHX: { IMP: 0xda },
      PHY: { IMP: 0x5a },
      PLA: { IMP: 0x68 },
      PLP: { IMP: 0x28 },
      PLX: { IMP: 0xfa },
      PLY: { IMP: 0x7a },
      ROL: { IMP: 0x2a, ACC: 0x2a, ZP: 0x26, ZPX: 0x36, ABS: 0x2e, ABX: 0x3e },
      ROR: { IMP: 0x6a, ACC: 0x6a, ZP: 0x66, ZPX: 0x76, ABS: 0x6e, ABX: 0x7e },
      RTI: { IMP: 0x40 },
      RTS: { IMP: 0x60 },
      SBC: {
        IMM: 0xe9,
        ZP: 0xe5,
        ZPX: 0xf5,
        ABS: 0xed,
        ABX: 0xfd,
        ABY: 0xf9,
        IZX: 0xe1,
        IZY: 0xf1,
        ZPI: 0xf2,
      },
      SEC: { IMP: 0x38 },
      SED: { IMP: 0xf8 },
      SEI: { IMP: 0x78 },
      STA: {
        ZP: 0x85,
        ZPX: 0x95,
        ABS: 0x8d,
        ABX: 0x9d,
        ABY: 0x99,
        IZX: 0x81,
        IZY: 0x91,
        ZPI: 0x92,
      },
      STX: { ZP: 0x86, ZPY: 0x96, ABS: 0x8e },
      STY: { ZP: 0x84, ZPX: 0x94, ABS: 0x8c },
      STZ: { ZP: 0x64, ZPX: 0x74, ABS: 0x9c, ABX: 0x9e },
      TAX: { IMP: 0xaa },
      TAY: { IMP: 0xa8 },
      TRB: { ZP: 0x14, ABS: 0x1c },
      TSB: { ZP: 0x04, ABS: 0x0c },
      TSX: { IMP: 0xba },
      TXA: { IMP: 0x8a },
      TXS: { IMP: 0x9a },
      TYA: { IMP: 0x98 },
      WAI: { IMP: 0xcb },
      STP: { IMP: 0xdb },
      // BBR/BBS (zero page relative - 3 bytes)
      BBR0: { ZPR: 0x0f },
      BBR1: { ZPR: 0x1f },
      BBR2: { ZPR: 0x2f },
      BBR3: { ZPR: 0x3f },
      BBR4: { ZPR: 0x4f },
      BBR5: { ZPR: 0x5f },
      BBR6: { ZPR: 0x6f },
      BBR7: { ZPR: 0x7f },
      BBS0: { ZPR: 0x8f },
      BBS1: { ZPR: 0x9f },
      BBS2: { ZPR: 0xaf },
      BBS3: { ZPR: 0xbf },
      BBS4: { ZPR: 0xcf },
      BBS5: { ZPR: 0xdf },
      BBS6: { ZPR: 0xef },
      BBS7: { ZPR: 0xff },
      // RMB/SMB (zero page - 2 bytes)
      RMB0: { ZP: 0x07 },
      RMB1: { ZP: 0x17 },
      RMB2: { ZP: 0x27 },
      RMB3: { ZP: 0x37 },
      RMB4: { ZP: 0x47 },
      RMB5: { ZP: 0x57 },
      RMB6: { ZP: 0x67 },
      RMB7: { ZP: 0x77 },
      SMB0: { ZP: 0x87 },
      SMB1: { ZP: 0x97 },
      SMB2: { ZP: 0xa7 },
      SMB3: { ZP: 0xb7 },
      SMB4: { ZP: 0xc7 },
      SMB5: { ZP: 0xd7 },
      SMB6: { ZP: 0xe7 },
      SMB7: { ZP: 0xf7 },
    };
  }

  /**
   * Parse an operand and determine addressing mode + value
   * Returns { mode, value, value2 } or null if unparseable
   */
  parseOperand(operand, mnemonic) {
    if (!operand || operand.trim() === "") {
      return { mode: "IMP", value: null };
    }

    operand = operand.trim();
    const opcodes = this.getOpcodeTable()[mnemonic];
    if (!opcodes) return null;

    // Immediate: #$xx or #value
    if (operand.startsWith("#")) {
      const val = this.parseValue(operand.substring(1));
      if (val !== null) {
        return { mode: "IMM", value: val & 0xff };
      }
      return null; // Unresolved symbol
    }

    // Indirect modes
    if (operand.startsWith("(")) {
      // (addr,X) - Indexed indirect
      if (operand.match(/^\([^)]+,\s*X\)$/i)) {
        const inner = operand.match(/^\(([^,]+),/i)[1];
        const val = this.parseValue(inner);
        if (val !== null) return { mode: "IZX", value: val & 0xff };
        return null;
      }
      // (addr),Y - Indirect indexed
      if (operand.match(/^\([^)]+\)\s*,\s*Y$/i)) {
        const inner = operand.match(/^\(([^)]+)\)/i)[1];
        const val = this.parseValue(inner);
        if (val !== null) return { mode: "IZY", value: val & 0xff };
        return null;
      }
      // (addr,X) for JMP
      if (operand.match(/^\([^)]+,\s*X\)$/i) && opcodes.IAX) {
        const inner = operand.match(/^\(([^,]+),/i)[1];
        const val = this.parseValue(inner);
        if (val !== null) return { mode: "IAX", value: val & 0xffff };
        return null;
      }
      // (addr) - Indirect (JMP) or Zero Page Indirect (65C02)
      if (operand.match(/^\([^)]+\)$/)) {
        const inner = operand.match(/^\(([^)]+)\)$/)[1];
        const val = this.parseValue(inner);
        if (val !== null) {
          if (opcodes.IND && val > 0xff)
            return { mode: "IND", value: val & 0xffff };
          if (opcodes.ZPI) return { mode: "ZPI", value: val & 0xff };
          if (opcodes.IND) return { mode: "IND", value: val & 0xffff };
        }
        return null;
      }
    }

    // addr,X or addr,Y
    if (operand.match(/,\s*X$/i)) {
      const addrPart = operand.replace(/,\s*X$/i, "").trim();
      const val = this.parseValue(addrPart);
      if (val !== null) {
        if (val <= 0xff && opcodes.ZPX) return { mode: "ZPX", value: val };
        if (opcodes.ABX) return { mode: "ABX", value: val & 0xffff };
      }
      return null;
    }
    if (operand.match(/,\s*Y$/i)) {
      const addrPart = operand.replace(/,\s*Y$/i, "").trim();
      const val = this.parseValue(addrPart);
      if (val !== null) {
        if (val <= 0xff && opcodes.ZPY) return { mode: "ZPY", value: val };
        if (opcodes.ABY) return { mode: "ABY", value: val & 0xffff };
      }
      return null;
    }

    // Accumulator mode (A or empty for shift/rotate)
    if (operand.toUpperCase() === "A" && opcodes.ACC) {
      return { mode: "ACC", value: null };
    }

    // Branch relative - just parse the target, we'll show ?? for offset
    if (opcodes.REL) {
      const val = this.parseValue(operand);
      // For branches, we can't calculate offset without knowing current PC
      // Just return the mode with the target value
      return { mode: "REL", value: val };
    }

    // Plain address - zero page or absolute
    const val = this.parseValue(operand);
    if (val !== null) {
      if (val <= 0xff && opcodes.ZP) return { mode: "ZP", value: val };
      if (opcodes.ABS) return { mode: "ABS", value: val & 0xffff };
    }

    return null; // Unresolved
  }

  /**
   * Parse a value or expression. Supports arithmetic (+, -, *, /),
   * byte selectors (< >), current PC (*), and nested parentheses.
   */
  parseValue(str) {
    if (!str) return null;
    str = str.trim();
    if (!str) return null;
    this._exprPos = 0;
    this._exprStr = str;
    const val = this._exprAddSub();
    return val;
  }

  _exprSkipSpaces() {
    while (
      this._exprPos < this._exprStr.length &&
      this._exprStr[this._exprPos] === " "
    ) {
      this._exprPos++;
    }
  }

  _exprPeek() {
    this._exprSkipSpaces();
    return this._exprPos < this._exprStr.length
      ? this._exprStr[this._exprPos]
      : null;
  }

  _exprAddSub() {
    let val = this._exprMulDiv();
    if (val === null) return null;
    while (true) {
      const ch = this._exprPeek();
      if (ch === "+") {
        this._exprPos++;
        const right = this._exprMulDiv();
        if (right === null) return null;
        val = val + right;
      } else if (ch === "-") {
        this._exprPos++;
        const right = this._exprMulDiv();
        if (right === null) return null;
        val = val - right;
      } else {
        break;
      }
    }
    return val;
  }

  _exprMulDiv() {
    let val = this._exprUnary();
    if (val === null) return null;
    while (true) {
      const ch = this._exprPeek();
      // * here is always multiply — PC reference is handled in _exprPrimary
      if (ch === "*") {
        this._exprPos++;
        const right = this._exprUnary();
        if (right === null) return null;
        val = val * right;
      } else if (ch === "/") {
        this._exprPos++;
        const right = this._exprUnary();
        if (right === null) return null;
        val = right !== 0 ? Math.trunc(val / right) : 0;
      } else {
        break;
      }
    }
    return val;
  }

  _exprUnary() {
    const ch = this._exprPeek();
    if (ch === "<") {
      this._exprPos++;
      const val = this._exprUnary();
      return val !== null ? val & 0xff : null;
    }
    if (ch === ">") {
      this._exprPos++;
      const val = this._exprUnary();
      return val !== null ? (val >> 8) & 0xff : null;
    }
    if (ch === "-") {
      this._exprPos++;
      const val = this._exprUnary();
      return val !== null ? -val : null;
    }
    return this._exprPrimary();
  }

  _exprPrimary() {
    this._exprSkipSpaces();
    if (this._exprPos >= this._exprStr.length) return null;
    const ch = this._exprStr[this._exprPos];

    // Parenthesized sub-expression
    if (ch === "(") {
      this._exprPos++;
      const val = this._exprAddSub();
      this._exprSkipSpaces();
      if (
        this._exprPos < this._exprStr.length &&
        this._exprStr[this._exprPos] === ")"
      ) {
        this._exprPos++;
      }
      return val;
    }

    // Current PC: *
    if (ch === "*") {
      this._exprPos++;
      return this.currentPC !== undefined ? this.currentPC : null;
    }

    // Hex: $xxxx
    if (ch === "$") {
      this._exprPos++;
      let start = this._exprPos;
      while (
        this._exprPos < this._exprStr.length &&
        /[0-9A-Fa-f]/.test(this._exprStr[this._exprPos])
      ) {
        this._exprPos++;
      }
      if (this._exprPos === start) return null;
      return parseInt(this._exprStr.substring(start, this._exprPos), 16);
    }

    // Binary: %01010101
    if (ch === "%") {
      this._exprPos++;
      let start = this._exprPos;
      while (
        this._exprPos < this._exprStr.length &&
        /[01]/.test(this._exprStr[this._exprPos])
      ) {
        this._exprPos++;
      }
      if (this._exprPos === start) return null;
      return parseInt(this._exprStr.substring(start, this._exprPos), 2);
    }

    // Character literal: 'A'
    if (ch === "'") {
      this._exprPos++;
      if (this._exprPos >= this._exprStr.length) return null;
      const val = this._exprStr.charCodeAt(this._exprPos);
      this._exprPos++;
      if (
        this._exprPos < this._exprStr.length &&
        this._exprStr[this._exprPos] === "'"
      ) {
        this._exprPos++;
      }
      return val;
    }

    // Decimal number
    if (/[0-9]/.test(ch)) {
      let start = this._exprPos;
      while (
        this._exprPos < this._exprStr.length &&
        /[0-9]/.test(this._exprStr[this._exprPos])
      ) {
        this._exprPos++;
      }
      return parseInt(this._exprStr.substring(start, this._exprPos), 10);
    }

    // Symbol / label
    if (/[A-Za-z_:\]]/.test(ch)) {
      let start = this._exprPos;
      while (
        this._exprPos < this._exprStr.length &&
        /[A-Za-z0-9_:\]]/.test(this._exprStr[this._exprPos])
      ) {
        this._exprPos++;
      }
      const name = this._exprStr.substring(start, this._exprPos).toUpperCase();
      if (this.symbols.has(name)) {
        return this.symbols.get(name);
      }
      return null; // Unresolved symbol
    }

    return null;
  }

  /**
   * Encode a line and store the bytes
   */
  encodeLineBytes(lineNumber) {
    if (!this.textarea) return;

    const lines = this.textarea.value.split("\n");
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
    let bytes = opcode.toString(16).toUpperCase().padStart(2, "0");

    if (operandInfo.mode === "IMP" || operandInfo.mode === "ACC") {
      // 1 byte - just the opcode
    } else if (operandInfo.mode === "REL") {
      // Branch - calculate relative offset if we know target and current PC
      const targetAddr = operandInfo.value;
      const currentPC = this.linePCs?.get(lineNumber);

      if (targetAddr !== null && currentPC !== undefined) {
        // Branch offset is relative to PC after the instruction (PC + 2)
        const nextPC = currentPC + 2;
        const offset = targetAddr - nextPC;

        // Check if offset is in valid range (-128 to +127)
        if (offset >= -128 && offset <= 127) {
          const signedByte = offset < 0 ? 256 + offset : offset;
          bytes += " " + signedByte.toString(16).toUpperCase().padStart(2, "0");
        } else {
          bytes += " ??"; // Out of range
        }
      } else {
        bytes += " ??"; // Unknown target
      }
    } else if (
      ["IMM", "ZP", "ZPX", "ZPY", "IZX", "IZY", "ZPI"].includes(
        operandInfo.mode,
      )
    ) {
      // 2 bytes
      if (operandInfo.value !== null) {
        bytes +=
          " " +
          (operandInfo.value & 0xff)
            .toString(16)
            .toUpperCase()
            .padStart(2, "0");
      } else {
        bytes += " ??";
      }
    } else if (["ABS", "ABX", "ABY", "IND", "IAX"].includes(operandInfo.mode)) {
      // 3 bytes (little-endian)
      if (operandInfo.value !== null) {
        const lo = operandInfo.value & 0xff;
        const hi = (operandInfo.value >> 8) & 0xff;
        bytes += " " + lo.toString(16).toUpperCase().padStart(2, "0");
        bytes += " " + hi.toString(16).toUpperCase().padStart(2, "0");
      } else {
        bytes += " ?? ??";
      }
    } else if (operandInfo.mode === "ZPR") {
      // 3 bytes: opcode, zp addr, relative offset
      bytes += " ?? ??";
    }

    this.lineBytes.set(lineNumber, bytes);
  }

  /**
   * Encode all lines (called after successful assembly)
   */
  encodeAllLineBytes() {
    this.lineBytes.clear();
    this.linePCs = new Map(); // Track PC for each line

    const lines = this.textarea.value.split("\n");

    // Find ORG from source code, default to $0800 if not found yet
    let pc = 0x0800;

    // First pass: calculate PC and collect labels/EQU values
    const localSymbols = new Map();
    for (let i = 0; i < lines.length; i++) {
      const lineNumber = i + 1;
      const parsed = this.parseLine(lines[i]);

      if (parsed && parsed.opcode) {
        const mnem = parsed.opcode.toUpperCase();

        // Check for ORG directive and update PC
        if (mnem === "ORG") {
          this.currentPC = pc;
          const orgValue = this.parseValue(parsed.operand);
          if (orgValue !== null) {
            pc = orgValue;
          }
        }

        // Collect label addresses and EQU values
        if (parsed.label) {
          const labelUpper = parsed.label.toUpperCase();
          if (mnem === "EQU") {
            this.currentPC = pc;
            const val = this.parseValue(parsed.operand);
            if (val !== null) {
              localSymbols.set(labelUpper, val);
              this.symbols.set(labelUpper, val);
            }
          } else {
            localSymbols.set(labelUpper, pc);
            this.symbols.set(labelUpper, pc);
          }
        }
      } else if (parsed && parsed.label) {
        // Label-only line (no opcode)
        const labelUpper = parsed.label.toUpperCase();
        localSymbols.set(labelUpper, pc);
        this.symbols.set(labelUpper, pc);
      }

      this.linePCs.set(lineNumber, pc);

      if (parsed && parsed.opcode) {
        const size = this.getInstructionSize(
          parsed.opcode.toUpperCase(),
          parsed.operand,
        );
        pc += size;
      }
    }

    // Second pass: re-evaluate EQU values now that all labels are known
    pc = 0x0800;
    for (let i = 0; i < lines.length; i++) {
      const parsed = this.parseLine(lines[i]);
      if (parsed && parsed.opcode) {
        const mnem = parsed.opcode.toUpperCase();
        if (mnem === "ORG") {
          this.currentPC = pc;
          const orgValue = this.parseValue(parsed.operand);
          if (orgValue !== null) pc = orgValue;
        }
        if (parsed.label && mnem === "EQU") {
          this.currentPC = pc;
          const val = this.parseValue(parsed.operand);
          if (val !== null) {
            this.symbols.set(parsed.label.toUpperCase(), val);
          }
        }
      }
      this.currentPC = this.linePCs.get(i + 1);
      if (parsed && parsed.opcode) {
        const size = this.getInstructionSize(
          parsed.opcode.toUpperCase(),
          parsed.operand,
        );
        pc += size;
      }
    }

    // Third pass: encode with known PCs and symbols
    for (let i = 1; i <= lines.length; i++) {
      this.currentPC = this.linePCs.get(i);
      this.encodeLineBytes(i);
    }
    this.currentPC = undefined;
  }

  /**
   * Get the size of an instruction in bytes
   */
  getInstructionSize(mnemonic, operand) {
    const opcodes = this.getOpcodeTable()[mnemonic];
    if (!opcodes) {
      // Check if it's a directive
      const upper = mnemonic.toUpperCase();
      if (upper === "ORG" || upper === "EQU") return 0;
      if (upper === "DFB" || upper === "DB") {
        // Count comma-separated values
        if (!operand) return 1;
        return operand.split(",").length;
      }
      if (upper === "DW" || upper === "DA") {
        if (!operand) return 2;
        return operand.split(",").length * 2;
      }
      if (upper === "ASC" || upper === "DCI") {
        // String length (rough estimate)
        const match = operand?.match(/["']([^"']*)["']/);
        if (match) return match[1].length;
        return 0;
      }
      if (upper === "DS") {
        const val = this.parseValue(operand);
        return val || 0;
      }
      if (upper === "HEX") {
        // Count hex digits / 2
        const hex = operand?.replace(/[^0-9A-Fa-f]/g, "") || "";
        return Math.floor(hex.length / 2);
      }
      return 0;
    }

    const operandInfo = this.parseOperand(operand, mnemonic);
    if (!operandInfo) return 0;

    // Size based on addressing mode
    switch (operandInfo.mode) {
      case "IMP":
      case "ACC":
        return 1;
      case "IMM":
      case "ZP":
      case "ZPX":
      case "ZPY":
      case "IZX":
      case "IZY":
      case "ZPI":
      case "REL":
        return 2;
      case "ABS":
      case "ABX":
      case "ABY":
      case "IND":
      case "IAX":
      case "ZPR":
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

    const lines = this.textarea.value.split("\n");
    if (lineNumber < 1 || lineNumber > lines.length) return;

    const line = lines[lineNumber - 1];

    // Clear any previous syntax error for this line
    this.syntaxErrors.delete(lineNumber);

    // Empty lines are valid
    if (!line.trim()) return;

    // Full-line comments are valid
    const trimmed = line.trim();
    if (trimmed.startsWith(";") || trimmed.startsWith("*")) return;

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
      } else if (ch === ";" && !inQuote) {
        commentIdx = i;
        break;
      }
    }

    const mainPart = commentIdx >= 0 ? line.substring(0, commentIdx) : line;

    // If line is just whitespace before comment, that's valid
    if (!mainPart.trim()) return null;

    // Check if line starts with whitespace (no label)
    const hasLabel =
      mainPart.length > 0 && mainPart[0] !== " " && mainPart[0] !== "\t";

    // Tokenize the main part
    const tokens = [];
    let current = "";
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
      } else if ((ch === " " || ch === "\t") && !inStr) {
        if (current) {
          tokens.push({ text: current, pos: i - current.length });
          current = "";
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
        // Validate operand for invalid numbers
        const operandError = this.validateOperandNumbers(
          tokens[1].text,
          tokens[2].text,
        );
        if (operandError) return operandError;
        return null;
      } else if (tokens.length > 3) {
        // Too many tokens - find the extra one
        const extra = tokens
          .slice(3)
          .map((t) => t.text)
          .join(" ");
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
        // Validate operand for invalid numbers
        const operandError = this.validateOperandNumbers(
          tokens[0].text,
          tokens[1].text,
        );
        if (operandError) return operandError;
        return null;
      } else if (tokens.length > 2) {
        // Too many tokens
        const extra = tokens
          .slice(2)
          .map((t) => t.text)
          .join(" ");
        return `Unexpected: ${extra}`;
      }
    }

    return null;
  }

  /**
   * Validate numeric literals in an operand
   * Returns error message or null if valid
   */
  validateOperandNumbers(opcode, operand) {
    // Skip string literals
    if (operand.startsWith('"') || operand.startsWith("'")) {
      return null;
    }

    const upperOpcode = opcode.toUpperCase();

    // Directives that expect 8-bit values
    const byteDirectives = new Set(["DFB", "DB"]);

    // Check if this is immediate mode (starts with #)
    const isImmediate = operand.startsWith("#");

    // Determine max value based on context
    // Immediate mode and byte directives expect 8-bit values
    const expects8Bit = isImmediate || byteDirectives.has(upperOpcode);

    // Find all hex numbers ($xxxx) and validate them
    const hexPattern = /\$([A-Za-z0-9]+)/g;
    let match;
    while ((match = hexPattern.exec(operand)) !== null) {
      const hexDigits = match[1];
      if (!/^[0-9A-Fa-f]+$/.test(hexDigits)) {
        return `Invalid hex number: $${hexDigits}`;
      }
      // Check value range
      const value = parseInt(hexDigits, 16);
      if (value > 0xffff) {
        return `Value exceeds 16-bit maximum: $${hexDigits}`;
      }
      if (expects8Bit && value > 0xff) {
        return `Value exceeds 8-bit maximum: $${hexDigits}`;
      }
    }

    // Find all binary numbers (%xxxx) and validate them
    const binPattern = /%([A-Za-z0-9]+)/g;
    while ((match = binPattern.exec(operand)) !== null) {
      const binDigits = match[1];
      if (!/^[01]+$/.test(binDigits)) {
        return `Invalid binary number: %${binDigits}`;
      }
      // Check value range
      const value = parseInt(binDigits, 2);
      if (value > 0xffff) {
        return `Value exceeds 16-bit maximum: %${binDigits}`;
      }
      if (expects8Bit && value > 0xff) {
        return `Value exceeds 8-bit maximum: %${binDigits}`;
      }
    }

    // Find decimal numbers (digits not preceded by $ or %)
    const decPattern = /(?<![A-Za-z0-9$%])(\d+)(?![A-Za-z])/g;
    while ((match = decPattern.exec(operand)) !== null) {
      const decDigits = match[1];
      const value = parseInt(decDigits, 10);
      if (value > 0xffff) {
        return `Value exceeds 16-bit maximum: ${decDigits}`;
      }
      if (expects8Bit && value > 0xff) {
        return `Value exceeds 8-bit maximum: ${decDigits}`;
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
      "ORG",
      "EQU",
      "DS",
      "DFB",
      "DB",
      "DW",
      "DA",
      "DDB",
      "ASC",
      "DCI",
      "HEX",
      "PUT",
      "USE",
      "OBJ",
      "LST",
      "DO",
      "ELSE",
      "FIN",
      "LUP",
      "--^",
      "REL",
      "TYP",
      "SAV",
      "DSK",
      "CHN",
      "ENT",
      "EXT",
      "DUM",
      "DEND",
      "ERR",
      "CYC",
      "DAT",
      "EXP",
      "PAU",
      "SW",
      "USR",
      "XC",
      "MX",
      "TR",
      "KBD",
      "PMC",
      "PAG",
      "TTL",
      "SKP",
      "CHK",
      "IF",
      "ELUP",
      "END",
      "MAC",
      "EOM",
      "<<<",
      "ADR",
      "ADRL",
      "LNK",
      "STR",
      "STRL",
      "REV",
    ]);

    return directives.has(upper);
  }

  /**
   * Validate all lines
   */
  validateAllLines() {
    this.syntaxErrors.clear();
    const lines = this.textarea.value.split("\n");

    // First pass: collect all symbol definitions to detect duplicates
    const symbolDefs = new Map(); // symbol name -> first line number

    for (let i = 0; i < lines.length; i++) {
      const lineNumber = i + 1;
      const label = this.extractLabel(lines[i]);
      if (label) {
        const upperLabel = label.toUpperCase();
        if (symbolDefs.has(upperLabel)) {
          const firstLine = symbolDefs.get(upperLabel);
          this.syntaxErrors.set(
            lineNumber,
            `Duplicate symbol: ${label} (first defined on line ${firstLine})`,
          );
        } else {
          symbolDefs.set(upperLabel, lineNumber);
        }
      }
    }

    // Second pass: validate each line for other syntax errors
    for (let i = 1; i <= lines.length; i++) {
      // Skip lines that already have duplicate symbol errors
      if (!this.syntaxErrors.has(i)) {
        this.validateLine(i);
      }
    }
  }

  /**
   * Extract label from a line (if present)
   * Returns null if no label
   */
  extractLabel(line) {
    // No label if line starts with whitespace or is empty
    if (!line || line[0] === " " || line[0] === "\t") {
      return null;
    }

    // Full-line comments have no label
    const trimmed = line.trim();
    if (trimmed.startsWith(";") || trimmed.startsWith("*")) {
      return null;
    }

    // Extract first token (the label)
    let label = "";
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === " " || ch === "\t") {
        break;
      }
      label += ch;
    }

    return label || null;
  }

  updateHighlighting() {
    // Only the visible slice is highlighted, on the next frame. Re-highlighting
    // the whole document here made every keystroke in a large source cost a
    // pass over every line of it.
    this.invalidateSourceLines();
    this._renderedRange = null;
    this.scheduleViewportUpdate();

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
      this.errorsOverlay.innerHTML = "";
      return;
    }

    const { lineHeight, paddingTop } = this.getLineMetrics();

    let html = "";
    for (const [lineNum, msg] of allErrors) {
      // Position at the top of the error line
      const top = paddingTop + (lineNum - 1) * lineHeight;
      // Center of the line for the message
      const centerY = top + lineHeight / 2;
      // Error highlight bar (background)
      html += `<div class="asm-error-highlight" style="top: ${top}px; height: ${lineHeight}px"></div>`;
      // Error message (right side, vertically centered)
      html += `<div class="asm-error-msg" style="top: ${centerY}px">${escapeHtml(msg)}</div>`;
    }

    this.errorsOverlay.innerHTML = html;
  }

  async doAssemble() {
    // Format all lines before assembling
    this.formatAllLines();

    const text = this.textarea.value;
    if (!text.trim()) {
      this.setStatus("Nothing to assemble", false);
      return;
    }

    // Check if source has ORG directive before any code
    const hasOrg = text.match(/^\s*ORG\b/im);
    if (!hasOrg) {
      this.setStatus("ORG directive required before code", false);
      return;
    }

    // Clear previous errors
    this.errors.clear();
    this.syntaxErrors.clear();

    // Validate all lines for syntax errors before assembly
    this.validateAllLines();

    // If there are syntax errors, don't proceed with assembly
    if (this.syntaxErrors.size > 0) {
      const count = this.syntaxErrors.size;
      this.setStatus(`${count} syntax error${count !== 1 ? "s" : ""}`, false);
      this.loadBtn.disabled = true;
      this.debugBtn.disabled = true;
      this.clearOutputPanels();
      this.updateHighlighting();
      this.updateCyclesGutter();
      return;
    }

    // Allocate source string in WASM heap
    const wasm = this.wasmModule;
    const sourceLen = text.length + 1;
    const sourcePtr = await wasm._malloc(sourceLen);
    await wasm.stringToUTF8(text, sourcePtr, sourceLen);

    const success = await wasm._assembleSource(sourcePtr);
    wasm._free(sourcePtr);

    if (success) {
      const [size, origin] = await wasm.batch([
        ['_getAsmOutputSize'],
        ['_getAsmOrigin'],
      ]);
      this.lastAssembledSize = size;
      this.lastOrigin = origin;
      this.setStatus(
        `OK: ${size} bytes at $${origin.toString(16).toUpperCase().padStart(4, "0")}`,
        true,
      );
      this.loadBtn.disabled = !this.isRunningCallback();
      this.debugBtn.disabled = !this.isRunningCallback();

      // Store symbols for byte encoding
      this.symbols.clear();
      const symbolCount = await wasm._getAsmSymbolCount();
      for (let i = 0; i < symbolCount; i++) {
        const namePtr = await wasm._getAsmSymbolName(i);
        const name = await wasm.UTF8ToString(namePtr);
        const value = await wasm._getAsmSymbolValue(i);
        this.symbols.set(name.toUpperCase(), value);
      }

      // Export symbols to CPU debugger label manager
      if (this.cpuDebugger) {
        const lm = this.cpuDebugger.labelManager;
        lm.clearImportedBySource("assembler");
        for (const [name, value] of this.symbols) {
          if (value >= 0 && value <= 0xffff) {
            lm.importedLabels.set(value, { name, source: "assembler" });
          }
        }
        lm._notify();
      }

      // Re-encode all lines with resolved symbols
      this.encodeAllLineBytes();

      await this.updateSymbolTable(wasm);
      await this.updateHexOutput(wasm, origin, size);
      await this.writeObjectFile(wasm, size, origin);
    } else {
      const errorCount = await wasm._getAsmErrorCount();
      this.setStatus(
        `${errorCount} error${errorCount !== 1 ? "s" : ""}`,
        false,
      );
      this.loadBtn.disabled = true;
      this.debugBtn.disabled = true;

      // Collect errors
      for (let i = 0; i < errorCount; i++) {
        const line = await wasm._getAsmErrorLine(i);
        const msgPtr = await wasm._getAsmErrorMessage(i);
        const msg = await wasm.UTF8ToString(msgPtr);

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

  /**
   * Honour a DSK directive: write the assembled object to the disk in the
   * drive it named, as Merlin does at the end of an assembly.
   *
   * A failed write is reported in the status line and nothing else changes —
   * the code is still assembled and can still be loaded into memory, so a
   * write-protected or unformatted disk should not read as a failed assembly.
   */
  async writeObjectFile(wasm, size, origin) {
    if (typeof wasm._hasAsmObjectFile !== "function") return;
    if (!(await wasm._hasAsmObjectFile())) return;

    const namePtr = await wasm._getAsmObjectFilename();
    const filename = await wasm.UTF8ToString(namePtr);
    const drive = await wasm._getAsmObjectDrive();
    const status = await wasm._writeAsmObjectToDisk();

    const okStatus = 0;
    if (status === okStatus) {
      const hex = `$${origin.toString(16).toUpperCase().padStart(4, "0")}`;
      this.setStatus(`OK: ${size} bytes at ${hex} — wrote ${filename} to drive ${drive}`, true);
      if (this.onObjectFileWritten) {
        await this.onObjectFileWritten(drive - 1, filename);
      }
      return;
    }

    const messagePtr = await wasm._getAsmObjectStatusMessage(status);
    const message = await wasm.UTF8ToString(messagePtr);
    this.setStatus(`DSK ${filename}: ${message}`, false);
  }

  async updateSymbolTable(wasm) {
    const count = await wasm._getAsmSymbolCount();

    // Update count badge
    if (this.symbolsCount) {
      this.symbolsCount.textContent = count > 0 ? count : "";
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
      const namePtr = await wasm._getAsmSymbolName(i);
      const name = await wasm.UTF8ToString(namePtr);
      const value = await wasm._getAsmSymbolValue(i);
      const hex =
        "$" + (value & 0xffff).toString(16).toUpperCase().padStart(4, "0");
      const isLocal = name.startsWith(":") || name.startsWith("]");
      const item = { name, hex, isLocal };

      // Heuristic: values in ROM range ($F800+) or under $0100 are likely equates
      if (value >= 0xf800 || value < 0x0100) {
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
        const cls = item.isLocal ? "asm-sym-local" : "asm-sym-global";
        html += `<div class="asm-symbol-row">
          <span class="asm-sym-name ${cls}">${escapeHtml(item.name)}</span>
          <span class="asm-sym-value">${item.hex}</span>
        </div>`;
      }
      html += "</div>";
    }

    if (equates.length > 0) {
      html += '<div class="asm-symbol-group">';
      html += '<div class="asm-symbol-group-header">Equates</div>';
      for (const item of equates) {
        html += `<div class="asm-symbol-row">
          <span class="asm-sym-name asm-sym-equ">${escapeHtml(item.name)}</span>
          <span class="asm-sym-value">${item.hex}</span>
        </div>`;
      }
      html += "</div>";
    }

    html += "</div>";
    this.symbolsContent.innerHTML = html;
  }

  async updateHexOutput(wasm, origin, size) {
    // Update count badge
    if (this.hexCount) {
      this.hexCount.textContent = size > 0 ? `${size} bytes` : "";
    }

    if (size === 0) {
      this.hexContent.innerHTML = `
        <div class="asm-panel-empty">
          <div class="asm-empty-icon">[ ]</div>
          <div class="asm-empty-text">No output</div>
        </div>`;
      return;
    }

    const bufPtr = await wasm._getAsmOutputBuffer();
    const data = await wasm.heapRead(bufPtr, size);

    // Header showing range
    const endAddr = origin + size - 1;
    const rangeStr = `$${origin.toString(16).toUpperCase().padStart(4, "0")} - $${(endAddr & 0xffff).toString(16).toUpperCase().padStart(4, "0")}`;

    let html = `<div class="asm-hex-header">
      <span class="asm-hex-range">${rangeStr}</span>
      <span class="asm-hex-size">${size} bytes</span>
    </div>`;

    html += '<div class="asm-hex-dump">';
    const bytesPerRow = 8; // Use 8 bytes for cleaner display

    for (let offset = 0; offset < size; offset += bytesPerRow) {
      const addr = origin + offset;
      const addrStr =
        "$" + (addr & 0xffff).toString(16).toUpperCase().padStart(4, "0");

      let hexPart = "";
      let asciiPart = "";

      for (let i = 0; i < bytesPerRow; i++) {
        if (offset + i < size) {
          const byte = data[offset + i];
          hexPart += byte.toString(16).toUpperCase().padStart(2, "0") + " ";
          asciiPart +=
            byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : "·";
        } else {
          hexPart += "   ";
          asciiPart += " ";
        }
      }

      html +=
        `<div class="asm-hex-row">` +
        `<span class="asm-hex-addr">${addrStr}</span>` +
        `<span class="asm-hex-sep">│</span>` +
        `<span class="asm-hex-bytes">${hexPart}</span>` +
        `<span class="asm-hex-sep">│</span>` +
        `<span class="asm-hex-ascii">${escapeHtml(asciiPart)}</span>` +
        `</div>`;
    }

    html += "</div>";
    this.hexContent.innerHTML = html;
  }

  clearOutputPanels() {
    // Clear count badges
    if (this.symbolsCount) this.symbolsCount.textContent = "";
    if (this.hexCount) this.hexCount.textContent = "";

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


  loadExample() {
    const example = `; Hello World - prints a message and returns to the monitor
;
; Assemble, Load, then type CALL 2048 from within BASIC.

            ORG  $0800

COUT        EQU  $FDED         ;ROM character output routine
CROUT       EQU  $FD8E         ;ROM carriage return

START       LDX  #0            ;Start at first character
LOOP        LDA  MSG,X         ;Load next character
            BEQ  DONE          ;Zero byte = end of string
            JSR  COUT          ;Print character
            INX                ;Next character
            BNE  LOOP          ;Continue (max 256 chars)
DONE        JSR  CROUT         ;Print carriage return
            RTS                ;Return to monitor

MSG         ASC  "HELLO FROM THE APPLE //E EMULATOR!"
            DFB  $00           ;Null terminator`;

    this.textarea.value = example;
    this.textarea.dispatchEvent(new Event("input", { bubbles: true }));
    this.doClear();
    this.currentFileName = null;
    this.validateAllLines();
    this.encodeAllLineBytes();
    this.updateGutter();
    this.updateCursorPosition();
  }

  doClear() {
    this.symbols.clear();
    this.lineBytes.clear();
    this.linePCs = new Map();
    this.errors.clear();
    this.syntaxErrors.clear();
    this.loadBtn.disabled = true;
    this.debugBtn.disabled = true;
    this.setStatus("", false);

    // Clear output panels to empty state
    if (this.symbolsCount) this.symbolsCount.textContent = "";
    if (this.hexCount) this.hexCount.textContent = "";
    this.symbolsContent.innerHTML = `
      <div class="asm-panel-empty">
        <div class="asm-empty-text">Assemble to see symbols</div>
      </div>`;
    this.hexContent.innerHTML = `
      <div class="asm-panel-empty">
        <div class="asm-empty-text">Assemble to see output</div>
      </div>`;

    this.updateGutter();
    this.updateHighlighting();
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

  /**
   * Create a new empty file
   */
  async newFile() {
    if (this.textarea.value.trim()) {
      const confirmed = await showConfirm(
        "Clear current source and start new file?",
      );
      if (!confirmed) return;
    }
    this.textarea.value = "";
    this.currentFileName = null;
    this._fileHandle = null;
    this.updateTitle("Assembler");
    this.updateHighlighting();
    this.updateGutter();
    this.errors.clear();
    this.syntaxErrors.clear();
    this.clearOutputPanels();
    this.setStatus("", true);
  }

  /**
   * Open a file from the local filesystem using the host file picker
   */
  // Apply a loaded file's text to the editor. Shared by both the File System
  // Access path and the <input type="file"> fallback.
  _applyOpenedFile(name, text) {
    this.textarea.value = text;
    this.currentFileName = name;
    this.updateTitle(`Assembler - ${name}`);
    this.updateHighlighting();
    this.validateAllLines();
    this.encodeAllLineBytes();
    this.updateGutter();
    this.setStatus(`Opened: ${name}`, true);
  }

  async openFile() {
    // Safari and Firefox lack the File System Access API; fall back to a
    // hidden <input type="file"> when showOpenFilePicker is unavailable.
    if (typeof window.showOpenFilePicker !== "function") {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".s,.asm,.a65,.txt,text/plain";
      input.style.display = "none";
      input.addEventListener("change", async () => {
        const file = input.files && input.files[0];
        if (file) {
          try {
            const text = await file.text();
            this._fileHandle = null;
            this._applyOpenedFile(file.name, text);
          } catch (err) {
            this.setStatus("Failed to open file", false);
          }
        }
        input.remove();
      });
      document.body.appendChild(input);
      input.click();
      return;
    }

    try {
      const [handle] = await window.showOpenFilePicker({
        types: [
          {
            description: "Assembly source files",
            accept: { "text/plain": [".s", ".asm", ".a65", ".txt"] },
          },
        ],
        multiple: false,
      });
      const file = await handle.getFile();
      const text = await file.text();
      this._fileHandle = handle;
      this._applyOpenedFile(file.name, text);
    } catch (err) {
      if (err.name !== "AbortError") {
        this.setStatus("Failed to open file", false);
      }
    }
  }

  /**
   * Save the current source to a file.
   *
   * Save writes back to the file already in use without asking; Save As always
   * asks for a name. Without the distinction there was no way to choose a name
   * at all once a file was in play: the picker only appeared when no handle was
   * held, so the first save claimed the name permanently and opening a file
   * meant never being asked again. The only escape was New, which throws the
   * source away.
   *
   * @param {{saveAs?: boolean}} [options]
   */
  async saveFile({ saveAs = false } = {}) {
    const content = this.textarea.value;
    if (!content.trim()) {
      this.setStatus("Nothing to save", false);
      return;
    }

    // Safari and Firefox don't implement the File System Access API, so
    // window.showSaveFilePicker is undefined there. Fall back to a plain
    // anchor download in that case.
    if (typeof window.showSaveFilePicker !== "function") {
      // A download names the file for you and cannot be declined, so ask first
      // whenever the name is not already settled. Same reasoning as the disk
      // save flow, which asks on these browsers for exactly this reason.
      let filename = this.currentFileName;
      if (saveAs || !filename) {
        filename = await showPrompt(
          "Save assembly source as:",
          filename || "untitled.s",
          "Save",
        );
        if (!filename) return;
      }

      try {
        const blob = new Blob([content], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
        this.currentFileName = filename;
        this.updateTitle(`Assembler - ${filename}`);
        this.setStatus(`Downloaded: ${filename}`, true);
      } catch (err) {
        this.setStatus("Failed to save file", false);
      }
      return;
    }

    try {
      // Save As always asks, even when a handle is held; plain Save only asks
      // when there is nothing to write back to.
      if (saveAs || !this._fileHandle) {
        this._fileHandle = await window.showSaveFilePicker({
          suggestedName: this.currentFileName || "untitled.s",
          types: [
            {
              description: "Assembly source files",
              accept: { "text/plain": [".s", ".asm", ".a65", ".txt"] },
            },
          ],
        });
      }

      const writable = await this._fileHandle.createWritable();
      await writable.write(content);
      await writable.close();

      const filename = this._fileHandle.name;
      this.currentFileName = filename;
      this.updateTitle(`Assembler - ${filename}`);
      this.setStatus(`Saved: ${filename}`, true);
    } catch (err) {
      if (err.name !== "AbortError") {
        this.setStatus("Failed to save file", false);
      }
    }
  }

  /**
   * Update the window title
   */
  updateTitle(title) {
    const titleEl = this.windowElement?.querySelector(".window-title");
    if (titleEl) {
      titleEl.textContent = title;
    }
  }

  setStatus(text, ok) {
    this.statusSpan.textContent = text;
    this.statusSpan.className =
      "asm-status" + (ok ? " asm-status-ok" : " asm-status-error");
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
    const { lineHeight } = this.getLineMetrics();
    const targetScroll =
      (lineNumber - 1) * lineHeight - this.textarea.clientHeight / 2;
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
    const lines = this.textarea.value.split("\n");
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
    ROM_CATEGORIES.forEach((cat) => {
      const opt = document.createElement("option");
      opt.value = cat;
      opt.textContent = cat === "All" ? "All Categories" : cat;
      this.romCategory.appendChild(opt);
    });

    // ROM button click
    this.romBtn.addEventListener("click", () => this.toggleRomPanel());

    // Close button
    this.romPanel
      .querySelector(".asm-rom-close")
      .addEventListener("click", () => {
        this.hideRomPanel();
      });

    // Search input
    this.romSearch.addEventListener("input", () => this.filterRomRoutines());

    // Category filter
    this.romCategory.addEventListener("change", () => this.filterRomRoutines());

    // Back button in detail view
    this.romPanel
      .querySelector(".asm-rom-back")
      .addEventListener("click", () => {
        this.romDetail.classList.add("hidden");
        this.romList.classList.remove("hidden");
      });

    // Insert buttons
    this.romPanel
      .querySelector(".asm-rom-insert-equ")
      .addEventListener("click", () => {
        if (this.selectedRoutine) this.insertRoutineEqu(this.selectedRoutine);
      });
    this.romPanel
      .querySelector(".asm-rom-insert-jsr")
      .addEventListener("click", () => {
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
        routines = routines.filter((r) => r.category === category);
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

    const html = routines
      .map(
        (r) => `
      <div class="asm-rom-item" data-name="${r.name}">
        <div class="asm-rom-item-header">
          <span class="asm-rom-item-name">${r.name}</span>
          <span class="asm-rom-item-addr">$${r.address.toString(16).toUpperCase().padStart(4, "0")}</span>
        </div>
        <div class="asm-rom-item-desc">${r.description}</div>
        <div class="asm-rom-item-cat">${r.category}</div>
      </div>
    `,
      )
      .join("");

    this.romList.innerHTML = html;

    // Add click handlers
    this.romList.querySelectorAll(".asm-rom-item").forEach((item) => {
      item.addEventListener("click", () => {
        const name = item.dataset.name;
        const routine = ROM_ROUTINES.find((r) => r.name === name);
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
            ${routine.inputs
              .map(
                (i) => `
              <div class="asm-rom-param">
                <span class="asm-rom-param-reg">${i.register}</span>
                <span class="asm-rom-param-desc">${i.description}</span>
              </div>
            `,
              )
              .join("")}
          </div>
        </div>
      `;
    }

    if (routine.outputs && routine.outputs.length > 0) {
      html += `
        <div class="asm-rom-section">
          <div class="asm-rom-section-title">Outputs</div>
          <div class="asm-rom-section-content">
            ${routine.outputs
              .map(
                (o) => `
              <div class="asm-rom-param">
                <span class="asm-rom-param-reg">${o.register}</span>
                <span class="asm-rom-param-desc">${o.description}</span>
              </div>
            `,
              )
              .join("")}
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
          <pre class="asm-rom-example">${escapeHtml(routine.example)}</pre>
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
    const hasEqu = this.textarea.value
      .toUpperCase()
      .includes(`${routine.name.toUpperCase()} `);

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
