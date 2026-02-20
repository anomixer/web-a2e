/*
 * agent-manager.js - AG-UI protocol client for MCP server communication
 *
 * Written by
 *  Shawn Bullock <shawn@agenticexpert.ai>
 */

import { executeAgentTool } from "./agent-tools.js";
import { showConfirm } from "../ui/confirm.js";
import { EMULATOR_NAMES } from "./emulator-names-list.js";

const EMULATOR_NAME_KEY = "agent-emulator-name";

/**
 * Manages connection to MCP server via AG-UI protocol
 */
export class AgentManager {
  constructor() {
    this.serverUrl = "http://localhost:3033";
    this.serverUrlHttps = "https://localhost:3033";
    this.currentProtocol = "http"; // Will be auto-detected
    this.eventSource = null;
    this.connected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 36; // 3 minutes at 5 second intervals
    this.reconnectDelay = 5000; // 5 seconds
    this.onConnectionChange = null;
    this.onServerAvailable = null; // Callback when heartbeat detected
    this.onServerUnavailable = null; // Callback when server goes away

    // Tool call state
    this.activeToolCalls = new Map();

    // Emulator name
    this._pendingName = null; // Name being used for the current/next connection
    this._triedNames = new Set(); // Names tried in the current connect session

    // Heartbeat polling
    this.heartbeatInterval = null;
    this.heartbeatCheckInterval = 15000; // 15 seconds
    this.serverAvailable = false;
    this.reconnectOnAvailable = false; // Auto-reconnect when server comes back (port reclaim)

    // Reconnection timeout
    this.reconnectTimeout = null;
    this.reconnectStartTime = null;
    this.maxReconnectDuration = 3 * 60 * 1000; // 3 minutes
  }

  /**
   * Start heartbeat polling to detect when MCP server becomes available
   */
  startHeartbeatPolling() {
    if (this.heartbeatInterval) {
      return; // Already polling
    }

    console.log("[AgentManager] Starting heartbeat polling");

    // Initial check
    this._checkHeartbeat();

    // Then check every 15 seconds
    this.heartbeatInterval = setInterval(() => {
      this._checkHeartbeat();
    }, this.heartbeatCheckInterval);
  }

  /**
   * Stop heartbeat polling
   */
  stopHeartbeatPolling() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
      console.log("[AgentManager] Stopped heartbeat polling");
    }
  }

  /**
   * Check if MCP server is available via heartbeat endpoint
   */
  async _checkHeartbeat() {
    // Try HTTPS first, then HTTP
    const protocols = [
      { url: this.serverUrlHttps, protocol: "https" },
      { url: this.serverUrl, protocol: "http" },
    ];

    for (const { url, protocol } of protocols) {
      try {
        const response = await fetch(`${url}/heartbeat`, {
          method: "GET",
          signal: AbortSignal.timeout(2000), // 2 second timeout
        });

        if (response.ok) {
          const wasAvailable = this.serverAvailable;
          this.serverAvailable = true;
          this.currentProtocol = protocol;
          this.serverUrl = url;

          // Only log when server becomes available, not on every heartbeat
          if (!wasAvailable) {
            console.log(`[AgentManager] MCP server available at ${url}`);
            if (this.onServerAvailable) {
              this.onServerAvailable();
            }
            // Auto-reconnect if this was triggered by a port reclaim
            if (this.reconnectOnAvailable) {
              this.reconnectOnAvailable = false;
              console.log("[AgentManager] Auto-reconnecting after port reclaim");
              this.connect();
            }
          }

          return; // Success, stop trying
        }
      } catch (error) {
        // Server not reachable on this protocol, try next
        continue;
      }
    }

    // If we get here, server is not available on either protocol
    const wasAvailable = this.serverAvailable;
    this.serverAvailable = false;

    if (wasAvailable && this.onServerUnavailable) {
      console.log("[AgentManager] MCP server no longer available");
      this.onServerUnavailable();
    }
  }

  /**
   * Connect to MCP server SSE stream
   * @param {string|null} preferredName - Preferred emulator name; falls back to localStorage then random pool
   */
  async connect(preferredName = null) {
    // Check if already connected (EventSource is OPEN)
    if (this.eventSource && this.eventSource.readyState === EventSource.OPEN) {
      console.warn("[AgentManager] Already connected");
      return;
    }

    // Clean up any existing EventSource that's not OPEN (stale connection)
    if (this.eventSource) {
      console.log("[AgentManager] Cleaning up stale EventSource");
      this.eventSource.close();
      this.eventSource = null;
    }

    // Detect current domain (where the emulator is running)
    const domain = `${window.location.protocol}//${window.location.host}`;

    // Resolve emulator name: prefer arg → localStorage (if not already tried) → random from pool
    const storedName = sessionStorage.getItem(EMULATOR_NAME_KEY);
    const name = preferredName
      || (storedName && !this._triedNames.has(storedName) ? storedName : null)
      || EMULATOR_NAMES.filter(n => !this._triedNames.has(n))[Math.floor(Math.random() * Math.max(1, EMULATOR_NAMES.filter(n => !this._triedNames.has(n)).length))]
      || EMULATOR_NAMES[Math.floor(Math.random() * EMULATOR_NAMES.length)];
    this._pendingName = name;

    // Build base query string used for both preflight and EventSource
    const eventsQuery = `name=${encodeURIComponent(name)}&domain=${encodeURIComponent(domain)}`;

    console.log(`[AgentManager] Connecting to ${this.serverUrl}/events as "${name}"`);
    console.log(`[AgentManager] Emulator domain: ${domain}`);

    // Check if connection is allowed (detect 409 for single-client mode)
    try {
      const testResponse = await fetch(`${this.serverUrl}/events?${eventsQuery}`, {
        method: "HEAD",
        signal: AbortSignal.timeout(2000),
      });

      // If 409, another client is connected
      if (testResponse.status === 409) {
        const message = await testResponse.text();
        console.warn(`[AgentManager] ${message}`);

        // Show confirm dialog with option to disconnect other client
        const shouldDisconnect = await this._showConnectionConflictDialog(message);

        if (shouldDisconnect) {
          // User chose to disconnect other client
          console.log("[AgentManager] Disconnecting other client and retrying...");
          try {
            await this.callMCPTool("disconnect_clients", {});
            // Retry connection after brief delay
            setTimeout(() => this.connect(), 500);
          } catch (error) {
            console.error("[AgentManager] Failed to disconnect other client:", error);
          }
        } else {
          // User chose not to connect
          console.log("[AgentManager] Connection cancelled by user");
        }
        return;
      }
    } catch (error) {
      // HEAD request not supported or other error, proceed with EventSource anyway
      console.log("[AgentManager] Connection check failed, proceeding with EventSource:", error.message);
    }

    // Check agent version compatibility before connecting
    try {
      const versionCheck = await this._checkVersionCompatibility();
      if (!versionCheck.compatible) {
        console.warn(`[AgentManager] Agent version ${versionCheck.agent.version} is incompatible (requires >= ${versionCheck.required.minVersion})`);

        // Show warning dialog and prevent connection
        await this._showVersionIncompatibleDialog(versionCheck);
        console.log("[AgentManager] Connection blocked due to version incompatibility");
        return;
      } else {
        console.log(`[AgentManager] Agent version ${versionCheck.agent.version} is compatible`);
      }
    } catch (error) {
      console.warn("[AgentManager] Version check failed, proceeding with connection:", error.message);
    }

    try {
      // Send name + domain as query params so MCP server can assign name and fetch llms.txt
      this.eventSource = new EventSource(`${this.serverUrl}/events?${eventsQuery}`);

      this.eventSource.onopen = () => {
        console.log(`[AgentManager] SSE stream open, awaiting CONNECT_ACK as "${this._pendingName}"`);
      };

      this.eventSource.onmessage = (e) => {
        this._handleEvent(e);
      };

      this.eventSource.onerror = (error) => {
        console.error("[AgentManager] Connection error:", error);
        this.connected = false;
        this._handleConnectionError();
        if (this.onConnectionChange) {
          this.onConnectionChange(false);
        }
      };

    } catch (error) {
      console.error("[AgentManager] Failed to create EventSource:", error);
      this._scheduleReconnect();
    }
  }

  /**
   * Show dialog when connection is rejected due to another client being connected
   * @param {string} message - The rejection message from server
   * @returns {Promise<boolean>} True if user wants to disconnect other client, false otherwise
   */
  async _showConnectionConflictDialog(message) {
    return await showConfirm(
      message + "\n\nWould you like to disconnect the other client and connect?",
      "Disconnect and Connect"
    );
  }

  /**
   * Check if agent version is compatible with app requirements
   * @returns {Promise<Object>} Version compatibility check result
   */
  async _checkVersionCompatibility() {
    const versionInfo = await this.callMCPTool("get_version", {});

    if (!versionInfo.success) {
      throw new Error("Failed to get agent version");
    }

    // Parse versions
    const parseVersion = (version) => {
      const parts = version.split('.').map(p => parseInt(p, 10));
      if (parts.length !== 3 || parts.some(isNaN)) {
        throw new Error(`Invalid version format: ${version}`);
      }
      return { major: parts[0], minor: parts[1], patch: parts[2] };
    };

    const minVersion = "1.0.5"; // Required minimum version
    const agentVersion = parseVersion(versionInfo.version);
    const requiredVersion = parseVersion(minVersion);

    // Compare versions
    const compareVersions = (v1, v2) => {
      if (v1.major !== v2.major) return v1.major - v2.major;
      if (v1.minor !== v2.minor) return v1.minor - v2.minor;
      return v1.patch - v2.patch;
    };

    const comparison = compareVersions(agentVersion, requiredVersion);
    const compatible = comparison >= 0;

    return {
      success: true,
      agent: {
        name: versionInfo.name,
        version: versionInfo.version,
        versionNumeric: agentVersion
      },
      required: {
        minVersion: minVersion,
        minVersionNumeric: requiredVersion
      },
      compatible: compatible,
      comparison: comparison
    };
  }

  /**
   * Show dialog when agent version is incompatible
   * @param {Object} versionCheck - Version check result
   * @returns {Promise<boolean>} Always returns false (connection not allowed)
   */
  async _showVersionIncompatibleDialog(versionCheck) {
    await showConfirm("Agent out of date. Please update the Agent to latest version to continue.", "OK");
    return false; // Never allow connection with incompatible version
  }

  /**
   * Disconnect from MCP server and abort any reconnection attempts
   */
  disconnect() {
    if (this.eventSource) {
      console.log("[AgentManager] Disconnecting from MCP server");
      this.eventSource.close();
      this.eventSource = null;
      this.connected = false;
      if (this.onConnectionChange) {
        this.onConnectionChange(false);
      }
    }

    // Clear reconnection timeout if active
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    // Reset reconnection state completely
    this.reconnectAttempts = 0;
    this.reconnectStartTime = null;
    this._triedNames.clear();
  }

  /**
   * Handle incoming AG-UI event
   */
  _handleEvent(e) {
    try {
      const event = JSON.parse(e.data);

      // Route event to appropriate handler
      switch (event.type) {
        case "CONNECT_ACK":
          this._handleConnectAck(event);
          break;
        case "TOOL_CALL_START":
          this._handleToolCallStart(event);
          break;
        case "TOOL_CALL_ARGS":
          this._handleToolCallArgs(event);
          break;
        case "TOOL_CALL_END":
          this._handleToolCallEnd(event);
          break;
        case "TEXT_MESSAGE_START":
        case "TEXT_MESSAGE_CONTENT":
        case "TEXT_MESSAGE_END":
          this._handleTextMessage(event);
          break;
        case "RUN_STARTED":
        case "RUN_FINISHED":
        case "RUN_ERROR":
          this._handleRunEvent(event);
          break;
        case "DISCONNECT":
          this._handleGracefulDisconnect(event);
          break;
        default:
          console.log("[AgentManager] Unhandled event type:", event.type);
      }
    } catch (error) {
      console.error("[AgentManager] Error parsing event:", error);
    }
  }

  /**
   * Handle CONNECT_ACK — server accepted or rejected the name
   */
  _handleConnectAck(event) {
    if (event.accepted) {
      console.log(`[AgentManager] Connected as "${event.name}"${event.isDefault ? " (default)" : ""}`);
      this.connected = true;
      this.reconnectAttempts = 0;
      this.reconnectStartTime = null;
      this._triedNames.clear();

      // Persist accepted name for future reconnects
      sessionStorage.setItem(EMULATOR_NAME_KEY, event.name);

      // Stop heartbeat polling while connected
      this.stopHeartbeatPolling();

      if (this.onConnectionChange) {
        this.onConnectionChange(true, event.name);
      }
    } else {
      // Only add to _triedNames when explicitly rejected by the server
      this._triedNames.add(this._pendingName);
      console.warn(`[AgentManager] Name "${this._pendingName}" rejected (${event.reason}), retrying with new name`);
      this._retryWithNewName();
    }
  }

  /**
   * Retry connection with a different name from the pool
   */
  _retryWithNewName() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    const untried = EMULATOR_NAMES.filter(n => !this._triedNames.has(n));

    if (untried.length === 0) {
      console.error("[AgentManager] All pool names exhausted — cannot connect");
      this._triedNames.clear();
      if (this.onConnectionChange) {
        this.onConnectionChange(false);
      }
      return;
    }

    const newName = untried[Math.floor(Math.random() * untried.length)];
    setTimeout(() => this.connect(newName), 200);
  }

  /**
   * Handle TOOL_CALL_START event
   */
  _handleToolCallStart(event) {
    const { tool_call_id, tool_call_name } = event;

    console.log(`[AgentManager] Tool call started: ${tool_call_name} (${tool_call_id})`);

    this.activeToolCalls.set(tool_call_id, {
      name: tool_call_name,
      argsBuffer: "",
      startTime: Date.now(),
    });
  }

  /**
   * Handle TOOL_CALL_ARGS event (streaming arguments)
   */
  _handleToolCallArgs(event) {
    const { tool_call_id, delta } = event;

    const toolCall = this.activeToolCalls.get(tool_call_id);
    if (!toolCall) {
      console.warn(`[AgentManager] Received args for unknown tool call: ${tool_call_id}`);
      return;
    }

    // Accumulate arguments
    toolCall.argsBuffer += delta;
  }

  /**
   * Handle TOOL_CALL_END event (execute tool)
   */
  async _handleToolCallEnd(event) {
    const { tool_call_id } = event;

    const toolCall = this.activeToolCalls.get(tool_call_id);
    if (!toolCall) {
      console.warn(`[AgentManager] Received end for unknown tool call: ${tool_call_id}`);
      return;
    }

    try {
      // Parse accumulated arguments
      const args = toolCall.argsBuffer ? JSON.parse(toolCall.argsBuffer) : {};

      console.log(`[AgentManager] Executing tool: ${toolCall.name}`, args);

      // Execute the tool
      const result = await executeAgentTool(toolCall.name, args);

      // Send result back to MCP server
      await this._sendToolResult(tool_call_id, result);

      console.log(`[AgentManager] Tool completed: ${toolCall.name} (${Date.now() - toolCall.startTime}ms)`);

    } catch (error) {
      console.error(`[AgentManager] Tool execution failed:`, error);

      // Send error result
      await this._sendToolResult(tool_call_id, {
        error: error.message,
        success: false,
      });
    } finally {
      // Clean up
      this.activeToolCalls.delete(tool_call_id);
    }
  }

  /**
   * Handle text message events (optional logging)
   */
  _handleTextMessage(event) {
    // For now, just log text messages
    if (event.type === "TEXT_MESSAGE_CONTENT") {
      console.log(`[AgentManager] Message: ${event.delta}`);
    }
  }

  /**
   * Handle run lifecycle events
   */
  _handleRunEvent(event) {
    console.log(`[AgentManager] ${event.type}:`, event.run_id || event.error || "");
  }

  /**
   * Handle graceful disconnect from server
   */
  _handleGracefulDisconnect(event) {
    console.log(`[AgentManager] Graceful disconnect: ${event.reason}`);

    // Close connection cleanly
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    this.connected = false;

    // Don't trigger reconnection - this was intentional
    this.reconnectStartTime = null;
    this.reconnectAttempts = 0;

    // Update UI to show disconnected (not broken)
    if (this.onConnectionChange) {
      this.onConnectionChange(false);
    }

    // If server is doing a port reclaim, poll for the new instance and auto-reconnect
    if (event.reconnect) {
      console.log("[AgentManager] Port reclaim detected — polling for new server instance");
      this.reconnectOnAvailable = true;
      this.startHeartbeatPolling();
    }
  }

  /**
   * Send TOOL_CALL_RESULT back to MCP server
   */
  async _sendToolResult(toolCallId, content) {
    try {
      const response = await fetch(`${this.serverUrl}/tool-result`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "TOOL_CALL_RESULT",
          tool_call_id: toolCallId,
          content: typeof content === "string" ? content : JSON.stringify(content),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      console.log(`[AgentManager] Tool result sent: ${toolCallId}`);

    } catch (error) {
      console.error("[AgentManager] Failed to send tool result:", error);
      throw error;
    }
  }

  /**
   * Handle connection errors
   */
  _handleConnectionError() {
    // Close EventSource but keep reconnection state
    if (this.eventSource) {
      console.log("[AgentManager] Closing broken connection");
      this.eventSource.close();
      this.eventSource = null;
    }

    // Start reconnection window if not already started
    if (!this.reconnectStartTime) {
      this.reconnectStartTime = Date.now();
      console.log("[AgentManager] Starting 3-minute reconnection window");
    }

    this._scheduleReconnect();
  }

  /**
   * Schedule reconnection attempt
   */
  _scheduleReconnect() {
    // Check if we've exceeded the 3-minute reconnection window
    if (this.reconnectStartTime) {
      const elapsed = Date.now() - this.reconnectStartTime;
      if (elapsed >= this.maxReconnectDuration) {
        console.error("[AgentManager] 3-minute reconnection window expired. Will reconnect when server returns.");
        this.reconnectStartTime = null;
        this.reconnectAttempts = 0;

        // Mark server as unavailable and notify UI to hide button
        this.serverAvailable = false;
        if (this.onServerUnavailable) {
          this.onServerUnavailable();
        }

        // Auto-reconnect when heartbeat detects server again
        this.reconnectOnAvailable = true;
        this.startHeartbeatPolling();
        return;
      }
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("[AgentManager] Max reconnect attempts reached. Will reconnect when server returns.");
      this.reconnectStartTime = null;
      this.reconnectAttempts = 0;

      // Mark server as unavailable and hide button
      this.serverAvailable = false;
      if (this.onServerUnavailable) {
        this.onServerUnavailable();
      }

      // Auto-reconnect when heartbeat detects server again
      this.reconnectOnAvailable = true;
      this.startHeartbeatPolling();
      return;
    }

    this.reconnectAttempts++;

    console.log(`[AgentManager] Reconnecting in ${this.reconnectDelay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, this.reconnectDelay);
  }

  /**
   * Get connection status
   */
  isConnected() {
    return this.eventSource && this.eventSource.readyState === EventSource.OPEN;
  }

  /**
   * Get current state for UI
   * @returns {Object} State object with serverAvailable, connected, reconnecting flags
   */
  getState() {
    return {
      serverAvailable: this.serverAvailable,
      connected: this.isConnected(),
      reconnecting: this.reconnectStartTime !== null,
      protocol: this.currentProtocol,
    };
  }

  /**
   * Call an MCP tool on the server
   * @param {string} toolName - Name of the tool to call
   * @param {Object} args - Tool arguments
   * @returns {Promise<any>} Tool result
   */
  async callMCPTool(toolName, args = {}) {
    if (!this.serverAvailable) {
      throw new Error("MCP server not available");
    }

    try {
      const response = await fetch(`${this.serverUrl}/call-tool`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tool: toolName,
          args: args,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      return result;

    } catch (error) {
      console.error(`[AgentManager] Failed to call MCP tool ${toolName}:`, error);
      throw error;
    }
  }
}
