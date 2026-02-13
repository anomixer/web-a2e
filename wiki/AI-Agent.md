# AI Agent

The AI Agent integration allows LLMs like Claude to control the emulator through natural language commands. The agent can show/hide windows, manage disks, read/write BASIC programs, and inspect emulator state in real time using the AG-UI protocol over an MCP server.

---

## Table of Contents

- [Connection Status](#connection-status)
- [Setting Up the MCP Server](#setting-up-the-mcp-server)
- [Example Prompts](#example-prompts)
  - [Window Management](#window-management)
  - [Disk Management](#disk-management)
  - [SmartPort Hard Drives](#smartport-hard-drives)
  - [Slot Configuration](#slot-configuration)
  - [BASIC Programs](#basic-programs)
  - [Assembly Programs](#assembly-programs)
  - [Memory Operations](#memory-operations)

---

## Connection Status

The agent connection status is shown by a sparkle icon in the toolbar header:

| Icon | Status | Description |
|------|--------|-------------|
| <svg viewBox="0 0 24 24" width="20" height="20" fill="#6e7681"><path d="M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5L12 2zM6 16l.75 2.25L9 19l-2.25.75L6 22l-.75-2.25L3 19l2.25-.75L6 16zM18 16l.75 2.25L21 19l-2.25.75L18 22l-.75-2.25L15 19l2.25-.75L18 16z"/></svg> | **Disconnected** | MCP server is not running or not reachable |
| <svg viewBox="0 0 24 24" width="20" height="20" fill="#FDBE34"><path d="M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5L12 2zM6 16l.75 2.25L9 19l-2.25.75L6 22l-.75-2.25L3 19l2.25-.75L6 16zM18 16l.75 2.25L21 19l-2.25.75L18 22l-.75-2.25L15 19l2.25-.75L18 16z"/></svg> | **Connected** | Agent is connected and ready to receive commands |
| <svg viewBox="0 0 24 24" width="20" height="20" fill="#E5504F"><path d="M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5L12 2zM6 16l.75 2.25L9 19l-2.25.75L6 22l-.75-2.25L3 19l2.25-.75L6 16zM18 16l.75 2.25L21 19l-2.25.75L18 22l-.75-2.25L15 19l2.25-.75L18 16z"/></svg> | **Interrupted** | Connection error or server unavailable |

Click the sparkle icon to open the agent connection panel and view detailed status information.

---

## Setting Up the MCP Server

The AI Agent uses the Model Context Protocol (MCP) to communicate with LLM clients like Claude Code. Configure your MCP client to connect to the emulator's agent server.

### Configuration

Add the following to your MCP configuration file (e.g., `~/.claude.json` or `.mcp.json` in your project):

**Using bunx (recommended):**

```json
{
  "mcpServers": {
    "appleii-agent": {
      "type": "stdio",
      "command": "bunx",
      "args": [
        "-y",
        "@retrotech71/appleii-agent"
      ]
    }
  }
}
```

**Using npx:**

```json
{
  "mcpServers": {
    "appleii-agent": {
      "type": "stdio",
      "command": "npx",
      "args": [
        "-y",
        "@retrotech71/appleii-agent"
      ]
    }
  }
}
```

No installation required — the agent is downloaded and run automatically on first use. `bunx` ([Bun](https://bun.sh)) is recommended as it is more likely to work out of the box; `npx` (Node.js) may experience timeout issues on first run while downloading the package.

### How It Works

The MCP server starts automatically when your MCP client (e.g., Claude Code) connects. It listens on `http://localhost:3033` and uses the AG-UI protocol to communicate with the emulator frontend running in your browser.

### Port Conflict Management

The MCP server includes graceful port conflict handling when multiple instances attempt to use port 3033:

- **Automatic Detection:** When port 3033 is already in use, the MCP server stays alive without failing
- **Status Reporting:** The `server_control` tool reports port conflicts and provides guidance
- **Port Reclamation:** Any instance can take over the port by shutting down the other instance and starting itself
- **Two-Step Process:**
  1. Call `shutdown_remote_server` to stop the other instance
  2. Call `server_control` with action `start` to start this instance

**Example workflow to reclaim port 3033:**

```
Check the status → port shows as in use
Shutdown the remote server on port 3033
Start this server on port 3033
```

This allows multiple Claude Code sessions or MCP instances to coordinate gracefully without manual process management.

---

## Example Prompts

### Window Management

**Show a window:**
```
Show the CPU debugger window
```

**Hide a window:**
```
Hide the disk drives window
```

**Focus a window:**
```
Bring the BASIC program window to the front
```

### Disk Management

**Insert a disk from the filesystem:**
```
Load ~/Documents/Apple_II/ProDOS_2_4_2.dsk into drive 1
```

**List recent disks:**
```
What disks are in the recent list for drive 1?
```

**Load from recent disks:**
```
Insert the disk named "Zork_1.dsk" from recent disks into drive 2
```

**Eject a disk:**
```
Eject the disk from drive 1
```

**Clear recent disks:**
```
Clear all recent disks for drive 1
```

### SmartPort Hard Drives

**Insert an image from the filesystem:**
```
Load ~/Images/Total_Replay.hdv into SmartPort device 1
```

**List recent images:**
```
What images are in the recent list for SmartPort device 1?
```

**Load from recent images:**
```
Insert Apple Pascal from recent SmartPort images
```

**Clear recent images:**
```
Clear the recent images list for SmartPort device 1
```

**Eject an image:**
```
Eject the SmartPort image from device 1
```

### Slot Configuration

**List all slots:**
```
Show me the current expansion slot configuration
```

**Install a card:**
```
Install the Mockingboard in slot 4
```

**Remove a card:**
```
Remove the card from slot 5
```

**Move a card:**
```
Move the SmartPort card from slot 7 to slot 5
```

### BASIC Programs

**Read BASIC program from memory:**
```
Load the BASIC program from memory and show it in the editor
```

**Write BASIC program to memory:**
```
Write this BASIC program to emulator memory:
10 PRINT "HELLO, WORLD!"
20 GOTO 10
```

**Get program listing:**
```
What BASIC program is currently in memory?
```

**Save program to file:**
```
Save the BASIC program from the editor to ~/Documents/myprogram.bas
```

**Save program from memory to file:**
```
Save the BASIC program from memory to ~/Documents/myprogram.bas
```

**Set a breakpoint:**
```
Set a breakpoint on BASIC line 20
```

**Set a statement-level breakpoint:**
```
Set a breakpoint on line 10, second statement
```

**List all breakpoints:**
```
Show me all BASIC breakpoints
```

**Remove a breakpoint:**
```
Remove the breakpoint from line 20
```

**Step to next line:**
```
Step to the next BASIC line
```

**Get current line number:**
```
What line is the BASIC program stopped at?
```

**Inspect variables:**
```
Show me all BASIC variables
```

**Get specific variable value:**
```
What's the value of variable X?
```

**Set a variable:**
```
Set variable X to 42
```

**Set a string variable:**
```
Set A$ to "HELLO WORLD"
```

**Debug workflow example:**
```
Write this program to memory:
10 X=1:Y=2:PRINT X+Y
20 PRINT "LINE 20"
30 END

Set a breakpoint on line 10, second statement
Run the program
Step to the next line
Show me all variables
```

### Assembly Programs

**Get assembly status:**
```
What's the status of the assembler?
```

**Execute assembled program:**
```
Run the assembled program
```

**Execute at specific address:**
```
Execute the code at $0800
```

**Execute with return to BASIC:**
```
Execute $0800 and return to BASIC
```

**Execute with return to monitor:**
```
Run $0800 and return to monitor
```

**Set PC without executing:**
```
Set PC to $0800 but don't execute yet
```

### Memory Operations

**Load binary file to memory:**
```
Load the file ~/program.bin into memory at address $2000
```

**Save memory range to file:**
```
Save 256 bytes from memory address $0800 to ~/output.bin
```

**Save memory region:**
```
Read 1024 bytes starting at $4000 and save them to ~/dump.bin
```

### Emulator Control

**Power on:**
```
Turn on the emulator
```

**Power off:**
```
Turn off the emulator
```

**Reboot (cold reset):**
```
Reboot the emulator
```

**Warm reset:**
```
Send Ctrl+Reset to the emulator
```

**Break program:**
```
Send Ctrl+C to the emulator
```

---

See also: [[Debugger]], [[Disk-Drives]], [[Getting-Started]]
