/*
 * agent-tools.js - Frontend tool implementations for AG-UI protocol
 *
 * Written by
 *  Shawn Bullock <shawn@agenticexpert.ai>
 */

import { windowTools } from "./window-tools.js";
import { basicProgramTools } from "./basic-program-tools.js";
import { assemblerTools } from "./assembler-tools.js";
import { fileExplorerTools } from "./file-explorer-tools.js";
import { mainTools } from "./main-tools.js";
import { diskTools } from "./disk-tools.js";
import { smartportTools } from "./smartport-tools.js";
import { slotTools } from "./slot-tools.js";
import { agentVersionTools } from "./agent-version-tools.js";

/**
 * Registry of available frontend tools
 * Tools are functions that execute in the browser and return results
 */
const AGENT_TOOLS = {
  // Import feature-specific tools
  ...windowTools,
  ...basicProgramTools,
  ...assemblerTools,
  ...fileExplorerTools,
  ...mainTools,
  ...diskTools,
  ...smartportTools,
  ...slotTools,
  ...agentVersionTools,
  /**
   * Generic command wrapper (from MCP server)
   */
  emma_command: async (args) => {
    const { command, params = {} } = args;
    if (!command) {
      throw new Error("command parameter is required");
    }
    // Recursively execute the actual tool
    return await executeAgentTool(command, params);
  },

  /**
   * Execute a command in the emulator
   */
  executeCommand: async (args) => {
    const { command, params = {} } = args;

    if (!command) {
      throw new Error("command parameter is required");
    }

    // Route commands to appropriate subsystems
    switch (command) {
      case "power":
        return await handlePowerCommand(params);

      case "reset":
        return await handleResetCommand(params);

      case "insertDisk":
        return await handleInsertDiskCommand(params);

      case "ejectDisk":
        return await handleEjectDiskCommand(params);

      case "loadBASICProgram":
        return await handleLoadBASICCommand(params);

      case "typeText":
        return await handleTypeTextCommand(params);

      default:
        throw new Error(`Unknown command: ${command}`);
    }
  },

  /**
   * Get emulator state
   */
  getState: async (args) => {
    const wasmModule = window.emulator?.wasmModule;
    if (!wasmModule) {
      throw new Error("Emulator not available");
    }

    return {
      success: true,
      state: {
        running: window.emulator.running,
        paused: await wasmModule._isPaused(),
        pc: await wasmModule._getPC(),
        a: await wasmModule._getA(),
        x: await wasmModule._getX(),
        y: await wasmModule._getY(),
        sp: await wasmModule._getSP(),
        cycles: await wasmModule._getTotalCycles(),
      },
    };
  },

  /**
   * Set emulator state
   */
  setState: async (args) => {
    const wasmModule = window.emulator?.wasmModule;
    if (!wasmModule) {
      throw new Error("Emulator not available");
    }

    const { pc, a, x, y, sp } = args;

    if (pc !== undefined) wasmModule._setRegPC(pc);
    if (a !== undefined) wasmModule._setRegA(a);
    if (x !== undefined) wasmModule._setRegX(x);
    if (y !== undefined) wasmModule._setRegY(y);
    if (sp !== undefined) wasmModule._setRegSP(sp);

    return {
      success: true,
      message: "State updated",
    };
  },
};

/**
 * Execute a tool by name
 */
export async function executeAgentTool(toolName, args) {
  const tool = AGENT_TOOLS[toolName];

  if (!tool) {
    throw new Error(`Unknown tool: ${toolName}`);
  }

  return await tool(args);
}

/**
 * Get list of available tools (for MCP server registration)
 */
export function getAvailableTools() {
  return Object.keys(AGENT_TOOLS);
}

// ========================================
// Command Handlers
// ========================================

async function handlePowerCommand(params) {
  const emulator = window.emulator;
  if (!emulator) {
    throw new Error("Emulator not available");
  }

  const { action = "toggle" } = params;

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
}

async function handleResetCommand(params) {
  const wasmModule = window.emulator?.wasmModule;
  if (!wasmModule) {
    throw new Error("Emulator not available");
  }

  const { warm = false } = params;

  if (warm) {
    wasmModule._warmReset();
  } else {
    wasmModule._reset();
  }

  return {
    success: true,
    resetType: warm ? "warm" : "cold",
    message: `${warm ? "Warm" : "Cold"} reset executed`,
  };
}

async function handleInsertDiskCommand(params) {
  const { drive, url, filename } = params;

  if (drive === undefined) {
    throw new Error("drive parameter is required (0 or 1)");
  }

  if (!url) {
    throw new Error("url parameter is required");
  }

  // Fetch disk image
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch disk: ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);

  // Insert into emulator
  const diskManager = window.emulator?.diskManager;
  if (!diskManager) {
    throw new Error("Disk manager not available");
  }

  await diskManager.insertDisk(drive, uint8Array, filename || url);

  return {
    success: true,
    drive: drive,
    filename: filename || url,
    size: uint8Array.length,
    message: `Disk inserted into drive ${drive}`,
  };
}

async function handleEjectDiskCommand(params) {
  const { drive } = params;

  if (drive === undefined) {
    throw new Error("drive parameter is required (0 or 1)");
  }

  const diskManager = window.emulator?.diskManager;
  if (!diskManager) {
    throw new Error("Disk manager not available");
  }

  diskManager.ejectDisk(drive);

  return {
    success: true,
    drive: drive,
    message: `Disk ejected from drive ${drive}`,
  };
}

async function handleLoadBASICCommand(params) {
  const { program } = params;

  if (!program) {
    throw new Error("program parameter is required");
  }

  // Type program into emulator
  // This would need to be implemented via the input handler
  throw new Error("loadBASICProgram not yet implemented");
}

async function handleTypeTextCommand(params) {
  const { text } = params;

  if (!text) {
    throw new Error("text parameter is required");
  }

  const inputHandler = window.emulator?.inputHandler;
  if (!inputHandler) {
    throw new Error("Input handler not available");
  }

  return new Promise((resolve) => {
    inputHandler.queueTextInput(text, {
      onComplete: () => {
        resolve({
          success: true,
          length: text.length,
          message: `Typed ${text.length} characters`,
        });
      },
    });
  });
}
