# WASM Bindings Map

**Location**: `src/bindings/wasm_interface.cpp` (1789 lines)

## Overview
Single-file interface layer exposing C++ emulator core to JavaScript via WASM exports. All functions marked with `EMSCRIPTEN_KEEPALIVE` are callable from JavaScript.

**Key Pattern**: All exported functions must be listed in `CMakeLists.txt` EXPORTED_FUNCTIONS.

**Convention**: JavaScript allocates WASM heap memory, passes pointers to C++ functions. Uses `stringToUTF8/UTF8ToString` for string conversion.

## Exported Functions (261 bindings)

### Core Emulation
- `init()` - Initialize emulator instance
- `reset()` - Cold reset (like power cycle)
- `warmReset()` - Warm reset (like Ctrl+Reset)
- `runCycles(int)` - Execute N CPU cycles
- `setSpeedMultiplier(int)` - Set speed 1x, 2x, 4x, etc.
- `getSpeedMultiplier()` - Get current speed multiplier
- `isPaused()` - Check if emulation paused
- `setPaused(bool)` - Pause/resume emulation

### Audio
- `generateStereoAudioSamples(float*, int)` - Fill audio buffer
- `setAudioVolume(float)` - Set volume 0.0-1.0
- `setAudioMuted(bool)` - Mute/unmute
- `consumeFrameSamples()` - Drain frame audio

### Video
- `getFramebuffer()` - Get 560x384 RGBA buffer pointer
- `getFramebufferSize()` - Buffer size constant
- `forceRenderFrame()` - Force immediate render
- `isFrameReady()` - Check if frame complete (60Hz)
- `setUKCharacterSet(bool)` - UK/US character ROM
- `isUKCharacterSet()` - Get character set mode
- `setMonochrome(bool)` - Monochrome display mode
- `isMonochrome()` - Get monochrome state

### Input - Keyboard
- `keyDown(int)` - Press Apple key
- `keyUp(int)` - Release Apple key
- `handleRawKeyDown(int, bool, bool, bool, bool, bool)` - Browser keycode with modifiers
- `handleRawKeyUp(int, bool, bool, bool, bool)` - Browser keycode release
- `charToAppleKey(int)` - Convert character to Apple keycode
- `isKeyboardReady()` - Check keyboard strobe clear

### Input - Joystick
- `setButton(int, bool)` - Press/release joystick button
- `setPaddleValue(int, int)` - Set paddle 0-255
- `getPaddleValue(int)` - Get paddle value

### Input - Mouse
- `mouseMove(int, int)` - Move mouse (dx, dy)
- `mouseButton(bool)` - Press/release mouse button

### CPU Registers - Getters
- `getPC()` - Program counter
- `getSP()` - Stack pointer
- `getA()` - Accumulator
- `getX()` - X register
- `getY()` - Y register
- `getP()` - Processor status
- `getTotalCycles()` - Total cycles executed
- `isIRQPending()` - IRQ interrupt pending
- `isNMIPending()` - NMI interrupt pending
- `isNMIEdge()` - NMI edge detected

### CPU Registers - Setters
- `setRegA(uint8_t)` - Set accumulator
- `setRegX(uint8_t)` - Set X register
- `setRegY(uint8_t)` - Set Y register
- `setRegSP(uint8_t)` - Set stack pointer
- `setRegPC(uint16_t)` - Set program counter
- `setRegP(uint8_t)` - Set processor status

### Memory - Read
- `readMemory(uint16_t)` - Read byte (triggers side effects)
- `peekMemory(uint16_t)` - Peek byte (no side effects)
- `readMainRAM(uint16_t)` - Read main RAM directly
- `peekAuxMemory(uint16_t)` - Peek auxiliary RAM
- `getMainRAM()` - Get 64KB main RAM pointer
- `getAuxRAM()` - Get 64KB aux RAM pointer
- `getSystemROM()` - Get 16KB ROM pointer

### Memory - Write
- `writeMemory(uint16_t, uint8_t)` - Write byte

### Soft Switches
- `getSoftSwitchState()` - Get switch state (low 32 bits)
- `getSoftSwitchStateHigh()` - Get switch state (high 32 bits)

### Screen Text
- `screenCodeToAscii(uint8_t)` - Convert screen code to ASCII
- `readScreenText(int, int, int, int)` - Read text from screen buffer

### Disk Operations
- `insertDisk(int, uint8_t*, int, const char*)` - Insert disk image
- `insertBlankDisk(int)` - Insert blank DOS 3.3 disk
- `ejectDisk(int)` - Eject disk
- `getDiskData(int, size_t*)` - Export disk image data
- `getDiskSectorData(int, size_t*)` - Get raw sector data
- `isDiskInserted(int)` - Check if disk inserted
- `isDiskModified(int)` - Check if disk modified
- `getDiskFilename(int)` - Get disk filename
- `stopDiskMotor()` - Force motor off

### Disk State
- `getDiskTrack(int)` - Current track
- `getDiskPhase(int)` - Stepper phase states
- `getDiskMotorOn(int)` - Motor running
- `getDiskWriteMode(int)` - Write mode (Q7)
- `getDiskHeadPosition(int)` - Quarter-track position
- `getSelectedDrive()` - Drive select (0 or 1)
- `getLastDiskByte()` - Data latch value
- `getTrackNibble(int, int, int)` - Get nibble from track
- `getTrackNibbleCount(int, int)` - Track length
- `getCurrentNibblePosition(int)` - Nibble position

### Beam Position
- `getFrameCycle()` - Current cycle in frame
- `getBeamScanline()` - Scanline 0-261
- `getBeamHPos()` - Horizontal position 0-64
- `getBeamColumn()` - Column 0-39 or -1
- `isInVBL()` - Vertical blank
- `isInHBLANK()` - Horizontal blank

### Debugging - CPU Breakpoints
- `addBreakpoint(uint16_t)` - Add address breakpoint
- `removeBreakpoint(uint16_t)` - Remove breakpoint
- `enableBreakpoint(uint16_t, bool)` - Enable/disable
- `isBreakpointHit()` - Check if hit
- `getBreakpointAddress()` - Get hit address

### Debugging - CPU Stepping
- `stepInstruction()` - Execute one instruction
- `stepOver()` - Step over JSR
- `stepOut()` - Step out of subroutine
- `clearTempBreakpoint()` - Clear temp breakpoint
- `isTempBreakpointHit()` - Check temp breakpoint

### Debugging - BASIC Breakpoints
- `addBasicBreakpoint(uint16_t, int)` - Add line/statement breakpoint
- `removeBasicBreakpoint(uint16_t, int)` - Remove breakpoint
- `clearBasicBreakpoints()` - Clear all
- `clearBasicBreakpointHit()` - Clear hit flag
- `hasBasicBreakpoints()` - Check if any set
- `isBasicBreakpointHit()` - Check if hit
- `getBasicBreakLine()` - Get line number
- `isBasicProgramRunning()` - Check if running
- `isBasicErrorHit()` - Check if error occurred
- `getBasicErrorLine()` - Get error line
- `getBasicErrorTxtptr()` - Get error TXTPTR
- `getBasicErrorCode()` - Get error code
- `clearBasicError()` - Clear error state

### Debugging - BASIC Stepping
- `stepBasicLine()` - Execute one line
- `stepBasicStatement()` - Execute one statement
- `getBasicTxtptr()` - Get TXTPTR
- `getBasicStatementIndex()` - Get statement index
- `getBasicDebugInfo(uint16_t*, uint16_t*, uint16_t*, uint16_t*)` - Get TXTTAB/VARTAB/CURLIN/TXTPTR
- `getBasicLineBytes(uint8_t*, int*, int*)` - Debug line bytes
- `loadBasicProgram(const char*)` - Load BASIC program from source text

### Debugging - BASIC Condition Rules
- `addBasicConditionRule(int, const char*)` - Add rule with expression
- `removeBasicConditionRule(int)` - Remove rule by ID
- `clearBasicConditionRules()` - Clear all rules
- `getBasicConditionRuleHitId()` - Get ID of hit rule

### Debugging - BASIC Heat Map
- `setBasicHeatMapEnabled(bool)` - Enable/disable heat map tracking
- `clearBasicHeatMap()` - Clear all heat map data
- `getBasicHeatMapSize()` - Get number of tracked lines
- `getBasicHeatMapData(uint16_t*, uint32_t*, int)` - Get line execution counts

### Debugging - Watchpoints
- `addWatchpoint(uint16_t, uint16_t, uint8_t)` - Add memory watchpoint
- `removeWatchpoint(uint16_t)` - Remove watchpoint
- `clearWatchpoints()` - Clear all
- `isWatchpointHit()` - Check if hit
- `getWatchpointAddress()` - Get hit address
- `getWatchpointValue()` - Get value read/written
- `isWatchpointWrite()` - Check if write

### Debugging - Beam Breakpoints
- `addBeamBreakpoint(int16_t, int16_t)` - Add scanline/hpos breakpoint
- `removeBeamBreakpoint(int32_t)` - Remove by ID
- `enableBeamBreakpoint(int32_t, bool)` - Enable/disable
- `clearAllBeamBreakpoints()` - Clear all
- `isBeamBreakpointHit()` - Check if hit
- `getBeamBreakpointHitId()` - Get hit ID
- `getBeamBreakScanline()` - Get scanline
- `getBeamBreakHPos()` - Get horizontal position

### Debugging - Trace
- `setTraceEnabled(bool)` - Enable instruction trace
- `clearTrace()` - Clear trace buffer
- `getTraceCount()` - Get entry count
- `getTraceHead()` - Get ring buffer head
- `getTraceBuffer()` - Get trace buffer pointer
- `getTraceCapacity()` - Get buffer capacity

### Debugging - Profiling
- `setProfileEnabled(bool)` - Enable cycle profiling
- `clearProfile()` - Clear profile data
- `getProfileCycles()` - Get cycle counts per address

### Debugging - Condition Evaluator
- `evaluateCondition(const char*)` - Eval C-style condition
- `evaluateExpression(const char*)` - Eval numeric expression
- `getConditionError()` - Get last error

### Memory Tracking
- `enableMemoryTracking(bool)` - Enable heat map tracking
- `clearMemoryTracking()` - Clear tracking data
- `decayMemoryTracking(uint8_t)` - Decay heat values
- `getMemoryReadCounts()` - Get read count array
- `getMemoryWriteCounts()` - Get write count array

### State Serialization
- `exportState(size_t*)` - Export full state
- `importState(const uint8_t*, size_t)` - Import state

### Disassembler
- `disassembleAt(uint16_t)` - Disassemble at address
- `disassembleRawData(const uint8_t*, size_t, uint16_t)` - Disassemble buffer
- `getDisasmInstructions()` - Get disasm result array
- `getDisasmInstructionLength(uint8_t)` - Get opcode length
- `disassembleWithFlowAnalysis(const uint8_t*, size_t, uint16_t)` - Flow analysis
- `disassembleWithFlowAnalysisMultiEntry(const uint8_t*, size_t, uint16_t, const uint16_t*, size_t)` - Multi-entry flow
- `getOpcodeMnemonic(uint8_t)` - Get mnemonic string
- `getOpcodeAddressingMode(uint8_t)` - Get addressing mode for opcode

### Mockingboard
- `isMockingboardEnabled()` - Check if enabled
- `getMockingboardPSGRegister(int, int)` - Get AY-3-8910 register
- `getMockingboardPSGRegisters(int)` - Get all 16 registers
- `getMockingboardVIAIRQ(int)` - Get VIA IRQ state
- `getMockingboardVIAPort(int, int)` - Get VIA port register
- `getMockingboardPSGWriteInfo(int, int)` - Get write debug info
- `getMockingboardVIATimerInfo(int, int)` - Get timer state
- `setMockingboardDebugLogging(bool)` - Enable debug logging
- `setMockingboardChannelMute(int, int, bool)` - Mute channel
- `getMockingboardChannelMute(int, int)` - Get mute state
- `getMockingboardWaveform(int, int, float*, int)` - Generate waveform samples

### Mouse Card
- `isMouseCardInstalled()` - Check if installed
- `getMouseCardState(int)` - Get state field (18 fields)
- `getMouseCardPIARegister(int)` - Get PIA register (8 registers)

### SmartPort Hard Drive
- `insertSmartPortImage(int, uint8_t*, int, const char*)` - Insert hard drive image
- `ejectSmartPortImage(int)` - Eject image
- `isSmartPortImageInserted(int)` - Check if inserted
- `getSmartPortImageFilename(int)` - Get filename
- `isSmartPortImageModified(int)` - Check if modified
- `getSmartPortImageData(int, size_t*)` - Export complete image data
- `getSmartPortBlockData(int, size_t*)` - Get raw block data (for filesystem parsing)
- `isSmartPortCardInstalled()` - Check if card installed
- `getSmartPortActivity(int)` - Get activity LED state
- `getSmartPortActivityWrite(int)` - Check if write activity
- `clearSmartPortActivity()` - Clear activity flag

### Expansion Slots
- `getSlotCard(int)` - Get card name in slot
- `setSlotCard(int, const char*)` - Install card in slot
- `isSlotEmpty(int)` - Check if slot empty

### DOS 3.3 Filesystem
- `isDOS33Format(const uint8_t*, int)` - Detect DOS 3.3 format
- `getDOS33Catalog(const uint8_t*, int)` - Read catalog
- `getDOS33CatalogBuffer()` - Get catalog array pointer
- `getDOS33CatalogEntrySize()` - Get struct size
- `getDOS33EntryFilename(int)` - Get filename
- `getDOS33EntryFileType(int)` - Get file type byte
- `getDOS33EntryFileTypeName(int)` - Get file type name
- `getDOS33EntryIsLocked(int)` - Check lock flag
- `getDOS33EntrySectorCount(int)` - Get sector count
- `readDOS33File(const uint8_t*, int, int)` - Read file data
- `getDOS33FileBuffer()` - Get file buffer pointer

### ProDOS Filesystem
- `isProDOSFormat(const uint8_t*, int)` - Detect ProDOS format
- `getProDOSVolumeInfo(const uint8_t*, int)` - Parse volume info
- `getProDOSVolumeName()` - Get volume name
- `getProDOSTotalBlocks()` - Get total blocks
- `getProDOSCatalog(const uint8_t*, int)` - Read catalog
- `getProDOSDirectory(const uint8_t*, int, int, const char*)` - Read subdirectory
- `getProDOSEntryFilename(int)` - Get filename
- `getProDOSEntryPath(int)` - Get full path
- `getProDOSEntryFileType(int)` - Get file type
- `getProDOSEntryFileTypeName(int)` - Get type name
- `getProDOSEntryStorageType(int)` - Get storage type
- `getProDOSEntryEOF(int)` - Get end-of-file
- `getProDOSEntryAuxType(int)` - Get aux type
- `getProDOSEntryIsLocked(int)` - Check lock flag
- `getProDOSEntryBlocksUsed(int)` - Get block count
- `getProDOSEntryIsDirectory(int)` - Check if directory
- `getProDOSEntryKeyPointer(int)` - Get key block pointer
- `readProDOSFile(const uint8_t*, int, int)` - Read file data
- `getProDOSFileBuffer()` - Get file buffer pointer
- `mapProDOSFileType(uint8_t)` - Map ProDOS type to viewer type

### Pascal Filesystem
- `isPascalFormat(const uint8_t*, int)` - Detect Apple Pascal format
- `getPascalVolumeInfo(const uint8_t*, int)` - Parse volume info
- `getPascalVolumeName()` - Get volume name
- `getPascalTotalBlocks()` - Get total blocks
- `getPascalCatalog(const uint8_t*, int)` - Read catalog
- `getPascalEntryFilename(int)` - Get filename
- `getPascalEntryFileType(int)` - Get file type
- `getPascalEntryFileTypeName(int)` - Get type name
- `getPascalEntryFileSize(int)` - Get file size
- `getPascalEntryBlocksUsed(int)` - Get block count
- `readPascalFile(const uint8_t*, int, int)` - Read file data
- `mapPascalFileType(uint8_t)` - Map Pascal type to viewer type

### BASIC Detokenization
- `detokenizeApplesoft(const uint8_t*, int, bool)` - Detokenize Applesoft
- `detokenizeIntegerBasic(const uint8_t*, int, bool)` - Detokenize Integer BASIC

### Assembler
- `assembleSource(const char*)` - Assemble 6502 source
- `getAsmOutputSize()` - Get output byte count
- `getAsmOutputBuffer()` - Get assembled bytes
- `getAsmOrigin()` - Get origin address
- `getAsmErrorCount()` - Get error count
- `getAsmErrorLine(int)` - Get error line number
- `getAsmErrorMessage(int)` - Get error message
- `getAsmSymbolCount()` - Get symbol count
- `getAsmSymbolName(int)` - Get symbol name
- `getAsmSymbolValue(int)` - Get symbol value
- `loadAsmIntoMemory()` - Load assembled code into RAM

### Call Stack Analysis
- `getCallStack()` - Analyze stack for JSR calls
- `getCallStackBuffer()` - Get call stack array
- `isLikelyReturnAddress(uint16_t)` - Validate return address

### No-Slot Clock (DS1215)
- `enableNoSlotClock(bool)` - Enable/disable no-slot clock
- `isNoSlotClockEnabled()` - Check if enabled
