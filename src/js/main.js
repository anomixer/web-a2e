// Apple //e Emulator - Main Entry Point

import { VERSION } from "./config/version.js";
import { WebGLRenderer } from "./display/webgl-renderer.js";
import { AudioDriver } from "./audio/audio-driver.js";
import { InputHandler, TextSelection } from "./input/index.js";
import { DiskManager } from "./disk-manager/index.js";
import { DiskDrivesWindow } from "./disk-manager/disk-drives-window.js";
import { FileExplorerWindow } from "./file-explorer/index.js";
import { ReminderController } from "./ui/reminder-controller.js";
import { DocumentationWindow } from "./ui/documentation-window.js";
import { UIController } from "./ui/ui-controller.js";
import { StateManager } from "./state/state-manager.js";
import {
  WindowManager,
  CPUDebuggerWindow,
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
import { ScreenWindow } from "./ui/screen-window.js";

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

      // Set up file explorer
      this.fileExplorer = new FileExplorerWindow(this.wasmModule);
      this.fileExplorer.create();

      // Set up window manager
      this.windowManager = new WindowManager();

      // Create disk drives window first so DiskManager can find its DOM elements
      const diskDrivesWindow = new DiskDrivesWindow();
      diskDrivesWindow.create();
      this.windowManager.register(diskDrivesWindow);

      // Set up disk manager (must be after disk drives window is created)
      this.diskManager = new DiskManager(this.wasmModule);
      this.diskManager.init();
      this.diskManager.onDiskLoaded = () => {
        this.reminderController.dismissBasicReminder();
      };

      const cpuWindow = new CPUDebuggerWindow(this.wasmModule);
      cpuWindow.create();
      this.windowManager.register(cpuWindow);

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

      // Set up screen window (hosts the emulator canvas)
      this.screenWindow = new ScreenWindow(this.renderer, null); // textSelection set later
      this.screenWindow.create();
      this.windowManager.register(this.screenWindow);

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

      // Wire textSelection into screen window
      this.screenWindow.textSelection = this.textSelection;

      // Set up reminder controller
      this.reminderController = new ReminderController();

      // Set up documentation window
      this.documentationWindow = new DocumentationWindow();
      this.documentationWindow.create();
      this.windowManager.register(this.documentationWindow);

      // Apply display settings
      this.displaySettings.applyAllSettings();

      // Always show ScreenWindow and attach canvas
      this.screenWindow.show();
      this.screenWindow.attachCanvas();

      // Position/size windows for first-time users
      this.showDefaultWindows();

      // Set up UI controller
      this.uiController = new UIController({
        emulator: this,
        wasmModule: this.wasmModule,
        audioDriver: this.audioDriver,
        diskManager: this.diskManager,
        fileExplorer: this.fileExplorer,
        windowManager: this.windowManager,
        screenWindow: this.screenWindow,
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
   * For first-time users (no saved window state), size the screen window
   * to fill the available viewport at 4:3 and center it.  Disk drives
   * stay hidden until the user opens them.
   *
   * Called after screenWindow.show() + attachCanvas() so the screen
   * window already has accurate layout metrics.
   */
  showDefaultWindows() {
    const savedState = localStorage.getItem('a2e-debug-windows');
    if (savedState) {
      try {
        const parsed = JSON.parse(savedState);
        if (parsed && parsed['screen-window']) return;
      } catch (e) { /* proceed with defaults */ }
    }

    const header = document.querySelector('header');
    const footer = document.querySelector('footer');
    const headerH = header ? header.offsetHeight : 0;
    const footerH = footer ? footer.offsetHeight : 0;
    const vpW = window.innerWidth;
    const vpH = window.innerHeight;
    const availW = vpW;
    const availH = vpH - headerH - footerH;
    const margin = 8;

    const sw = this.screenWindow;
    const swM = sw._layoutMetrics || { hPad: 4, vFixed: 34 };

    // Largest 4:3 canvas that fits within the available space
    const maxCanvasW = availW - margin * 2 - swM.hPad;
    const maxCanvasH = availH - margin * 2 - swM.vFixed;

    let canvasW, canvasH;
    if (maxCanvasW * 3 / 4 <= maxCanvasH) {
      // Width is the limiting dimension
      canvasW = maxCanvasW;
      canvasH = canvasW * 3 / 4;
    } else {
      // Height is the limiting dimension
      canvasH = maxCanvasH;
      canvasW = canvasH * 4 / 3;
    }

    const screenW = Math.max(sw.minWidth, Math.round(canvasW + swM.hPad));
    const screenH = Math.max(sw.minHeight, Math.round(canvasH + swM.vFixed));
    const screenX = Math.round((vpW - screenW) / 2);
    const screenY = headerH + Math.round((availH - screenH) / 2);

    sw.element.style.left = `${screenX}px`;
    sw.element.style.top = `${screenY}px`;
    sw.element.style.width = `${screenW}px`;
    sw.element.style.height = `${screenH}px`;
    sw.currentX = screenX;
    sw.currentY = screenY;
    sw.currentWidth = screenW;
    sw.currentHeight = screenH;
    sw._updateRendererSize();

    // Lock to viewport by default so the window tracks browser resizes
    sw.setViewportLocked(true);
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
