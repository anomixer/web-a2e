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

    // Bind event handlers for proper cleanup
    this.boundOnMouseDown = this.onMouseDown.bind(this);
    this.boundOnMouseMove = this.onMouseMove.bind(this);
    this.boundOnMouseUp = this.onMouseUp.bind(this);
    this.boundOnKeyDown = this.onKeyDown.bind(this);
    this.boundOnContextMenu = this.onContextMenu.bind(this);

    this.setupOverlay();
    this.setupEventListeners();
  }

  setupOverlay() {
    this.overlay = document.createElement('canvas');
    this.overlay.className = 'text-selection-overlay';
    this.overlay.width = 560;
    this.overlay.height = 384;

    const wrapper = this.canvas.parentElement;
    if (wrapper) {
      wrapper.style.position = 'relative';
      wrapper.appendChild(this.overlay);
    }

    this.overlayCtx = this.overlay.getContext('2d');
    this.resize();
  }

  setupEventListeners() {
    // mousedown on canvas starts selection
    this.canvas.addEventListener('mousedown', this.boundOnMouseDown);
    // keydown in capture phase so we can intercept before input handler
    document.addEventListener('keydown', this.boundOnKeyDown, true);
    this.canvas.addEventListener('contextmenu', this.boundOnContextMenu);
  }

  /**
   * Get soft switch state once and extract all mode flags
   * @returns {{textMode: boolean, col80: boolean, page2: boolean}}
   */
  getDisplayMode() {
    if (!this.wasmModule._getSoftSwitchState) {
      return { textMode: false, col80: false, page2: false };
    }

    const state = this.wasmModule._getSoftSwitchState();
    return {
      textMode: (state & 0x01) !== 0,  // Bit 0: TEXT mode
      col80: (state & 0x10) !== 0,     // Bit 4: 80COL mode
      page2: (state & 0x08) !== 0      // Bit 3: PAGE2
    };
  }

  /**
   * Check if the emulator is in text mode
   */
  isTextMode() {
    return this.getDisplayMode().textMode;
  }

  /**
   * Check if 80-column mode is active
   */
  is80ColumnMode() {
    return this.getDisplayMode().col80;
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

    const mode = this.getDisplayMode();
    const cols = mode.col80 ? 80 : 40;
    const charWidth = mode.col80 ? this.charWidth80 : this.charWidth40;

    const col = Math.floor(canvasX / charWidth);
    const row = Math.floor(canvasY / this.charHeight);

    return {
      row: Math.max(0, Math.min(this.rows - 1, row)),
      col: Math.max(0, Math.min(cols - 1, col))
    };
  }

  /**
   * Normalize selection so start is always before end
   * @returns {{startRow, startCol, endRow, endCol}} Normalized coordinates
   */
  normalizeSelection() {
    if (!this.selectionStart || !this.selectionEnd) {
      return null;
    }

    let startRow = this.selectionStart.row;
    let startCol = this.selectionStart.col;
    let endRow = this.selectionEnd.row;
    let endCol = this.selectionEnd.col;

    if (startRow > endRow || (startRow === endRow && startCol > endCol)) {
      [startRow, endRow] = [endRow, startRow];
      [startCol, endCol] = [endCol, startCol];
    }

    return { startRow, startCol, endRow, endCol };
  }

  /**
   * Get the screen memory address for a character position
   */
  getScreenAddress(row, col, page2) {
    const baseAddr = TEXT_ROW_BASES[row];
    const page2Offset = page2 ? PAGE2_OFFSET : 0;
    return baseAddr + page2Offset + col;
  }

  /**
   * Read a character from screen memory
   */
  readScreenChar(row, col, mode) {
    if (mode.col80) {
      // 80-column mode: even screen columns in aux, odd in main
      // Both share the same address within their memory bank
      const memCol = Math.floor(col / 2);
      const isAux = (col % 2) === 0;
      const addr = this.getScreenAddress(row, memCol, mode.page2);

      if (isAux && this.wasmModule._peekAuxMemory) {
        return this.wasmModule._peekAuxMemory(addr);
      } else {
        return this.wasmModule._peekMemory(addr);
      }
    } else {
      const addr = this.getScreenAddress(row, col, mode.page2);
      return this.wasmModule._peekMemory(addr);
    }
  }

  /**
   * Convert Apple II character code to ASCII/Unicode
   *
   * Apple II screen codes:
   * $00-$1F: Inverse uppercase @ A-Z [ \ ] ^ _
   * $20-$3F: Inverse space ! " # $ % & ' ( ) * + , - . / 0-9 : ; < = > ?
   * $40-$5F: Flash uppercase (same as inverse)
   * $60-$7F: Flash symbols (same as inverse symbols)
   * $80-$9F: Normal uppercase @ A-Z [ \ ] ^ _
   * $A0-$BF: Normal space ! " # $ % & ' ( ) * + , - . / 0-9 : ; < = > ?
   * $C0-$DF: Normal uppercase (MouseText on IIe, same as $80-$9F on II+)
   * $E0-$FF: Normal lowercase ` a-z { | } ~
   */
  charToAscii(code) {
    // Mask to 7 bits for the base character
    const base = code & 0x7F;

    // Handle different ranges
    if (code >= 0xE0) {
      // $E0-$FF: Normal lowercase - maps to ASCII $60-$7F
      return code - 0x80;
    } else if (code >= 0xC0) {
      // $C0-$DF: Normal uppercase (or MouseText) - treat as uppercase
      return code - 0x80;
    } else if (code >= 0xA0) {
      // $A0-$BF: Normal symbols/digits - maps to ASCII $20-$3F
      return code - 0x80;
    } else if (code >= 0x80) {
      // $80-$9F: Normal uppercase - maps to ASCII $40-$5F
      return code - 0x40;
    } else if (code >= 0x60) {
      // $60-$7F: Flash symbols - maps to ASCII $20-$3F
      return code - 0x40;
    } else if (code >= 0x40) {
      // $40-$5F: Flash uppercase - maps to ASCII $40-$5F
      return code;
    } else if (code >= 0x20) {
      // $20-$3F: Inverse symbols - maps to ASCII $20-$3F
      return code;
    } else {
      // $00-$1F: Inverse uppercase - maps to ASCII $40-$5F
      return code + 0x40;
    }
  }

  /**
   * Get selected text as a string
   */
  getSelectedText() {
    const mode = this.getDisplayMode();
    if (!mode.textMode) return '';

    const sel = this.normalizeSelection();
    if (!sel) return '';

    const cols = mode.col80 ? 80 : 40;
    let text = '';

    for (let row = sel.startRow; row <= sel.endRow; row++) {
      const colStart = (row === sel.startRow) ? sel.startCol : 0;
      const colEnd = (row === sel.endRow) ? sel.endCol : cols - 1;

      let line = '';
      for (let col = colStart; col <= colEnd; col++) {
        const charCode = this.readScreenChar(row, col, mode);
        const ascii = this.charToAscii(charCode);
        line += String.fromCharCode(ascii);
      }

      text += line.trimEnd();
      if (row < sel.endRow) {
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
    const ctx = this.overlayCtx;
    const copyFlashColor = getComputedStyle(document.documentElement)
      .getPropertyValue('--selection-copy-flash').trim() || 'rgba(63, 185, 80, 0.5)';
    ctx.fillStyle = copyFlashColor;
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

    const mode = this.getDisplayMode();
    if (!mode.textMode) return;

    const sel = this.normalizeSelection();
    if (!sel) return;

    const cols = mode.col80 ? 80 : 40;
    const charWidth = mode.col80 ? this.charWidth80 : this.charWidth40;

    const highlightColor = getComputedStyle(document.documentElement)
      .getPropertyValue('--selection-highlight').trim() || 'rgba(88, 166, 255, 0.35)';
    ctx.fillStyle = highlightColor;

    for (let row = sel.startRow; row <= sel.endRow; row++) {
      const colStart = (row === sel.startRow) ? sel.startCol : 0;
      const colEnd = (row === sel.endRow) ? sel.endCol : cols - 1;

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
    if (e.button !== 0) return;

    const pos = this.pixelToChar(e.clientX, e.clientY);
    this.selectionStart = pos;
    this.selectionEnd = pos;
    this.isSelecting = true;

    // Add document-level listeners to track selection even outside canvas
    document.addEventListener('mousemove', this.boundOnMouseMove);
    document.addEventListener('mouseup', this.boundOnMouseUp);

    this.drawSelectionHighlight();
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

    // Remove document-level listeners
    document.removeEventListener('mousemove', this.boundOnMouseMove);
    document.removeEventListener('mouseup', this.boundOnMouseUp);

    // Single click (no drag) - clear selection
    if (this.selectionStart && this.selectionEnd &&
        this.selectionStart.row === this.selectionEnd.row &&
        this.selectionStart.col === this.selectionEnd.col) {
      this.clearSelection();
    }
  }

  onKeyDown(e) {
    // Ctrl+C / Cmd+C to copy selection
    // Use e.code for reliable detection across platforms
    const isCopyKey = e.code === 'KeyC' || e.key === 'c' || e.key === 'C';
    if ((e.ctrlKey || e.metaKey) && isCopyKey) {
      if (this.selectionStart && this.selectionEnd) {
        this.copyToClipboard();
        e.preventDefault();
        e.stopPropagation();  // Prevent key from reaching emulator
        return;
      }
    }

    // Escape to clear selection
    if (e.key === 'Escape' && this.selectionStart) {
      this.clearSelection();
      e.stopPropagation();  // Prevent key from reaching emulator
    }
  }

  onContextMenu(e) {
    if (!this.isTextMode()) return;

    if (this.selectionStart && this.selectionEnd) {
      e.preventDefault();
      this.showContextMenu(e.clientX, e.clientY);
    }
  }

  /**
   * Show a simple context menu with copy option
   */
  showContextMenu(x, y) {
    const existing = document.querySelector('.text-select-context-menu');
    if (existing) existing.remove();

    const menu = document.createElement('div');
    menu.className = 'text-select-context-menu';
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const copyShortcut = isMac ? '⌘C' : 'Ctrl+C';
    menu.innerHTML = `
      <button class="context-menu-item" data-action="copy">
        <span>Copy</span>
        <span class="shortcut">${copyShortcut}</span>
      </button>
      <button class="context-menu-item" data-action="select-all">
        <span>Select All</span>
      </button>
    `;

    // Position menu, ensuring it stays within viewport
    const menuWidth = 150;
    const menuHeight = 70;
    const left = Math.min(x, window.innerWidth - menuWidth - 10);
    const top = Math.min(y, window.innerHeight - menuHeight - 10);

    menu.style.left = left + 'px';
    menu.style.top = top + 'px';

    document.body.appendChild(menu);

    const handleClick = (e) => {
      const item = e.target.closest('.context-menu-item');
      if (!item) return;

      const action = item.dataset.action;
      if (action === 'copy') {
        this.copyToClipboard();
      } else if (action === 'select-all') {
        this.selectAll();
      }

      menu.remove();
    };

    menu.addEventListener('click', handleClick);

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

    const wrapper = this.canvas.parentElement;
    if (!wrapper) return;

    const wrapperRect = wrapper.getBoundingClientRect();
    const canvasRect = this.canvas.getBoundingClientRect();

    const offsetLeft = canvasRect.left - wrapperRect.left;
    const offsetTop = canvasRect.top - wrapperRect.top;

    this.overlay.style.left = offsetLeft + 'px';
    this.overlay.style.top = offsetTop + 'px';
    this.overlay.style.width = canvasRect.width + 'px';
    this.overlay.style.height = canvasRect.height + 'px';
  }

  /**
   * Clean up resources and remove event listeners
   */
  destroy() {
    // Remove event listeners
    this.canvas.removeEventListener('mousedown', this.boundOnMouseDown);
    document.removeEventListener('mousemove', this.boundOnMouseMove);
    document.removeEventListener('mouseup', this.boundOnMouseUp);
    document.removeEventListener('keydown', this.boundOnKeyDown, true);  // capture phase
    this.canvas.removeEventListener('contextmenu', this.boundOnContextMenu);

    // Remove overlay
    if (this.overlay && this.overlay.parentElement) {
      this.overlay.parentElement.removeChild(this.overlay);
    }

    // Remove any open context menu
    const menu = document.querySelector('.text-select-context-menu');
    if (menu) menu.remove();
  }
}
