/**
 * BasicProgramWindow - Window for loading BASIC programs directly into memory
 */
import { DebugWindow } from "./DebugWindow.js";
import { tokenizeLine, BASIC_POINTERS } from "../utils/basic-tokens.js";
import { highlightBasicSource } from "../utils/basic-highlighting.js";
import { BasicAutocomplete } from "../utils/basic-autocomplete.js";

export class BasicProgramWindow extends DebugWindow {
  constructor(wasmModule, inputHandler) {
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
  }

  renderContent() {
    return `
      <div class="basic-program-content">
        <div class="basic-status">
          <span class="basic-lines">0 lines</span>
          <span class="basic-chars">0 chars</span>
        </div>
        <div class="basic-editor-container">
          <pre class="basic-highlight" aria-hidden="true"></pre>
          <textarea class="basic-textarea" placeholder="Paste or type your BASIC program here...

Example:
10 PRINT &quot;HELLO WORLD&quot;
20 GOTO 10" spellcheck="false"></textarea>
        </div>
        <div class="basic-actions">
          <button class="basic-btn basic-insert-btn">Load into Memory</button>
          <button class="basic-btn basic-clear-btn">Clear</button>
        </div>
      </div>
    `;
  }

  onContentRendered() {
    this.textarea = this.contentElement.querySelector(".basic-textarea");
    this.highlight = this.contentElement.querySelector(".basic-highlight");
    this.linesSpan = this.contentElement.querySelector(".basic-lines");
    this.charsSpan = this.contentElement.querySelector(".basic-chars");
    this.insertBtn = this.contentElement.querySelector(".basic-insert-btn");
    this.clearBtn = this.contentElement.querySelector(".basic-clear-btn");

    // Sync highlighting on input
    this.textarea.addEventListener("input", () => {
      this.updateHighlighting();
      this.updateStats();
    });

    // Sync scroll position
    this.textarea.addEventListener("scroll", () => {
      this.highlight.scrollTop = this.textarea.scrollTop;
      this.highlight.scrollLeft = this.textarea.scrollLeft;
    });

    // Insert button
    this.insertBtn.addEventListener("click", () => {
      this.loadIntoMemory();
    });

    // Clear button
    this.clearBtn.addEventListener("click", () => {
      this.textarea.value = "";
      this.updateHighlighting();
      this.updateStats();
    });

    // Initialize autocomplete
    const editorContainer = this.contentElement.querySelector(".basic-editor-container");
    this.autocomplete = new BasicAutocomplete(this.textarea, editorContainer);

    this.updateHighlighting();
    this.updateStats();
  }

  updateHighlighting() {
    const text = this.textarea.value;
    // Add a trailing newline to ensure the highlight container matches textarea height
    const highlighted = highlightBasicSource(text, { preserveCase: true });
    this.highlight.innerHTML = highlighted + "\n";
  }

  updateStats() {
    const text = this.textarea.value;
    const lines = text ? text.split(/\r?\n/).filter(l => l.trim()).length : 0;
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
   * Load the BASIC program directly into memory
   */
  loadIntoMemory() {
    const text = this.textarea.value;
    if (!text.trim()) return;

    // Parse the program
    const lines = this.parseProgram(text);
    if (lines.length === 0) {
      console.warn("No valid BASIC lines found");
      return;
    }

    // Get the program start address from TXTTAB (usually $0801)
    const progStart = this.readWord(BASIC_POINTERS.TXTTAB);
    let addr = progStart;

    // First pass: calculate all line addresses
    const lineAddresses = [];
    let tempAddr = progStart;
    for (const line of lines) {
      lineAddresses.push(tempAddr);
      const tokenized = tokenizeLine(line.content);
      // 2 (next-ptr) + 2 (line-num) + content + 1 (terminator)
      tempAddr += 4 + tokenized.length + 1;
    }
    // Address of end marker
    const endMarkerAddr = tempAddr;

    // Second pass: write the program
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const tokenized = tokenizeLine(line.content);

      // Next line pointer: points to next line, or to end marker for last line
      const nextAddr = (i < lines.length - 1) ? lineAddresses[i + 1] : endMarkerAddr;
      this.writeWord(addr, nextAddr);
      addr += 2;

      // Write line number
      this.writeWord(addr, line.lineNumber);
      addr += 2;

      // Write tokenized content
      for (const byte of tokenized) {
        this.wasmModule._writeMemory(addr, byte);
        addr++;
      }

      // Write line terminator
      this.wasmModule._writeMemory(addr, 0x00);
      addr++;
    }

    // Write end-of-program marker ($0000)
    this.writeWord(addr, 0x0000);
    addr += 2;

    // Update Applesoft pointers - VARTAB points after the end marker
    this.writeWord(BASIC_POINTERS.VARTAB, addr);
    this.writeWord(BASIC_POINTERS.ARYTAB, addr);
    this.writeWord(BASIC_POINTERS.STREND, addr);

    console.log(`BASIC program loaded: ${lines.length} lines, ${addr - progStart} bytes at $${progStart.toString(16).toUpperCase()}`);

    // Visual feedback
    this.showLoadedFeedback(lines.length);
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

  /**
   * Read a 16-bit word from memory (little-endian)
   */
  readWord(addr) {
    const lo = this.wasmModule._readMemory(addr);
    const hi = this.wasmModule._readMemory(addr + 1);
    return lo | (hi << 8);
  }

  /**
   * Write a 16-bit word to memory (little-endian)
   */
  writeWord(addr, value) {
    this.wasmModule._writeMemory(addr, value & 0xFF);
    this.wasmModule._writeMemory(addr + 1, (value >> 8) & 0xFF);
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
