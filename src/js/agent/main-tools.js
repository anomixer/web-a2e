/*
 * main-tools.js - Main emulator control tools
 *
 * Written by
 *  Shawn Bullock <shawn@agenticexpert.ai>
 */

export const mainTools = {
  /**
   * Power control
   */
  emulatorPower: async (args) => {
    const { action = "toggle" } = args;

    const emulator = window.emulator;
    if (!emulator) {
      throw new Error("Emulator not available");
    }

    if (action === "on" && !emulator.running) {
      emulator.start();
    } else if (action === "off" && emulator.running) {
      emulator.stop();
    } else if (action === "toggle") {
      if (emulator.running) {
        emulator.stop();
      } else {
        emulator.start();
      }
    }

    return {
      success: true,
      running: emulator.running,
      message: `Emulator is now ${emulator.running ? "running" : "stopped"}`,
    };
  },

  /**
   * Ctrl-Reset (warm reset)
   */
  emulatorCtrlReset: async (args) => {
    const wasmModule = window.emulator?.wasmModule;
    if (!wasmModule) {
      throw new Error("Emulator not available");
    }

    wasmModule._warmReset();

    return {
      success: true,
      message: "Ctrl-Reset executed (warm reset)",
    };
  },

  /**
   * Reboot (cold reset)
   */
  emulatorReboot: async (args) => {
    const wasmModule = window.emulator?.wasmModule;
    if (!wasmModule) {
      throw new Error("Emulator not available");
    }

    wasmModule._reset();

    return {
      success: true,
      message: "Reboot executed (cold reset)",
    };
  },
};
