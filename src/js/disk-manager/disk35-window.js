/*
 * disk35-window.js - A IIgs's 3.5" drives
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { BaseWindow } from "../windows/base-window.js";

/*
 * Laid out as the 5.25" Drives window is, and with its classes, because
 * they are the same kind of thing: a disk turning under a head, drawn by the
 * same surface renderer with a 3.5" disk's eighty tracks. What differs is
 * underneath: these drives step and spin under the drive's own control, and
 * the machine can eject a disk from one itself.
 */
export class Disk35Window extends BaseWindow {
  constructor() {
    super({
      id: "disk35-drives",
      title: "3.5\" Drives",
      minWidth: 560,
      maxWidth: 800,
      defaultWidth: 600,
      defaultHeight: 380,
      resizeDirections: ["e", "w"],
    });
  }

  _driveHTML(num) {
    return `
      <div class="disk-drive" id="d35-drive${num}">
        <div class="drive-image-container">
          <canvas class="disk-surface" width="560" height="480"></canvas>
          <span class="drive-label">D${num + 1}</span>
        </div>
        <div class="drive-info">
          <span class="disk-name">No Disk</span>
          <span class="disk-track" title="Track and side under the head">T--</span>
        </div>
        <div class="drive-controls">
          <input type="file" id="d35-drive${num}-input" accept=".po,.2mg,.dsk,.hdv,.img,.woz" hidden />
          <button class="disk-insert" title="Insert 3.5&quot; Disk">Insert</button>
          <div class="recent-container">
            <button class="disk-recent" title="Recent Disks">Recent</button>
            <div class="recent-dropdown"></div>
          </div>
          <button class="disk-eject" disabled title="Eject Disk">Eject</button>
        </div>
      </div>`;
  }

  renderContent() {
    return `
      <div class="disk-drives-row">
        ${this._driveHTML(0)}
        ${this._driveHTML(1)}
      </div>
    `;
  }

  onContentRendered() {
    this._fitToContent();
  }

  show() {
    super.show();
    this._fitToContent();
  }

  // The height follows the content, as the 5.25" window's does.
  _fitToContent() {
    if (!this.element || this._isPaneled) return;
    this.element.style.height = "auto";
    const height = this.element.offsetHeight;
    this.element.style.height = `${height}px`;
    this.currentHeight = height;
    this.minHeight = height;
    this.maxHeight = height;
    this.updateEdgeDistances();
    this.constrainToViewport();
  }
}
