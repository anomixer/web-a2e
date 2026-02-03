/*
 * audio-driver.js - Web Audio API driver for emulator audio and timing
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

// Audio constants
const SAMPLE_RATE = 48000;
const AUDIO_BUFFER_SIZE = 128; // AudioWorklet processes 128 samples at a time
const CYCLES_PER_SECOND = 1023000;
const DEFAULT_VOLUME = 0.5;

export class AudioDriver {
  constructor(wasmModule) {
    this.wasmModule = wasmModule;
    this.audioContext = null;
    this.workletNode = null;
    this.gainNode = null;

    this.sampleRate = SAMPLE_RATE;
    this.bufferSize = AUDIO_BUFFER_SIZE;
    this.running = false;
    this.muted = this.loadMuted();
    this.volume = this.loadVolume(); // Load saved volume or default to 0.5
    this.speed = 1;
    this.stereo = this.loadStereo(); // Load saved stereo setting

    // Fallback to ScriptProcessorNode if AudioWorklet not available
    this.useWorklet = typeof AudioWorkletNode !== "undefined";
    this.scriptProcessor = null;

    // Frame synchronization callback
    this.onFrameReady = null;

    // Sync C++ audio state with saved JS settings
    if (this.wasmModule._setAudioVolume) {
      this.wasmModule._setAudioVolume(this.volume);
    }
    if (this.wasmModule._setAudioMuted) {
      this.wasmModule._setAudioMuted(this.muted);
    }
  }

  async start() {
    if (this.running) return;

    try {
      // Create audio context
      this.audioContext = new (window.AudioContext ||
        window.webkitAudioContext)({
        sampleRate: this.sampleRate,
      });

      // Check if audio context is suspended (browser autoplay policy)
      if (this.audioContext.state === "suspended") {
        console.log("Audio context suspended, using fallback timing until user interaction");
        this.startFallbackTiming();

        // Set up listener to resume audio on user interaction
        this.setupAutoResumeAudio();
        return;
      }

      await this.initAudioNodes();
    } catch (error) {
      console.error("Failed to start audio driver:", error);
      // Fall back to non-audio timing
      this.startFallbackTiming();
    }
  }

  async initAudioNodes() {
    // Create gain node for volume control
    this.gainNode = this.audioContext.createGain();
    this.gainNode.connect(this.audioContext.destination);
    this.gainNode.gain.value = this.muted ? 0 : this.volume;

    if (this.useWorklet) {
      await this.startWithWorklet();
    } else {
      this.startWithScriptProcessor();
    }

    this.running = true;
    console.log("Audio driver started");
  }

  setupAutoResumeAudio() {
    const resumeAudio = async () => {
      if (this.audioContext && this.audioContext.state === "suspended") {
        try {
          await this.audioContext.resume();
          console.log("Audio context resumed");

          // Stop fallback timing
          if (this.fallbackInterval) {
            clearInterval(this.fallbackInterval);
            this.fallbackInterval = null;
          }

          // Initialize proper audio nodes
          await this.initAudioNodes();
        } catch (e) {
          console.error("Failed to resume audio context:", e);
        }
      }

      // Remove listeners after first interaction
      document.removeEventListener("click", resumeAudio);
      document.removeEventListener("keydown", resumeAudio);
    };

    document.addEventListener("click", resumeAudio, { once: true });
    document.addEventListener("keydown", resumeAudio, { once: true });
  }

  async startWithWorklet() {
    // Register the audio worklet
    // In dev mode, load from src; in production, load from root
    const workletPath = import.meta.env.DEV
      ? "/src/js/audio/audio-worklet.js"
      : "/audio-worklet.js";
    await this.audioContext.audioWorklet.addModule(workletPath);

    // Create worklet node (stereo output)
    this.workletNode = new AudioWorkletNode(
      this.audioContext,
      "apple-audio-processor",
      {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      },
    );

    // Handle messages from worklet
    this.workletNode.port.onmessage = (event) => {
      // Check if worklet is still valid (may be null after stop)
      if (!this.workletNode || !this.running) {
        return;
      }
      if (event.data.type === "requestSamples") {
        const samples = this.generateSamples(event.data.count);
        if (this.workletNode && this.workletNode.port) {
          this.workletNode.port.postMessage({
            type: "samples",
            data: samples,
          });
        }
      }
    };

    this.workletNode.connect(this.gainNode);

    // Start the worklet
    this.workletNode.port.postMessage({ type: "start" });
  }

  startWithScriptProcessor() {
    // Fallback for browsers without AudioWorklet support (stereo)
    this.scriptProcessor = this.audioContext.createScriptProcessor(4096, 0, 2);

    this.scriptProcessor.onaudioprocess = (event) => {
      const leftChannel = event.outputBuffer.getChannelData(0);
      const rightChannel = event.outputBuffer.getChannelData(1);
      const samples = this.generateSamples(leftChannel.length);
      // Deinterleave stereo samples
      for (let i = 0; i < leftChannel.length; i++) {
        leftChannel[i] = samples[i * 2];
        rightChannel[i] = samples[i * 2 + 1];
      }
    };

    this.scriptProcessor.connect(this.gainNode);
  }

  /**
   * Start fallback timing when Web Audio API is unavailable or suspended.
   *
   * The Apple IIe runs at 1.023 MHz. Normally, timing is driven by the Web Audio API's
   * sample rate (48kHz), which provides precise timing through the audio callback.
   * When audio is unavailable (browser autoplay policy, no audio hardware, etc.),
   * this fallback uses setInterval at 60Hz to maintain approximate timing.
   *
   * At 60Hz, each tick should execute ~17,050 cycles (1,023,000 / 60).
   * Speed multiplier allows for fast-forward (speed > 1) or unlimited speed (speed = 0).
   *
   * Note: setInterval timing is less precise than Web Audio, so emulation timing
   * may be slightly off. This is acceptable for basic functionality until audio resumes.
   */
  startFallbackTiming() {
    const cyclesPerTick = CYCLES_PER_SECOND / 60;

    this.fallbackInterval = setInterval(() => {
      if (this.speed === 0) {
        // Unlimited speed - run as fast as possible
        this.wasmModule._runCycles(cyclesPerTick * 10);
      } else {
        this.wasmModule._runCycles(cyclesPerTick * this.speed);
      }

      // Check for frame updates
      const framesReady = this.wasmModule._consumeFrameSamples();
      if (framesReady > 0 && this.onFrameReady) {
        this.onFrameReady(framesReady);
      }
    }, 1000 / 60);

    this.running = true;
    console.log("Using fallback timing (no audio)");
  }

  /**
   * Generate audio samples by running the emulator and collecting speaker output.
   *
   * This is the core timing mechanism: the Web Audio API requests samples at 48kHz,
   * and we run the emulator for exactly enough cycles to produce those samples.
   * The WASM module tracks the ratio of CPU cycles to audio samples (1,023,000 Hz / 48,000 Hz ≈ 21.3 cycles per sample).
   *
   * The emulator's speaker produces 1-bit audio by toggling a soft switch ($C030).
   * The WASM module converts these toggles into floating-point samples.
   *
   * Frame synchronization: The emulator also counts audio samples to determine when
   * a video frame is complete (~17,050 cycles = ~800 samples per 60Hz frame).
   * When a frame's worth of samples is generated, we trigger onFrameReady for rendering.
   *
   * @param {number} count - Number of audio samples to generate
   * @returns {Float32Array} Generated audio samples in range [-1, 1]
   */
  generateSamples(count) {
    // Always output stereo (interleaved L/R) for the audio worklet
    const samples = new Float32Array(count * 2);

    if (this.stereo) {
      // Stereo mode: PSG1 on left, PSG2 on right
      const bufferPtr = this.wasmModule._malloc(count * 2 * 4); // stereo: count * 2 floats * 4 bytes
      this.wasmModule._generateStereoAudioSamples(bufferPtr, count);

      // Copy interleaved stereo samples from WASM memory
      for (let i = 0; i < count * 2; i++) {
        samples[i] = this.wasmModule.HEAPF32[(bufferPtr >> 2) + i];
      }
      this.wasmModule._free(bufferPtr);
    } else {
      // Mono mode: PSG1 + PSG2 mixed, same on both channels
      const bufferPtr = this.wasmModule._malloc(count * 4); // mono: count floats * 4 bytes
      this.wasmModule._generateAudioSamples(bufferPtr, count);

      // Copy mono samples and duplicate to both channels
      for (let i = 0; i < count; i++) {
        const sample = this.wasmModule.HEAPF32[(bufferPtr >> 2) + i];
        samples[i * 2] = sample;     // Left
        samples[i * 2 + 1] = sample; // Right
      }
      this.wasmModule._free(bufferPtr);
    }

    // Check if we've accumulated enough samples for one or more frames
    const framesReady = this.wasmModule._consumeFrameSamples();
    if (framesReady > 0 && this.onFrameReady) {
      this.onFrameReady(framesReady);
    }

    return samples;
  }

  stop() {
    if (!this.running) return;

    // Set running to false first to stop any pending callbacks
    this.running = false;

    if (this.workletNode) {
      try {
        this.workletNode.port.postMessage({ type: "stop" });
        this.workletNode.disconnect();
      } catch (e) {
        // Ignore errors during cleanup
      }
      this.workletNode = null;
    }

    if (this.scriptProcessor) {
      try {
        this.scriptProcessor.disconnect();
      } catch (e) {
        // Ignore errors during cleanup
      }
      this.scriptProcessor = null;
    }

    if (this.fallbackInterval) {
      clearInterval(this.fallbackInterval);
      this.fallbackInterval = null;
    }

    if (this.audioContext) {
      try {
        this.audioContext.close();
      } catch (e) {
        // Ignore errors during cleanup
      }
      this.audioContext = null;
    }

    console.log("Audio driver stopped");
  }

  /**
   * Set emulation speed multiplier.
   * Reserved for future speed control feature (e.g., fast-forward, slow-motion).
   * @param {number} speed - Speed multiplier (1 = normal, 0 = unlimited)
   */
  setSpeed(speed) {
    this.speed = speed;
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.gainNode) {
      this.gainNode.gain.value = this.muted ? 0 : this.volume;
    }
    if (this.wasmModule._setAudioMuted) {
      this.wasmModule._setAudioMuted(this.muted);
    }
    this.saveMuted();
  }

  isMuted() {
    return this.muted;
  }

  mute() {
    this.muted = true;
    if (this.gainNode) {
      this.gainNode.gain.value = 0;
    }
    if (this.wasmModule._setAudioMuted) {
      this.wasmModule._setAudioMuted(true);
    }
    this.saveMuted();
  }

  unmute() {
    this.muted = false;
    if (this.gainNode) {
      this.gainNode.gain.value = this.volume;
    }
    if (this.wasmModule._setAudioMuted) {
      this.wasmModule._setAudioMuted(false);
    }
    this.saveMuted();
  }

  loadMuted() {
    try {
      return localStorage.getItem('a2e-muted') === 'true';
    } catch (e) {
      // Ignore localStorage errors
    }
    return false;
  }

  saveMuted() {
    try {
      localStorage.setItem('a2e-muted', this.muted.toString());
    } catch (e) {
      // Ignore localStorage errors
    }
  }

  getVolume() {
    return this.volume;
  }

  setVolume(volume) {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.gainNode) {
      this.gainNode.gain.value = this.muted ? 0 : this.volume;
    }
    // Sync C++ audio volume for speaker and Mockingboard pre-mix scaling
    if (this.wasmModule._setAudioVolume) {
      this.wasmModule._setAudioVolume(this.volume);
    }
    this.saveVolume();
  }

  loadVolume() {
    try {
      const saved = localStorage.getItem('a2e-volume');
      if (saved !== null) {
        const vol = parseFloat(saved);
        if (!isNaN(vol) && vol >= 0 && vol <= 1) {
          return vol;
        }
      }
    } catch (e) {
      // Ignore localStorage errors
    }
    return DEFAULT_VOLUME;
  }

  saveVolume() {
    try {
      localStorage.setItem('a2e-volume', this.volume.toString());
    } catch (e) {
      // Ignore localStorage errors
    }
  }

  isStereo() {
    return this.stereo;
  }

  setStereo(enabled) {
    this.stereo = enabled;
    this.saveStereo();
  }

  loadStereo() {
    try {
      const saved = localStorage.getItem('a2e-stereo');
      // Default to stereo enabled if not set
      return saved !== 'false';
    } catch (e) {
      // Ignore localStorage errors
    }
    return true;
  }

  saveStereo() {
    try {
      localStorage.setItem('a2e-stereo', this.stereo.toString());
    } catch (e) {
      // Ignore localStorage errors
    }
  }
}
