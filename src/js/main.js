// Apple //e Emulator - Main Entry Point

import { VERSION } from "./config/version.js";
import { WebGLRenderer } from "./display/webgl-renderer.js";
import { AudioDriver } from "./audio/audio-driver.js";
import { InputHandler, TextSelection } from "./input/index.js";
import { DiskManager } from "./disk-manager/index.js";
import { FileExplorerWindow } from "./file-explorer/index.js";
import { MonitorResizer } from "./ui/monitor-resizer.js";
import { DiskDrivePositioner } from "./ui/disk-drive-positioner.js";
import { ReminderController } from "./ui/reminder-controller.js";
import { DocumentationWindow } from "./ui/documentation-window.js";
import { UIController } from "./ui/ui-controller.js";
import { StateManager } from "./state/state-manager.js";
import {
  WindowManager,
  CPUDebuggerWindow,
  DriveDetailWindow,
  SoftSwitchWindow,
  DisplaySettingsWindow,
  MemoryBrowserWindow,
  MemoryHeatMapWindow,
  MemoryMapWindow,
  StackViewerWindow,
  ZeroPageWatchWindow,
  JoystickWindow,
  MockingboardWindow,
  BasicProgramWindow,
  SlotConfigurationWindow,
} from "./debug/index.js";
import { ReleaseNotesWindow } from "./ui/release-notes-window.js";

// Display constants
const MONITOR_ASPECT_RATIO = 4 / 3;

class AppleIIeEmulator {
  constructor() {
    this.wasmModule = null;
    this.renderer = null;
    this.audioDriver = null;
    this.inputHandler = null;
    this.diskManager = null;
    this.fileExplorer = null;
    this.windowManager = null;
    this.displaySettings = null;
    this.textSelection = null;
    this.monitorResizer = null;
    this.reminderController = null;
    this.documentationWindow = null;
    this.uiController = null;
    this.stateManager = null;

    this.running = false;
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
      this.diskManager.onDiskLoaded = () => {
        this.reminderController.dismissBasicReminder();
      };

      // Set up file explorer
      this.fileExplorer = new FileExplorerWindow(this.wasmModule);
      this.fileExplorer.create();

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

      const memMapWindow = new MemoryMapWindow(this.wasmModule);
      memMapWindow.create();
      this.windowManager.register(memMapWindow);

      const stackWindow = new StackViewerWindow(this.wasmModule);
      stackWindow.create();
      this.windowManager.register(stackWindow);

      const zpWatchWindow = new ZeroPageWatchWindow(this.wasmModule);
      zpWatchWindow.create();
      this.windowManager.register(zpWatchWindow);

      const joystickWindow = new JoystickWindow(this.wasmModule);
      joystickWindow.create();
      this.windowManager.register(joystickWindow);

      const mockingboardWindow = new MockingboardWindow(this.wasmModule);
      mockingboardWindow.create();
      this.windowManager.register(mockingboardWindow);

      const basicProgramWindow = new BasicProgramWindow(
        this.wasmModule,
        this.inputHandler,
      );
      basicProgramWindow.create();
      this.windowManager.register(basicProgramWindow);

      // Slot configuration window
      const slotConfigWindow = new SlotConfigurationWindow(
        this.wasmModule,
        () => this.wasmModule._reset(),
      );
      slotConfigWindow.create();
      this.windowManager.register(slotConfigWindow);

      // Release notes window
      this.releaseNotesWindow = new ReleaseNotesWindow();
      this.releaseNotesWindow.create();
      this.windowManager.register(this.releaseNotesWindow);

      // Release notes button in footer
      const releaseNotesBtn = document.getElementById("btn-release-notes");
      if (releaseNotesBtn) {
        releaseNotesBtn.addEventListener("click", () => {
          this.windowManager.toggleWindow("release-notes");
        });
      }

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

      // Set up documentation window
      this.documentationWindow = new DocumentationWindow();
      this.documentationWindow.create();
      this.windowManager.register(this.documentationWindow);

      // Set up monitor resizer
      this.monitorResizer = new MonitorResizer({
        aspectRatio: MONITOR_ASPECT_RATIO,
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

      // Set up disk drive positioner
      this.diskDrivePositioner = new DiskDrivePositioner();
      this.diskDrivePositioner.init();

      // Set up UI controller
      this.uiController = new UIController({
        emulator: this,
        wasmModule: this.wasmModule,
        audioDriver: this.audioDriver,
        diskManager: this.diskManager,
        fileExplorer: this.fileExplorer,
        windowManager: this.windowManager,
        monitorResizer: this.monitorResizer,
        reminderController: this.reminderController,
      });
      this.uiController.init();

      // Set up state manager
      this.stateManager = new StateManager({
        emulator: this,
        wasmModule: this.wasmModule,
        uiController: this.uiController,
        diskManager: this.diskManager,
        reminderController: this.reminderController,
      });
      this.stateManager.init();

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

  /**
   * Check if the emulator is running
   * @returns {boolean}
   */
  isRunning() {
    return this.running;
  }

  start() {
    if (this.running) return;

    this.wasmModule._reset();
    this.running = true;
    this.renderer.setNoSignal(false);
    this.audioDriver.start();
    if (this.uiController) {
      this.uiController.updatePowerButton(true);
    }
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
    if (this.uiController) {
      this.uiController.updatePowerButton(false);
    }
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

    if (this.stateManager) {
      this.stateManager.destroy();
      this.stateManager = null;
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
    if (this.fileExplorer) {
      this.fileExplorer.destroy();
      this.fileExplorer = null;
    }
    this.inputHandler = null;
    this.reminderController = null;
    this.uiController = null;

    console.log("Apple //e Emulator destroyed");
  }
}

// Register service worker for offline support with auto-update
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        console.log("Service Worker registered:", registration.scope);

        // Check for updates immediately on load
        registration.update().catch((err) => {
          console.log("Service Worker update check failed:", err);
        });

        // Handle new service worker installation
        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener("statechange", () => {
              if (newWorker.state === "installed") {
                if (navigator.serviceWorker.controller) {
                  // New version available - show notification and reload
                  console.log("New version available - updating...");
                  showUpdateNotification();

                  // Tell the new service worker to take over
                  newWorker.postMessage("skipWaiting");
                } else {
                  // First install - no reload needed
                  console.log("App cached for offline use");
                }
              }
            });
          }
        });
      })
      .catch((error) => {
        console.log("Service Worker registration failed:", error);
      });

    // Listen for controller change and reload
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!refreshing) {
        refreshing = true;
        console.log("New service worker activated - reloading...");
        window.location.reload();
      }
    });
  });
}

// Show update notification before reload
function showUpdateNotification() {
  const notification = document.createElement("div");
  notification.id = "update-notification";
  notification.innerHTML = `
    <div class="update-notification-content">
      <span>Updating to new version...</span>
    </div>
  `;
  notification.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(13, 17, 23, 0.95);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(48, 54, 61, 0.6);
    border-radius: 8px;
    padding: 20px 30px;
    z-index: 10000;
    color: #e6edf3;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    font-size: 14px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  `;
  document.body.appendChild(notification);
}

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  // Display version in header
  const versionEl = document.getElementById("app-version");
  if (versionEl) {
    versionEl.textContent = `v${VERSION}`;
  }

  const emulator = new AppleIIeEmulator();
  emulator.init();

  // Make emulator accessible globally for debugging
  window.a2e = emulator;

  // Helper to toggle Mockingboard debug logging from console
  window.mbDebug = (enabled = true) => {
    if (emulator.wasmModule && emulator.wasmModule._setMockingboardDebugLogging) {
      emulator.wasmModule._setMockingboardDebugLogging(enabled);
      console.log(`Mockingboard debug logging ${enabled ? "enabled" : "disabled"}`);
    } else {
      console.log("Mockingboard debug logging not available");
    }
  };
});
