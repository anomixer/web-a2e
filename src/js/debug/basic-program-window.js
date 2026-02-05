/*
 * basic-program-window.js - BASIC program viewer and editor window
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { BaseWindow } from "../windows/base-window.js";
import { highlightBasicSource } from "../utils/basic-highlighting.js";
import { BasicAutocomplete } from "../utils/basic-autocomplete.js";

export class BasicProgramWindow extends BaseWindow {
  constructor(wasmModule, inputHandler, isRunningCallback) {
    super({
      id: "basic-program",
      title: "BASIC Program",
      defaultWidth: 400,
      defaultHeight: 350,
      minWidth: 300,
      minHeight: 250,
      defaultPosition: { x: 150, y: 150 },
    });
    this.wasmModule = wasmModule;
    this.inputHandler = inputHandler;
    this.isRunningCallback = isRunningCallback;
    this.isPasting = false;
  }

  renderContent() {
    return `
      <div class="basic-program-content">
        <div class="basic-status">
          <span class="basic-lines">0 lines</span>
          <span class="basic-chars">0 chars</span>
        </div>
        <div class="basic-editor-container">
          <div class="basic-line-highlight"></div>
          <pre class="basic-highlight" aria-hidden="true"></pre>
          <textarea class="basic-textarea" placeholder="Paste or type your BASIC program here...

Example:
10 PRINT &quot;HELLO WORLD&quot;
20 GOTO 10" spellcheck="false"></textarea>
        </div>
        <div class="basic-actions">
          <button class="basic-btn basic-insert-btn">Paste into Emulator</button>
          <button class="basic-btn basic-clear-btn">Clear</button>
        </div>
      </div>
    `;
  }

  onContentRendered() {
    this.textarea = this.contentElement.querySelector(".basic-textarea");
    this.highlight = this.contentElement.querySelector(".basic-highlight");
    this.lineHighlight = this.contentElement.querySelector(".basic-line-highlight");
    this.linesSpan = this.contentElement.querySelector(".basic-lines");
    this.charsSpan = this.contentElement.querySelector(".basic-chars");
    this.insertBtn = this.contentElement.querySelector(".basic-insert-btn");
    this.clearBtn = this.contentElement.querySelector(".basic-clear-btn");

    // Sync highlighting on input
    this.textarea.addEventListener("input", () => {
      this.updateHighlighting();
      this.updateStats();
      this.updateCurrentLineHighlight();
    });

    // Sync scroll position
    this.textarea.addEventListener("scroll", () => {
      this.highlight.scrollTop = this.textarea.scrollTop;
      this.highlight.scrollLeft = this.textarea.scrollLeft;
      this.updateCurrentLineHighlight();
    });

    // Track cursor movement
    this.textarea.addEventListener("keydown", () => requestAnimationFrame(() => this.updateCurrentLineHighlight()));
    this.textarea.addEventListener("click", () => this.updateCurrentLineHighlight());
    this.textarea.addEventListener("focus", () => {
      this.lineHighlight.classList.add("visible");
      this.updateCurrentLineHighlight();
    });
    this.textarea.addEventListener("blur", () => {
      this.lineHighlight.classList.remove("visible");
    });

    // Insert/Cancel button
    this.insertBtn.addEventListener("click", () => {
      if (this.isPasting) {
        this.cancelPaste();
      } else {
        this.loadIntoMemory();
      }
    });

    // Clear button
    this.clearBtn.addEventListener("click", () => {
      this.textarea.value = "";
      this.updateHighlighting();
      this.updateStats();
    });

    // Initialize autocomplete
    const editorContainer = this.contentElement.querySelector(
      ".basic-editor-container",
    );
    this.autocomplete = new BasicAutocomplete(this.textarea, editorContainer);

    this.updateHighlighting();
    this.updateStats();
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

  updateHighlighting() {
    const text = this.textarea.value;
    // Add a trailing newline to ensure the highlight container matches textarea height
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

  /**
   * Parse a BASIC program into lines with line numbers and content
   */
  parseProgram(text) {
    const lines = [];
    const rawLines = text.split(/\r?\n/);

    for (const rawLine of rawLines) {
      const trimmed = rawLine.trim().toUpperCase();
      if (!trimmed) continue;

      // Extract line number
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

    // Sort by line number
    lines.sort((a, b) => a.lineNumber - b.lineNumber);
    return lines;
  }

  /**
   * Load the BASIC program by typing it through the emulator's keyboard input.
   * This uses Applesoft's own ROM routines for tokenization, line insertion,
   * pointer management, and interpreter state — guaranteeing correctness.
   */
  loadIntoMemory() {
    // Check if emulator is running
    if (this.isRunningCallback && !this.isRunningCallback()) {
      this.showErrorFeedback("Emulator is off");
      return;
    }

    const text = this.textarea.value;
    if (!text.trim()) return;

    // Parse the program to get valid, sorted lines
    const lines = this.parseProgram(text);
    if (lines.length === 0) {
      console.warn("No valid BASIC lines found");
      return;
    }

    // Build text to type: NEW clears any existing program, then each line
    let inputText = "NEW\r";
    for (const line of lines) {
      if (line.content) {
        inputText += `${line.lineNumber} ${line.content}\r`;
      }
    }

    const lineCount = lines.length;

    // Type through the emulator's keyboard input system at 8x speed
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
      }
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

  /**
   * Show visual feedback that program was loaded
   */
  showLoadedFeedback(lineCount) {
    const originalText = this.insertBtn.textContent;
    this.insertBtn.textContent = `Loaded ${lineCount} lines!`;
    this.insertBtn.classList.add("basic-btn-success");

    setTimeout(() => {
      this.insertBtn.textContent = originalText;
      this.insertBtn.classList.remove("basic-btn-success");
    }, 1500);
  }

  update(wasmModule) {
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
      this.updateStats();
    }
  }
}
