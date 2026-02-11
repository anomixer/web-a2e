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

### Configuration Example

Add the following to your MCP configuration file (e.g., `~/.claude/mcp.json` or `.mcp.json` in your project):

```json
{
  "mcpServers": {
    "appleii-agent": {
      "command": "node",
      "args": [
        "/path/to/mcp/appleii-agent/src/index.js"
      ]
    }
  }
}
```

Replace `/path/to/` with the actual path to the emulator's MCP server directory.

### Starting the Server

The MCP server starts automatically when your MCP client connects. You can also start it manually:

```bash
cd mcp/appleii-agent
node src/index.js
```

The server listens on `http://localhost:3033` by default and uses the AG-UI protocol to communicate with the emulator frontend.

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
