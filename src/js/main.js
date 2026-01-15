// Apple //e Emulator - Main Entry Point

import { WebGLRenderer } from "./webgl-renderer.js";
import { AudioDriver } from "./audio-driver.js";
import { InputHandler } from "./input-handler.js";
import { DiskManager } from "./disk-manager.js";
import { Debugger } from "./debugger.js";
import { DisplaySettings } from "./display-settings.js";

class AppleIIeEmulator {
  constructor() {
    this.wasmModule = null;
    this.renderer = null;
    this.audioDriver = null;
    this.inputHandler = null;
    this.diskManager = null;
    this.debugger = null;
    this.displaySettings = null;

    this.running = false;
    this.speed = 1; // 1x, 2x, or 0 for unlimited

    // Display aspect ratio (4:3 for authentic CRT monitor)
    this.aspectRatio = 4 / 3;

    // Bind resize handler
    this.handleResize = this.handleResize.bind(this);
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

      // Set up display settings (pass renderer for shader control)
      this.displaySettings = new DisplaySettings(this.renderer);
      this.displaySettings.init();

      // Start with TV static "no signal" since emulator is off
      this.renderer.setNoSignal(true);

      // Set up UI controls
      this.setupControls();

      // Set up resize handling
      this.setupResizeHandling();

      // Initial resize to fit window
      this.handleResize();

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
    const powerBtn = document.getElementById("btn-power");
    const muteBtn = document.getElementById("btn-mute");

    // Power button
    powerBtn.addEventListener("click", () => {
      if (this.running) {
        this.stop();
      } else {
        this.start();
      }
    });

    // Warm reset button (preserves memory)
    document.getElementById("btn-warm-reset").addEventListener("click", () => {
      this.wasmModule._warmReset();
    });

    // Cold reset button (full restart)
    document.getElementById("btn-cold-reset").addEventListener("click", () => {
      this.wasmModule._reset();
    });

    // Fullscreen button
    document.getElementById("btn-fullscreen").addEventListener("click", () => {
      const container = document.getElementById("monitor-frame");
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        container.requestFullscreen();
      }
    });

    // Mute button
    muteBtn.addEventListener("click", () => {
      this.audioDriver.toggleMute();
      this.updateMuteButton();
    });

    // Debugger toggle
    document.getElementById("btn-debugger").addEventListener("click", () => {
      this.toggleDebugger();
    });

    // Debugger close button
    const debuggerClose = document.getElementById("debugger-close");
    if (debuggerClose) {
      debuggerClose.addEventListener("click", () => {
        this.toggleDebugger(false);
      });
    }
  }

  toggleDebugger(forceState) {
    const panel = document.getElementById("debugger-panel");
    if (forceState === false) {
      panel.classList.add("hidden");
    } else if (forceState === true) {
      panel.classList.remove("hidden");
    } else {
      panel.classList.toggle("hidden");
    }

    if (!panel.classList.contains("hidden")) {
      this.debugger.refresh();
    }
  }

  setupResizeHandling() {
    // Listen for window resize
    window.addEventListener("resize", this.handleResize);

    // Use ResizeObserver for more accurate container size tracking
    if (typeof ResizeObserver !== "undefined") {
      const main = document.querySelector("main");
      this.resizeObserver = new ResizeObserver(() => {
        this.handleResize();
      });
      this.resizeObserver.observe(main);
    }
  }

  handleResize() {
    const canvas = document.getElementById("screen");
    const diskDrives = document.getElementById("disk-drives");
    const header = document.querySelector("header");
    const footer = document.querySelector("footer");

    // Calculate available space
    const headerHeight = header ? header.offsetHeight : 0;
    const footerHeight = footer ? footer.offsetHeight : 0;

    // Get disk drives height (approximate)
    const diskDrivesHeight = diskDrives ? diskDrives.offsetHeight + 16 : 100;

    // Calculate available dimensions
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    // Available space for the monitor (accounting for padding)
    const padding = 32; // 16px on each side
    const availableWidth = windowWidth - padding;
    const availableHeight = windowHeight - headerHeight - footerHeight - diskDrivesHeight - padding;

    // Calculate the optimal canvas size maintaining aspect ratio
    // The bezel adds approximately 72px width (28*2 + 16*2) and 88px height (24+32+16*2)
    const bezelPaddingX = 88;
    const bezelPaddingY = 104;

    const maxCanvasWidth = availableWidth - bezelPaddingX;
    const maxCanvasHeight = availableHeight - bezelPaddingY;

    let canvasWidth, canvasHeight;

    // Calculate size based on aspect ratio
    if (maxCanvasWidth / maxCanvasHeight > this.aspectRatio) {
      // Height is the limiting factor
      canvasHeight = Math.max(200, maxCanvasHeight);
      canvasWidth = canvasHeight * this.aspectRatio;
    } else {
      // Width is the limiting factor
      canvasWidth = Math.max(280, maxCanvasWidth);
      canvasHeight = canvasWidth / this.aspectRatio;
    }

    // Round to integers
    canvasWidth = Math.floor(canvasWidth);
    canvasHeight = Math.floor(canvasHeight);

    // Apply size to canvas element (CSS size for display)
    canvas.style.width = canvasWidth + "px";
    canvas.style.height = canvasHeight + "px";

    // Update WebGL viewport
    if (this.renderer) {
      this.renderer.resize(canvasWidth, canvasHeight);
    }
  }

  updateMuteButton() {
    const muteBtn = document.getElementById("btn-mute");
    const iconUnmuted = muteBtn.querySelector(".icon-unmuted");
    const iconMuted = muteBtn.querySelector(".icon-muted");

    if (this.audioDriver.isMuted()) {
      iconUnmuted.classList.add("hidden");
      iconMuted.classList.remove("hidden");
    } else {
      iconUnmuted.classList.remove("hidden");
      iconMuted.classList.add("hidden");
    }
  }

  updatePowerButton() {
    const powerBtn = document.getElementById("btn-power");
    const powerLed = document.getElementById("monitor-power-led");
    if (this.running) {
      powerBtn.classList.remove("off");
      powerBtn.title = "Power Off";
      powerLed?.classList.add("on");
    } else {
      powerBtn.classList.add("off");
      powerBtn.title = "Power On";
      powerLed?.classList.remove("on");
    }
  }

  start() {
    if (this.running) return;

    // Cold boot - full reset
    this.wasmModule._reset();

    this.running = true;
    this.renderer.setNoSignal(false);
    this.audioDriver.start();
    this.updatePowerButton();
    console.log("Emulator powered on");
  }

  stop() {
    if (!this.running) return;

    this.running = false;
    this.audioDriver.stop();

    // Show TV static "no signal" effect
    this.renderer.setNoSignal(true);

    this.updatePowerButton();
    console.log("Emulator powered off");
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

      // Keep drawing when off to show animated TV static
      if (!this.running) {
        this.renderer.draw();
      }

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
