// Disk Drives Window
// Hosts the disk drive UI inside a standard BaseWindow
// Maintains aspect ratio during resize so disk panels fill the window.
// Includes collapsible technical detail panels per drive.

import { BaseWindow } from '../windows/base-window.js';

export class DiskDrivesWindow extends BaseWindow {
  constructor() {
    super({
      id: 'disk-drives',
      title: 'Disk Drives',
      minWidth: 460,
      minHeight: 310,
      defaultWidth: 560,
      defaultHeight: 360,
      defaultPosition: { x: 100, y: 452 },
    });

    this._detailsOpen = false;
  }

  _driveHTML(num) {
    const prefix = `dd-d${num}`;
    return `
      <div class="disk-drive" id="disk${num}">
        <div class="drive-image-container">
          <canvas class="disk-surface" width="560" height="480"></canvas>
          <span class="drive-label">D${num}</span>
        </div>
        <div class="drive-info">
          <span class="disk-name">No Disk</span>
          <span class="disk-track" title="Current Track">T--</span>
        </div>
        <div class="drive-controls">
          <input type="file" id="disk${num}-input" accept=".dsk,.do,.po,.woz,.nib" hidden />
          <button class="disk-insert" title="Insert Disk from File">Insert</button>
          <div class="recent-container">
            <button class="disk-recent" title="Recent Disks">Recent</button>
            <div class="recent-dropdown"></div>
          </div>
          <button class="disk-blank" title="Insert Blank Disk">Blank</button>
          <button class="disk-eject" disabled title="Eject Disk">Eject</button>
        </div>
        <div class="drive-detail-panel">
          <div class="drive-detail-grid">
            <span class="dd-label">QTrack</span><span class="dd-val" id="${prefix}-qt">0</span>
            <span class="dd-label">Phase</span><span class="dd-val" id="${prefix}-phase">0</span>
            <span class="dd-label">Nibble</span><span class="dd-val" id="${prefix}-nibble">0</span>
            <span class="dd-label">Motor</span><span class="dd-val" id="${prefix}-motor">OFF</span>
            <span class="dd-label">Mode</span><span class="dd-val" id="${prefix}-mode">Read</span>
            <span class="dd-label">Byte</span><span class="dd-val" id="${prefix}-byte">00</span>
          </div>
        </div>
      </div>`;
  }

  renderContent() {
    return `
      <div class="disk-drives-row">
        ${this._driveHTML(1)}
        ${this._driveHTML(2)}
      </div>
      <div class="drive-detail-toggle-bar">
        <button class="drive-detail-toggle">Details</button>
      </div>
    `;
  }

  onContentRendered() {
    const btn = this.contentElement.querySelector('.drive-detail-toggle');
    if (btn) {
      btn.addEventListener('click', () => this._toggleDetails());
    }
  }

  _toggleDetails() {
    this._detailsOpen = !this._detailsOpen;
    this.contentElement.classList.toggle('show-details', this._detailsOpen);
    // Re-fit height since the content changed
    this._layoutMetrics = null;
    this._fitHeight();
  }

  /**
   * Update technical details from WASM state (called by WindowManager.updateAll)
   */
  update(wasmModule) {
    if (!this._detailsOpen) return;

    const selectedDrive = wasmModule._getSelectedDrive();
    const lastByte = wasmModule._getLastDiskByte();

    for (let d = 0; d < 2; d++) {
      const prefix = `dd-d${d + 1}`;
      const el = (id) => this.contentElement.querySelector(`#${prefix}-${id}`);

      const qt = el('qt');
      if (qt) qt.textContent = wasmModule._getDiskHeadPosition(d);

      const phase = el('phase');
      if (phase) phase.textContent = wasmModule._getDiskPhase(d);

      const nibble = el('nibble');
      if (nibble) nibble.textContent = wasmModule._getCurrentNibblePosition(d);

      const motor = el('motor');
      if (motor) {
        const on = wasmModule._getDiskMotorOn(d);
        motor.textContent = on ? 'ON' : 'OFF';
        motor.classList.toggle('on', on);
      }

      const mode = el('mode');
      if (mode) {
        const w = wasmModule._getDiskWriteMode(d);
        mode.textContent = w ? 'Write' : 'Read';
        mode.classList.toggle('write', w);
      }

      const byte = el('byte');
      if (byte) {
        byte.textContent = d === selectedDrive
          ? lastByte.toString(16).toUpperCase().padStart(2, '0')
          : '--';
      }
    }
  }

  /**
   * After showing, re-measure layout and fit the window height.
   */
  show() {
    super.show();
    // Invalidate cached metrics — they may be stale from when hidden
    this._layoutMetrics = null;
    this._fitHeight();
  }

  /**
   * After restoring persisted state, re-derive height from the restored width
   * so the window always wraps its content.
   */
  restoreState(state) {
    // Restore position and width only; we'll derive height ourselves
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

    this.constrainToViewport();
    this.updateEdgeDistances();

    if (state.visible) {
      this.show();
    }
  }

  /**
   * Measure layout then set the correct height for the current width.
   */
  _fitHeight() {
    // First pass: auto-height so we can measure the real layout
    this.element.style.height = "auto";
    // Force layout so measurements are valid
    this.element.offsetHeight; // eslint-disable-line no-unused-expressions
    this._measureLayout();

    const h = Math.max(this.minHeight, this._heightForWidth(this.currentWidth));
    this.element.style.height = `${h}px`;
    this.currentHeight = h;
  }

  /**
   * Compute the correct window height for a given window width.
   * Only the canvas scales; everything else is fixed-pixel.
   *
   *   canvasWidth  = (windowWidth - hPad) / 2
   *   canvasHeight = canvasWidth * (240 / 280)
   *   windowHeight = canvasHeight + vFixed
   *
   * hPad   = window border + content padding + row padding + row gap
   * vFixed = header + content padding + row padding + info + controls + gaps
   */
  _heightForWidth(w) {
    // Measure once
    if (!this._layoutMetrics) this._measureLayout();
    const m = this._layoutMetrics;
    const canvasW = (w - m.hPad) / 2;
    const canvasH = canvasW * (240 / 280);
    return Math.round(canvasH + m.vFixed);
  }

  /**
   * Measure the fixed horizontal padding and vertical overhead once.
   * Must be called while the window is visible.
   */
  _measureLayout() {
    const canvas = this.element.querySelector(".disk-surface");
    const canvasRect = canvas.getBoundingClientRect();
    const windowRect = this.element.getBoundingClientRect();

    // hPad: everything in the width that isn't the two canvases
    const hPad = windowRect.width - canvasRect.width * 2;

    // vFixed: everything in the height that isn't the canvas
    const vFixed = windowRect.height - canvasRect.height;

    this._layoutMetrics = { hPad, vFixed };
  }

  /**
   * At drag start, ensure layout metrics are available.
   */
  startResize(e, direction) {
    if (!this._layoutMetrics) this._measureLayout();
    super.startResize(e, direction);
  }

  /**
   * Width drives the canvas size; fixed chrome stays constant.
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

    // Horizontal drag → width changes directly
    if (dir.includes("e")) {
      newWidth = this.resizeStart.width + dx;
    }
    if (dir.includes("w")) {
      const proposed = this.resizeStart.width - dx;
      if (proposed >= this.minWidth) {
        newWidth = proposed;
        newLeft = this.resizeStart.left + dx;
      }
    }

    // Pure vertical drag → reverse-derive width from proposed height
    if (!dir.includes("e") && !dir.includes("w")) {
      let proposedHeight = this.resizeStart.height;
      if (dir.includes("s")) proposedHeight = this.resizeStart.height + dy;
      if (dir.includes("n")) proposedHeight = this.resizeStart.height - dy;
      const m = this._layoutMetrics;
      const canvasH = Math.max(0, proposedHeight - m.vFixed);
      const canvasW = canvasH / (240 / 280);
      newWidth = canvasW * 2 + m.hPad;
    }

    // Clamp width
    newLeft = Math.max(0, newLeft);
    if (newLeft + newWidth > window.innerWidth) {
      newWidth = window.innerWidth - newLeft;
    }
    newWidth = Math.max(this.minWidth, newWidth);

    // Derive height
    let newHeight = Math.max(this.minHeight, this._heightForWidth(newWidth));

    // Adjust top for north drags
    if (dir.includes("n")) {
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
  }
}
