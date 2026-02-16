/*
 * screen-window.js - Main emulator screen window
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { BaseWindow } from "../windows/base-window.js";

export class ScreenWindow extends BaseWindow {
  constructor(renderer, textSelection) {
    super({
      id: "screen-window",
      title: "Screen",
      minWidth: 284, // 280 min canvas + 4px padding/border
      minHeight: 244, // 210 min canvas + ~34px header
      defaultWidth: 480,
      defaultHeight: 394,
      closable: false,
      focusCanvas: true,
    });

    this.renderer = renderer;
    this.textSelection = textSelection;
    this._viewportLocked = false;
  }

  renderContent() {
    return '<div class="screen-window-content"></div>';
  }

  /**
   * After create(), inject the charset toggle into the header and
   * set up a ResizeObserver so the canvas tracks container size.
   */
  onContentRendered() {
    const charsetSwitch = document.createElement("div");
    charsetSwitch.className = "screen-window-charset-switch";
    charsetSwitch.title = "Character Set (US/UK)";
    charsetSwitch.innerHTML = `
      <span class="charset-label">US</span>
      <label class="charset-toggle">
        <input type="checkbox" id="screen-window-charset-toggle" />
        <span class="charset-slider"></span>
      </label>
      <span class="charset-label">UK</span>
    `;

    // Viewport lock button
    this._lockBtn = document.createElement("button");
    this._lockBtn.className = "screen-window-lock";
    this._lockBtn.title = "Fit to viewport";
    this._lockBtn.innerHTML = `
      <svg class="lock-icon-unlocked" viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
        <path d="M4 7V5a4 4 0 0 1 8 0v1h-2V5a2 2 0 0 0-4 0v2H3a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1H4z"/>
      </svg>
      <svg class="lock-icon-locked" viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
        <path d="M4 7V5a4 4 0 0 1 8 0v2h1a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h1zm2-2v2h4V5a2 2 0 0 0-4 0z"/>
      </svg>
    `;

    // Cursor keys joystick toggle
    this._cursorKeysSwitch = document.createElement("div");
    this._cursorKeysSwitch.className = "screen-window-cursor-keys-switch";
    this._cursorKeysSwitch.title = "Use cursor keys as joystick";
    this._cursorKeysSwitch.innerHTML = `
      <span class="cursor-keys-label">&#x2734;</span>
      <label class="cursor-keys-toggle">
        <input type="checkbox" id="screen-window-cursor-keys-toggle" />
        <span class="cursor-keys-slider"></span>
      </label>
      <span class="cursor-keys-label cursor-keys-label-text">JOY</span>
    `;
    this._cursorKeysCheckbox = this._cursorKeysSwitch.querySelector(
      "#screen-window-cursor-keys-toggle",
    );

    // Insert charset switch, cursor keys toggle, and lock button into header
    this.headerElement.appendChild(charsetSwitch);
    this.headerElement.appendChild(this._cursorKeysSwitch);
    this.headerElement.appendChild(this._lockBtn);

    // Prevent clicks from starting a window drag
    charsetSwitch.addEventListener("mousedown", (e) => {
      e.stopPropagation();
    });
    this._cursorKeysSwitch.addEventListener("mousedown", (e) => {
      e.stopPropagation();
    });
    this._lockBtn.addEventListener("mousedown", (e) => {
      e.stopPropagation();
    });
    this._lockBtn.addEventListener("click", () => {
      this.setViewportLocked(!this._viewportLocked);
    });

    // Observe the content container so _fitCanvas runs whenever
    // the window is resized, restored, arranged, etc.
    const container = this.contentElement.querySelector(
      ".screen-window-content",
    );
    if (container) {
      this._resizeObserver = new ResizeObserver(() => this._fitCanvas());
      this._resizeObserver.observe(container);
    }
  }

  /**
   * Set viewport-lock state and immediately resize if locking on.
   */
  setViewportLocked(locked) {
    this._viewportLocked = locked;
    if (this._lockBtn) {
      this._lockBtn.classList.toggle("active", locked);
      this._lockBtn.title = locked ? "Unlock from viewport" : "Fit to viewport";
    }
    if (locked) {
      this.constrainToViewport();
    }
    if (this.onStateChange) this.onStateChange();
  }

  /**
   * Set the cursor keys toggle state and optional change handler.
   */
  setCursorKeysState(enabled) {
    if (this._cursorKeysCheckbox) {
      this._cursorKeysCheckbox.checked = enabled;
    }
  }

  onCursorKeysToggle(callback) {
    if (this._cursorKeysCheckbox) {
      this._cursorKeysCheckbox.addEventListener("change", () => {
        callback(this._cursorKeysCheckbox.checked);
      });
    }
  }

  /**
   * Move #screen canvas from #monitor-frame into this window's content area.
   */
  attachCanvas() {
    const canvas = document.getElementById("screen");
    if (!canvas) return;

    const container = this.contentElement.querySelector(
      ".screen-window-content",
    );
    if (!container) return;

    // Clear any inline sizing
    canvas.style.width = "";
    canvas.style.height = "";
    canvas.style.marginTop = "";

    container.appendChild(canvas);

    if (this.textSelection) {
      this.textSelection.reattach();
    }

    this._fitCanvas();
  }

  /**
   * Move #screen canvas back into #monitor-frame (used by full-page mode).
   */
  detachCanvas() {
    const canvas = document.getElementById("screen");
    if (!canvas) return;

    const frame = document.getElementById("monitor-frame");
    if (!frame) return;

    frame.appendChild(canvas);

    // Clear inline styles
    canvas.style.width = "";
    canvas.style.height = "";

    if (this.textSelection) {
      this.textSelection.reattach();
    }
  }

  /**
   * After showing, fit the canvas to the content area.
   */
  show() {
    super.show();
    requestAnimationFrame(() => this._fitCanvas());
  }

  /**
   * Get window state for persistence (adds viewportLocked).
   */
  getState() {
    const base = super.getState();
    base.viewportLocked = this._viewportLocked;
    return base;
  }

  /**
   * Restore persisted state.
   */
  restoreState(state) {
    if (state.viewportLocked) {
      this.setViewportLocked(true);
    }
    super.restoreState(state);
  }

  /**
   * Constrain to viewport.  When viewport-locked, fill the available
   * area and centre.  The canvas handles its own 4:3 aspect ratio
   * via _fitCanvas.
   */
  constrainToViewport() {
    if (!this.element) return;

    if (this._viewportLocked) {
      const vpW = window.innerWidth;
      const vpH = window.innerHeight;
      const header = document.querySelector("header");
      const footer = document.querySelector("footer");
      const minTop = header ? header.offsetHeight : 0;
      const footerH = footer ? footer.offsetHeight : 0;
      const margin = 8;

      const w = vpW - margin * 2;
      const h = vpH - minTop - footerH - margin * 2;
      const x = margin;
      const y = minTop + margin;

      this.element.style.width = `${w}px`;
      this.element.style.height = `${h}px`;
      this.element.style.left = `${x}px`;
      this.element.style.top = `${y}px`;
      this.currentWidth = w;
      this.currentHeight = h;
      this.currentX = x;
      this.currentY = y;

      this.lastViewportWidth = vpW;
      this.lastViewportHeight = vpH;
    } else {
      super.constrainToViewport();
    }
  }

  /**
   * Override resize to enforce 4:3 aspect ratio on the content area.
   * Whichever dimension the user drags drives the other so the window
   * always holds an exact 4:3 content rectangle.
   */
  resize(e) {
    const dir = this.resizeDirection;

    // Let the base class compute unconstrained new dimensions
    super.resize(e);

    // Enforce 4:3 on the content area (window height = content + header)
    const headerHeight = this.headerElement
      ? this.headerElement.offsetHeight
      : 0;
    const ASPECT = 4 / 3; // width / height

    // Anchor edges: resizing from n keeps bottom fixed, from w keeps right fixed
    const bottom = this.currentY + this.currentHeight;
    const right = this.currentX + this.currentWidth;

    let newWidth = this.currentWidth;
    let newHeight;

    if (dir === "n" || dir === "s") {
      // Pure vertical drag: width follows height
      const contentHeight = this.currentHeight - headerHeight;
      newWidth = Math.round(contentHeight * ASPECT);
      newHeight = this.currentHeight;
    } else {
      // Has horizontal component (e, w, corners): height follows width
      const targetContentHeight = Math.round(this.currentWidth / ASPECT);
      newHeight = targetContentHeight + headerHeight;
    }

    // Enforce minimums while maintaining ratio
    if (newWidth < this.minWidth) {
      newWidth = this.minWidth;
      newHeight = Math.round(newWidth / ASPECT) + headerHeight;
    }
    if (newHeight < this.minHeight) {
      newHeight = this.minHeight;
      newWidth = Math.round((newHeight - headerHeight) * ASPECT);
    }

    // Adjust position so the anchored edge stays fixed
    let newLeft = this.currentX;
    let newTop = this.currentY;

    if (dir.includes("n")) {
      newTop = bottom - newHeight;
    }
    if (dir.includes("w")) {
      newLeft = right - newWidth;
    }

    // Apply the aspect-corrected dimensions and position
    this.element.style.width = `${newWidth}px`;
    this.element.style.height = `${newHeight}px`;
    this.element.style.left = `${newLeft}px`;
    this.element.style.top = `${newTop}px`;
    this.currentWidth = newWidth;
    this.currentHeight = newHeight;
    this.currentX = newLeft;
    this.currentY = newTop;

    this._fitCanvas();
  }

  /**
   * After resize completes, do a final canvas fit.
   */
  handleMouseUp(e) {
    const wasResizing = this.isResizing;
    super.handleMouseUp(e);
    if (wasResizing) {
      this._fitCanvas();
    }
  }

  /**
   * Compute the largest 4:3 rectangle that fits within the content
   * container and apply it to the canvas display size and renderer.
   */
  _fitCanvas() {
    const container = this.contentElement?.querySelector(
      ".screen-window-content",
    );
    const canvas = document.getElementById("screen");
    if (!container || !canvas) return;

    const cw = container.clientWidth;
    const ch = container.clientHeight;
    if (cw <= 0 || ch <= 0) return;

    let w, h;
    if ((cw * 3) / 4 <= ch) {
      w = cw;
      h = (cw * 3) / 4;
    } else {
      h = ch;
      w = (ch * 4) / 3;
    }
    w = Math.floor(w);
    h = Math.floor(h);

    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    if (this.renderer) {
      this.renderer.resize(w, h);
    }
    if (this.textSelection) {
      this.textSelection.resize();
    }
  }

  /**
   * Clean up ResizeObserver.
   */
  destroy() {
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
    super.destroy();
  }
}
