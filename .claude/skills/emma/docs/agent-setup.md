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
