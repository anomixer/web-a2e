/*
 * drive-sounds.js - Disk drive sound effects
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

export class DriveSounds {
  constructor() {
    // Audio context (lazily created)
    this.audioContext = null;

    // Master volume (mirrors the main volume slider, 0.0-1.0)
    this.masterVolume = 1.0;

    // Seek sound settings
    this.seekSoundEnabled = true;
    this.seekVolume = 0.3;
    this.seekPrimaryFreq = 2200;
    this.seekSecondaryFreq = 3800;
    this.seekBodyFreq = 1200;
    this.seekDecay = 350;
    this.seekClickDecay = 1200;
  }

  /**
   * Initialize audio context (lazily created on first use)
   */
  initAudioContext() {
    if (!this.audioContext) {
      try {
        this.audioContext = new (
          window.AudioContext || window.webkitAudioContext
        )();
      } catch (e) {
        console.warn("Could not create audio context for drive sounds:", e);
        this.seekSoundEnabled = false;
      }
    }
    return this.audioContext;
  }

  /**
   * Play a synthesized disk drive seek/step sound
   * Models the mechanical "thunk" of a Disk II stepper motor
   */
  playSeekSound() {
    if (!this.seekSoundEnabled) return;

    const ctx = this.initAudioContext();
    if (!ctx || ctx.state === "suspended") return;

    const now = ctx.currentTime;
    const duration = 0.025; // 25ms for the full sound
    const sampleRate = ctx.sampleRate;
    const bufferSize = Math.ceil(sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, sampleRate);
    const data = buffer.getChannelData(0);

    // Use configurable parameters
    const primaryFreq = this.seekPrimaryFreq;
    const secondaryFreq = this.seekSecondaryFreq;
    const bodyFreq = this.seekBodyFreq;
    const decay = this.seekDecay;
    const clickDecay = this.seekClickDecay;

    for (let i = 0; i < bufferSize; i++) {
      const t = i / sampleRate;

      // Very fast exponential decay - metallic tick
      const envelope = Math.exp(-t * decay);

      // Sharp initial transient/click
      const clickEnv = Math.exp(-t * clickDecay);
      const click = clickEnv * (Math.random() * 2 - 1) * 0.4;

      // Primary high-pitched tick
      const tick = Math.sin(2 * Math.PI * primaryFreq * t) * 0.5;

      // Higher harmonic for metallic character
      const harmonic = Math.sin(2 * Math.PI * secondaryFreq * t) * 0.25;

      // Lower body resonance (decays faster)
      const bodyEnv = Math.exp(-t * (decay + 150));
      const body = bodyEnv * Math.sin(2 * Math.PI * bodyFreq * t) * 0.3;

      // Combine components
      data[i] = envelope * (tick + harmonic) + body * envelope + click;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    // Add a low-pass filter to tame the very highest frequencies
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 6000;
    filter.Q.value = 0.5;

    const gain = ctx.createGain();
    gain.gain.value = this.seekVolume * 0.8 * this.masterVolume;

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    source.start(now);
    source.stop(now + duration);
  }

  /**
   * Enable or disable seek sounds
   */
  setSeekSoundEnabled(enabled) {
    this.seekSoundEnabled = enabled;
  }

  /**
   * Set seek sound volume (0.0 - 1.0)
   */
  setSeekVolume(volume) {
    this.seekVolume = Math.max(0, Math.min(1, volume));
  }

  // Motor sound stubs - kept for API compatibility
  startMotorSound() {}
  stopMotorSound() {}
  setMotorSoundEnabled() {}
  setMotorVolume() {}
  updateMotorSoundParams() {}

  /**
   * Set the master volume level (0.0 - 1.0), mirroring the main volume slider.
   * Scales all drive sounds proportionally.
   */
  setMasterVolume(volume) {
    this.masterVolume = Math.max(0, Math.min(1, volume));
  }
}
