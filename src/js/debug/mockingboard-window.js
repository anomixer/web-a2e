import { BaseWindow } from "../windows/base-window.js";

/**
 * MockingboardWindow - Display Mockingboard PSG and VIA state for debugging
 */
export class MockingboardWindow extends BaseWindow {
  constructor(wasmModule) {
    super({
      id: "mockingboard-debug",
      title: "Mockingboard",
      minWidth: 760,
      minHeight: 780,
      defaultWidth: 820,
      defaultHeight: 720,
      defaultPosition: { x: window.innerWidth - 840, y: 100 },
    });

    this.wasmModule = wasmModule;
    this.muteHandlerAttached = false;

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

        <div class="mb-section mb-output-section">
          <div class="mb-section-title">Channel Output</div>
          <div class="mb-output-grid">
            <div class="mb-psg-output" id="psg1-output">
              <div class="mb-psg-header">PSG 1</div>
              <div class="mb-channels-grid">
                <div class="mb-channel" data-channel="a" data-psg="1">
                  <button class="mb-mute-btn" data-psg="1" data-ch="0" title="Mute/Unmute Channel A">
                    <span class="mb-mute-icon"></span>
                  </button>
                  <div class="mb-channel-label">A</div>
                  <div class="mb-meter-container">
                    <div class="mb-meter" id="psg1-ch-a">
                      <div class="mb-meter-fill"></div>
                      <div class="mb-meter-peak"></div>
                      <div class="mb-meter-glow"></div>
                    </div>
                  </div>
                  <canvas id="psg1-ch-a-waveform" class="mb-waveform" width="220" height="50"></canvas>
                </div>
                <div class="mb-channel" data-channel="b" data-psg="1">
                  <button class="mb-mute-btn" data-psg="1" data-ch="1" title="Mute/Unmute Channel B">
                    <span class="mb-mute-icon"></span>
                  </button>
                  <div class="mb-channel-label">B</div>
                  <div class="mb-meter-container">
                    <div class="mb-meter" id="psg1-ch-b">
                      <div class="mb-meter-fill"></div>
                      <div class="mb-meter-peak"></div>
                      <div class="mb-meter-glow"></div>
                    </div>
                  </div>
                  <canvas id="psg1-ch-b-waveform" class="mb-waveform" width="220" height="50"></canvas>
                </div>
                <div class="mb-channel" data-channel="c" data-psg="1">
                  <button class="mb-mute-btn" data-psg="1" data-ch="2" title="Mute/Unmute Channel C">
                    <span class="mb-mute-icon"></span>
                  </button>
                  <div class="mb-channel-label">C</div>
                  <div class="mb-meter-container">
                    <div class="mb-meter" id="psg1-ch-c">
                      <div class="mb-meter-fill"></div>
                      <div class="mb-meter-peak"></div>
                      <div class="mb-meter-glow"></div>
                    </div>
                  </div>
                  <canvas id="psg1-ch-c-waveform" class="mb-waveform" width="220" height="50"></canvas>
                </div>
              </div>
            </div>
            <div class="mb-psg-output" id="psg2-output">
              <div class="mb-psg-header">PSG 2</div>
              <div class="mb-channels-grid">
                <div class="mb-channel" data-channel="a" data-psg="2">
                  <button class="mb-mute-btn" data-psg="2" data-ch="0" title="Mute/Unmute Channel A">
                    <span class="mb-mute-icon"></span>
                  </button>
                  <div class="mb-channel-label">A</div>
                  <div class="mb-meter-container">
                    <div class="mb-meter" id="psg2-ch-a">
                      <div class="mb-meter-fill"></div>
                      <div class="mb-meter-peak"></div>
                      <div class="mb-meter-glow"></div>
                    </div>
                  </div>
                  <canvas id="psg2-ch-a-waveform" class="mb-waveform" width="220" height="50"></canvas>
                </div>
                <div class="mb-channel" data-channel="b" data-psg="2">
                  <button class="mb-mute-btn" data-psg="2" data-ch="1" title="Mute/Unmute Channel B">
                    <span class="mb-mute-icon"></span>
                  </button>
                  <div class="mb-channel-label">B</div>
                  <div class="mb-meter-container">
                    <div class="mb-meter" id="psg2-ch-b">
                      <div class="mb-meter-fill"></div>
                      <div class="mb-meter-peak"></div>
                      <div class="mb-meter-glow"></div>
                    </div>
                  </div>
                  <canvas id="psg2-ch-b-waveform" class="mb-waveform" width="220" height="50"></canvas>
                </div>
                <div class="mb-channel" data-channel="c" data-psg="2">
                  <button class="mb-mute-btn" data-psg="2" data-ch="2" title="Mute/Unmute Channel C">
                    <span class="mb-mute-icon"></span>
                  </button>
                  <div class="mb-channel-label">C</div>
                  <div class="mb-meter-container">
                    <div class="mb-meter" id="psg2-ch-c">
                      <div class="mb-meter-fill"></div>
                      <div class="mb-meter-peak"></div>
                      <div class="mb-meter-glow"></div>
                    </div>
                  </div>
                  <canvas id="psg2-ch-c-waveform" class="mb-waveform" width="220" height="50"></canvas>
                </div>
              </div>
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
        /* === Channel Output Section === */
        .mb-output-section {
          background: linear-gradient(180deg, #12121f 0%, #0a0a14 100%);
          border: 1px solid #2a2a4a;
        }
        .mb-output-grid {
          display: flex;
          gap: 12px;
          margin-top: 8px;
        }
        .mb-psg-output {
          flex: 1;
          background: linear-gradient(180deg, #0d0d18 0%, #080810 100%);
          border-radius: 8px;
          padding: 10px;
          border: 1px solid #1a1a30;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.03), 0 4px 12px rgba(0,0,0,0.4);
        }
        .mb-psg-header {
          text-align: center;
          color: #6688cc;
          font-size: 11px;
          font-weight: bold;
          text-transform: uppercase;
          letter-spacing: 2px;
          margin-bottom: 10px;
          padding-bottom: 6px;
          border-bottom: 1px solid #1a1a30;
          text-shadow: 0 0 10px rgba(102,136,204,0.5);
        }
        .mb-channels-grid {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .mb-channel {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 8px;
          background: linear-gradient(180deg, rgba(255,255,255,0.02) 0%, rgba(0,0,0,0.1) 100%);
          border-radius: 6px;
          border: 1px solid rgba(255,255,255,0.03);
        }
        .mb-channel-label {
          width: 18px;
          height: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          font-weight: bold;
          border-radius: 4px;
          color: #fff;
          text-shadow: 0 1px 2px rgba(0,0,0,0.5);
        }
        .mb-channel[data-channel="a"] .mb-channel-label {
          background: linear-gradient(180deg, #00b4d8 0%, #0077b6 100%);
          box-shadow: 0 0 8px rgba(0,180,216,0.4);
        }
        .mb-channel[data-channel="b"] .mb-channel-label {
          background: linear-gradient(180deg, #4ade80 0%, #22c55e 100%);
          box-shadow: 0 0 8px rgba(74,222,128,0.4);
        }
        .mb-channel[data-channel="c"] .mb-channel-label {
          background: linear-gradient(180deg, #f472b6 0%, #ec4899 100%);
          box-shadow: 0 0 8px rgba(244,114,182,0.4);
        }

        /* Meter styles */
        .mb-meter-container {
          width: 60px;
          flex-shrink: 0;
        }
        .mb-meter {
          height: 12px;
          background: #0a0a12;
          border-radius: 3px;
          position: relative;
          overflow: hidden;
          border: 1px solid #1a1a2a;
          box-shadow: inset 0 2px 4px rgba(0,0,0,0.5);
        }
        .mb-meter-fill {
          position: absolute;
          left: 0;
          top: 0;
          height: 100%;
          width: 0%;
          transition: width 0.05s ease-out;
          border-radius: 2px;
        }
        .mb-meter-peak {
          position: absolute;
          top: 0;
          width: 2px;
          height: 100%;
          background: #fff;
          opacity: 0.8;
          transition: left 0.05s ease-out, opacity 0.3s;
          left: 0%;
        }
        .mb-meter-glow {
          position: absolute;
          left: 0;
          top: 0;
          height: 100%;
          width: 0%;
          border-radius: 2px;
          filter: blur(4px);
          opacity: 0.5;
          transition: width 0.05s ease-out;
        }
        .mb-channel[data-channel="a"] .mb-meter-fill {
          background: linear-gradient(90deg, #0077b6 0%, #00b4d8 50%, #48cae4 100%);
        }
        .mb-channel[data-channel="a"] .mb-meter-glow {
          background: #00b4d8;
        }
        .mb-channel[data-channel="b"] .mb-meter-fill {
          background: linear-gradient(90deg, #166534 0%, #22c55e 50%, #4ade80 100%);
        }
        .mb-channel[data-channel="b"] .mb-meter-glow {
          background: #22c55e;
        }
        .mb-channel[data-channel="c"] .mb-meter-fill {
          background: linear-gradient(90deg, #9d174d 0%, #ec4899 50%, #f472b6 100%);
        }
        .mb-channel[data-channel="c"] .mb-meter-glow {
          background: #ec4899;
        }
        .mb-meter.tone-off .mb-meter-fill {
          opacity: 0.4;
          filter: saturate(0.3);
        }
        .mb-meter.noise-on .mb-meter-fill {
          animation: noise-flicker 0.1s infinite;
        }
        @keyframes noise-flicker {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }

        /* Mute button styles */
        .mb-mute-btn {
          width: 20px;
          height: 20px;
          border: none;
          border-radius: 4px;
          background: linear-gradient(180deg, #2a2a3a 0%, #1a1a2a 100%);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0;
          transition: all 0.15s ease;
          box-shadow: 0 2px 4px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1);
          flex-shrink: 0;
        }
        .mb-mute-btn:hover {
          background: linear-gradient(180deg, #3a3a4a 0%, #2a2a3a 100%);
        }
        .mb-mute-btn:active {
          transform: scale(0.95);
        }
        .mb-mute-icon {
          width: 12px;
          height: 12px;
          position: relative;
        }
        .mb-mute-icon::before {
          content: "";
          position: absolute;
          left: 1px;
          top: 3px;
          width: 4px;
          height: 6px;
          background: #8a8aaa;
          border-radius: 1px;
        }
        .mb-mute-icon::after {
          content: "";
          position: absolute;
          left: 5px;
          top: 1px;
          width: 0;
          height: 0;
          border-top: 5px solid transparent;
          border-bottom: 5px solid transparent;
          border-left: 6px solid #8a8aaa;
        }
        .mb-mute-btn.muted {
          background: linear-gradient(180deg, #4a2a2a 0%, #3a1a1a 100%);
          box-shadow: 0 2px 4px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,100,100,0.1), 0 0 8px rgba(255,80,80,0.2);
        }
        .mb-mute-btn.muted .mb-mute-icon::before,
        .mb-mute-btn.muted .mb-mute-icon::after {
          background: #ff6666;
          border-left-color: #ff6666;
        }
        .mb-mute-btn.muted .mb-mute-icon::before {
          content: "";
          position: absolute;
          left: 8px;
          top: 0;
          width: 2px;
          height: 12px;
          background: #ff6666;
          transform: rotate(45deg);
          border-radius: 1px;
        }

        /* Muted channel styles */
        .mb-channel.muted {
          opacity: 0.5;
        }
        .mb-channel.muted .mb-channel-label {
          filter: grayscale(0.8);
          box-shadow: none;
        }
        .mb-channel.muted .mb-waveform {
          filter: grayscale(0.6);
        }
        .mb-channel.muted .mb-meter-fill,
        .mb-channel.muted .mb-meter-glow {
          filter: grayscale(0.8);
          opacity: 0.4;
        }

        /* Waveform styles */
        .mb-waveform {
          flex: 1;
          min-width: 0;
          height: 50px;
          background: linear-gradient(180deg, #0a0a14 0%, #05050a 100%);
          border-radius: 4px;
          border: 1px solid #1a1a2a;
          box-shadow: inset 0 2px 8px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.02);
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

    // Set up mute button click handlers (once, after content is rendered)
    if (!this.muteHandlerAttached && this.contentElement) {
      this.muteHandlerAttached = true;
      this.contentElement.addEventListener("click", (e) => {
        const muteBtn = e.target.closest(".mb-mute-btn");
        if (muteBtn && this.wasmModule?._setMockingboardChannelMute) {
          const psg = parseInt(muteBtn.dataset.psg, 10) - 1; // 0 or 1
          const ch = parseInt(muteBtn.dataset.ch, 10); // 0, 1, or 2
          const currentlyMuted = this.wasmModule._getMockingboardChannelMute(psg, ch);
          this.wasmModule._setMockingboardChannelMute(psg, ch, !currentlyMuted);
          this.updateMuteState();
        }
      });
    }

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

    // Update waveform displays
    this.updateWaveforms(wasmModule);

    // Update mute button states
    this.updateMuteState();
  }

  updateMuteState() {
    if (!this.wasmModule?._getMockingboardChannelMute) return;

    const channelNames = ["a", "b", "c"];
    for (let psg = 1; psg <= 2; psg++) {
      const psgIndex = psg - 1;
      for (let ch = 0; ch < 3; ch++) {
        const isMuted = this.wasmModule._getMockingboardChannelMute(psgIndex, ch);
        const chName = channelNames[ch];

        // Update mute button
        const muteBtn = this.contentElement.querySelector(
          `.mb-mute-btn[data-psg="${psg}"][data-ch="${ch}"]`
        );
        if (muteBtn) {
          muteBtn.classList.toggle("muted", isMuted);
        }

        // Update channel row
        const channelRow = this.contentElement.querySelector(
          `.mb-channel[data-psg="${psg}"][data-channel="${chName}"]`
        );
        if (channelRow) {
          channelRow.classList.toggle("muted", isMuted);
        }
      }
    }
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
    // Initialize peak tracking if not exists
    if (!this.peakLevels) {
      this.peakLevels = {};
      this.peakDecay = {};
    }

    for (let psg = 1; psg <= 2; psg++) {
      const psgIndex = psg - 1;
      let mixer = 0;
      if (wasmModule._getMockingboardPSGRegister) {
        mixer = wasmModule._getMockingboardPSGRegister(psgIndex, 7);
      }

      for (let ch = 0; ch < 3; ch++) {
        const chLetter = ["a", "b", "c"][ch];
        const key = `psg${psg}-${chLetter}`;
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

        // Peak tracking with decay
        if (!this.peakLevels[key] || displayVol > this.peakLevels[key]) {
          this.peakLevels[key] = displayVol;
          this.peakDecay[key] = 0;
        } else {
          this.peakDecay[key]++;
          if (this.peakDecay[key] > 30) { // Hold for ~0.5 sec at 60fps
            this.peakLevels[key] = Math.max(displayVol, this.peakLevels[key] - 2);
          }
        }

        const meterEl = this.contentElement.querySelector(`#psg${psg}-ch-${chLetter}`);
        if (meterEl) {
          const fillEl = meterEl.querySelector(".mb-meter-fill");
          const peakEl = meterEl.querySelector(".mb-meter-peak");
          const glowEl = meterEl.querySelector(".mb-meter-glow");

          if (fillEl) fillEl.style.width = `${displayVol}%`;
          if (glowEl) glowEl.style.width = `${displayVol}%`;
          if (peakEl) {
            peakEl.style.left = `${Math.max(0, this.peakLevels[key] - 2)}%`;
            peakEl.style.opacity = this.peakLevels[key] > 5 ? "0.8" : "0";
          }

          meterEl.classList.toggle("tone-off", !toneEnabled);
          meterEl.classList.toggle("noise-on", noiseEnabled);
        }
      }
    }
  }

  updateWaveforms(wasmModule) {
    if (!wasmModule._getMockingboardWaveform) return;

    const channelNames = ["a", "b", "c"];
    // Vibrant colors matching the channel labels
    const channelColors = {
      a: { main: "#00b4d8", glow: "rgba(0, 180, 216, 0.3)", dark: "#0077b6" },
      b: { main: "#4ade80", glow: "rgba(74, 222, 128, 0.3)", dark: "#22c55e" },
      c: { main: "#f472b6", glow: "rgba(244, 114, 182, 0.3)", dark: "#ec4899" }
    };

    for (let psg = 1; psg <= 2; psg++) {
      const psgIndex = psg - 1;

      for (let ch = 0; ch < 3; ch++) {
        const chName = channelNames[ch];
        const colors = channelColors[chName];
        const canvas = this.contentElement.querySelector(`#psg${psg}-ch-${chName}-waveform`);
        if (!canvas) continue;

        const ctx = canvas.getContext("2d");
        const width = canvas.width;
        const height = canvas.height;
        const SAMPLE_COUNT = width;

        // Get waveform samples from WASM for this specific channel
        const bufferPtr = wasmModule._malloc(SAMPLE_COUNT * 4);
        wasmModule._getMockingboardWaveform(psgIndex, ch, bufferPtr, SAMPLE_COUNT);

        // Copy samples from WASM memory
        const samples = new Float32Array(SAMPLE_COUNT);
        for (let i = 0; i < SAMPLE_COUNT; i++) {
          samples[i] = wasmModule.HEAPF32[(bufferPtr >> 2) + i];
        }
        wasmModule._free(bufferPtr);

        // Clear with gradient background
        const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
        bgGrad.addColorStop(0, "#0a0a14");
        bgGrad.addColorStop(1, "#05050a");
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, width, height);

        // Draw subtle grid lines
        ctx.strokeStyle = "rgba(255, 255, 255, 0.03)";
        ctx.lineWidth = 1;
        for (let y = height * 0.25; y < height; y += height * 0.25) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(width, y);
          ctx.stroke();
        }

        // Draw center line
        ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();

        // Build the waveform path
        const path = new Path2D();
        for (let i = 0; i < SAMPLE_COUNT; i++) {
          const y = height - samples[i] * (height - 4) - 2;
          if (i === 0) {
            path.moveTo(i, y);
          } else {
            path.lineTo(i, y);
          }
        }

        // Draw glow effect (thicker, blurred line underneath)
        ctx.save();
        ctx.strokeStyle = colors.glow;
        ctx.lineWidth = 6;
        ctx.filter = "blur(3px)";
        ctx.stroke(path);
        ctx.restore();

        // Draw secondary glow
        ctx.save();
        ctx.strokeStyle = colors.main;
        ctx.lineWidth = 3;
        ctx.globalAlpha = 0.4;
        ctx.filter = "blur(2px)";
        ctx.stroke(path);
        ctx.restore();

        // Draw main waveform line
        ctx.strokeStyle = colors.main;
        ctx.lineWidth = 1.5;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke(path);

        // Draw filled area under waveform
        ctx.save();
        const fillPath = new Path2D();
        fillPath.moveTo(0, height);
        for (let i = 0; i < SAMPLE_COUNT; i++) {
          const y = height - samples[i] * (height - 4) - 2;
          fillPath.lineTo(i, y);
        }
        fillPath.lineTo(width - 1, height);
        fillPath.closePath();

        const fillGrad = ctx.createLinearGradient(0, 0, 0, height);
        fillGrad.addColorStop(0, colors.glow);
        fillGrad.addColorStop(1, "transparent");
        ctx.fillStyle = fillGrad;
        ctx.globalAlpha = 0.3;
        ctx.fill(fillPath);
        ctx.restore();
      }
    }
  }
}
