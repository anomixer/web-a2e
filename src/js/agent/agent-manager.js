/*
 * agent-manager.js - AG-UI protocol client for MCP server communication
 *
 * Written by
 *  Shawn Bullock <shawn@agenticexpert.ai>
 */

import { executeAgentTool } from "./agent-tools.js";

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

    // Heartbeat polling
    this.heartbeatInterval = null;
    this.heartbeatCheckInterval = 15000; // 15 seconds
    this.serverAvailable = false;

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
   */
  connect() {
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

    console.log(`[AgentManager] Connecting to ${this.serverUrl}/events`);

    try {
      this.eventSource = new EventSource(`${this.serverUrl}/events`);

      this.eventSource.onopen = () => {
        console.log("[AgentManager] Connected to MCP server");
        this.connected = true;
        this.reconnectAttempts = 0;
        this.reconnectStartTime = null; // Reset reconnection window

        // Stop heartbeat polling while connected
        this.stopHeartbeatPolling();

        if (this.onConnectionChange) {
          this.onConnectionChange(true);
        }
      };

      this.eventSource.onmessage = (e) => {
        this._handleEvent(e);
      };

      this.eventSource.onerror = (error) => {
        console.error("[AgentManager] Connection error:", error);
        this.connected = false;
        if (this.onConnectionChange) {
          this.onConnectionChange(false);
        }
        this._handleConnectionError();
      };

      // Check connection state after a brief delay
      setTimeout(() => {
        if (this.eventSource && this.eventSource.readyState === EventSource.OPEN) {
          if (!this.connected) {
            console.log("[AgentManager] Connection established (via readyState check)");
            this.connected = true;
            if (this.onConnectionChange) {
              this.onConnectionChange(true);
            }
          }
        }
      }, 500);

    } catch (error) {
      console.error("[AgentManager] Failed to create EventSource:", error);
      this._scheduleReconnect();
    }
  }

  /**
   * Disconnect from MCP server
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
  }

  /**
   * Handle incoming AG-UI event
   */
  _handleEvent(e) {
    try {
      const event = JSON.parse(e.data);

      // Route event to appropriate handler
      switch (event.type) {
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
        default:
          console.log("[AgentManager] Unhandled event type:", event.type);
      }
    } catch (error) {
      console.error("[AgentManager] Error parsing event:", error);
    }
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
    this.disconnect();

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
        console.error("[AgentManager] 3-minute reconnection window expired. Hiding button.");
        this.reconnectStartTime = null;
        this.reconnectAttempts = 0;

        // Mark server as unavailable and notify UI to hide button
        this.serverAvailable = false;
        if (this.onServerUnavailable) {
          this.onServerUnavailable();
        }

        // Resume heartbeat polling to detect when server comes back
        this.startHeartbeatPolling();
        return;
      }
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("[AgentManager] Max reconnect attempts reached within window.");
      this.reconnectStartTime = null;
      this.reconnectAttempts = 0;

      // Mark server as unavailable and hide button
      this.serverAvailable = false;
      if (this.onServerUnavailable) {
        this.onServerUnavailable();
      }

      // Resume heartbeat polling
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
