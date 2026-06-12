# AG-UI Protocol Specification

**Date Compiled**: 2026-02-08
**Protocol Version**: 2026 Standard

## Overview

AG-UI (Agent-User Interaction Protocol) is an open, lightweight, event-based protocol that standardizes how AI agents connect to user-facing applications. It provides bi-directional communication between agentic backends and user-facing frontend applications.

### Key Features

- **Event-based architecture**: Discrete JSON events over WebSockets, SSE, or HTTP
- **17 standard event types** grouped into 5 categories
- **Live token streaming**: Responsive multi-turn sessions with cancel/resume
- **Transport agnostic**: Works with any event transport
- **Typed attachments**: Files, images, audio, transcripts
- **Tool integration**: Both backend and frontend tool execution

### Relationship to Other Protocols

- **MCP (Model Context Protocol)**: Handles context
- **A2A (Agent-to-Agent)**: Handles agent coordination
- **AG-UI**: Handles user ↔ agent interaction
- **A2UI**: Google's generative UI specification for widget delivery

## The 17 Event Types

### 1. Lifecycle Events (5 types)

#### RUN_STARTED
Signals the beginning of an agent execution.

```json
{
  "type": "RUN_STARTED",
  "thread_id": "thread_123",
  "run_id": "run_456"
}
```

#### RUN_FINISHED
Indicates successful completion.

```json
{
  "type": "RUN_FINISHED",
  "thread_id": "thread_123",
  "run_id": "run_456"
}
```

#### RUN_ERROR
Signals failure during execution.

```json
{
  "type": "RUN_ERROR",
  "thread_id": "thread_123",
  "error": "Connection timeout"
}
```

#### STEP_STARTED
Marks beginning of a sub-task.

```json
{
  "type": "STEP_STARTED",
  "step_name": "Gathering data"
}
```

#### STEP_FINISHED
Marks completion of a sub-task.

```json
{
  "type": "STEP_FINISHED",
  "step_name": "Gathering data"
}
```

---

### 2. Text Message Events (3 types)

#### TEXT_MESSAGE_START
Begins a new message with role designation.

```json
{
  "type": "TEXT_MESSAGE_START",
  "message_id": "msg_789",
  "role": "assistant"
}
```

#### TEXT_MESSAGE_CONTENT
Streams text incrementally (token-by-token).

```json
{
  "type": "TEXT_MESSAGE_CONTENT",
  "message_id": "msg_789",
  "delta": "Hello"
}
```

#### TEXT_MESSAGE_END
Finalizes message transmission.

```json
{
  "type": "TEXT_MESSAGE_END",
  "message_id": "msg_789"
}
```

---

### 3. Tool Call Events (4 types)

#### TOOL_CALL_START
Initiates a tool/function invocation.

```json
{
  "type": "TOOL_CALL_START",
  "tool_call_id": "tool_001",
  "tool_call_name": "fetch_weather"
}
```

#### TOOL_CALL_ARGS
Streams tool arguments progressively.

```json
{
  "type": "TOOL_CALL_ARGS",
  "tool_call_id": "tool_001",
  "delta": "{\"city\": \"San Francisco\"}"
}
```

#### TOOL_CALL_END
Completes tool call execution.

```json
{
  "type": "TOOL_CALL_END",
  "tool_call_id": "tool_001"
}
```

#### TOOL_CALL_RESULT
Delivers the tool's output.

```json
{
  "type": "TOOL_CALL_RESULT",
  "tool_call_id": "tool_001",
  "content": "72°F, Sunny"
}
```

---

### 4. State Management Events (3 types)

#### STATE_SNAPSHOT
Transmits complete application state.

```json
{
  "type": "STATE_SNAPSHOT",
  "snapshot": {
    "score": 0,
    "tasks_completed": 0,
    "current_step": "fetching_data"
  }
}
```

#### STATE_DELTA
Sends incremental changes (JSON Patch format per RFC6902).

```json
{
  "type": "STATE_DELTA",
  "delta": [
    {"op": "replace", "path": "/score", "value": 42}
  ]
}
```

#### MESSAGES_SNAPSHOT
Resynchronizes conversation history.

```json
{
  "type": "MESSAGES_SNAPSHOT",
  "messages": [...]
}
```

---

### 5. Special Events (2 types)

#### RAW_EVENT
Passes through external system events unchanged.

```json
{
  "type": "RAW",
  "event": {"alert": "high_cpu", "value": 92},
  "source": "monitoring_system"
}
```

#### CUSTOM_EVENT
Enables application-specific extensions.

```json
{
  "type": "CUSTOM",
  "name": "AGENT_HANDOFF",
  "value": {
    "from_agent": "Planner",
    "to_agent": "Executor"
  }
}
```

---

## Frontend Tools Pattern

### Overview

Frontend tools are functions that execute on the client side. Agents trigger UI actions by calling these tools via the standard TOOL_CALL events.

### Defining Frontend Tools

Tools are defined with name, description, and parameter schemas:

```javascript
const FRONTEND_TOOLS = {
  showWindow: {
    name: "showWindow",
    description: "Show or focus a window in the application",
    parameters: {
      type: "object",
      properties: {
        windowId: {
          type: "string",
          description: "The ID of the window to show"
        }
      },
      required: ["windowId"]
    }
  },

  changeBackgroundColor: {
    name: "changeBackgroundColor",
    description: "Change the application background color",
    parameters: {
      type: "object",
      properties: {
        color: {
          type: "string",
          description: "CSS color name or hex value"
        }
      },
      required: ["color"]
    }
  },

  executeCommand: {
    name: "executeCommand",
    description: "Execute a command in the application",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "The command to execute"
        },
        args: {
          type: "object",
          description: "Command arguments"
        }
      },
      required: ["command"]
    }
  }
}
```

### Tool Call Flow

**1. Agent initiates tool call:**

```json
{
  "type": "TOOL_CALL_START",
  "tool_call_id": "tc_001",
  "tool_call_name": "showWindow"
}
```

**2. Agent streams arguments:**

```json
{
  "type": "TOOL_CALL_ARGS",
  "tool_call_id": "tc_001",
  "delta": "{\"windowId\":"
}
```

```json
{
  "type": "TOOL_CALL_ARGS",
  "tool_call_id": "tc_001",
  "delta": " \"basic-program\"}"
}
```

**3. Agent signals completion:**

```json
{
  "type": "TOOL_CALL_END",
  "tool_call_id": "tc_001"
}
```

**4. Frontend executes and responds:**

```javascript
// Execute tool
const result = executeTool(toolName, parsedArgs);

// Send result back to agent
sendEvent({
  type: "TOOL_CALL_RESULT",
  tool_call_id: "tc_001",
  content: result
});
```

### Python Example

```python
from typing import Annotated
from pydantic import Field

def change_background_color(
    color: Annotated[str, Field(description="Color name")] = "blue"
) -> str:
    """Change the console background color."""
    print(f"🎨 Background color changed to {color}")
    return f"Background changed to {color}"

def read_sensor_data(
    include_temperature: Annotated[bool, Field(description="Include temperature")] = True
) -> dict:
    """Read sensor data from the client device."""
    return {"temperature": 72.5, "humidity": 45}

FRONTEND_TOOLS = {
    "change_background_color": change_background_color,
    "read_sensor_data": read_sensor_data,
}
```

### .NET Example

```csharp
[Description("Get the user's current location from GPS.")]
static string GetUserLocation()
{
    return "Amsterdam, Netherlands (52.37°N, 4.90°E)";
}

AITool[] frontendTools = [AIFunctionFactory.Create(GetUserLocation)];

AIAgent agent = chatClient.AsAIAgent(
    name: "agui-client",
    description: "AG-UI Client Agent",
    tools: frontendTools
);
```

---

## Communication Patterns

### Event Stream Example

A typical AG-UI conversation:

```json
{"type": "RUN_STARTED", "run_id": "run_123"}
{"type": "TEXT_MESSAGE_START", "message_id": "msg_1", "role": "assistant"}
{"type": "TEXT_MESSAGE_CONTENT", "message_id": "msg_1", "delta": "I'll"}
{"type": "TEXT_MESSAGE_CONTENT", "message_id": "msg_1", "delta": " help"}
{"type": "TEXT_MESSAGE_CONTENT", "message_id": "msg_1", "delta": " you"}
{"type": "TEXT_MESSAGE_END", "message_id": "msg_1"}
{"type": "TOOL_CALL_START", "tool_call_id": "tc_1", "tool_call_name": "showWindow"}
{"type": "TOOL_CALL_ARGS", "tool_call_id": "tc_1", "delta": "{\"windowId\":\"basic-program\"}"}
{"type": "TOOL_CALL_END", "tool_call_id": "tc_1"}
{"type": "TOOL_CALL_RESULT", "tool_call_id": "tc_1", "content": "Window shown"}
{"type": "RUN_FINISHED", "run_id": "run_123"}
```

### Bidirectional Flow

```
Agent Backend                    Frontend Application
     |                                    |
     |------- RUN_STARTED ---------------->|
     |------- TEXT_MESSAGE_START --------->|
     |------- TEXT_MESSAGE_CONTENT ------->|
     |------- TOOL_CALL_START ------------>|
     |------- TOOL_CALL_ARGS ------------->|
     |------- TOOL_CALL_END -------------->|
     |                                    |
     |                        [Execute Tool]
     |                                    |
     |<------ TOOL_CALL_RESULT ------------|
     |                                    |
     |------- STATE_DELTA ---------------->|
     |------- RUN_FINISHED --------------->|
```

---

## Implementation Notes

### Transport Options

- **WebSockets**: Full bidirectional real-time
- **Server-Sent Events (SSE)**: Server → Client streaming
- **HTTP Long Polling**: Fallback for restricted environments
- **Webhooks**: Event delivery to registered endpoints

### Event Inheritance

All events inherit from `BaseEvent`:

```typescript
interface BaseEvent {
  type: string;
  timestamp?: string;
  rawEvent?: any;
}
```

### Argument Streaming

Tool arguments can be streamed incrementally via multiple `TOOL_CALL_ARGS` events, allowing UI to pre-fill forms before the agent finishes "speaking".

### State Management

- Use `STATE_SNAPSHOT` for full state sync on connect/reconnect
- Use `STATE_DELTA` (JSON Patch RFC6902) for efficient incremental updates
- `MESSAGES_SNAPSHOT` resynchronizes chat history

---

## Resources

- **Official Docs**: https://docs.ag-ui.com/
- **GitHub**: https://github.com/ag-ui-protocol/ag-ui
- **CopilotKit**: https://www.copilotkit.ai/ag-ui
- **Microsoft Learn**: https://learn.microsoft.com/en-us/agent-framework/integrations/ag-ui/

---

## Sources

- [AG-UI Overview](https://docs.ag-ui.com/)
- [Master the 17 AG-UI Event Types](https://www.copilotkit.ai/blog/master-the-17-ag-ui-event-types-for-building-agents-the-right-way)
- [Frontend Tool Rendering](https://learn.microsoft.com/en-us/agent-framework/integrations/ag-ui/frontend-tools)
- [The 2026 AI Agent Protocol Stack](https://medium.com/@visrow/a2a-mcp-ag-ui-a2ui-the-essential-2026-ai-agent-protocol-stack-ee0e65a672ef)
- [Oracle AG-UI Integration](https://blogs.oracle.com/ai-and-datascience/announcing-ag-ui-integration-for-agent-spec)
- [AG-UI Protocol Guide](https://zediot.com/blog/ag-ui-protocol/)
