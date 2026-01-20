// Apple //e Emulator - Main Entry Point

import { WebGLRenderer } from "./webgl-renderer.js";
import { AudioDriver } from "./audio-driver.js";
import { InputHandler } from "./input-handler.js";
import { DiskManager } from "./disk-manager/index.js";
import { TextSelection } from "./TextSelection.js";
import { MonitorResizer } from "./ui/MonitorResizer.js";
import { ReminderController } from "./ui/ReminderController.js";
import { DocumentationDialog } from "./ui/DocumentationDialog.js";
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
    this.monitorResizer = null;
    this.reminderController = null;
    this.documentationDialog = null;

    this.running = false;
    this.isFullPageMode = false;
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

      // Set up display settings window (pass renderer for shader control, wasmModule for video settings)
      this.displaySettings = new DisplaySettingsWindow(
        this.renderer,
        this.wasmModule,
      );
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

      // Save window states when page is closed
      window.addEventListener("beforeunload", () => {
        if (this.windowManager) {
          this.windowManager.saveState();
        }
      });

      // Start with TV static "no signal" since emulator is off
      this.renderer.setNoSignal(true);

      // Set up text selection for copying screen contents
      this.textSelection = new TextSelection(canvas, this.wasmModule);

      // Set up reminder controller
      this.reminderController = new ReminderController();

      // Set up documentation dialog
      this.documentationDialog = new DocumentationDialog();
      this.documentationDialog.init();

      // Set up monitor resizer
      this.monitorResizer = new MonitorResizer({
        aspectRatio: 4 / 3,
        onResize: (width, height) => {
          if (this.renderer) {
            this.renderer.resize(width, height);
          }
          if (this.textSelection) {
            this.textSelection.resize();
          }
          if (this.windowManager) {
            this.windowManager.constrainAllToViewport();
          }
          this.reminderController.repositionAll();
        },
        onResizeComplete: () => {},
      });
      this.monitorResizer.init();

      // Set up UI controls
      this.setupControls();

      // Start render loop
      this.startRenderLoop();

      this.showLoading(false);
      this.reminderController.showPowerReminder(true);
      this.reminderController.showDrivesReminder(true);

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

    if (!powerBtn || !canvas) {
      console.error("Required DOM elements not found: btn-power or screen");
      return;
    }

    // Helper to refocus canvas after button clicks
    const refocusCanvas = () => {
      setTimeout(() => canvas.focus(), 0);
    };

    // Power button
    powerBtn.addEventListener("click", () => {
      this.reminderController.showPowerReminder(false);
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

    // Disk drives visibility toggle
    const drivesBtn = document.getElementById("btn-drives");
    const drivesContainer = document.querySelector(".disk-drives-container");

    if (!drivesBtn || !drivesContainer) {
      console.warn("Disk drive UI elements not found");
    }

    // Load saved drives visibility setting (default to visible)
    const savedDrivesVisible = localStorage.getItem("a2e-show-drives");
    if (savedDrivesVisible === "false" && drivesBtn && drivesContainer) {
      drivesContainer.classList.add("collapsed");
      drivesBtn.classList.add("off");
      requestAnimationFrame(() => this.monitorResizer.handleResize());
    }

    if (drivesBtn && drivesContainer) {
      drivesBtn.addEventListener("click", () => {
        const isCurrentlyCollapsed =
          drivesContainer.classList.contains("collapsed");

        drivesContainer.classList.toggle("collapsed");
        drivesBtn.classList.toggle("off", !isCurrentlyCollapsed);
        localStorage.setItem("a2e-show-drives", isCurrentlyCollapsed);

        // Resize monitor continuously during animation
        const startTime = performance.now();
        const duration = 280; // Slightly longer than CSS transition
        const animateResize = () => {
          this.monitorResizer.handleResize();
          if (performance.now() - startTime < duration) {
            requestAnimationFrame(animateResize);
          }
        };
        requestAnimationFrame(animateResize);

        this.reminderController.dismissDrivesReminder();
        refocusCanvas();
      });
    }

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

    // Character set toggle (UK/US)
    const charsetToggle = document.getElementById("charset-toggle");
    if (charsetToggle) {
      const savedCharset = localStorage.getItem("a2e-charset");
      if (savedCharset === "uk") {
        charsetToggle.checked = false;
        this.wasmModule._setUKCharacterSet(true);
      } else {
        charsetToggle.checked = true;
        this.wasmModule._setUKCharacterSet(false);
      }

      charsetToggle.addEventListener("change", (e) => {
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
      debugMenuBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        debugMenuContainer.classList.toggle("open");
      });

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

      document.addEventListener("click", (e) => {
        if (!debugMenuContainer.contains(e.target)) {
          debugMenuContainer.classList.remove("open");
        }
      });

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

    if (this.wasmModule._stopDiskMotor) {
      this.wasmModule._stopDiskMotor();
    }

    this.renderer.setNoSignal(true);
    this.updatePowerButton();
    console.log("Emulator powered off");
  }

  renderFrame() {
    const fbPtr = this.wasmModule._getFramebuffer();
    const fbSize = this.wasmModule._getFramebufferSize();
    const framebuffer = new Uint8Array(
      this.wasmModule.HEAPU8.buffer,
      fbPtr,
      fbSize,
    );

    this.renderer.updateTexture(framebuffer);
    this.renderer.draw();
  }

  startRenderLoop() {
    const render = () => {
      this.windowManager.updateAll(this.wasmModule);
      this.diskManager.updateLEDs();

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

  /**
   * Clean up resources and remove event listeners.
   */
  destroy() {
    if (this.running) {
      this.stop();
    }

    if (this.monitorResizer) {
      this.monitorResizer.destroy();
      this.monitorResizer = null;
    }

    if (this.textSelection) {
      this.textSelection.destroy();
      this.textSelection = null;
    }

    if (this.windowManager) {
      this.windowManager.saveState();
      this.windowManager = null;
    }

    if (this.audioDriver) {
      this.audioDriver.stop();
      this.audioDriver = null;
    }

    this.renderer = null;
    this.diskManager = null;
    this.inputHandler = null;
    this.reminderController = null;

    console.log("Apple //e Emulator destroyed");
  }
}

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  const emulator = new AppleIIeEmulator();
  emulator.init();

  // Make emulator accessible globally for debugging
  window.a2e = emulator;
});
