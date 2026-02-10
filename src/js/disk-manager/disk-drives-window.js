/*
 * disk-drives-window.js - Disk drives window UI
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { BaseWindow } from "../windows/base-window.js";

export class DiskDrivesWindow extends BaseWindow {
  constructor() {
    super({
      id: "disk-drives",
      title: "Disk Drives",
      minWidth: 460,
      minHeight: 100,
      maxWidth: 460,
      defaultWidth: 460,
      defaultHeight: 310,
      defaultPosition: { x: 100, y: 452 },
      resizeDirections: [],
    });

    this._detailsOpen = false;
    this._graphicsHidden = false;
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
          <button class="disk-browse" disabled title="Browse Files">Browse</button>
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
    `;
  }

  onContentRendered() {
    const closeBtn = this.headerElement.querySelector(
      `.${this.cssClasses.close}`,
    );

    this._graphicsBtn = document.createElement("button");
    this._graphicsBtn.className = "drive-graphics-btn active";
    this._graphicsBtn.title = "Toggle disk graphics";
    this._graphicsBtn.innerHTML = `
      <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
        <path d="M8 3C4.5 3 1.6 5.3.6 8c1 2.7 3.9 5 7.4 5s6.4-2.3 7.4-5c-1-2.7-3.9-5-7.4-5zm0 8.5A3.5 3.5 0 1 1 8 4.5a3.5 3.5 0 0 1 0 7zm0-5.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/>
      </svg>
    `;
    this.headerElement.insertBefore(this._graphicsBtn, closeBtn);
    this._graphicsBtn.addEventListener("mousedown", (e) => e.stopPropagation());
    this._graphicsBtn.addEventListener("click", () => this._toggleGraphics());

    this._detailBtn = document.createElement("button");
    this._detailBtn.className = "drive-detail-btn";
    this._detailBtn.title = "Toggle details";
    this._detailBtn.innerHTML = `
      <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
        <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 2.5a1 1 0 1 1 0 2 1 1 0 0 1 0-2zM6.5 7h1.75v4.5H10v1H6v-1h1.25V8H6.5V7z"/>
      </svg>
    `;
    this.headerElement.insertBefore(this._detailBtn, closeBtn);
    this._detailBtn.addEventListener("mousedown", (e) => e.stopPropagation());
    this._detailBtn.addEventListener("click", () => this._toggleDetails());

  }

  show() {
    super.show();
    this._fitToContent();
  }

  _toggleGraphics() {
    this._graphicsHidden = !this._graphicsHidden;
    this.contentElement.classList.toggle("hide-graphics", this._graphicsHidden);
    if (this._graphicsBtn) {
      this._graphicsBtn.classList.toggle("active", !this._graphicsHidden);
    }
    this._fitToContent();
    if (this.onStateChange) this.onStateChange();
  }

  _toggleDetails() {
    this._detailsOpen = !this._detailsOpen;
    this.contentElement.classList.toggle("show-details", this._detailsOpen);
    if (this._detailBtn) {
      this._detailBtn.classList.toggle("active", this._detailsOpen);
    }
    this._fitToContent();
    if (this.onStateChange) this.onStateChange();
  }

  _fitToContent() {
    if (!this.element) return;
    // Temporarily set auto height to measure natural size
    const prevHeight = this.element.style.height;
    this.element.style.height = 'auto';
    const newHeight = this.element.offsetHeight;
    this.element.style.height = `${newHeight}px`;
    this.currentHeight = newHeight;
    this.minHeight = newHeight;
    this.maxHeight = newHeight;
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

      const qt = el("qt");
      if (qt) qt.textContent = wasmModule._getDiskHeadPosition(d);

      const phase = el("phase");
      if (phase) phase.textContent = wasmModule._getDiskPhase(d);

      const nibble = el("nibble");
      if (nibble) nibble.textContent = wasmModule._getCurrentNibblePosition(d);

      const motor = el("motor");
      if (motor) {
        const on = wasmModule._getDiskMotorOn(d);
        motor.textContent = on ? "ON" : "OFF";
        motor.classList.toggle("on", on);
      }

      const mode = el("mode");
      if (mode) {
        const w = wasmModule._getDiskWriteMode(d);
        mode.textContent = w ? "Write" : "Read";
        mode.classList.toggle("write", w);
      }

      const byte = el("byte");
      if (byte) {
        byte.textContent =
          d === selectedDrive
            ? lastByte.toString(16).toUpperCase().padStart(2, "0")
            : "--";
      }
    }
  }

  getState() {
    const base = super.getState();
    base.graphicsHidden = this._graphicsHidden;
    base.detailsOpen = this._detailsOpen;
    return base;
  }

  restoreState(state) {
    if (state.graphicsHidden) {
      this._graphicsHidden = true;
      this.contentElement.classList.add("hide-graphics");
      if (this._graphicsBtn) this._graphicsBtn.classList.remove("active");
    }
    if (state.detailsOpen) {
      this._detailsOpen = true;
      this.contentElement.classList.add("show-details");
      if (this._detailBtn) this._detailBtn.classList.add("active");
    }

    super.restoreState(state);
  }
}
