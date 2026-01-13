// Audio Worklet Processor for Apple //e Emulator
// This runs in a separate thread and drives emulator timing

class AppleAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    this.running = false;
    this.sampleBuffer = new Float32Array(0);
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
        // Append new samples to existing buffer
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
    const channel = output[0];

    if (!this.running || !channel) {
      // Fill with silence
      if (channel) {
        channel.fill(0);
      }
      return true;
    }

    const remaining = this.sampleBuffer.length - this.bufferReadPos;

    // Request more samples if buffer is getting low and no request pending
    // Keep at least 2 frames worth of buffer to avoid underruns
    if (remaining < 1600 && !this.pendingRequest) {
      this.pendingRequest = true;
      this.port.postMessage({
        type: "requestSamples",
        count: 1600, // Two frames worth of samples
      });
    }

    // Copy samples to output
    for (let i = 0; i < channel.length; i++) {
      if (this.bufferReadPos < this.sampleBuffer.length) {
        channel[i] = this.sampleBuffer[this.bufferReadPos++];
      } else {
        channel[i] = 0;
      }
    }

    return true;
  }
}

registerProcessor("apple-audio-processor", AppleAudioProcessor);
