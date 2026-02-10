/*
 * main.js - Main entry point and AppleIIeEmulator class
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { VERSION } from "./config/version.js";
import { DEFAULT_LAYOUT } from "./config/default-layout.js";
import { WebGLRenderer } from "./display/webgl-renderer.js";
import { AudioDriver } from "./audio/audio-driver.js";
import { InputHandler, TextSelection, JoystickWindow, MouseHandler } from "./input/index.js";
import { DiskManager } from "./disk-manager/index.js";
import { DiskDrivesWindow } from "./disk-manager/disk-drives-window.js";
import { HardDriveManager } from "./disk-manager/hard-drive-manager.js";
import { HardDriveWindow } from "./disk-manager/hard-drive-window.js";
import { FileExplorerWindow } from "./file-explorer/index.js";
import { DisplaySettingsWindow, ScreenWindow } from "./display/index.js";
import { DocumentationWindow, ReleaseNotesWindow } from "./help/index.js";
import { ReminderController } from "./ui/reminder-controller.js";
import { UIController } from "./ui/ui-controller.js";
import { ThemeManager } from "./ui/theme-manager.js";
import { showToast } from "./ui/toast.js";
import { SlotConfigurationWindow } from "./ui/slot-configuration-window.js";
import { WindowSwitcher } from "./ui/window-switcher.js";
import { StateManager } from "./state/state-manager.js";
import { SaveStatesWindow } from "./state/save-states-window.js";
import {
  WindowManager,
  CPUDebuggerWindow,
  SoftSwitchWindow,
  MemoryBrowserWindow,
  MemoryHeatMapWindow,
  MemoryMapWindow,
  StackViewerWindow,
  ZeroPageWatchWindow,
  MockingboardWindow,
  MouseCardWindow,
  BasicProgramWindow,
  RuleBuilderWindow,
  AssemblerEditorWindow,
  TracePanelWindow,
} from "./debug/index.js";

class AppleIIeEmulator {
  constructor() {
    this.wasmModule = null;
    this.renderer = null;
    this.audioDriver = null;
    this.inputHandler = null;
    this.diskManager = null;
    this.hardDriveManager = null;
    this.fileExplorer = null;
    this.windowManager = null;
    this.displaySettings = null;
    this.textSelection = null;
    this.reminderController = null;
    this.documentationWindow = null;
    this.uiController = null;
    this.stateManager = null;
    this.mouseHandler = null;
    this.themeManager = null;

    this.running = false;
  }

  async init() {
    // Apply theme before any rendering to prevent flash of wrong theme
    this.themeManager = new ThemeManager();

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

      // Set up mouse handler for Apple Mouse Interface Card
      this.mouseHandler = new MouseHandler(this.wasmModule);
      this.mouseHandler.init();

      // Set up window manager
      this.windowManager = new WindowManager();

      // Set up file explorer (registered with window manager for proper z-index/focus)
      this.fileExplorer = new FileExplorerWindow(this.wasmModule);
      this.fileExplorer.create();
      this.windowManager.register(this.fileExplorer);

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

      // Create hard drive window and manager
      const hardDriveWindow = new HardDriveWindow();
      hardDriveWindow.create();
      this.windowManager.register(hardDriveWindow);

      this.diskManager.fileExplorer = this.fileExplorer;

      this.hardDriveManager = new HardDriveManager(this.wasmModule);
      this.hardDriveManager.fileExplorer = this.fileExplorer;
      this.hardDriveManager.init();


      const cpuWindow = new CPUDebuggerWindow(this.wasmModule, () => this.isRunning());
      cpuWindow.create();
      this.windowManager.register(cpuWindow);
      this.cpuDebuggerWindow = cpuWindow;

      const ruleBuilderWindow = new RuleBuilderWindow();
      ruleBuilderWindow.create();
      this.windowManager.register(ruleBuilderWindow);

      ruleBuilderWindow.onApply = (addr, condStr, rules) => {
        cpuWindow.bpManager.setCondition(addr, condStr);
        cpuWindow.bpManager.setConditionRules(addr, rules);
      };
      cpuWindow.setRuleBuilder(ruleBuilderWindow);

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

      const mouseCardWindow = new MouseCardWindow(this.wasmModule);
      mouseCardWindow.create();
      this.windowManager.register(mouseCardWindow);

      const tracePanelWindow = new TracePanelWindow(this.wasmModule);
      tracePanelWindow.create();
      this.windowManager.register(tracePanelWindow);

      const basicProgramWindow = new BasicProgramWindow(
        this.wasmModule,
        this.inputHandler,
        () => this.isRunning(),
      );
      basicProgramWindow.create();
      this.windowManager.register(basicProgramWindow);
      this.basicProgramWindow = basicProgramWindow;

      const assemblerWindow = new AssemblerEditorWindow(this.wasmModule, cpuWindow.bpManager, () => this.isRunning());
      assemblerWindow.create();
      this.windowManager.register(assemblerWindow);

      // Slot configuration window
      const slotConfigWindow = new SlotConfigurationWindow(
        this.wasmModule,
        () => {
          this.wasmModule._reset();
          this.updateMouseHandlerState();
          if (this.hardDriveManager) {
            this.hardDriveManager.syncWithEmulatorState();
          }
        },
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

      // Set up documentation window
      this.documentationWindow = new DocumentationWindow();
      this.documentationWindow.create();
      this.windowManager.register(this.documentationWindow);

      // Load saved window states (must be after all windows are registered)
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
      this.textSelection = new TextSelection(canvas, this.wasmModule, this.renderer);

      // Wire textSelection into screen window
      this.screenWindow.textSelection = this.textSelection;

      // Set up reminder controller
      this.reminderController = new ReminderController();

      // Apply display settings
      this.displaySettings.applyAllSettings();

      // Always show ScreenWindow and attach canvas
      this.screenWindow.show();
      this.screenWindow.attachCanvas();

      // Position/size windows for first-time users (no saved state)
      this.windowManager.applyDefaultLayout(DEFAULT_LAYOUT);

      // Set up window switcher (Ctrl+`)
      this.windowSwitcher = new WindowSwitcher(this.windowManager);
      this.windowSwitcher.create();

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
        inputHandler: this.inputHandler,
        themeManager: this.themeManager,
        windowSwitcher: this.windowSwitcher,
      });
      this.uiController.init();

      // Set up state manager
      this.stateManager = new StateManager({
        emulator: this,
        wasmModule: this.wasmModule,
        uiController: this.uiController,
        diskManager: this.diskManager,
        reminderController: this.reminderController,
        cpuDebuggerWindow: cpuWindow,
        basicProgramWindow: this.basicProgramWindow,
      });
      this.stateManager.init();

      // Save States window
      const saveStatesWindow = new SaveStatesWindow(this.stateManager, this.uiController);
      saveStatesWindow.create();
      this.windowManager.register(saveStatesWindow);

      // Keep autosave row current when the window is open
      this.stateManager.onAutosave = () => {
        if (saveStatesWindow.isVisible) {
          saveStatesWindow.refreshAutosaveRow();
        }
      };

      // Enable mouse handler if a mouse card is configured
      this.updateMouseHandlerState();

      // Start render loop
      this.startRenderLoop();

      this.showLoading(false);
      this.reminderController.showPowerReminder(true);

      console.log("Apple //e Emulator initialized");
    } catch (error) {
      console.error("Failed to initialize emulator:", error);
      this.showLoading(false);
      showToast("Failed to initialize emulator: " + error.message, "error");
    }
  }

  /**
   * Check slot configuration and enable/disable mouse handler accordingly
   */
  updateMouseHandlerState() {
    if (!this.mouseHandler || !this.wasmModule._getSlotCard) return;
    let mousePresent = false;
    for (let slot = 1; slot <= 7; slot++) {
      const ptr = this.wasmModule._getSlotCard(slot);
      if (ptr) {
        const name = this.wasmModule.UTF8ToString(ptr);
        if (name === "mouse") {
          mousePresent = true;
          break;
        }
      }
    }
    if (mousePresent) {
      this.mouseHandler.enable();
    } else {
      this.mouseHandler.disable();
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

    if (this.inputHandler) this.inputHandler.cancelPaste();
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
      this.diskManager.drivesWindowVisible = this.windowManager.isWindowVisible('disk-drives');
      this.diskManager.updateLEDs();
      if (this.hardDriveManager) {
        this.hardDriveManager.updateLEDs();
      }

      // Beam crosshair overlay — only when CPU debugger is open and CPU is paused
      const isPaused = this.running && this.wasmModule._isPaused();
      if (isPaused && this.cpuDebuggerWindow && this.cpuDebuggerWindow.isVisible) {
        const scanline = this.wasmModule._getBeamScanline();
        const hPos = this.wasmModule._getBeamHPos();
        // Map beam Y to center of scanline band (0–191 visible, ≥192 is VBL)
        this.renderer.setParam("beamY", scanline < 192 ? (scanline + 0.5) / 192.0 : -1.0);
        // Map beam X to leading edge of column (hPos 25–64 → columns 0–39)
        this.renderer.setParam("beamX", hPos >= 25 ? (hPos - 25) / 40.0 : -1.0);
      } else {
        this.renderer.setParam("beamY", -1.0);
        this.renderer.setParam("beamX", -1.0);
      }

      if (!this.running || isPaused) {
        // Force a complete re-render of the framebuffer from current video
        // memory so the display shows the full screen after stepping/pausing,
        // not a partial frame based on beam position.
        if (isPaused) {
          this.wasmModule._forceRenderFrame();
          this.renderFrame();
        } else {
          this.renderer.draw();
        }
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

    if (this.themeManager) {
      this.themeManager.destroy();
      this.themeManager = null;
    }

    this.renderer = null;
    this.diskManager = null;
    this.hardDriveManager = null;
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

// Register service worker for offline support only when installed as PWA
const isInstalled = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
if ("serviceWorker" in navigator && isInstalled) {
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
    background: var(--glass-bg-solid);
    backdrop-filter: blur(12px);
    border: 1px solid var(--glass-border);
    border-radius: 8px;
    padding: 20px 30px;
    z-index: 10000;
    color: var(--text-primary);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    font-size: 14px;
    box-shadow: var(--shadow-lg);
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
