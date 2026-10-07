cmake_minimum_required(VERSION 3.20)

# web-a2e: the browser build. The emulation is the core/ submodule
# (github.com/mikedaley/applem-core), shared with the native macOS app; this
# file builds the WebAssembly module around it. Build with `npm run
# build:wasm`. The core's tests build and run in the core itself.

project(web-a2e VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

if(NOT EMSCRIPTEN)
    message(FATAL_ERROR "web-a2e builds only for WebAssembly: npm run build:wasm. "
                        "The core's tests build in core/ (see core/README.md).")
endif()

if(NOT EXISTS ${CMAKE_SOURCE_DIR}/core/CMakeLists.txt)
    message(FATAL_ERROR "The core is missing. Run: git submodule update --init")
endif()
add_subdirectory(core)

add_executable(a2e src/bindings/wasm_interface.cpp)
target_link_libraries(a2e PRIVATE a2e_core)

# Emscripten-specific flags
# MAXIMUM_MEMORY is 512MB. The ceiling only has to hold the largest machine
# anyone can configure, and that is a IIgs with 8MB of fast RAM and two 32MB
# SmartPort volumes: about 72MB live, and a save state is a second copy of
# the images on top. At 256MB that aborted the module outright — and an
# aborted module answers nothing afterwards, so the symptom was every
# control in the app going dead rather than one save failing. Growth is
# still on, so the ceiling costs nothing until it is needed.
set_target_properties(a2e PROPERTIES
    SUFFIX ".js"
    LINK_FLAGS "\
        -s WASM=1 \
        -s MODULARIZE=1 \
        -s EXPORT_NAME='createA2EModule' \
        -s EXPORTED_FUNCTIONS='[ \
            \"_init\", \
            \"_reset\", \
            \"_warmReset\", \
            \"_runCycles\", \
            \"_consumeFrameSamples\", \
            \"_getFramebuffer\", \
            \"_getFramebufferSize\", \
            \"_getMachineCount\", \
            \"_getMachineKey\", \
            \"_getMachineKeyAt\", \
            \"_getMachineName\", \
            \"_getMachineProfileJSON\", \
            \"_getMachineProfileJSONAt\", \
            \"_hasSystemROM\", \
            \"_isMachineRunnable\", \
            \"_setMachine\", \
            \"_getIIgsMemoryKB\", \
            \"_setIIgsMemoryKB\", \
            \"_getVideoStandard\", \"_setVideoStandard\", \
            \"_forceRenderFrame\", \
            \"_isFrameReady\", \
            \"_keyDown\", \
            \"_keyUp\", \
            \"_handleRawKeyDown\", \
            \"_handleRawKeyUp\", \
            \"_releaseModifiers\", \
            \"_charToAppleKey\", \
            \"_pasteText\", \
            \"_pasteKey\", \
            \"_pastePending\", \
            \"_clearPasteBuffer\", \
            \"_insertDisk\", \
            \"_insertBlankDisk\", \
            \"_ejectDisk\", \
            \"_getDiskData\", \
            \"_getDiskDataAs\", \
            \"_getDiskSectorDataDOSOrder\", \
            \"_canSaveDiskAs\", \
            \"_getDiskNativeFormat\", \
            \"_addBreakpoint\", \
            \"_removeBreakpoint\", \
            \"_enableBreakpoint\", \
            \"_isBreakpointHit\", \
            \"_getBreakpointAddress\", \
            \"_addBreakpointRange\", \
            \"_removeBreakpointRange\", \
            \"_enableBreakpointRange\", \
            \"_addStackBreakpoint\", \
            \"_removeStackBreakpoint\", \
            \"_enableStackBreakpoint\", \
            \"_isStackBreakpointHit\", \
            \"_getStackBreakpointHitLow\", \
            \"_addBasicBreakpoint\", \
            \"_removeBasicBreakpoint\", \
            \"_clearBasicBreakpoints\", \
            \"_clearBasicBreakpointHit\", \
            \"_addBasicConditionRule\", \
            \"_removeBasicConditionRule\", \
            \"_clearBasicConditionRules\", \
            \"_getBasicConditionRuleHitId\", \
            \"_hasBasicBreakpoints\", \
            \"_isBasicBreakpointHit\", \
            \"_getBasicBreakLine\", \
            \"_isBasicProgramRunning\", \
            \"_stepBasicLine\", \
            \"_stepBasicStatement\", \
            \"_getBasicTxtptr\", \
            \"_getBasicStatementIndex\", \
            \"_getBasicStatementCountForLine\", \
            \"_getBasicStatementIndexForLine\", \
            \"_setBasicHeatMapEnabled\", \
            \"_clearBasicHeatMap\", \
            \"_getBasicHeatMapSize\", \
            \"_getBasicHeatMapData\", \
            \"_getBasicLineBytes\", \
            \"_getPC\", \
            \"_getPBR\", \
            \"_getDBR\", \
            \"_getDirectPage\", \
            \"_getCpuWidths\", \
            \"_setRegPBR\", \
            \"_setRegDBR\", \
            \"_setRegDirectPage\", \
            \"_getTraceEntrySize\", \
            \"_formatTraceRange\", \
            \"_getMemoryBanksJSON\", \
            \"_getBatteryRam\", \
            \"_getBatteryRamSize\", \
            \"_setBatteryRam\", \
            \"_batteryRamChanged\", \
            \"_setIIgsLoopbackCable\", \
            \"_hasIIgsLoopbackCable\", \
            \"_getSP\", \
            \"_getA\", \
            \"_getX\", \
            \"_getY\", \
            \"_getP\", \
            \"_getTotalCycles\", \
            \"_isPaused\", \
            \"_setPaused\", \
            \"_stepInstruction\", \
            \"_readMemory\", \
            \"_writeMemory\", \
            \"_disassembleAt\", \
            \"_disassembleRange\", \
            \"_getSoftSwitchState\", \
            \"_screenCodeToAscii\", \
            \"_readScreenText\", \
            \"_getDiskTrack\", \
            \"_getDiskPhase\", \
            \"_getDiskMotorOn\", \
            \"_getDiskWriteMode\", \
            \"_getDiskHeadPosition\", \
            \"_getSelectedDrive\", \
            \"_isDiskInserted\", \
            \"_isDiskModified\", \
            \"_getDiskFilename\", \
            \"_getDiskOverview\", \
            \"_getDiskTrackDetail\", \
            \"_getDiskRotation\", \
            \"_getDiskRevision\", \
            \"_getLastDiskByte\", \
            \"_exportState\", \
            \"_importState\", \
            \"_setMonochrome\", \
            \"_isMonochrome\", \
            \"_setVideoColorMode\", \
            \"_getVideoColorMode\", \
            \"_disassembleRawData\", \
            \"_getDisasmInstructions\", \
            \"_getDisasmInstructionLength\", \
            \"_malloc\", \
            \"_free\", \
            \"_getSlotCard\", \
            \"_setSlotCard\", \
            \"_isSlotInternal\", \
            \"_setSlotInternal\", \
            \"_isSlotEmpty\", \
            \"_getMockingboardWaveform\", \
            \"_setMockingboardChannelMute\", \
            \"_setMockingboardPhaseLock\", \
            \"_setMockingboardMono\", \
            \"_getMockingboardChannelMute\", \
            \"_isKeyboardReady\", \
            \"_setSpeedMultiplier\", \
            \"_getSpeedMultiplier\", \
            \"_mouseMove\", \
            \"_mouseButton\", \
            \"_isMouseCardInstalled\", \
            \"_getMouseCardState\", \
            \"_getMouseCardPIARegister\", \
            \"_isIRQPending\", \
            \"_isNMIPending\", \
            \"_isNMIEdge\", \
            \"_setRegA\", \
            \"_setRegX\", \
            \"_setRegY\", \
            \"_setRegSP\", \
            \"_setRegPC\", \
            \"_setRegP\", \
            \"_peekMemory\", \
            \"_readMainRAM\", \
            \"_addWatchpoint\", \
            \"_removeWatchpoint\", \
            \"_clearWatchpoints\", \
            \"_isWatchpointHit\", \
            \"_getWatchpointAddress\", \
            \"_getWatchpointValue\", \
            \"_isWatchpointWrite\", \
            \"_setTraceEnabled\", \
            \"_clearTrace\", \
            \"_getTraceCount\", \
            \"_getTraceHead\", \
            \"_getTraceBuffer\", \
            \"_getTraceCapacity\", \
            \"_setProfileEnabled\", \
            \"_clearProfile\", \
            \"_getProfileCycles\", \
            \"_addBeamBreakpoint\", \
            \"_removeBeamBreakpoint\", \
            \"_enableBeamBreakpoint\", \
            \"_clearAllBeamBreakpoints\", \
            \"_isBeamBreakpointHit\", \
            \"_getBeamBreakpointHitId\", \
            \"_getBeamBreakScanline\", \
            \"_getBeamBreakHPos\", \
            \"_getFrameCycle\", \
            \"_getBeamScanline\", \
            \"_getBeamHPos\", \
            \"_getBeamColumn\", \
            \"_isInVBL\", \
            \"_isInHBLANK\", \
            \"_stepOver\", \
            \"_stepOut\", \
            \"_clearTempBreakpoint\", \
            \"_isTempBreakpointHit\", \
            \"_getOpcodeMnemonic\", \
            \"_getOpcodeAddressingMode\", \
            \"_getCallStack\", \
            \"_getCallStackBuffer\", \
            \"_isLikelyReturnAddress\", \
            \"_evaluateCondition\", \
            \"_evaluateExpression\", \
            \"_getConditionError\", \
            \"_isDOS33Format\", \
            \"_getDOS33Catalog\", \
            \"_getDOS33CatalogBuffer\", \
            \"_getDOS33CatalogEntrySize\", \
            \"_getDOS33EntryFilename\", \
            \"_getDOS33EntryFileType\", \
            \"_getDOS33EntryFileTypeName\", \
            \"_getDOS33EntryIsLocked\", \
            \"_getDOS33EntrySectorCount\", \
            \"_readDOS33File\", \
            \"_getDOS33FileBuffer\", \
            \"_isProDOSFormat\", \
            \"_getProDOSVolumeInfo\", \
            \"_getProDOSVolumeName\", \
            \"_getProDOSTotalBlocks\", \
            \"_getProDOSCatalog\", \
            \"_getProDOSEntryFilename\", \
            \"_getProDOSEntryPath\", \
            \"_getProDOSEntryFileType\", \
            \"_getProDOSEntryFileTypeName\", \
            \"_getProDOSEntryStorageType\", \
            \"_getProDOSEntryEOF\", \
            \"_getProDOSEntryAuxType\", \
            \"_getProDOSEntryIsLocked\", \
            \"_getProDOSEntryBlocksUsed\", \
            \"_getProDOSEntryIsDirectory\", \
            \"_getProDOSEntryKeyPointer\", \
            \"_getProDOSDirectory\", \
            \"_readProDOSFile\", \
            \"_getProDOSFileBuffer\", \
            \"_mapProDOSFileType\", \
            \"_isPascalFormat\", \
            \"_getPascalVolumeInfo\", \
            \"_getPascalVolumeName\", \
            \"_getPascalTotalBlocks\", \
            \"_getPascalCatalog\", \
            \"_getPascalEntryFilename\", \
            \"_getPascalEntryFileType\", \
            \"_getPascalEntryFileTypeName\", \
            \"_getPascalEntryFileSize\", \
            \"_getPascalEntryBlocksUsed\", \
            \"_readPascalFile\", \
            \"_getPascalFileBuffer\", \
            \"_mapPascalFileType\", \
            \"_detokenizeApplesoft\", \
            \"_detokenizeIntegerBasic\", \
            \"_assembleSource\", \
            \"_getAsmOutputSize\", \
            \"_getAsmOutputBuffer\", \
            \"_getAsmOrigin\", \
            \"_getAsmErrorCount\", \
            \"_getAsmErrorLine\", \
            \"_getAsmErrorMessage\", \
            \"_getAsmErrorIsWarning\", \
            \"_getAsmSegmentCount\", \
            \"_getAsmSegmentAddress\", \
            \"_getAsmSegmentOffset\", \
            \"_getAsmSegmentLength\", \
            \"_getAsmLineCount\", \
            \"_getAsmLineRecordSize\", \
            \"_getAsmLineBuffer\", \
            \"_getAsmListing\", \
            \"_getAsmObjectType\", \
            \"_loadAsmIntoMemory\", \
            \"_getAsmSymbolCount\", \
            \"_getAsmSymbolName\", \
            \"_getAsmSymbolValue\", \
            \"_hasAsmObjectFile\", \
            \"_getAsmObjectFilename\", \
            \"_getAsmObjectDrive\", \
            \"_writeAsmObjectToDisk\", \
            \"_getAsmObjectStatusMessage\", \
            \"_isBasicErrorHit\", \
            \"_getBasicErrorLine\", \
            \"_getBasicErrorTxtptr\", \
            \"_getBasicErrorCode\", \
            \"_clearBasicError\", \
            \"_has35Drives\", \
            \"_insert35Disk\", \
            \"_eject35Disk\", \
            \"_is35DiskInserted\", \
            \"_is35DiskModified\", \
            \"_get35DiskFilename\", \
            \"_export35Disk\", \
            \"_is35MotorOn\", \
            \"_get35DiskTrack\", \
            \"_get35DiskSide\", \
            \"_has35Ejected\", \
            \"_export35Ejected\", \
            \"_clear35Ejected\", \
            \"_insertSmartPortImage\", \
            \"_ejectSmartPortImage\", \
            \"_isSmartPortROMPending\", \
            \"_isSmartPortImageInserted\", \
            \"_getSmartPortImageFilename\", \
            \"_isSmartPortImageModified\", \
            \"_getSmartPortImageData\", \
            \"_isSmartPortCardInstalled\", \
            \"_getSmartPortBlockData\", \
            \"_getSmartPortActivity\", \
            \"_getSmartPortActivityWrite\", \
            \"_clearSmartPortActivity\", \
            \"_loadBasicProgram\", \
            \"_refreshBasicVariables\", \
            \"_getBasicVariableName\", \
            \"_getBasicVariableType\", \
            \"_getBasicVariableAddress\", \
            \"_getBasicVariableReal\", \
            \"_getBasicVariableInt\", \
            \"_getBasicVariableString\", \
            \"_refreshBasicArrays\", \
            \"_getBasicArrayName\", \
            \"_getBasicArrayType\", \
            \"_getBasicArrayAddress\", \
            \"_getBasicArrayNumDims\", \
            \"_getBasicArrayDim\", \
            \"_getBasicArrayElementCount\", \
            \"_getBasicArrayReals\", \
            \"_getBasicArrayInts\", \
            \"_getBasicArrayStrings\", \
            \"_getBasicArrayStringsSize\", \
            \"_writeApplesoftFloat\", \
            \"_generateStereoAudioSamples\", \
            \"_setAudioVolume\", \
            \"_setAudioMuted\", \
            \"_setButton\", \
            \"_setPaddleValue\", \
            \"_setGamePortDevice\", \
            \"_getGamePortDevice\", \
            \"_setJoyportStick\", \
            \"_getJoyportStick\", \
            \"_getPaddleValue\", \
            \"_getDiskSectorData\", \
            \"_stopDiskMotor\", \
            \"_getTrackNibble\", \
            \"_getTrackNibbleCount\", \
            \"_getCurrentNibblePosition\", \
            \"_peekAuxMemory\", \
            \"_enableMemoryTracking\", \
            \"_clearMemoryTracking\", \
            \"_decayMemoryTracking\", \
            \"_getMemoryReadCounts\", \
            \"_getMemoryWriteCounts\", \
            \"_getMainRAM\", \
            \"_getAuxRAM\", \
            \"_getSystemROM\", \
            \"_setUKCharacterSet\", \
            \"_isUKCharacterSet\", \
            \"_getSoftSwitchStateHigh\", \
            \"_getSoftSwitchCatalogJSON\", \
            \"_getSoftSwitchValue\", \
            \"_addSwitchBreakpoint\", \
            \"_removeSwitchBreakpoint\", \
            \"_enableSwitchBreakpoint\", \
            \"_clearSwitchBreakpoints\", \
            \"_isSwitchBreakpointHit\", \
            \"_getSwitchBreakpointHitId\", \
            \"_getSwitchHitText\", \
            \"_disassembleWithFlowAnalysis\", \
            \"_disassembleWithFlowAnalysisMultiEntry\", \
            \"_getBasicDebugInfo\", \
            \"_isMockingboardEnabled\", \
            \"_getMockingboardPSGRegister\", \
            \"_getMockingboardPSGRegisters\", \
            \"_getMockingboardVIAIRQ\", \
            \"_getMockingboardVIAPort\", \
            \"_getMockingboardPSGWriteInfo\", \
            \"_getMockingboardVIATimerInfo\", \
            \"_setMockingboardDebugLogging\", \
            \"_enableNoSlotClock\", \
            \"_isNoSlotClockEnabled\", \
            \"_serialReceive\", \
            \"_isSSCInstalled\", \
            \"_setSerialTxCallback\", \
            \"_isParallelCardInstalled\", \
            \"_setParallelTxCallback\" \
        ]' \
        -s EXPORTED_RUNTIME_METHODS='[\"ccall\", \"cwrap\", \"UTF8ToString\", \"stringToUTF8\", \"HEAPU8\", \"HEAPF32\"]' \
        -s ALLOW_MEMORY_GROWTH=1 \
        -s INITIAL_MEMORY=33554432 \
        -s MAXIMUM_MEMORY=536870912 \
        -s NO_EXIT_RUNTIME=1 \
        -s ASYNCIFY=0 \
        --no-entry \
        -O3 \
        -flto \
    "
)

# Copy output to public directory
add_custom_command(TARGET a2e POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy $<TARGET_FILE:a2e> ${CMAKE_SOURCE_DIR}/public/a2e.js
    COMMAND ${CMAKE_COMMAND} -E copy ${CMAKE_BINARY_DIR}/a2e.wasm ${CMAKE_SOURCE_DIR}/public/a2e.wasm
    COMMENT "Copying WASM files to public directory"
)
