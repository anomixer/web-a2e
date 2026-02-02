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

    // Seek sound settings
    this.seekSoundEnabled = true;
    this.seekVolume = 0.3;
    this.seekPrimaryFreq = 2200;
    this.seekSecondaryFreq = 3800;
    this.seekBodyFreq = 1200;
    this.seekDecay = 350;
    this.seekClickDecay = 1200;

    // Motor sound settings
    this.motorSoundEnabled = true;
    this.motorVolume = 0.15;
    this.motorRunning = false;

    // Motor sound parameters
    this.motorFreq = 55;
    this.motorFilterFreq = 129;
    this.whirFreq = 499;
    this.whirQ = 1.5;
    this.swishFreq = 1917;
    this.swishLFOFreq = 2.69;
    this.swishQ = 2.37;

    // Motor sound nodes
    this.motorOscillator = null;
    this.motorGain = null;
    this.motorNoiseSource = null;
    this.motorNoiseGain = null;
    this.motorOscFilter = null;
    this.motorNoiseFilter = null;

    // Swish sound nodes
    this.swishNoiseSource = null;
    this.swishLFO = null;
    this.swishGain = null;
    this.swishVolumeGain = null;
    this.swishLFOGain = null;
    this.swishLFOOffset = null;
    this.swishFilter = null;
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
        this.motorSoundEnabled = false;
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
    gain.gain.value = this.seekVolume * 0.8;

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

  /**
   * Start the motor spinning sound
   * Creates a layered sound with:
   * - Low frequency hum (motor)
   * - Filtered noise (mechanical whir)
   * - Rhythmic swish (disk rubbing against jacket at 300 RPM = 5 Hz)
   */
  startMotorSound() {
    if (!this.motorSoundEnabled || this.motorRunning) return;

    const ctx = this.initAudioContext();
    if (!ctx || ctx.state === "suspended") return;

    this.motorRunning = true;

    // Layer 1: Low frequency motor hum
    this.motorOscillator = ctx.createOscillator();
    this.motorOscillator.type = "sawtooth";
    this.motorOscillator.frequency.value = this.motorFreq;

    // Filter the oscillator to soften it
    this.motorOscFilter = ctx.createBiquadFilter();
    this.motorOscFilter.type = "lowpass";
    this.motorOscFilter.frequency.value = this.motorFilterFreq;
    this.motorOscFilter.Q.value = 1;

    this.motorGain = ctx.createGain();
    this.motorGain.gain.value = this.motorVolume * 0.5;

    this.motorOscillator.connect(this.motorOscFilter);
    this.motorOscFilter.connect(this.motorGain);
    this.motorGain.connect(ctx.destination);

    // Layer 2: Filtered noise for mechanical whir
    const noiseBufferSize = ctx.sampleRate * 2; // 2 seconds of noise
    const noiseBuffer = ctx.createBuffer(1, noiseBufferSize, ctx.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseBufferSize; i++) {
      noiseData[i] = Math.random() * 2 - 1;
    }

    this.motorNoiseSource = ctx.createBufferSource();
    this.motorNoiseSource.buffer = noiseBuffer;
    this.motorNoiseSource.loop = true;

    // Bandpass filter for the "whir" character
    this.motorNoiseFilter = ctx.createBiquadFilter();
    this.motorNoiseFilter.type = "bandpass";
    this.motorNoiseFilter.frequency.value = this.whirFreq;
    this.motorNoiseFilter.Q.value = this.whirQ;

    this.motorNoiseGain = ctx.createGain();
    this.motorNoiseGain.gain.value = this.motorVolume * 0.25;

    this.motorNoiseSource.connect(this.motorNoiseFilter);
    this.motorNoiseFilter.connect(this.motorNoiseGain);
    this.motorNoiseGain.connect(ctx.destination);

    // Layer 3: Rhythmic "swish" - disk rubbing against jacket
    this.swishNoiseSource = ctx.createBufferSource();
    this.swishNoiseSource.buffer = noiseBuffer; // Reuse noise buffer
    this.swishNoiseSource.loop = true;

    // Bandpass filter for swish character (higher, breathier)
    this.swishFilter = ctx.createBiquadFilter();
    this.swishFilter.type = "bandpass";
    this.swishFilter.frequency.value = this.swishFreq;
    this.swishFilter.Q.value = this.swishQ;

    // LFO to modulate the swish amplitude
    this.swishLFO = ctx.createOscillator();
    this.swishLFO.type = "sine";
    this.swishLFO.frequency.value = this.swishLFOFreq;

    // Scale and offset the LFO (0 to 1 range instead of -1 to 1)
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.5; // Scale to 0.5

    const lfoOffset = ctx.createConstantSource();
    lfoOffset.offset.value = 0.5; // Offset to center at 0.5

    // Combine LFO with offset for 0-1 modulation
    this.swishGain = ctx.createGain();
    this.swishGain.gain.value = 0; // Will be modulated by LFO

    // Create a gain node for the final swish volume
    this.swishVolumeGain = ctx.createGain();
    this.swishVolumeGain.gain.value = this.motorVolume * 0.4;

    // Connect swish audio path
    this.swishNoiseSource.connect(this.swishFilter);
    this.swishFilter.connect(this.swishGain);
    this.swishGain.connect(this.swishVolumeGain);
    this.swishVolumeGain.connect(ctx.destination);

    // Connect LFO to modulate swish gain
    this.swishLFO.connect(lfoGain);
    lfoGain.connect(this.swishGain.gain);
    lfoOffset.connect(this.swishGain.gain);

    // Start all layers
    this.motorOscillator.start();
    this.motorNoiseSource.start();
    this.swishNoiseSource.start();
    this.swishLFO.start();
    lfoOffset.start();

    // Store references for cleanup
    this.swishLFOGain = lfoGain;
    this.swishLFOOffset = lfoOffset;
  }

  /**
   * Update motor sound parameters while running
   */
  updateMotorSoundParams() {
    if (!this.motorRunning) return;

    // Update oscillator frequency
    if (this.motorOscillator) {
      this.motorOscillator.frequency.value = this.motorFreq;
    }
    // Update motor filter
    if (this.motorOscFilter) {
      this.motorOscFilter.frequency.value = this.motorFilterFreq;
    }
    // Update whir filter
    if (this.motorNoiseFilter) {
      this.motorNoiseFilter.frequency.value = this.whirFreq;
      this.motorNoiseFilter.Q.value = this.whirQ;
    }
    // Update swish filter
    if (this.swishFilter) {
      this.swishFilter.frequency.value = this.swishFreq;
      this.swishFilter.Q.value = this.swishQ;
    }
    // Update swish LFO
    if (this.swishLFO) {
      this.swishLFO.frequency.value = this.swishLFOFreq;
    }
    // Update volumes
    if (this.motorGain) this.motorGain.gain.value = this.motorVolume * 0.5;
    if (this.motorNoiseGain)
      this.motorNoiseGain.gain.value = this.motorVolume * 0.25;
    if (this.swishVolumeGain)
      this.swishVolumeGain.gain.value = this.motorVolume * 0.4;
  }

  /**
   * Stop the motor spinning sound
   */
  stopMotorSound() {
    if (!this.motorRunning) return;

    this.motorRunning = false;

    // Fade out quickly to avoid clicks
    const ctx = this.audioContext;
    if (ctx) {
      const now = ctx.currentTime;
      const fadeTime = 0.15;

      if (this.motorGain) {
        this.motorGain.gain.setValueAtTime(this.motorGain.gain.value, now);
        this.motorGain.gain.linearRampToValueAtTime(0, now + fadeTime);
      }
      if (this.motorNoiseGain) {
        this.motorNoiseGain.gain.setValueAtTime(
          this.motorNoiseGain.gain.value,
          now,
        );
        this.motorNoiseGain.gain.linearRampToValueAtTime(0, now + fadeTime);
      }
      if (this.swishVolumeGain) {
        this.swishVolumeGain.gain.setValueAtTime(
          this.swishVolumeGain.gain.value,
          now,
        );
        this.swishVolumeGain.gain.linearRampToValueAtTime(0, now + fadeTime);
      }

      // Stop oscillators after fade
      setTimeout(
        () => {
          // Stop audio nodes - catch blocks intentionally empty because stop() throws
          // InvalidStateError if the node has already been stopped, which is expected
          // during cleanup when multiple stop calls may occur
          if (this.motorOscillator) {
            try {
              this.motorOscillator.stop();
            } catch (e) {
              // Expected: InvalidStateError if already stopped
            }
            this.motorOscillator = null;
          }
          if (this.motorNoiseSource) {
            try {
              this.motorNoiseSource.stop();
            } catch (e) {
              // Expected: InvalidStateError if already stopped
            }
            this.motorNoiseSource = null;
          }
          if (this.swishNoiseSource) {
            try {
              this.swishNoiseSource.stop();
            } catch (e) {
              // Expected: InvalidStateError if already stopped
            }
            this.swishNoiseSource = null;
          }
          if (this.swishLFO) {
            try {
              this.swishLFO.stop();
            } catch (e) {
              // Expected: InvalidStateError if already stopped
            }
            this.swishLFO = null;
          }
          if (this.swishLFOOffset) {
            try {
              this.swishLFOOffset.stop();
            } catch (e) {
              // Expected: InvalidStateError if already stopped
            }
            this.swishLFOOffset = null;
          }
          this.motorGain = null;
          this.motorNoiseGain = null;
          this.swishGain = null;
          this.swishVolumeGain = null;
          this.swishLFOGain = null;
        },
        fadeTime * 1000 + 50,
      );
    }
  }

  /**
   * Enable or disable motor sound
   */
  setMotorSoundEnabled(enabled) {
    this.motorSoundEnabled = enabled;
    if (!enabled) {
      this.stopMotorSound();
    }
  }

  /**
   * Set motor sound volume (0.0 - 1.0)
   */
  setMotorVolume(volume) {
    this.motorVolume = Math.max(0, Math.min(1, volume));
    // Update live if motor is running
    if (this.motorRunning) {
      if (this.motorGain) this.motorGain.gain.value = this.motorVolume * 0.5;
      if (this.motorNoiseGain)
        this.motorNoiseGain.gain.value = this.motorVolume * 0.25;
      if (this.swishVolumeGain)
        this.swishVolumeGain.gain.value = this.motorVolume * 0.4;
    }
  }
}
