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
    this.eventSource = null;
    this.connected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 2000;
    this.onConnectionChange = null;

    // Tool call state
    this.activeToolCalls = new Map();
  }

  /**
   * Connect to MCP server SSE stream
   */
  connect() {
    if (this.eventSource) {
      console.warn("[AgentManager] Already connected");
      return;
    }

    console.log(`[AgentManager] Connecting to ${this.serverUrl}/events`);

    try {
      this.eventSource = new EventSource(`${this.serverUrl}/events`);

      this.eventSource.onopen = () => {
        console.log("[AgentManager] Connected to MCP server");
        this.connected = true;
        this.reconnectAttempts = 0;
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
    this._scheduleReconnect();
  }

  /**
   * Schedule reconnection attempt
   */
  _scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("[AgentManager] Max reconnect attempts reached. Giving up.");
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * this.reconnectAttempts;

    console.log(`[AgentManager] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Get connection status
   */
  isConnected() {
    return this.eventSource && this.eventSource.readyState === EventSource.OPEN;
  }
}
