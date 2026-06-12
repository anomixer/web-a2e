NAME: setup.examples[macos]
DESCRIPTION: Working examples from successful Apple //e emulator setup on macOS

# Apple //e Emulator Setup - macOS Working Examples

These are the actual commands that successfully set up the development environment on macOS (Apple Silicon, macOS Sequoia 24.6.0).

## Step 1: CMake Installation

### Check if CMake is installed
```bash
cmake --version
# Output if not installed: /bin/bash: cmake: command not found
```

### Verify Homebrew is installed
```bash
brew --version
# Output: Homebrew 5.0.13
```

### Install CMake via Homebrew
```bash
brew install cmake
# Output:
# ==> Fetching downloads for: cmake
# ==> Pouring cmake--4.2.3.arm64_sequoia.bottle.tar.gz
# 🍺  /opt/homebrew/Cellar/cmake/4.2.3: 4,016 files, 63.7MB
```

### Verify installation
```bash
cmake --version
# Output: cmake version 4.2.3
```

## Step 2: Node.js Verification

### Check Node.js version
```bash
node --version
# Output: v22.19.0 (already installed, requirement: 18+)
```

## Step 3: Emscripten SDK Installation

### Check if emsdk exists
```bash
ls -la ~/emsdk 2>/dev/null && echo "emsdk directory exists" || echo "emsdk directory not found"
# Output: emsdk directory not found
```

### Clone Emscripten SDK repository
```bash
git clone https://github.com/emscripten-core/emsdk.git ~/emsdk
# Output: Cloning into '/Users/Shawn/emsdk'...
```

### Install latest Emscripten SDK
```bash
cd ~/emsdk && ./emsdk install latest
# Output:
# Resolving SDK alias 'latest' to '5.0.0'
# Installing SDK 'sdk-releases-e44d3cc557d78155966478aa2bd8dec657609619-64bit'..
# Installing tool 'node-22.16.0-64bit'..
# Installing tool 'python-3.13.3-64bit'..
# Installing tool 'releases-e44d3cc557d78155966478aa2bd8dec657609619-64bit'..
# Done installing SDK 'sdk-releases-e44d3cc557d78155966478aa2bd8dec657609619-64bit'.
```

### Activate latest Emscripten SDK
```bash
cd ~/emsdk && ./emsdk activate latest
# Output:
# Resolving SDK alias 'latest' to '5.0.0'
# Setting the following tools as active:
#    node-22.16.0-64bit
#    python-3.13.3-64bit
#    releases-e44d3cc557d78155966478aa2bd8dec657609619-64bit
```

### Source emsdk environment and verify
```bash
source ~/emsdk/emsdk_env.sh && emcc --version
# Output:
# emcc (Emscripten gcc/clang-like replacement + linker emulating GNU ld) 5.0.0
# Setting up EMSDK environment (suppress these messages with EMSDK_QUIET=1)
# Adding directories to PATH:
# PATH += /Users/Shawn/emsdk
# PATH += /Users/Shawn/emsdk/upstream/emscripten
```

### Check which shell config files exist
```bash
ls -la ~/.bashrc ~/.zshrc 2>&1 | grep -v "No such file"
# Output:
# -rw-r--r--@ 1 Shawn  staff  1367 Feb  4 19:57 /Users/Shawn/.bashrc
# -rw-r--r--@ 1 Shawn  staff  2458 Feb  4 19:58 /Users/Shawn/.zshrc
```

### Add emsdk to .bashrc
```bash
echo '' >> ~/.bashrc && echo '# Emscripten SDK' >> ~/.bashrc && echo 'source ~/emsdk/emsdk_env.sh > /dev/null 2>&1' >> ~/.bashrc && echo "Added to .bashrc"
# Output: Added to .bashrc
```

### Add emsdk to .zshrc
```bash
echo '' >> ~/.zshrc && echo '# Emscripten SDK' >> ~/.zshrc && echo 'source ~/emsdk/emsdk_env.sh > /dev/null 2>&1' >> ~/.zshrc && echo "Added to .zshrc"
# Output: Added to .zshrc
```

## Step 4: ROM Files Verification

### Check ROM files directory
```bash
ls -lh roms/
# Output:
# total 104
# -rw-r--r--@ 1 Shawn  staff   256B Jan 18 21:23 341-0027.bin
# -rw-r--r--@ 1 Shawn  staff   8.0K Jan 18 21:23 341-0160-A-US-UK.bin
# -rw-r--r--@ 1 Shawn  staff   8.0K Jan 18 21:23 342-0273-A-US-UK.bin
# -rw-r--r--@ 1 Shawn  staff    16K Jan 18 21:23 342-0349-B-C0-FF.bin
# -rw-r--r--@ 1 Shawn  staff   2.0K Jan 31 19:09 Apple Mouse Interface Card ROM - 342-0270-C.bin
# -rw-r--r--@ 1 Shawn  staff   2.0K Jan 27 15:17 Thunderclock Plus ROM.bin
```

## Step 5: Install Dependencies

### Install npm packages
```bash
npm install
# Output:
# added 11 packages, and audited 12 packages in 1s
# 3 packages are looking for funding
```

## Step 6: Build WebAssembly Module

### Build WASM (requires sourcing emsdk first)
```bash
source ~/emsdk/emsdk_env.sh && npm run build:wasm
# Output:
# > web-a2e@1.0.0 build:wasm
# > mkdir -p build && cd build && emcmake cmake .. && emmake make -j$(nproc 2>/dev/null || sysctl -n hw.ncpu)
#
# -- Configuring done (0.9s)
# -- Generating done (0.0s)
# -- Build files have been written to: /Users/Shawn/code/git/[mikedaley]/web-a2e/build
# [  3%] Generating ROM data arrays
# Generated /Users/Shawn/code/git/[mikedaley]/web-a2e/build/generated/roms.cpp
# ...
# [100%] Linking CXX executable a2e.js
# Copying WASM files to public directory
# [100%] Built target a2e
```

### Verify WASM build output
```bash
ls -lh public/a2e.*
# Output:
# -rw-r--r--@ 1 Shawn  staff    36K Feb  8 17:47 public/a2e.js
# -rwxr-xr-x@ 1 Shawn  staff   463K Feb  8 17:47 public/a2e.wasm
```

## Step 7: Start Development Server

### Start dev server
```bash
npm run dev
# Opens dev server at http://localhost:3000
```

## Compiler Information

### Check Emscripten compiler version
```bash
source ~/emsdk/emsdk_env.sh && emcc --version
# Output:
# emcc (Emscripten gcc/clang-like replacement + linker emulating GNU ld) 5.0.0
```

### Check underlying Clang version
```bash
source ~/emsdk/emsdk_env.sh && ~/emsdk/upstream/bin/clang --version
# Output:
# clang version 23.0.0git (https:/github.com/llvm/llvm-project 358db292cc6a9a8a5448a296f643312289f328d7)
# Target: unknown
# Thread model: posix
```

## Verification Commands

### Complete system verification
```bash
# Check all tools
cmake --version        # 4.2.3
node --version         # v22.19.0
npm --version          # 10.9.2
source ~/emsdk/emsdk_env.sh && emcc --version  # 5.0.0

# Verify ROM files
ls -lh roms/*.bin

# Verify WASM build output
ls -lh public/a2e.*
```

## Important Notes

### Emscripten Environment
- **IMPORTANT**: You must run `source ~/emsdk/emsdk_env.sh` in any terminal before building WASM
- This was added to ~/.bashrc and ~/.zshrc, so new terminal sessions will have it automatically
- Existing terminal sessions need to source it manually or restart the terminal

### Build Commands Reference
```bash
npm install           # Install dependencies (once)
npm run build:wasm    # Build WASM (after C++ changes, requires emsdk sourced)
npm run dev           # Start dev server at localhost:3000
npm run build         # Full production build
npm run clean         # Clean build artifacts
```

### Live Reload Behavior
- **JavaScript changes** (src/js/): Auto hot-reload via Vite
- **C++ changes** (src/core/): Must run `npm run build:wasm` then refresh browser
- **HTML/CSS** (public/): Usually hot-reload

## System Information

- **OS**: macOS Sequoia 24.6.0
- **Architecture**: Apple Silicon (arm64)
- **Package Manager**: Homebrew 5.0.13
- **Build Date**: February 8, 2026
- **CMake**: 4.2.3
- **Node.js**: v22.19.0
- **Emscripten**: 5.0.0
- **Clang**: 23.0.0git
