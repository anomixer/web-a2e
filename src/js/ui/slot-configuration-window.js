import { BaseWindow } from "../windows/base-window.js";

/**
 * SlotConfigurationWindow - Configure Apple IIe expansion slots
 */
export class SlotConfigurationWindow extends BaseWindow {
  constructor(wasmModule, onResetCallback) {
    super({
      id: "slot-configuration",
      title: "Expansion Slots",
      minWidth: 300,
      minHeight: 480,
      defaultWidth: 340,
      defaultHeight: 480,
      defaultPosition: { x: 100, y: 100 },
    });

    this.wasmModule = wasmModule;
    this.onResetCallback = onResetCallback;

    // Available card types
    this.cards = [
      { id: "empty", name: "Empty" },
      { id: "disk2", name: "Disk II Controller" },
      { id: "mockingboard", name: "Mockingboard" },
    ];

    // Slot metadata
    this.slots = [
      {
        slot: 1,
        label: "Slot 1",
        available: ["empty"],
        note: "Printer / Serial",
      },
      {
        slot: 2,
        label: "Slot 2",
        available: ["empty"],
        note: "Serial / Modem",
      },
      {
        slot: 3,
        label: "Slot 3",
        available: [],
        note: "80-Column (Built-in)",
        fixed: true,
      },
      {
        slot: 4,
        label: "Slot 4",
        available: ["empty", "mockingboard"],
        note: "Sound cards",
      },
      { slot: 5, label: "Slot 5", available: ["empty"], note: "Hard drive" },
      {
        slot: 6,
        label: "Slot 6",
        available: ["empty", "disk2"],
        note: "Disk drives",
      },
      { slot: 7, label: "Slot 7", available: ["empty"], note: "RAM disk" },
    ];

    // Track pending changes
    this.pendingChanges = {};
    this.hasChanges = false;
  }

  renderContent() {
    let html = '<div class="slot-config-content">';

    // Slot section
    html += `
      <div class="slot-section">
        <div class="slot-section-title">Expansion Slots</div>
        <div class="slot-list">`;

    // Slot rows
    for (const slotInfo of this.slots) {
      const currentCard = this.getCurrentSlotCard(slotInfo.slot);

      if (slotInfo.fixed) {
        // Slot 3 is fixed (built-in 80-column)
        html += `
          <div class="slot-row slot-fixed">
            <div class="slot-label">
              <span class="slot-number">${slotInfo.label}</span>
              <span class="slot-note">${slotInfo.note}</span>
            </div>
            <div class="slot-value">80-Column (Built-in)</div>
          </div>`;
      } else {
        // Configurable slot with dropdown
        const options = slotInfo.available
          .map((cardId) => {
            const card = this.cards.find((c) => c.id === cardId);
            const selected = cardId === currentCard ? "selected" : "";
            return `<option value="${cardId}" ${selected}>${card ? card.name : cardId}</option>`;
          })
          .join("");

        html += `
          <div class="slot-row">
            <div class="slot-label">
              <span class="slot-number">${slotInfo.label}</span>
              <span class="slot-note">${slotInfo.note}</span>
            </div>
            <select class="slot-select" data-slot="${slotInfo.slot}">
              ${options}
            </select>
          </div>`;
      }
    }

    html += `
        </div>
      </div>`;

    // Warning message and apply button
    html += `
      <div class="slot-footer">
        <div class="slot-warning hidden" id="slot-warning">
          <span class="warning-icon">&#9888;</span>
          <span>Changes require reset</span>
        </div>
        <button id="slot-apply-btn" class="slot-apply-btn" disabled>Apply &amp; Reset</button>
      </div>
    </div>`;

    return html;
  }

  setupContentEventListeners() {
    // Add event listeners to all selects
    const selects = this.contentElement.querySelectorAll(".slot-select");
    selects.forEach((select) => {
      select.addEventListener("change", (e) => {
        const slot = parseInt(e.target.dataset.slot, 10);
        const cardId = e.target.value;
        this.handleSlotChange(slot, cardId);
      });
    });

    // Apply button
    const applyBtn = this.contentElement.querySelector("#slot-apply-btn");
    if (applyBtn) {
      applyBtn.addEventListener("click", () => {
        this.applyChanges();
      });
    }
  }

  create() {
    super.create();
    this.loadSettings();
    this.setupContentEventListeners();
    this.applyInitialSettings();
  }

  getCurrentSlotCard(slot) {
    // Check pending changes first
    if (this.pendingChanges[slot]) {
      return this.pendingChanges[slot];
    }

    // Use WASM API if available
    if (this.wasmModule && this.wasmModule._getSlotCard) {
      const ptr = this.wasmModule._getSlotCard(slot);
      if (ptr) {
        return this.wasmModule.UTF8ToString(ptr);
      }
    }

    // Fallback to defaults
    const defaults = {
      4: "mockingboard",
      6: "disk2",
    };
    return defaults[slot] || "empty";
  }

  handleSlotChange(slot, cardId) {
    const currentCard = this.getCurrentSlotCard(slot);

    // Update pending changes
    if (cardId !== currentCard) {
      this.pendingChanges[slot] = cardId;
      this.hasChanges = true;
    } else {
      delete this.pendingChanges[slot];
      this.hasChanges = Object.keys(this.pendingChanges).length > 0;
    }

    this.updateUI();
  }

  updateUI() {
    // Show/hide warning
    const warning = this.contentElement.querySelector("#slot-warning");
    const applyBtn = this.contentElement.querySelector("#slot-apply-btn");

    if (this.hasChanges) {
      warning?.classList.remove("hidden");
      if (applyBtn) applyBtn.disabled = false;
    } else {
      warning?.classList.add("hidden");
      if (applyBtn) applyBtn.disabled = true;
    }
  }

  applyChanges() {
    // Save configuration to localStorage
    this.saveSettings();

    // Apply changes via WASM
    if (this.wasmModule && this.wasmModule._setSlotCard) {
      for (const [slot, cardId] of Object.entries(this.pendingChanges)) {
        const slotNum = parseInt(slot, 10);

        // Allocate string for cardId (same pattern as disk-operations.js)
        const cardIdPtr = this.wasmModule._malloc(cardId.length + 1);
        this.wasmModule.stringToUTF8(cardId, cardIdPtr, cardId.length + 1);

        this.wasmModule._setSlotCard(slotNum, cardIdPtr);

        // Free the allocated string
        this.wasmModule._free(cardIdPtr);
      }
    }

    // Clear pending changes
    this.pendingChanges = {};
    this.hasChanges = false;
    this.updateUI();

    // Trigger reset
    if (this.onResetCallback) {
      this.onResetCallback();
    } else if (this.wasmModule && this.wasmModule._reset) {
      this.wasmModule._reset();
    }
  }

  applyInitialSettings() {
    // Apply saved settings on startup (before first reset)
    const saved = this.loadSettingsFromStorage();
    if (saved && this.wasmModule && this.wasmModule._setSlotCard) {
      for (const [slot, cardId] of Object.entries(saved)) {
        const slotNum = parseInt(slot, 10);
        // Allocate string for cardId
        const cardIdPtr = this.wasmModule._malloc(cardId.length + 1);
        this.wasmModule.stringToUTF8(cardId, cardIdPtr, cardId.length + 1);

        this.wasmModule._setSlotCard(slotNum, cardIdPtr);

        this.wasmModule._free(cardIdPtr);
      }
    }
  }

  saveSettings() {
    try {
      // Build current configuration
      const config = {};
      for (const slotInfo of this.slots) {
        if (!slotInfo.fixed) {
          const select = this.contentElement.querySelector(
            `[data-slot="${slotInfo.slot}"]`,
          );
          if (select) {
            config[slotInfo.slot] = select.value;
          }
        }
      }
      localStorage.setItem("a2e-slot-config", JSON.stringify(config));
    } catch (e) {
      console.warn("Could not save slot configuration:", e);
    }
  }

  loadSettings() {
    try {
      const saved = this.loadSettingsFromStorage();
      if (saved) {
        // Update selects to match saved config
        for (const [slot, cardId] of Object.entries(saved)) {
          const select = this.contentElement?.querySelector(
            `[data-slot="${slot}"]`,
          );
          if (select) {
            select.value = cardId;
          }
        }
      }
    } catch (e) {
      console.warn("Could not load slot configuration:", e);
    }
  }

  loadSettingsFromStorage() {
    try {
      const saved = localStorage.getItem("a2e-slot-config");
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn("Could not parse slot configuration:", e);
    }
    return null;
  }

  update() {
    // No dynamic updates needed
  }
}
