/*
 * fullscreen-drive-popouts.js - Slide-out drive panels
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import {
  getRecentDisks,
  loadRecentDisk,
  addToRecentDisks,
  clearRecentDisks,
} from "../disk-manager/disk-persistence.js";
import {
  getRecentImages,
  loadRecentImage,
  clearRecentImages,
} from "../disk-manager/hard-drive-persistence.js";

const CLOSE_DELAY_MS = 300;

// SVG icons
const FLOPPY_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`;
const HDD_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="10" rx="2"/><circle cx="17" cy="12" r="1.5"/><line x1="6" y1="12" x2="10" y2="12"/></svg>`;
const EJECT_ICON = `<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 5l-8 9h16l-8-9zm-8 11h16v2H4v-2z"/></svg>`;
const INSERT_ICON = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`;
const BLANK_ICON = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>`;
const RECENT_ICON = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
const LIBRARY_ICON = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`;
const CHEVRON_RIGHT = `<svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;
const CHEVRON_LEFT = `<svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`;

export class FullscreenDrivePopouts {
  constructor(diskManager, hardDriveManager) {
    this.diskManager = diskManager;
    this.hardDriveManager = hardDriveManager;
    this._floppyWrapper = null;
    this._hdWrapper = null;
    this._closeTimers = { floppy: null, hd: null };
    this._driveLabels = [null, null];
    this._hdLabels = [null, null];
    this._driveEjectBtns = [null, null];
    this._hdEjectBtns = [null, null];
    this._driveLeds = [null, null];
    this._hdLeds = [null, null];
    this._boundUpdate = null;
    this._activeDropdown = null;
    this._side = localStorage.getItem("a2e-popout-side") || "left";
  }

  init() {
    this._floppyWrapper = this._buildPopout("floppy");
    this._hdWrapper = this._buildPopout("hd");

    const main = document.querySelector("main");
    if (main) {
      main.appendChild(this._floppyWrapper);
      main.appendChild(this._hdWrapper);
    }

    // Close dropdown when clicking outside
    this._onDocumentClick = (e) => {
      if (this._activeDropdown && !e.target.closest(".fp-dropdown-container")) {
        this._closeDropdown();
      }
    };
    document.addEventListener("click", this._onDocumentClick);

    // Periodic UI sync (LED + names) — piggyback on rAF
    this._boundUpdate = () => {
      this._updateDriveInfo();
      this._updateSmartPortInfo();
      this._rafId = requestAnimationFrame(this._boundUpdate);
    };
    this._rafId = requestAnimationFrame(this._boundUpdate);
  }

  destroy() {
    if (this._rafId) cancelAnimationFrame(this._rafId);
    document.removeEventListener("click", this._onDocumentClick);
    this._floppyWrapper?.remove();
    this._hdWrapper?.remove();
  }

  /**
   * Move both popouts to the given side ('left' or 'right').
   */
  setSide(side) {
    this._side = side;
    localStorage.setItem("a2e-popout-side", side);
    this._applyPopoutSide(this._floppyWrapper, "floppy");
    this._applyPopoutSide(this._hdWrapper, "hd");
  }

  getSide() {
    return this._side;
  }

  // --- Build DOM ---

  /**
   * @param {'floppy'|'hd'} type - Which drive type this popout is for
   */
  _buildPopout(type) {
    const wrapper = document.createElement("div");
    wrapper.className = "fp-drive-popout";
    wrapper.dataset.popoutType = type;

    // Stop clicks from exiting full-page mode
    wrapper.addEventListener("click", (e) => e.stopPropagation());

    const tab = document.createElement("div");
    tab.className = "fp-popout-tab";
    wrapper._tab = tab;

    const panel = document.createElement("div");
    panel.className = "fp-popout-panel";
    wrapper._panel = panel;

    if (type === "floppy") {
      panel.appendChild(this._buildDriveRow(0));
      panel.appendChild(this._buildDriveRow(1));
    } else {
      panel.appendChild(this._buildHdRow(0));
      panel.appendChild(this._buildHdRow(1));
    }

    wrapper.appendChild(panel);
    wrapper.appendChild(tab);

    // Apply current side positioning
    this._applyPopoutSide(wrapper, type);

    // Mouse open/close with delay
    wrapper.addEventListener("mouseenter", () => {
      clearTimeout(this._closeTimers[type]);
      wrapper.classList.add("open");
    });
    wrapper.addEventListener("mouseleave", () => {
      this._closeTimers[type] = setTimeout(() => {
        wrapper.classList.remove("open");
        this._closeDropdown();
      }, CLOSE_DELAY_MS);
    });

    return wrapper;
  }

  /**
   * Apply side positioning to a popout wrapper.
   */
  _applyPopoutSide(wrapper, type) {
    if (!wrapper) return;
    const side = this._side;
    const icon = type === "floppy" ? FLOPPY_ICON : HDD_ICON;
    const tab = wrapper._tab;

    // Update side class
    wrapper.classList.remove("fp-drive-popout--left", "fp-drive-popout--right");
    wrapper.classList.add(`fp-drive-popout--${side}`);

    // Update vertical stacking class
    wrapper.classList.remove("fp-drive-popout--top", "fp-drive-popout--bottom");
    wrapper.classList.add(type === "floppy" ? "fp-drive-popout--top" : "fp-drive-popout--bottom");

    // Update tab content (chevron direction + icon order)
    const chevron = side === "left"
      ? `<span class="fp-popout-chevron">${CHEVRON_RIGHT}</span>`
      : `<span class="fp-popout-chevron">${CHEVRON_LEFT}</span>`;
    tab.innerHTML = side === "left"
      ? `${icon}${chevron}`
      : `${chevron}${icon}`;

    // Reorder tab/panel: left = panel then tab, right = tab then panel
    const panel = wrapper._panel;
    wrapper.innerHTML = "";
    wrapper.appendChild(tab);       // re-add to keep reference
    wrapper.appendChild(panel);
    if (side === "left") {
      wrapper.insertBefore(panel, tab);
    }
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

    const recentContainer = this._buildDropdownButton(RECENT_ICON, "Recent", "recent", "floppy", driveNum);
    const libraryContainer = this._buildDropdownButton(LIBRARY_ICON, "Library", "library", "floppy", driveNum);

    const blankBtn = document.createElement("button");
    blankBtn.className = "fp-popout-btn";
    blankBtn.innerHTML = BLANK_ICON;
    blankBtn.title = "Insert blank disk";
    blankBtn.addEventListener("click", () => this._onDiskBlank(driveNum));

    const ejectBtn = document.createElement("button");
    ejectBtn.className = "fp-popout-btn";
    ejectBtn.innerHTML = EJECT_ICON;
    ejectBtn.title = "Eject disk";
    ejectBtn.disabled = true;
    ejectBtn.addEventListener("click", () => this._onDiskEject(driveNum));
    this._driveEjectBtns[driveNum] = ejectBtn;

    controls.appendChild(insertBtn);
    controls.appendChild(recentContainer);
    controls.appendChild(libraryContainer);
    controls.appendChild(blankBtn);
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

    const recentContainer = this._buildDropdownButton(RECENT_ICON, "Recent", "recent", "hd", deviceNum);
    const libraryContainer = this._buildDropdownButton(LIBRARY_ICON, "Library", "library", "hd", deviceNum);

    const ejectBtn = document.createElement("button");
    ejectBtn.className = "fp-popout-btn";
    ejectBtn.innerHTML = EJECT_ICON;
    ejectBtn.title = "Eject image";
    ejectBtn.disabled = true;
    ejectBtn.addEventListener("click", () => this._onHdEject(deviceNum));
    this._hdEjectBtns[deviceNum] = ejectBtn;

    controls.appendChild(insertBtn);
    controls.appendChild(recentContainer);
    controls.appendChild(libraryContainer);
    controls.appendChild(ejectBtn);

    row.appendChild(led);
    row.appendChild(label);
    row.appendChild(controls);
    return row;
  }

  /**
   * Build a button with a dropdown container.
   * @param {string} icon - SVG icon HTML
   * @param {string} title - Button tooltip
   * @param {'recent'|'library'} kind - Dropdown kind
   * @param {'floppy'|'hd'} type - Drive type
   * @param {number} num - Drive or device number
   */
  _buildDropdownButton(icon, title, kind, type, num) {
    const container = document.createElement("div");
    container.className = "fp-dropdown-container";

    const btn = document.createElement("button");
    btn.className = "fp-popout-btn";
    btn.innerHTML = icon;
    btn.title = title;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      this._toggleDropdown(container, kind, type, num);
    });

    const dropdown = document.createElement("div");
    dropdown.className = "fp-recent-dropdown";

    container.appendChild(btn);
    container.appendChild(dropdown);
    return container;
  }

  // --- Dropdowns ---

  async _toggleDropdown(container, kind, type, num) {
    const dropdown = container.querySelector(".fp-recent-dropdown");
    if (!dropdown) return;

    if (this._activeDropdown === dropdown) {
      this._closeDropdown();
      return;
    }

    this._closeDropdown();
    dropdown.innerHTML = "";

    if (kind === "recent") {
      if (type === "floppy") {
        await this._populateFloppyRecent(dropdown, num);
      } else {
        await this._populateHdRecent(dropdown, num);
      }
    } else {
      if (type === "floppy") {
        await this._populateFloppyLibrary(dropdown, num);
      } else {
        await this._populateHdLibrary(dropdown, num);
      }
    }

    dropdown.classList.add("open");
    this._activeDropdown = dropdown;
  }

  _closeDropdown() {
    if (this._activeDropdown) {
      this._activeDropdown.classList.remove("open");
      this._activeDropdown = null;
    }
  }

  // --- Recent populators ---

  async _populateFloppyRecent(dropdown, driveNum) {
    const recentDisks = await getRecentDisks(driveNum);

    if (recentDisks.length === 0) {
      const emptyItem = document.createElement("div");
      emptyItem.className = "fp-recent-item fp-recent-empty";
      emptyItem.textContent = "No recent disks";
      dropdown.appendChild(emptyItem);
    } else {
      for (const disk of recentDisks) {
        const item = document.createElement("div");
        item.className = "fp-recent-item";
        item.textContent = disk.filename;
        item.title = disk.filename;
        item.addEventListener("click", (e) => {
          e.stopPropagation();
          this._loadRecentDisk(driveNum, disk.id);
        });
        dropdown.appendChild(item);
      }

      const separator = document.createElement("div");
      separator.className = "fp-recent-separator";
      dropdown.appendChild(separator);

      const clearItem = document.createElement("div");
      clearItem.className = "fp-recent-item fp-recent-clear";
      clearItem.textContent = "Clear Recent";
      clearItem.addEventListener("click", async (e) => {
        e.stopPropagation();
        await clearRecentDisks(driveNum);
        this._closeDropdown();
      });
      dropdown.appendChild(clearItem);
    }
  }

  async _populateHdRecent(dropdown, deviceNum) {
    const recentImages = await getRecentImages(deviceNum);

    if (recentImages.length === 0) {
      const emptyItem = document.createElement("div");
      emptyItem.className = "fp-recent-item fp-recent-empty";
      emptyItem.textContent = "No recent images";
      dropdown.appendChild(emptyItem);
    } else {
      for (const image of recentImages) {
        const item = document.createElement("div");
        item.className = "fp-recent-item";
        item.textContent = image.filename;
        item.title = image.filename;
        item.addEventListener("click", (e) => {
          e.stopPropagation();
          this._loadRecentHdImage(deviceNum, image.id);
        });
        dropdown.appendChild(item);
      }

      const separator = document.createElement("div");
      separator.className = "fp-recent-separator";
      dropdown.appendChild(separator);

      const clearItem = document.createElement("div");
      clearItem.className = "fp-recent-item fp-recent-clear";
      clearItem.textContent = "Clear Recent";
      clearItem.addEventListener("click", async (e) => {
        e.stopPropagation();
        await clearRecentImages(deviceNum);
        this._closeDropdown();
      });
      dropdown.appendChild(clearItem);
    }
  }

  // --- Library populators ---

  async _populateFloppyLibrary(dropdown, driveNum) {
    if (!this.diskManager) return;
    // Delegate to DiskManager which handles fetch, caching, and loading
    await this.diskManager._appendLibrarySection(dropdown, driveNum, "floppy");
    // The manager prepends a separator + label; strip them since this is a standalone dropdown
    this._stripLeadingSeparator(dropdown);
    // Close our dropdown when a library item is clicked
    this._hookLibraryClicks(dropdown);

    if (dropdown.children.length === 0) {
      const emptyItem = document.createElement("div");
      emptyItem.className = "fp-recent-item fp-recent-empty";
      emptyItem.textContent = "No library disks";
      dropdown.appendChild(emptyItem);
    }
  }

  async _populateHdLibrary(dropdown, deviceNum) {
    if (!this.hardDriveManager) return;
    await this.hardDriveManager._appendLibrarySection(dropdown, deviceNum);
    this._stripLeadingSeparator(dropdown);
    this._hookLibraryClicks(dropdown);

    if (dropdown.children.length === 0) {
      const emptyItem = document.createElement("div");
      emptyItem.className = "fp-recent-item fp-recent-empty";
      emptyItem.textContent = "No library images";
      dropdown.appendChild(emptyItem);
    }
  }

  /**
   * Remove the leading separator and "Library" label that _appendLibrarySection prepends,
   * since this dropdown is exclusively for library entries.
   */
  _stripLeadingSeparator(dropdown) {
    while (dropdown.firstChild &&
      (dropdown.firstChild.classList?.contains("recent-separator") ||
       dropdown.firstChild.classList?.contains("recent-section-label"))) {
      dropdown.firstChild.remove();
    }
  }

  /**
   * Hook click listeners on library items (which use the managers' recent-item class)
   * to also close our popout dropdown.
   */
  _hookLibraryClicks(dropdown) {
    for (const item of dropdown.querySelectorAll(".recent-item")) {
      item.addEventListener("click", () => this._closeDropdown(), { once: true });
    }
  }

  // --- Load actions ---

  async _loadRecentDisk(driveNum, diskId) {
    this._closeDropdown();
    this.diskManager?.loadRecentDiskInDrive(driveNum, diskId);
  }

  async _loadRecentHdImage(deviceNum, imageId) {
    this._closeDropdown();
    this.hardDriveManager?.loadRecentImageInDevice(deviceNum, imageId);
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

  _onDiskBlank(driveNum) {
    this.diskManager?.insertBlankDisk(driveNum);
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
