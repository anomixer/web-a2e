/*
 * basic-program-tools.js - BASIC program window tools
 *
 * Written by
 *  Shawn Bullock <shawn@agenticexpert.ai>
 */

export const basicProgramTools = {
  /**
   * Load BASIC program from emulator memory into editor
   */
  basicProgramLoadFromMemory: async (args) => {
    const windowManager = window.emulator?.windowManager;
    if (!windowManager) {
      throw new Error("Window manager not available");
    }

    const basicWindow = windowManager.getWindow("basic-program");
    if (!basicWindow) {
      throw new Error("BASIC program window not found");
    }

    basicWindow.loadFromMemory();

    return {
      success: true,
      message: "BASIC program loaded from memory into editor",
    };
  },

  /**
   * Load BASIC program from editor into emulator memory
   */
  basicProgramLoadIntoEmulator: async (args) => {
    const windowManager = window.emulator?.windowManager;
    if (!windowManager) {
      throw new Error("Window manager not available");
    }

    const basicWindow = windowManager.getWindow("basic-program");
    if (!basicWindow) {
      throw new Error("BASIC program window not found");
    }

    basicWindow.loadIntoMemory();

    return {
      success: true,
      message: "BASIC program loaded from editor into emulator memory",
    };
  },

  /**
   * Run BASIC program
   */
  basicProgramRun: async (args) => {
    const windowManager = window.emulator?.windowManager;
    if (!windowManager) {
      throw new Error("Window manager not available");
    }

    const basicWindow = windowManager.getWindow("basic-program");
    if (!basicWindow) {
      throw new Error("BASIC program window not found");
    }

    basicWindow.handleRun();

    return {
      success: true,
      message: "BASIC program execution started",
    };
  },

  /**
   * Pause BASIC program execution
   */
  basicProgramPause: async (args) => {
    const windowManager = window.emulator?.windowManager;
    if (!windowManager) {
      throw new Error("Window manager not available");
    }

    const basicWindow = windowManager.getWindow("basic-program");
    if (!basicWindow) {
      throw new Error("BASIC program window not found");
    }

    basicWindow.handlePause();

    return {
      success: true,
      message: "BASIC program execution paused",
    };
  },

  /**
   * Clear BASIC program editor
   */
  basicProgramClear: async (args) => {
    const windowManager = window.emulator?.windowManager;
    if (!windowManager) {
      throw new Error("Window manager not available");
    }

    const basicWindow = windowManager.getWindow("basic-program");
    if (!basicWindow) {
      throw new Error("BASIC program window not found");
    }

    if (basicWindow.textarea) {
      basicWindow.textarea.value = "";
      basicWindow.updateGutter();
      basicWindow.updateHighlighting();
      basicWindow.updateStats();
    }

    return {
      success: true,
      message: "BASIC program editor cleared",
    };
  },

  /**
   * Renumber BASIC program lines
   */
  basicProgramRenumber: async (args) => {
    const windowManager = window.emulator?.windowManager;
    if (!windowManager) {
      throw new Error("Window manager not available");
    }

    const basicWindow = windowManager.getWindow("basic-program");
    if (!basicWindow) {
      throw new Error("BASIC program window not found");
    }

    basicWindow.renumberProgram();

    return {
      success: true,
      message: "BASIC program renumbered",
    };
  },

  /**
   * Format BASIC program code
   */
  basicProgramFormat: async (args) => {
    const windowManager = window.emulator?.windowManager;
    if (!windowManager) {
      throw new Error("Window manager not available");
    }

    const basicWindow = windowManager.getWindow("basic-program");
    if (!basicWindow) {
      throw new Error("BASIC program window not found");
    }

    basicWindow.autoFormatCode();

    return {
      success: true,
      message: "BASIC program formatted",
    };
  },

  /**
   * Get BASIC program line and character count
   */
  basicProgramLineCount: async (args) => {
    const windowManager = window.emulator?.windowManager;
    if (!windowManager) {
      throw new Error("Window manager not available");
    }

    const basicWindow = windowManager.getWindow("basic-program");
    if (!basicWindow) {
      throw new Error("BASIC program window not found");
    }

    const text = basicWindow.textarea ? basicWindow.textarea.value : "";
    const lines = text ? text.split(/\r?\n/).filter((l) => l.trim()).length : 0;
    const chars = text.length;

    return {
      success: true,
      lines: lines,
      chars: chars,
      message: `${lines} lines, ${chars} characters`,
    };
  },

  /**
   * Get current BASIC program text
   */
  basicProgramGet: async (args) => {
    const windowManager = window.emulator?.windowManager;
    if (!windowManager) {
      throw new Error("Window manager not available");
    }

    const basicWindow = windowManager.getWindow("basic-program");
    if (!basicWindow) {
      throw new Error("BASIC program window not found");
    }

    const text = basicWindow.textarea ? basicWindow.textarea.value : "";

    return {
      success: true,
      program: text,
      message: "BASIC program retrieved",
    };
  },

  /**
   * Edit BASIC program (find and replace text)
   */
  basicProgramEdit: async (args) => {
    const { oldText, newText } = args;

    if (oldText === undefined) {
      throw new Error("oldText parameter is required");
    }

    if (newText === undefined) {
      throw new Error("newText parameter is required");
    }

    const windowManager = window.emulator?.windowManager;
    if (!windowManager) {
      throw new Error("Window manager not available");
    }

    const basicWindow = windowManager.getWindow("basic-program");
    if (!basicWindow) {
      throw new Error("BASIC program window not found");
    }

    if (basicWindow.textarea) {
      const currentText = basicWindow.textarea.value;
      const updatedText = currentText.replace(oldText, newText);
      basicWindow.textarea.value = updatedText;
      basicWindow.updateGutter();
      basicWindow.updateHighlighting();
      basicWindow.updateStats();
    }

    return {
      success: true,
      message: "BASIC program edited",
    };
  },

  /**
   * Set BASIC program (replace entire content)
   */
  basicProgramSet: async (args) => {
    const { program } = args;

    if (program === undefined) {
      throw new Error("program parameter is required");
    }

    const windowManager = window.emulator?.windowManager;
    if (!windowManager) {
      throw new Error("Window manager not available");
    }

    const basicWindow = windowManager.getWindow("basic-program");
    if (!basicWindow) {
      throw new Error("BASIC program window not found");
    }

    if (basicWindow.textarea) {
      basicWindow.textarea.value = program;
      basicWindow.updateGutter();
      basicWindow.updateHighlighting();
      basicWindow.updateStats();
    }

    return {
      success: true,
      message: "BASIC program set",
    };
  },
};
