/*
 * mockingboard-window.js - Mockingboard detail window for PSG and VIA register inspection
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { BaseWindow } from "../windows/base-window.js";

export class MockingboardWindow extends BaseWindow {
  constructor(wasmModule) {
    super({
      id: "mockingboard-debug",
      title: "Mockingboard",
      minWidth: 760,
      minHeight: 630,
      maxWidth: 760,
      maxHeight: 630,
      defaultWidth: 760,
      defaultHeight: 630,
      defaultPosition: { x: window.innerWidth - 840, y: 100 },
    });

    this.wasmModule = wasmModule;

    // Cached DOM element references (populated on first update)
    this.elements = null;

    // Previous values for dirty checking
    this.prevValues = {};

    // PSG register names
    this.psgRegisterNames = [
      "Tone A Fine",
      "Tone A Coarse",
      "Tone B Fine",
      "Tone B Coarse",
      "Tone C Fine",
      "Tone C Coarse",
      "Noise Period",
      "Mixer",
      "Amp A",
      "Amp B",
      "Amp C",
      "Env Fine",
      "Env Coarse",
      "Env Shape",
      "I/O Port A",
      "I/O Port B",
    ];

    // Envelope shape descriptions
    this.envShapes = {
      0x00: "\\___",
      0x04: "/___",
      0x08: "\\\\\\\\",
      0x09: "\\___",
      0x0a: "\\/\\/",
      0x0b: "\\---",
      0x0c: "////",
      0x0d: "/---",
      0x0e: "/\\/\\",
      0x0f: "/___",
    };
  }

  renderContent() {
    return `
      <div class="mockingboard-content">
        <div class="mb-status">
          <span class="mb-label">Status:</span>
          <span id="mb-enabled" class="mb-badge">DISABLED</span>
        </div>

        <div class="mb-psg-container">
          <div class="mb-section mb-psg-panel">
            <div class="mb-section-title">PSG 1 (VIA1 @ $C400)</div>
            <div class="mb-psg" id="psg1">${this.renderPSGTable(1)}</div>
            <div class="mb-via-status">
              <span class="mb-label">VIA1 IRQ:</span>
              <span id="via1-irq" class="mb-badge">OFF</span>
            </div>
            <div class="mb-via-ports">
              <span class="mb-port">ORA:<span id="via1-ora">$00</span></span>
              <span class="mb-port">ORB:<span id="via1-orb">$00</span></span>
              <span class="mb-port">DDRA:<span id="via1-ddra">$00</span></span>
              <span class="mb-port">DDRB:<span id="via1-ddrb">$00</span></span>
              <span class="mb-port">Ctrl:<span id="via1-ctrl">--</span></span>
            </div>
            <div class="mb-via-ports">
              <span class="mb-port">Writes:<span id="psg1-writes">0</span></span>
              <span class="mb-port">Last:<span id="psg1-last">R?=$??</span></span>
            </div>
            <div class="mb-timer-info">
              <span class="mb-timer">T1:<span id="via1-t1cnt">$0000</span></span>
              <span class="mb-timer">Latch:<span id="via1-t1lat">$0000</span></span>
              <span class="mb-timer-flag" id="via1-t1run">RUN</span>
              <span class="mb-timer-flag" id="via1-t1fire">FIRE</span>
            </div>
            <div class="mb-timer-info">
              <span class="mb-timer">ACR:<span id="via1-acr">$00</span></span>
              <span class="mb-timer">IFR:<span id="via1-ifr">$00</span></span>
              <span class="mb-timer">IER:<span id="via1-ier">$00</span></span>
              <span class="mb-timer-flag" id="via1-t1irq">T1IRQ</span>
            </div>
          </div>

          <div class="mb-section mb-psg-panel">
            <div class="mb-section-title">PSG 2 (VIA2 @ $C480)</div>
            <div class="mb-psg" id="psg2">${this.renderPSGTable(2)}</div>
            <div class="mb-via-status">
              <span class="mb-label">VIA2 IRQ:</span>
              <span id="via2-irq" class="mb-badge">OFF</span>
            </div>
            <div class="mb-via-ports">
              <span class="mb-port">ORA:<span id="via2-ora">$00</span></span>
              <span class="mb-port">ORB:<span id="via2-orb">$00</span></span>
              <span class="mb-port">DDRA:<span id="via2-ddra">$00</span></span>
              <span class="mb-port">DDRB:<span id="via2-ddrb">$00</span></span>
              <span class="mb-port">Ctrl:<span id="via2-ctrl">--</span></span>
            </div>
            <div class="mb-via-ports">
              <span class="mb-port">Writes:<span id="psg2-writes">0</span></span>
              <span class="mb-port">Last:<span id="psg2-last">R?=$??</span></span>
            </div>
            <div class="mb-timer-info">
              <span class="mb-timer">T1:<span id="via2-t1cnt">$0000</span></span>
              <span class="mb-timer">Latch:<span id="via2-t1lat">$0000</span></span>
              <span class="mb-timer-flag" id="via2-t1run">RUN</span>
              <span class="mb-timer-flag" id="via2-t1fire">FIRE</span>
            </div>
            <div class="mb-timer-info">
              <span class="mb-timer">ACR:<span id="via2-acr">$00</span></span>
              <span class="mb-timer">IFR:<span id="via2-ifr">$00</span></span>
              <span class="mb-timer">IER:<span id="via2-ier">$00</span></span>
              <span class="mb-timer-flag" id="via2-t1irq">T1IRQ</span>
            </div>
          </div>
        </div>

      </div>
      ${this.renderStyles()}
    `;
  }

  renderStyles() {
    return `<style>
      .mockingboard-content { font-family: 'Monaco', 'Menlo', monospace; font-size: 11px; padding: 8px; overflow-y: auto; height: 100%; }
      .mb-status { margin-bottom: 10px; padding: 4px 8px; background: #1a1a2e; border-radius: 4px; }
      .mb-label { color: #888; margin-right: 8px; }
      .mb-badge { padding: 2px 6px; border-radius: 3px; background: #333; color: #666; font-size: 10px; }
      .mb-badge.active { background: #2d5a27; color: #7fff7f; }
      .mb-badge.irq-active { background: #5a2727; color: #ff7f7f; }
      .mb-psg-container { display: flex; gap: 8px; margin-bottom: 12px; }
      .mb-psg-panel { flex: 1; min-width: 0; }
      .mb-section { margin-bottom: 12px; padding: 8px; background: #1a1a2e; border-radius: 4px; }
      .mb-section-title { color: #88f; font-weight: bold; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px solid #333; }
      .mb-psg table { width: 100%; border-collapse: collapse; }
      .mb-psg th, .mb-psg td { padding: 2px 4px; text-align: left; border-bottom: 1px solid #222; }
      .mb-psg th { color: #666; font-weight: normal; font-size: 10px; }
      .mb-psg .reg-num { color: #666; width: 25px; }
      .mb-psg .reg-name { color: #aaa; width: 90px; }
      .mb-psg .reg-hex { color: #7f7; font-family: monospace; width: 35px; }
      .mb-psg .reg-dec { color: #77f; width: 35px; }
      .mb-psg .reg-info { color: #f77; font-size: 10px; }
      .mb-via-status { margin-top: 8px; padding-top: 4px; border-top: 1px solid #333; }
      .mb-via-ports, .mb-timer-info { margin-top: 4px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
      .mb-port, .mb-timer { color: #888; font-size: 10px; }
      .mb-port span { color: #7f7; margin-left: 2px; }
      .mb-timer span { color: #f7f; margin-left: 2px; }
      .mb-timer-flag { padding: 1px 4px; border-radius: 2px; background: #333; color: #555; font-size: 9px; }
      .mb-timer-flag.active { background: #3a3a2a; color: #ff7; }
    </style>`;
  }

  renderPSGTable(psgNum) {
    let html =
      "<table><tr><th>Reg</th><th>Name</th><th>Hex</th><th>Dec</th><th>Info</th></tr>";
    for (let i = 0; i < 16; i++) {
      html += `<tr id="psg${psgNum}-r${i}">
        <td class="reg-num">R${i}</td>
        <td class="reg-name">${this.psgRegisterNames[i]}</td>
        <td class="reg-hex" id="psg${psgNum}-r${i}-hex">$00</td>
        <td class="reg-dec" id="psg${psgNum}-r${i}-dec">0</td>
        <td class="reg-info" id="psg${psgNum}-r${i}-info"></td>
      </tr>`;
    }
    return html + "</table>";
  }

  /**
   * Cache all DOM element references for fast access
   */
  cacheElements() {
    const el = this.contentElement;
    this.elements = {
      enabled: el.querySelector("#mb-enabled"),
      psg: [{}, {}],
      via: [{}, {}],
    };

    for (let psg = 0; psg < 2; psg++) {
      const psgNum = psg + 1;

      // PSG registers
      for (let reg = 0; reg < 16; reg++) {
        this.elements.psg[psg][`r${reg}hex`] = el.querySelector(
          `#psg${psgNum}-r${reg}-hex`,
        );
        this.elements.psg[psg][`r${reg}dec`] = el.querySelector(
          `#psg${psgNum}-r${reg}-dec`,
        );
        this.elements.psg[psg][`r${reg}info`] = el.querySelector(
          `#psg${psgNum}-r${reg}-info`,
        );
      }

      // VIA elements
      const via = psgNum;
      this.elements.via[psg] = {
        irq: el.querySelector(`#via${via}-irq`),
        ora: el.querySelector(`#via${via}-ora`),
        orb: el.querySelector(`#via${via}-orb`),
        ddra: el.querySelector(`#via${via}-ddra`),
        ddrb: el.querySelector(`#via${via}-ddrb`),
        ctrl: el.querySelector(`#via${via}-ctrl`),
        writes: el.querySelector(`#psg${via}-writes`),
        last: el.querySelector(`#psg${via}-last`),
        t1cnt: el.querySelector(`#via${via}-t1cnt`),
        t1lat: el.querySelector(`#via${via}-t1lat`),
        t1run: el.querySelector(`#via${via}-t1run`),
        t1fire: el.querySelector(`#via${via}-t1fire`),
        acr: el.querySelector(`#via${via}-acr`),
        ifr: el.querySelector(`#via${via}-ifr`),
        ier: el.querySelector(`#via${via}-ier`),
        t1irq: el.querySelector(`#via${via}-t1irq`),
      };
    }
  }

  update(wasmModule) {
    if (!wasmModule) return;
    this.wasmModule = wasmModule;

    // Cache elements on first update
    if (!this.elements) {
      this.cacheElements();
    }

    // Update enabled status
    this.updateEnabled(wasmModule);

    // Update PSG registers (with dirty checking)
    this.updatePSG(wasmModule, 0);
    this.updatePSG(wasmModule, 1);

    // Update VIA status
    this.updateVIAStatus(wasmModule);
  }

  updateEnabled(wasmModule) {
    const enabled = wasmModule._isMockingboardEnabled
      ? wasmModule._isMockingboardEnabled()
      : true;
    const key = "enabled";
    if (this.prevValues[key] !== enabled) {
      this.prevValues[key] = enabled;
      const el = this.elements.enabled;
      if (el) {
        el.textContent = enabled ? "ENABLED" : "DISABLED";
        el.classList.toggle("active", enabled);
      }
    }
  }

  updatePSG(wasmModule, psgIndex) {
    if (!wasmModule._getMockingboardPSGRegister) return;

    for (let reg = 0; reg < 16; reg++) {
      const value = wasmModule._getMockingboardPSGRegister(psgIndex, reg);
      const key = `psg${psgIndex}r${reg}`;

      if (this.prevValues[key] !== value) {
        this.prevValues[key] = value;

        const hexEl = this.elements.psg[psgIndex][`r${reg}hex`];
        const decEl = this.elements.psg[psgIndex][`r${reg}dec`];
        const infoEl = this.elements.psg[psgIndex][`r${reg}info`];

        if (hexEl)
          hexEl.textContent =
            "$" + value.toString(16).toUpperCase().padStart(2, "0");
        if (decEl) decEl.textContent = value.toString();
        if (infoEl)
          infoEl.textContent = this.getRegisterInfo(
            reg,
            value,
            wasmModule,
            psgIndex,
          );
      }
    }
  }

  getRegisterInfo(reg, value, wasmModule, psgIndex) {
    switch (reg) {
      case 1:
      case 3:
      case 5: {
        const fine = wasmModule._getMockingboardPSGRegister(psgIndex, reg - 1);
        const period = fine | ((value & 0x0f) << 8);
        return period > 0 ? `${Math.round(1023000 / (8 * period))}Hz` : "";
      }
      case 6:
        return value > 0 ? `${Math.round(1023000 / (16 * value))}Hz` : "";
      case 7: {
        let info = "";
        if (!(value & 0x01)) info += "Ta";
        if (!(value & 0x02)) info += "Tb";
        if (!(value & 0x04)) info += "Tc";
        if (!(value & 0x08)) info += "Na";
        if (!(value & 0x10)) info += "Nb";
        if (!(value & 0x20)) info += "Nc";
        return info || "off";
      }
      case 8:
      case 9:
      case 10:
        return value & 0x10 ? "ENV" : `vol:${value & 0x0f}`;
      case 12: {
        const fine = wasmModule._getMockingboardPSGRegister(psgIndex, 11);
        const period = fine | (value << 8);
        return period > 0 ? `${(1023000 / (256 * period)).toFixed(1)}Hz` : "";
      }
      case 13:
        return this.envShapes[value & 0x0f] || `?${value & 0x0f}`;
      default:
        return "";
    }
  }

  updateVIAStatus(wasmModule) {
    const controlModes = [
      "INACT",
      "READ",
      "WRITE",
      "LATCH",
      "INACT",
      "READ",
      "WRITE",
      "LATCH",
    ];

    for (let via = 0; via < 2; via++) {
      const els = this.elements.via[via];

      // IRQ status
      if (wasmModule._getMockingboardVIAIRQ) {
        const irqActive = wasmModule._getMockingboardVIAIRQ(via);
        const key = `via${via}irq`;
        if (this.prevValues[key] !== irqActive) {
          this.prevValues[key] = irqActive;
          if (els.irq) {
            els.irq.textContent = irqActive ? "ACTIVE" : "OFF";
            els.irq.classList.toggle("irq-active", irqActive);
          }
        }
      }

      // VIA ports
      if (wasmModule._getMockingboardVIAPort) {
        const ports = [
          wasmModule._getMockingboardVIAPort(via, 0),
          wasmModule._getMockingboardVIAPort(via, 1),
          wasmModule._getMockingboardVIAPort(via, 2),
          wasmModule._getMockingboardVIAPort(via, 3),
        ];
        const portEls = [els.ora, els.orb, els.ddra, els.ddrb];
        const portKeys = ["ora", "orb", "ddra", "ddrb"];

        for (let i = 0; i < 4; i++) {
          const key = `via${via}${portKeys[i]}`;
          if (this.prevValues[key] !== ports[i]) {
            this.prevValues[key] = ports[i];
            if (portEls[i])
              portEls[i].textContent =
                "$" + ports[i].toString(16).toUpperCase().padStart(2, "0");
          }
        }

        const ctrl = ports[1] & ports[3] & 0x07;
        const ctrlKey = `via${via}ctrl`;
        if (this.prevValues[ctrlKey] !== ctrl) {
          this.prevValues[ctrlKey] = ctrl;
          if (els.ctrl) els.ctrl.textContent = controlModes[ctrl] || "??";
        }
      }

      // PSG write info
      if (wasmModule._getMockingboardPSGWriteInfo) {
        const writeCount = wasmModule._getMockingboardPSGWriteInfo(via, 0);
        const lastReg = wasmModule._getMockingboardPSGWriteInfo(via, 1);
        const lastVal = wasmModule._getMockingboardPSGWriteInfo(via, 2);

        const wcKey = `via${via}wc`;
        if (this.prevValues[wcKey] !== writeCount) {
          this.prevValues[wcKey] = writeCount;
          if (els.writes) els.writes.textContent = writeCount.toString();
        }

        const lastKey = `via${via}last`;
        const lastStr = `R${lastReg}=$${lastVal.toString(16).toUpperCase().padStart(2, "0")}`;
        if (this.prevValues[lastKey] !== lastStr) {
          this.prevValues[lastKey] = lastStr;
          if (els.last) els.last.textContent = lastStr;
        }
      }

      // Timer info
      if (wasmModule._getMockingboardVIATimerInfo) {
        const t1cnt = wasmModule._getMockingboardVIATimerInfo(via, 0);
        const t1lat = wasmModule._getMockingboardVIATimerInfo(via, 1);
        const t1run = wasmModule._getMockingboardVIATimerInfo(via, 2);
        const t1fire = wasmModule._getMockingboardVIATimerInfo(via, 3);
        const acr = wasmModule._getMockingboardVIATimerInfo(via, 4);
        const ifr = wasmModule._getMockingboardVIATimerInfo(via, 5);
        const ier = wasmModule._getMockingboardVIATimerInfo(via, 6);

        this.updateIfChanged(
          `via${via}t1cnt`,
          t1cnt,
          els.t1cnt,
          (v) => "$" + v.toString(16).toUpperCase().padStart(4, "0"),
        );
        this.updateIfChanged(
          `via${via}t1lat`,
          t1lat,
          els.t1lat,
          (v) => "$" + v.toString(16).toUpperCase().padStart(4, "0"),
        );
        this.updateIfChanged(
          `via${via}acr`,
          acr,
          els.acr,
          (v) => "$" + v.toString(16).toUpperCase().padStart(2, "0"),
        );
        this.updateIfChanged(
          `via${via}ifr`,
          ifr,
          els.ifr,
          (v) => "$" + v.toString(16).toUpperCase().padStart(2, "0"),
        );
        this.updateIfChanged(
          `via${via}ier`,
          ier,
          els.ier,
          (v) => "$" + v.toString(16).toUpperCase().padStart(2, "0"),
        );

        this.updateClassIfChanged(
          `via${via}t1run`,
          t1run !== 0,
          els.t1run,
          "active",
        );
        this.updateClassIfChanged(
          `via${via}t1fire`,
          t1fire !== 0,
          els.t1fire,
          "active",
        );
        this.updateClassIfChanged(
          `via${via}t1irq`,
          (ier & 0x40) !== 0 && (ifr & 0x40) !== 0,
          els.t1irq,
          "active",
        );
      }
    }
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
