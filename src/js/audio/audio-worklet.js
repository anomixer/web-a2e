/*
 * audio-worklet.js - AudioWorklet processor for sample generation and emulator timing
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

// Byte layout of the shared audio ring, mirrored from shared-buffers.js.
const AUDIO_WRITE_POS_OFFSET = 0;
const AUDIO_READ_POS_OFFSET = 4;
const AUDIO_DATA_OFFSET = 8;

// Refill threshold, in stereo frames.
const LOW_WATER_FRAMES = 1600;

// How many render quanta (128 frames each, ~2.7ms at 48kHz) a shared-mode
// refill request may go unanswered before we assume it will never be and ask
// again. ~86ms, comfortably longer than any normal Worker turnaround.
const REQUEST_TIMEOUT_QUANTA = 32;

class AppleAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    this.running = false;
    this.pendingRequest = false;

    // Shared ring (preferred path). When present, generated samples travel
    // Worker → SharedArrayBuffer → here, and the main thread is no longer in
    // the audio critical path at all — a busy main thread can no longer starve
    // playback of samples that have already been generated.
    this.sharedRing = null;
    this.sharedWritePos = null;
    this.sharedReadPos = null;
    this.sharedCapacity = 0;
    // In shared mode nothing is posted back to acknowledge a refill, so the
    // pending flag is cleared by observing the Worker's write position move.
    this.requestedAtWritePos = -1;
    this.requestQuanta = 0;

    // Pre-allocated ring buffer for interleaved stereo samples.
    // 16K frames (32K floats) provides ~333ms of buffer at 48kHz.
    this.ringCapacity = 16384 * 2; // floats (interleaved L/R)
    this.ringBuffer = new Float32Array(this.ringCapacity);
    this.ringWritePos = 0;
    this.ringReadPos = 0;
    this.ringCount = 0; // number of floats currently buffered

    // Handle messages from main thread
    this.port.onmessage = (event) => {
      if (event.data.type === "shared-audio") {
        const sab = event.data.buffer;
        this.sharedWritePos = new Int32Array(sab, AUDIO_WRITE_POS_OFFSET, 1);
        this.sharedReadPos = new Int32Array(sab, AUDIO_READ_POS_OFFSET, 1);
        this.sharedRing = new Float32Array(sab, AUDIO_DATA_OFFSET);
        this.sharedCapacity = this.sharedRing.length;
      } else if (event.data.type === "start") {
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

    if (this.sharedRing) {
      return this._processShared(leftChannel, rightChannel);
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

  /**
   * Drain the shared ring straight into the output buffers.
   *
   * Only the write position is owned by the Worker and only the read position
   * is owned by this thread, so a single Atomics.load of each is enough — no
   * lock, and no data ever crosses a postMessage boundary.
   */
  _processShared(leftChannel, rightChannel) {
    const capacity = this.sharedCapacity;
    const writePos = Atomics.load(this.sharedWritePos, 0);
    let readPos = Atomics.load(this.sharedReadPos, 0);
    let available = (writePos - readPos + capacity) % capacity;

    const frames = leftChannel.length;
    for (let i = 0; i < frames; i++) {
      if (available >= 2) {
        leftChannel[i] = this.sharedRing[readPos];
        readPos = (readPos + 1) % capacity;
        rightChannel[i] = this.sharedRing[readPos];
        readPos = (readPos + 1) % capacity;
        available -= 2;
      } else {
        leftChannel[i] = 0;
        rightChannel[i] = 0;
      }
    }

    Atomics.store(this.sharedReadPos, 0, readPos);

    // Clear the in-flight flag once the Worker has visibly written more data.
    // The quanta counter is the escape hatch: while the emulator is paused the
    // Worker services a request by writing nothing, and without a timeout the
    // flag would latch and no further requests would ever be sent — silence
    // that persists past un-pausing.
    if (this.pendingRequest) {
      this.requestQuanta++;
      if (writePos !== this.requestedAtWritePos ||
          this.requestQuanta > REQUEST_TIMEOUT_QUANTA) {
        this.pendingRequest = false;
      }
    }

    // The refill request is still a message — it is a few bytes and carries no
    // audio, so the main-thread hop costs nothing that can glitch playback.
    if (available / 2 < LOW_WATER_FRAMES && !this.pendingRequest) {
      this.pendingRequest = true;
      this.requestedAtWritePos = writePos;
      this.requestQuanta = 0;
      this.port.postMessage({ type: "requestSamples", count: LOW_WATER_FRAMES });
    }

    return true;
  }
}

registerProcessor("apple-audio-processor", AppleAudioProcessor);
