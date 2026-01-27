import { BaseWindow } from "../windows/base-window.js";

/**
 * MockingboardWindow - Display Mockingboard PSG and VIA state for debugging
 */
export class MockingboardWindow extends BaseWindow {
  constructor(wasmModule) {
    super({
      id: "mockingboard-debug",
      title: "Mockingboard",
      minWidth: 720,
      minHeight: 750,
      defaultWidth: 780,
      defaultHeight: 640,
      defaultPosition: { x: window.innerWidth - 800, y: 100 },
    });

    this.wasmModule = wasmModule;

    // PSG register names
    this.psgRegisterNames = [
      "Tone A Fine", // R0
      "Tone A Coarse", // R1
      "Tone B Fine", // R2
      "Tone B Coarse", // R3
      "Tone C Fine", // R4
      "Tone C Coarse", // R5
      "Noise Period", // R6
      "Mixer", // R7
      "Amp A", // R8
      "Amp B", // R9
      "Amp C", // R10
      "Env Fine", // R11
      "Env Coarse", // R12
      "Env Shape", // R13
      "I/O Port A", // R14
      "I/O Port B", // R15
    ];

    // Envelope shape descriptions
    this.envShapes = {
      0x00: "\\___", // Decay, hold 0
      0x04: "/___", // Attack, drop to 0
      0x08: "\\\\\\\\", // Repeated decay
      0x09: "\\___", // Decay, hold 0
      0x0a: "\\/\\/", // Triangle (decay first)
      0x0b: "\\---", // Decay, hold max
      0x0c: "////", // Repeated attack
      0x0d: "/---", // Attack, hold max
      0x0e: "/\\/\\", // Triangle (attack first)
      0x0f: "/___", // Attack, drop to 0
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
            <div class="mb-psg" id="psg1">
              ${this.renderPSGTable(1)}
            </div>
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
            <div class="mb-psg" id="psg2">
              ${this.renderPSGTable(2)}
            </div>
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

        <div class="mb-section">
          <div class="mb-section-title">Channel Output</div>
          <div class="mb-channels">
            <div class="mb-channel-row">
              <span class="mb-ch-label">PSG1:</span>
              <div class="mb-ch-meter" id="psg1-ch-a"><div class="mb-ch-bar"></div><span>A</span></div>
              <div class="mb-ch-meter" id="psg1-ch-b"><div class="mb-ch-bar"></div><span>B</span></div>
              <div class="mb-ch-meter" id="psg1-ch-c"><div class="mb-ch-bar"></div><span>C</span></div>
            </div>
            <div class="mb-channel-row">
              <span class="mb-ch-label">PSG2:</span>
              <div class="mb-ch-meter" id="psg2-ch-a"><div class="mb-ch-bar"></div><span>A</span></div>
              <div class="mb-ch-meter" id="psg2-ch-b"><div class="mb-ch-bar"></div><span>B</span></div>
              <div class="mb-ch-meter" id="psg2-ch-c"><div class="mb-ch-bar"></div><span>C</span></div>
            </div>
          </div>
        </div>
      </div>
      <style>
        .mockingboard-content {
          font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
          font-size: 11px;
          padding: 8px;
          overflow-y: auto;
          height: 100%;
        }
        .mb-status {
          margin-bottom: 10px;
          padding: 4px 8px;
          background: #1a1a2e;
          border-radius: 4px;
        }
        .mb-label {
          color: #888;
          margin-right: 8px;
        }
        .mb-badge {
          padding: 2px 6px;
          border-radius: 3px;
          background: #333;
          color: #666;
          font-size: 10px;
        }
        .mb-badge.active {
          background: #2d5a27;
          color: #7fff7f;
        }
        .mb-badge.irq-active {
          background: #5a2727;
          color: #ff7f7f;
        }
        .mb-psg-container {
          display: flex;
          gap: 8px;
          margin-bottom: 12px;
        }
        .mb-psg-panel {
          flex: 1;
          min-width: 0;
        }
        .mb-section {
          margin-bottom: 12px;
          padding: 8px;
          background: #1a1a2e;
          border-radius: 4px;
        }
        .mb-section-title {
          color: #88f;
          font-weight: bold;
          margin-bottom: 8px;
          padding-bottom: 4px;
          border-bottom: 1px solid #333;
        }
        .mb-psg table {
          width: 100%;
          border-collapse: collapse;
        }
        .mb-psg th, .mb-psg td {
          padding: 2px 4px;
          text-align: left;
          border-bottom: 1px solid #222;
        }
        .mb-psg th {
          color: #666;
          font-weight: normal;
          font-size: 10px;
        }
        .mb-psg .reg-num {
          color: #666;
          width: 25px;
        }
        .mb-psg .reg-name {
          color: #aaa;
          width: 90px;
        }
        .mb-psg .reg-hex {
          color: #7f7;
          font-family: monospace;
          width: 35px;
        }
        .mb-psg .reg-dec {
          color: #77f;
          width: 35px;
        }
        .mb-psg .reg-info {
          color: #f77;
          font-size: 10px;
        }
        .mb-via-status {
          margin-top: 8px;
          padding-top: 4px;
          border-top: 1px solid #333;
        }
        .mb-via-ports {
          margin-top: 4px;
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .mb-port {
          color: #888;
          font-size: 10px;
        }
        .mb-port span {
          color: #7f7;
          margin-left: 2px;
        }
        .mb-timer-info {
          margin-top: 4px;
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          align-items: center;
        }
        .mb-timer {
          color: #888;
          font-size: 10px;
        }
        .mb-timer span {
          color: #f7f;
          margin-left: 2px;
        }
        .mb-timer-flag {
          padding: 1px 4px;
          border-radius: 2px;
          background: #333;
          color: #555;
          font-size: 9px;
        }
        .mb-timer-flag.active {
          background: #3a3a2a;
          color: #ff7;
        }
        .mb-channels {
          margin-top: 8px;
        }
        .mb-channel-row {
          display: flex;
          align-items: center;
          margin-bottom: 6px;
        }
        .mb-ch-label {
          color: #888;
          width: 45px;
        }
        .mb-ch-meter {
          width: 80px;
          height: 16px;
          background: #222;
          border-radius: 3px;
          margin-right: 8px;
          position: relative;
          overflow: hidden;
        }
        .mb-ch-meter span {
          position: absolute;
          right: 4px;
          top: 1px;
          color: #666;
          font-size: 10px;
          z-index: 1;
        }
        .mb-ch-bar {
          position: absolute;
          left: 0;
          top: 0;
          height: 100%;
          background: linear-gradient(90deg, #2a5a2a, #4a8a4a);
          transition: width 0.05s;
          width: 0%;
        }
        .mb-ch-meter.tone-off .mb-ch-bar {
          background: linear-gradient(90deg, #5a5a2a, #8a8a4a);
        }
        .mb-ch-meter.noise-on .mb-ch-bar {
          background: linear-gradient(90deg, #5a2a5a, #8a4a8a);
        }
      </style>
    `;
  }

  renderPSGTable(psgNum) {
    let html = `
      <table>
        <tr>
          <th>Reg</th>
          <th>Name</th>
          <th>Hex</th>
          <th>Dec</th>
          <th>Info</th>
        </tr>
    `;

    for (let i = 0; i < 16; i++) {
      html += `
        <tr id="psg${psgNum}-r${i}">
          <td class="reg-num">R${i}</td>
          <td class="reg-name">${this.psgRegisterNames[i]}</td>
          <td class="reg-hex" id="psg${psgNum}-r${i}-hex">$00</td>
          <td class="reg-dec" id="psg${psgNum}-r${i}-dec">0</td>
          <td class="reg-info" id="psg${psgNum}-r${i}-info"></td>
        </tr>
      `;
    }

    html += "</table>";
    return html;
  }

  update(wasmModule) {
    if (!wasmModule) return;
    this.wasmModule = wasmModule;

    // Check if Mockingboard is enabled
    const enabled = wasmModule._isMockingboardEnabled
      ? wasmModule._isMockingboardEnabled()
      : true;
    const enabledEl = this.contentElement.querySelector("#mb-enabled");
    if (enabledEl) {
      enabledEl.textContent = enabled ? "ENABLED" : "DISABLED";
      enabledEl.classList.toggle("active", enabled);
    }

    // Update PSG registers
    this.updatePSG(wasmModule, 1);
    this.updatePSG(wasmModule, 2);

    // Update VIA IRQ status
    this.updateVIAStatus(wasmModule);

    // Update channel meters
    this.updateChannelMeters(wasmModule);
  }

  updatePSG(wasmModule, psgNum) {
    const psgIndex = psgNum - 1;

    for (let reg = 0; reg < 16; reg++) {
      let value = 0;
      if (wasmModule._getMockingboardPSGRegister) {
        value = wasmModule._getMockingboardPSGRegister(psgIndex, reg);
      }

      const hexEl = this.contentElement.querySelector(
        `#psg${psgNum}-r${reg}-hex`,
      );
      const decEl = this.contentElement.querySelector(
        `#psg${psgNum}-r${reg}-dec`,
      );
      const infoEl = this.contentElement.querySelector(
        `#psg${psgNum}-r${reg}-info`,
      );

      if (hexEl)
        hexEl.textContent =
          "$" + value.toString(16).toUpperCase().padStart(2, "0");
      if (decEl) decEl.textContent = value.toString();

      // Generate info based on register type
      if (infoEl) {
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
      case 0: // Tone A Fine
      case 2: // Tone B Fine
      case 4: // Tone C Fine
        return "";

      case 1: // Tone A Coarse
      case 3: // Tone B Coarse
      case 5: {
        // Tone C Coarse
        const fineReg = reg - 1;
        let fine = 0;
        if (wasmModule._getMockingboardPSGRegister) {
          fine = wasmModule._getMockingboardPSGRegister(psgIndex, fineReg);
        }
        const period = fine | ((value & 0x0f) << 8);
        if (period > 0) {
          const freq = Math.round(1023000 / (8 * period));
          return `${freq}Hz`;
        }
        return "";
      }

      case 6: // Noise Period
        if (value > 0) {
          const freq = Math.round(1023000 / (16 * value));
          return `${freq}Hz`;
        }
        return "";

      case 7: {
        // Mixer
        let info = "";
        const toneA = !(value & 0x01);
        const toneB = !(value & 0x02);
        const toneC = !(value & 0x04);
        const noiseA = !(value & 0x08);
        const noiseB = !(value & 0x10);
        const noiseC = !(value & 0x20);
        if (toneA) info += "Ta";
        if (toneB) info += "Tb";
        if (toneC) info += "Tc";
        if (noiseA) info += "Na";
        if (noiseB) info += "Nb";
        if (noiseC) info += "Nc";
        return info || "all off";
      }

      case 8: // Amp A
      case 9: // Amp B
      case 10: {
        // Amp C
        const useEnv = (value & 0x10) !== 0;
        const vol = value & 0x0f;
        return useEnv ? "ENV" : `vol:${vol}`;
      }

      case 11: // Env Fine
        return "";

      case 12: {
        // Env Coarse
        let fine = 0;
        if (wasmModule._getMockingboardPSGRegister) {
          fine = wasmModule._getMockingboardPSGRegister(psgIndex, 11);
        }
        const period = fine | (value << 8);
        if (period > 0) {
          const freq = (1023000 / (256 * period)).toFixed(1);
          return `${freq}Hz`;
        }
        return "";
      }

      case 13: {
        // Env Shape
        const shape = value & 0x0f;
        return this.envShapes[shape] || `?${shape}`;
      }

      default:
        return "";
    }
  }

  updateVIAStatus(wasmModule) {
    const controlModes = {
      0: "INACT",
      1: "READ",
      2: "WRITE",
      3: "LATCH",
      4: "INACT",
      5: "READ",
      6: "WRITE",
      7: "LATCH",
    };

    for (let via = 1; via <= 2; via++) {
      const viaIndex = via - 1;

      let irqActive = false;
      if (wasmModule._getMockingboardVIAIRQ) {
        irqActive = wasmModule._getMockingboardVIAIRQ(viaIndex);
      }

      const irqEl = this.contentElement.querySelector(`#via${via}-irq`);
      if (irqEl) {
        irqEl.textContent = irqActive ? "ACTIVE" : "OFF";
        irqEl.classList.toggle("irq-active", irqActive);
      }

      // Update VIA port values
      if (wasmModule._getMockingboardVIAPort) {
        const ora = wasmModule._getMockingboardVIAPort(viaIndex, 0);
        const orb = wasmModule._getMockingboardVIAPort(viaIndex, 1);
        const ddra = wasmModule._getMockingboardVIAPort(viaIndex, 2);
        const ddrb = wasmModule._getMockingboardVIAPort(viaIndex, 3);

        const oraEl = this.contentElement.querySelector(`#via${via}-ora`);
        const orbEl = this.contentElement.querySelector(`#via${via}-orb`);
        const ddraEl = this.contentElement.querySelector(`#via${via}-ddra`);
        const ddrbEl = this.contentElement.querySelector(`#via${via}-ddrb`);
        const ctrlEl = this.contentElement.querySelector(`#via${via}-ctrl`);

        if (oraEl)
          oraEl.textContent =
            "$" + ora.toString(16).toUpperCase().padStart(2, "0");
        if (orbEl)
          orbEl.textContent =
            "$" + orb.toString(16).toUpperCase().padStart(2, "0");
        if (ddraEl)
          ddraEl.textContent =
            "$" + ddra.toString(16).toUpperCase().padStart(2, "0");
        if (ddrbEl)
          ddrbEl.textContent =
            "$" + ddrb.toString(16).toUpperCase().padStart(2, "0");

        // Show control state (ORB & DDRB & 0x07)
        if (ctrlEl) {
          const ctrl = orb & ddrb & 0x07;
          ctrlEl.textContent = controlModes[ctrl] || "??";
        }
      }

      // Update PSG write tracking
      if (wasmModule._getMockingboardPSGWriteInfo) {
        const writeCount = wasmModule._getMockingboardPSGWriteInfo(viaIndex, 0);
        const lastReg = wasmModule._getMockingboardPSGWriteInfo(viaIndex, 1);
        const lastVal = wasmModule._getMockingboardPSGWriteInfo(viaIndex, 2);

        const writesEl = this.contentElement.querySelector(`#psg${via}-writes`);
        const lastEl = this.contentElement.querySelector(`#psg${via}-last`);

        if (writesEl) writesEl.textContent = writeCount.toString();
        if (lastEl) {
          lastEl.textContent = `R${lastReg}=$${lastVal.toString(16).toUpperCase().padStart(2, "0")}`;
        }
      }

      // Update VIA timer state
      if (wasmModule._getMockingboardVIATimerInfo) {
        const t1Counter = wasmModule._getMockingboardVIATimerInfo(viaIndex, 0);
        const t1Latch = wasmModule._getMockingboardVIATimerInfo(viaIndex, 1);
        const t1Running = wasmModule._getMockingboardVIATimerInfo(viaIndex, 2);
        const t1Fired = wasmModule._getMockingboardVIATimerInfo(viaIndex, 3);
        const acr = wasmModule._getMockingboardVIATimerInfo(viaIndex, 4);
        const ifr = wasmModule._getMockingboardVIATimerInfo(viaIndex, 5);
        const ier = wasmModule._getMockingboardVIATimerInfo(viaIndex, 6);

        const t1cntEl = this.contentElement.querySelector(`#via${via}-t1cnt`);
        const t1latEl = this.contentElement.querySelector(`#via${via}-t1lat`);
        const t1runEl = this.contentElement.querySelector(`#via${via}-t1run`);
        const t1fireEl = this.contentElement.querySelector(`#via${via}-t1fire`);
        const acrEl = this.contentElement.querySelector(`#via${via}-acr`);
        const ifrEl = this.contentElement.querySelector(`#via${via}-ifr`);
        const ierEl = this.contentElement.querySelector(`#via${via}-ier`);
        const t1irqEl = this.contentElement.querySelector(`#via${via}-t1irq`);

        if (t1cntEl)
          t1cntEl.textContent =
            "$" + t1Counter.toString(16).toUpperCase().padStart(4, "0");
        if (t1latEl)
          t1latEl.textContent =
            "$" + t1Latch.toString(16).toUpperCase().padStart(4, "0");
        if (t1runEl) t1runEl.classList.toggle("active", t1Running !== 0);
        if (t1fireEl) t1fireEl.classList.toggle("active", t1Fired !== 0);
        if (acrEl)
          acrEl.textContent =
            "$" + acr.toString(16).toUpperCase().padStart(2, "0");
        if (ifrEl)
          ifrEl.textContent =
            "$" + ifr.toString(16).toUpperCase().padStart(2, "0");
        if (ierEl)
          ierEl.textContent =
            "$" + ier.toString(16).toUpperCase().padStart(2, "0");

        // T1 IRQ enabled (IER bit 6) and flagged (IFR bit 6)
        const t1IrqEnabled = (ier & 0x40) !== 0;
        const t1IrqFlagged = (ifr & 0x40) !== 0;
        if (t1irqEl)
          t1irqEl.classList.toggle("active", t1IrqEnabled && t1IrqFlagged);
      }
    }
  }

  updateChannelMeters(wasmModule) {
    for (let psg = 1; psg <= 2; psg++) {
      const psgIndex = psg - 1;
      let mixer = 0;
      if (wasmModule._getMockingboardPSGRegister) {
        mixer = wasmModule._getMockingboardPSGRegister(psgIndex, 7);
      }

      for (let ch = 0; ch < 3; ch++) {
        const chLetter = ["a", "b", "c"][ch];
        let ampReg = 0;
        if (wasmModule._getMockingboardPSGRegister) {
          ampReg = wasmModule._getMockingboardPSGRegister(psgIndex, 8 + ch);
        }

        const useEnv = (ampReg & 0x10) !== 0;
        const vol = ampReg & 0x0f;
        const toneEnabled = !(mixer & (1 << ch));
        const noiseEnabled = !(mixer & (1 << (ch + 3)));

        // Calculate display volume (0-15 -> 0-100%)
        const displayVol = useEnv ? 50 : (vol / 15) * 100;

        const meterEl = this.contentElement.querySelector(
          `#psg${psg}-ch-${chLetter}`,
        );
        if (meterEl) {
          const barEl = meterEl.querySelector(".mb-ch-bar");
          if (barEl) {
            barEl.style.width = `${displayVol}%`;
          }
          meterEl.classList.toggle("tone-off", !toneEnabled);
          meterEl.classList.toggle("noise-on", noiseEnabled);
        }
      }
    }
  }
}
