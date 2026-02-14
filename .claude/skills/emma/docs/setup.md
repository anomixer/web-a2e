NAME: setup
DESCRIPTION: Install and configure Apple //e emulator development environment on macOS

# Apple //e Emulator Setup

Install development tools and configure environment for building the Apple //e browser-based emulator.

## Pre-Requisites

- Current Operating System = macOS

## Setup Steps

1. Run step CMake
2. Run step Node.js
3. Run step Emscripten
4. Run step ROM Files
5. Run step Install Dependencies
6. Run step Build WASM
7. Run step Dev Server

### Prompt Template Functions

TRACE {message: text}:
  Write the {message} to the LLM output

MAYBE_RESET:
  if the terminal needs to be re-opened due to env settings, then
    TRACE "Exit this chat, close terminal, start new terminal in this directory and continue"
    exit this playbook
    exit chat via /exit
  if the terminal does not need to be re-opened then
    do nothing

## Step: CMake

OUTCOME:
  - CMake 3.20+ is installed and available in PATH

PRE-REQUISITES:
  - macOS

STEPS TO EXECUTE:

verify if (cmake) is installed
if (installed) then
  verify cmake version is 3.20 or higher
  if (version is 3.20+) then
    TRACE "CMake 3.20+ installed"
    end this verification step
  if (version is less than 3.20) then
    TRACE "CMake version is too old (need 3.20+)"
    TRACE "Upgrade CMake to 3.20 or higher"
    stop this verification step
if not (installed) then
  TRACE "CMake 3.20+ is required"
  TRACE "Install from https://cmake.org/download/"
  stop this verification step

TROUBLESHOOTING:
  - **Command not found:** Install CMake 3.20+ from https://cmake.org/download/
  - **Version too old:** Upgrade to CMake 3.20 or higher

## Step: Node.js

OUTCOME:
  - Node.js 18+ is installed and available in PATH

PRE-REQUISITES:
  - macOS

STEPS TO EXECUTE:

verify if (node) is installed
if (installed) then
  verify node version is 18 or higher
  if (version is 18+) then
    TRACE "Node.js 18+ installed"
    end this verification step
  if (version is less than 18) then
    TRACE "Node.js version is too old (need 18+)"
    TRACE "Upgrade Node.js to version 18 or higher"
    stop this verification step
if not (installed) then
  TRACE "Node.js 18+ is required"
  TRACE "Install from https://nodejs.org/"
  stop this verification step

TROUBLESHOOTING:
  - **Command not found:** Install Node.js 18+ from https://nodejs.org/
  - **Version too old:** Upgrade to Node.js 18 or higher

## Step: Emscripten

OUTCOME:
  - Emscripten SDK 3.0+ is installed and activated
  - emsdk_env.sh is sourced in shell profile

PRE-REQUISITES:
  - Git is available

STEPS TO EXECUTE:

verify if (emsdk) directory exists at ~/emsdk
if (exists) then
  TRACE "Emscripten SDK already installed"
  cd ~/emsdk
  run ./emsdk install latest
  run ./emsdk activate latest
  source ./emsdk_env.sh
  end this verification step

if not (exists) then
  TRACE "Installing Emscripten SDK"
  run git clone https://github.com/emscripten-core/emsdk.git ~/emsdk
  cd ~/emsdk
  run ./emsdk install latest
  run ./emsdk activate latest
  source ./emsdk_env.sh

  TRACE "Adding emsdk_env.sh to shell profile"
  verify if (~/.bashrc and ~/.zshrc) have emsdk sourced
  if not (both have emsdk sourced) then
    if (~/.bashrc) exists and does not have emsdk then
      append to ~/.bashrc:

        # Emscripten SDK
        source ~/emsdk/emsdk_env.sh > /dev/null 2>&1

    if (~/.zshrc) exists and does not have emsdk then
      append to ~/.zshrc:

        # Emscripten SDK
        source ~/emsdk/emsdk_env.sh > /dev/null 2>&1

    run MAYBE_RESET

TROUBLESHOOTING:
  - **Command not found:** Source ~/emsdk/emsdk_env.sh or restart terminal
  - **Version issues:** Run `./emsdk install latest && ./emsdk activate latest`

## Step: ROM Files

OUTCOME:
  - roms/ directory exists in project root
  - All required ROM files are present

INPUTS:
  - {user_choice} = ["manual", "skip"]

PRE-REQUISITES:
  - Project directory exists

STEPS TO EXECUTE:

TRACE "Checking ROM files"
verify if (roms/) directory exists in project root
if not (exists) then
  create directory roms/
  TRACE "Created roms/ directory"

verify if all required ROM files exist in roms/:
  - 342-0349-B-C0-FF.bin (16KB)
  - 342-0273-A-US-UK.bin (4KB)
  - 341-0027.bin (256 bytes)
  - Thunderclock Plus ROM.bin (2KB)
  - Apple Mouse Interface Card ROM - 342-0270-C.bin (2KB)

if (all ROM files exist) then
  TRACE "All required ROM files present"
  end this verification step

if not (all ROM files exist) then
  TRACE "ROM files required for building"
  TRACE "ROMs are embedded into WASM at compile time"
  TRACE ""
  TRACE "Required files in roms/ directory:"
  TRACE "  - 342-0349-B-C0-FF.bin (16KB Apple IIe system ROM)"
  TRACE "  - 342-0273-A-US-UK.bin (4KB character generator ROM)"
  TRACE "  - 341-0027.bin (256 bytes Disk II controller ROM)"
  TRACE "  - Thunderclock Plus ROM.bin (2KB Thunderclock card ROM)"
  TRACE "  - Apple Mouse Interface Card ROM - 342-0270-C.bin (2KB Mouse Interface Card ROM)"
  TRACE ""
  TRACE "Optional: 341-0160-A-US-UK.bin (8KB alternate character ROM)"

  ask user {user_choice}: "How to provide ROM files?"
    option "manual": "I'll place ROM files in roms/ directory myself"
    option "skip": "Skip for now (build will fail without them)"

  if {user_choice} = "manual" then
    TRACE "Place all ROM files in roms/ directory"
    TRACE "Press Enter when finished"
    wait for user confirmation
    verify if all ROM files exist
    if (files still missing) then
      TRACE "Warning: ROM files missing. Build will fail."

  if {user_choice} = "skip" then
    TRACE "Skipping ROM check - add files before building"

TROUBLESHOOTING:
  - **Files not found:** Check exact filenames (case-sensitive)
  - **Build fails:** All ROM files must exist in roms/ before building WASM

## Step: Install Dependencies

OUTCOME:
  - npm packages installed successfully

PRE-REQUISITES:
  - Node.js 18+ is installed

STEPS TO EXECUTE:

TRACE "Installing npm dependencies"
run npm install in project root directory

TROUBLESHOOTING:
  - **Command fails:** Verify Node.js 18+ is installed
  - **Network errors:** Check internet connection

## Step: Build WASM

OUTCOME:
  - WebAssembly module built successfully
  - public/wasm-build/ contains emulator.js and emulator.wasm

PRE-REQUISITES:
  - CMake 3.20+ is installed
  - Emscripten SDK 3.0+ is installed and activated
  - All ROM files exist in roms/ directory
  - npm dependencies installed

STEPS TO EXECUTE:

TRACE "Building WebAssembly module"
TRACE "This may take a minute"
run npm run build:wasm in project root directory

verify if (public/wasm-build/emulator.js and public/wasm-build/emulator.wasm) exist
if (both exist) then
  TRACE "WASM build successful"
if not (both exist) then
  TRACE "WASM build failed - check errors above"

TROUBLESHOOTING:
  - **CMake errors:** Verify CMake 3.20+ is installed
  - **Emscripten not found:** Run `source ~/emsdk/emsdk_env.sh` or restart terminal
  - **ROM files missing:** Verify all ROM files exist in roms/ directory
  - **Build fails:** Check error messages for missing dependencies

## Step: Dev Server

OUTCOME:
  - Development server starts at localhost:3000
  - Emulator loads in browser

PRE-REQUISITES:
  - npm dependencies installed
  - WASM module built successfully

STEPS TO EXECUTE:

TRACE "Starting development server"
TRACE "Run: npm run dev"
TRACE "Open http://localhost:3000 in browser"
TRACE ""
TRACE "Hot-reload enabled for JavaScript changes"
TRACE "C++ changes require rebuilding WASM: npm run build:wasm"

TROUBLESHOOTING:
  - **Port in use:** Kill process on port 3000
  - **WASM load fails:** Rebuild with `npm run build:wasm`
  - **Module not found:** Run `npm install`

## Verification

Verify installation:

```bash
# Check installed tools
cmake --version        # Should be 3.20+
emcc --version         # Should be Emscripten 3.0+
node --version         # Should be 18+
npm --version          # Should be latest

# Verify ROM files
ls -lh roms/*.bin

# Verify WASM build output
ls -lh public/wasm-build/

# Start development server
npm run dev
# Open http://localhost:3000
```

## Build Commands Reference

```bash
npm install           # Install dependencies
npm run build:wasm    # Build WASM (required first time and after C++ changes)
npm run dev           # Start dev server at localhost:3000 (hot-reload for JS only)
npm run build         # Full production build (WASM + Vite bundle)
npm run clean         # Clean build artifacts
```
