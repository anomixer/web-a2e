// Apple //e Emulator - Main Entry Point

import { WebGLRenderer } from "./webgl-renderer.js";
import { AudioDriver } from "./audio-driver.js";
import { InputHandler } from "./input-handler.js";
import { DiskManager } from "./disk-manager.js";
import { Debugger } from "./debugger.js";

class AppleIIeEmulator {
  constructor() {
    this.wasmModule = null;
    this.renderer = null;
    this.audioDriver = null;
    this.inputHandler = null;
    this.diskManager = null;
    this.debugger = null;

    this.running = false;
    this.speed = 1; // 1x, 2x, or 0 for unlimited
    this.crtEnabled = false;
  }

  async init() {
    this.showLoading(true);

    try {
      // Load WASM module - use global function loaded via script tag
      this.wasmModule = await window.createA2EModule();

      // Initialize emulator
      this.wasmModule._init();

      // Set up renderer
      const canvas = document.getElementById("screen");
      this.renderer = new WebGLRenderer(canvas);
      await this.renderer.init();

      // Set up audio driver (drives timing)
      this.audioDriver = new AudioDriver(this.wasmModule);

      // Connect audio-driven frame sync to rendering
      this.audioDriver.onFrameReady = (frameCount) => {
        this.renderFrame();
      };

      // Set up input handler
      this.inputHandler = new InputHandler(this.wasmModule);
      this.inputHandler.init();

      // Set up disk manager
      this.diskManager = new DiskManager(this.wasmModule);
      this.diskManager.init();

      // Set up debugger
      this.debugger = new Debugger(this.wasmModule);
      this.debugger.init();

      // Set up UI controls
      this.setupControls();

      // Start render loop
      this.startRenderLoop();

      this.showLoading(false);

      console.log("Apple //e Emulator initialized");
    } catch (error) {
      console.error("Failed to initialize emulator:", error);
      this.showLoading(false);
      alert("Failed to initialize emulator: " + error.message);
    }
  }

  setupControls() {
    // Power button
    document.getElementById("btn-power").addEventListener("click", () => {
      if (this.running) {
        this.stop();
      } else {
        this.start();
      }
    });

    // Reset button - warm reset (preserves memory)
    document.getElementById("btn-reset").addEventListener("click", () => {
      this.wasmModule._warmReset();
    });

    // Fullscreen button
    document.getElementById("btn-fullscreen").addEventListener("click", () => {
      const container = document.getElementById("display-container");
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        container.requestFullscreen();
      }
    });

    // Mute button
    document.getElementById("btn-mute").addEventListener("click", (e) => {
      this.audioDriver.toggleMute();
      e.target.textContent = this.audioDriver.isMuted() ? "Unmute" : "Mute";
    });

    // Speed selector
    document.getElementById("speed-select").addEventListener("change", (e) => {
      this.speed = parseFloat(e.target.value);
      this.audioDriver.setSpeed(this.speed);
    });

    // CRT toggle
    document.getElementById("crt-toggle").addEventListener("change", (e) => {
      this.crtEnabled = e.target.checked;
      this.renderer.setCRTEnabled(this.crtEnabled);
    });

    // Debugger toggle
    document.getElementById("btn-debugger").addEventListener("click", () => {
      const panel = document.getElementById("debugger-panel");
      panel.classList.toggle("hidden");
      if (!panel.classList.contains("hidden")) {
        this.debugger.refresh();
      }
    });
  }

  start() {
    if (this.running) return;

    this.running = true;
    this.audioDriver.start();

    document.getElementById("btn-power").textContent = "Stop";
    console.log("Emulator started");
  }

  stop() {
    if (!this.running) return;

    this.running = false;
    this.audioDriver.stop();

    document.getElementById("btn-power").textContent = "Power";
    console.log("Emulator stopped");
  }

  renderFrame() {
    // Get framebuffer from WASM
    const fbPtr = this.wasmModule._getFramebuffer();
    const fbSize = this.wasmModule._getFramebufferSize();
    const framebuffer = new Uint8Array(
      this.wasmModule.HEAPU8.buffer,
      fbPtr,
      fbSize,
    );

    // Update texture and render
    this.renderer.updateTexture(framebuffer);
    this.renderer.draw();
  }

  startRenderLoop() {
    const render = () => {
      // Update debugger if visible
      if (
        !document.getElementById("debugger-panel").classList.contains("hidden")
      ) {
        this.debugger.refresh();
      }

      // Update disk LEDs
      this.diskManager.updateLEDs();

      requestAnimationFrame(render);
    };

    requestAnimationFrame(render);
  }

  showLoading(show) {
    const loading = document.getElementById("loading");
    if (show) {
      loading.classList.remove("hidden");
    } else {
      loading.classList.add("hidden");
    }
  }
}

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  const emulator = new AppleIIeEmulator();
  emulator.init();

  // Make emulator accessible globally for debugging
  window.a2e = emulator;
});
