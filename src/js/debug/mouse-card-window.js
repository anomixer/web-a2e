/*
 * mouse-card-window.js - Mouse card debug window for PIA registers, position, and protocol state
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { BaseWindow } from "../windows/base-window.js";

export class MouseCardWindow extends BaseWindow {
  constructor(wasmModule) {
    super({
      id: "mouse-card-debug",
      title: "Mouse Card",
      minWidth: 340,
      minHeight: 480,
      maxWidth: 340,
      maxHeight: 480,
      defaultWidth: 340,
      defaultHeight: 480,
    });

    this.wasmModule = wasmModule;
    this.elements = null;
    this.prevValues = {};

    // Command name lookup
    this.commandNames = {
      0x00: "SET",
      0x10: "READ",
      0x20: "SERV",
      0x30: "CLEAR",
      0x40: "POS",
      0x50: "INIT",
      0x60: "CLAMP",
      0x70: "HOME",
    };

    // Mode bit descriptions
    this.modeBits = [
      { bit: 0, label: "ON" },
      { bit: 1, label: "MOV" },
      { bit: 2, label: "BTN" },
      { bit: 3, label: "VBL" },
    ];
  }

  renderContent() {
    return `
      <div class="mouse-card-content">
        <div class="mc-status">
          <span class="mc-label">Status:</span>
          <span id="mc-installed" class="mc-badge">NOT INSTALLED</span>
          <span class="mc-label" style="margin-left:8px">Slot:</span>
          <span id="mc-slot" class="mc-value">-</span>
        </div>

        <div class="mc-section">
          <div class="mc-section-title">Mouse State</div>
          <div class="mc-row">
            <span class="mc-label">Position:</span>
            <span class="mc-coord">X:<span id="mc-x" class="mc-value">0</span></span>
            <span class="mc-coord">Y:<span id="mc-y" class="mc-value">0</span></span>
          </div>
          <div class="mc-row">
            <span class="mc-label">Button:</span>
            <span id="mc-button" class="mc-badge">UP</span>
            <span id="mc-moved" class="mc-flag">MOVED</span>
            <span id="mc-btn-changed" class="mc-flag">BTN CHG</span>
          </div>
          <div class="mc-row">
            <span class="mc-label">Clamp X:</span>
            <span id="mc-clamp-x" class="mc-value">0..1023</span>
          </div>
          <div class="mc-row">
            <span class="mc-label">Clamp Y:</span>
            <span id="mc-clamp-y" class="mc-value">0..1023</span>
          </div>
        </div>

        <div class="mc-section">
          <div class="mc-section-title">Mode &amp; Interrupts</div>
          <div class="mc-row">
            <span class="mc-label">Mode:</span>
            <span id="mc-mode-hex" class="mc-value">$0</span>
            <span id="mc-mode-on" class="mc-flag">ON</span>
            <span id="mc-mode-mov" class="mc-flag">MOV</span>
            <span id="mc-mode-btn" class="mc-flag">BTN</span>
            <span id="mc-mode-vbl" class="mc-flag">VBL</span>
          </div>
          <div class="mc-row">
            <span class="mc-label">IRQ:</span>
            <span id="mc-irq" class="mc-badge">OFF</span>
            <span id="mc-irq-vbl" class="mc-flag">VBL</span>
            <span id="mc-irq-mov" class="mc-flag">MOV</span>
            <span id="mc-irq-btn" class="mc-flag">BTN</span>
          </div>
          <div class="mc-row">
            <span class="mc-label">VBL:</span>
            <span id="mc-in-vbl" class="mc-badge">NO</span>
          </div>
        </div>

        <div class="mc-section">
          <div class="mc-section-title">6821 PIA Registers</div>
          <table class="mc-pia-table">
            <tr><th>Reg</th><th>Hex</th><th>Bin</th></tr>
            <tr><td class="mc-reg-name">DDRA</td><td id="mc-ddra" class="mc-reg-hex">$00</td><td id="mc-ddra-bin" class="mc-reg-bin">00000000</td></tr>
            <tr><td class="mc-reg-name">ORA</td><td id="mc-ora" class="mc-reg-hex">$00</td><td id="mc-ora-bin" class="mc-reg-bin">00000000</td></tr>
            <tr><td class="mc-reg-name">IRA</td><td id="mc-ira" class="mc-reg-hex">$00</td><td id="mc-ira-bin" class="mc-reg-bin">00000000</td></tr>
            <tr><td class="mc-reg-name">CRA</td><td id="mc-cra" class="mc-reg-hex">$00</td><td id="mc-cra-bin" class="mc-reg-bin">00000000</td></tr>
            <tr class="mc-pia-sep"><td colspan="3"></td></tr>
            <tr><td class="mc-reg-name">DDRB</td><td id="mc-ddrb" class="mc-reg-hex">$00</td><td id="mc-ddrb-bin" class="mc-reg-bin">00000000</td></tr>
            <tr><td class="mc-reg-name">ORB</td><td id="mc-orb" class="mc-reg-hex">$00</td><td id="mc-orb-bin" class="mc-reg-bin">00000000</td></tr>
            <tr><td class="mc-reg-name">IRB</td><td id="mc-irb" class="mc-reg-hex">$00</td><td id="mc-irb-bin" class="mc-reg-bin">00000000</td></tr>
            <tr><td class="mc-reg-name">CRB</td><td id="mc-crb" class="mc-reg-hex">$00</td><td id="mc-crb-bin" class="mc-reg-bin">00000000</td></tr>
          </table>
        </div>

        <div class="mc-section">
          <div class="mc-section-title">Protocol</div>
          <div class="mc-row">
            <span class="mc-label">Last Cmd:</span>
            <span id="mc-cmd-hex" class="mc-value">$00</span>
            <span id="mc-cmd-name" class="mc-cmd-name">-</span>
          </div>
          <div class="mc-row">
            <span class="mc-label">Response:</span>
            <span id="mc-resp-state" class="mc-value">0</span>
          </div>
        </div>

      </div>
      ${this.renderStyles()}
    `;
  }

  renderStyles() {
    return `<style>
      .mouse-card-content { font-family: 'Monaco', 'Menlo', monospace; font-size: 11px; padding: 8px; overflow-y: auto; height: 100%; }
      .mc-status { margin-bottom: 8px; padding: 4px 8px; background: var(--input-bg-dark); border-radius: 4px; display: flex; align-items: center; gap: 4px; }
      .mc-section { margin-bottom: 8px; padding: 8px; background: var(--input-bg-dark); border-radius: 4px; }
      .mc-section-title { color: var(--accent-blue); font-weight: bold; margin-bottom: 6px; padding-bottom: 4px; border-bottom: 1px solid var(--border-default); }
      .mc-row { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; flex-wrap: wrap; }
      .mc-label { color: var(--text-muted); }
      .mc-value { color: var(--accent-green); font-family: monospace; }
      .mc-coord { color: var(--text-muted); font-size: 10px; }
      .mc-coord span { color: var(--accent-green); margin-left: 2px; }
      .mc-badge { padding: 2px 6px; border-radius: 3px; background: var(--badge-dim-bg); color: var(--text-muted); font-size: 10px; }
      .mc-badge.active { background: var(--accent-green-bg-stronger); color: var(--accent-green); }
      .mc-badge.irq-active { background: var(--accent-red-bg-stronger); color: var(--accent-red); }
      .mc-flag { padding: 1px 4px; border-radius: 2px; background: var(--badge-dim-bg); color: var(--text-muted); font-size: 9px; }
      .mc-flag.active { background: var(--accent-orange-bg-strong); color: var(--accent-orange); }
      .mc-cmd-name { color: var(--accent-purple); font-size: 10px; }
      .mc-pia-table { width: 100%; border-collapse: collapse; }
      .mc-pia-table th { color: var(--text-muted); font-weight: normal; font-size: 10px; text-align: left; padding: 2px 4px; }
      .mc-pia-table td { padding: 2px 4px; border-bottom: 1px solid var(--border-muted); }
      .mc-pia-sep td { border-bottom: 1px solid var(--border-default); height: 2px; padding: 0; }
      .mc-reg-name { color: var(--text-secondary); width: 45px; }
      .mc-reg-hex { color: var(--accent-green); font-family: monospace; width: 35px; }
      .mc-reg-bin { color: var(--accent-blue); font-family: monospace; font-size: 10px; letter-spacing: 0.5px; }
    </style>`;
  }

  cacheElements() {
    const el = this.contentElement;
    this.elements = {
      installed: el.querySelector("#mc-installed"),
      slot: el.querySelector("#mc-slot"),
      x: el.querySelector("#mc-x"),
      y: el.querySelector("#mc-y"),
      button: el.querySelector("#mc-button"),
      moved: el.querySelector("#mc-moved"),
      btnChanged: el.querySelector("#mc-btn-changed"),
      clampX: el.querySelector("#mc-clamp-x"),
      clampY: el.querySelector("#mc-clamp-y"),
      modeHex: el.querySelector("#mc-mode-hex"),
      modeOn: el.querySelector("#mc-mode-on"),
      modeMov: el.querySelector("#mc-mode-mov"),
      modeBtn: el.querySelector("#mc-mode-btn"),
      modeVbl: el.querySelector("#mc-mode-vbl"),
      irq: el.querySelector("#mc-irq"),
      irqVbl: el.querySelector("#mc-irq-vbl"),
      irqMov: el.querySelector("#mc-irq-mov"),
      irqBtn: el.querySelector("#mc-irq-btn"),
      inVbl: el.querySelector("#mc-in-vbl"),
      ddra: el.querySelector("#mc-ddra"),
      ddraBin: el.querySelector("#mc-ddra-bin"),
      ora: el.querySelector("#mc-ora"),
      oraBin: el.querySelector("#mc-ora-bin"),
      ira: el.querySelector("#mc-ira"),
      iraBin: el.querySelector("#mc-ira-bin"),
      cra: el.querySelector("#mc-cra"),
      craBin: el.querySelector("#mc-cra-bin"),
      ddrb: el.querySelector("#mc-ddrb"),
      ddrbBin: el.querySelector("#mc-ddrb-bin"),
      orb: el.querySelector("#mc-orb"),
      orbBin: el.querySelector("#mc-orb-bin"),
      irb: el.querySelector("#mc-irb"),
      irbBin: el.querySelector("#mc-irb-bin"),
      crb: el.querySelector("#mc-crb"),
      crbBin: el.querySelector("#mc-crb-bin"),
      cmdHex: el.querySelector("#mc-cmd-hex"),
      cmdName: el.querySelector("#mc-cmd-name"),
      respState: el.querySelector("#mc-resp-state"),
    };
  }

  async update(wasmModule) {
    if (!wasmModule) return;
    this.wasmModule = wasmModule;

    if (!this.elements) {
      this.cacheElements();
    }

    // Check if mouse card is installed
    const installed = wasmModule._isMouseCardInstalled
      ? await wasmModule._isMouseCardInstalled()
      : false;

    this.updateIfChanged("installed", installed, this.elements.installed, (v) =>
      v ? "INSTALLED" : "NOT INSTALLED",
    );
    if (this.elements.installed) {
      this.updateClassIfChanged(
        "installed-cls",
        installed,
        this.elements.installed,
        "active",
      );
    }

    if (!installed || !wasmModule._getMouseCardState) return;

    // Batch read all state fields (0-17) and PIA registers (0-7)
    const stateCalls = [];
    for (let i = 0; i <= 17; i++) {
      stateCalls.push(['_getMouseCardState', i]);
    }
    for (let i = 0; i < 8; i++) {
      stateCalls.push(['_getMouseCardPIARegister', i]);
    }
    const allResults = await wasmModule.batch(stateCalls);
    const stateVals = allResults.slice(0, 18);
    const piaVals = allResults.slice(18, 26);

    // Slot
    this.updateIfChanged("slot", stateVals[0], this.elements.slot, (v) =>
      v.toString(),
    );

    // Position
    this.updateIfChanged("x", stateVals[1], this.elements.x, (v) =>
      v.toString(),
    );
    this.updateIfChanged("y", stateVals[2], this.elements.y, (v) =>
      v.toString(),
    );

    // Button
    const btnDown = stateVals[3] !== 0;
    this.updateIfChanged("button", btnDown, this.elements.button, (v) =>
      v ? "DOWN" : "UP",
    );
    this.updateClassIfChanged("button-cls", btnDown, this.elements.button, "active");

    // Flags
    this.updateClassIfChanged("moved", stateVals[4] !== 0, this.elements.moved, "active");
    this.updateClassIfChanged(
      "btnChanged",
      stateVals[5] !== 0,
      this.elements.btnChanged,
      "active",
    );

    // Clamp bounds
    const clampX = `${stateVals[6]}..${stateVals[7]}`;
    const clampY = `${stateVals[8]}..${stateVals[9]}`;
    this.updateIfChanged("clampX", clampX, this.elements.clampX, (v) => v);
    this.updateIfChanged("clampY", clampY, this.elements.clampY, (v) => v);

    // Mode
    const mode = stateVals[15];
    this.updateIfChanged("modeHex", mode, this.elements.modeHex, (v) =>
      "$" + v.toString(16).toUpperCase(),
    );
    this.updateClassIfChanged("modeOn", (mode & 1) !== 0, this.elements.modeOn, "active");
    this.updateClassIfChanged("modeMov", (mode & 2) !== 0, this.elements.modeMov, "active");
    this.updateClassIfChanged("modeBtn", (mode & 4) !== 0, this.elements.modeBtn, "active");
    this.updateClassIfChanged("modeVbl", (mode & 8) !== 0, this.elements.modeVbl, "active");

    // IRQ state
    const irqActive = stateVals[10] !== 0;
    this.updateIfChanged("irq", irqActive, this.elements.irq, (v) =>
      v ? "ACTIVE" : "OFF",
    );
    this.updateClassIfChanged("irq-cls", irqActive, this.elements.irq, "irq-active");
    this.updateClassIfChanged("irqVbl", stateVals[11] !== 0, this.elements.irqVbl, "active");
    this.updateClassIfChanged("irqMov", stateVals[12] !== 0, this.elements.irqMov, "active");
    this.updateClassIfChanged("irqBtn", stateVals[13] !== 0, this.elements.irqBtn, "active");

    // VBL
    const inVbl = stateVals[14] !== 0;
    this.updateIfChanged("inVbl", inVbl, this.elements.inVbl, (v) =>
      v ? "YES" : "NO",
    );
    this.updateClassIfChanged("inVbl-cls", inVbl, this.elements.inVbl, "active");

    // PIA registers
    const piaRegs = [
      { field: 0, el: "ddra", binEl: "ddraBin" },
      { field: 2, el: "ora", binEl: "oraBin" },
      { field: 4, el: "ira", binEl: "iraBin" },
      { field: 6, el: "cra", binEl: "craBin" },
      { field: 1, el: "ddrb", binEl: "ddrbBin" },
      { field: 3, el: "orb", binEl: "orbBin" },
      { field: 5, el: "irb", binEl: "irbBin" },
      { field: 7, el: "crb", binEl: "crbBin" },
    ];

    for (const r of piaRegs) {
      const val = piaVals[r.field];
      this.updateIfChanged(
        `pia-${r.el}`,
        val,
        this.elements[r.el],
        (v) => "$" + v.toString(16).toUpperCase().padStart(2, "0"),
      );
      this.updateIfChanged(
        `pia-${r.binEl}`,
        val,
        this.elements[r.binEl],
        (v) => v.toString(2).padStart(8, "0"),
      );
    }

    // Protocol
    const lastCmd = stateVals[16];
    this.updateIfChanged("cmdHex", lastCmd, this.elements.cmdHex, (v) =>
      "$" + v.toString(16).toUpperCase().padStart(2, "0"),
    );
    const cmdName = this.commandNames[lastCmd & 0xf0] || "?";
    this.updateIfChanged("cmdName", cmdName, this.elements.cmdName, (v) => v);

    this.updateIfChanged("respState", stateVals[17], this.elements.respState, (v) =>
      v.toString(),
    );
  }

  updateIfChanged(key, value, el, formatter) {
    if (this.prevValues[key] !== value) {
      this.prevValues[key] = value;
      if (el) el.textContent = formatter(value);
    }
  }

  updateClassIfChanged(key, condition, el, className) {
    if (this.prevValues[key] !== condition) {
      this.prevValues[key] = condition;
      if (el) el.classList.toggle(className, condition);
    }
  }
}
