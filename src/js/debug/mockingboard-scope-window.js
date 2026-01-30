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
      minWidth: 380,
      minHeight: 200,
      defaultWidth: 480,
      defaultHeight: 280,
      defaultPosition: { x: window.innerWidth - 500, y: 460 },
    });

    this.wasmModule = wasmModule;
    this.muteHandlerAttached = false;
    this._pendingMuteState = null;

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
    const channels = ["a", "b", "c"];
    const renderPSG = (psgNum) => `
      <div class="mb-psg-col" id="mb-scope-psg${psgNum}-output">
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
    `;

    return `
      <div class="mb-scope-content">
        ${renderPSG(1)}
        ${renderPSG(2)}
      </div>
      ${this.renderStyles()}
    `;
  }

  renderStyles() {
    return `<style>
      .mb-scope-content { font-family: 'Monaco', 'Menlo', monospace; font-size: 11px; padding: 6px; height: 100%; display: flex; gap: 6px; }
      .mb-psg-col { flex: 1; display: flex; flex-direction: column; gap: 4px; min-width: 0; min-height: 0; }
      .mb-channel { flex: 1; display: flex; align-items: center; gap: 6px; padding: 3px 6px; background: rgba(255,255,255,0.02); border-radius: 4px; min-height: 26px; }
      .mb-channel-label { width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: bold; border-radius: 3px; color: #fff; flex-shrink: 0; }
      .mb-channel[data-channel="a"] .mb-channel-label { background: #0077b6; }
      .mb-channel[data-channel="b"] .mb-channel-label { background: #22c55e; }
      .mb-channel[data-channel="c"] .mb-channel-label { background: #ec4899; }
      .mb-meter-container { width: 40px; flex-shrink: 0; }
      .mb-meter { height: 8px; background: #0a0a12; border-radius: 2px; position: relative; overflow: hidden; border: 1px solid #1a1a2a; }
      .mb-meter-fill { position: absolute; left: 0; top: 0; height: 100%; width: 0%; border-radius: 1px; }
      .mb-channel[data-channel="a"] .mb-meter-fill { background: #00b4d8; }
      .mb-channel[data-channel="b"] .mb-meter-fill { background: #4ade80; }
      .mb-channel[data-channel="c"] .mb-meter-fill { background: #f472b6; }
      .mb-mute-btn { width: 16px; height: 16px; border: none; border-radius: 3px; background: #2a2a3a; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; flex-shrink: 0; }
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

  getState() {
    const base = super.getState();
    if (this.wasmModule?._getMockingboardChannelMute) {
      const muteState = [];
      for (let psg = 0; psg < 2; psg++) {
        for (let ch = 0; ch < 3; ch++) {
          muteState.push(!!this.wasmModule._getMockingboardChannelMute(psg, ch));
        }
      }
      base.channelMutes = muteState;
    }
    return base;
  }

  restoreState(state) {
    if (state.channelMutes) {
      this._pendingMuteState = state.channelMutes;
    }
    super.restoreState(state);
  }

  update(wasmModule) {
    if (!wasmModule) return;
    this.wasmModule = wasmModule;

    // Cache elements on first update
    if (!this.elements) {
      this.cacheElements();
      this.allocateWaveformBuffer();
    }

    // Apply pending mute state from session restore
    if (this._pendingMuteState && wasmModule._setMockingboardChannelMute) {
      const mutes = this._pendingMuteState;
      this._pendingMuteState = null;
      for (let psg = 0; psg < 2; psg++) {
        for (let ch = 0; ch < 3; ch++) {
          if (mutes[psg * 3 + ch]) {
            wasmModule._setMockingboardChannelMute(psg, ch, true);
          }
        }
      }
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
          if (this.onStateChange) this.onStateChange();
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
