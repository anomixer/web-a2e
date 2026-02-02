/*
 * input-handler.js - Keyboard input handling for the emulator
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

export class InputHandler {
  constructor(wasmModule) {
    this.wasmModule = wasmModule;

    // Canvas element for focus management
    this.canvas = null;

    // Hidden input for mobile keyboard
    this.mobileInput = null;
    this.isMobile = false;

    // Paste queue for typing pasted text
    this.pasteQueue = [];
    this.pasteTimer = null;
    this.pasteSpeedUp = false; // whether we've set a speed multiplier for paste
    this.savedSpeedMultiplier = 1; // speed before paste started

    // MessageChannel for zero-delay batch scheduling (avoids setTimeout's ~4ms minimum)
    this.pasteChannel = new MessageChannel();
    this.pasteChannel.port1.onmessage = () => this.processPasteQueue();
  }

  init() {
    // Detect mobile/touch devices
    this.isMobile = this.detectMobile();

    // Get canvas and make it focusable
    this.canvas = document.getElementById("screen");
    this.canvas.tabIndex = 1; // Make canvas focusable

    // Create hidden input for mobile keyboard
    if (this.isMobile) {
      this.createMobileInput();
    }

    // Focus canvas on click (or mobile input on mobile)
    this.canvas.addEventListener("click", () => {
      if (this.isMobile && this.mobileInput) {
        this.mobileInput.focus();
      } else {
        this.canvas.focus();
      }
    });

    // Also handle touch events for mobile
    this.canvas.addEventListener("touchend", (e) => {
      if (this.isMobile && this.mobileInput) {
        // Small delay to ensure touch event completes
        setTimeout(() => {
          this.mobileInput.focus();
        }, 50);
      }
    });

    // Focus canvas initially (not on mobile - wait for user tap)
    if (!this.isMobile) {
      setTimeout(() => this.canvas.focus(), 100);
    }

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

  // Handle paste event - queues text for input at accelerated speed
  handlePaste(event) {
    event.preventDefault();

    const text = (event.clipboardData || window.clipboardData).getData("text");
    if (!text) return;

    this.queueTextInput(text, { speedMultiplier: 8 });
  }

  // Convert character to Apple II key code (for paste only)
  charToAppleKey(char) {
    const result = this.wasmModule._charToAppleKey(char.charCodeAt(0));
    return result >= 0 ? result : null;
  }

  // Process paste queue in batches, yielding to the browser periodically
  // to keep the UI responsive and let the audio worklet drive emulation.
  // Speed multiplier (set via WASM) makes the audio-driven emulation run
  // faster, while small boost cycle batches handle immediate key processing.
  processPasteQueue() {
    if (this.pasteQueue.length === 0) {
      this.restorePasteSpeed();
      this.pasteTimer = null;
      return;
    }

    const BOOST_BATCH = 500; // small cycle batch for immediate key processing
    const TIME_BUDGET_MS = 30;
    const batchEnd = performance.now() + TIME_BUDGET_MS;

    while (this.pasteQueue.length > 0 && performance.now() < batchEnd) {
      // Wait for keyboard ready, running small boost cycles until it is
      if (this.wasmModule._isKeyboardReady) {
        while (!this.wasmModule._isKeyboardReady()) {
          this.wasmModule._runCycles(BOOST_BATCH);
          if (performance.now() >= batchEnd) break;
        }
        if (!this.wasmModule._isKeyboardReady()) {
          break;
        }
      }

      const appleKey = this.pasteQueue.shift();
      this.wasmModule._keyDown(appleKey);

      // Run a small burst to start processing the keystroke
      this.wasmModule._runCycles(BOOST_BATCH);
    }

    // Schedule next batch if more characters remain
    if (this.pasteQueue.length > 0) {
      this.pasteTimer = true;
      this.pasteChannel.port2.postMessage(null);
    } else {
      this.restorePasteSpeed();
      this.pasteTimer = null;
    }
  }

  // Set emulation speed multiplier for fast paste/input
  setPasteSpeed(multiplier) {
    if (!this.pasteSpeedUp && this.wasmModule._setSpeedMultiplier) {
      this.savedSpeedMultiplier = this.wasmModule._getSpeedMultiplier
        ? this.wasmModule._getSpeedMultiplier()
        : 1;
      this.wasmModule._setSpeedMultiplier(multiplier);
      this.pasteSpeedUp = true;
    }
  }

  // Restore emulation speed after paste completes
  restorePasteSpeed() {
    if (this.pasteSpeedUp && this.wasmModule._setSpeedMultiplier) {
      this.wasmModule._setSpeedMultiplier(this.savedSpeedMultiplier);
      this.pasteSpeedUp = false;
    }
  }

  // Cancel any pending paste operation
  cancelPaste() {
    this.pasteTimer = null;
    this.pasteQueue = [];
    this.restorePasteSpeed();
  }

  // Queue text for programmatic input (used by BasicProgramWindow)
  // speedMultiplier: emulation speed during input (1=normal, 8=8x)
  queueTextInput(text, { speedMultiplier = 8 } = {}) {
    this.setPasteSpeed(speedMultiplier);

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

  // Detect if we're on a mobile/touch device
  detectMobile() {
    // Check for touch capability and mobile user agent
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    // Also check for small screen width as a fallback
    const isSmallScreen = window.innerWidth <= 800;

    return hasTouch && (isMobileUA || isSmallScreen);
  }

  // Create hidden input element for mobile keyboard
  createMobileInput() {
    this.mobileInput = document.createElement('input');
    this.mobileInput.type = 'text';
    this.mobileInput.id = 'mobile-keyboard-input';
    this.mobileInput.autocomplete = 'off';
    this.mobileInput.autocapitalize = 'none';
    this.mobileInput.autocorrect = 'off';
    this.mobileInput.spellcheck = false;

    // Style to be invisible but still functional
    Object.assign(this.mobileInput.style, {
      position: 'absolute',
      left: '-9999px',
      top: '0',
      width: '1px',
      height: '1px',
      opacity: '0',
      pointerEvents: 'none',
      zIndex: '-1'
    });

    document.body.appendChild(this.mobileInput);

    // Handle input events from mobile keyboard
    this.mobileInput.addEventListener('input', (e) => {
      const data = e.data;
      if (data) {
        // Process each character typed
        for (const char of data) {
          this.sendCharToEmulator(char);
        }
      }
      // Clear the input to be ready for next character
      this.mobileInput.value = '';
    });

    // Handle special keys via keydown
    this.mobileInput.addEventListener('keydown', (e) => {
      const keyCode = e.keyCode || e.which;

      // Handle special keys that don't generate input events
      switch (keyCode) {
        case 8:  // Backspace
        case 13: // Enter
        case 27: // Escape
        case 9:  // Tab
          e.preventDefault();
          this.handleKeyDown(e);
          break;
      }
    });

    this.mobileInput.addEventListener('keyup', (e) => {
      const keyCode = e.keyCode || e.which;

      // Handle special key releases
      switch (keyCode) {
        case 8:  // Backspace
        case 13: // Enter
        case 27: // Escape
        case 9:  // Tab
          this.handleKeyUp(e);
          break;
      }
    });

    // Handle blur - show visual feedback that keyboard is hidden
    this.mobileInput.addEventListener('blur', () => {
      this.canvas.classList.remove('keyboard-active');
    });

    // Handle focus - show visual feedback that keyboard is active
    this.mobileInput.addEventListener('focus', () => {
      this.canvas.classList.add('keyboard-active');
    });
  }

  // Send a character to the emulator (for mobile input)
  sendCharToEmulator(char) {
    const appleKey = this.charToAppleKey(char);
    if (appleKey !== null) {
      this.wasmModule._keyDown(appleKey);
    }
  }

  // Show mobile keyboard programmatically
  showMobileKeyboard() {
    if (this.isMobile && this.mobileInput) {
      this.mobileInput.focus();
    }
  }

  // Hide mobile keyboard
  hideMobileKeyboard() {
    if (this.isMobile && this.mobileInput) {
      this.mobileInput.blur();
    }
  }
}
