// Screen Window
// Hosts the emulator canvas inside a standard BaseWindow when bezel is disabled.
// Maintains 4:3 aspect ratio during resize.

import { BaseWindow } from '../windows/base-window.js';

export class ScreenWindow extends BaseWindow {
  constructor(renderer, textSelection) {
    super({
      id: 'screen-window',
      title: 'Apple //e',
      minWidth: 284,    // 280 min canvas + 4px padding/border
      minHeight: 244,   // 210 min canvas + ~34px header
      defaultWidth: 564,
      defaultHeight: 418,
      defaultPosition: { x: 100, y: 60 },
    });

    this.renderer = renderer;
    this.textSelection = textSelection;
    this.onBezelRestore = null; // callback set by main.js
    this._layoutMetrics = null;
  }

  renderContent() {
    return '<div class="screen-window-content"></div>';
  }

  /**
   * Move #screen canvas from bezel into this window's content area.
   */
  attachCanvas() {
    const canvas = document.getElementById('screen');
    if (!canvas) return;

    const container = this.contentElement.querySelector('.screen-window-content');
    if (!container) return;

    // Clear any inline sizing from MonitorResizer
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
   * Move #screen canvas back into the bezel's .monitor-screen-wrapper.
   */
  detachCanvas() {
    const canvas = document.getElementById('screen');
    if (!canvas) return;

    const wrapper = document.querySelector('.monitor-screen-wrapper');
    if (!wrapper) return;

    // Insert before .scanlines so overlay order is preserved
    const scanlines = wrapper.querySelector('.scanlines');
    if (scanlines) {
      wrapper.insertBefore(canvas, scanlines);
    } else {
      wrapper.appendChild(canvas);
    }

    // Clear inline styles
    canvas.style.width = '';
    canvas.style.height = '';

    if (this.textSelection) {
      this.textSelection.reattach();
    }
  }

  /**
   * Override hide — closing the screen window restores the bezel
   * so the screen is always visible.
   */
  hide() {
    if (this.onBezelRestore) {
      this.onBezelRestore();
      return; // callback handles hiding and bezel restore
    }
    super.hide();
  }

  /**
   * After showing, invalidate metrics and fit canvas.
   */
  show() {
    super.show();
    this._layoutMetrics = null;
    // Defer fit so layout is settled
    requestAnimationFrame(() => this._fitToWindow());
  }

  /**
   * After restoring persisted state, derive height from width to maintain 4:3.
   */
  restoreState(state) {
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

    // Clamp vertically
    newTop = Math.max(0, newTop);
    if (newTop + newHeight > window.innerHeight) {
      newHeight = window.innerHeight - newTop;
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
   */
  _fitToWindow() {
    if (!this.isVisible) return;

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
