// Screen Window
// Hosts the emulator canvas inside a standard BaseWindow.
// Maintains 4:3 aspect ratio during resize.

import { BaseWindow } from '../windows/base-window.js';

export class ScreenWindow extends BaseWindow {
  constructor(renderer, textSelection) {
    super({
      id: 'screen-window',
      title: 'Apple //e',
      minWidth: 284,    // 280 min canvas + 4px padding/border
      minHeight: 244,   // 210 min canvas + ~34px header
      defaultWidth: 480,
      defaultHeight: 394,
      defaultPosition: { x: 100, y: 50 },
      closable: false,
    });

    this.renderer = renderer;
    this.textSelection = textSelection;
    this._layoutMetrics = null;
    this._viewportLocked = false;
  }

  renderContent() {
    return '<div class="screen-window-content"></div>';
  }

  /**
   * After create(), inject the charset toggle into the header.
   */
  onContentRendered() {
    const charsetSwitch = document.createElement('div');
    charsetSwitch.className = 'screen-window-charset-switch';
    charsetSwitch.title = 'Character Set (US/UK)';
    charsetSwitch.innerHTML = `
      <span class="charset-label">US</span>
      <label class="charset-toggle">
        <input type="checkbox" id="screen-window-charset-toggle" />
        <span class="charset-slider"></span>
      </label>
      <span class="charset-label">UK</span>
    `;

    // Viewport lock button
    this._lockBtn = document.createElement('button');
    this._lockBtn.className = 'screen-window-lock';
    this._lockBtn.title = 'Fit to viewport';
    this._lockBtn.innerHTML = `
      <svg class="lock-icon-unlocked" viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
        <path d="M4 7V5a4 4 0 0 1 8 0v1h-2V5a2 2 0 0 0-4 0v2H3a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1H4z"/>
      </svg>
      <svg class="lock-icon-locked" viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
        <path d="M4 7V5a4 4 0 0 1 8 0v2h1a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h1zm2-2v2h4V5a2 2 0 0 0-4 0z"/>
      </svg>
    `;

    // Insert charset switch and lock button into header
    this.headerElement.appendChild(charsetSwitch);
    this.headerElement.appendChild(this._lockBtn);

    // Prevent clicks from starting a window drag
    charsetSwitch.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });
    this._lockBtn.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });
    this._lockBtn.addEventListener('click', () => {
      this.setViewportLocked(!this._viewportLocked);
    });
  }

  /**
   * Set viewport-lock state and immediately resize if locking on.
   */
  setViewportLocked(locked) {
    this._viewportLocked = locked;
    if (this._lockBtn) {
      this._lockBtn.classList.toggle('active', locked);
      this._lockBtn.title = locked
        ? 'Unlock from viewport'
        : 'Fit to viewport';
    }
    if (locked) {
      this.constrainToViewport();
    }
    if (this.onStateChange) this.onStateChange();
  }

  /**
   * Move #screen canvas from #monitor-frame into this window's content area.
   */
  attachCanvas() {
    const canvas = document.getElementById('screen');
    if (!canvas) return;

    const container = this.contentElement.querySelector('.screen-window-content');
    if (!container) return;

    // Clear any inline sizing
    canvas.style.width = '';
    canvas.style.height = '';
    canvas.style.marginTop = '';

    container.appendChild(canvas);

    if (this.textSelection) {
      this.textSelection.reattach();
    }

    this._layoutMetrics = null;
    this._fitToWindow();
  }

  /**
   * Move #screen canvas back into #monitor-frame (used by full-page mode).
   */
  detachCanvas() {
    const canvas = document.getElementById('screen');
    if (!canvas) return;

    const frame = document.getElementById('monitor-frame');
    if (!frame) return;

    frame.appendChild(canvas);

    // Clear inline styles
    canvas.style.width = '';
    canvas.style.height = '';

    if (this.textSelection) {
      this.textSelection.reattach();
    }
  }

  /**
   * After showing, invalidate metrics and fit canvas.
   */
  show() {
    super.show();
    this._layoutMetrics = null;
    // Defer fit so layout is settled (skip if viewport-locked — constrainToViewport handles sizing)
    if (!this._viewportLocked) {
      requestAnimationFrame(() => this._fitToWindow());
    }
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
   * After restoring persisted state, derive height from width to maintain 4:3.
   */
  restoreState(state) {
    if (state.viewportLocked) {
      this.setViewportLocked(true);
    }

    if (state.x !== undefined) {
      this.element.style.left = `${state.x}px`;
      this.currentX = state.x;
    }
    if (state.y !== undefined) {
      this.element.style.top = `${state.y}px`;
      this.currentY = state.y;
    }
    if (state.width !== undefined) {
      const width = Math.max(state.width, this.minWidth);
      this.element.style.width = `${width}px`;
      this.currentWidth = width;
    }

    // Derive height from width for 4:3 aspect ratio
    const h = Math.max(this.minHeight, this._heightForWidth(this.currentWidth));
    this.element.style.height = `${h}px`;
    this.currentHeight = h;

    this.constrainToViewport();
    this.updateEdgeDistances();

    if (state.visible) {
      this.show();
    }
  }

  /**
   * Constrain to viewport.  When viewport-locked, resize to fill the
   * available area at 4:3 and centre.  Otherwise just shrink if needed.
   * Called by WindowManager on browser resize.
   */
  constrainToViewport() {
    if (!this.element) return;

    const vpW = window.innerWidth;
    const vpH = window.innerHeight;
    const header = document.querySelector('header');
    const footer = document.querySelector('footer');
    const minTop = header ? header.offsetHeight : 0;
    const footerH = footer ? footer.offsetHeight : 0;
    const maxBottom = vpH - footerH;
    const availW = vpW;
    const availH = maxBottom - minTop;
    const margin = 8;

    const m = this._layoutMetrics || { hPad: 4, vFixed: 34 };
    let w = this.currentWidth;
    let h = this.currentHeight;

    if (this._viewportLocked) {
      // Fill the available viewport at 4:3
      const maxCanvasW = availW - margin * 2 - m.hPad;
      const maxCanvasH = availH - margin * 2 - m.vFixed;

      let canvasW, canvasH;
      if (maxCanvasW * 3 / 4 <= maxCanvasH) {
        canvasW = maxCanvasW;
        canvasH = canvasW * 3 / 4;
      } else {
        canvasH = maxCanvasH;
        canvasW = canvasH * 4 / 3;
      }

      w = Math.max(this.minWidth, Math.round(canvasW + m.hPad));
      h = Math.max(this.minHeight, Math.round(canvasH + m.vFixed));

      const x = Math.round((vpW - w) / 2);
      const y = minTop + Math.round((availH - h) / 2);

      this.element.style.width = `${w}px`;
      this.element.style.height = `${h}px`;
      this.element.style.left = `${x}px`;
      this.element.style.top = `${y}px`;
      this.currentWidth = w;
      this.currentHeight = h;
      this.currentX = x;
      this.currentY = y;
      this._updateRendererSize();
    } else {
      // Only shrink if the window exceeds the available space
      if (w > availW || h > availH) {
        const maxCanvasW = availW - m.hPad;
        const maxCanvasH = availH - m.vFixed;

        let canvasW, canvasH;
        if (maxCanvasW * 3 / 4 <= maxCanvasH) {
          canvasW = maxCanvasW;
          canvasH = canvasW * 3 / 4;
        } else {
          canvasH = maxCanvasH;
          canvasW = canvasH * 4 / 3;
        }

        w = Math.max(this.minWidth, Math.round(canvasW + m.hPad));
        h = Math.max(this.minHeight, Math.round(canvasH + m.vFixed));

        this.element.style.width = `${w}px`;
        this.element.style.height = `${h}px`;
        this.currentWidth = w;
        this.currentHeight = h;
        this._updateRendererSize();
      }

      // Clamp position within bounds
      let x = this.currentX;
      let y = this.currentY;

      if (x + w > vpW) x = vpW - w;
      if (x < 0) x = 0;
      if (y + h > maxBottom) y = maxBottom - h;
      if (y < minTop) y = minTop;

      if (x !== this.currentX || y !== this.currentY) {
        this.element.style.left = `${x}px`;
        this.element.style.top = `${y}px`;
        this.currentX = x;
        this.currentY = y;
      }
    }

    this.lastViewportWidth = vpW;
    this.lastViewportHeight = vpH;
  }

  /**
   * At resize start, ensure layout metrics exist.
   */
  startResize(e, direction) {
    if (!this._layoutMetrics) this._measureLayout();
    super.startResize(e, direction);
  }

  /**
   * Width-driven resize maintaining 4:3 canvas aspect ratio.
   */
  resize(e) {
    const dx = e.clientX - this.resizeStart.x;
    const dy = e.clientY - this.resizeStart.y;
    const dir = this.resizeDirection;

    // Get header and footer heights for bounds checking
    const header = document.querySelector('header');
    const footer = document.querySelector('footer');
    const minTop = header ? header.offsetHeight : 0;
    const footerHeight = footer ? footer.offsetHeight : 0;
    const maxBottom = window.innerHeight - footerHeight;

    let newWidth = this.resizeStart.width;
    let newLeft = this.resizeStart.left;
    let newTop = this.resizeStart.top;

    // Horizontal drag changes width
    if (dir.includes('e')) {
      newWidth = this.resizeStart.width + dx;
    }
    if (dir.includes('w')) {
      const proposed = this.resizeStart.width - dx;
      if (proposed >= this.minWidth) {
        newWidth = proposed;
        newLeft = this.resizeStart.left + dx;
      }
    }

    // Pure vertical drag — reverse-derive width from height
    if (!dir.includes('e') && !dir.includes('w')) {
      let proposedHeight = this.resizeStart.height;
      if (dir.includes('s')) proposedHeight = this.resizeStart.height + dy;
      if (dir.includes('n')) proposedHeight = this.resizeStart.height - dy;
      const m = this._layoutMetrics || { hPad: 4, vFixed: 34 };
      const canvasH = Math.max(0, proposedHeight - m.vFixed);
      const canvasW = canvasH * (4 / 3);
      newWidth = canvasW + m.hPad;
    }

    // Clamp width
    newLeft = Math.max(0, newLeft);
    if (newLeft + newWidth > window.innerWidth) {
      newWidth = window.innerWidth - newLeft;
    }
    newWidth = Math.max(this.minWidth, newWidth);

    // Derive height from width
    let newHeight = Math.max(this.minHeight, this._heightForWidth(newWidth));

    // Adjust top for north drags
    if (dir.includes('n')) {
      newTop = this.resizeStart.top + this.resizeStart.height - newHeight;
    }

    // Clamp vertically (respect header and footer)
    newTop = Math.max(minTop, newTop);
    if (newTop + newHeight > maxBottom) {
      newHeight = maxBottom - newTop;
    }

    this.element.style.width = `${newWidth}px`;
    this.element.style.height = `${newHeight}px`;
    this.element.style.left = `${newLeft}px`;
    this.element.style.top = `${newTop}px`;
    this.currentWidth = newWidth;
    this.currentHeight = newHeight;
    this.currentX = newLeft;
    this.currentY = newTop;

    // Resize the WebGL renderer to match the new canvas size
    this._updateRendererSize();
  }

  /**
   * After resize completes, update renderer.
   */
  handleMouseUp(e) {
    const wasResizing = this.isResizing;
    super.handleMouseUp(e);
    if (wasResizing) {
      this._updateRendererSize();
    }
  }

  /**
   * Compute correct window height for a given width (4:3 canvas).
   *   canvasW = windowW - hPad
   *   canvasH = canvasW / (4/3)
   *   windowH = canvasH + vFixed
   */
  _heightForWidth(w) {
    if (!this._layoutMetrics) this._measureLayout();
    const m = this._layoutMetrics;
    const canvasW = w - m.hPad;
    const canvasH = canvasW / (4 / 3);
    return Math.round(canvasH + m.vFixed);
  }

  /**
   * Measure the fixed padding/chrome once while visible.
   */
  _measureLayout() {
    const canvas = this.element.querySelector('#screen');
    if (!canvas) {
      // Fallback if canvas hasn't been attached yet
      this._layoutMetrics = { hPad: 4, vFixed: 34 };
      return;
    }

    const canvasRect = canvas.getBoundingClientRect();
    const windowRect = this.element.getBoundingClientRect();

    if (canvasRect.width === 0 || canvasRect.height === 0) {
      // Canvas not visible yet, use fallback
      this._layoutMetrics = { hPad: 4, vFixed: 34 };
      return;
    }

    const hPad = windowRect.width - canvasRect.width;
    const vFixed = windowRect.height - canvasRect.height;

    this._layoutMetrics = { hPad, vFixed };
  }

  /**
   * Set window height to match current width at 4:3.
   * Skipped when viewport-locked (constrainToViewport manages sizing).
   */
  _fitToWindow() {
    if (!this.isVisible || this._viewportLocked) return;

    this._measureLayout();
    const h = Math.max(this.minHeight, this._heightForWidth(this.currentWidth));
    this.element.style.height = `${h}px`;
    this.currentHeight = h;

    this._updateRendererSize();
  }

  /**
   * Tell the WebGL renderer about the current canvas display size.
   */
  _updateRendererSize() {
    const canvas = this.element.querySelector('#screen');
    if (!canvas || !this.renderer) return;

    const rect = canvas.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      this.renderer.resize(rect.width, rect.height);
    }

    if (this.textSelection) {
      this.textSelection.resize();
    }
  }
}
