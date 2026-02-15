/*
 * audio-worklet.js - AudioWorklet processor for sample generation and emulator timing
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

class AppleAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    this.running = false;
    this.pendingRequest = false;

    // Pre-allocated ring buffer for interleaved stereo samples.
    // 16K frames (32K floats) provides ~333ms of buffer at 48kHz.
    this.ringCapacity = 16384 * 2; // floats (interleaved L/R)
    this.ringBuffer = new Float32Array(this.ringCapacity);
    this.ringWritePos = 0;
    this.ringReadPos = 0;
    this.ringCount = 0; // number of floats currently buffered

    // Handle messages from main thread
    this.port.onmessage = (event) => {
      if (event.data.type === "start") {
        this.running = true;
        this.pendingRequest = false;
      } else if (event.data.type === "stop") {
        this.running = false;
        this.pendingRequest = false;
      } else if (event.data.type === "samples") {
        const newSamples = event.data.data;
        const len = newSamples.length;

        // Write into ring buffer (may wrap around)
        if (len <= this.ringCapacity - this.ringCount) {
          const firstPart = this.ringCapacity - this.ringWritePos;
          if (len <= firstPart) {
            this.ringBuffer.set(newSamples, this.ringWritePos);
          } else {
            this.ringBuffer.set(newSamples.subarray(0, firstPart), this.ringWritePos);
            this.ringBuffer.set(newSamples.subarray(firstPart), 0);
          }
          this.ringWritePos = (this.ringWritePos + len) % this.ringCapacity;
          this.ringCount += len;
        } else {
          // Overflow — drop oldest data to make room
          const space = this.ringCapacity;
          const toWrite = Math.min(len, space);
          const src = len > space ? newSamples.subarray(len - space) : newSamples;
          const firstPart = space - this.ringWritePos;
          if (toWrite <= firstPart) {
            this.ringBuffer.set(src, this.ringWritePos);
          } else {
            this.ringBuffer.set(src.subarray(0, firstPart), this.ringWritePos);
            this.ringBuffer.set(src.subarray(firstPart), 0);
          }
          this.ringWritePos = (this.ringWritePos + toWrite) % this.ringCapacity;
          this.ringCount = toWrite;
          this.ringReadPos = this.ringWritePos;
        }
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

    // Remaining frames = remaining floats / 2 (interleaved stereo)
    const remainingFrames = this.ringCount / 2;

    // Request more samples if buffer is getting low and no request pending
    if (remainingFrames < 1600 && !this.pendingRequest) {
      this.pendingRequest = true;
      this.port.postMessage({
        type: "requestSamples",
        count: 1600, // Number of sample frames (stereo pairs)
      });
    }

    // Copy interleaved samples to separate L/R channels from ring buffer
    const frames = leftChannel.length;
    for (let i = 0; i < frames; i++) {
      if (this.ringCount >= 2) {
        leftChannel[i] = this.ringBuffer[this.ringReadPos];
        this.ringReadPos = (this.ringReadPos + 1) % this.ringCapacity;
        rightChannel[i] = this.ringBuffer[this.ringReadPos];
        this.ringReadPos = (this.ringReadPos + 1) % this.ringCapacity;
        this.ringCount -= 2;
      } else {
        leftChannel[i] = 0;
        rightChannel[i] = 0;
      }
    }

    return true;
  }
}

registerProcessor("apple-audio-processor", AppleAudioProcessor);
