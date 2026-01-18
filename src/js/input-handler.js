// Keyboard Input Handler for Apple //e Emulator
// Key translation is handled in C++ core, this just passes raw browser events

export class InputHandler {
  constructor(wasmModule) {
    this.wasmModule = wasmModule;

    // Canvas element for focus management
    this.canvas = null;

    // Paste queue for typing pasted text
    this.pasteQueue = [];
    this.pasteTimer = null;
    this.pasteDelay = 60; // ms between characters
  }

  init() {
    // Get canvas and make it focusable
    this.canvas = document.getElementById("screen");
    this.canvas.tabIndex = 1; // Make canvas focusable

    // Focus canvas on click
    this.canvas.addEventListener("click", () => {
      this.canvas.focus();
    });

    // Focus canvas initially
    setTimeout(() => this.canvas.focus(), 100);

    // Keyboard event listeners - attach to canvas for better focus control
    this.canvas.addEventListener("keydown", (e) => this.handleKeyDown(e));
    this.canvas.addEventListener("keyup", (e) => this.handleKeyUp(e));

    // Also listen on document but only process if canvas has focus or no other element does
    document.addEventListener("keydown", (e) => {
      // Only handle if canvas has focus or the active element is body
      if (
        document.activeElement === this.canvas ||
        document.activeElement === document.body
      ) {
        this.handleKeyDown(e);
      }
    });

    document.addEventListener("keyup", (e) => {
      if (
        document.activeElement === this.canvas ||
        document.activeElement === document.body
      ) {
        this.handleKeyUp(e);
      }
    });

    // Paste event listener
    document.addEventListener("paste", (e) => {
      if (
        document.activeElement === this.canvas ||
        document.activeElement === document.body
      ) {
        this.handlePaste(e);
      }
    });
  }

  handleKeyDown(event) {
    const keyCode = event.keyCode || event.which;

    // Get modifier states
    const shift = event.shiftKey;
    const ctrl = event.ctrlKey;
    const alt = event.altKey;
    const meta = event.metaKey;
    const capsLock = event.getModifierState && event.getModifierState('CapsLock');

    // Don't interfere with browser shortcuts
    if (ctrl && keyCode === 82) {
      // Ctrl+R for refresh
      return;
    }

    // Prevent default for these keys when not using modifiers
    if (this.shouldPreventDefault(event)) {
      event.preventDefault();
    }

    // Always prevent default for printable characters when canvas has focus
    // to stop them from triggering button shortcuts
    if (document.activeElement === this.canvas) {
      event.preventDefault();
    }

    // Send raw keycode to WASM - C++ handles the translation
    this.wasmModule._handleRawKeyDown(keyCode, shift, ctrl, alt, meta, capsLock);
  }

  handleKeyUp(event) {
    const keyCode = event.keyCode || event.which;

    // Get modifier states
    const shift = event.shiftKey;
    const ctrl = event.ctrlKey;
    const alt = event.altKey;
    const meta = event.metaKey;

    // Send raw keycode to WASM
    this.wasmModule._handleRawKeyUp(keyCode, shift, ctrl, alt, meta);
  }

  shouldPreventDefault(event) {
    const keyCode = event.keyCode || event.which;

    // Prevent default for these keys when not using modifiers
    const preventKeys = [
      8, // Backspace
      9, // Tab
      27, // Escape
      32, // Space (prevent page scroll)
      37, 38, 39, 40, // Arrow keys
    ];

    if (preventKeys.includes(keyCode) && !event.ctrlKey && !event.metaKey) {
      return true;
    }

    return false;
  }

  // Handle paste event - still uses direct keyDown for ASCII characters
  handlePaste(event) {
    event.preventDefault();

    const text = (event.clipboardData || window.clipboardData).getData("text");
    if (!text) return;

    // Add characters to paste queue
    for (const char of text) {
      const appleKey = this.charToAppleKey(char);
      if (appleKey !== null) {
        this.pasteQueue.push(appleKey);
      }
    }

    // Start processing queue if not already running
    if (!this.pasteTimer && this.pasteQueue.length > 0) {
      this.processPasteQueue();
    }
  }

  // Convert character to Apple II key code (for paste only)
  charToAppleKey(char) {
    const code = char.charCodeAt(0);

    // Newline -> CR
    if (char === '\n' || char === '\r') {
      return 0x0D;
    }

    // Tab
    if (char === '\t') {
      return 0x09;
    }

    // Printable ASCII (space through tilde)
    if (code >= 0x20 && code <= 0x7E) {
      return code;
    }

    // Skip non-printable characters
    return null;
  }

  // Process paste queue one character at a time
  processPasteQueue() {
    if (this.pasteQueue.length === 0) {
      this.pasteTimer = null;
      return;
    }

    // Check if keyboard is ready (strobe cleared from previous character)
    if (this.wasmModule._isKeyboardReady && !this.wasmModule._isKeyboardReady()) {
      // Not ready yet, poll again soon
      this.pasteTimer = setTimeout(() => {
        this.processPasteQueue();
      }, 5);
      return;
    }

    const appleKey = this.pasteQueue.shift();
    this.wasmModule._keyDown(appleKey);

    // Schedule next character check
    this.pasteTimer = setTimeout(() => {
      this.processPasteQueue();
    }, this.pasteDelay);
  }

  // Cancel any pending paste operation
  cancelPaste() {
    if (this.pasteTimer) {
      clearTimeout(this.pasteTimer);
      this.pasteTimer = null;
    }
    this.pasteQueue = [];
  }
}
