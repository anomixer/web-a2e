/*
 * fullscreen-drive-popouts.js - Slide-out drive panels for full-page/fullscreen modes
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

const CLOSE_DELAY_MS = 300;

// SVG icons
const FLOPPY_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`;
const HDD_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="10" rx="2"/><circle cx="17" cy="12" r="1.5"/><line x1="6" y1="12" x2="10" y2="12"/></svg>`;
const EJECT_ICON = `<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 5l-8 9h16l-8-9zm-8 11h16v2H4v-2z"/></svg>`;
const INSERT_ICON = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`;
const CHEVRON_RIGHT = `<svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;
const CHEVRON_LEFT = `<svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`;

export class FullscreenDrivePopouts {
  constructor(diskManager, hardDriveManager) {
    this.diskManager = diskManager;
    this.hardDriveManager = hardDriveManager;
    this._leftWrapper = null;
    this._rightWrapper = null;
    this._closeTimers = { left: null, right: null };
    this._driveLabels = [null, null];
    this._hdLabels = [null, null];
    this._driveEjectBtns = [null, null];
    this._hdEjectBtns = [null, null];
    this._driveLeds = [null, null];
    this._hdLeds = [null, null];
    this._boundUpdate = null;
  }

  init() {
    this._leftWrapper = this._buildPopout("left");
    this._rightWrapper = this._buildPopout("right");

    const main = document.querySelector("main");
    if (main) {
      main.appendChild(this._leftWrapper);
      main.appendChild(this._rightWrapper);
    }

    // Periodic UI sync (LED + names) — piggyback on rAF
    this._boundUpdate = () => {
      if (document.body.classList.contains("full-page-mode") || document.fullscreenElement) {
        this._updateDriveInfo();
        this._updateSmartPortInfo();
      }
      this._rafId = requestAnimationFrame(this._boundUpdate);
    };
    this._rafId = requestAnimationFrame(this._boundUpdate);
  }

  destroy() {
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._leftWrapper?.remove();
    this._rightWrapper?.remove();
  }

  // --- Build DOM ---

  _buildPopout(side) {
    const wrapper = document.createElement("div");
    wrapper.className = `fp-drive-popout fp-drive-popout--${side}`;

    // Stop clicks from exiting full-page mode
    wrapper.addEventListener("click", (e) => e.stopPropagation());

    const tab = document.createElement("div");
    tab.className = "fp-popout-tab";
    tab.innerHTML = side === "left"
      ? `${FLOPPY_ICON}<span class="fp-popout-chevron">${CHEVRON_RIGHT}</span>`
      : `<span class="fp-popout-chevron">${CHEVRON_LEFT}</span>${HDD_ICON}`;

    const panel = document.createElement("div");
    panel.className = "fp-popout-panel";

    if (side === "left") {
      panel.appendChild(this._buildDriveRow(0));
      panel.appendChild(this._buildDriveRow(1));
    } else {
      panel.appendChild(this._buildHdRow(0));
      panel.appendChild(this._buildHdRow(1));
    }

    if (side === "left") {
      wrapper.appendChild(panel);
      wrapper.appendChild(tab);
    } else {
      wrapper.appendChild(tab);
      wrapper.appendChild(panel);
    }

    // Mouse open/close with delay
    wrapper.addEventListener("mouseenter", () => {
      clearTimeout(this._closeTimers[side]);
      wrapper.classList.add("open");
    });
    wrapper.addEventListener("mouseleave", () => {
      this._closeTimers[side] = setTimeout(() => {
        wrapper.classList.remove("open");
      }, CLOSE_DELAY_MS);
    });

    return wrapper;
  }

  _buildDriveRow(driveNum) {
    const row = document.createElement("div");
    row.className = "fp-popout-drive-row";

    const led = document.createElement("div");
    led.className = "fp-popout-led";
    this._driveLeds[driveNum] = led;

    const label = document.createElement("div");
    label.className = "fp-popout-name";
    label.textContent = `Drive ${driveNum + 1}: Empty`;
    this._driveLabels[driveNum] = label;

    const controls = document.createElement("div");
    controls.className = "fp-popout-controls";

    const insertBtn = document.createElement("button");
    insertBtn.className = "fp-popout-btn";
    insertBtn.innerHTML = INSERT_ICON;
    insertBtn.title = "Insert disk";
    insertBtn.addEventListener("click", () => this._onDiskInsert(driveNum));

    const ejectBtn = document.createElement("button");
    ejectBtn.className = "fp-popout-btn";
    ejectBtn.innerHTML = EJECT_ICON;
    ejectBtn.title = "Eject disk";
    ejectBtn.disabled = true;
    ejectBtn.addEventListener("click", () => this._onDiskEject(driveNum));
    this._driveEjectBtns[driveNum] = ejectBtn;

    controls.appendChild(insertBtn);
    controls.appendChild(ejectBtn);

    row.appendChild(led);
    row.appendChild(label);
    row.appendChild(controls);
    return row;
  }

  _buildHdRow(deviceNum) {
    const row = document.createElement("div");
    row.className = "fp-popout-drive-row";

    const led = document.createElement("div");
    led.className = "fp-popout-led";
    this._hdLeds[deviceNum] = led;

    const label = document.createElement("div");
    label.className = "fp-popout-name";
    label.textContent = `Device ${deviceNum}: Empty`;
    this._hdLabels[deviceNum] = label;

    const controls = document.createElement("div");
    controls.className = "fp-popout-controls";

    const insertBtn = document.createElement("button");
    insertBtn.className = "fp-popout-btn";
    insertBtn.innerHTML = INSERT_ICON;
    insertBtn.title = "Insert image";
    insertBtn.addEventListener("click", () => this._onHdInsert(deviceNum));

    const ejectBtn = document.createElement("button");
    ejectBtn.className = "fp-popout-btn";
    ejectBtn.innerHTML = EJECT_ICON;
    ejectBtn.title = "Eject image";
    ejectBtn.disabled = true;
    ejectBtn.addEventListener("click", () => this._onHdEject(deviceNum));
    this._hdEjectBtns[deviceNum] = ejectBtn;

    controls.appendChild(insertBtn);
    controls.appendChild(ejectBtn);

    row.appendChild(led);
    row.appendChild(label);
    row.appendChild(controls);
    return row;
  }

  // --- Update UI ---

  _updateDriveInfo() {
    if (!this.diskManager) return;
    for (let i = 0; i < 2; i++) {
      const drive = this.diskManager.drives[i];
      if (!drive || !this._driveLabels[i]) continue;

      const name = drive.filename || "Empty";
      const label = `Drive ${i + 1}: ${name}`;
      if (this._driveLabels[i].textContent !== label) {
        this._driveLabels[i].textContent = label;
      }

      const hasDisc = !!drive.filename;
      this._driveEjectBtns[i].disabled = !hasDisc;

      // LED: mirror the existing drive LED state
      const origLed = drive.nameLabel?.closest(".disk-drive")?.querySelector(".disk-track");
      const isActive = origLed && origLed.classList.contains("active");
      this._driveLeds[i].classList.toggle("active", !!isActive);
    }
  }

  _updateSmartPortInfo() {
    if (!this.hardDriveManager) return;
    for (let i = 0; i < 2; i++) {
      const device = this.hardDriveManager.devices[i];
      if (!device || !this._hdLabels[i]) continue;

      const name = device.filename || "Empty";
      const label = `Device ${i}: ${name}`;
      if (this._hdLabels[i].textContent !== label) {
        this._hdLabels[i].textContent = label;
      }

      const hasImage = !!device.filename;
      this._hdEjectBtns[i].disabled = !hasImage;

      // LED
      const isActive = device.activityFrames > 0;
      this._hdLeds[i].classList.toggle("active", !!isActive);
    }
  }

  // --- Actions ---

  _onDiskInsert(driveNum) {
    const drive = this.diskManager?.drives[driveNum];
    if (drive?.input) {
      drive.input.click();
    }
  }

  _onDiskEject(driveNum) {
    this.diskManager?.ejectDisk(driveNum);
  }

  _onHdInsert(deviceNum) {
    const device = this.hardDriveManager?.devices[deviceNum];
    if (device?.input) {
      device.input.click();
    }
  }

  _onHdEject(deviceNum) {
    this.hardDriveManager?.ejectImage(deviceNum);
  }
}
