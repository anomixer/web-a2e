/*
 * mockingboard-window.js - Unified Mockingboard window with channel cards,
 *   inline waveforms, mute controls, level meters, and VIA detail
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { BaseWindow } from "../windows/base-window.js";

// Note names for frequency-to-note conversion
const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

// Channel badge background colors
const CHANNEL_BADGE_COLORS = { a: "#006FA3", b: "#3D8F2B", c: "#B42D31" };

// Channel waveform / meter colors
const CHANNEL_COLORS = { a: "#18ABEA", b: "#6EC94F", c: "#E5504F" };

// Envelope shape SVG paths (48x16 viewBox)
const ENVELOPE_SVGS = {
  0x00: "M2,2 L24,14 L46,14", // \___
  0x04: "M2,14 L24,2 L46,14", // /|__  (attack then drop)
  0x08: "M2,2 L12,14 L22,2 L32,14 L42,2 L46,6", // \\\\
  0x09: "M2,2 L24,14 L46,14", // \___
  0x0a: "M2,2 L12,14 L24,2 L36,14 L46,2", // \/\/
  0x0b: "M2,2 L14,14 L14,2 L46,2", // \--- (decay then hold high)
  0x0c: "M2,14 L12,2 L22,14 L32,2 L42,14 L46,10", // ////
  0x0d: "M2,14 L14,2 L14,14 L46,14", // /--- (attack then hold high... inverted)
  0x0e: "M2,14 L12,2 L24,14 L36,2 L46,14", // /\/\
  0x0f: "M2,14 L24,2 L46,14", // /___  (same as 0x04 for shape 15)
};

/**
 * Convert a frequency in Hz to a musical note name + octave.
 * Returns null if outside audible range.
 */
function frequencyToNote(freq) {
  if (freq < 20 || freq > 20000) return null;
  const noteNum = 12 * Math.log2(freq / 440) + 69;
  const rounded = Math.round(noteNum);
  const name = NOTE_NAMES[((rounded % 12) + 12) % 12];
  const octave = Math.floor(rounded / 12) - 1;
  return `${name}${octave}`;
}

/**
 * Build an inline SVG string for an envelope shape value (R13 & 0x0F).
 */
function getEnvelopeShapeSVG(value) {
  const path = ENVELOPE_SVGS[value & 0x0f];
  if (!path) return '<span class="mb-env-unknown">?</span>';
  return (
    `<svg class="mb-env-svg" viewBox="0 0 48 16" width="48" height="16" preserveAspectRatio="none">` +
    `<polyline points="${path.replace(/M|L/g, "").replace(/\s+/g, " ").trim()}" ` +
    `fill="none" stroke="var(--accent-green)" stroke-width="1.5" stroke-linejoin="round"/>` +
    `</svg>`
  );
}

export class MockingboardWindow extends BaseWindow {
  constructor(wasmModule) {
    super({
      id: "mockingboard-debug",
      title: "Mockingboard",
      minWidth: 700,
      minHeight: 630,
      defaultWidth: 700,
      defaultHeight: 630,
      resizeDirections: [],
    });

    this.wasmModule = wasmModule;
    this.muteHandlerAttached = false;
    this._pendingMuteState = null;

    // Cached DOM element references (populated on first update)
    this.elements = null;

    // Previous values for dirty checking
    this.prevValues = {};

    // Waveform buffer
    this.waveformSampleCount = 256;
    this.waveformBufferPtr = null;

    // Canvas drawing colors (updated on theme changes)
    this.canvasBg = "#05050a";
    this.canvasLine = "#1a1a2a";
  }

  renderContent() {
    return `
      <div class="mockingboard-content">
        <div class="mb-status">
          <span class="mb-label">Status:</span>
          <span id="mb-enabled" class="mb-badge">DISABLED</span>
        </div>
        ${this.renderPSGSection(1)}
        ${this.renderPSGSection(2)}
      </div>
      ${this.renderStyles()}
    `;
  }

  renderPSGSection(psgNum) {
    const channels = ["a", "b", "c"];
    const channelLabels = ["A", "B", "C"];

    const channelRows = channels
      .map(
        (ch, i) => `
      <div class="mb-channel-row" data-channel="${ch}" data-psg="${psgNum}">
        <button class="mb-mute-btn" data-psg="${psgNum}" data-ch="${i}" title="Mute/Unmute Channel ${channelLabels[i]}">
          <svg class="mb-icon-on" viewBox="0 0 12 12" width="12" height="12"><path d="M1 4.2h2l2.5-2.5v8.6L3 7.8H1z" fill="currentColor"/><path d="M8 3.5q2 2.5 0 5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
          <svg class="mb-icon-off" viewBox="0 0 12 12" width="12" height="12"><path d="M1 4.2h2l2.5-2.5v8.6L3 7.8H1z" fill="currentColor"/><line x1="7.5" y1="3.5" x2="11" y2="8.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><line x1="11" y1="3.5" x2="7.5" y2="8.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
        </button>
        <div class="mb-ch-label mb-ch-label-${ch}">${channelLabels[i]}</div>
        <span class="mb-ch-freq" id="mb-psg${psgNum}-ch${ch}-freq">--</span>
        <span class="mb-tn-badge mb-tn-tone" id="mb-psg${psgNum}-ch${ch}-tone">T</span>
        <span class="mb-tn-badge mb-tn-noise" id="mb-psg${psgNum}-ch${ch}-noise">N</span>
        <div class="mb-vol-bar-container">
          <div class="mb-vol-bar">
            <div class="mb-vol-fill mb-vol-fill-${ch}" id="mb-psg${psgNum}-ch${ch}-fill"></div>
          </div>
        </div>
        <span class="mb-vol-text" id="mb-psg${psgNum}-ch${ch}-vol">0/15</span>
        <canvas class="mb-waveform" id="mb-psg${psgNum}-ch${ch}-waveform"></canvas>
      </div>
    `,
      )
      .join("");

    return `
      <div class="mb-section mb-psg-section">
        <div class="mb-section-title">PSG ${psgNum} (VIA${psgNum} @ $C4${psgNum === 1 ? "00" : "80"})</div>
        <div class="mb-channels">
          ${channelRows}
        </div>
        <div class="mb-env-noise-row">
          <span class="mb-label">Env:</span>
          <span id="mb-psg${psgNum}-env-shape" class="mb-env-shape"></span>
          <span id="mb-psg${psgNum}-env-freq" class="mb-env-freq"></span>
          <span class="mb-label" style="margin-left:12px">Noise:</span>
          <span id="mb-psg${psgNum}-noise-freq" class="mb-noise-freq"></span>
        </div>
        <div class="mb-via-status">
          <span class="mb-label">VIA${psgNum} IRQ:</span>
          <span id="via${psgNum}-irq" class="mb-badge">OFF</span>
          <span class="mb-port">Ctrl:<span id="via${psgNum}-ctrl">--</span></span>
          <span class="mb-port">Writes:<span id="psg${psgNum}-writes">0</span></span>
          <span class="mb-port">Last:<span id="psg${psgNum}-last">R?=$??</span></span>
        </div>
        <div class="mb-timer-info">
          <span class="mb-timer">T1:<span id="via${psgNum}-t1cnt">$0000</span></span>
          <span class="mb-timer">Latch:<span id="via${psgNum}-t1lat">$0000</span></span>
          <span class="mb-timer-flag" id="via${psgNum}-t1run">RUN</span>
          <span class="mb-timer-flag" id="via${psgNum}-t1fire">FIRE</span>
          <span class="mb-timer-flag" id="via${psgNum}-t1irq">T1IRQ</span>
        </div>
        <div class="mb-via-ports">
          <span class="mb-port">ORA:<span id="via${psgNum}-ora">$00</span></span>
          <span class="mb-port">ORB:<span id="via${psgNum}-orb">$00</span></span>
          <span class="mb-port">DDRA:<span id="via${psgNum}-ddra">$00</span></span>
          <span class="mb-port">DDRB:<span id="via${psgNum}-ddrb">$00</span></span>
        </div>
        <div class="mb-via-ports">
          <span class="mb-timer">ACR:<span id="via${psgNum}-acr">$00</span></span>
          <span class="mb-timer">IFR:<span id="via${psgNum}-ifr">$00</span></span>
          <span class="mb-timer">IER:<span id="via${psgNum}-ier">$00</span></span>
        </div>
      </div>
    `;
  }

  renderStyles() {
    return `<style>
      .mockingboard-content {
        font-family: 'Monaco', 'Menlo', monospace;
        font-size: 11px;
        padding: 8px;
        overflow-y: auto;
        height: 100%;
      }
      .mb-status {
        margin-bottom: 8px;
        padding: 4px 8px;
        background: var(--input-bg-dark);
        border-radius: 4px;
      }
      .mb-label { color: var(--text-muted); margin-right: 6px; }
      .mb-badge {
        padding: 2px 6px;
        border-radius: 3px;
        background: var(--badge-dim-bg);
        color: var(--text-muted);
        font-size: 10px;
      }
      .mb-badge.active { background: var(--accent-green-bg-stronger); color: var(--accent-green); }
      .mb-badge.irq-active { background: var(--accent-red-bg-stronger); color: var(--accent-red); }
      .mb-section {
        margin-bottom: 8px;
        padding: 8px;
        background: var(--input-bg-dark);
        border-radius: 4px;
      }
      .mb-section-title {
        color: var(--accent-blue);
        font-weight: bold;
        margin-bottom: 6px;
        padding-bottom: 4px;
        border-bottom: 1px solid var(--border-default);
      }

      /* Channel rows */
      .mb-channels { display: flex; flex-direction: column; gap: 3px; }
      .mb-channel-row {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 4px 6px;
        background: var(--overlay-white-02);
        border-radius: 4px;
        height: 36px;
      }
      .mb-channel-row.muted { opacity: 0.5; }

      /* Mute button */
      .mb-mute-btn {
        width: 20px; height: 20px;
        border: none; border-radius: 3px;
        background: var(--badge-dim-bg);
        cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        padding: 0; flex-shrink: 0;
        color: var(--text-muted);
      }
      .mb-mute-btn:hover { background: var(--overlay-hover); }
      .mb-mute-btn .mb-icon-off { display: none; }
      .mb-mute-btn.muted .mb-icon-on { display: none; }
      .mb-mute-btn.muted .mb-icon-off { display: block; }
      .mb-mute-btn.muted { background: var(--accent-red-bg-stronger); color: var(--accent-red); }

      /* Channel label badge */
      .mb-ch-label {
        width: 16px; height: 16px;
        display: flex; align-items: center; justify-content: center;
        font-size: 9px; font-weight: bold;
        border-radius: 3px; color: #fff; flex-shrink: 0;
      }
      .mb-ch-label-a { background: ${CHANNEL_BADGE_COLORS.a}; }
      .mb-ch-label-b { background: ${CHANNEL_BADGE_COLORS.b}; }
      .mb-ch-label-c { background: ${CHANNEL_BADGE_COLORS.c}; }

      /* Frequency / note display */
      .mb-ch-freq {
        width: 85px; flex-shrink: 0;
        color: var(--text-secondary);
        font-size: 10px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      /* T/N indicator badges */
      .mb-tn-badge {
        width: 18px; height: 16px;
        display: inline-flex; align-items: center; justify-content: center;
        font-size: 9px; font-weight: bold;
        border-radius: 3px; flex-shrink: 0;
        background: var(--badge-dim-bg); color: var(--text-muted);
      }
      .mb-tn-badge.on {
        background: var(--accent-green-bg-stronger);
        color: var(--accent-green);
      }

      /* Volume bar */
      .mb-vol-bar-container { width: 60px; flex-shrink: 0; }
      .mb-vol-bar {
        height: 8px;
        background: var(--input-bg-deeper);
        border-radius: 2px;
        position: relative;
        overflow: hidden;
        border: 1px solid var(--border-muted);
      }
      .mb-vol-fill {
        position: absolute; left: 0; top: 0;
        height: 100%; width: 0%;
        border-radius: 1px;
      }
      .mb-vol-fill-a { background: ${CHANNEL_COLORS.a}; }
      .mb-vol-fill-b { background: ${CHANNEL_COLORS.b}; }
      .mb-vol-fill-c { background: ${CHANNEL_COLORS.c}; }

      /* Volume text */
      .mb-vol-text {
        width: 30px; flex-shrink: 0;
        font-size: 9px;
        color: var(--text-muted);
        text-align: center;
      }
      .mb-vol-text.env-mode { color: var(--accent-purple); }

      /* Waveform canvas */
      .mb-waveform {
        flex: 1; min-width: 60px; min-height: 0;
        height: 100%;
        background: var(--input-bg-deeper);
        border-radius: 3px;
        border: 1px solid var(--border-muted);
        display: block;
      }

      /* Envelope / noise summary row */
      .mb-env-noise-row {
        display: flex;
        align-items: center;
        gap: 4px;
        margin-top: 6px;
        padding: 3px 6px;
        font-size: 10px;
      }
      .mb-env-svg { vertical-align: middle; margin: 0 4px; }
      .mb-env-freq { color: var(--accent-green); }
      .mb-noise-freq { color: var(--accent-blue); }
      .mb-env-unknown { color: var(--text-muted); }

      /* VIA detail */
      .mb-via-status {
        margin-top: 6px;
        padding-top: 4px;
        border-top: 1px solid var(--border-default);
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
      }
      .mb-via-ports, .mb-timer-info {
        margin-top: 4px;
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
      }
      .mb-port, .mb-timer { color: var(--text-muted); font-size: 10px; }
      .mb-port span { color: var(--accent-green); margin-left: 2px; }
      .mb-timer span { color: var(--accent-purple); margin-left: 2px; }
      .mb-timer-flag {
        padding: 1px 4px;
        border-radius: 2px;
        background: var(--badge-dim-bg);
        color: var(--text-muted);
        font-size: 9px;
      }
      .mb-timer-flag.active {
        background: var(--accent-orange-bg-strong);
        color: var(--accent-orange);
      }
    </style>`;
  }

  /**
   * Cache all DOM element references for fast access
   */
  cacheElements() {
    const el = this.contentElement;
    const channelNames = ["a", "b", "c"];

    this.elements = {
      enabled: el.querySelector("#mb-enabled"),
      psg: [{}, {}],
      via: [{}, {}],
    };

    for (let psg = 0; psg < 2; psg++) {
      const psgNum = psg + 1;
      const psgEl = {};

      // Per-channel elements
      psgEl.channels = [];
      psgEl.mute = [];
      psgEl.freq = [];
      psgEl.tone = [];
      psgEl.noise = [];
      psgEl.volFill = [];
      psgEl.volText = [];
      psgEl.canvases = [];
      psgEl.canvasCtx = [];

      for (let ch = 0; ch < 3; ch++) {
        const chName = channelNames[ch];
        psgEl.channels[ch] = el.querySelector(
          `.mb-channel-row[data-psg="${psgNum}"][data-channel="${chName}"]`,
        );
        psgEl.mute[ch] = el.querySelector(
          `.mb-mute-btn[data-psg="${psgNum}"][data-ch="${ch}"]`,
        );
        psgEl.freq[ch] = el.querySelector(`#mb-psg${psgNum}-ch${chName}-freq`);
        psgEl.tone[ch] = el.querySelector(`#mb-psg${psgNum}-ch${chName}-tone`);
        psgEl.noise[ch] = el.querySelector(
          `#mb-psg${psgNum}-ch${chName}-noise`,
        );
        psgEl.volFill[ch] = el.querySelector(
          `#mb-psg${psgNum}-ch${chName}-fill`,
        );
        psgEl.volText[ch] = el.querySelector(
          `#mb-psg${psgNum}-ch${chName}-vol`,
        );
        const canvas = el.querySelector(
          `#mb-psg${psgNum}-ch${chName}-waveform`,
        );
        psgEl.canvases[ch] = canvas;
        psgEl.canvasCtx[ch] = canvas
          ? canvas.getContext("2d", { alpha: false })
          : null;
      }

      // Envelope / noise
      psgEl.envShape = el.querySelector(`#mb-psg${psgNum}-env-shape`);
      psgEl.envFreq = el.querySelector(`#mb-psg${psgNum}-env-freq`);
      psgEl.noiseFreq = el.querySelector(`#mb-psg${psgNum}-noise-freq`);

      this.elements.psg[psg] = psgEl;

      // VIA elements
      this.elements.via[psg] = {
        irq: el.querySelector(`#via${psgNum}-irq`),
        ora: el.querySelector(`#via${psgNum}-ora`),
        orb: el.querySelector(`#via${psgNum}-orb`),
        ddra: el.querySelector(`#via${psgNum}-ddra`),
        ddrb: el.querySelector(`#via${psgNum}-ddrb`),
        ctrl: el.querySelector(`#via${psgNum}-ctrl`),
        writes: el.querySelector(`#psg${psgNum}-writes`),
        last: el.querySelector(`#psg${psgNum}-last`),
        t1cnt: el.querySelector(`#via${psgNum}-t1cnt`),
        t1lat: el.querySelector(`#via${psgNum}-t1lat`),
        t1run: el.querySelector(`#via${psgNum}-t1run`),
        t1fire: el.querySelector(`#via${psgNum}-t1fire`),
        acr: el.querySelector(`#via${psgNum}-acr`),
        ifr: el.querySelector(`#via${psgNum}-ifr`),
        ier: el.querySelector(`#via${psgNum}-ier`),
        t1irq: el.querySelector(`#via${psgNum}-t1irq`),
      };
    }
  }

  /**
   * Allocate WASM buffer for waveform data (called once)
   */
  allocateWaveformBuffer() {
    if (!this.waveformBufferPtr && this.wasmModule?._malloc) {
      this.waveformBufferPtr = this.wasmModule._malloc(
        this.waveformSampleCount * 4,
      );
    }
  }

  /**
   * Sync canvas drawing buffer dimensions to their CSS layout size
   */
  resizeCanvases() {
    for (let psg = 0; psg < 2; psg++) {
      const psgEl = this.elements.psg[psg];
      for (let ch = 0; ch < 3; ch++) {
        const canvas = psgEl.canvases[ch];
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
   * Read canvas drawing colors from current theme
   */
  updateCanvasColors() {
    const style = getComputedStyle(document.documentElement);
    this.canvasBg = style.getPropertyValue("--canvas-bg").trim() || "#05050a";
    this.canvasLine =
      style.getPropertyValue("--canvas-line").trim() || "#1a1a2a";
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
          muteState.push(
            !!this.wasmModule._getMockingboardChannelMute(psg, ch),
          );
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
      this.updateCanvasColors();
    }

    // Update canvas colors when theme changes
    const currentTheme = document.documentElement.dataset.theme;
    if (this._lastTheme !== currentTheme) {
      this._lastTheme = currentTheme;
      this.updateCanvasColors();
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
          const currentlyMuted = this.wasmModule._getMockingboardChannelMute(
            psg,
            ch,
          );
          this.wasmModule._setMockingboardChannelMute(psg, ch, !currentlyMuted);
          this.updateMuteState();
          if (this.onStateChange) this.onStateChange();
        }
      });
    }

    // Update enabled status
    this.updateEnabled(wasmModule);

    // Update channels
    this.updateChannels(wasmModule);
    this.updateWaveforms(wasmModule);
    this.updateMuteState();

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

  updateChannels(wasmModule) {
    if (!wasmModule._getMockingboardPSGRegister) return;

    const channelRegs = [
      [0, 1], // Channel A tone fine/coarse
      [2, 3], // Channel B tone fine/coarse
      [4, 5], // Channel C tone fine/coarse
    ];

    for (let psg = 0; psg < 2; psg++) {
      const psgEl = this.elements.psg[psg];
      const r7 = wasmModule._getMockingboardPSGRegister(psg, 7);

      for (let ch = 0; ch < 3; ch++) {
        // Frequency and note
        const fineReg = channelRegs[ch][0];
        const coarseReg = channelRegs[ch][1];
        const fine = wasmModule._getMockingboardPSGRegister(psg, fineReg);
        const coarse = wasmModule._getMockingboardPSGRegister(psg, coarseReg);
        const period = fine | ((coarse & 0x0f) << 8);
        const freq = period > 0 ? Math.round(1023000 / (8 * period)) : 0;

        const freqKey = `psg${psg}ch${ch}freq`;
        if (this.prevValues[freqKey] !== freq) {
          this.prevValues[freqKey] = freq;
          const freqEl = psgEl.freq[ch];
          if (freqEl) {
            if (freq > 0) {
              const note = frequencyToNote(freq);
              freqEl.textContent = note ? `${note} ${freq}Hz` : `${freq}Hz`;
            } else {
              freqEl.textContent = "--";
            }
          }
        }

        // Tone enabled (bit 0,1,2 of R7 — 0 = enabled)
        const toneEnabled = !(r7 & (1 << ch));
        const toneKey = `psg${psg}ch${ch}tone`;
        if (this.prevValues[toneKey] !== toneEnabled) {
          this.prevValues[toneKey] = toneEnabled;
          if (psgEl.tone[ch])
            psgEl.tone[ch].classList.toggle("on", toneEnabled);
        }

        // Noise enabled (bits 3,4,5 of R7 — 0 = enabled)
        const noiseEnabled = !(r7 & (1 << (ch + 3)));
        const noiseKey = `psg${psg}ch${ch}noise`;
        if (this.prevValues[noiseKey] !== noiseEnabled) {
          this.prevValues[noiseKey] = noiseEnabled;
          if (psgEl.noise[ch])
            psgEl.noise[ch].classList.toggle("on", noiseEnabled);
        }

        // Volume / envelope mode
        const ampReg = wasmModule._getMockingboardPSGRegister(psg, 8 + ch);
        const useEnv = (ampReg & 0x10) !== 0;
        const vol = ampReg & 0x0f;

        const volKey = `psg${psg}ch${ch}vol`;
        const volVal = useEnv ? -1 : vol;
        if (this.prevValues[volKey] !== volVal) {
          this.prevValues[volKey] = volVal;

          // Volume bar fill
          const fillEl = psgEl.volFill[ch];
          if (fillEl) {
            fillEl.style.width = useEnv ? "50%" : `${(vol / 15) * 100}%`;
          }

          // Volume text
          const volTextEl = psgEl.volText[ch];
          if (volTextEl) {
            volTextEl.textContent = useEnv ? "ENV" : `${vol}/15`;
            volTextEl.classList.toggle("env-mode", useEnv);
          }
        }
      }

      // Envelope shape and frequency
      const envShape = wasmModule._getMockingboardPSGRegister(psg, 13);
      const envShapeKey = `psg${psg}envShape`;
      if (this.prevValues[envShapeKey] !== envShape) {
        this.prevValues[envShapeKey] = envShape;
        if (psgEl.envShape) {
          psgEl.envShape.innerHTML = getEnvelopeShapeSVG(envShape);
        }
      }

      const envFine = wasmModule._getMockingboardPSGRegister(psg, 11);
      const envCoarse = wasmModule._getMockingboardPSGRegister(psg, 12);
      const envPeriod = envFine | (envCoarse << 8);
      const envFreq =
        envPeriod > 0 ? (1023000 / (256 * envPeriod)).toFixed(1) : 0;
      const envFreqKey = `psg${psg}envFreq`;
      if (this.prevValues[envFreqKey] !== envFreq) {
        this.prevValues[envFreqKey] = envFreq;
        if (psgEl.envFreq) {
          psgEl.envFreq.textContent = envFreq > 0 ? `${envFreq}Hz` : "";
        }
      }

      // Noise frequency
      const noisePeriod = wasmModule._getMockingboardPSGRegister(psg, 6);
      const noiseFreq =
        noisePeriod > 0 ? (1023000 / (16 * noisePeriod)).toFixed(1) : 0;
      const noiseFreqKey = `psg${psg}noiseFreq`;
      if (this.prevValues[noiseFreqKey] !== noiseFreq) {
        this.prevValues[noiseFreqKey] = noiseFreq;
        if (psgEl.noiseFreq) {
          psgEl.noiseFreq.textContent = noiseFreq > 0 ? `${noiseFreq}Hz` : "";
        }
      }
    }
  }

  updateMuteState() {
    if (!this.wasmModule?._getMockingboardChannelMute) return;

    for (let psg = 0; psg < 2; psg++) {
      const psgEl = this.elements.psg[psg];
      for (let ch = 0; ch < 3; ch++) {
        const isMuted = this.wasmModule._getMockingboardChannelMute(psg, ch);
        const key = `mute${psg}${ch}`;
        if (this.prevValues[key] !== isMuted) {
          this.prevValues[key] = isMuted;
          if (psgEl.mute[ch]) psgEl.mute[ch].classList.toggle("muted", isMuted);
          if (psgEl.channels[ch])
            psgEl.channels[ch].classList.toggle("muted", isMuted);
        }
      }
    }
  }

  updateWaveforms(wasmModule) {
    if (!wasmModule._getMockingboardWaveform || !this.waveformBufferPtr) return;

    const colors = [CHANNEL_COLORS.a, CHANNEL_COLORS.b, CHANNEL_COLORS.c];
    const sampleCount = this.waveformSampleCount;
    const heapOffset = this.waveformBufferPtr >> 2;

    for (let psg = 0; psg < 2; psg++) {
      const psgEl = this.elements.psg[psg];
      for (let ch = 0; ch < 3; ch++) {
        const ctx = psgEl.canvasCtx[ch];
        if (!ctx) continue;

        const canvas = psgEl.canvases[ch];
        const width = canvas.width;
        const height = canvas.height;
        if (width === 0 || height === 0) continue;

        wasmModule._getMockingboardWaveform(
          psg,
          ch,
          this.waveformBufferPtr,
          sampleCount,
        );

        // Clear canvas
        ctx.fillStyle = this.canvasBg;
        ctx.fillRect(0, 0, width, height);

        // Draw center line
        ctx.strokeStyle = this.canvasLine;
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
