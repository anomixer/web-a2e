/**
 * Applesoft BASIC Autocomplete
 * Provides IntelliSense-like autocomplete for the BASIC editor
 */

import { APPLESOFT_TOKENS } from "./basic-tokens.js";

// Keywords with their syntax hints and categories
const KEYWORD_INFO = {
  // Control Flow
  "END": { syntax: "END", category: "control", desc: "End program execution" },
  "FOR": { syntax: "FOR var = start TO end [STEP n]", category: "control", desc: "Start FOR loop" },
  "NEXT": { syntax: "NEXT [var]", category: "control", desc: "End FOR loop" },
  "IF": { syntax: "IF expr THEN statement", category: "control", desc: "Conditional execution" },
  "THEN": { syntax: "THEN statement", category: "control", desc: "Part of IF statement" },
  "GOTO": { syntax: "GOTO linenum", category: "control", desc: "Jump to line" },
  "GOSUB": { syntax: "GOSUB linenum", category: "control", desc: "Call subroutine" },
  "RETURN": { syntax: "RETURN", category: "control", desc: "Return from subroutine" },
  "ON": { syntax: "ON expr GOTO/GOSUB line1,line2,...", category: "control", desc: "Computed branch" },
  "STOP": { syntax: "STOP", category: "control", desc: "Stop execution" },
  "CONT": { syntax: "CONT", category: "control", desc: "Continue after STOP" },
  "RUN": { syntax: "RUN [linenum]", category: "control", desc: "Run program" },
  "ONERR": { syntax: "ONERR GOTO linenum", category: "control", desc: "Error handler" },
  "RESUME": { syntax: "RESUME", category: "control", desc: "Resume after error" },
  "POP": { syntax: "POP", category: "control", desc: "Pop GOSUB return address" },

  // I/O
  "PRINT": { syntax: "PRINT [expr][;,][expr]...", category: "io", desc: "Print to screen" },
  "INPUT": { syntax: "INPUT [\"prompt\";]var[,var]...", category: "io", desc: "Get user input" },
  "GET": { syntax: "GET var", category: "io", desc: "Get single keypress" },
  "HOME": { syntax: "HOME", category: "io", desc: "Clear screen" },
  "HTAB": { syntax: "HTAB col", category: "io", desc: "Set horizontal position" },
  "VTAB": { syntax: "VTAB row", category: "io", desc: "Set vertical position" },
  "INVERSE": { syntax: "INVERSE", category: "io", desc: "Inverse text mode" },
  "NORMAL": { syntax: "NORMAL", category: "io", desc: "Normal text mode" },
  "FLASH": { syntax: "FLASH", category: "io", desc: "Flashing text mode" },
  "TEXT": { syntax: "TEXT", category: "io", desc: "Text mode" },
  "PR#": { syntax: "PR# slot", category: "io", desc: "Output to slot" },
  "IN#": { syntax: "IN# slot", category: "io", desc: "Input from slot" },
  "TAB(": { syntax: "TAB(col)", category: "io", desc: "Tab to column" },
  "SPC(": { syntax: "SPC(n)", category: "io", desc: "Print n spaces" },
  "POS": { syntax: "POS(0)", category: "io", desc: "Current cursor column" },

  // Lo-res Graphics
  "GR": { syntax: "GR", category: "lores", desc: "Lo-res graphics mode" },
  "COLOR=": { syntax: "COLOR= n", category: "lores", desc: "Set lo-res color (0-15)" },
  "PLOT": { syntax: "PLOT x,y", category: "lores", desc: "Plot lo-res point" },
  "HLIN": { syntax: "HLIN x1,x2 AT y", category: "lores", desc: "Draw horizontal line" },
  "VLIN": { syntax: "VLIN y1,y2 AT x", category: "lores", desc: "Draw vertical line" },
  "SCRN(": { syntax: "SCRN(x,y)", category: "lores", desc: "Get color at point" },

  // Hi-res Graphics
  "HGR": { syntax: "HGR", category: "hires", desc: "Hi-res page 1" },
  "HGR2": { syntax: "HGR2", category: "hires", desc: "Hi-res page 2" },
  "HCOLOR=": { syntax: "HCOLOR= n", category: "hires", desc: "Set hi-res color (0-7)" },
  "HPLOT": { syntax: "HPLOT x,y [TO x2,y2]...", category: "hires", desc: "Plot/draw hi-res" },
  "DRAW": { syntax: "DRAW shape AT x,y", category: "hires", desc: "Draw shape" },
  "XDRAW": { syntax: "XDRAW shape AT x,y", category: "hires", desc: "XOR draw shape" },
  "ROT=": { syntax: "ROT= angle", category: "hires", desc: "Set shape rotation" },
  "SCALE=": { syntax: "SCALE= n", category: "hires", desc: "Set shape scale" },
  "SHLOAD": { syntax: "SHLOAD", category: "hires", desc: "Load shape table" },

  // Variables & Data
  "LET": { syntax: "LET var = expr", category: "vars", desc: "Assign variable" },
  "DIM": { syntax: "DIM var(size)[,var(size)]...", category: "vars", desc: "Dimension array" },
  "DATA": { syntax: "DATA value,value,...", category: "vars", desc: "Define data" },
  "READ": { syntax: "READ var[,var]...", category: "vars", desc: "Read DATA values" },
  "RESTORE": { syntax: "RESTORE", category: "vars", desc: "Reset DATA pointer" },
  "DEF": { syntax: "DEF FN name(var) = expr", category: "vars", desc: "Define function" },
  "FN": { syntax: "FN name(expr)", category: "vars", desc: "Call user function" },
  "CLEAR": { syntax: "CLEAR", category: "vars", desc: "Clear variables" },
  "NEW": { syntax: "NEW", category: "vars", desc: "Clear program" },

  // Math Functions
  "ABS": { syntax: "ABS(n)", category: "math", desc: "Absolute value" },
  "SGN": { syntax: "SGN(n)", category: "math", desc: "Sign (-1,0,1)" },
  "INT": { syntax: "INT(n)", category: "math", desc: "Integer part" },
  "SQR": { syntax: "SQR(n)", category: "math", desc: "Square root" },
  "RND": { syntax: "RND(n)", category: "math", desc: "Random number" },
  "SIN": { syntax: "SIN(n)", category: "math", desc: "Sine" },
  "COS": { syntax: "COS(n)", category: "math", desc: "Cosine" },
  "TAN": { syntax: "TAN(n)", category: "math", desc: "Tangent" },
  "ATN": { syntax: "ATN(n)", category: "math", desc: "Arctangent" },
  "LOG": { syntax: "LOG(n)", category: "math", desc: "Natural log" },
  "EXP": { syntax: "EXP(n)", category: "math", desc: "e^n" },

  // String Functions
  "LEN": { syntax: "LEN(str$)", category: "string", desc: "String length" },
  "LEFT$": { syntax: "LEFT$(str$,n)", category: "string", desc: "Left n chars" },
  "RIGHT$": { syntax: "RIGHT$(str$,n)", category: "string", desc: "Right n chars" },
  "MID$": { syntax: "MID$(str$,start[,len])", category: "string", desc: "Substring" },
  "STR$": { syntax: "STR$(n)", category: "string", desc: "Number to string" },
  "VAL": { syntax: "VAL(str$)", category: "string", desc: "String to number" },
  "ASC": { syntax: "ASC(str$)", category: "string", desc: "ASCII code" },
  "CHR$": { syntax: "CHR$(n)", category: "string", desc: "ASCII to char" },

  // Memory & System
  "PEEK": { syntax: "PEEK(addr)", category: "system", desc: "Read memory byte" },
  "POKE": { syntax: "POKE addr,value", category: "system", desc: "Write memory byte" },
  "CALL": { syntax: "CALL addr", category: "system", desc: "Call machine code" },
  "USR": { syntax: "USR(n)", category: "system", desc: "Call user routine" },
  "WAIT": { syntax: "WAIT addr,mask[,xor]", category: "system", desc: "Wait for memory" },
  "HIMEM:": { syntax: "HIMEM: addr", category: "system", desc: "Set memory top" },
  "LOMEM:": { syntax: "LOMEM: addr", category: "system", desc: "Set variables start" },
  "FRE": { syntax: "FRE(0)", category: "system", desc: "Free memory" },
  "PDL": { syntax: "PDL(n)", category: "system", desc: "Read paddle (0-255)" },
  "SPEED=": { syntax: "SPEED= n", category: "system", desc: "Set output speed" },

  // File I/O
  "LOAD": { syntax: "LOAD", category: "file", desc: "Load from tape" },
  "SAVE": { syntax: "SAVE", category: "file", desc: "Save to tape" },
  "STORE": { syntax: "STORE", category: "file", desc: "Store array" },
  "RECALL": { syntax: "RECALL", category: "file", desc: "Recall array" },

  // Other
  "REM": { syntax: "REM comment", category: "other", desc: "Comment" },
  "LIST": { syntax: "LIST [start[-end]]", category: "other", desc: "List program" },
  "DEL": { syntax: "DEL start,end", category: "other", desc: "Delete lines" },
  "TRACE": { syntax: "TRACE", category: "other", desc: "Enable tracing" },
  "NOTRACE": { syntax: "NOTRACE", category: "other", desc: "Disable tracing" },
  "&": { syntax: "& [params]", category: "other", desc: "Machine language hook" },

  // Operators
  "TO": { syntax: "TO", category: "operator", desc: "Range separator" },
  "STEP": { syntax: "STEP n", category: "operator", desc: "Loop increment" },
  "AT": { syntax: "AT", category: "operator", desc: "Position specifier" },
  "AND": { syntax: "expr AND expr", category: "operator", desc: "Logical AND" },
  "OR": { syntax: "expr OR expr", category: "operator", desc: "Logical OR" },
  "NOT": { syntax: "NOT expr", category: "operator", desc: "Logical NOT" },
};

// Category display names and order
const CATEGORIES = {
  control: "Control",
  io: "I/O",
  lores: "Lo-Res",
  hires: "Hi-Res",
  vars: "Variables",
  math: "Math",
  string: "Strings",
  system: "System",
  file: "File",
  other: "Other",
  operator: "Operator",
};

// Build list of autocomplete keywords (exclude single-char operators)
const AUTOCOMPLETE_KEYWORDS = APPLESOFT_TOKENS
  .filter(k => k && k.length > 1 && !/^[+\-*/^<>=]$/.test(k))
  .map(keyword => {
    const info = KEYWORD_INFO[keyword] || {
      syntax: keyword,
      category: "other",
      desc: ""
    };
    return {
      keyword,
      ...info,
      categoryName: CATEGORIES[info.category] || "Other",
    };
  })
  .sort((a, b) => a.keyword.localeCompare(b.keyword));

/**
 * BasicAutocomplete - Handles autocomplete UI and logic
 */
export class BasicAutocomplete {
  constructor(textarea, container) {
    this.textarea = textarea;
    this.container = container;
    this.dropdown = null;
    this.selectedIndex = 0;
    this.matches = [];
    this.isVisible = false;
    this.currentWord = "";
    this.wordStart = 0;
    this.isInserting = false; // Flag to prevent re-triggering on insert

    this.createDropdown();
    this.bindEvents();
  }

  /**
   * Create the autocomplete dropdown element
   */
  createDropdown() {
    this.dropdown = document.createElement("div");
    this.dropdown.className = "basic-autocomplete-dropdown";
    this.dropdown.innerHTML = `
      <div class="autocomplete-list"></div>
      <div class="autocomplete-hint"></div>
    `;
    this.container.appendChild(this.dropdown);

    this.listEl = this.dropdown.querySelector(".autocomplete-list");
    this.hintEl = this.dropdown.querySelector(".autocomplete-hint");
  }

  /**
   * Bind event listeners
   */
  bindEvents() {
    // Handle input changes - use a named function so we can identify it
    this.boundOnInput = () => {
      if (this.isInserting) return; // Skip if we're inserting
      this.onInput();
    };
    this.textarea.addEventListener("input", this.boundOnInput);

    // Handle keyboard navigation - use capture phase to intercept before other handlers
    this.boundOnKeyDown = (e) => this.onKeyDown(e);
    this.textarea.addEventListener("keydown", this.boundOnKeyDown, true);

    // Hide on blur (with delay to allow click on dropdown)
    this.textarea.addEventListener("blur", () => {
      setTimeout(() => this.hide(), 200);
    });

    // Handle click on dropdown item
    this.listEl.addEventListener("mousedown", (e) => {
      // Use mousedown instead of click to fire before blur
      e.preventDefault(); // Prevent blur
      const item = e.target.closest(".autocomplete-item");
      if (item) {
        const index = parseInt(item.dataset.index, 10);
        this.selectedIndex = index;
        this.insertSelected();
      }
    });

    // Handle hover on dropdown item
    this.listEl.addEventListener("mouseover", (e) => {
      const item = e.target.closest(".autocomplete-item");
      if (item) {
        const index = parseInt(item.dataset.index, 10);
        this.selectItem(index);
      }
    });
  }

  /**
   * Handle input changes
   */
  onInput() {
    const { word, start, valid } = this.getCurrentWord();

    if (valid && word.length >= 2) {
      this.currentWord = word;
      this.wordStart = start;
      this.updateMatches(word);

      if (this.matches.length > 0) {
        this.show();
        this.render();
      } else {
        this.hide();
      }
    } else {
      this.hide();
    }
  }

  /**
   * Get the current word being typed
   */
  getCurrentWord() {
    const pos = this.textarea.selectionStart;
    const text = this.textarea.value;

    // Find word start (go back until we hit a non-word character)
    let start = pos;
    while (start > 0) {
      const char = text[start - 1];
      // Word characters for BASIC: letters, numbers, $
      if (/[A-Za-z0-9$]/.test(char)) {
        start--;
      } else {
        break;
      }
    }

    // Check if we're inside a string (don't autocomplete)
    const lineStart = text.lastIndexOf('\n', start - 1) + 1;
    const lineToStart = text.substring(lineStart, start);
    const quoteCount = (lineToStart.match(/"/g) || []).length;
    if (quoteCount % 2 !== 0) {
      return { word: "", start: pos, valid: false };
    }

    // Check if the character before the word is valid for starting autocomplete
    // (space, colon, operator, or start of line)
    if (start > 0 && start > lineStart) {
      const prevChar = text[start - 1];
      if (/[A-Za-z0-9$]/.test(prevChar)) {
        // Previous char is alphanumeric - we're in the middle of something
        return { word: "", start: pos, valid: false };
      }
    }

    const word = text.substring(start, pos).toUpperCase();
    return { word, start, valid: true };
  }

  /**
   * Update matches based on typed word
   */
  updateMatches(word) {
    const upperWord = word.toUpperCase();

    // Filter keywords that start with the typed text
    this.matches = AUTOCOMPLETE_KEYWORDS.filter(item =>
      item.keyword.startsWith(upperWord)
    ).slice(0, 10); // Limit to 10 matches

    this.selectedIndex = 0;
  }

  /**
   * Handle keyboard events
   */
  onKeyDown(e) {
    if (!this.isVisible) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        e.stopPropagation();
        this.selectItem(this.selectedIndex + 1);
        break;

      case "ArrowUp":
        e.preventDefault();
        e.stopPropagation();
        this.selectItem(this.selectedIndex - 1);
        break;

      case "Tab":
        if (this.matches.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          this.insertSelected();
        }
        break;

      case "Enter":
        if (this.matches.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          this.insertSelected();
        }
        break;

      case "Escape":
        e.preventDefault();
        e.stopPropagation();
        this.hide();
        break;
    }
  }

  /**
   * Select an item by index
   */
  selectItem(index) {
    if (this.matches.length === 0) return;

    // Wrap around
    if (index < 0) index = this.matches.length - 1;
    if (index >= this.matches.length) index = 0;

    this.selectedIndex = index;
    this.render();
  }

  /**
   * Insert the selected keyword
   */
  insertSelected() {
    if (this.matches.length === 0) return;

    const selected = this.matches[this.selectedIndex];
    const text = this.textarea.value;
    const pos = this.textarea.selectionStart;

    // Replace the current word with the selected keyword
    const before = text.substring(0, this.wordStart);
    const after = text.substring(pos);

    // Set flag to prevent re-triggering autocomplete
    this.isInserting = true;

    this.textarea.value = before + selected.keyword + after;

    // Position cursor after inserted keyword
    const newPos = this.wordStart + selected.keyword.length;
    this.textarea.selectionStart = newPos;
    this.textarea.selectionEnd = newPos;

    this.hide();

    // Trigger input event for highlighting update
    this.textarea.dispatchEvent(new Event("input", { bubbles: true }));

    // Clear flag after a small delay
    setTimeout(() => {
      this.isInserting = false;
    }, 10);

    this.textarea.focus();
  }

  /**
   * Render the dropdown
   */
  render() {
    // Render list items
    this.listEl.innerHTML = this.matches.map((item, index) => `
      <div class="autocomplete-item${index === this.selectedIndex ? " selected" : ""}" data-index="${index}">
        <span class="autocomplete-keyword">${this.highlightMatch(item.keyword)}</span>
        <span class="autocomplete-category">${item.categoryName}</span>
      </div>
    `).join("");

    // Render hint for selected item
    if (this.matches.length > 0) {
      const selected = this.matches[this.selectedIndex];
      this.hintEl.innerHTML = `
        <div class="hint-syntax">${selected.syntax}</div>
        <div class="hint-desc">${selected.desc}</div>
      `;
      this.hintEl.style.display = "block";
    } else {
      this.hintEl.style.display = "none";
    }

    // Scroll selected item into view
    const selectedEl = this.listEl.querySelector(".selected");
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: "nearest" });
    }
  }

  /**
   * Highlight the matching part of the keyword
   */
  highlightMatch(keyword) {
    const matchLen = this.currentWord.length;
    const matched = keyword.substring(0, matchLen);
    const rest = keyword.substring(matchLen);
    return `<span class="match">${matched}</span>${rest}`;
  }

  /**
   * Show the dropdown
   */
  show() {
    if (this.isVisible) return;

    this.isVisible = true;
    this.dropdown.classList.add("visible");
    this.positionDropdown();
  }

  /**
   * Hide the dropdown
   */
  hide() {
    if (!this.isVisible) return;
    this.isVisible = false;
    this.dropdown.classList.remove("visible");
  }

  /**
   * Position the dropdown near the cursor
   * Uses a simpler approach - position at bottom of textarea, aligned left
   */
  positionDropdown() {
    // Simple positioning: below the textarea at the left
    // This avoids complex cursor position calculations
    const textareaRect = this.textarea.getBoundingClientRect();
    const containerRect = this.container.getBoundingClientRect();

    // Calculate approximate cursor position based on text
    const text = this.textarea.value.substring(0, this.textarea.selectionStart);
    const lines = text.split('\n');
    const currentLine = lines.length - 1;
    const currentCol = lines[lines.length - 1].length;

    // Approximate character dimensions (monospace font)
    const charWidth = 7.2; // Approximate for 12px monospace
    const lineHeight = 18; // Approximate line height

    // Calculate position
    let left = currentCol * charWidth;
    let top = (currentLine + 1) * lineHeight - this.textarea.scrollTop;

    // Constrain to container bounds
    const dropdownWidth = 260;
    const dropdownHeight = 280;

    if (left + dropdownWidth > this.container.clientWidth - 10) {
      left = this.container.clientWidth - dropdownWidth - 10;
    }
    left = Math.max(5, left);

    // If dropdown would go below container, show it above the cursor
    if (top + dropdownHeight > this.container.clientHeight) {
      top = Math.max(5, top - dropdownHeight - lineHeight);
    }

    this.dropdown.style.left = left + "px";
    this.dropdown.style.top = top + "px";
  }

  /**
   * Clean up
   */
  destroy() {
    if (this.boundOnInput) {
      this.textarea.removeEventListener("input", this.boundOnInput);
    }
    if (this.boundOnKeyDown) {
      this.textarea.removeEventListener("keydown", this.boundOnKeyDown, true);
    }
    if (this.dropdown && this.dropdown.parentNode) {
      this.dropdown.parentNode.removeChild(this.dropdown);
    }
  }
}
