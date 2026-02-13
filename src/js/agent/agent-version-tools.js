/*
 * agent-version-tools.js - Agent version and compatibility tools
 *
 * Written by
 *  Shawn Bullock <shawn@agenticexpert.ai>
 */

/**
 * Parse semantic version string (e.g., "1.0.2") into comparable parts
 * @param {string} version - Version string in semver format
 * @returns {Object} Version parts {major, minor, patch}
 */
function parseVersion(version) {
  const parts = version.split('.').map(p => parseInt(p, 10));
  if (parts.length !== 3 || parts.some(isNaN)) {
    throw new Error(`Invalid version format: ${version}`);
  }
  return {
    major: parts[0],
    minor: parts[1],
    patch: parts[2]
  };
}

/**
 * Compare two semantic versions
 * @param {string} version1 - First version
 * @param {string} version2 - Second version
 * @returns {number} -1 if v1 < v2, 0 if equal, 1 if v1 > v2
 */
function compareVersions(version1, version2) {
  const v1 = parseVersion(version1);
  const v2 = parseVersion(version2);

  if (v1.major !== v2.major) return v1.major - v2.major;
  if (v1.minor !== v2.minor) return v1.minor - v2.minor;
  return v1.patch - v2.patch;
}

export const agentVersionTools = {
  /**
   * Check if the currently running agent is compatible with the app
   * Returns version info and compatibility status
   */
  checkAgentCompatibility: async (args) => {
    const { minVersion = "1.0.5" } = args;

    // Get agentManager from global window object
    const agentManager = window.emulator?.agentManager;
    if (!agentManager) {
      return {
        success: false,
        error: "AgentManager not available",
        compatible: false
      };
    }

    try {
      // Call the MCP server's get_version tool
      const versionInfo = await agentManager.callMCPTool("get_version", {});

      if (!versionInfo.success) {
        return {
          success: false,
          error: "Failed to get agent version",
          compatible: false
        };
      }

      // Parse versions into numeric parts
      const agentVersionParsed = parseVersion(versionInfo.version);
      const minVersionParsed = parseVersion(minVersion);

      // Compare versions
      const comparison = compareVersions(versionInfo.version, minVersion);
      const compatible = comparison >= 0;

      return {
        success: true,
        agent: {
          name: versionInfo.name,
          version: versionInfo.version,
          versionNumeric: agentVersionParsed,
          description: versionInfo.description
        },
        required: {
          minVersion: minVersion,
          minVersionNumeric: minVersionParsed
        },
        compatible: compatible,
        comparison: comparison, // -1 if agent < required, 0 if equal, 1 if agent > required
        message: compatible
          ? `Agent version ${versionInfo.version} is compatible (>= ${minVersion})`
          : `Agent version ${versionInfo.version} is NOT compatible (requires >= ${minVersion})`
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        compatible: false
      };
    }
  },

  /**
   * Get agent version information
   */
  getAgentVersion: async (args) => {
    // Get agentManager from global window object
    const agentManager = window.emulator?.agentManager;
    if (!agentManager) {
      return {
        success: false,
        error: "AgentManager not available"
      };
    }

    try {
      // Call the MCP server's get_version tool
      const versionInfo = await agentManager.callMCPTool("get_version", {});
      return versionInfo;

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
};
