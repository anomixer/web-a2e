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
bool insertDisk(int drive, uint8_t *data, int size, const char *filename) {
  if (g_emulator) {
    return g_emulator->insertDisk(drive, data, size, filename);
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
    return const_cast<uint8_t *>(g_emulator->getDiskData(drive, size));
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
    return g_emulator->getSoftSwitchState();
  }
  return 0;
}

// Disk controller state for debugging
EMSCRIPTEN_KEEPALIVE
int getDiskTrack(int drive) {
  if (g_emulator) {
    const auto &state = g_emulator->getDisk().getDriveState(drive);
    return state.currentTrack;
  }
  return 0;
}

EMSCRIPTEN_KEEPALIVE
int getDiskPhase(int drive) {
  if (g_emulator) {
    const auto &state = g_emulator->getDisk().getDriveState(drive);
    return state.currentPhase;
  }
  return 0;
}

EMSCRIPTEN_KEEPALIVE
bool getDiskMotorOn(int drive) {
  if (g_emulator) {
    const auto &state = g_emulator->getDisk().getDriveState(drive);
    return state.motorOn;
  }
  return false;
}

EMSCRIPTEN_KEEPALIVE
bool getDiskWriteMode(int drive) {
  if (g_emulator) {
    const auto &state = g_emulator->getDisk().getDriveState(drive);
    return state.writeMode;
  }
  return false;
}

EMSCRIPTEN_KEEPALIVE
int getDiskHeadPosition(int drive) {
  if (g_emulator) {
    const auto &state = g_emulator->getDisk().getDriveState(drive);
    return state.headPosition;
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
    return g_emulator->getDisk().isDiskInserted(drive);
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

} // extern "C"
