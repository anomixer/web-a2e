/*
 * hard-drive-window.js - Hard drive window UI
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { BaseWindow } from "../windows/base-window.js";

export class HardDriveWindow extends BaseWindow {
  constructor() {
    super({
      id: "hard-drives",
      title: "SmartPort Drives",
      minWidth: 600,
      minHeight: 140,
      maxWidth: 600,
      maxHeight: 140,
      defaultWidth: 600,
      defaultHeight: 140,
      resizeDirections: [],
    });
  }

  _deviceHTML(num) {
    return `
      <div class="hd-device" id="hd-device${num}">
        <div class="hd-header">
          <span class="hd-led" title="Activity"></span>
          <span class="hd-label">Device ${num + 1}</span>
        </div>
        <div class="hd-info-row">
          <span class="hd-name">No Image</span>
          <span class="hd-info"></span>
        </div>
        <div class="hd-controls">
          <input type="file" id="hd-device${num}-input" accept=".hdv,.po,.2mg" hidden />
          <button class="hd-insert" title="Insert SmartPort Image">Insert</button>
          <div class="hd-recent-container">
            <button class="hd-recent" title="Recent Images">Recent</button>
            <div class="hd-recent-dropdown"></div>
          </div>
          <button class="hd-eject" disabled title="Eject Image">Eject</button>
          <button class="hd-browse" disabled title="Browse Files">Browse</button>
        </div>
      </div>`;
  }

  renderContent() {
    return `
      <div class="hd-devices-row">
        ${this._deviceHTML(0)}
        ${this._deviceHTML(1)}
      </div>
    `;
  }
}
