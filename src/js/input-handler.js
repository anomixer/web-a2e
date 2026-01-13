// Keyboard Input Handler for Apple //e Emulator

export class InputHandler {
  constructor(wasmModule) {
    this.wasmModule = wasmModule;

    // Key mapping from browser keycodes to Apple II
    this.keyMap = new Map();
    this.setupKeyMap();

    // Track modifier keys
    this.ctrlPressed = false;
    this.shiftPressed = false;
    this.altPressed = false; // Open Apple
    this.metaPressed = false; // Closed Apple

    // Canvas element for focus management
    this.canvas = null;
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
  }

  setupKeyMap() {
    // Letters A-Z - store as lowercase, will apply caps lock/shift later
    for (let i = 65; i <= 90; i++) {
      this.keyMap.set(i, i + 32); // Lowercase (a=97, b=98, etc.)
    }

    // Numbers 0-9
    for (let i = 48; i <= 57; i++) {
      this.keyMap.set(i, i);
    }

    // Special keys
    this.keyMap.set(13, 0x0d); // Enter -> CR
    this.keyMap.set(8, 0x08); // Backspace -> Left arrow (delete)
    this.keyMap.set(27, 0x1b); // Escape
    this.keyMap.set(32, 0x20); // Space
    this.keyMap.set(9, 0x09); // Tab

    // Arrow keys
    this.keyMap.set(37, 0x08); // Left arrow
    this.keyMap.set(38, 0x0b); // Up arrow
    this.keyMap.set(39, 0x15); // Right arrow
    this.keyMap.set(40, 0x0a); // Down arrow

    // Punctuation (US keyboard layout)
    this.keyMap.set(188, 0x2c); // Comma
    this.keyMap.set(190, 0x2e); // Period
    this.keyMap.set(191, 0x2f); // Slash
    this.keyMap.set(186, 0x3b); // Semicolon
    this.keyMap.set(222, 0x27); // Quote
    this.keyMap.set(219, 0x5b); // Left bracket
    this.keyMap.set(221, 0x5d); // Right bracket
    this.keyMap.set(220, 0x5c); // Backslash
    this.keyMap.set(189, 0x2d); // Minus
    this.keyMap.set(187, 0x3d); // Equals
    this.keyMap.set(192, 0x60); // Backtick
  }

  handleKeyDown(event) {
    const keyCode = event.keyCode || event.which;

    // Track modifiers
    if (keyCode === 16) {
      this.shiftPressed = true;
      return;
    }
    if (keyCode === 17) {
      this.ctrlPressed = true;
      return;
    }
    if (keyCode === 18) {
      this.altPressed = true;
      return;
    }
    if (keyCode === 91 || keyCode === 93) {
      this.metaPressed = true;
      return;
    }

    // Handle Ctrl+Reset
    if (this.ctrlPressed && keyCode === 82) {
      // Ctrl+R
      // Don't reset - let browser handle refresh
      // For reset, use the button or a different combo
      return;
    }

    // Get base key
    let appleKey = this.keyMap.get(keyCode);
    if (appleKey === undefined) {
      return;
    }

    // Prevent default to stop buttons from being activated and browser shortcuts
    if (this.shouldPreventDefault(event)) {
      event.preventDefault();
    }

    // Always prevent default for printable characters when canvas has focus
    // to stop them from triggering button shortcuts
    if (document.activeElement === this.canvas) {
      event.preventDefault();
    }

    // Apply Caps Lock and Shift modifiers for letters
    const capsLock = event.getModifierState && event.getModifierState('CapsLock');
    if (appleKey >= 0x61 && appleKey <= 0x7a) {
      // It's a lowercase letter
      if (capsLock && !this.shiftPressed) {
        // Caps lock on, no shift -> uppercase
        appleKey = appleKey - 32;
      } else if (!capsLock && this.shiftPressed) {
        // Caps lock off, shift pressed -> uppercase
        appleKey = appleKey - 32;
      }
      // Otherwise stays lowercase
    } else if (this.shiftPressed) {
      // Apply shift to non-letter keys
      appleKey = this.applyShift(appleKey, keyCode);
    }

    // Apply Ctrl modifier (produces control characters)
    if (this.ctrlPressed) {
      if (appleKey >= 0x61 && appleKey <= 0x7a) {
        // a-z -> Ctrl+A-Z (0x01-0x1A)
        appleKey = appleKey - 0x60;
      } else if (appleKey >= 0x41 && appleKey <= 0x5a) {
        // A-Z -> Ctrl+A-Z
        appleKey = appleKey - 0x40;
      }
    }

    // Send to emulator
    this.wasmModule._keyDown(appleKey);
  }

  handleKeyUp(event) {
    const keyCode = event.keyCode || event.which;

    // Track modifiers
    if (keyCode === 16) {
      this.shiftPressed = false;
      return;
    }
    if (keyCode === 17) {
      this.ctrlPressed = false;
      return;
    }
    if (keyCode === 18) {
      this.altPressed = false;
      return;
    }
    if (keyCode === 91 || keyCode === 93) {
      this.metaPressed = false;
      return;
    }

    const appleKey = this.keyMap.get(keyCode);
    if (appleKey !== undefined) {
      this.wasmModule._keyUp(appleKey);
    }
  }

  applyShift(key, keyCode) {
    // Number row shifted symbols (letters handled separately)
    const shiftMap = {
      48: 0x29, // 0 -> )
      49: 0x21, // 1 -> !
      50: 0x40, // 2 -> @
      51: 0x23, // 3 -> #
      52: 0x24, // 4 -> $
      53: 0x25, // 5 -> %
      54: 0x5e, // 6 -> ^
      55: 0x26, // 7 -> &
      56: 0x2a, // 8 -> *
      57: 0x28, // 9 -> (

      188: 0x3c, // , -> <
      190: 0x3e, // . -> >
      191: 0x3f, // / -> ?
      186: 0x3a, // ; -> :
      222: 0x22, // ' -> "
      219: 0x7b, // [ -> {
      221: 0x7d, // ] -> }
      220: 0x7c, // \ -> |
      189: 0x5f, // - -> _
      187: 0x2b, // = -> +
      192: 0x7e, // ` -> ~
    };

    return shiftMap[keyCode] || key;
  }

  shouldPreventDefault(event) {
    const keyCode = event.keyCode || event.which;

    // Prevent default for these keys when not using modifiers
    const preventKeys = [
      8, // Backspace
      9, // Tab
      27, // Escape
      32, // Space (prevent page scroll)
      37,
      38,
      39,
      40, // Arrow keys
    ];

    if (preventKeys.includes(keyCode) && !event.ctrlKey && !event.metaKey) {
      return true;
    }

    return false;
  }
}
