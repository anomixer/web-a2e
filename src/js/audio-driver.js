// Audio Driver - Uses Web Audio API to drive emulator timing

export class AudioDriver {
  constructor(wasmModule) {
    this.wasmModule = wasmModule;
    this.audioContext = null;
    this.workletNode = null;
    this.gainNode = null;

    this.sampleRate = 48000;
    this.bufferSize = 128; // AudioWorklet processes 128 samples at a time
    this.running = false;
    this.muted = false;
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

      // Create gain node for volume control
      this.gainNode = this.audioContext.createGain();
      this.gainNode.connect(this.audioContext.destination);
      this.gainNode.gain.value = this.muted ? 0 : 0.5;

      if (this.useWorklet) {
        await this.startWithWorklet();
      } else {
        this.startWithScriptProcessor();
      }

      this.running = true;
      console.log("Audio driver started");
    } catch (error) {
      console.error("Failed to start audio driver:", error);
      // Fall back to non-audio timing
      this.startFallbackTiming();
    }
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
    const cyclesPerSecond = 1023000;
    const cyclesPerTick = cyclesPerSecond / 60;

    this.fallbackInterval = setInterval(() => {
      if (this.speed === 0) {
        // Unlimited speed - run as fast as possible
        this.wasmModule._runCycles(cyclesPerTick * 10);
      } else {
        this.wasmModule._runCycles(cyclesPerTick * this.speed);
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

  setSpeed(speed) {
    this.speed = speed;
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.gainNode) {
      this.gainNode.gain.value = this.muted ? 0 : 0.5;
    }
  }

  isMuted() {
    return this.muted;
  }

  setVolume(volume) {
    if (this.gainNode) {
      this.gainNode.gain.value = this.muted ? 0 : volume;
    }
  }
}
