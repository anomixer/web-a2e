// Apple //e Emulator - Main Entry Point

import { WebGLRenderer } from "./webgl-renderer.js";
import { AudioDriver } from "./audio-driver.js";
import { InputHandler } from "./input-handler.js";
import { DiskManager } from "./disk-manager/index.js";
import { TextSelection } from "./TextSelection.js";
import {
  WindowManager,
  CPUDebuggerWindow,
  DriveDetailWindow,
  SoftSwitchWindow,
  DisplaySettingsWindow,
  MemoryBrowserWindow,
  MemoryHeatMapWindow,
  StackViewerWindow,
  ZeroPageWatchWindow,
} from "./debug/index.js";

class AppleIIeEmulator {
  constructor() {
    this.wasmModule = null;
    this.renderer = null;
    this.audioDriver = null;
    this.inputHandler = null;
    this.diskManager = null;
    this.windowManager = null;
    this.displaySettings = null;
    this.textSelection = null;

    this.running = false;
    this.speed = 1; // 1x, 2x, or 0 for unlimited
    this.isFullPageMode = false;
    this.isPowerReminderVisible = false;

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

      // Set up debug windows
      this.windowManager = new WindowManager();

      const cpuWindow = new CPUDebuggerWindow(this.wasmModule);
      cpuWindow.create();
      this.windowManager.register(cpuWindow);

      const driveWindow = new DriveDetailWindow(this.wasmModule);
      driveWindow.create();
      this.windowManager.register(driveWindow);

      const switchWindow = new SoftSwitchWindow(this.wasmModule);
      switchWindow.create();
      this.windowManager.register(switchWindow);

      // Set up display settings window (pass renderer for shader control)
      this.displaySettings = new DisplaySettingsWindow(this.renderer);
      this.displaySettings.create();
      this.windowManager.register(this.displaySettings);

      // Set up new debug windows
      const memBrowserWindow = new MemoryBrowserWindow(this.wasmModule);
      memBrowserWindow.create();
      this.windowManager.register(memBrowserWindow);

      const memHeatMapWindow = new MemoryHeatMapWindow(this.wasmModule);
      memHeatMapWindow.create();
      this.windowManager.register(memHeatMapWindow);

      // Connect heat map to memory browser for click-to-jump
      memHeatMapWindow.setJumpCallback((addr) => {
        memBrowserWindow.jumpToAddress(addr);
        this.windowManager.showWindow("memory-browser");
      });

      const stackWindow = new StackViewerWindow(this.wasmModule);
      stackWindow.create();
      this.windowManager.register(stackWindow);

      const zpWatchWindow = new ZeroPageWatchWindow(this.wasmModule);
      zpWatchWindow.create();
      this.windowManager.register(zpWatchWindow);

      // Load saved window states
      this.windowManager.loadState();

      // Start with TV static "no signal" since emulator is off
      this.renderer.setNoSignal(true);

      // Set up text selection for copying screen contents
      this.textSelection = new TextSelection(canvas, this.wasmModule);

      // Set up UI controls
      this.setupControls();

      // Set up resize handling
      this.setupResizeHandling();

      // Initial resize to fit window
      this.handleResize();

      // Start render loop
      this.startRenderLoop();

      this.showLoading(false);
      this.showPowerReminder(true);

      console.log("Apple //e Emulator initialized");
    } catch (error) {
      console.error("Failed to initialize emulator:", error);
      this.showLoading(false);
      alert("Failed to initialize emulator: " + error.message);
    }
  }

  setupControls() {
    const powerBtn = document.getElementById("btn-power");
    const canvas = document.getElementById("screen");

    // Helper to refocus canvas after button clicks
    const refocusCanvas = () => {
      setTimeout(() => canvas.focus(), 0);
    };

    // Power button
    powerBtn.addEventListener("click", () => {
      this.showPowerReminder(false); // Hide reminder on first click
      if (this.running) {
        this.stop();
      } else {
        this.start();
      }
      refocusCanvas();
    });

    // Warm reset button (preserves memory)
    document.getElementById("btn-warm-reset").addEventListener("click", () => {
      this.wasmModule._warmReset();
      refocusCanvas();
    });

    // Cold reset button (full restart)
    document.getElementById("btn-cold-reset").addEventListener("click", () => {
      this.wasmModule._reset();
      refocusCanvas();
    });

    // Full page mode button
    const fullscreenBtn = document.getElementById("btn-fullscreen");
    const exitFullPageMode = () => {
      document.body.classList.remove("full-page-mode");
      this.isFullPageMode = false;
      refocusCanvas();
    };

    const enterFullPageMode = () => {
      // Hide all debug windows
      this.windowManager.hideAll();
      document.body.classList.add("full-page-mode");
      this.isFullPageMode = true;
      refocusCanvas();
    };

    fullscreenBtn.addEventListener("click", () => {
      if (this.isFullPageMode) {
        exitFullPageMode();
      } else {
        enterFullPageMode();
      }
    });

    // Exit full page mode on Escape key
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.isFullPageMode) {
        e.preventDefault();
        exitFullPageMode();
      }
    });

    // Exit full page mode on click (on the black background area)
    document.querySelector("main").addEventListener("click", (e) => {
      if (this.isFullPageMode && e.target.tagName !== "CANVAS") {
        exitFullPageMode();
      }
    });

    // Sound popup
    const soundBtn = document.getElementById("btn-sound");
    const soundPopup = document.getElementById("sound-popup");
    const volumeSlider = document.getElementById("volume-slider");
    const volumeValue = document.getElementById("volume-value");
    const muteToggle = document.getElementById("mute-toggle");
    const driveSoundsToggle = document.getElementById("drive-sounds-toggle");

    // Load saved drive sounds setting
    const savedDriveSounds = localStorage.getItem("a2e-drive-sounds");
    const driveSoundsEnabled = savedDriveSounds !== "false";
    driveSoundsToggle.checked = driveSoundsEnabled;
    this.diskManager.setSeekSoundEnabled(driveSoundsEnabled);
    this.diskManager.setMotorSoundEnabled(driveSoundsEnabled);

    // Toggle popup on button click
    soundBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      soundPopup.classList.toggle("hidden");
    });

    // Close popup when clicking outside
    document.addEventListener("click", (e) => {
      if (!soundPopup.contains(e.target) && e.target !== soundBtn) {
        soundPopup.classList.add("hidden");
      }
    });

    // Prevent popup from closing when clicking inside
    soundPopup.addEventListener("click", (e) => {
      e.stopPropagation();
    });

    // Volume slider
    if (volumeSlider) {
      const initialVolume = Math.round(this.audioDriver.getVolume() * 100);
      volumeSlider.value = initialVolume;
      volumeValue.textContent = `${initialVolume}%`;

      volumeSlider.addEventListener("input", (e) => {
        const volume = parseInt(e.target.value, 10);
        volumeValue.textContent = `${volume}%`;
        this.audioDriver.setVolume(volume / 100);
      });
    }

    // Mute toggle
    muteToggle.checked = this.audioDriver.isMuted();
    muteToggle.addEventListener("change", (e) => {
      if (e.target.checked) {
        this.audioDriver.mute();
      } else {
        this.audioDriver.unmute();
      }
      this.updateSoundButton();
    });

    // Drive sounds toggle
    driveSoundsToggle.addEventListener("change", (e) => {
      const enabled = e.target.checked;
      this.diskManager.setSeekSoundEnabled(enabled);
      this.diskManager.setMotorSoundEnabled(enabled);
      localStorage.setItem("a2e-drive-sounds", enabled);
    });

    // Character set toggle (UK/US) - unchecked = UK (left), checked = US (right)
    const charsetToggle = document.getElementById("charset-toggle");
    if (charsetToggle) {
      // Load saved preference (stored as "uk" or "us")
      const savedCharset = localStorage.getItem("a2e-charset");
      if (savedCharset === "uk") {
        charsetToggle.checked = false;
        this.wasmModule._setUKCharacterSet(true);
      } else {
        // Default to US
        charsetToggle.checked = true;
        this.wasmModule._setUKCharacterSet(false);
      }

      charsetToggle.addEventListener("change", (e) => {
        // Checked = US (right), Unchecked = UK (left)
        const isUK = !e.target.checked;
        this.wasmModule._setUKCharacterSet(isUK);
        localStorage.setItem("a2e-charset", isUK ? "uk" : "us");
        refocusCanvas();
      });
    }

    // Debug dropdown menu
    const debugMenuContainer = document.querySelector(".debug-menu-container");
    const debugMenuBtn = document.getElementById("btn-debug-menu");
    const debugMenu = document.getElementById("debug-menu");

    if (debugMenuBtn && debugMenu) {
      // Toggle menu on button click
      debugMenuBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        debugMenuContainer.classList.toggle("open");
      });

      // Handle menu item clicks
      debugMenu.querySelectorAll(".debug-menu-item").forEach((item) => {
        item.addEventListener("click", () => {
          const windowType = item.dataset.window;
          const windowMap = {
            cpu: "cpu-debugger",
            drives: "drive-detail",
            switches: "soft-switches",
            memory: "memory-browser",
            heatmap: "memory-heatmap",
            stack: "stack-viewer",
            zeropage: "zeropage-watch",
          };
          if (windowMap[windowType]) {
            this.windowManager.toggleWindow(windowMap[windowType]);
          }
          debugMenuContainer.classList.remove("open");
          refocusCanvas();
        });
      });

      // Close menu when clicking outside
      document.addEventListener("click", (e) => {
        if (!debugMenuContainer.contains(e.target)) {
          debugMenuContainer.classList.remove("open");
        }
      });

      // Close menu on Escape key
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          debugMenuContainer.classList.remove("open");
        }
      });
    }

    // Display settings button
    const displayBtn = document.getElementById("btn-display");
    if (displayBtn) {
      displayBtn.addEventListener("click", () => {
        this.windowManager.toggleWindow("display-settings");
        refocusCanvas();
      });
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
    const availableHeight =
      windowHeight - headerHeight - footerHeight - diskDrivesHeight - padding;

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

    // Update text selection overlay size
    if (this.textSelection) {
      this.textSelection.resize();
    }

    // Constrain debug windows to visible viewport
    if (this.windowManager) {
      this.windowManager.constrainAllToViewport();
    }

    // Reposition power reminder if visible (after layout settles)
    if (this.isPowerReminderVisible) {
      requestAnimationFrame(() => this.repositionPowerReminder());
    }
  }

  updateSoundButton() {
    const soundBtn = document.getElementById("btn-sound");
    const iconUnmuted = soundBtn.querySelector(".icon-unmuted");
    const iconMuted = soundBtn.querySelector(".icon-muted");

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

    // Stop disk motor (won't timeout naturally since cycles aren't advancing)
    if (this.wasmModule._stopDiskMotor) {
      this.wasmModule._stopDiskMotor();
    }

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
      // Update visible debug windows
      this.windowManager.updateAll(this.wasmModule);

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

  repositionPowerReminder() {
    const reminder = document.getElementById("power-reminder");
    const powerBtn = document.getElementById("btn-power");
    if (!reminder || !powerBtn) return;

    const btnRect = powerBtn.getBoundingClientRect();
    const btnCenterX = btnRect.left + btnRect.width / 2;

    // Get reminder dimensions (use a minimum if not yet rendered)
    const reminderRect = reminder.getBoundingClientRect();
    const reminderWidth = reminderRect.width || 200;

    // Position reminder so it stays within viewport
    let reminderLeft = btnCenterX - reminderWidth / 2;

    // Clamp to viewport edges with padding
    const padding = 16;
    const maxLeft = window.innerWidth - reminderWidth - padding;
    reminderLeft = Math.max(padding, Math.min(reminderLeft, maxLeft));

    // Calculate where the arrow should point (relative to reminder position)
    const arrowLeft = btnCenterX - reminderLeft;

    reminder.style.left = `${reminderLeft}px`;
    reminder.style.top = `${btnRect.bottom + 15}px`;
    reminder.style.setProperty('--arrow-left', `${arrowLeft}px`);
  }

  showPowerReminder(show) {
    const reminder = document.getElementById("power-reminder");
    if (!reminder) return;

    if (show) {
      this.isPowerReminderVisible = true;
      reminder.classList.remove("hidden");
      // Use requestAnimationFrame to ensure the element is visible before positioning
      requestAnimationFrame(() => {
        this.repositionPowerReminder();
      });
    } else {
      this.isPowerReminderVisible = false;
      reminder.classList.add("hidden");
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
