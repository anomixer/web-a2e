NAME: agent-setup
DESCRIPTION: Configure Apple //e Agent MCP server in .mcp.json

# Apple //e Agent Setup

Configure the MCP server connection for the Apple //e emulator agent integration.

## Configuration File

**Location**: `.mcp.json` in project root

The `.mcp.json` file configures how Claude Code connects to the Apple //e Agent MCP server.

## Configuration Options

Choose one of three approaches based on your needs:

### Option 1: Bunx Auto-Install (Recommended for Users)

**Best for**: End users, quick setup, always up-to-date

**Configuration**:
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

**Features**:
- Automatically downloads and installs latest version
- No manual installation required
- Always uses latest published version
- Requires Bun runtime (`bunx` command)

**When to use**:
- Production use
- No agent development needed
- Want automatic updates
- Simple setup preferred

---

### Option 2: Bunx Specific Version

**Best for**: Version pinning, testing specific releases

**Configuration**:
```json
{
  "mcpServers": {
    "appleii-agent": {
      "type": "stdio",
      "command": "bunx",
      "args": [
        "-y",
        "@retrotech71/appleii-agent@1.0.5"
      ]
    }
  }
}
```

**Features**:
- Lock to specific version (e.g., `1.0.5`)
- Prevents automatic updates
- Useful for testing compatibility
- Reproducible builds

**When to use**:
- Need version stability
- Testing specific version
- Avoiding breaking changes
- Regression testing

**Version format**:
- Exact: `@1.0.5`
- Latest: `@latest`
- Range: `@^1.0.0` (semver)

---

### Option 3: Local Development (Recommended for Contributors)

**Best for**: Agent development, debugging, local changes

**Configuration**:
```json
{
  "mcpServers": {
    "appleii-agent": {
      "type": "stdio",
      "command": "node",
      "args": [
        "/Users/Shawn/code/git/[mikedaley]/appleii-agent/src/index.js"
      ]
    }
  }
}
```

**Features**:
- Uses local agent source code
- See changes immediately (no publish needed)
- Full debugging capability
- Direct file editing

**When to use**:
- Developing agent features
- Debugging agent issues
- Testing local changes
- Contributing to agent development

**Prerequisites**:
- Agent repository cloned locally
- Node.js 18+ installed
- Agent dependencies installed (`npm install` in agent directory)

**Path**: Adjust path to match your local agent location
- Example: `/Users/Shawn/code/git/[mikedaley]/appleii-agent/src/index.js`
- Relative paths NOT supported (must be absolute)

---

## Switching Configurations

To switch between configurations:

1. **Edit `.mcp.json`** with desired configuration
2. **Restart Claude Code** (or reload MCP servers)
3. **Verify connection** in emulator (Agent button should appear)

## Verification

After configuring, verify the agent is working:

1. **Start emulator**: Open http://localhost:3000
2. **Check for Agent button**: Should appear in header when server available
3. **Click Agent button**: Should show "Connected" status
4. **Test tool call**: Try asking agent to show a window

## Troubleshooting

### Bunx not found
**Solution**: Install Bun runtime
```bash
curl -fsSL https://bun.sh/install | bash
```

### Local agent not found
**Solution**: Verify path is correct and absolute
```bash
# Check if file exists
ls -l /path/to/appleii-agent/src/index.js

# Verify Node.js is installed
node --version  # Should be 18+
```

### Version mismatch warning
**Solution**: Update to compatible version
- Minimum required version: `1.0.5`
- Check current version in agent package.json
- Update `.mcp.json` to use compatible version

### Agent won't connect
**Checklist**:
1. Verify `.mcp.json` syntax is valid JSON
2. Restart Claude Code after config changes
3. Check agent server is running (port 3033)
4. Verify emulator is running
5. Check browser console for errors

## Environment Variables

Optional environment variables for agent server:

```bash
# Port (default: 3033)
PORT=3033

# Enable HTTPS mode
HTTPS=true
```

Set in `.mcp.json` if needed:
```json
{
  "mcpServers": {
    "appleii-agent": {
      "type": "stdio",
      "command": "bunx",
      "args": ["-y", "@retrotech71/appleii-agent"],
      "env": {
        "PORT": "3033",
        "HTTPS": "false"
      }
    }
  }
}
```

## Sandbox Configuration

The sandbox controls which directories on your filesystem the agent can access. Without it the server starts but all file operations (`load_disk_image`, `save_basic_file`, etc.) are blocked.

### Create the Config File

Create a plain text file — conventionally `~/.appleii/sandbox.config`:

```bash
mkdir -p ~/.appleii
touch ~/.appleii/sandbox.config
```

Edit the file with one entry per line:

```
# Lines starting with # are comments
# Format: [key]@/path/to/directory

[disks]@~/Documents/Apple2/Disks
[games]@~/Documents/Apple2/Games
[basic]@~/Documents/Apple2/BASIC
[asm]@~/Documents/Apple2/Assembly
[files]@~/Documents/Apple2/Files
```

**Key rules:**
- Only alphanumeric characters, underscores (`_`), and hyphens (`-`)
- Must be unique within the file
- Used as `[key]` prefix when referencing files in tool calls

**Path rules:**
- Absolute: `/Users/name/Documents/Apple2/Disks`
- Home-relative: `~/Documents/Apple2/Disks` (tilde is expanded)
- Relative paths are resolved from the process working directory

### Wire Up the Environment Variable

Add `APPLEII_AGENT_SANDBOX` to the `env` block in `.mcp.json`:

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

This works for all three configuration options (bunx, version-pinned, local dev).

### Using Sandbox Paths

Reference files using `[key]/relative/path/filename` syntax in any tool that accepts a path:

| Prompt example | Resolved path |
|----------------|---------------|
| `Load [disks]/ProDOS.dsk into drive 1` | `~/Documents/Apple2/Disks/ProDOS.dsk` |
| `Save the BASIC program to [basic]/hello.bas` | `~/Documents/Apple2/BASIC/hello.bas` |
| `Load [games]/Zork/zork1.dsk into drive 2` | `~/Documents/Apple2/Games/Zork/zork1.dsk` |

Full paths (absolute or `~`-prefixed) also work — but only if they fall inside a configured sandbox directory.

**Tools that accept sandbox paths:**

| Tool | Description |
|------|-------------|
| `load_disk_image` | Load floppy disk image (.dsk, .do, .po, .nib, .woz) |
| `load_smartport_image` | Load SmartPort hard drive image (.hdv, .po, .2mg) |
| `load_file` | Load any file as binary or text |
| `save_basic_file` | Save BASIC program text (.bas) |
| `save_asm_file` | Save assembly source (.s, .asm) |
| `save_disk_file` | Save binary file data (base64 input) |

### Reload After Editing

After editing `sandbox.config`, reload without restarting Claude Code:

```
mcp__appleii-agent__reload_sandbox
```

Or ask the agent: `"Reload the sandbox configuration"`

### Security Model

- **Path traversal blocked**: `../` sequences that would escape a sandbox directory are rejected
- **Out-of-sandbox blocked**: Full paths not inside any configured directory are rejected
- **Overwrite protection**: Save tools default to `overwrite: false` — pass `overwrite: true` explicitly to replace existing files

### Troubleshooting

**File access blocked — no sandbox configured**
```
APPLEII_AGENT_SANDBOX is not set. File operations are disabled.
```
→ Add `APPLEII_AGENT_SANDBOX` to the `env` block in `.mcp.json` and restart Claude Code.

**Unknown sandbox key**
```
Unknown sandbox path: [mykey]. Available sandboxes: [disks], [basic]
```
→ Check the key spelling in your prompt and in `sandbox.config`. Keys are case-sensitive.

**Config file not found**
```
Sandbox config not found: /Users/name/.appleii/sandbox.config
```
→ Create the file at the path specified in `APPLEII_AGENT_SANDBOX`.

**Path traversal detected**
```
Path traversal detected: [disks]/../../etc/passwd escapes its trusted directory.
```
→ The path contains `../` sequences that escape the sandbox. Use a direct relative path.

---

## Development Workflow

### For Agent Development

1. **Clone agent repository**:
   ```bash
   git clone https://github.com/retrotech71/appleii-agent.git
   cd appleii-agent
   npm install
   ```

2. **Configure `.mcp.json`** with local path (Option 3)

3. **Make changes** to agent source code

4. **Test immediately** (no rebuild needed for Node.js code)

5. **When ready to publish**:
   ```bash
   npm version patch  # or minor, major
   npm publish
   ```

6. **Switch back to Bunx** configuration (Option 1) for production

### For App Development

1. **Use Bunx** configuration (Option 1)

2. **Let agent auto-update** to latest version

3. **Only switch to local** if debugging agent issues

## Version Compatibility

| App Version | Min Agent Version | Recommended Config |
|-------------|-------------------|-------------------|
| 1.0.10+     | 1.0.5+           | Bunx @latest      |
| 1.0.9       | 1.0.4+           | Bunx @1.0.4       |
| < 1.0.9     | Not supported    | N/A               |

Check compatibility in `src/js/agent/agent-manager.js`:
```javascript
const minVersion = "1.0.5"; // Required minimum version
```

## Quick Reference

**Bunx latest** (recommended):
```json
"command": "bunx",
"args": ["-y", "@retrotech71/appleii-agent"]
```

**Bunx specific version**:
```json
"command": "bunx",
"args": ["-y", "@retrotech71/appleii-agent@1.0.5"]
```

**Local development**:
```json
"command": "node",
"args": ["/absolute/path/to/appleii-agent/src/index.js"]
```
