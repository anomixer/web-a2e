/*
 * printer-sound.js - Dot-matrix printer sound synthesis
 *
 * Synthesises the characteristic buzz of an ImageWriter-class dot-matrix
 * printer. A short band-passed noise grain is scheduled per printed
 * character; at hardware print rate (~250 cps) the grains overlap into the
 * familiar mechanical buzz. Carriage returns get a lower, longer grain to
 * suggest the head slamming back.
 *
 * Written by
 *  Shawn Bullock <shawn@agenticexpert.ai>
 */

const BASE_GAIN = 0.34; // printer loudness relative to main volume

export class PrinterSound {
  // getSharedContext: optional () => AudioContext — the audio driver's
  // already-running, gesture-unlocked context. Strongly preferred; a private
  // context would start suspended and stay silent (same trap drive-sounds
  // dodges only by luck of lazy post-gesture creation).
  constructor(getSharedContext = null) {
    this._getShared  = getSharedContext;
    this._ctx        = null;
    this._noiseBuf   = null;
    this._busGain    = null;
    this._nextTime   = 0; // next grain start on the audio timeline
  }

  _ensureContext() {
    // Prefer the shared driver context; rebuild our graph if it changes.
    let ctx = this._getShared ? this._getShared() : null;
    if (!ctx) {
      if (this._ctx) return true; // keep our fallback context
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
    }
    if (ctx === this._ctx && this._busGain) return true;

    this._ctx = ctx;

    // ~0.5s of white noise, reused for every grain
    const len = Math.floor(ctx.sampleRate * 0.5);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d   = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._noiseBuf = buf;

    this._busGain = ctx.createGain();
    this._busGain.gain.value = this._mainVolume();
    this._busGain.connect(ctx.destination);
    this._nextTime = 0;
    return true;
  }

  // Reads the shared main volume / mute from localStorage (same keys the
  // audio driver persists) so the printer tracks the single volume slider.
  _mainVolume() {
    let vol = 0.7, muted = false;
    try {
      const v = localStorage.getItem("a2e-volume");
      if (v !== null) vol = Math.max(0, Math.min(1, parseFloat(v)));
      muted = localStorage.getItem("a2e-muted") === "true";
    } catch (e) { /* defaults */ }
    return muted ? 0 : vol * BASE_GAIN;
  }

  // kind: 'char' (pin strike) or 'line' (paper-feed motor).
  // intensity 0..1 scales loudness — driven by how many pins actually fired.
  tick(kind = "char", intensity = 1) {
    if (!this._ensureContext()) return;
    if (this._ctx.state === "suspended") this._ctx.resume();

    // Keep the bus gain in sync with the main volume slider
    this._busGain.gain.value = this._mainVolume();
    if (this._busGain.gain.value <= 0) return;

    const amp     = Math.max(0, Math.min(1, intensity));
    const ctx     = this._ctx;
    const now     = ctx.currentTime;
    const isLine  = kind === "line";
    const dur     = isLine ? 0.045 : 0.013;
    const freq    = isLine ? 720   : 2100;
    const q       = isLine ? 4     : 7;
    const peak    = (isLine ? 0.9  : 0.55) * amp;
    const spacing = isLine ? 0.022 : 0.005; // grain-to-grain on the timeline

    // Schedule on the audio timeline so a synchronous burst of chars spreads
    // into a continuous buzz instead of collapsing onto one instant.
    let start = Math.max(now, this._nextTime);
    if (start > now + 0.25) return; // backlog too deep — drop this grain
    this._nextTime = start + spacing;
    const stop = start + dur;

    // --- Noise body: the mechanical buzz ---
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    src.loop   = true;

    const bp = ctx.createBiquadFilter();
    bp.type            = "bandpass";
    bp.frequency.value = freq;
    bp.Q.value         = q;

    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, start);
    ng.gain.exponentialRampToValueAtTime(peak, start + 0.001);
    ng.gain.exponentialRampToValueAtTime(0.0001, stop);

    src.connect(bp);
    bp.connect(ng);
    ng.connect(this._busGain);
    src.start(start);
    src.stop(stop + 0.005);

    // --- Piezo tone: the high-pitched whine of the print pins firing ---
    // Square wave with a little per-grain jitter so it shimmers like the real
    // head rather than a steady test tone.
    const osc = ctx.createOscillator();
    osc.type = "square";
    const jitter = (Math.random() * 2 - 1) * (isLine ? 60 : 260);
    osc.frequency.value = (isLine ? 1100 : 3400) + jitter;

    const og = ctx.createGain();
    const oPeak = (isLine ? 0.18 : 0.32) * amp;
    og.gain.setValueAtTime(0.0001, start);
    og.gain.exponentialRampToValueAtTime(oPeak, start + 0.001);
    og.gain.exponentialRampToValueAtTime(0.0001, stop);

    osc.connect(og);
    og.connect(this._busGain);
    osc.start(start);
    osc.stop(stop + 0.005);
  }

  // Carriage return: a sustained downward "zzzip" as the head slews back to
  // the left margin. dur seconds = real return time (scales with how far the
  // head had travelled); intensity 0..1 from the return distance.
  tickReturn(dur, intensity = 0.6) {
    if (!this._ensureContext()) return;
    if (this._ctx.state === "suspended") this._ctx.resume();
    this._busGain.gain.value = this._mainVolume();
    if (this._busGain.gain.value <= 0) return;

    const ctx   = this._ctx;
    const now   = ctx.currentTime;
    let start   = Math.max(now, this._nextTime);
    if (start > now + 0.3) return;
    dur = Math.max(0.03, Math.min(0.5, dur));
    this._nextTime = start + dur * 0.6;
    const stop = start + dur;
    const pk   = 0.55 * Math.max(0.2, Math.min(1, intensity));

    // Noise body, bandpass sweeping downward as the carriage decelerates
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    src.loop   = true;
    const bp = ctx.createBiquadFilter();
    bp.type      = "bandpass";
    bp.Q.value   = 6;
    bp.frequency.setValueAtTime(2600, start);
    bp.frequency.exponentialRampToValueAtTime(900, stop);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, start);
    ng.gain.exponentialRampToValueAtTime(pk, start + 0.012);
    ng.gain.setValueAtTime(pk, Math.max(start + 0.012, stop - 0.012));
    ng.gain.exponentialRampToValueAtTime(0.0001, stop);
    src.connect(bp); bp.connect(ng); ng.connect(this._busGain);
    src.start(start); src.stop(stop + 0.01);

    // High sawtooth glide riding on top
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(3200, start);
    osc.frequency.exponentialRampToValueAtTime(1400, stop);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, start);
    og.gain.exponentialRampToValueAtTime(pk * 0.5, start + 0.012);
    og.gain.exponentialRampToValueAtTime(0.0001, stop);
    osc.connect(og); og.connect(this._busGain);
    osc.start(start); osc.stop(stop + 0.01);
  }

  // Nothing sustained to stop (grains self-terminate); kept for symmetry.
  stop() {}
}
