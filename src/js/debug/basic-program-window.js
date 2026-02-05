/*
 * basic-program-window.js - BASIC program editor with integrated debugger
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { BaseWindow } from "../windows/base-window.js";
import { highlightBasicSource } from "../utils/basic-highlighting.js";
import { BasicAutocomplete } from "../utils/basic-autocomplete.js";
import { BasicBreakpointManager } from "./basic-breakpoint-manager.js";
import { BasicVariableInspector } from "./basic-variable-inspector.js";
import { BasicProgramParser } from "./basic-program-parser.js";

export class BasicProgramWindow extends BaseWindow {
  constructor(wasmModule, inputHandler, isRunningCallback) {
    super({
      id: "basic-program",
      title: "BASIC Program",
      defaultWidth: 700,
      defaultHeight: 500,
      minWidth: 550,
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
          <button class="basic-dbg-btn basic-dbg-run" title="Run BASIC program">
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
                <textarea class="basic-textarea" placeholder="Paste or type your BASIC program here...

Example:
10 PRINT &quot;HELLO WORLD&quot;
20 GOTO 10" spellcheck="false"></textarea>
              </div>
            </div>
            <div class="basic-editor-footer">
              <div class="basic-status">
                <span class="basic-lines">0 lines</span>
                <span class="basic-chars">0 chars</span>
              </div>
              <div class="basic-actions">
                <button class="basic-btn basic-insert-btn">Paste into Emulator</button>
                <button class="basic-btn basic-clear-btn">Clear</button>
              </div>
            </div>
          </div>

          <div class="basic-splitter" title="Drag to resize"></div>

          <div class="basic-dbg-sidebar">
            <div class="basic-dbg-var-section">
              <div class="basic-dbg-var-header">Variables</div>
              <div class="basic-dbg-var-panel"></div>
            </div>
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
    this.lineHighlight = this.contentElement.querySelector(".basic-line-highlight");
    this.gutter = this.contentElement.querySelector(".basic-gutter");
    this.linesSpan = this.contentElement.querySelector(".basic-lines");
    this.charsSpan = this.contentElement.querySelector(".basic-chars");
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

    this.textarea.addEventListener("keydown", () =>
      requestAnimationFrame(() => this.updateCurrentLineHighlight())
    );
    this.textarea.addEventListener("click", () =>
      this.updateCurrentLineHighlight()
    );
    this.textarea.addEventListener("focus", () => {
      this.lineHighlight.classList.add("visible");
      this.updateCurrentLineHighlight();
    });
    this.textarea.addEventListener("blur", () => {
      this.lineHighlight.classList.remove("visible");
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

    // Initialize autocomplete
    const editorContainer = this.contentElement.querySelector(".basic-editor-container");
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

    // Splitter for resizable panels
    this.splitter = this.contentElement.querySelector(".basic-splitter");
    this.sidebar = this.contentElement.querySelector(".basic-dbg-sidebar");
    this.editorSection = this.contentElement.querySelector(".basic-editor-section");
    this.setupSplitter();

    this.updateHighlighting();
    this.updateStats();
    this.updateGutter();
    this.renderVariables();
    this.renderBreakpointList();
  }

  setupSplitter() {
    let isDragging = false;
    let startX = 0;
    let startWidth = 0;

    const onMouseDown = (e) => {
      isDragging = true;
      startX = e.clientX;
      startWidth = this.sidebar.offsetWidth;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      e.preventDefault();
    };

    const onMouseMove = (e) => {
      if (!isDragging) return;
      const delta = startX - e.clientX;
      const newWidth = Math.min(Math.max(startWidth + delta, 120), 600);
      this.sidebar.style.width = `${newWidth}px`;
    };

    const onMouseUp = () => {
      if (!isDragging) return;
      isDragging = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      if (this.onStateChange) this.onStateChange();
    };

    this.splitter.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  // ========================================
  // Gutter Methods
  // ========================================

  updateGutter() {
    const text = this.textarea.value;
    const rawLines = text.split(/\r?\n/);
    const state = this.programParser.getExecutionState();

    // Build line map (text line index -> BASIC line number) and gutter HTML
    this.lineMap = [];
    let html = "";

    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i];
      const trimmed = line.trim();
      const match = trimmed.match(/^(\d+)/);
      const lineNumber = match ? parseInt(match[1], 10) : null;

      this.lineMap[i] = lineNumber;

      const hasBp = lineNumber !== null && this.breakpointManager.has(lineNumber);
      const isCurrent = lineNumber !== null && state.currentLine === lineNumber;

      const bpClass = hasBp ? "has-bp" : "";
      const currentClass = isCurrent ? "is-current" : "";
      const clickable = lineNumber !== null ? "clickable" : "";

      // Only show breakpoint marker and current line indicator, not line numbers
      html += `
        <div class="basic-gutter-line ${bpClass} ${currentClass} ${clickable}" data-index="${i}">
          <span class="basic-gutter-bp" data-index="${i}" title="${lineNumber !== null ? `Toggle breakpoint on line ${lineNumber}` : ''}">${hasBp ? "●" : ""}</span>
          <span class="basic-gutter-current">${isCurrent ? "►" : ""}</span>
        </div>
      `;
    }

    // Ensure at least one line for empty editor
    if (rawLines.length === 0) {
      html = '<div class="basic-gutter-line"><span class="basic-gutter-bp"></span><span class="basic-gutter-current"></span></div>';
    }

    this.gutter.innerHTML = html;

    // Add click handlers for breakpoint toggling
    this.gutter.querySelectorAll(".basic-gutter-bp").forEach((bp) => {
      bp.addEventListener("click", (e) => {
        e.stopPropagation();
        const index = parseInt(bp.dataset.index, 10);
        const lineNumber = this.lineMap[index];
        if (lineNumber !== null) {
          this.breakpointManager.toggle(lineNumber);
          this.renderBreakpointList();
        }
      });
    });

    // Click on gutter line also toggles breakpoint
    this.gutter.querySelectorAll(".basic-gutter-line.clickable").forEach((line) => {
      line.addEventListener("click", () => {
        const index = parseInt(line.dataset.index, 10);
        const lineNumber = this.lineMap[index];
        if (lineNumber !== null) {
          this.breakpointManager.toggle(lineNumber);
          this.renderBreakpointList();
        }
      });
    });
  }

  // ========================================
  // Editor Methods
  // ========================================

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

  updateHighlighting() {
    const text = this.textarea.value;
    const highlighted = highlightBasicSource(text, { preserveCase: true });
    this.highlight.innerHTML = highlighted + "\n";
  }

  updateStats() {
    const text = this.textarea.value;
    const lines = text ? text.split(/\r?\n/).filter((l) => l.trim()).length : 0;
    const chars = text.length;

    this.linesSpan.textContent = `${lines} line${lines !== 1 ? "s" : ""}`;
    this.charsSpan.textContent = `${chars} char${chars !== 1 ? "s" : ""}`;
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

  loadIntoMemory() {
    if (this.isRunningCallback && !this.isRunningCallback()) {
      this.showErrorFeedback("Emulator is off");
      return;
    }

    const text = this.textarea.value;
    if (!text.trim()) return;

    const lines = this.parseProgram(text);
    if (lines.length === 0) {
      console.warn("No valid BASIC lines found");
      return;
    }

    let inputText = "NEW\r";
    for (const line of lines) {
      if (line.content) {
        inputText += `${line.lineNumber} ${line.content}\r`;
      }
    }

    const lineCount = lines.length;

    this.inputHandler.queueTextInput(inputText, {
      speedMultiplier: 8,
      onStart: () => {
        this.isPasting = true;
        this.insertBtn.textContent = "Cancel";
        this.insertBtn.classList.add("basic-btn-cancel");
      },
      onComplete: (cancelled) => {
        this.isPasting = false;
        this.insertBtn.classList.remove("basic-btn-cancel");
        if (cancelled) {
          this.showCancelledFeedback();
        } else {
          this.showLoadedFeedback(lineCount);
        }
      },
    });

    console.log(`BASIC program queued for input: ${lines.length} lines`);
  }

  cancelPaste() {
    this.inputHandler.cancelPaste();
  }

  showErrorFeedback(message) {
    const originalText = this.insertBtn.textContent;
    this.insertBtn.textContent = message;
    this.insertBtn.classList.add("basic-btn-error");

    setTimeout(() => {
      this.insertBtn.textContent = originalText;
      this.insertBtn.classList.remove("basic-btn-error");
    }, 1500);
  }

  showCancelledFeedback() {
    this.insertBtn.textContent = "Cancelled";
    this.insertBtn.classList.add("basic-btn-error");

    setTimeout(() => {
      this.insertBtn.textContent = "Paste into Emulator";
      this.insertBtn.classList.remove("basic-btn-error");
    }, 1500);
  }

  showLoadedFeedback(lineCount) {
    const originalText = this.insertBtn.textContent;
    this.insertBtn.textContent = `Loaded ${lineCount} lines!`;
    this.insertBtn.classList.add("basic-btn-success");

    setTimeout(() => {
      this.insertBtn.textContent = originalText;
      this.insertBtn.classList.remove("basic-btn-success");
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
    // Type "RUN" followed by Return
    this.inputHandler.queueTextInput("RUN\r", { speedMultiplier: 8 });
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
    this.wasmModule._setPaused(false);
  }

  /**
   * Step - Execute current BASIC line and stop at next line
   * Uses C++ stepBasicLine() for reliable stepping
   */
  handleStepLine() {
    // Check if BASIC is actually running
    const state = this.programParser.getExecutionState();
    if (!state.running) {
      console.log("BASIC not running (RUNMOD=0), cannot step");
      return;
    }

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
      this.varPanel.innerHTML = '<div class="basic-dbg-empty">No variables</div>';
      return;
    }

    let html = '';

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
            <span class="basic-dbg-var-value">${this.escapeHtml(displayValue)}</span>
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
          <div class="basic-dbg-arr-item ${isExpanded ? 'expanded' : ''}">
            <div class="basic-dbg-arr-header" data-arr-name="${arr.name}">
              <span class="basic-dbg-arr-toggle">${isExpanded ? '▼' : '▶'}</span>
              <span class="basic-dbg-arr-name">${arr.name}(${dimsStr})</span>
              <span class="basic-dbg-arr-info">${arr.totalElements} el</span>
            </div>
            <div class="basic-dbg-arr-body" style="display: ${isExpanded ? 'block' : 'none'}">
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

    // Format a single value
    const formatVal = (v) => {
      if (type === "string") return `"${this.escapeHtml(v)}"`;
      if (type === "integer") return v.toString();
      if (Number.isInteger(v)) return v.toString();
      const abs = Math.abs(v);
      if (abs === 0) return "0";
      if (abs >= 0.01 && abs < 1e6) return v.toPrecision(6).replace(/\.?0+$/, "");
      return v.toExponential(4);
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
      html += '</tr></thead><tbody>';
      for (let r = 0; r < rows; r++) {
        html += `<tr><th>${r}</th>`;
        for (let c = 0; c < cols; c++) {
          const idx = r * cols + c;
          const val = idx < values.length ? formatVal(values[idx]) : "?";
          html += `<td>${val}</td>`;
        }
        html += '</tr>';
      }
      html += '</tbody></table></div>';
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
      this.bpList.innerHTML = '<div class="basic-dbg-empty">No breakpoints</div>';
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
      });
    });
  }

  escapeHtml(text) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  formatHex(value, digits) {
    return value.toString(16).toUpperCase().padStart(digits, "0");
  }

  // ========================================
  // Update Loop
  // ========================================

  update(wasmModule) {
    if (!this.isVisible) return;

    // Throttle updates to 10fps (100ms) to reduce CPU load
    const now = Date.now();
    if (this._lastUpdateTime && now - this._lastUpdateTime < 100) {
      return;
    }
    this._lastUpdateTime = now;

    const state = this.programParser.getExecutionState();
    const isPaused = wasmModule._isPaused();

    // Check for BASIC breakpoint hit (breakpoint or step completion)
    if (isPaused && wasmModule._isBasicBreakpointHit()) {
      const breakLine = wasmModule._getBasicBreakLine();
      this.currentLineNumber = breakLine;
      this.updateGutter();
    }

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

    // Update line/ptr display
    if (state.currentLine !== null) {
      this.lineSpan.textContent = `LINE: ${state.currentLine}`;
    } else {
      this.lineSpan.textContent = "LINE: ---";
    }
    this.ptrSpan.textContent = `PTR: $${this.formatHex(state.txtptr, 4)}`;

    // Check if current line changed and update gutter
    if (state.currentLine !== this.currentLineNumber) {
      this.currentLineNumber = state.currentLine;
      this.updateGutter();
    }

    // Only update variables when we transition to paused state
    // This prevents constant re-rendering from interfering with click interactions
    // The click handler for array expand/collapse calls renderVariables() explicitly
    if (isPaused && !this._lastPausedState) {
      this.renderVariables();
    }
    this._lastPausedState = isPaused;
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
  }
}
