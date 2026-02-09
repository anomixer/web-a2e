# A2E MCP Agent

Control the Apple //e emulator using Claude Code through the Model Context Protocol (MCP).

## What It Does

This MCP server lets you interact with the Apple //e emulator using natural language:
- Show/hide windows (BASIC editor, disk drives, etc.)
- Load and edit BASIC programs
- Run programs and control the emulator
- Power on/off and reset the emulator

## Installation

1. **Install dependencies:**
   ```bash
   cd mcp/a2e-agent
   npm install
   ```

2. **Configure Claude Code:**

   Edit `.mcp.json` in the repo root and update the path:
   ```json
   {
     "mcpServers": {
       "a2e-agent": {
         "command": "node",
         "args": ["/YOUR/PATH/TO/web-a2e/mcp/a2e-agent/src/index.js"]
       }
     }
   }
   ```

3. **Start the emulator:**
   ```bash
   npm run dev
   ```
   Open the emulator in your browser (http://localhost:3000)

4. **Connect to the MCP agent:**

   Click the sparkle/star icon (⭐) in the top-right corner of the emulator to connect to the MCP server.

## Usage Examples

Here are some things you can ask Claude Code to do:

### Window Management
```
show the applesoft basic program window
close the basic program window
show disk drives
```

### Working with BASIC Programs
```
show the current program in the basic window
load it into the emulator
run the program
change line 12 to PRINT I * J; " WOO HOO"
renumber the lines
clear the program
```

### Emulator Control
```
power off the emulator
power on the emulator
reboot the emulator
```

## How It Works

1. You give Claude Code a command
2. Claude Code calls the MCP server
3. The MCP server sends the command to the emulator via HTTP
4. The emulator executes the operation and returns the result
5. Claude Code shows you what happened

The emulator must be running and connected (green sparkle icon) for commands to work.

## Troubleshooting

**"Failed to connect to MCP server"**
- Make sure you've run `npm install` in `mcp/a2e-agent`
- Check that the path in `.mcp.json` is correct
- Restart Claude Code

**"Agent button shows disconnected"**
- Click the sparkle icon in the emulator to connect
- Check the browser console for connection errors
- The server runs on `http://localhost:3033`

## Available Windows

- `basic-program` - Applesoft BASIC program editor
- `disk-drives` - Disk drive controls
- `cpu-debugger` - CPU debugger
- `memory-browser` - Memory viewer
- And more...

## Documentation

For implementation details and adding new features, see `.claude/agents/new-app-tool.md`.
