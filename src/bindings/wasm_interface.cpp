#include "../core/emulator.hpp"
#include <cstdlib>
#include <emscripten.h>

// Global emulator instance
static a2e::Emulator *g_emulator = nullptr;

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
  if (g_emulator) {
    g_emulator->reset();
  }
}

EMSCRIPTEN_KEEPALIVE
void warmReset() {
  if (g_emulator) {
    g_emulator->warmReset();
  }
}

EMSCRIPTEN_KEEPALIVE
void runCycles(int cycles) {
  if (g_emulator) {
    g_emulator->runCycles(cycles);
  }
}

EMSCRIPTEN_KEEPALIVE
int generateAudioSamples(float *buffer, int sampleCount) {
  if (g_emulator) {
    return g_emulator->generateAudioSamples(buffer, sampleCount);
  }
  return 0;
}

EMSCRIPTEN_KEEPALIVE
int consumeFrameSamples() {
  if (g_emulator) {
    return g_emulator->consumeFrameSamples();
  }
  return 0;
}

EMSCRIPTEN_KEEPALIVE
uint8_t *getFramebuffer() {
  if (g_emulator) {
    return const_cast<uint8_t *>(g_emulator->getFramebuffer());
  }
  return nullptr;
}

EMSCRIPTEN_KEEPALIVE
int getFramebufferSize() { return a2e::FRAMEBUFFER_SIZE; }

EMSCRIPTEN_KEEPALIVE
bool isFrameReady() {
  if (g_emulator) {
    bool ready = g_emulator->isFrameReady();
    if (ready) {
      g_emulator->clearFrameReady();
    }
    return ready;
  }
  return false;
}

EMSCRIPTEN_KEEPALIVE
void keyDown(int keycode) {
  if (g_emulator) {
    g_emulator->keyDown(keycode);
  }
}

EMSCRIPTEN_KEEPALIVE
void keyUp(int keycode) {
  if (g_emulator) {
    g_emulator->keyUp(keycode);
  }
}

EMSCRIPTEN_KEEPALIVE
int handleRawKeyDown(int browserKeycode, bool shift, bool ctrl, bool alt,
                     bool meta, bool capsLock) {
  if (g_emulator) {
    return g_emulator->handleRawKeyDown(browserKeycode, shift, ctrl, alt, meta,
                                        capsLock);
  }
  return -1;
}

EMSCRIPTEN_KEEPALIVE
void handleRawKeyUp(int browserKeycode, bool shift, bool ctrl, bool alt,
                    bool meta) {
  if (g_emulator) {
    g_emulator->handleRawKeyUp(browserKeycode, shift, ctrl, alt, meta);
  }
}

EMSCRIPTEN_KEEPALIVE
void setButton(int button, bool pressed) {
  if (g_emulator) {
    g_emulator->setButton(button, pressed);
  }
}

EMSCRIPTEN_KEEPALIVE
bool isKeyboardReady() {
  if (g_emulator) {
    return g_emulator->isKeyboardReady();
  }
  return true;
}

EMSCRIPTEN_KEEPALIVE
bool insertDisk(int drive, uint8_t *data, int size, const char *filename) {
  if (g_emulator) {
    return g_emulator->insertDisk(drive, data, size, filename);
  }
  return false;
}

EMSCRIPTEN_KEEPALIVE
bool insertBlankDisk(int drive) {
  if (g_emulator) {
    return g_emulator->insertBlankDisk(drive);
  }
  return false;
}

EMSCRIPTEN_KEEPALIVE
void ejectDisk(int drive) {
  if (g_emulator) {
    g_emulator->ejectDisk(drive);
  }
}

EMSCRIPTEN_KEEPALIVE
uint8_t *getDiskData(int drive, size_t *size) {
  if (g_emulator) {
    return const_cast<uint8_t *>(g_emulator->exportDiskData(drive, size));
  }
  *size = 0;
  return nullptr;
}

EMSCRIPTEN_KEEPALIVE
void addBreakpoint(uint16_t address) {
  if (g_emulator) {
    g_emulator->addBreakpoint(address);
  }
}

EMSCRIPTEN_KEEPALIVE
void removeBreakpoint(uint16_t address) {
  if (g_emulator) {
    g_emulator->removeBreakpoint(address);
  }
}

EMSCRIPTEN_KEEPALIVE
void enableBreakpoint(uint16_t address, bool enabled) {
  if (g_emulator) {
    g_emulator->enableBreakpoint(address, enabled);
  }
}

EMSCRIPTEN_KEEPALIVE
bool isBreakpointHit() {
  if (g_emulator) {
    return g_emulator->isBreakpointHit();
  }
  return false;
}

EMSCRIPTEN_KEEPALIVE
uint16_t getBreakpointAddress() {
  if (g_emulator) {
    return g_emulator->getBreakpointAddress();
  }
  return 0;
}

EMSCRIPTEN_KEEPALIVE
uint16_t getPC() {
  if (g_emulator) {
    return g_emulator->getPC();
  }
  return 0;
}

EMSCRIPTEN_KEEPALIVE
uint8_t getSP() {
  if (g_emulator) {
    return g_emulator->getSP();
  }
  return 0;
}

EMSCRIPTEN_KEEPALIVE
uint8_t getA() {
  if (g_emulator) {
    return g_emulator->getA();
  }
  return 0;
}

EMSCRIPTEN_KEEPALIVE
uint8_t getX() {
  if (g_emulator) {
    return g_emulator->getX();
  }
  return 0;
}

EMSCRIPTEN_KEEPALIVE
uint8_t getY() {
  if (g_emulator) {
    return g_emulator->getY();
  }
  return 0;
}

EMSCRIPTEN_KEEPALIVE
uint8_t getP() {
  if (g_emulator) {
    return g_emulator->getP();
  }
  return 0;
}

EMSCRIPTEN_KEEPALIVE
uint64_t getTotalCycles() {
  if (g_emulator) {
    return g_emulator->getTotalCycles();
  }
  return 0;
}

EMSCRIPTEN_KEEPALIVE
bool isPaused() {
  if (g_emulator) {
    return g_emulator->isPaused();
  }
  return false;
}

EMSCRIPTEN_KEEPALIVE
void setPaused(bool paused) {
  if (g_emulator) {
    g_emulator->setPaused(paused);
  }
}

EMSCRIPTEN_KEEPALIVE
void stepInstruction() {
  if (g_emulator) {
    g_emulator->stepInstruction();
  }
}

EMSCRIPTEN_KEEPALIVE
uint8_t readMemory(uint16_t address) {
  if (g_emulator) {
    return g_emulator->readMemory(address);
  }
  return 0;
}

EMSCRIPTEN_KEEPALIVE
uint8_t peekMemory(uint16_t address) {
  if (g_emulator) {
    return g_emulator->peekMemory(address);
  }
  return 0;
}

EMSCRIPTEN_KEEPALIVE
void writeMemory(uint16_t address, uint8_t value) {
  if (g_emulator) {
    g_emulator->writeMemory(address, value);
  }
}

EMSCRIPTEN_KEEPALIVE
const char *disassembleAt(uint16_t address) {
  if (g_emulator) {
    return g_emulator->disassembleAt(address);
  }
  return "";
}

EMSCRIPTEN_KEEPALIVE
uint32_t getSoftSwitchState() {
  if (g_emulator) {
    return static_cast<uint32_t>(g_emulator->getSoftSwitchState() & 0xFFFFFFFF);
  }
  return 0;
}

EMSCRIPTEN_KEEPALIVE
uint32_t getSoftSwitchStateHigh() {
  if (g_emulator) {
    return static_cast<uint32_t>(g_emulator->getSoftSwitchState() >> 32);
  }
  return 0;
}

// Disk controller state for debugging
EMSCRIPTEN_KEEPALIVE
int getDiskTrack(int drive) {
  if (g_emulator) {
    // Return track for the specified drive (or selected drive if drive matches)
    auto &disk = g_emulator->getDisk();
    if (disk.hasDisk(drive)) {
      const auto *image = disk.getDiskImage(drive);
      if (image) {
        return image->getTrack();
      }
    }
  }
  return 0;
}

EMSCRIPTEN_KEEPALIVE
int getDiskPhase(int drive) {
  if (g_emulator) {
    // Return phase states (bitmask of active phases)
    (void)drive; // Phase states are controller-wide
    return g_emulator->getDisk().getPhaseStates();
  }
  return 0;
}

EMSCRIPTEN_KEEPALIVE
bool getDiskMotorOn(int drive) {
  if (g_emulator) {
    // Motor state is controller-wide, not per-drive
    (void)drive;
    return g_emulator->getDisk().isMotorOn();
  }
  return false;
}

EMSCRIPTEN_KEEPALIVE
void stopDiskMotor() {
  if (g_emulator) {
    g_emulator->getDisk().stopMotor();
  }
}

EMSCRIPTEN_KEEPALIVE
bool getDiskWriteMode(int drive) {
  if (g_emulator) {
    // Write mode (Q7) is controller-wide
    (void)drive;
    return g_emulator->getDisk().getQ7();
  }
  return false;
}

EMSCRIPTEN_KEEPALIVE
int getDiskHeadPosition(int drive) {
  if (g_emulator) {
    // Return quarter-track position
    auto &disk = g_emulator->getDisk();
    if (disk.hasDisk(drive)) {
      const auto *image = disk.getDiskImage(drive);
      if (image) {
        return image->getQuarterTrack();
      }
    }
  }
  return 0;
}

EMSCRIPTEN_KEEPALIVE
int getSelectedDrive() {
  if (g_emulator) {
    return g_emulator->getDisk().getSelectedDrive();
  }
  return 0;
}

EMSCRIPTEN_KEEPALIVE
bool isDiskInserted(int drive) {
  if (g_emulator) {
    return g_emulator->getDisk().hasDisk(drive);
  }
  return false;
}

EMSCRIPTEN_KEEPALIVE
uint8_t getLastDiskByte() {
  // Return data latch directly without side effects
  if (g_emulator) {
    return g_emulator->getDisk().getDataLatch();
  }
  return 0;
}

EMSCRIPTEN_KEEPALIVE
uint8_t getTrackNibble(int drive, int track, int position) {
  // Debug function to read raw nibble from track data
  if (g_emulator && g_emulator->getDisk().hasDisk(drive)) {
    const auto *image = g_emulator->getDisk().getDiskImage(drive);
    if (image) {
      return image->getNibbleAt(track, position);
    }
  }
  return 0;
}

EMSCRIPTEN_KEEPALIVE
int getTrackNibbleCount(int drive, int track) {
  // Debug function to get nibble count for a track
  if (g_emulator && g_emulator->getDisk().hasDisk(drive)) {
    const auto *image = g_emulator->getDisk().getDiskImage(drive);
    if (image) {
      return image->getTrackNibbleCount(track);
    }
  }
  return 0;
}

EMSCRIPTEN_KEEPALIVE
size_t getCurrentNibblePosition(int drive) {
  // Debug function to get current nibble position within track
  if (g_emulator && g_emulator->getDisk().hasDisk(drive)) {
    const auto *image = g_emulator->getDisk().getDiskImage(drive);
    if (image) {
      return image->getCurrentNibblePosition();
    }
  }
  return 0;
}

EMSCRIPTEN_KEEPALIVE
bool isDiskModified(int drive) {
  if (g_emulator && g_emulator->getDisk().hasDisk(drive)) {
    const auto *image = g_emulator->getDisk().getDiskImage(drive);
    if (image) {
      return image->isModified();
    }
  }
  return false;
}

// Memory tracking for debugger heat map
EMSCRIPTEN_KEEPALIVE
void enableMemoryTracking(bool enable) {
  if (g_emulator) {
    g_emulator->getMMU().enableTracking(enable);
  }
}

EMSCRIPTEN_KEEPALIVE
void clearMemoryTracking() {
  if (g_emulator) {
    g_emulator->getMMU().clearTracking();
  }
}

EMSCRIPTEN_KEEPALIVE
void decayMemoryTracking(uint8_t amount) {
  if (g_emulator) {
    g_emulator->getMMU().decayTracking(amount);
  }
}

EMSCRIPTEN_KEEPALIVE
const uint8_t* getMemoryReadCounts() {
  if (g_emulator) {
    return g_emulator->getMMU().getReadCounts();
  }
  return nullptr;
}

EMSCRIPTEN_KEEPALIVE
const uint8_t* getMemoryWriteCounts() {
  if (g_emulator) {
    return g_emulator->getMMU().getWriteCounts();
  }
  return nullptr;
}

// Direct memory array access for heat map visualization
EMSCRIPTEN_KEEPALIVE
const uint8_t* getMainRAM() {
  if (g_emulator) {
    return g_emulator->getMMU().getMainRAM();
  }
  return nullptr;
}

EMSCRIPTEN_KEEPALIVE
const uint8_t* getAuxRAM() {
  if (g_emulator) {
    return g_emulator->getMMU().getAuxRAM();
  }
  return nullptr;
}

EMSCRIPTEN_KEEPALIVE
const uint8_t* getSystemROM() {
  if (g_emulator) {
    return g_emulator->getMMU().getSystemROM();
  }
  return nullptr;
}

// Read auxiliary memory directly (for 80-column text selection)
EMSCRIPTEN_KEEPALIVE
uint8_t peekAuxMemory(uint16_t address) {
  if (g_emulator) {
    return g_emulator->getMMU().peekAux(address);
  }
  return 0;
}

// UK/US character set switch (like the physical switch on UK Apple IIe)
EMSCRIPTEN_KEEPALIVE
void setUKCharacterSet(bool uk) {
  if (g_emulator) {
    g_emulator->getVideo().setUKCharacterSet(uk);
  }
}

EMSCRIPTEN_KEEPALIVE
bool isUKCharacterSet() {
  if (g_emulator) {
    return g_emulator->getVideo().isUKCharacterSet();
  }
  return false;
}

} // extern "C"
