#include "../core/emulator.hpp"
#include "../core/disassembler/disassembler.hpp"
#include <cstdlib>
#include <cstring>
#include <emscripten.h>

// Global emulator instance
static a2e::Emulator *g_emulator = nullptr;

// Helper macros to reduce repetitive null checks
#define REQUIRE_EMULATOR() do { if (!g_emulator) return; } while(0)
#define REQUIRE_EMULATOR_OR(default_val) do { if (!g_emulator) return (default_val); } while(0)

extern "C" {

EMSCRIPTEN_KEEPALIVE
void init() {
  if (!g_emulator) {
    g_emulator = new a2e::Emulator();
    g_emulator->init();
  }
}

EMSCRIPTEN_KEEPALIVE
void reset() {
  REQUIRE_EMULATOR();
  g_emulator->reset();
}

EMSCRIPTEN_KEEPALIVE
void warmReset() {
  REQUIRE_EMULATOR();
  g_emulator->warmReset();
}

EMSCRIPTEN_KEEPALIVE
void runCycles(int cycles) {
  REQUIRE_EMULATOR();
  g_emulator->runCycles(cycles);
}

EMSCRIPTEN_KEEPALIVE
int generateAudioSamples(float *buffer, int sampleCount) {
  REQUIRE_EMULATOR_OR(0);
  return g_emulator->generateAudioSamples(buffer, sampleCount);
}

EMSCRIPTEN_KEEPALIVE
int generateStereoAudioSamples(float *buffer, int sampleCount) {
  REQUIRE_EMULATOR_OR(0);
  return g_emulator->generateStereoAudioSamples(buffer, sampleCount);
}

EMSCRIPTEN_KEEPALIVE
int consumeFrameSamples() {
  REQUIRE_EMULATOR_OR(0);
  return g_emulator->consumeFrameSamples();
}

EMSCRIPTEN_KEEPALIVE
uint8_t *getFramebuffer() {
  REQUIRE_EMULATOR_OR(nullptr);
  return const_cast<uint8_t *>(g_emulator->getFramebuffer());
}

EMSCRIPTEN_KEEPALIVE
int getFramebufferSize() { return a2e::FRAMEBUFFER_SIZE; }

EMSCRIPTEN_KEEPALIVE
bool isFrameReady() {
  REQUIRE_EMULATOR_OR(false);
  bool ready = g_emulator->isFrameReady();
  if (ready) {
    g_emulator->clearFrameReady();
  }
  return ready;
}

EMSCRIPTEN_KEEPALIVE
void keyDown(int keycode) {
  REQUIRE_EMULATOR();
  g_emulator->keyDown(keycode);
}

EMSCRIPTEN_KEEPALIVE
void keyUp(int keycode) {
  REQUIRE_EMULATOR();
  g_emulator->keyUp(keycode);
}

EMSCRIPTEN_KEEPALIVE
int handleRawKeyDown(int browserKeycode, bool shift, bool ctrl, bool alt,
                     bool meta, bool capsLock) {
  REQUIRE_EMULATOR_OR(-1);
  return g_emulator->handleRawKeyDown(browserKeycode, shift, ctrl, alt, meta,
                                      capsLock);
}

EMSCRIPTEN_KEEPALIVE
void handleRawKeyUp(int browserKeycode, bool shift, bool ctrl, bool alt,
                    bool meta) {
  REQUIRE_EMULATOR();
  g_emulator->handleRawKeyUp(browserKeycode, shift, ctrl, alt, meta);
}

EMSCRIPTEN_KEEPALIVE
void setButton(int button, bool pressed) {
  REQUIRE_EMULATOR();
  g_emulator->setButton(button, pressed);
}

EMSCRIPTEN_KEEPALIVE
void setPaddleValue(int paddle, int value) {
  REQUIRE_EMULATOR();
  g_emulator->setPaddleValue(paddle, value);
}

EMSCRIPTEN_KEEPALIVE
int getPaddleValue(int paddle) {
  REQUIRE_EMULATOR_OR(128);
  return g_emulator->getPaddleValue(paddle);
}

EMSCRIPTEN_KEEPALIVE
bool isKeyboardReady() {
  REQUIRE_EMULATOR_OR(true);
  return g_emulator->isKeyboardReady();
}

EMSCRIPTEN_KEEPALIVE
void setSpeedMultiplier(int multiplier) {
  REQUIRE_EMULATOR();
  g_emulator->setSpeedMultiplier(multiplier);
}

EMSCRIPTEN_KEEPALIVE
int getSpeedMultiplier() {
  REQUIRE_EMULATOR_OR(1);
  return g_emulator->getSpeedMultiplier();
}

EMSCRIPTEN_KEEPALIVE
bool insertDisk(int drive, uint8_t *data, int size, const char *filename) {
  REQUIRE_EMULATOR_OR(false);
  return g_emulator->insertDisk(drive, data, size, filename);
}

EMSCRIPTEN_KEEPALIVE
bool insertBlankDisk(int drive) {
  REQUIRE_EMULATOR_OR(false);
  return g_emulator->insertBlankDisk(drive);
}

EMSCRIPTEN_KEEPALIVE
void ejectDisk(int drive) {
  REQUIRE_EMULATOR();
  g_emulator->ejectDisk(drive);
}

EMSCRIPTEN_KEEPALIVE
uint8_t *getDiskData(int drive, size_t *size) {
  if (!g_emulator) { *size = 0; return nullptr; }
  return const_cast<uint8_t *>(g_emulator->exportDiskData(drive, size));
}

EMSCRIPTEN_KEEPALIVE
const uint8_t *getDiskSectorData(int drive, size_t *size) {
  if (!g_emulator) { *size = 0; return nullptr; }
  return g_emulator->getDiskData(drive, size);
}

EMSCRIPTEN_KEEPALIVE
void addBreakpoint(uint16_t address) {
  REQUIRE_EMULATOR();
  g_emulator->addBreakpoint(address);
}

EMSCRIPTEN_KEEPALIVE
void removeBreakpoint(uint16_t address) {
  REQUIRE_EMULATOR();
  g_emulator->removeBreakpoint(address);
}

EMSCRIPTEN_KEEPALIVE
void enableBreakpoint(uint16_t address, bool enabled) {
  REQUIRE_EMULATOR();
  g_emulator->enableBreakpoint(address, enabled);
}

EMSCRIPTEN_KEEPALIVE
bool isBreakpointHit() {
  REQUIRE_EMULATOR_OR(false);
  return g_emulator->isBreakpointHit();
}

EMSCRIPTEN_KEEPALIVE
uint16_t getBreakpointAddress() {
  REQUIRE_EMULATOR_OR(0);
  return g_emulator->getBreakpointAddress();
}

EMSCRIPTEN_KEEPALIVE
uint16_t getPC() {
  REQUIRE_EMULATOR_OR(0);
  return g_emulator->getPC();
}

EMSCRIPTEN_KEEPALIVE
uint8_t getSP() {
  REQUIRE_EMULATOR_OR(0);
  return g_emulator->getSP();
}

EMSCRIPTEN_KEEPALIVE
uint8_t getA() {
  REQUIRE_EMULATOR_OR(0);
  return g_emulator->getA();
}

EMSCRIPTEN_KEEPALIVE
uint8_t getX() {
  REQUIRE_EMULATOR_OR(0);
  return g_emulator->getX();
}

EMSCRIPTEN_KEEPALIVE
uint8_t getY() {
  REQUIRE_EMULATOR_OR(0);
  return g_emulator->getY();
}

EMSCRIPTEN_KEEPALIVE
uint8_t getP() {
  REQUIRE_EMULATOR_OR(0);
  return g_emulator->getP();
}

EMSCRIPTEN_KEEPALIVE
uint64_t getTotalCycles() {
  REQUIRE_EMULATOR_OR(0);
  return g_emulator->getTotalCycles();
}

EMSCRIPTEN_KEEPALIVE
bool isIRQPending() {
  REQUIRE_EMULATOR_OR(false);
  return g_emulator->isIRQPending();
}

EMSCRIPTEN_KEEPALIVE
bool isNMIPending() {
  REQUIRE_EMULATOR_OR(false);
  return g_emulator->isNMIPending();
}

EMSCRIPTEN_KEEPALIVE
bool isNMIEdge() {
  REQUIRE_EMULATOR_OR(false);
  return g_emulator->isNMIEdge();
}

EMSCRIPTEN_KEEPALIVE
bool isPaused() {
  REQUIRE_EMULATOR_OR(false);
  return g_emulator->isPaused();
}

EMSCRIPTEN_KEEPALIVE
void setPaused(bool paused) {
  REQUIRE_EMULATOR();
  g_emulator->setPaused(paused);
}

EMSCRIPTEN_KEEPALIVE
void stepInstruction() {
  REQUIRE_EMULATOR();
  g_emulator->stepInstruction();
}

EMSCRIPTEN_KEEPALIVE
uint8_t readMemory(uint16_t address) {
  REQUIRE_EMULATOR_OR(0);
  return g_emulator->readMemory(address);
}

EMSCRIPTEN_KEEPALIVE
uint8_t peekMemory(uint16_t address) {
  REQUIRE_EMULATOR_OR(0);
  return g_emulator->peekMemory(address);
}

EMSCRIPTEN_KEEPALIVE
void writeMemory(uint16_t address, uint8_t value) {
  REQUIRE_EMULATOR();
  g_emulator->writeMemory(address, value);
}

EMSCRIPTEN_KEEPALIVE
const char *disassembleAt(uint16_t address) {
  REQUIRE_EMULATOR_OR("");
  return g_emulator->disassembleAt(address);
}

EMSCRIPTEN_KEEPALIVE
uint32_t getSoftSwitchState() {
  REQUIRE_EMULATOR_OR(0);
  return static_cast<uint32_t>(g_emulator->getSoftSwitchState() & 0xFFFFFFFF);
}

EMSCRIPTEN_KEEPALIVE
uint32_t getSoftSwitchStateHigh() {
  REQUIRE_EMULATOR_OR(0);
  return static_cast<uint32_t>(g_emulator->getSoftSwitchState() >> 32);
}

// Disk controller state for debugging
EMSCRIPTEN_KEEPALIVE
int getDiskTrack(int drive) {
  REQUIRE_EMULATOR_OR(0);
  auto &disk = g_emulator->getDisk();
  if (disk.hasDisk(drive)) {
    const auto *image = disk.getDiskImage(drive);
    if (image) {
      return image->getTrack();
    }
  }
  return 0;
}

EMSCRIPTEN_KEEPALIVE
int getDiskPhase(int drive) {
  REQUIRE_EMULATOR_OR(0);
  (void)drive; // Phase states are controller-wide
  return g_emulator->getDisk().getPhaseStates();
}

EMSCRIPTEN_KEEPALIVE
bool getDiskMotorOn(int drive) {
  REQUIRE_EMULATOR_OR(false);
  (void)drive; // Motor state is controller-wide
  return g_emulator->getDisk().isMotorOn();
}

EMSCRIPTEN_KEEPALIVE
void stopDiskMotor() {
  REQUIRE_EMULATOR();
  g_emulator->getDisk().stopMotor();
}

EMSCRIPTEN_KEEPALIVE
bool getDiskWriteMode(int drive) {
  REQUIRE_EMULATOR_OR(false);
  (void)drive; // Write mode (Q7) is controller-wide
  return g_emulator->getDisk().getQ7();
}

EMSCRIPTEN_KEEPALIVE
int getDiskHeadPosition(int drive) {
  REQUIRE_EMULATOR_OR(0);
  auto &disk = g_emulator->getDisk();
  if (disk.hasDisk(drive)) {
    const auto *image = disk.getDiskImage(drive);
    if (image) {
      return image->getQuarterTrack();
    }
  }
  return 0;
}

EMSCRIPTEN_KEEPALIVE
int getSelectedDrive() {
  REQUIRE_EMULATOR_OR(0);
  return g_emulator->getDisk().getSelectedDrive();
}

EMSCRIPTEN_KEEPALIVE
bool isDiskInserted(int drive) {
  REQUIRE_EMULATOR_OR(false);
  return g_emulator->getDisk().hasDisk(drive);
}

EMSCRIPTEN_KEEPALIVE
uint8_t getLastDiskByte() {
  REQUIRE_EMULATOR_OR(0);
  return g_emulator->getDisk().getDataLatch();
}

EMSCRIPTEN_KEEPALIVE
uint8_t getTrackNibble(int drive, int track, int position) {
  REQUIRE_EMULATOR_OR(0);
  if (g_emulator->getDisk().hasDisk(drive)) {
    const auto *image = g_emulator->getDisk().getDiskImage(drive);
    if (image) {
      return image->getNibbleAt(track, position);
    }
  }
  return 0;
}

EMSCRIPTEN_KEEPALIVE
int getTrackNibbleCount(int drive, int track) {
  REQUIRE_EMULATOR_OR(0);
  if (g_emulator->getDisk().hasDisk(drive)) {
    const auto *image = g_emulator->getDisk().getDiskImage(drive);
    if (image) {
      return image->getTrackNibbleCount(track);
    }
  }
  return 0;
}

EMSCRIPTEN_KEEPALIVE
size_t getCurrentNibblePosition(int drive) {
  REQUIRE_EMULATOR_OR(0);
  if (g_emulator->getDisk().hasDisk(drive)) {
    const auto *image = g_emulator->getDisk().getDiskImage(drive);
    if (image) {
      return image->getCurrentNibblePosition();
    }
  }
  return 0;
}

EMSCRIPTEN_KEEPALIVE
bool isDiskModified(int drive) {
  REQUIRE_EMULATOR_OR(false);
  if (g_emulator->getDisk().hasDisk(drive)) {
    const auto *image = g_emulator->getDisk().getDiskImage(drive);
    if (image) {
      return image->isModified();
    }
  }
  return false;
}

EMSCRIPTEN_KEEPALIVE
const char *getDiskFilename(int drive) {
  REQUIRE_EMULATOR_OR(nullptr);
  return g_emulator->getDiskFilename(drive);
}

// Memory tracking for debugger heat map
EMSCRIPTEN_KEEPALIVE
void enableMemoryTracking(bool enable) {
  REQUIRE_EMULATOR();
  g_emulator->getMMU().enableTracking(enable);
}

EMSCRIPTEN_KEEPALIVE
void clearMemoryTracking() {
  REQUIRE_EMULATOR();
  g_emulator->getMMU().clearTracking();
}

EMSCRIPTEN_KEEPALIVE
void decayMemoryTracking(uint8_t amount) {
  REQUIRE_EMULATOR();
  g_emulator->getMMU().decayTracking(amount);
}

EMSCRIPTEN_KEEPALIVE
const uint8_t* getMemoryReadCounts() {
  REQUIRE_EMULATOR_OR(nullptr);
  return g_emulator->getMMU().getReadCounts();
}

EMSCRIPTEN_KEEPALIVE
const uint8_t* getMemoryWriteCounts() {
  REQUIRE_EMULATOR_OR(nullptr);
  return g_emulator->getMMU().getWriteCounts();
}

// Direct memory array access for heat map visualization
EMSCRIPTEN_KEEPALIVE
const uint8_t* getMainRAM() {
  REQUIRE_EMULATOR_OR(nullptr);
  return g_emulator->getMMU().getMainRAM();
}

EMSCRIPTEN_KEEPALIVE
const uint8_t* getAuxRAM() {
  REQUIRE_EMULATOR_OR(nullptr);
  return g_emulator->getMMU().getAuxRAM();
}

EMSCRIPTEN_KEEPALIVE
const uint8_t* getSystemROM() {
  REQUIRE_EMULATOR_OR(nullptr);
  return g_emulator->getMMU().getSystemROM();
}

// Read auxiliary memory directly (for 80-column text selection)
EMSCRIPTEN_KEEPALIVE
uint8_t peekAuxMemory(uint16_t address) {
  REQUIRE_EMULATOR_OR(0);
  return g_emulator->getMMU().peekAux(address);
}

// UK/US character set switch (like the physical switch on UK Apple IIe)
EMSCRIPTEN_KEEPALIVE
void setUKCharacterSet(bool uk) {
  REQUIRE_EMULATOR();
  g_emulator->getVideo().setUKCharacterSet(uk);
}

EMSCRIPTEN_KEEPALIVE
bool isUKCharacterSet() {
  REQUIRE_EMULATOR_OR(false);
  return g_emulator->getVideo().isUKCharacterSet();
}

// Monochrome display mode (bypasses NTSC artifact coloring)
EMSCRIPTEN_KEEPALIVE
void setMonochrome(bool mono) {
  REQUIRE_EMULATOR();
  g_emulator->getVideo().setMonochrome(mono);
}

EMSCRIPTEN_KEEPALIVE
bool isMonochrome() {
  REQUIRE_EMULATOR_OR(false);
  return g_emulator->getVideo().isMonochrome();
}

// ============================================================================
// State Serialization
// ============================================================================

EMSCRIPTEN_KEEPALIVE
uint8_t *exportState(size_t *size) {
  if (!g_emulator) { *size = 0; return nullptr; }
  return const_cast<uint8_t *>(g_emulator->exportState(size));
}

EMSCRIPTEN_KEEPALIVE
bool importState(const uint8_t *data, size_t size) {
  REQUIRE_EMULATOR_OR(false);
  return g_emulator->importState(data, size);
}

// ============================================================================
// Standalone Disassembler (for file browser, external tools)
// ============================================================================

// Static buffer for disassembly result
static a2e::DisasmResult g_disasmResult;

EMSCRIPTEN_KEEPALIVE
uint32_t disassembleRawData(const uint8_t *data, size_t size,
                            uint16_t baseAddress) {
  g_disasmResult = a2e::disassembleBlock(data, size, baseAddress);
  return static_cast<uint32_t>(g_disasmResult.instructions.size());
}

EMSCRIPTEN_KEEPALIVE
const a2e::DisasmInstruction *getDisasmInstructions() {
  if (g_disasmResult.instructions.empty()) {
    return nullptr;
  }
  return g_disasmResult.instructions.data();
}

EMSCRIPTEN_KEEPALIVE
int getDisasmInstructionLength(uint8_t opcode) {
  return a2e::getInstructionLength(opcode);
}

EMSCRIPTEN_KEEPALIVE
uint32_t disassembleWithFlowAnalysis(const uint8_t *data, size_t size,
                                      uint16_t baseAddress) {
  g_disasmResult = a2e::disassembleWithFlowAnalysis(data, size, baseAddress);
  return static_cast<uint32_t>(g_disasmResult.instructions.size());
}

EMSCRIPTEN_KEEPALIVE
uint32_t disassembleWithFlowAnalysisMultiEntry(const uint8_t *data, size_t size,
                                                uint16_t baseAddress,
                                                const uint16_t *entryPoints,
                                                size_t entryCount) {
  std::vector<uint16_t> entries(entryPoints, entryPoints + entryCount);
  g_disasmResult = a2e::disassembleWithFlowAnalysis(data, size, baseAddress, entries);
  return static_cast<uint32_t>(g_disasmResult.instructions.size());
}

// ============================================================================
// Mockingboard Debug State
// ============================================================================

EMSCRIPTEN_KEEPALIVE
bool isMockingboardEnabled() {
  REQUIRE_EMULATOR_OR(false);
  return g_emulator->getMockingboard().isEnabled();
}

EMSCRIPTEN_KEEPALIVE
uint8_t getMockingboardPSGRegister(int psg, int reg) {
  REQUIRE_EMULATOR_OR(0);
  if (reg < 0 || reg >= 16) return 0;
  if (psg == 0) {
    return g_emulator->getMockingboard().getPSG1().getRegister(reg);
  } else if (psg == 1) {
    return g_emulator->getMockingboard().getPSG2().getRegister(reg);
  }
  return 0;
}

// Get all 16 PSG registers as a packed structure for efficiency
// Returns pointer to static buffer with 16 bytes
static uint8_t g_psgRegisters[16];

EMSCRIPTEN_KEEPALIVE
const uint8_t* getMockingboardPSGRegisters(int psg) {
  REQUIRE_EMULATOR_OR(nullptr);
  const auto& psgChip = (psg == 0)
    ? g_emulator->getMockingboard().getPSG1()
    : g_emulator->getMockingboard().getPSG2();
  for (int i = 0; i < 16; i++) {
    g_psgRegisters[i] = psgChip.getRegister(i);
  }
  return g_psgRegisters;
}

EMSCRIPTEN_KEEPALIVE
bool getMockingboardVIAIRQ(int via) {
  REQUIRE_EMULATOR_OR(false);
  if (via == 0) {
    return g_emulator->getMockingboard().getVIA1().isIRQActive();
  } else if (via == 1) {
    return g_emulator->getMockingboard().getVIA2().isIRQActive();
  }
  return false;
}

// Get VIA port registers for debugging
// reg: 0=ORA, 1=ORB, 2=DDRA, 3=DDRB
EMSCRIPTEN_KEEPALIVE
uint8_t getMockingboardVIAPort(int via, int reg) {
  REQUIRE_EMULATOR_OR(0);
  const auto& viaChip = (via == 0)
      ? g_emulator->getMockingboard().getVIA1()
      : g_emulator->getMockingboard().getVIA2();
  switch (reg) {
    case 0: return viaChip.getORA();
    case 1: return viaChip.getORB();
    case 2: return viaChip.getDDRA();
    case 3: return viaChip.getDDRB();
  }
  return 0;
}

// Get PSG write debug info
// info: 0=writeCount, 1=lastWriteReg, 2=lastWriteVal, 3=currentRegister
EMSCRIPTEN_KEEPALIVE
uint32_t getMockingboardPSGWriteInfo(int psg, int info) {
  REQUIRE_EMULATOR_OR(0);
  const auto& psgChip = (psg == 0)
      ? g_emulator->getMockingboard().getPSG1()
      : g_emulator->getMockingboard().getPSG2();
  switch (info) {
    case 0: return psgChip.getWriteCount();
    case 1: return psgChip.getLastWriteReg();
    case 2: return psgChip.getLastWriteVal();
    case 3: return psgChip.getCurrentRegister();
  }
  return 0;
}

// Get VIA timer debug info
// info: 0=T1Counter, 1=T1Latch, 2=T1Running, 3=T1Fired, 4=ACR, 5=IFR, 6=IER
EMSCRIPTEN_KEEPALIVE
uint32_t getMockingboardVIATimerInfo(int via, int info) {
  REQUIRE_EMULATOR_OR(0);
  const auto& viaChip = (via == 0)
      ? g_emulator->getMockingboard().getVIA1()
      : g_emulator->getMockingboard().getVIA2();
  switch (info) {
    case 0: return viaChip.getT1Counter();
    case 1: return viaChip.getT1Latch();
    case 2: return viaChip.isT1Running() ? 1 : 0;
    case 3: return viaChip.hasT1Fired() ? 1 : 0;
    case 4: return viaChip.getACR();
    case 5: return viaChip.getIFR();
    case 6: return viaChip.getIER();
  }
  return 0;
}

// Enable/disable console debug logging for Mockingboard PSG writes
EMSCRIPTEN_KEEPALIVE
void setMockingboardDebugLogging(bool enabled) {
  REQUIRE_EMULATOR();
  g_emulator->getMockingboard().setDebugLogging(enabled);
}

// Mute/unmute a specific channel on a PSG
// psg: 0 or 1 (PSG1 or PSG2)
// channel: 0, 1, or 2 (A, B, C)
// muted: true to mute, false to unmute
EMSCRIPTEN_KEEPALIVE
void setMockingboardChannelMute(int psg, int channel, bool muted) {
  REQUIRE_EMULATOR();
  auto& psgChip = (psg == 0)
      ? g_emulator->getMockingboard().getPSG1()
      : g_emulator->getMockingboard().getPSG2();
  psgChip.setChannelMute(channel, muted);
}

// Check if a channel is muted
EMSCRIPTEN_KEEPALIVE
bool getMockingboardChannelMute(int psg, int channel) {
  REQUIRE_EMULATOR_OR(false);
  const auto& psgChip = (psg == 0)
      ? g_emulator->getMockingboard().getPSG1()
      : g_emulator->getMockingboard().getPSG2();
  return psgChip.isChannelMuted(channel);
}

// Generate waveform samples from a PSG channel for visualization
// psg: 0 or 1 (PSG1 or PSG2)
// channel: 0, 1, or 2 (A, B, C) - use -1 for combined output
// buffer: float array to fill with samples
// count: number of samples to generate
// Returns actual number of samples generated
EMSCRIPTEN_KEEPALIVE
int getMockingboardWaveform(int psg, int channel, float* buffer, int count) {
  REQUIRE_EMULATOR_OR(0);
  if (!buffer || count <= 0 || count > 1024) return 0;

  const int SAMPLE_RATE = 48000;
  auto& psgChip = (psg == 0)
      ? g_emulator->getMockingboard().getPSG1()
      : g_emulator->getMockingboard().getPSG2();

  // Create a copy of the PSG to generate visualization samples
  // without affecting the actual audio state
  a2e::AY8910 psgCopy = psgChip;

  if (channel >= 0 && channel < 3) {
    psgCopy.generateChannelSamples(buffer, count, SAMPLE_RATE, channel);
  } else {
    psgCopy.generateSamples(buffer, count, SAMPLE_RATE);
  }

  return count;
}

// ============================================================================
// Mouse Input
// ============================================================================

EMSCRIPTEN_KEEPALIVE
void mouseMove(int dx, int dy) {
  REQUIRE_EMULATOR();
  g_emulator->mouseMove(dx, dy);
}

EMSCRIPTEN_KEEPALIVE
void mouseButton(bool pressed) {
  REQUIRE_EMULATOR();
  g_emulator->mouseButton(pressed);
}

// ============================================================================
// Mouse Card Debug
// ============================================================================

// Returns whether a mouse card is currently installed
EMSCRIPTEN_KEEPALIVE
bool isMouseCardInstalled() {
  REQUIRE_EMULATOR_OR(false);
  return g_emulator->getMouseCard() != nullptr;
}

// Get mouse card state field
// field: 0=slotNum, 1=mouseX, 2=mouseY, 3=button, 4=moved, 5=buttonChanged,
//        6=clampMinX, 7=clampMaxX, 8=clampMinY, 9=clampMaxY,
//        10=irqActive, 11=vblPending, 12=movePending, 13=buttonPending,
//        14=wasInVBL, 15=mode, 16=lastCommand, 17=responseState
EMSCRIPTEN_KEEPALIVE
int32_t getMouseCardState(int field) {
  REQUIRE_EMULATOR_OR(0);
  auto* mouse = g_emulator->getMouseCard();
  if (!mouse) return 0;
  switch (field) {
    case 0: return mouse->getSlotNumber();
    case 1: return mouse->getMouseX();
    case 2: return mouse->getMouseY();
    case 3: return mouse->getMouseButton() ? 1 : 0;
    case 4: return mouse->getMoved() ? 1 : 0;
    case 5: return mouse->getButtonChanged() ? 1 : 0;
    case 6: return mouse->getClampMinX();
    case 7: return mouse->getClampMaxX();
    case 8: return mouse->getClampMinY();
    case 9: return mouse->getClampMaxY();
    case 10: return mouse->isIRQActive() ? 1 : 0;
    case 11: return mouse->getVBLInterruptPending() ? 1 : 0;
    case 12: return mouse->getMoveInterruptPending() ? 1 : 0;
    case 13: return mouse->getButtonInterruptPending() ? 1 : 0;
    case 14: return mouse->getWasInVBL() ? 1 : 0;
    case 15: return mouse->getMode();
    case 16: return mouse->getLastCommand();
    case 17: return mouse->getResponseState();
  }
  return 0;
}

// Get mouse card PIA register
// reg: 0=DDRA, 1=DDRB, 2=ORA, 3=ORB, 4=IRA, 5=IRB, 6=CRA, 7=CRB
EMSCRIPTEN_KEEPALIVE
uint32_t getMouseCardPIARegister(int reg) {
  REQUIRE_EMULATOR_OR(0);
  auto* mouse = g_emulator->getMouseCard();
  if (!mouse) return 0;
  switch (reg) {
    case 0: return mouse->getDDRA();
    case 1: return mouse->getDDRB();
    case 2: return mouse->getORA();
    case 3: return mouse->getORB();
    case 4: return mouse->getIRA();
    case 5: return mouse->getIRB();
    case 6: return mouse->getCRA();
    case 7: return mouse->getCRB();
  }
  return 0;
}

// ============================================================================
// Expansion Slot Management
// ============================================================================

EMSCRIPTEN_KEEPALIVE
const char* getSlotCard(int slot) {
  if (g_emulator) {
    return g_emulator->getSlotCardName(static_cast<uint8_t>(slot));
  }
  return "invalid";
}

EMSCRIPTEN_KEEPALIVE
bool setSlotCard(int slot, const char* cardId) {
  if (g_emulator) {
    return g_emulator->setSlotCard(static_cast<uint8_t>(slot), cardId);
  }
  return false;
}

EMSCRIPTEN_KEEPALIVE
bool isSlotEmpty(int slot) {
  if (g_emulator) {
    return g_emulator->isSlotEmpty(static_cast<uint8_t>(slot));
  }
  return true;
}

} // extern "C"
