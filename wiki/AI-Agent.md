# AI Agent

The AI Agent integration allows LLMs like Claude to control the emulator through natural language commands. The agent can show/hide windows, manage disks, read/write BASIC programs, and inspect emulator state in real time using the AG-UI protocol over an MCP server.

---

## Table of Contents

- [Connection Status](#connection-status)
- [Connection Names & Multi-Emulator](#connection-names--multi-emulator)
- [Setting Up the MCP Server](#setting-up-the-mcp-server)
- [Sandbox Configuration](#sandbox-configuration)
- [Example Prompts](#example-prompts)
  - [Multi-Emulator](#multi-emulator)
  - [Window Management](#window-management)
  - [Disk Management](#disk-management)
  - [SmartPort Hard Drives](#smartport-hard-drives)
  - [Slot Configuration](#slot-configuration)
  - [BASIC Programs](#basic-programs)
  - [Assembly Programs](#assembly-programs)
  - [Memory Operations](#memory-operations)
  - [Screen Capture](#screen-capture)

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

## Connection Names & Multi-Emulator

Every browser tab that connects to the MCP server is assigned a **unique name** from a name pool — short, memorable words like *Bingo*, *Wozulator*, or *Pixel*. The name appears in the sparkle button label when connected, so you always know which emulator is which.

Names persist across server restarts within the same browser session (stored in `sessionStorage`), so your tab keeps the same identity even if the MCP server is restarted.

### Renaming

**Double-click the name label** on the sparkle button (connected state only) to rename inline:

- Type a new name and press **Enter** to confirm
- Press **Escape** or click anywhere else to cancel
- Valid characters: Unicode letters, hyphens, underscores — **no numbers or spaces**

The new name is saved immediately and persists for the life of that browser session.

### Multiple Emulators

Multiple browser tabs can connect simultaneously, each with its own name. Claude can address them individually or broadcast to all:

- **One connected** — commands route to it automatically
- **Multiple connected, one is default** — commands route to the default
- **Multiple connected, no default** — Claude will ask you to pick, then set that as the default
- **Named target** — prefix any request with the emulator name: "Take a screenshot of Bingo"
- **Broadcast** — "Reboot all connected emulators"

Use `list_connections` to see all connected emulators and which is the default. Use `set_default_emulator` to switch.

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

### Sandbox Configuration

All MCP file operations are gated by a sandbox — a config file that maps short alias keys to trusted directories on your filesystem. Without it the agent starts but all file access is blocked.

**1. Create the config file**

Create `~/.appleii/sandbox.config` (or any path you prefer):

```
# Lines starting with # are comments
# Format: [key]@/path/to/directory

[disks]@~/Documents/Apple2/Disks
[games]@~/Documents/Apple2/Games
[basic]@~/Documents/Apple2/BASIC
[asm]@~/Documents/Apple2/Assembly
```

Rules:
- **Key**: alphanumeric, underscores, and hyphens only — used as `[key]` in tool calls
- **Path**: absolute path or `~`-prefixed home-relative path to a directory
- Empty lines and `#` comments are ignored

**2. Point `.mcp.json` to the config**

Add `APPLEII_AGENT_SANDBOX` to the `env` block:

```json
{
  "mcpServers": {
    "appleii-agent": {
      "type": "stdio",
      "command": "bunx",
      "args": ["-y", "@retrotech71/appleii-agent"],
      "env": {
        "APPLEII_AGENT_SANDBOX": "/path/to/sandbox.config"
      }
    }
  }
}
```

**3. Use sandbox paths in prompts**

Reference files using `[key]/relative/path` syntax:

```
Load [disks]/ProDOS_2_4_2.dsk into drive 1
Save the BASIC program to [basic]/hello.bas
Load [games]/Zork/zork1.dsk into drive 1
```

Full `~/` paths also work as long as they fall inside a configured sandbox directory.

**4. Reload after editing**

After changing the config file, ask the agent to reload:

```
Reload the sandbox configuration
```

No restart of Claude Code or the MCP server is needed.

**Security notes:**
- Path traversal (`../` escaping a directory) is blocked
- Full paths outside all configured directories are blocked
- Save tools default to `overwrite: false` — ask explicitly to overwrite an existing file

---

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

### Multi-Emulator

**List all connected emulators:**
```
Show me all connected emulators
```

**Set the default emulator:**
```
Set Bingo as the default emulator
```

**Send a command to a specific emulator:**
```
Take a screenshot of Wozulator
Reboot Bingo
Load ProDOS into drive 1 on Pixel
What's on the screen of Wozulator?
```

**Broadcast to all:**
```
Reboot all connected emulators
Take screenshots of all connected emulators
```

**Check which emulator is default:**
```
Which emulator is currently the default?
```

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
Save 1024 bytes starting at $4000 to [files]/dump.bin
```

### Screen Capture

**View screenshot:**
```
Take a screenshot of the current screen
```

**Save screenshot to file:**
```
Save the screen to [t]/screenshot.png
```

**Read text from screen:**
```
What text is currently displayed on the screen?
```

**Read text from specific region:**
```
Read the text from rows 5 to 15 on the screen
```

**Read CATALOG output:**
```
Read the text from the screen after running CATALOG
```

**Workflow example - verify program output:**
```
Write this program to memory:
10 PRINT "HELLO, WORLD!"
20 END

Run the program
Wait 1 second
Read the text from the screen
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
