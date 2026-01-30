import { BaseWindow } from "../windows/base-window.js";

/**
 * MockingboardScopeWindow - Channel output waveforms, level meters, and mute controls
 * Shows real-time audio visualization for both Mockingboard PSGs
 */
export class MockingboardScopeWindow extends BaseWindow {
  constructor(wasmModule) {
    super({
      id: "mockingboard-scope",
      title: "Mockingboard Scope",
      minWidth: 460,
      minHeight: 260,
      defaultWidth: 480,
      defaultHeight: 340,
      defaultPosition: { x: window.innerWidth - 500, y: 460 },
    });

    this.wasmModule = wasmModule;
    this.muteHandlerAttached = false;

    // Cached DOM element references (populated on first update)
    this.elements = null;

    // Previous values for dirty checking
    this.prevValues = {};

    // Fixed sample count for waveform data (scaled to canvas width during drawing)
    this.waveformSampleCount = 256;
    this.waveformBufferPtr = null;

    // Waveform colors (pre-defined)
    this.channelColors = {
      a: "#00b4d8", b: "#4ade80", c: "#f472b6"
    };
  }

  renderContent() {
    return `
      <div class="mb-scope-content">
        <div class="mb-section mb-output-section">
          <div class="mb-section-title">Channel Output</div>
          <div class="mb-output-grid">
            ${this.renderPSGOutput(1)}
            ${this.renderPSGOutput(2)}
          </div>
        </div>
      </div>
      ${this.renderStyles()}
    `;
  }

  renderPSGOutput(psgNum) {
    const channels = ["a", "b", "c"];
    return `
      <div class="mb-psg-output" id="mb-scope-psg${psgNum}-output">
        <div class="mb-psg-header">PSG ${psgNum}</div>
        <div class="mb-channels-grid">
          ${channels.map(ch => `
            <div class="mb-channel" data-channel="${ch}" data-psg="${psgNum}">
              <button class="mb-mute-btn" data-psg="${psgNum}" data-ch="${channels.indexOf(ch)}" title="Mute/Unmute Channel ${ch.toUpperCase()}">
                <span class="mb-mute-icon"></span>
              </button>
              <div class="mb-channel-label">${ch.toUpperCase()}</div>
              <div class="mb-meter-container">
                <div class="mb-meter" id="mb-scope-psg${psgNum}-ch-${ch}">
                  <div class="mb-meter-fill"></div>
                </div>
              </div>
              <canvas id="mb-scope-psg${psgNum}-ch-${ch}-waveform" class="mb-waveform"></canvas>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  renderStyles() {
    return `<style>
      .mb-scope-content { font-family: 'Monaco', 'Menlo', monospace; font-size: 11px; padding: 8px; height: 100%; display: flex; flex-direction: column; }
      .mb-output-section { flex: 1; display: flex; flex-direction: column; min-height: 0; padding: 8px; background: #12121f; border: 1px solid #2a2a4a; border-radius: 4px; }
      .mb-scope-content .mb-section-title { color: #88f; font-weight: bold; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px solid #333; flex-shrink: 0; }
      .mb-output-grid { flex: 1; display: flex; gap: 12px; min-height: 0; }
      .mb-psg-output { flex: 1; display: flex; flex-direction: column; min-width: 0; min-height: 0; background: #0d0d18; border-radius: 8px; padding: 10px; border: 1px solid #1a1a30; }
      .mb-psg-header { flex-shrink: 0; text-align: center; color: #6688cc; font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid #1a1a30; }
      .mb-channels-grid { flex: 1; display: flex; flex-direction: column; gap: 6px; min-height: 0; }
      .mb-channel { flex: 1; display: flex; align-items: center; gap: 8px; padding: 4px 8px; background: rgba(255,255,255,0.02); border-radius: 6px; min-height: 30px; }
      .mb-channel-label { width: 18px; height: 18px; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: bold; border-radius: 4px; color: #fff; flex-shrink: 0; }
      .mb-channel[data-channel="a"] .mb-channel-label { background: #0077b6; }
      .mb-channel[data-channel="b"] .mb-channel-label { background: #22c55e; }
      .mb-channel[data-channel="c"] .mb-channel-label { background: #ec4899; }
      .mb-meter-container { width: 50px; flex-shrink: 0; }
      .mb-meter { height: 10px; background: #0a0a12; border-radius: 2px; position: relative; overflow: hidden; border: 1px solid #1a1a2a; }
      .mb-meter-fill { position: absolute; left: 0; top: 0; height: 100%; width: 0%; border-radius: 1px; }
      .mb-channel[data-channel="a"] .mb-meter-fill { background: #00b4d8; }
      .mb-channel[data-channel="b"] .mb-meter-fill { background: #4ade80; }
      .mb-channel[data-channel="c"] .mb-meter-fill { background: #f472b6; }
      .mb-mute-btn { width: 18px; height: 18px; border: none; border-radius: 3px; background: #2a2a3a; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; flex-shrink: 0; }
      .mb-mute-btn:hover { background: #3a3a4a; }
      .mb-mute-icon { width: 10px; height: 10px; position: relative; }
      .mb-mute-icon::before { content: ""; position: absolute; left: 1px; top: 2px; width: 3px; height: 5px; background: #8a8aaa; border-radius: 1px; }
      .mb-mute-icon::after { content: ""; position: absolute; left: 4px; top: 1px; width: 0; height: 0; border-top: 4px solid transparent; border-bottom: 4px solid transparent; border-left: 5px solid #8a8aaa; }
      .mb-mute-btn.muted { background: #4a2a2a; }
      .mb-mute-btn.muted .mb-mute-icon::before, .mb-mute-btn.muted .mb-mute-icon::after { background: #ff6666; border-left-color: #ff6666; }
      .mb-channel.muted { opacity: 0.5; }
      .mb-waveform { flex: 1; min-width: 60px; min-height: 0; height: 100%; background: #05050a; border-radius: 3px; border: 1px solid #1a1a2a; display: block; }
    </style>`;
  }

  /**
   * Cache all DOM element references for fast access
   */
  cacheElements() {
    const el = this.contentElement;
    this.elements = {
      meters: [{}, {}],
      canvases: [{}, {}],
      mute: [{}, {}],
      channels: [{}, {}],
    };

    const channelNames = ["a", "b", "c"];

    for (let psg = 0; psg < 2; psg++) {
      const psgNum = psg + 1;

      for (let ch = 0; ch < 3; ch++) {
        const chName = channelNames[ch];
        const meter = el.querySelector(`#mb-scope-psg${psgNum}-ch-${chName}`);
        this.elements.meters[psg][ch] = meter?.querySelector(".mb-meter-fill");
        this.elements.canvases[psg][ch] = el.querySelector(`#mb-scope-psg${psgNum}-ch-${chName}-waveform`);
        this.elements.mute[psg][ch] = el.querySelector(`.mb-mute-btn[data-psg="${psgNum}"][data-ch="${ch}"]`);
        this.elements.channels[psg][ch] = el.querySelector(`.mb-channel[data-psg="${psgNum}"][data-channel="${chName}"]`);
      }
    }

    // Pre-get canvas contexts
    this.canvasCtx = [[], []];
    for (let psg = 0; psg < 2; psg++) {
      for (let ch = 0; ch < 3; ch++) {
        const canvas = this.elements.canvases[psg][ch];
        if (canvas) {
          this.canvasCtx[psg][ch] = canvas.getContext("2d", { alpha: false });
        }
      }
    }
  }

  /**
   * Allocate WASM buffer for waveform data (called once)
   */
  allocateWaveformBuffer() {
    if (!this.waveformBufferPtr && this.wasmModule?._malloc) {
      this.waveformBufferPtr = this.wasmModule._malloc(this.waveformSampleCount * 4);
    }
  }

  /**
   * Sync canvas drawing buffer dimensions to their CSS layout size
   */
  resizeCanvases() {
    for (let psg = 0; psg < 2; psg++) {
      for (let ch = 0; ch < 3; ch++) {
        const canvas = this.elements.canvases[psg][ch];
        if (!canvas) continue;
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) {
          canvas.width = w;
          canvas.height = h;
        }
      }
    }
  }

  /**
   * Free WASM buffer when window is destroyed
   */
  destroy() {
    if (this.waveformBufferPtr && this.wasmModule?._free) {
      this.wasmModule._free(this.waveformBufferPtr);
      this.waveformBufferPtr = null;
    }
    super.destroy();
  }

  update(wasmModule) {
    if (!wasmModule) return;
    this.wasmModule = wasmModule;

    // Cache elements on first update
    if (!this.elements) {
      this.cacheElements();
      this.allocateWaveformBuffer();
    }

    // Sync canvas drawing buffers to CSS layout size
    this.resizeCanvases();

    // Set up mute handlers once
    if (!this.muteHandlerAttached && this.contentElement) {
      this.muteHandlerAttached = true;
      this.contentElement.addEventListener("click", (e) => {
        const muteBtn = e.target.closest(".mb-mute-btn");
        if (muteBtn && this.wasmModule?._setMockingboardChannelMute) {
          const psg = parseInt(muteBtn.dataset.psg, 10) - 1;
          const ch = parseInt(muteBtn.dataset.ch, 10);
          const currentlyMuted = this.wasmModule._getMockingboardChannelMute(psg, ch);
          this.wasmModule._setMockingboardChannelMute(psg, ch, !currentlyMuted);
          this.updateMuteState();
        }
      });
    }

    // Update meters and waveforms
    this.updateChannelMeters(wasmModule);
    this.updateWaveforms(wasmModule);
    this.updateMuteState();
  }

  updateMuteState() {
    if (!this.wasmModule?._getMockingboardChannelMute) return;

    for (let psg = 0; psg < 2; psg++) {
      for (let ch = 0; ch < 3; ch++) {
        const isMuted = this.wasmModule._getMockingboardChannelMute(psg, ch);
        const key = `mute${psg}${ch}`;
        if (this.prevValues[key] !== isMuted) {
          this.prevValues[key] = isMuted;
          const muteBtn = this.elements.mute[psg][ch];
          const channelRow = this.elements.channels[psg][ch];
          if (muteBtn) muteBtn.classList.toggle("muted", isMuted);
          if (channelRow) channelRow.classList.toggle("muted", isMuted);
        }
      }
    }
  }

  updateChannelMeters(wasmModule) {
    if (!wasmModule._getMockingboardPSGRegister) return;

    for (let psg = 0; psg < 2; psg++) {
      for (let ch = 0; ch < 3; ch++) {
        const ampReg = wasmModule._getMockingboardPSGRegister(psg, 8 + ch);
        const useEnv = (ampReg & 0x10) !== 0;
        const vol = ampReg & 0x0f;
        const displayVol = useEnv ? 50 : (vol / 15) * 100;

        const fillEl = this.elements.meters[psg][ch];
        if (fillEl) {
          fillEl.style.width = `${displayVol}%`;
        }
      }
    }
  }

  updateWaveforms(wasmModule) {
    if (!wasmModule._getMockingboardWaveform || !this.waveformBufferPtr) return;

    const colors = [this.channelColors.a, this.channelColors.b, this.channelColors.c];
    const sampleCount = this.waveformSampleCount;
    const heapOffset = this.waveformBufferPtr >> 2;

    for (let psg = 0; psg < 2; psg++) {
      for (let ch = 0; ch < 3; ch++) {
        const ctx = this.canvasCtx[psg]?.[ch];
        if (!ctx) continue;

        const canvas = this.elements.canvases[psg][ch];
        const width = canvas.width;
        const height = canvas.height;
        if (width === 0 || height === 0) continue;

        // Fetch fixed number of samples (cheap, constant cost)
        wasmModule._getMockingboardWaveform(psg, ch, this.waveformBufferPtr, sampleCount);

        // Clear canvas
        ctx.fillStyle = "#05050a";
        ctx.fillRect(0, 0, width, height);

        // Draw center line
        ctx.strokeStyle = "#1a1a2a";
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();

        // Draw waveform scaled to canvas width
        ctx.strokeStyle = colors[ch];
        ctx.lineWidth = 1;
        ctx.beginPath();

        const xScale = width / (sampleCount - 1);
        for (let i = 0; i < sampleCount; i++) {
          const sample = wasmModule.HEAPF32[heapOffset + i];
          const x = i * xScale;
          const y = height - sample * (height - 2) - 1;
          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      }
    }
  }
}
