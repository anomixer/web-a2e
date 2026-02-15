# new-agent-tool - Create MCP Agent Tool

Creates a new MCP tool in the appleii-agent server.

## When to Read Full Context

Only read existing tools if:
- User needs specific patterns (file loading, base64, HTTP server access)
- Unclear how to structure the tool schema
- Need to understand error handling patterns

## Quick Start

1. **Create tool file** in `appleii-agent/src/tools/your-tool.js`:

```javascript
export const tool = {
  name: "tool_name",
  description: "What it does",
  inputSchema: {
    type: "object",
    properties: {
      paramName: {
        type: "string",
        description: "What this param does"
      }
    },
    required: ["paramName"]
  }
};

export function handler(args, httpServer) {
  try {
    // Implementation
    return {
      success: true,
      data: result
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}
```

2. **Register** in `appleii-agent/src/tools/index.js`:
   - Import tool and handler
   - Add to tools array: `{ tool, handler }`

3. **Test** by calling via MCP

## Common Patterns

- **File operations**: Use `fs` from Node.js
- **HTTP server state**: Access via `httpServer.getStatus()`
- **Version info**: Import from `../version.js`
- **Base64**: Use `Buffer.from(data).toString('base64')`

## Progressive Loading

Read these only if needed:
- `appleii-agent/src/tools/load-disk-image.js` - File loading example
- `appleii-agent/src/tools/get-state.js` - HTTP server access example
- `appleii-agent/src/tools/server-control.js` - Complex handler example

## Error Handling

Always wrap in try/catch and return `{ success: false, error: message }` on failure.
