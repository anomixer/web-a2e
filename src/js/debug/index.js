// Debug window module exports
export { BaseWindow } from "../windows/base-window.js";
export { WindowManager } from "../windows/window-manager.js";
export { CPUDebuggerWindow } from "./cpu-debugger-window.js";
export { SoftSwitchWindow } from "./soft-switch-window.js";
export { MemoryBrowserWindow } from "./memory-browser-window.js";
export { MemoryHeatMapWindow } from "./memory-heat-map-window.js";
export { MemoryMapWindow } from "./memory-map-window.js";
export { StackViewerWindow } from "./stack-viewer-window.js";
export { ZeroPageWatchWindow } from "./zero-page-watch-window.js";
export { MockingboardWindow } from "./mockingboard-window.js";
export { BasicProgramWindow } from "./basic-program-window.js";

// Re-export UI windows for backwards compatibility
export { DisplaySettingsWindow } from "../ui/display-settings-window.js";
export { JoystickWindow } from "../ui/joystick-window.js";
export { SlotConfigurationWindow } from "../ui/slot-configuration-window.js";
