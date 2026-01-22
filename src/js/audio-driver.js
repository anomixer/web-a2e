// Audio Driver - Uses Web Audio API to drive emulator timing

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
    this.muted = false;
    this.volume = this.loadVolume(); // Load saved volume or default to 0.5
    this.speed = 1;

    // Fallback to ScriptProcessorNode if AudioWorklet not available
    this.useWorklet = typeof AudioWorkletNode !== "undefined";
    this.scriptProcessor = null;

    // Frame synchronization callback
    this.onFrameReady = null;
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
      ? "/src/js/audio-worklet.js"
      : "/audio-worklet.js";
    await this.audioContext.audioWorklet.addModule(workletPath);

    // Create worklet node
    this.workletNode = new AudioWorkletNode(
      this.audioContext,
      "apple-audio-processor",
      {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [1],
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
    // Fallback for browsers without AudioWorklet support
    this.scriptProcessor = this.audioContext.createScriptProcessor(4096, 0, 1);

    this.scriptProcessor.onaudioprocess = (event) => {
      const output = event.outputBuffer.getChannelData(0);
      const samples = this.generateSamples(output.length);
      output.set(samples);
    };

    this.scriptProcessor.connect(this.gainNode);
  }

  startFallbackTiming() {
    // If audio doesn't work, use setInterval for timing
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

  generateSamples(count) {
    // Allocate buffer in WASM memory
    const bufferPtr = this.wasmModule._malloc(count * 4); // float = 4 bytes

    // Generate samples
    const generated = this.wasmModule._generateAudioSamples(bufferPtr, count);

    // Copy samples from WASM memory
    const samples = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      samples[i] = this.wasmModule.HEAPF32[(bufferPtr >> 2) + i];
    }

    // Free buffer
    this.wasmModule._free(bufferPtr);

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
  }

  isMuted() {
    return this.muted;
  }

  mute() {
    this.muted = true;
    if (this.gainNode) {
      this.gainNode.gain.value = 0;
    }
  }

  unmute() {
    this.muted = false;
    if (this.gainNode) {
      this.gainNode.gain.value = this.volume;
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
}
