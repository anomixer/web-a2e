// Audio Worklet Processor for Apple //e Emulator
// This runs in a separate thread and drives emulator timing
// Stereo output: PSG1 on left channel, PSG2 on right channel

class AppleAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    this.running = false;
    this.sampleBuffer = new Float32Array(0); // Interleaved stereo [L0, R0, L1, R1, ...]
    this.bufferReadPos = 0;
    this.pendingRequest = false;

    // Handle messages from main thread
    this.port.onmessage = (event) => {
      if (event.data.type === "start") {
        this.running = true;
        this.pendingRequest = false;
      } else if (event.data.type === "stop") {
        this.running = false;
        this.pendingRequest = false;
      } else if (event.data.type === "samples") {
        // Append new interleaved stereo samples to existing buffer
        const newSamples = new Float32Array(event.data.data);
        const remaining = this.sampleBuffer.length - this.bufferReadPos;

        if (remaining > 0) {
          // Append to remaining samples
          const combined = new Float32Array(remaining + newSamples.length);
          combined.set(this.sampleBuffer.subarray(this.bufferReadPos), 0);
          combined.set(newSamples, remaining);
          this.sampleBuffer = combined;
        } else {
          this.sampleBuffer = newSamples;
        }
        this.bufferReadPos = 0;
        this.pendingRequest = false;
      }
    };
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    const leftChannel = output[0];
    const rightChannel = output[1];

    if (!this.running || !leftChannel) {
      // Fill with silence
      if (leftChannel) leftChannel.fill(0);
      if (rightChannel) rightChannel.fill(0);
      return true;
    }

    // Buffer contains interleaved stereo samples, so remaining frames = remaining / 2
    const remainingFrames = (this.sampleBuffer.length - this.bufferReadPos) / 2;

    // Request more samples if buffer is getting low and no request pending
    // Keep at least 2 frames worth of buffer to avoid underruns
    if (remainingFrames < 1600 && !this.pendingRequest) {
      this.pendingRequest = true;
      this.port.postMessage({
        type: "requestSamples",
        count: 1600, // Number of sample frames (stereo pairs)
      });
    }

    // Copy interleaved samples to separate L/R channels
    for (let i = 0; i < leftChannel.length; i++) {
      if (this.bufferReadPos + 1 < this.sampleBuffer.length) {
        leftChannel[i] = this.sampleBuffer[this.bufferReadPos++];
        rightChannel[i] = this.sampleBuffer[this.bufferReadPos++];
      } else {
        leftChannel[i] = 0;
        rightChannel[i] = 0;
      }
    }

    return true;
  }
}

registerProcessor("apple-audio-processor", AppleAudioProcessor);
