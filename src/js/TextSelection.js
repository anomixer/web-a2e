/**
 * TextSelection - Enable text selection and copying from the Apple II screen
 *
 * Handles mouse selection on the canvas and converts screen memory to text.
 */

// Apple II text screen row base addresses (non-linear layout)
const TEXT_ROW_BASES = [
  0x400, 0x480, 0x500, 0x580, 0x600, 0x680, 0x700, 0x780,
  0x428, 0x4A8, 0x528, 0x5A8, 0x628, 0x6A8, 0x728, 0x7A8,
  0x450, 0x4D0, 0x550, 0x5D0, 0x650, 0x6D0, 0x750, 0x7D0
];

// Page 2 offset
const PAGE2_OFFSET = 0x400;

export class TextSelection {
  constructor(canvas, wasmModule) {
    this.canvas = canvas;
    this.wasmModule = wasmModule;

    // Selection state
    this.isSelecting = false;
    this.selectionStart = null;  // {row, col}
    this.selectionEnd = null;    // {row, col}

    // Overlay canvas for selection highlight
    this.overlay = null;
    this.overlayCtx = null;

    // Screen dimensions
    this.charWidth40 = 14;   // 40-col: 14 pixels per char (7 * 2)
    this.charWidth80 = 7;    // 80-col: 7 pixels per char
    this.charHeight = 16;    // 16 pixels per char (8 * 2)
    this.rows = 24;

    this.setupOverlay();
    this.setupEventListeners();
  }

  setupOverlay() {
    // Create overlay canvas positioned over the main canvas
    this.overlay = document.createElement('canvas');
    this.overlay.className = 'text-selection-overlay';
    this.overlay.width = 560;
    this.overlay.height = 384;
    this.overlay.style.cssText = `
      position: absolute;
      pointer-events: none;
      z-index: 5;
    `;

    // Insert overlay into the screen wrapper
    const wrapper = this.canvas.parentElement;
    if (wrapper) {
      wrapper.style.position = 'relative';
      wrapper.appendChild(this.overlay);
    }

    this.overlayCtx = this.overlay.getContext('2d');

    // Initial positioning
    this.resize();
  }

  setupEventListeners() {
    // Mouse events on the main canvas
    this.canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
    this.canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
    this.canvas.addEventListener('mouseup', this.onMouseUp.bind(this));
    this.canvas.addEventListener('mouseleave', this.onMouseLeave.bind(this));

    // Keyboard for copy
    document.addEventListener('keydown', this.onKeyDown.bind(this));

    // Context menu for copy option
    this.canvas.addEventListener('contextmenu', this.onContextMenu.bind(this));
  }

  /**
   * Check if the emulator is in text mode
   */
  isTextMode() {
    if (!this.wasmModule._getSoftSwitchState) return false;

    const state = this.wasmModule._getSoftSwitchState();
    // Bit 0: TEXT mode (1 = text, 0 = graphics)
    const textMode = (state & 0x01) !== 0;
    return textMode;
  }

  /**
   * Check if 80-column mode is active
   */
  is80ColumnMode() {
    if (!this.wasmModule._getSoftSwitchState) return false;

    const state = this.wasmModule._getSoftSwitchState();
    // Bit 4: 80COL mode
    const col80 = (state & 0x10) !== 0;
    return col80;
  }

  /**
   * Check if page 2 is active
   */
  isPage2() {
    if (!this.wasmModule._getSoftSwitchState) return false;

    const state = this.wasmModule._getSoftSwitchState();
    // Bit 3: PAGE2
    const page2 = (state & 0x08) !== 0;
    return page2;
  }

  /**
   * Convert canvas pixel coordinates to character position
   */
  pixelToChar(x, y) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = 560 / rect.width;
    const scaleY = 384 / rect.height;

    const canvasX = (x - rect.left) * scaleX;
    const canvasY = (y - rect.top) * scaleY;

    const cols = this.is80ColumnMode() ? 80 : 40;
    const charWidth = this.is80ColumnMode() ? this.charWidth80 : this.charWidth40;

    const col = Math.floor(canvasX / charWidth);
    const row = Math.floor(canvasY / this.charHeight);

    return {
      row: Math.max(0, Math.min(this.rows - 1, row)),
      col: Math.max(0, Math.min(cols - 1, col))
    };
  }

  /**
   * Get the screen memory address for a character position
   */
  getScreenAddress(row, col, isAux = false) {
    const baseAddr = TEXT_ROW_BASES[row];
    const page2Offset = this.isPage2() ? PAGE2_OFFSET : 0;
    return baseAddr + page2Offset + col;
  }

  /**
   * Read a character from screen memory
   */
  readScreenChar(row, col) {
    if (this.is80ColumnMode()) {
      // 80-column mode: even columns in aux, odd in main
      const memCol = Math.floor(col / 2);
      const isAux = (col % 2) === 0;
      const addr = this.getScreenAddress(row, memCol);

      // Use peekAuxMemory for auxiliary memory, peekMemory for main
      if (isAux) {
        return this.wasmModule._peekAuxMemory(addr);
      } else {
        return this.wasmModule._peekMemory(addr);
      }
    } else {
      const addr = this.getScreenAddress(row, col);
      return this.wasmModule._peekMemory(addr);
    }
  }

  /**
   * Convert Apple II character code to ASCII/Unicode
   */
  charToAscii(code) {
    // Apple II character code mapping
    if (code < 0x20) {
      // $00-$1F: Inverse uppercase @ A-Z [ \ ] ^ _
      return code + 0x40;
    } else if (code < 0x40) {
      // $20-$3F: Inverse symbols/digits (space, !"#$%&'()*+,-./0-9:;<=>?)
      return code;
    } else if (code < 0x60) {
      // $40-$5F: Flash uppercase (same as inverse)
      return code;
    } else if (code < 0x80) {
      // $60-$7F: Flash symbols
      return code - 0x40;
    } else if (code < 0xA0) {
      // $80-$9F: Normal uppercase
      return code - 0x40;
    } else if (code < 0xC0) {
      // $A0-$BF: Normal symbols
      return code - 0x80;
    } else if (code < 0xE0) {
      // $C0-$DF: Normal uppercase (alternate)
      return code - 0x80;
    } else {
      // $E0-$FF: Normal lowercase
      return code - 0x80;
    }
  }

  /**
   * Get selected text as a string
   */
  getSelectedText() {
    if (!this.selectionStart || !this.selectionEnd) return '';
    if (!this.isTextMode()) return '';

    const cols = this.is80ColumnMode() ? 80 : 40;

    // Normalize selection (ensure start is before end)
    let startRow = this.selectionStart.row;
    let startCol = this.selectionStart.col;
    let endRow = this.selectionEnd.row;
    let endCol = this.selectionEnd.col;

    if (startRow > endRow || (startRow === endRow && startCol > endCol)) {
      [startRow, endRow] = [endRow, startRow];
      [startCol, endCol] = [endCol, startCol];
    }

    let text = '';

    for (let row = startRow; row <= endRow; row++) {
      const colStart = (row === startRow) ? startCol : 0;
      const colEnd = (row === endRow) ? endCol : cols - 1;

      let line = '';
      for (let col = colStart; col <= colEnd; col++) {
        const charCode = this.readScreenChar(row, col);
        const ascii = this.charToAscii(charCode);
        line += String.fromCharCode(ascii);
      }

      // Trim trailing spaces from each line
      line = line.trimEnd();

      text += line;
      if (row < endRow) {
        text += '\n';
      }
    }

    return text;
  }

  /**
   * Copy selected text to clipboard
   */
  async copyToClipboard() {
    const text = this.getSelectedText();
    if (!text) return false;

    try {
      await navigator.clipboard.writeText(text);
      this.showCopyFeedback();
      return true;
    } catch (err) {
      console.error('Failed to copy text:', err);
      return false;
    }
  }

  /**
   * Show visual feedback when text is copied
   */
  showCopyFeedback() {
    // Flash the selection briefly
    const ctx = this.overlayCtx;
    ctx.fillStyle = 'rgba(63, 185, 80, 0.5)';
    this.drawSelectionHighlight();

    setTimeout(() => {
      this.drawSelectionHighlight();
    }, 150);
  }

  /**
   * Draw the selection highlight on the overlay
   */
  drawSelectionHighlight() {
    const ctx = this.overlayCtx;
    ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);

    if (!this.selectionStart || !this.selectionEnd) return;
    if (!this.isTextMode()) return;

    const cols = this.is80ColumnMode() ? 80 : 40;
    const charWidth = this.is80ColumnMode() ? this.charWidth80 : this.charWidth40;

    // Normalize selection
    let startRow = this.selectionStart.row;
    let startCol = this.selectionStart.col;
    let endRow = this.selectionEnd.row;
    let endCol = this.selectionEnd.col;

    if (startRow > endRow || (startRow === endRow && startCol > endCol)) {
      [startRow, endRow] = [endRow, startRow];
      [startCol, endCol] = [endCol, startCol];
    }

    ctx.fillStyle = 'rgba(88, 166, 255, 0.35)';

    for (let row = startRow; row <= endRow; row++) {
      const colStart = (row === startRow) ? startCol : 0;
      const colEnd = (row === endRow) ? endCol : cols - 1;

      const x = colStart * charWidth;
      const y = row * this.charHeight;
      const width = (colEnd - colStart + 1) * charWidth;
      const height = this.charHeight;

      ctx.fillRect(x, y, width, height);
    }
  }

  /**
   * Clear the selection
   */
  clearSelection() {
    this.selectionStart = null;
    this.selectionEnd = null;
    this.isSelecting = false;

    if (this.overlayCtx) {
      this.overlayCtx.clearRect(0, 0, this.overlay.width, this.overlay.height);
    }
  }

  // Event handlers

  onMouseDown(e) {
    if (!this.isTextMode()) return;
    if (e.button !== 0) return; // Left click only

    const pos = this.pixelToChar(e.clientX, e.clientY);
    this.selectionStart = pos;
    this.selectionEnd = pos;
    this.isSelecting = true;

    this.drawSelectionHighlight();

    // Prevent text selection on the page
    e.preventDefault();
  }

  onMouseMove(e) {
    if (!this.isSelecting) return;
    if (!this.isTextMode()) {
      this.clearSelection();
      return;
    }

    const pos = this.pixelToChar(e.clientX, e.clientY);
    this.selectionEnd = pos;

    this.drawSelectionHighlight();
  }

  onMouseUp(e) {
    if (!this.isSelecting) return;

    this.isSelecting = false;

    // Check if it's just a click (no drag)
    if (this.selectionStart && this.selectionEnd &&
        this.selectionStart.row === this.selectionEnd.row &&
        this.selectionStart.col === this.selectionEnd.col) {
      // Single click - clear selection
      this.clearSelection();
    }
  }

  onMouseLeave(e) {
    // Don't clear selection, but stop extending it
    this.isSelecting = false;
  }

  onKeyDown(e) {
    // Ctrl+C or Cmd+C to copy
    if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
      if (this.selectionStart && this.selectionEnd) {
        this.copyToClipboard();
        e.preventDefault();
      }
    }

    // Escape to clear selection
    if (e.key === 'Escape' && this.selectionStart) {
      this.clearSelection();
    }
  }

  onContextMenu(e) {
    if (!this.isTextMode()) return;

    // If there's a selection, show copy option
    if (this.selectionStart && this.selectionEnd) {
      e.preventDefault();
      this.showContextMenu(e.clientX, e.clientY);
    }
  }

  /**
   * Show a simple context menu with copy option
   */
  showContextMenu(x, y) {
    // Remove any existing context menu
    const existing = document.querySelector('.text-select-context-menu');
    if (existing) existing.remove();

    const menu = document.createElement('div');
    menu.className = 'text-select-context-menu';
    menu.innerHTML = `
      <button class="context-menu-item" data-action="copy">
        <span>Copy</span>
        <span class="shortcut">Ctrl+C</span>
      </button>
      <button class="context-menu-item" data-action="select-all">
        <span>Select All</span>
      </button>
    `;

    menu.style.cssText = `
      position: fixed;
      left: ${x}px;
      top: ${y}px;
      z-index: 10000;
    `;

    document.body.appendChild(menu);

    // Handle menu clicks
    menu.addEventListener('click', (e) => {
      const item = e.target.closest('.context-menu-item');
      if (!item) return;

      const action = item.dataset.action;
      if (action === 'copy') {
        this.copyToClipboard();
      } else if (action === 'select-all') {
        this.selectAll();
      }

      menu.remove();
    });

    // Close menu on click outside
    const closeMenu = (e) => {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener('mousedown', closeMenu);
      }
    };

    setTimeout(() => {
      document.addEventListener('mousedown', closeMenu);
    }, 0);
  }

  /**
   * Select all text on screen
   */
  selectAll() {
    if (!this.isTextMode()) return;

    const cols = this.is80ColumnMode() ? 80 : 40;

    this.selectionStart = { row: 0, col: 0 };
    this.selectionEnd = { row: this.rows - 1, col: cols - 1 };

    this.drawSelectionHighlight();
  }

  /**
   * Update overlay size and position when canvas resizes
   */
  resize() {
    if (!this.overlay) return;

    // Get canvas position relative to its parent (the wrapper)
    const wrapper = this.canvas.parentElement;
    if (!wrapper) return;

    const wrapperRect = wrapper.getBoundingClientRect();
    const canvasRect = this.canvas.getBoundingClientRect();

    // Calculate offset of canvas within wrapper
    const offsetLeft = canvasRect.left - wrapperRect.left;
    const offsetTop = canvasRect.top - wrapperRect.top;

    // Position and size the overlay to exactly match the canvas
    this.overlay.style.left = offsetLeft + 'px';
    this.overlay.style.top = offsetTop + 'px';
    this.overlay.style.width = canvasRect.width + 'px';
    this.overlay.style.height = canvasRect.height + 'px';
  }

  /**
   * Clean up resources
   */
  destroy() {
    if (this.overlay && this.overlay.parentElement) {
      this.overlay.parentElement.removeChild(this.overlay);
    }
  }
}
