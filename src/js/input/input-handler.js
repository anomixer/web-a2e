/*
 * input-handler.js - Keyboard input handling for the emulator
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

// How often to re-check a paste queue that is stalled because the emulator
// is paused. Long enough not to busy-wait, short enough to feel immediate.
const PAUSED_POLL_MS = 50;

// Right Alt reports location 2; left reports 1, and 0 means the browser did not
// say, which we treat as left. Both sides share keyCode 18, so this is the only
// thing separating Open Apple from Closed Apple.
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
    this.pasteMultiplier = 1;  // boost the current queue asked for
    this.savedSpeedMultiplier = 1; // speed before paste started

    // MessageChannel for zero-delay batch scheduling (avoids setTimeout's ~4ms minimum)
    this.pasteChannel = new MessageChannel();
    this.pasteChannel.port1.onmessage = () => this.processPasteQueue();

    // Reference to joystick window for cursor-keys-as-joystick feature
    this.joystickWindow = null;
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

    // A single document-level pair of listeners, deliberately. Listening on the
    // canvas as well would double every keystroke: a key press targets the
    // focused canvas, runs the canvas listener in the target phase, then bubbles
    // to document where the guard below is true by definition — so every key
    // reached the emulator twice, and any per-key side effect (the Cursor Keys
    // joystick update, for one) ran twice with it.
    //
    // Document is the one that has to stay: it also covers the case where focus
    // has drifted to <body>, which the canvas listener never sees.
    const focusIsOurs = () =>
      document.activeElement === this.canvas ||
      document.activeElement === document.body;

    document.addEventListener("keydown", (e) => {
      if (focusIsOurs()) this.handleKeyDown(e);
    });

    document.addEventListener("keyup", (e) => {
      if (focusIsOurs()) this.handleKeyUp(e);
    });

    // A key held while switching away never delivers its keyup, which would
    // otherwise leave an Apple button latched until it was pressed again.
    window.addEventListener("blur", () => this.wasmModule._releaseModifiers());

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

    // Alt on its own would otherwise focus the browser menu bar. Combinations
    // are left alone: Ctrl+Alt is AltGr on European layouts, and swallowing it
    // would interfere with typing accented characters.
    if (keyCode === 18 && !ctrl && !meta) {
      event.preventDefault();
    }
    // Win / Context Menu → block, do nothing
    if (keyCode === 91 || keyCode === 93) {
      event.preventDefault();
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

    // Cursor Keys mode makes the arrows drive the joystick *as well as* the
    // keyboard — it must not swallow them. ProDOS selectors, catalog menus and
    // BASIC line editing all navigate with the arrows, and consuming them here
    // left those unusable whenever the toggle was on.
    if (this.joystickWindow) {
      this.joystickWindow.handleCursorKey(keyCode, true);
    }

    // Send raw keycode to WASM - C++ handles the translation
    this.wasmModule._handleRawKeyDown(
      keyCode, shift, ctrl, alt, meta, capsLock, event.location || 0,
    );
  }

  handleKeyUp(event) {
    const keyCode = event.keyCode || event.which;

    // Get modifier states
    const shift = event.shiftKey;
    const ctrl = event.ctrlKey;
    const alt = event.altKey;
    const meta = event.metaKey;

    // Win / Context Menu → ignore release
    if (keyCode === 91 || keyCode === 93) {
      return;
    }

    // Release the joystick axis, then let the key reach the emulator as normal
    // (see the matching note in handleKeyDown).
    if (this.joystickWindow) {
      this.joystickWindow.handleCursorKey(keyCode, false);
    }

    // Send raw keycode to WASM
    this.wasmModule._handleRawKeyUp(
      keyCode, shift, ctrl, alt, meta, event.location || 0,
    );
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
  async charToAppleKey(char) {
    const result = await this.wasmModule._charToAppleKey(char.charCodeAt(0));
    return result >= 0 ? result : null;
  }

  // Process paste queue in batches, yielding to the browser periodically
  // to keep the UI responsive and let the audio worklet drive emulation.
  // Speed multiplier (set via WASM) makes the audio-driven emulation run
  // faster, while small boost cycle batches handle immediate key processing.
  async processPasteQueue() {
    if (this.pasteQueue.length === 0) {
      this.restorePasteSpeed();
      this.pasteTimer = null;
      return;
    }

    // Nothing can drain while the emulator is paused: _runCycles is a no-op and
    // the keyboard strobe never clears, so the loop below would spin its whole
    // time budget and reschedule with the speed boost still applied. A
    // breakpoint hit mid-queue therefore left the multiplier at 8x, and the
    // emulator sprinted as soon as it was continued. Drop the boost while
    // paused and check back periodically instead of spinning.
    if (this.wasmModule._isPaused && (await this.wasmModule._isPaused())) {
      this.restorePasteSpeed();
      this.pasteTimer = setTimeout(() => {
        this.pasteTimer = null;
        this.processPasteQueue();
      }, PAUSED_POLL_MS);
      return;
    }

    // Re-apply the boost if a pause dropped it.
    if (!this.pasteSpeedUp && this.pasteMultiplier > 1) {
      await this.setPasteSpeed(this.pasteMultiplier);
    }

    const BOOST_BATCH = 500; // small cycle batch for immediate key processing
    const TIME_BUDGET_MS = 30;
    const batchEnd = performance.now() + TIME_BUDGET_MS;

    while (this.pasteQueue.length > 0 && performance.now() < batchEnd) {
      // Wait for keyboard ready, running small boost cycles until it is
      if (this.wasmModule._isKeyboardReady) {
        while (!await this.wasmModule._isKeyboardReady()) {
          await this.wasmModule._runCycles(BOOST_BATCH);
          if (performance.now() >= batchEnd) break;
        }
        if (!await this.wasmModule._isKeyboardReady()) {
          break;
        }
      }

      const appleKey = this.pasteQueue.shift();
      this.wasmModule._keyDown(appleKey);

      // Run a small burst to start processing the keystroke
      await this.wasmModule._runCycles(BOOST_BATCH);
    }

    // Schedule next batch if more characters remain
    if (this.pasteQueue.length > 0) {
      this.pasteTimer = true;
      this.pasteChannel.port2.postMessage(null);
    } else {
      this.restorePasteSpeed();
      this.pasteTimer = null;
      if (this.pasteOnComplete) {
        this.pasteOnComplete(false); // false = completed normally
        this.pasteOnComplete = null;
      }
    }
  }

  // Set emulation speed multiplier for fast paste/input
  async setPasteSpeed(multiplier) {
    if (!this.pasteSpeedUp && this.wasmModule._setSpeedMultiplier) {
      this.savedSpeedMultiplier = this.wasmModule._getSpeedMultiplier
        ? await this.wasmModule._getSpeedMultiplier()
        : 1;
      this.wasmModule._setSpeedMultiplier(multiplier);
      this.pasteSpeedUp = true;
    }
  }

  // Set the user's baseline emulation speed (the View menu's CPU Speed).
  // While a paste boost is live the multiplier in WASM belongs to the paste,
  // so record the new baseline as the value to restore rather than writing it
  // through — otherwise restorePasteSpeed() would undo the change.
  setBaseSpeed(multiplier) {
    if (this.pasteSpeedUp) {
      this.savedSpeedMultiplier = multiplier;
      return;
    }
    if (this.wasmModule._setSpeedMultiplier) {
      this.wasmModule._setSpeedMultiplier(multiplier);
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
    if (typeof this.pasteTimer === "number") clearTimeout(this.pasteTimer);
    this.pasteTimer = null;
    this.pasteQueue = [];
    this.pasteMultiplier = 1;
    this.restorePasteSpeed();
    if (this.pasteOnComplete) {
      this.pasteOnComplete(true); // true = cancelled
      this.pasteOnComplete = null;
    }
  }

  // Queue text for programmatic input (used by BasicProgramWindow)
  // speedMultiplier: emulation speed during input (1=normal, 8=8x)
  // onStart: callback when pasting begins
  // onComplete: callback when pasting finishes (or is cancelled)
  // parseTokens: when true, recognize {token} special keys (arrows, esc,
  //   enter, tab, del, backspace, space, ctrl combos). Default false so
  //   ordinary paste passes braces through literally.
  async queueTextInput(text, { speedMultiplier = 8, onStart = null, onComplete = null, parseTokens = false } = {}) {
    this.pasteOnComplete = onComplete;
    this.pasteMultiplier = speedMultiplier;
    await this.setPasteSpeed(speedMultiplier);

    if (parseTokens) {
      let i = 0;
      while (i < text.length) {
        if (text[i] === "{") {
          // "{{" is a literal "{"
          if (text[i + 1] === "{") {
            const lit = await this.charToAppleKey("{");
            if (lit !== null) this.pasteQueue.push(lit);
            i += 2;
            continue;
          }
          const end = text.indexOf("}", i + 1);
          if (end > i) {
            const code = this.specialKeyToAppleCode(text.slice(i + 1, end));
            if (code !== null) {
              this.pasteQueue.push(code);
              i = end + 1;
              continue;
            }
          }
          // Unrecognized token — fall through and treat "{" literally
        }
        const appleKey = await this.charToAppleKey(text[i]);
        if (appleKey !== null) this.pasteQueue.push(appleKey);
        i++;
      }
    } else {
      for (const char of text) {
        const appleKey = await this.charToAppleKey(char);
        if (appleKey !== null) {
          this.pasteQueue.push(appleKey);
        }
      }
    }

    // Start processing queue if not already running
    if (!this.pasteTimer && this.pasteQueue.length > 0) {
      if (onStart) onStart();
      this.processPasteQueue();
    }
  }

  // Map a {token} name to an Apple II key code, mirroring keyboard.cpp.
  // Supports arrows, esc, enter/return/cr, tab, del, backspace, space, and
  // Ctrl combos ({ctrl-c}, {ctrl+c}, {^c}). Returns null if unrecognized.
  specialKeyToAppleCode(token) {
    const t = token.trim().toLowerCase();
    const named = {
      left: 0x08, right: 0x15, up: 0x0b, down: 0x0a,
      esc: 0x1b, escape: 0x1b,
      enter: 0x0d, return: 0x0d, cr: 0x0d,
      tab: 0x09,
      del: 0x7f, delete: 0x7f,
      bs: 0x08, backspace: 0x08,
      space: 0x20,
    };
    if (Object.prototype.hasOwnProperty.call(named, t)) return named[t];

    // Ctrl combo: {ctrl-c}, {ctrl+c}, {^c}
    const m = t.match(/^(?:ctrl[-+]|\^)(.)$/);
    if (m) {
      const c = m[1].charCodeAt(0);
      if (c >= 0x61 && c <= 0x7a) return c - 0x60; // a-z -> 0x01-0x1A
      if (c >= 0x40 && c <= 0x5f) return c & 0x1f; // @ [ \ ] ^ _ -> 0x00-0x1F
    }

    // Raw code by value: {chr:4}, {chr:$04}, {chr:0x1b} -> CHR$(N).
    // Covers control codes (e.g. Ctrl-D = {chr:4}) and any byte by number.
    const chr = t.match(/^chr:(?:(\$|0x)([0-9a-f]+)|([0-9]+))$/);
    if (chr) {
      const v = chr[3] !== undefined ? parseInt(chr[3], 10) : parseInt(chr[2], 16);
      if (!Number.isNaN(v) && v >= 0 && v <= 0xff) return v & 0x7f;
    }
    return null;
  }

  // Check if a paste operation is in progress
  isPasting() {
    return this.pasteQueue.length > 0 || this.pasteTimer !== null;
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
  async sendCharToEmulator(char) {
    const appleKey = await this.charToAppleKey(char);
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
