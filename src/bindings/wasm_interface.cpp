/*
 * wasm_interface.cpp - WebAssembly binding layer exposing the emulator API to JavaScript
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#include "core/emulator.hpp"
#include "host/machine_host.hpp"
#include "core/disk-image/disk_inspection.hpp"
#include "core/disassembler/disassembler.hpp"
#include "core/disassembler/disassembler65816.hpp"
#include "core/disassembler/disasm_align.hpp"
#include "core/assembler/assembler.hpp"
#include "core/debug/condition_evaluator.hpp"
#include "core/filesystem/dos33.hpp"
#include "core/filesystem/prodos.hpp"
#include "core/filesystem/pascal.hpp"
#include "core/basic/basic_detokenizer.hpp"
#include "core/basic/applesoft_vars.hpp"
#include "core/basic/basic_tokenizer.hpp"
#include "core/debug/debug_log.hpp"
#include "core/cards/disk_controller.hpp"
#include "core/cards/smartport/smartport_card.hpp"
#include "core/input/keyboard.hpp"
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>
#include <emscripten.h>

#include "iigs/iigs_machine.hpp"
#include "cpu/65816/cpu65816.hpp"

// The one machine this module runs, whichever kind it is. Which of the
// Apple II family's `Emulator` and a IIgs's `IIgsMachine` is alive, and how a
// question about a drive, the speaker or the debugger reaches it, is decided by
// MachineHost, which the native front end shares. Everything here that only a
// //e answers still asks for the emulator and answers nothing while a IIgs is
// running.
static a2e::host::MachineHost g_host;

// Helper macros to reduce repetitive null checks
#define REQUIRE_EMULATOR() do { if (!g_host.emulator()) return; } while(0)
#define REQUIRE_EMULATOR_OR(default_val) do { if (!g_host.emulator()) return (default_val); } while(0)
#define REQUIRE_MOCKINGBOARD() do { if (!g_host.emulator() || !g_host.emulator()->getMockingboardPtr()) return; } while(0)
#define REQUIRE_MOCKINGBOARD_OR(default_val) do { if (!g_host.emulator() || !g_host.emulator()->getMockingboardPtr()) return (default_val); } while(0)

static a2e::DiskController *diskController() { return g_host.diskController(); }
static a2e::MachineDebug *machineDebug() { return g_host.debug(); }
static a2e::MachineView machineView() { return g_host.view(); }

#define REQUIRE_DEBUG() do { if (!machineDebug()) return; } while(0)
#define REQUIRE_DEBUG_OR(default_val) \
  do { if (!machineDebug()) return (default_val); } while(0)

#define REQUIRE_DISK() do { if (!diskController()) return; } while(0)
#define REQUIRE_DISK_OR(default_val) do { if (!diskController()) return (default_val); } while(0)

namespace {

// One instruction as a monitor writes it after the address and the bytes.
std::string instructionText(const a2e::host::Instruction &in) {
  return in.operand.empty() ? in.mnemonic : in.mnemonic + " " + in.operand;
}

} // namespace

extern "C" {

EMSCRIPTEN_KEEPALIVE
void init() {
  // Route core debug tracing to the browser console. The core itself has no
  // idea a console exists — it formats into a2e::debugLog() and this binding,
  // as the platform layer, decides where the text goes.
  a2e::setDebugLogSink([](const char *message) {
    EM_ASM({ console.log(UTF8ToString($0)); }, message);
  });

  // Install the parallel (Centronics) printer tx callback at construction so
  // EVERY ParallelCard created later (when the saved slot config is applied)
  // inherits it via Emulator::setSlotCard's `if (parallelTxCallback_)` apply.
  // This removes the dependence on the JS-side _setParallelTxCallback() RPC
  // landing at exactly the right boot moment — a fire-and-forget call whose
  // failure was silent and left the parallel bus permanently unregistered.
  // SSC/serial registration is deliberately left to its existing JS path.
  g_host.setEmulatorBuiltCallback([](a2e::Emulator &emulator) {
    emulator.setParallelTxCallback([](uint8_t byte) {
      EM_ASM({
        if (self.emulator && self.emulator.printer) {
          self.emulator.printer.receiveByte($0);
        }
      }, byte);
    });
  });
  g_host.build();
}

EMSCRIPTEN_KEEPALIVE
void reset() {
  if (g_host.iigs()) {
    g_host.iigs()->reset();
    return;
  }
  REQUIRE_EMULATOR();
  g_host.emulator()->reset();
}

EMSCRIPTEN_KEEPALIVE
void warmReset() {
  if (g_host.iigs()) {
    g_host.iigs()->warmReset();
    return;
  }
  REQUIRE_EMULATOR();
  g_host.emulator()->warmReset();
}

EMSCRIPTEN_KEEPALIVE
void runCycles(int cycles) {
  if (g_host.iigs()) {
    g_host.iigs()->runCycles(cycles);
    return;
  }
  REQUIRE_EMULATOR();
  g_host.emulator()->runCycles(cycles);
}

EMSCRIPTEN_KEEPALIVE
int generateStereoAudioSamples(float *buffer, int sampleCount) {
  // This is what paces the emulation: the worker asks for samples and the time
  // they represent is the time the machine gets to run.
  if (g_host.iigs()) return g_host.iigs()->generateStereoAudioSamples(buffer, sampleCount);
  REQUIRE_EMULATOR_OR(0);
  return g_host.emulator()->generateStereoAudioSamples(buffer, sampleCount);
}

// The speaker of whichever machine is running. A IIgs has one too — $C030 is
// a Mega II address — so the volume slider and the mute button mean the same
// thing to it as to every other machine here.
static a2e::Audio *speaker() { return g_host.speaker(); }

EMSCRIPTEN_KEEPALIVE
void setAudioVolume(float volume) {
  if (a2e::Audio *audio = speaker()) audio->setVolume(volume);
}

EMSCRIPTEN_KEEPALIVE
void setAudioMuted(bool muted) {
  if (a2e::Audio *audio = speaker()) audio->setMuted(muted);
}

EMSCRIPTEN_KEEPALIVE
int consumeFrameSamples() {
  if (g_host.iigs()) return g_host.iigs()->consumeFrameSamples();
  REQUIRE_EMULATOR_OR(0);
  return g_host.emulator()->consumeFrameSamples();
}

EMSCRIPTEN_KEEPALIVE
uint8_t *getFramebuffer() {
  if (g_host.iigs()) return const_cast<uint8_t *>(g_host.iigs()->framebuffer());
  REQUIRE_EMULATOR_OR(nullptr);
  return const_cast<uint8_t *>(g_host.emulator()->getFramebuffer());
}

EMSCRIPTEN_KEEPALIVE
int getFramebufferSize() {
  if (g_host.iigs()) return static_cast<int>(g_host.iigs()->framebufferSize());
  REQUIRE_EMULATOR_OR(static_cast<int>(a2e::defaultMachineProfile()
                                           .display.framebufferSize()));
  return static_cast<int>(g_host.emulator()->getFramebufferSize());
}

// ============================================================================
// Machine profile
//
// The host used to hardcode 560x384 and a 1.023 MHz clock in a dozen places.
// It asks the core instead, so a machine with a different picture or a
// different clock needs no host change at all.
// ============================================================================

// C++ linkage: this file is one big extern "C" block for the exports, but a
// helper returning std::string is not a C function.
extern "C++" {
namespace {

std::string machineProfileToJSON(const a2e::MachineProfile &m) {
  auto boolean = [](bool value) { return value ? "true" : "false"; };

  std::string json = "{";
  json += "\"id\":" + std::to_string(static_cast<int>(m.id));
  json += ",\"key\":\"" + std::string(m.key) + "\"";
  json += ",\"name\":\"" + std::string(m.name) + "\"";
  json += ",\"shortName\":\"" + std::string(m.shortName) + "\"";
  json += ",\"logotype\":\"" + std::string(m.logotype) + "\"";
  json += ",\"released\":" + std::to_string(m.released);
  const char *cpuName = "6502";
  switch (m.cpu) {
  case a2e::CPUVariant::CMOS_65C02: cpuName = "65C02"; break;
  case a2e::CPUVariant::CMOS_65C816: cpuName = "65C816"; break;
  case a2e::CPUVariant::NMOS_6502: break;
  }
  json += ",\"cpu\":\"" + std::string(cpuName) + "\"";
  // What the processor has to show, so a debug view is built from the machine
  // rather than from the //e it would otherwise assume. A 65816's flag names
  // change with its mode, which is why there are two sets.
  {
    const bool wide = m.cpu == a2e::CPUVariant::CMOS_65C816;
    json += ",\"processor\":{";
    json += "\"addressBits\":" + std::string(wide ? "24" : "16");
    json += ",\"registerBits\":" + std::string(wide ? "16" : "8");
    json += std::string(",\"hasBanks\":") + boolean(wide);
    json += std::string(",\"hasDirectPage\":") + boolean(wide);
    json += std::string(",\"hasModes\":") + boolean(wide);
    json += ",\"flags\":\"NV-BDIZC\"";
    json += ",\"nativeFlags\":\"" + std::string(wide ? "NVMXDIZC" : "") + "\"";
    json += "}";
  }
  // Which set of parts the machine is built from, so the host can say why one
  // it cannot run is listed at all.
  json += ",\"family\":\"" +
          std::string(m.family == a2e::MachineFamily::AppleIIgs ? "apple2gs"
                                                                : "apple2")  +
          "\"";

  json += ",\"timing\":{";
  json += "\"cpuClockHz\":" + std::to_string(m.timing.cpuClockHz);
  json += ",\"cyclesPerScanline\":" + std::to_string(m.timing.cyclesPerScanline);
  json += ",\"hblankCycles\":" + std::to_string(m.timing.hblankCycles);
  json += ",\"visibleColumns\":" + std::to_string(m.timing.visibleColumns);
  json += ",\"scanlinesPerFrame\":" + std::to_string(m.timing.scanlinesPerFrame);
  json += ",\"visibleScanlines\":" + std::to_string(m.timing.visibleScanlines);
  json += ",\"mixedModeTextScanline\":" +
          std::to_string(m.timing.mixedModeTextScanline);
  json += ",\"cyclesPerFrame\":" + std::to_string(m.timing.cyclesPerFrame());
  json += ",\"standard\":\"" +
          std::string(m.timing.standard == a2e::VideoStandard::PAL ? "pal" : "ntsc") + "\"";
  json += "}";
  // Whether the machine is made in PAL as well, so a host offers the switch.
  json += std::string(",\"hasPal\":") +
          (a2e::machineHasStandard(m.id, a2e::VideoStandard::PAL) ? "true" : "false");

  json += ",\"memory\":{";
  json += "\"mainRamSize\":" + std::to_string(m.memory.mainRamSize);
  json += ",\"auxRamSize\":" + std::to_string(m.memory.auxRamSize);
  json += ",\"romSize\":" + std::to_string(m.memory.romSize);
  json += ",\"charRomSize\":" + std::to_string(m.memory.charRomSize);
  json += "}";

  json += ",\"display\":{";
  json += "\"dotsPerLine\":" + std::to_string(m.display.dotsPerLine);
  json += ",\"width\":" + std::to_string(m.display.pixelWidth);
  json += ",\"height\":" + std::to_string(m.display.pixelHeight);
  json += ",\"lineDoubling\":" + std::to_string(m.display.lineDoubling);
  json += ",\"framebufferSize\":" + std::to_string(m.display.framebufferSize());
  json += ",\"text\":{\"left\":" + std::to_string(m.display.textLeft);
  json += ",\"top\":" + std::to_string(m.display.textTop);
  json += ",\"width\":" + std::to_string(m.display.textWidth);
  json += ",\"height\":" + std::to_string(m.display.textHeight) + "}";
  json += ",\"aspect\":{\"width\":" + std::to_string(m.display.aspectWidth);
  json += ",\"height\":" + std::to_string(m.display.aspectHeight) + "}";
  json += "}";

  json += ",\"caps\":{";
  json += std::string("\"hasAuxRam\":") + boolean(m.caps.hasAuxRam);
  json += std::string(",\"has80Column\":") + boolean(m.caps.has80Column);
  json += std::string(",\"hasDoubleHires\":") + boolean(m.caps.hasDoubleHires);
  json += std::string(",\"hasLanguageCard\":") + boolean(m.caps.hasLanguageCard);
  json += std::string(",\"hasAltCharSet\":") + boolean(m.caps.hasAltCharSet);
  json += std::string(",\"hasUkCharSet\":") + boolean(m.caps.hasUkCharSet);
  json += std::string(",\"hasLowercase\":") + boolean(m.caps.hasLowercase);
  json += std::string(",\"hasInternalSlotRom\":") +
          boolean(m.caps.hasInternalSlotRom);
  json += std::string(",\"hasExpansionSlots\":") +
          boolean(m.caps.hasExpansionSlots);
  json += std::string(",\"hasOpenAppleKeys\":") + boolean(m.caps.hasOpenAppleKeys);
  json += std::string(",\"hasIOUDisable\":") + boolean(m.caps.hasIOUDisable);
  json += std::string(",\"inhibitsBurstInText\":") +
          boolean(m.caps.inhibitsBurstInText);
  json += std::string(",\"hasCassette\":") + boolean(m.caps.hasCassette);
  json += "}";

  json += ",\"firstSlot\":" + std::to_string(m.firstSlot);
  json += ",\"lastSlot\":" + std::to_string(m.lastSlot);

  // Only the slots this machine actually has. A II+ has a slot 0 and a //e
  // does not, so a host that assumed the list started at 1 would silently drop
  // the one slot that differs.
  json += ",\"slots\":[";
  bool firstEntry = true;
  for (int slot = m.firstSlot; slot <= m.lastSlot; slot++) {
    const auto &s = m.slots[slot];
    if (!firstEntry) json += ",";
    firstEntry = false;
    json += "{\"slot\":" + std::to_string(slot);
    json += ",\"fixedCard\":";
    json += s.fixedCard ? "\"" + std::string(s.fixedCard) + "\"" : "null";
    json += ",\"defaultCard\":";
    json += s.defaultCard ? "\"" + std::string(s.defaultCard) + "\"" : "null";
    json += "}";
  }
  json += "]}";
  return json;
}

} // namespace
} // extern "C++"

EMSCRIPTEN_KEEPALIVE
int getMachineCount() { return a2e::MACHINE_COUNT; }

EMSCRIPTEN_KEEPALIVE
const char *getMachineKeyAt(int index) {
  return a2e::machineProfileAt(index).key;
}

EMSCRIPTEN_KEEPALIVE
const char *getMachineKey() {
  // g_host.machineId(), not the emulator: it is the one answer that is right whichever
  // kind of machine is running, and a IIgs has no Emulator to ask. Answering
  // with the //e's key while a IIgs ran would have the host size its renderer
  // for the wrong picture.
  return a2e::machineProfile(g_host.machineId()).key;
}

EMSCRIPTEN_KEEPALIVE
const char *getMachineName() {
  return a2e::machineProfile(g_host.machineId()).name;
}

// Whole profile in one round trip: the host needs most of it at once, and the
// Worker services RPCs on the thread that runs the emulation.
EMSCRIPTEN_KEEPALIVE
const char *getMachineProfileJSON() {
  static std::string buffer;
  // The host's profile, which is timed for the standard chosen.
  buffer = machineProfileToJSON(g_host.profile());
  return buffer.c_str();
}

// Describe a machine the emulator is not currently running, so a host can list
// what it could run before committing to one.
EMSCRIPTEN_KEEPALIVE
const char *getMachineProfileJSONAt(int index) {
  static std::string buffer;
  buffer = machineProfileToJSON(a2e::machineProfileAt(index));
  return buffer.c_str();
}

// Whether the running machine's system ROM was built into this binary. A
// machine can be fully described and still have no ROM to run — the II+ set is
// optional at build time — and a host that cannot tell the difference would
// present a machine that never reaches a prompt.
EMSCRIPTEN_KEEPALIVE
bool hasSystemROM() {
  REQUIRE_EMULATOR_OR(false);
  return g_host.emulator()->hasSystemROM();
}

// Whether a machine could actually be started, without switching to it.
EMSCRIPTEN_KEEPALIVE
bool isMachineRunnable(const char *key) {
  const auto *profile = a2e::findMachineProfile(key);
  if (!profile) return false;
  return a2e::Emulator::isMachineRunnable(profile->id);
}

// Switch machines. There is no way to convert a running machine into a
// different one — the RAM, the cards and the save state are all shaped to the
// machine that made them — so this destroys the emulator and builds the new
// one from scratch. Inserted media and host state do not survive; the caller
// is expected to reload them, exactly as it does after a page reload.
//
// Returns false and changes nothing if the key names no machine.
EMSCRIPTEN_KEEPALIVE
bool setMachine(const char *key) {
  const auto *profile = a2e::findMachineProfile(key);
  if (!profile) return false;

  return g_host.setMachine(profile->id);
}

// How much fast RAM a IIgs has, in kilobytes.
//
// Setting it rebuilds the machine, for the same reason switching machines
// does: the RAM, the cards and anything in memory are shaped to the machine
// that made them, and there is no way to grow one underneath a running
// program. A machine that is not a IIgs remembers the size for when one is
// built, and is otherwise untouched.
EMSCRIPTEN_KEEPALIVE
int getIIgsMemoryKB() {
  return static_cast<int>(g_host.iigsFastRam() / 1024);
}

// NTSC (0) or PAL (1). Switching times the running machine afresh and keeps
// everything else; a machine not made in PAL stays NTSC and answers false.
EMSCRIPTEN_KEEPALIVE
int getVideoStandard() {
  return static_cast<int>(g_host.videoStandard());
}

EMSCRIPTEN_KEEPALIVE
bool setVideoStandard(int standard) {
  return g_host.setVideoStandard(standard == 1 ? a2e::VideoStandard::PAL : a2e::VideoStandard::NTSC);
}

EMSCRIPTEN_KEEPALIVE
bool setIIgsMemoryKB(int kilobytes) {
  if (kilobytes <= 0) return false;
  return g_host.setIIgsFastRam(static_cast<size_t>(kilobytes) * 1024);
}

EMSCRIPTEN_KEEPALIVE
void forceRenderFrame() {
  if (g_host.iigs()) {
    g_host.iigs()->video().forceRenderFrame();
    return;
  }
  REQUIRE_EMULATOR();
  g_host.emulator()->getVideo().forceRenderFrame();
}

EMSCRIPTEN_KEEPALIVE
bool isFrameReady() {
  if (g_host.iigs()) {
    const bool ready = g_host.iigs()->isFrameReady();
    if (ready) g_host.iigs()->clearFrameReady();
    return ready;
  }
  REQUIRE_EMULATOR_OR(false);
  bool ready = g_host.emulator()->isFrameReady();
  if (ready) {
    g_host.emulator()->clearFrameReady();
  }
  return ready;
}

EMSCRIPTEN_KEEPALIVE
void keyDown(int keycode) {
  if (g_host.iigs()) {
    g_host.iigs()->keyDown(keycode);
    return;
  }
  REQUIRE_EMULATOR();
  g_host.emulator()->keyDown(keycode);
}

EMSCRIPTEN_KEEPALIVE
void keyUp(int keycode) {
  REQUIRE_EMULATOR();
  g_host.emulator()->keyUp(keycode);
}

EMSCRIPTEN_KEEPALIVE
int handleRawKeyDown(int browserKeycode, bool shift, bool ctrl, bool alt,
                     bool meta, bool capsLock, int keyLocation) {
  if (g_host.iigs()) {
    return g_host.iigs()->handleRawKeyDown(browserKeycode, shift, ctrl, alt, meta,
                                    capsLock, keyLocation);
  }
  REQUIRE_EMULATOR_OR(-1);
  return g_host.emulator()->handleRawKeyDown(browserKeycode, shift, ctrl, alt, meta,
                                      capsLock, keyLocation);
}

EMSCRIPTEN_KEEPALIVE
void handleRawKeyUp(int browserKeycode, bool shift, bool ctrl, bool alt,
                    bool meta, int keyLocation) {
  if (g_host.iigs()) {
    g_host.iigs()->handleRawKeyUp(browserKeycode, shift, ctrl, alt, meta, keyLocation);
    return;
  }
  REQUIRE_EMULATOR();
  g_host.emulator()->handleRawKeyUp(browserKeycode, shift, ctrl, alt, meta, keyLocation);
}

EMSCRIPTEN_KEEPALIVE
int pasteText(const char *text) {
  REQUIRE_EMULATOR_OR(0);
  return static_cast<int>(g_host.emulator()->pasteText(text));
}

EMSCRIPTEN_KEEPALIVE
void pasteKey(int appleKey) {
  REQUIRE_EMULATOR();
  g_host.emulator()->pasteKey(appleKey);
}

EMSCRIPTEN_KEEPALIVE
int pastePending() {
  REQUIRE_EMULATOR_OR(0);
  return static_cast<int>(g_host.emulator()->pastePending());
}

EMSCRIPTEN_KEEPALIVE
void clearPasteBuffer() {
  REQUIRE_EMULATOR();
  g_host.emulator()->clearPasteBuffer();
}

EMSCRIPTEN_KEEPALIVE
int charToAppleKey(int charCode) {
  return a2e::charToAppleKey(charCode);
}

// The game port is on the back of every machine here, a IIgs included: its
// paddle timers are the Mega II's and its buttons share $C061/$C062 with the
// Apple keys. Routing these to g_host.emulator() alone left a IIgs with a joystick
// and cursor keys that moved nothing.
EMSCRIPTEN_KEEPALIVE
void setButton(int button, bool pressed) {
  if (g_host.iigs()) {
    g_host.iigs()->setButton(button, pressed);
    return;
  }
  REQUIRE_EMULATOR();
  g_host.emulator()->setButton(button, pressed);
}

EMSCRIPTEN_KEEPALIVE
void setPaddleValue(int paddle, int value) {
  if (g_host.iigs()) {
    g_host.iigs()->setPaddleValue(paddle, value);
    return;
  }
  REQUIRE_EMULATOR();
  g_host.emulator()->setPaddleValue(paddle, value);
}

EMSCRIPTEN_KEEPALIVE
int getPaddleValue(int paddle) {
  if (g_host.iigs()) return g_host.iigs()->getPaddleValue(paddle);
  REQUIRE_EMULATOR_OR(128);
  return g_host.emulator()->getPaddleValue(paddle);
}

// Game I/O connector device: 0 = Apple resistive joystick, 1 = Sirius Joyport.
// A IIgs has the same connector and the same three pushbutton lines, so it
// takes the same device.
EMSCRIPTEN_KEEPALIVE
void setGamePortDevice(int device) {
  const a2e::GamePortDevice chosen = device == 1
                                         ? a2e::GamePortDevice::SiriusJoyport
                                         : a2e::GamePortDevice::AppleJoystick;
  if (g_host.iigs()) {
    g_host.iigs()->setGamePortDevice(chosen);
    return;
  }
  REQUIRE_EMULATOR();
  g_host.emulator()->setGamePortDevice(chosen);
}

EMSCRIPTEN_KEEPALIVE
int getGamePortDevice() {
  if (g_host.iigs()) return static_cast<int>(g_host.iigs()->gamePortDevice());
  REQUIRE_EMULATOR_OR(0);
  return static_cast<int>(g_host.emulator()->gamePortDevice());
}

// One call per stick rather than one per switch: the host knows all five
// switches at once, and this is a fire-and-forget RPC on an input path.
EMSCRIPTEN_KEEPALIVE
void setJoyportStick(int stick, int switches) {
  g_host.setJoyportStick(stick, switches);
}

EMSCRIPTEN_KEEPALIVE
int getJoyportStick(int stick) {
  if (g_host.iigs()) return g_host.iigs()->getJoyportStick(stick);
  REQUIRE_EMULATOR_OR(0);
  return g_host.emulator()->getJoyportStick(stick);
}

EMSCRIPTEN_KEEPALIVE
bool isKeyboardReady() {
  REQUIRE_EMULATOR_OR(true);
  return g_host.emulator()->isKeyboardReady();
}

EMSCRIPTEN_KEEPALIVE
void setSpeedMultiplier(int multiplier) {
  g_host.setSpeedMultiplier(multiplier);
}

EMSCRIPTEN_KEEPALIVE
int getSpeedMultiplier() {
  return g_host.speedMultiplier();
}

EMSCRIPTEN_KEEPALIVE
bool insertDisk(int drive, uint8_t *data, int size, const char *filename) {
  return g_host.insertDisk(drive, data, static_cast<size_t>(size), filename);
}

EMSCRIPTEN_KEEPALIVE
bool insertBlankDisk(int drive) {
  return g_host.insertBlankDisk(drive);
}

EMSCRIPTEN_KEEPALIVE
void ejectDisk(int drive) {
  g_host.ejectDisk(drive);
}

EMSCRIPTEN_KEEPALIVE
uint8_t *getDiskData(int drive, size_t *size) {
  if (!g_host.emulator()) { *size = 0; return nullptr; }
  return const_cast<uint8_t *>(g_host.emulator()->exportDiskData(drive, size));
}

EMSCRIPTEN_KEEPALIVE
const uint8_t *getDiskSectorData(int drive, size_t *size) {
  if (!g_host.emulator()) { *size = 0; return nullptr; }
  return g_host.emulator()->getDiskData(drive, size);
}

namespace {
// Where the beam is on whichever machine is running.
a2e::BeamPosition machineBeam() {
  if (g_host.iigs()) return g_host.iigs()->beam();
  if (!g_host.emulator()) return {};
  return a2e::beamPosition(g_host.emulator()->getTotalCycles(),
                           g_host.emulator()->getMachine().timing);
}
} // namespace

// ============================================================================
// Beam Position
//
// The video scanner counts like a television scans, so the cycle count is the
// beam position, and both machines derive it the same way from their own
// timing — a IIgs from the Mega II's clock, which is the one its video runs on.
// ============================================================================

EMSCRIPTEN_KEEPALIVE
int getFrameCycle() {
  if (g_host.iigs()) {
    const auto &timing = a2e::machineProfile(a2e::MachineId::AppleIIgs).timing;
    return static_cast<int>(g_host.iigs()->slowCycles() % timing.cyclesPerFrame());
  }
  REQUIRE_EMULATOR_OR(0);
  return g_host.emulator()->getFrameCycle();
}

EMSCRIPTEN_KEEPALIVE
int getBeamScanline() {
  return machineBeam().scanline;
}

EMSCRIPTEN_KEEPALIVE
int getBeamHPos() {
  return machineBeam().hPos;
}

EMSCRIPTEN_KEEPALIVE
int getBeamColumn() {
  return machineBeam().column;
}

EMSCRIPTEN_KEEPALIVE
bool isInVBL() {
  return machineBeam().inVerticalBlank;
}

EMSCRIPTEN_KEEPALIVE
bool isInHBLANK() {
  return machineBeam().inHorizontalBlank;
}

// ============================================================================
// Step Over / Step Out
// ============================================================================

// Both return the address the temporary breakpoint was put on, with the bank
// in it, or 0 if the machine single-stepped instead.
EMSCRIPTEN_KEEPALIVE
uint32_t stepOver() {
  if (g_host.iigs()) return g_host.iigs()->stepOver();
  REQUIRE_EMULATOR_OR(0);
  return g_host.emulator()->stepOver();
}

EMSCRIPTEN_KEEPALIVE
uint32_t stepOut() {
  if (g_host.iigs()) return g_host.iigs()->stepOut();
  REQUIRE_EMULATOR_OR(0);
  return g_host.emulator()->stepOut();
}

EMSCRIPTEN_KEEPALIVE
void clearTempBreakpoint() {
  REQUIRE_DEBUG();
  machineDebug()->clearTempBreakpoint();
}

EMSCRIPTEN_KEEPALIVE
bool isTempBreakpointHit() {
  REQUIRE_DEBUG_OR(false);
  return machineDebug()->isTempBreakpointHit();
}

// ============================================================================
// Breakpoints
//
// The address carries its bank, so a breakpoint on a IIgs names one of 256
// banks rather than an offset that every bank shares.
// ============================================================================

EMSCRIPTEN_KEEPALIVE
void addBreakpoint(uint32_t address) {
  REQUIRE_DEBUG();
  machineDebug()->addBreakpoint(address);
}

EMSCRIPTEN_KEEPALIVE
void removeBreakpoint(uint32_t address) {
  REQUIRE_DEBUG();
  machineDebug()->removeBreakpoint(address);
}

EMSCRIPTEN_KEEPALIVE
void enableBreakpoint(uint32_t address, bool enabled) {
  REQUIRE_DEBUG();
  machineDebug()->enableBreakpoint(address, enabled);
}

EMSCRIPTEN_KEEPALIVE
bool isBreakpointHit() {
  REQUIRE_DEBUG_OR(false);
  return machineDebug()->isBreakpointHit();
}

EMSCRIPTEN_KEEPALIVE
uint32_t getBreakpointAddress() {
  REQUIRE_DEBUG_OR(0);
  return machineDebug()->breakpointAddress();
}

// An execution range fires when the PC enters it, and reports through the
// breakpoint hit above with the PC that entered. Identified by its start.
EMSCRIPTEN_KEEPALIVE
void addBreakpointRange(uint32_t start, uint32_t end) {
  REQUIRE_DEBUG();
  machineDebug()->addBreakpointRange(start, end);
}

EMSCRIPTEN_KEEPALIVE
void removeBreakpointRange(uint32_t start) {
  REQUIRE_DEBUG();
  machineDebug()->removeBreakpointRange(start);
}

EMSCRIPTEN_KEEPALIVE
void enableBreakpointRange(uint32_t start, bool enabled) {
  REQUIRE_DEBUG();
  machineDebug()->enableBreakpointRange(start, enabled);
}

// A stack pointer breakpoint fires when SP enters [low, high], and has its own
// hit because it is not an address the host can look a breakpoint up by.
EMSCRIPTEN_KEEPALIVE
void addStackBreakpoint(uint32_t low, uint32_t high) {
  REQUIRE_DEBUG();
  machineDebug()->addStackBreakpoint(low, high);
}

EMSCRIPTEN_KEEPALIVE
void removeStackBreakpoint(uint32_t low) {
  REQUIRE_DEBUG();
  machineDebug()->removeStackBreakpoint(low);
}

EMSCRIPTEN_KEEPALIVE
void enableStackBreakpoint(uint32_t low, bool enabled) {
  REQUIRE_DEBUG();
  machineDebug()->enableStackBreakpoint(low, enabled);
}

EMSCRIPTEN_KEEPALIVE
bool isStackBreakpointHit() {
  REQUIRE_DEBUG_OR(false);
  return machineDebug()->isStackBreakpointHit();
}

EMSCRIPTEN_KEEPALIVE
uint32_t getStackBreakpointHitLow() {
  REQUIRE_DEBUG_OR(0);
  return machineDebug()->stackBreakpointHitLow();
}

// ============================================================================
// BASIC Breakpoints
// ============================================================================

EMSCRIPTEN_KEEPALIVE
void addBasicBreakpoint(uint16_t lineNumber, int statementIndex) {
  REQUIRE_EMULATOR();
  g_host.emulator()->addBasicBreakpoint(lineNumber, statementIndex);
}

EMSCRIPTEN_KEEPALIVE
void removeBasicBreakpoint(uint16_t lineNumber, int statementIndex) {
  REQUIRE_EMULATOR();
  g_host.emulator()->removeBasicBreakpoint(lineNumber, statementIndex);
}

EMSCRIPTEN_KEEPALIVE
void clearBasicBreakpoints() {
  REQUIRE_EMULATOR();
  g_host.emulator()->clearBasicBreakpoints();
}

EMSCRIPTEN_KEEPALIVE
void clearBasicBreakpointHit() {
  REQUIRE_EMULATOR();
  g_host.emulator()->clearBasicBreakpointHit();
}

EMSCRIPTEN_KEEPALIVE
void addBasicConditionRule(int id, const char* expression) {
  REQUIRE_EMULATOR();
  g_host.emulator()->addBasicConditionRule(id, expression);
}

EMSCRIPTEN_KEEPALIVE
void removeBasicConditionRule(int id) {
  REQUIRE_EMULATOR();
  g_host.emulator()->removeBasicConditionRule(id);
}

EMSCRIPTEN_KEEPALIVE
void clearBasicConditionRules() {
  REQUIRE_EMULATOR();
  g_host.emulator()->clearBasicConditionRules();
}

EMSCRIPTEN_KEEPALIVE
int getBasicConditionRuleHitId() {
  REQUIRE_EMULATOR_OR(-1);
  return g_host.emulator()->getBasicConditionRuleHitId();
}

EMSCRIPTEN_KEEPALIVE
bool hasBasicBreakpoints() {
  REQUIRE_EMULATOR_OR(false);
  return g_host.emulator()->hasBasicBreakpoints();
}

EMSCRIPTEN_KEEPALIVE
bool isBasicBreakpointHit() {
  REQUIRE_EMULATOR_OR(false);
  return g_host.emulator()->isBasicBreakpointHit();
}

EMSCRIPTEN_KEEPALIVE
uint16_t getBasicBreakLine() {
  REQUIRE_EMULATOR_OR(0);
  return g_host.emulator()->getBasicBreakLine();
}

EMSCRIPTEN_KEEPALIVE
bool isBasicProgramRunning() {
  REQUIRE_EMULATOR_OR(false);
  return g_host.emulator()->isBasicProgramRunning();
}

EMSCRIPTEN_KEEPALIVE
bool isBasicErrorHit() {
  REQUIRE_EMULATOR_OR(false);
  return g_host.emulator()->isBasicErrorHit();
}

EMSCRIPTEN_KEEPALIVE
uint16_t getBasicErrorLine() {
  REQUIRE_EMULATOR_OR(0);
  return g_host.emulator()->getBasicErrorLine();
}

EMSCRIPTEN_KEEPALIVE
uint16_t getBasicErrorTxtptr() {
  REQUIRE_EMULATOR_OR(0);
  return g_host.emulator()->getBasicErrorTxtptr();
}

EMSCRIPTEN_KEEPALIVE
uint8_t getBasicErrorCode() {
  REQUIRE_EMULATOR_OR(0);
  return g_host.emulator()->getBasicErrorCode();
}

EMSCRIPTEN_KEEPALIVE
void clearBasicError() {
  REQUIRE_EMULATOR();
  g_host.emulator()->clearBasicError();
}

EMSCRIPTEN_KEEPALIVE
void stepBasicLine() {
  REQUIRE_EMULATOR();
  g_host.emulator()->stepBasicLine();
}

EMSCRIPTEN_KEEPALIVE
void stepBasicStatement() {
  REQUIRE_EMULATOR();
  g_host.emulator()->stepBasicStatement();
}

EMSCRIPTEN_KEEPALIVE
uint16_t getBasicTxtptr() {
  REQUIRE_EMULATOR_OR(0);
  return g_host.emulator()->getBasicTxtptr();
}

EMSCRIPTEN_KEEPALIVE
int getBasicStatementIndex() {
  REQUIRE_EMULATOR_OR(0);
  return g_host.emulator()->getBasicStatementIndex();
}

// Debug function to get BASIC memory state with detailed line info
// Uses readRAM to bypass ALTZP - BASIC always uses main RAM for zero page
EMSCRIPTEN_KEEPALIVE
void getBasicDebugInfo(uint16_t* txttab, uint16_t* vartab, uint16_t* curlin, uint16_t* txtptr) {
  if (!g_host.emulator()) return;
  auto& mmu = g_host.emulator()->getMMU();
  *txttab = mmu.readRAM(0x67, false) | (mmu.readRAM(0x68, false) << 8);
  *vartab = mmu.readRAM(0x69, false) | (mmu.readRAM(0x6A, false) << 8);
  *curlin = mmu.readRAM(0x75, false) | (mmu.readRAM(0x76, false) << 8);
  *txtptr = mmu.readRAM(0xB8, false) | (mmu.readRAM(0xB9, false) << 8);
}

// BASIC line heat map
EMSCRIPTEN_KEEPALIVE
void setBasicHeatMapEnabled(bool enabled) {
  REQUIRE_EMULATOR();
  g_host.emulator()->setBasicHeatMapEnabled(enabled);
}

EMSCRIPTEN_KEEPALIVE
void clearBasicHeatMap() {
  REQUIRE_EMULATOR();
  g_host.emulator()->clearBasicHeatMap();
}

EMSCRIPTEN_KEEPALIVE
int getBasicHeatMapSize() {
  REQUIRE_EMULATOR_OR(0);
  return g_host.emulator()->getBasicHeatMapSize();
}

EMSCRIPTEN_KEEPALIVE
int getBasicHeatMapData(uint16_t* lines, uint32_t* counts, int maxEntries) {
  REQUIRE_EMULATOR_OR(0);
  return g_host.emulator()->getBasicHeatMapData(lines, counts, maxEntries);
}

// Debug function to dump bytes around TXTPTR to see what's there
EMSCRIPTEN_KEEPALIVE
void getBasicLineBytes(uint8_t* buffer, int* lineStart, int* colonCount) {
  if (!g_host.emulator()) return;
  auto& mmu = g_host.emulator()->getMMU();

  uint16_t txttab = mmu.readRAM(0x67, false) | (mmu.readRAM(0x68, false) << 8);
  uint16_t curlin = mmu.readRAM(0x75, false) | (mmu.readRAM(0x76, false) << 8);
  uint16_t txtptr = mmu.readRAM(0xB8, false) | (mmu.readRAM(0xB9, false) << 8);

  // Find current line
  uint16_t addr = txttab;
  uint16_t foundLineStart = 0;

  while (addr < 0xC000) {
    uint16_t nextPtr = mmu.readRAM(addr, false) | (mmu.readRAM(addr + 1, false) << 8);
    if (nextPtr == 0) break;
    // Links only move forward; one that does not is not a BASIC program,
    // and following it would never end (Emulator::findCurrentLineStart).
    if (nextPtr <= addr) break;

    uint16_t lineNum = mmu.readRAM(addr + 2, false) | (mmu.readRAM(addr + 3, false) << 8);
    if (lineNum == curlin) {
      foundLineStart = addr + 4;
      break;
    }
    addr = nextPtr;
  }

  *lineStart = foundLineStart;

  // Count colons from line start to TXTPTR
  int count = 0;
  if (foundLineStart > 0 && txtptr > foundLineStart) {
    for (uint16_t a = foundLineStart; a < txtptr && a < foundLineStart + 64; a++) {
      uint8_t byte = mmu.readRAM(a, false);
      if (byte == 0) break;
      if (byte == 0x3A) count++;  // Colon
    }
  }
  *colonCount = count;

  // Copy 32 bytes starting from line start (or txtptr if lineStart is 0)
  uint16_t dumpStart = foundLineStart > 0 ? foundLineStart : txtptr;
  for (int i = 0; i < 32; i++) {
    buffer[i] = mmu.readRAM(dumpStart + i, false);
  }
}

// ===========================================================================
// The processor, whichever one the machine has
//
// One set of questions for both: a 6502's answers are a 65816's with the high
// halves zero and no banks, so the wider shape describes both and the host
// reads the machine profile to know how much of it to show. What a 6502 does
// not have — a program bank, a data bank, a direct page, a mode — reads as
// zero rather than as an error, because "this machine has none" is the answer.
// ===========================================================================

EMSCRIPTEN_KEEPALIVE
uint32_t getPC() {
  if (g_host.iigs()) return g_host.iigs()->cpu().getPCFull();
  REQUIRE_EMULATOR_OR(0);
  return g_host.emulator()->getPC();
}

EMSCRIPTEN_KEEPALIVE
uint16_t getA() {
  if (g_host.iigs()) return g_host.iigs()->cpu().getA();
  REQUIRE_EMULATOR_OR(0);
  return g_host.emulator()->getA();
}

EMSCRIPTEN_KEEPALIVE
uint16_t getX() {
  if (g_host.iigs()) return g_host.iigs()->cpu().getX();
  REQUIRE_EMULATOR_OR(0);
  return g_host.emulator()->getX();
}

EMSCRIPTEN_KEEPALIVE
uint16_t getY() {
  if (g_host.iigs()) return g_host.iigs()->cpu().getY();
  REQUIRE_EMULATOR_OR(0);
  return g_host.emulator()->getY();
}

EMSCRIPTEN_KEEPALIVE
uint16_t getSP() {
  if (g_host.iigs()) return g_host.iigs()->cpu().getSP();
  REQUIRE_EMULATOR_OR(0);
  return g_host.emulator()->getSP();
}

EMSCRIPTEN_KEEPALIVE
uint8_t getP() {
  if (g_host.iigs()) return g_host.iigs()->cpu().getP();
  REQUIRE_EMULATOR_OR(0);
  return g_host.emulator()->getP();
}

/** The program bank: which of the 65816's 256 banks the code is in. */
EMSCRIPTEN_KEEPALIVE
uint8_t getPBR() {
  if (g_host.iigs()) return g_host.iigs()->cpu().getPBR();
  return 0;
}

/** The data bank, which an instruction's operands are read through. */
EMSCRIPTEN_KEEPALIVE
uint8_t getDBR() {
  if (g_host.iigs()) return g_host.iigs()->cpu().getDBR();
  return 0;
}

/** The direct page register: where the 65816's zero page has been moved to. */
EMSCRIPTEN_KEEPALIVE
uint16_t getDirectPage() {
  if (g_host.iigs()) return g_host.iigs()->cpu().getD();
  return 0;
}

// What width the registers are at this moment, which is not a constant on a
// 65816 and is what decides how long an immediate is. A machine whose
// registers cannot change width answers "emulation mode, both eight bits",
// because that is exactly the state it is permanently in.
EMSCRIPTEN_KEEPALIVE
uint8_t getCpuWidths() {
  if (g_host.iigs()) {
    const a2e::CPU65816 &cpu = g_host.iigs()->cpu();
    return static_cast<uint8_t>(
        (cpu.getEmulation() ? a2e::MachineDebug::WIDTH_EMULATION : 0) |
        (cpu.accumulator8() ? a2e::MachineDebug::WIDTH_A8 : 0) |
        (cpu.index8() ? a2e::MachineDebug::WIDTH_INDEX8 : 0));
  }
  return static_cast<uint8_t>(a2e::MachineDebug::WIDTH_EMULATION |
                              a2e::MachineDebug::WIDTH_A8 |
                              a2e::MachineDebug::WIDTH_INDEX8);
}

EMSCRIPTEN_KEEPALIVE
uint64_t getTotalCycles() {
  // The machine's own clock, which is what the beam and the drive are counted
  // in. On a IIgs that is the Mega II's slow side rather than the 65816's
  // cycles, because the processor's clock changes speed under it.
  if (g_host.iigs()) return g_host.iigs()->slowCycles();
  REQUIRE_EMULATOR_OR(0);
  return g_host.emulator()->getTotalCycles();
}

EMSCRIPTEN_KEEPALIVE
bool isIRQPending() {
  if (g_host.iigs()) return g_host.iigs()->cpu().isIRQPending();
  REQUIRE_EMULATOR_OR(false);
  return g_host.emulator()->isIRQPending();
}

EMSCRIPTEN_KEEPALIVE
bool isNMIPending() {
  if (g_host.iigs()) return g_host.iigs()->cpu().isNMIPending();
  REQUIRE_EMULATOR_OR(false);
  return g_host.emulator()->isNMIPending();
}

EMSCRIPTEN_KEEPALIVE
bool isNMIEdge() {
  // The 6502 core distinguishes the edge from the level; the 65816 core
  // latches and reports one thing, so there is no separate edge to report.
  if (g_host.iigs()) return false;
  REQUIRE_EMULATOR_OR(false);
  return g_host.emulator()->isNMIEdge();
}

// CPU register setters (for debugger editing)
EMSCRIPTEN_KEEPALIVE
void setRegA(uint16_t value) {
  if (g_host.iigs()) { g_host.iigs()->cpu().setA(value); return; }
  REQUIRE_EMULATOR();
  g_host.emulator()->setA(static_cast<uint8_t>(value));
}

EMSCRIPTEN_KEEPALIVE
void setRegX(uint16_t value) {
  if (g_host.iigs()) { g_host.iigs()->cpu().setX(value); return; }
  REQUIRE_EMULATOR();
  g_host.emulator()->setX(static_cast<uint8_t>(value));
}

EMSCRIPTEN_KEEPALIVE
void setRegY(uint16_t value) {
  if (g_host.iigs()) { g_host.iigs()->cpu().setY(value); return; }
  REQUIRE_EMULATOR();
  g_host.emulator()->setY(static_cast<uint8_t>(value));
}

EMSCRIPTEN_KEEPALIVE
void setRegSP(uint16_t value) {
  if (g_host.iigs()) { g_host.iigs()->cpu().setSP(value); return; }
  REQUIRE_EMULATOR();
  g_host.emulator()->setSP(static_cast<uint8_t>(value));
}

EMSCRIPTEN_KEEPALIVE
void setRegPC(uint32_t value) {
  // The bank travels with the address, so editing the program counter in a
  // debugger can send the processor into another bank — which is the only way
  // to get there by hand.
  if (g_host.iigs()) {
    g_host.iigs()->cpu().setPBR(static_cast<uint8_t>((value >> 16) & 0xFF));
    g_host.iigs()->cpu().setPC(static_cast<uint16_t>(value & 0xFFFF));
    return;
  }
  REQUIRE_EMULATOR();
  g_host.emulator()->setPC(static_cast<uint16_t>(value & 0xFFFF));
}

EMSCRIPTEN_KEEPALIVE
void setRegP(uint8_t value) {
  if (g_host.iigs()) { g_host.iigs()->cpu().setP(value); return; }
  REQUIRE_EMULATOR();
  g_host.emulator()->setP(value);
}

EMSCRIPTEN_KEEPALIVE
void setRegPBR(uint8_t value) {
  if (g_host.iigs()) g_host.iigs()->cpu().setPBR(value);
}

EMSCRIPTEN_KEEPALIVE
void setRegDBR(uint8_t value) {
  if (g_host.iigs()) g_host.iigs()->cpu().setDBR(value);
}

EMSCRIPTEN_KEEPALIVE
void setRegDirectPage(uint16_t value) {
  if (g_host.iigs()) g_host.iigs()->cpu().setD(value);
}

// ===========================================================================
// Stopping and starting
// ===========================================================================

EMSCRIPTEN_KEEPALIVE
bool isPaused() {
  if (g_host.iigs()) return g_host.iigs()->isPaused();
  REQUIRE_EMULATOR_OR(false);
  return g_host.emulator()->isPaused();
}

EMSCRIPTEN_KEEPALIVE
void setPaused(bool paused) {
  if (g_host.iigs()) { g_host.iigs()->setPaused(paused); return; }
  REQUIRE_EMULATOR();
  g_host.emulator()->setPaused(paused);
}

EMSCRIPTEN_KEEPALIVE
void stepInstruction() {
  if (g_host.iigs()) { g_host.iigs()->stepInstruction(); return; }
  REQUIRE_EMULATOR();
  g_host.emulator()->stepInstruction();
}

// ===========================================================================
// Memory, at 24 bits
//
// A //e's address is the low sixteen and the bank is ignored, so the host does
// not have to ask which machine it is talking to before reading a byte.
// ===========================================================================

EMSCRIPTEN_KEEPALIVE
uint8_t readMemory(uint32_t address) {
  if (g_host.iigs()) return g_host.iigs()->memory().read(address & 0xFFFFFF);
  REQUIRE_EMULATOR_OR(0);
  return g_host.emulator()->readMemory(static_cast<uint16_t>(address & 0xFFFF));
}

EMSCRIPTEN_KEEPALIVE
uint8_t peekMemory(uint32_t address) {
  if (g_host.iigs()) return g_host.iigs()->memory().peek(address & 0xFFFFFF);
  REQUIRE_EMULATOR_OR(0);
  return g_host.emulator()->peekMemory(static_cast<uint16_t>(address & 0xFFFF));
}

EMSCRIPTEN_KEEPALIVE
uint8_t readMainRAM(uint32_t address) {
  // Main RAM whatever the switches say, which is where Applesoft keeps its
  // zero page. On a IIgs that is the Mega II's main bank — bank $E0 — because
  // that is the //e whose ROM the interpreter is running from.
  if (g_host.iigs()) {
    return g_host.iigs()->memory().megaII().readRAM(
        static_cast<uint16_t>(address & 0xFFFF), false);
  }
  REQUIRE_EMULATOR_OR(0);
  return g_host.emulator()->getMMU().readRAM(static_cast<uint16_t>(address & 0xFFFF),
                                      false);
}

EMSCRIPTEN_KEEPALIVE
void writeMemory(uint32_t address, uint8_t value) {
  if (g_host.iigs()) { g_host.iigs()->memory().write(address & 0xFFFFFF, value); return; }
  REQUIRE_EMULATOR();
  g_host.emulator()->writeMemory(static_cast<uint16_t>(address & 0xFFFF), value);
}

// ===========================================================================
// Battery RAM
//
// The 256 bytes beside the clock, which a real machine's battery keeps alive
// and which hold everything the Control Panel sets. The host keeps them so
// they survive a reload: without that the firmware finds its checksum wrong on
// every start and writes its own defaults back over the lot.
//
// The bytes go out and come back exactly as they are, checksum included. The
// firmware checks that checksum before trusting the contents and its algorithm
// is not one this project has worked out — but it never needs to be, as long
// as nothing alters the bytes the firmware itself wrote.
// ===========================================================================

EMSCRIPTEN_KEEPALIVE
const uint8_t *getBatteryRam() {
  if (!g_host.iigs()) return nullptr;
  return g_host.iigs()->memory().clock().batteryRamBytes();
}

EMSCRIPTEN_KEEPALIVE
int getBatteryRamSize() {
  return g_host.iigs() ? static_cast<int>(a2e::iigs::IIgsClock::batteryRamSize()) : 0;
}

EMSCRIPTEN_KEEPALIVE
void setBatteryRam(const uint8_t *bytes, int size) {
  if (!g_host.iigs() || !bytes || size <= 0) return;
  g_host.iigs()->memory().clock().loadBatteryRam(bytes, static_cast<size_t>(size));
}

// ===========================================================================
// The IIgs's serial loopback cable
//
// A cable from one port on the back of the machine to the other, crossing
// transmit and receive and the handshake lines. Nothing but the Apple IIgs
// Diagnostic's External Serial Ports Test wants one, and with it fitted the
// ports cannot reach anything else: a byte the printer driver sends goes round
// to the other socket rather than out of the machine. It is therefore off
// unless the host asks.
// ===========================================================================

EMSCRIPTEN_KEEPALIVE
void setIIgsLoopbackCable(bool fitted) {
  if (!g_host.iigs()) return;
  g_host.iigs()->memory().scc().setLoopbackCable(fitted);
}

EMSCRIPTEN_KEEPALIVE
bool hasIIgsLoopbackCable() {
  return g_host.iigs() && g_host.iigs()->memory().scc().hasLoopbackCable();
}

/** Whether anything has written to it since this was last asked. */
EMSCRIPTEN_KEEPALIVE
bool batteryRamChanged() {
  return g_host.takeBatteryRamChanged();
}

// The machine's memory banks, so a memory view can offer the ones that exist
// rather than 256 of which most answer nothing. One JSON string, asked for
// once: a //e has a single bank, and a IIgs has its fast RAM, the Mega II's
// two banks and its ROM.
EMSCRIPTEN_KEEPALIVE
const char *getMemoryBanksJSON() {
  static std::string json;
  json = "[";
  auto entry = [&](int bank, const char *name) {
    if (json.size() > 1) json += ",";
    json += "{\"bank\":" + std::to_string(bank) + ",\"name\":\"" +
            std::string(name) + "\"}";
  };

  if (g_host.iigs()) {
    // Fast RAM, in whole 64K banks from $00 up: how many there are is what
    // the user chose in the Machine menu.
    const size_t banks = g_host.iigs()->memory().fastRamSize() / 0x10000;
    for (size_t i = 0; i < banks; i++) {
      const std::string name = "Fast RAM";
      entry(static_cast<int>(i), name.c_str());
    }
    entry(a2e::iigs::SLOW_BANK_MAIN, "Mega II main");
    entry(a2e::iigs::SLOW_BANK_AUX, "Mega II auxiliary");
    // The ROM fills the top of the address space: a 128KB ROM 01 is two
    // banks, a 256KB ROM 3 is four.
    size_t romSize = 0;
    a2e::Emulator::systemROMFor(g_host.machineId(), romSize);
    const size_t romBanks = romSize / 0x10000;
    for (size_t i = 0; i < romBanks; i++) {
      const int bank = 0x100 - static_cast<int>(romBanks) + static_cast<int>(i);
      entry(bank, "ROM");
    }
  } else {
    entry(0, "Main");
  }
  json += "]";
  return json.c_str();
}

// ===========================================================================
// Disassembly
//
// Two processors, two disassemblers, and the choice is made here rather than
// by the host: a 65816's instruction lengths depend on the M and X flags, so
// only something with the live processor in front of it can walk a code
// stream correctly.
// ===========================================================================


EMSCRIPTEN_KEEPALIVE
const char *disassembleAt(uint32_t address) {
  // The whole line as the machine's own monitor writes it, which the Stack
  // Viewer reads the mnemonic out of.
  static std::string buffer;
  buffer.clear();
  if (g_host.iigs()) {
    const a2e::CPU65816 &cpu = g_host.iigs()->cpu();
    uint8_t bytes[4];
    for (int i = 0; i < 4; i++) {
      bytes[i] = g_host.peek((address & 0xFF0000) | static_cast<uint16_t>((address & 0xFFFF) + i));
    }
    buffer = a2e::formatDisasm816(
        a2e::disassemble816(bytes, 4, address & 0xFFFFFF, cpu.accumulator8(), cpu.index8()));
  } else if (g_host.emulator()) {
    buffer = g_host.emulator()->disassembleAt(static_cast<uint16_t>(address & 0xFFFF));
  }
  return buffer.c_str();
}

// Disassemble a run of instructions in a single call.
//
// The CPU debugger used to build this view from JavaScript with one
// _peekMemory round-trip per byte of alignment lookback plus two more per
// rendered line — roughly 120 worker round-trips per refresh, 30 times a
// second. Every one of those stole time from the emulation running on that
// same worker thread, so an open debugger measurably slowed the machine it was
// inspecting. Both the alignment scan and the disassembly live here now: the
// caller makes one call and splits the result on '\n'.
//
// Each line is three tab-separated fields: the address in hex, the instruction
// bytes in hex, and the text. It used to be one fixed-width string the caller
// sliced by column, which stopped working the moment an address needed six
// digits and an instruction four bytes — and would have failed silently, by
// reading the wrong columns rather than by erroring.
//
// centerAddr is always listed as an instruction boundary, with up to
// instructionsBefore instructions of leading context found by an alignment
// search (disasm_align.hpp).
//
// A NEGATIVE centerAddr means "centre on the current PC". That exists so the
// debugger can put this call in the same batch as the register reads: it would
// otherwise have to fetch PC in one round-trip purely to compute the argument
// for a second, which is the round-trip this export was written to remove.
EMSCRIPTEN_KEEPALIVE
const char *disassembleRange(int32_t centerAddrOrPC, int instructionsBefore,
                             int count) {
  static std::string buffer;
  buffer.clear();
  if (!g_host.emulator() && !g_host.iigs()) return buffer.c_str();
  if (count <= 0) return buffer.c_str();
  if (instructionsBefore < 0) instructionsBefore = 0;

  const uint32_t centre =
      centerAddrOrPC < 0 ? getPC() : (static_cast<uint32_t>(centerAddrOrPC) & 0xFFFFFF);
  const std::vector<a2e::host::Instruction> lines =
      g_host.disassembleRange(centre, instructionsBefore, count);
  for (size_t i = 0; i < lines.size(); i++) {
    const a2e::host::Instruction &in = lines[i];
    if (i > 0) buffer.push_back('\n');
    char head[16];
    snprintf(head, sizeof head, "%06X\t", in.address);
    buffer += head;
    for (int b = 0; b < in.length; b++) {
      char byteText[8];
      snprintf(byteText, sizeof byteText, b == 0 ? "%02X" : " %02X", in.bytes[b]);
      buffer += byteText;
    }
    buffer.push_back('\t');
    buffer += instructionText(in);
  }

  return buffer.c_str();
}

namespace {
// Each machine packs its own word: a IIgs's switches are its Mega II's, and
// the pushbuttons and the keyboard come from the ADB rather than a game
// connector.
uint64_t softSwitchState() {
  return g_host.softSwitchValue(a2e::MachineDebug::SWITCH_FLAGS);
}

void appendJSONString(std::string &out, const char *text) {
  out += '"';
  for (const char *c = text; *c; c++) {
    if (*c == '"' || *c == '\\') out += '\\';
    out += *c;
  }
  out += '"';
}
} // namespace

EMSCRIPTEN_KEEPALIVE
uint32_t getSoftSwitchState() {
  return static_cast<uint32_t>(softSwitchState() & 0xFFFFFFFF);
}

EMSCRIPTEN_KEEPALIVE
uint32_t getSoftSwitchStateHigh() {
  return static_cast<uint32_t>(softSwitchState() >> 32);
}

// The switches and registers the running machine has (soft_switch_catalog),
// as a JSON array in one round trip.
EMSCRIPTEN_KEEPALIVE
const char *getSoftSwitchCatalogJSON() {
  static std::string buffer;
  buffer = "[";
  bool first = true;
  for (const a2e::SoftSwitchInfo &s : g_host.softSwitches()) {
    if (!first) buffer += ',';
    first = false;
    buffer += "{\"key\":";
    appendJSONString(buffer, s.key);
    buffer += ",\"name\":";
    appendJSONString(buffer, s.name);
    buffer += ",\"group\":";
    appendJSONString(buffer, s.group);
    buffer += ",\"address\":";
    appendJSONString(buffer, s.address);
    buffer += ",\"desc\":";
    appendJSONString(buffer, s.description);
    buffer += ",\"source\":" + std::to_string(s.source);
    buffer += ",\"bit\":" + std::to_string(s.bit);
    buffer += std::string(",\"readOnly\":") + (s.readOnly ? "true" : "false");
    buffer += "}";
  }
  buffer += "]";
  return buffer.c_str();
}

// A register's byte, or the low half of the switch word for source 0.
EMSCRIPTEN_KEEPALIVE
uint32_t getSoftSwitchValue(uint32_t source) {
  return static_cast<uint32_t>(g_host.softSwitchValue(source));
}

// Soft switch breakpoints (MachineDebug). Every switch in the word sits in
// its low 32 bits, so a mask and a value of 32 bits reach all of them.
EMSCRIPTEN_KEEPALIVE
int32_t addSwitchBreakpoint(uint32_t source, uint32_t mask, int condition,
                            uint32_t value) {
  REQUIRE_DEBUG_OR(-1);
  return machineDebug()->addSwitchBreakpoint(
      source, mask, static_cast<a2e::MachineDebug::SwitchCondition>(condition),
      value);
}

EMSCRIPTEN_KEEPALIVE
void removeSwitchBreakpoint(int32_t id) {
  REQUIRE_DEBUG();
  machineDebug()->removeSwitchBreakpoint(id);
}

EMSCRIPTEN_KEEPALIVE
void enableSwitchBreakpoint(int32_t id, bool enabled) {
  REQUIRE_DEBUG();
  machineDebug()->enableSwitchBreakpoint(id, enabled);
}

EMSCRIPTEN_KEEPALIVE
void clearSwitchBreakpoints() {
  REQUIRE_DEBUG();
  machineDebug()->clearSwitchBreakpoints();
}

EMSCRIPTEN_KEEPALIVE
bool isSwitchBreakpointHit() {
  REQUIRE_DEBUG_OR(false);
  return machineDebug()->isSwitchBreakpointHit();
}

EMSCRIPTEN_KEEPALIVE
int32_t getSwitchBreakpointHitId() {
  REQUIRE_DEBUG_OR(-1);
  return machineDebug()->switchBreakpointHitId();
}

EMSCRIPTEN_KEEPALIVE
const char *getSwitchHitText() {
  static std::string buffer;
  buffer = g_host.switchHitText();
  return buffer.c_str();
}

// Screen text extraction
EMSCRIPTEN_KEEPALIVE
int screenCodeToAscii(uint8_t code) {
  return a2e::Emulator::screenCodeToAscii(code);
}

EMSCRIPTEN_KEEPALIVE
const char* readScreenText(int startRow, int startCol, int endRow, int endCol) {
  if (g_host.iigs()) {
    static std::string buffer;
    buffer = g_host.iigs()->screenText(startRow, startCol, endRow, endCol);
    return buffer.c_str();
  }
  REQUIRE_EMULATOR_OR("");
  return g_host.emulator()->readScreenText(startRow, startCol, endRow, endCol);
}

// Disk controller state for debugging
EMSCRIPTEN_KEEPALIVE
int getDiskTrack(int drive) {
  REQUIRE_DISK_OR(0);
  auto &disk = (*diskController());
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
  REQUIRE_DISK_OR(0);
  (void)drive; // Phase states are controller-wide
  return (*diskController()).getPhaseStates();
}

EMSCRIPTEN_KEEPALIVE
bool getDiskMotorOn(int drive) {
  REQUIRE_DISK_OR(false);
  (void)drive; // Motor state is controller-wide
  return (*diskController()).isFiveInchMotorOn();
}

EMSCRIPTEN_KEEPALIVE
void stopDiskMotor() {
  REQUIRE_DISK();
  (*diskController()).stopMotor();
}

EMSCRIPTEN_KEEPALIVE
bool getDiskWriteMode(int drive) {
  REQUIRE_DISK_OR(false);
  (void)drive; // Write mode (Q7) is controller-wide
  return (*diskController()).getQ7();
}

EMSCRIPTEN_KEEPALIVE
int getDiskHeadPosition(int drive) {
  REQUIRE_DISK_OR(0);
  auto &disk = (*diskController());
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
  REQUIRE_DISK_OR(0);
  return (*diskController()).getSelectedDrive();
}

EMSCRIPTEN_KEEPALIVE
bool isDiskInserted(int drive) {
  return g_host.isDiskInserted(drive);
}

EMSCRIPTEN_KEEPALIVE
uint8_t getLastDiskByte() {
  REQUIRE_DISK_OR(0);
  return (*diskController()).getDataLatch();
}

EMSCRIPTEN_KEEPALIVE
uint8_t getTrackNibble(int drive, int track, int position) {
  REQUIRE_DISK_OR(0);
  if ((*diskController()).hasDisk(drive)) {
    const auto *image = (*diskController()).getDiskImage(drive);
    if (image) {
      return image->getNibbleAt(track, position);
    }
  }
  return 0;
}

EMSCRIPTEN_KEEPALIVE
int getTrackNibbleCount(int drive, int track) {
  REQUIRE_DISK_OR(0);
  if ((*diskController()).hasDisk(drive)) {
    const auto *image = (*diskController()).getDiskImage(drive);
    if (image) {
      return image->getTrackNibbleCount(track);
    }
  }
  return 0;
}

EMSCRIPTEN_KEEPALIVE
size_t getCurrentNibblePosition(int drive) {
  REQUIRE_DISK_OR(0);
  if ((*diskController()).hasDisk(drive)) {
    const auto *image = (*diskController()).getDiskImage(drive);
    if (image) {
      return image->getCurrentNibblePosition();
    }
  }
  return 0;
}

// ---- Disk Inspector ----------------------------------------------------------
// What is recorded on a drive's disk, read the way the drive reads it, for
// every format alike. See core/disk-image/disk_inspection.hpp for the layout
// of both buffers. Each is kept until the next call of the same export.

static std::vector<uint8_t> g_diskOverview;

// Inspecting a track changes nothing on the disk, though a sector image fills
// its encoding cache on the way, so this does not go through the writable
// accessor: that counts as a change, and the window would re-read for ever.
static a2e::DiskImage *inspectableImage(int drive) {
  return const_cast<a2e::DiskImage *>((*diskController()).getDiskImage(drive));
}

static std::vector<uint8_t> g_diskTrackDetail;

EMSCRIPTEN_KEEPALIVE
const uint8_t *getDiskOverview(int drive, int buckets, size_t *size) {
  *size = 0;
  REQUIRE_DISK_OR(nullptr);
  a2e::DiskImage *image = inspectableImage(drive);
  if (!image) return nullptr;
  g_diskOverview = a2e::inspect::buildOverview(*image, buckets);
  *size = g_diskOverview.size();
  return g_diskOverview.data();
}

EMSCRIPTEN_KEEPALIVE
const uint8_t *getDiskTrackDetail(int drive, int quarterTrack,
                                  int timingBuckets, size_t *size) {
  *size = 0;
  REQUIRE_DISK_OR(nullptr);
  a2e::DiskImage *image = inspectableImage(drive);
  if (!image) return nullptr;
  g_diskTrackDetail =
      a2e::inspect::buildTrackDetail(*image, quarterTrack, timingBuckets);
  *size = g_diskTrackDetail.size();
  return g_diskTrackDetail.data();
}

// Where the disk is under the head, in 65536ths of a revolution
EMSCRIPTEN_KEEPALIVE
int getDiskRotation(int drive) {
  REQUIRE_DISK_OR(0);
  const a2e::DiskImage *image = (*diskController()).getDiskImage(drive);
  if (!image) return 0;
  return static_cast<int>(image->getRotation() * 65536.0) & 0xFFFF;
}

EMSCRIPTEN_KEEPALIVE
uint32_t getDiskRevision(int drive) {
  REQUIRE_DISK_OR(0);
  return (*diskController()).getRevision(drive);
}

// ---- Saving in a chosen format ---------------------------------------------
// format: 0 = DOS 3.3 sector order, 1 = ProDOS sector order, 2 = WOZ

static a2e::DiskSaveFormat toSaveFormat(int format) {
  switch (format) {
    case 1:  return a2e::DiskSaveFormat::ProDOSOrder;
    case 2:  return a2e::DiskSaveFormat::WOZ;
    default: return a2e::DiskSaveFormat::DOSOrder;
  }
}

EMSCRIPTEN_KEEPALIVE
const uint8_t *getDiskDataAs(int drive, int format, size_t *size) {
  if (!g_host.isBuilt()) return nullptr;
  return g_host.exportDiskAs(drive, toSaveFormat(format), size);
}

// Sectors in DOS order for the filesystem parsers, whatever order the image
// itself uses. Backed by its own buffer, so a browser holding this pointer is
// not disturbed by a save conversion.
EMSCRIPTEN_KEEPALIVE
const uint8_t *getDiskSectorDataDOSOrder(int drive, size_t *size) {
  if (g_host.iigs()) return g_host.iigs()->getDiskSectorsDOSOrder(drive, size);
  REQUIRE_EMULATOR_OR(nullptr);
  return g_host.emulator()->getDiskSectorsDOSOrder(drive, size);
}

EMSCRIPTEN_KEEPALIVE
bool canSaveDiskAs(int drive, int format) {
  return g_host.canExportDiskAs(drive, toSaveFormat(format));
}

EMSCRIPTEN_KEEPALIVE
int getDiskNativeFormat(int drive) {
  return static_cast<int>(g_host.diskNativeFormat(drive));
}

EMSCRIPTEN_KEEPALIVE
bool isDiskModified(int drive) {
  return g_host.isDiskModified(drive);
}

EMSCRIPTEN_KEEPALIVE
const char *getDiskFilename(int drive) {
  return g_host.diskFilename(drive);
}

// Memory tracking for debugger heat map
EMSCRIPTEN_KEEPALIVE
void enableMemoryTracking(bool enable) {
  // A IIgs's Mega II is an MMU, the same class a //e is built from, so
  // tracking works there — and it is the side that matters, since it is where
  // the video, the firmware's workspace and Applesoft all live. What it does
  // not cover is the fast RAM on the other side of the machine.
  if (g_host.iigs()) { g_host.iigs()->memory().megaII().enableTracking(enable); return; }
  REQUIRE_EMULATOR();
  g_host.emulator()->getMMU().enableTracking(enable);
}

EMSCRIPTEN_KEEPALIVE
void clearMemoryTracking() {
  if (g_host.iigs()) { g_host.iigs()->memory().megaII().clearTracking(); return; }
  REQUIRE_EMULATOR();
  g_host.emulator()->getMMU().clearTracking();
}

EMSCRIPTEN_KEEPALIVE
void decayMemoryTracking(uint8_t amount) {
  if (g_host.iigs()) { g_host.iigs()->memory().megaII().decayTracking(amount); return; }
  REQUIRE_EMULATOR();
  g_host.emulator()->getMMU().decayTracking(amount);
}

EMSCRIPTEN_KEEPALIVE
const uint8_t* getMemoryReadCounts() {
  if (g_host.iigs()) return g_host.iigs()->memory().megaII().getReadCounts();
  REQUIRE_EMULATOR_OR(nullptr);
  return g_host.emulator()->getMMU().getReadCounts();
}

EMSCRIPTEN_KEEPALIVE
const uint8_t* getMemoryWriteCounts() {
  if (g_host.iigs()) return g_host.iigs()->memory().megaII().getWriteCounts();
  REQUIRE_EMULATOR_OR(nullptr);
  return g_host.emulator()->getMMU().getWriteCounts();
}

// Direct memory array access for heat map visualization
EMSCRIPTEN_KEEPALIVE
const uint8_t* getMainRAM() {
  if (g_host.iigs()) return g_host.iigs()->memory().megaII().getMainRAM();
  REQUIRE_EMULATOR_OR(nullptr);
  return g_host.emulator()->getMMU().getMainRAM();
}

EMSCRIPTEN_KEEPALIVE
const uint8_t* getAuxRAM() {
  if (g_host.iigs()) return g_host.iigs()->memory().megaII().getAuxRAM();
  REQUIRE_EMULATOR_OR(nullptr);
  return g_host.emulator()->getMMU().getAuxRAM();
}

EMSCRIPTEN_KEEPALIVE
const uint8_t* getSystemROM() {
  if (g_host.iigs()) return g_host.iigs()->memory().megaII().getSystemROM();
  REQUIRE_EMULATOR_OR(nullptr);
  return g_host.emulator()->getMMU().getSystemROM();
}

// Read auxiliary memory directly (for 80-column text selection)
EMSCRIPTEN_KEEPALIVE
uint8_t peekAuxMemory(uint16_t address) {
  if (g_host.iigs()) {
    return g_host.iigs()->memory().megaII().readRAM(address, true);
  }
  REQUIRE_EMULATOR_OR(0);
  return g_host.emulator()->getMMU().peekAux(address);
}

// The video generator of whichever machine is running. A IIgs's //e-mode
// picture is drawn by the same class from the same memory — it *is* a //e's
// video — so every display setting the host offers means the same thing to it.
static a2e::Video *videoGenerator() {
  return g_host.video();
}

#define REQUIRE_VIDEO() do { if (!videoGenerator()) return; } while(0)
#define REQUIRE_VIDEO_OR(default_val) do { if (!videoGenerator()) return (default_val); } while(0)

// UK/US character set switch (like the physical switch on UK Apple IIe)
EMSCRIPTEN_KEEPALIVE
void setUKCharacterSet(bool uk) {
  REQUIRE_VIDEO();
  videoGenerator()->setUKCharacterSet(uk);
}

EMSCRIPTEN_KEEPALIVE
bool isUKCharacterSet() {
  REQUIRE_VIDEO_OR(false);
  return videoGenerator()->isUKCharacterSet();
}

// Which kind of receiver decodes the machine's dot stream.
// 0 = monochrome, 1 = pixel exact, 2 = RGB monitor, 3 = composite,
// 4 = solid (no receiver: every cell its own colour). See VideoColorMode in
// types.hpp.
EMSCRIPTEN_KEEPALIVE
void setVideoColorMode(int mode) {
  REQUIRE_VIDEO();
  if (mode < 0 || mode > 4) {
    return;
  }
  videoGenerator()->setColorMode(static_cast<a2e::VideoColorMode>(mode));
}

EMSCRIPTEN_KEEPALIVE
int getVideoColorMode() {
  REQUIRE_VIDEO_OR(0);
  return static_cast<int>(videoGenerator()->getColorMode());
}

// Monochrome display mode. Kept as the older two-state API: it switches to
// monochrome and back to whichever colour mode was selected before.
EMSCRIPTEN_KEEPALIVE
void setMonochrome(bool mono) {
  REQUIRE_VIDEO();
  videoGenerator()->setMonochrome(mono);
}

EMSCRIPTEN_KEEPALIVE
bool isMonochrome() {
  REQUIRE_VIDEO_OR(false);
  return videoGenerator()->isMonochrome();
}

// ============================================================================
// State Serialization
// ============================================================================

// Whichever machine is running writes its own state, behind the same header:
// the host does not need to know which it has, and each refuses the other's.
EMSCRIPTEN_KEEPALIVE
uint8_t *exportState(size_t *size) {
  if (g_host.emulator()) return const_cast<uint8_t *>(g_host.emulator()->exportState(size));
  if (g_host.iigs()) return const_cast<uint8_t *>(g_host.iigs()->exportState(size));
  *size = 0;
  return nullptr;
}

EMSCRIPTEN_KEEPALIVE
bool importState(const uint8_t *data, size_t size) {
  if (g_host.emulator()) return g_host.emulator()->importState(data, size);
  if (g_host.iigs()) return g_host.iigs()->importState(data, size);
  return false;
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
  REQUIRE_MOCKINGBOARD_OR(false);
  return g_host.emulator()->getMockingboard().isEnabled();
}

EMSCRIPTEN_KEEPALIVE
uint8_t getMockingboardPSGRegister(int psg, int reg) {
  REQUIRE_MOCKINGBOARD_OR(0);
  if (reg < 0 || reg >= 16) return 0;
  if (psg == 0) {
    return g_host.emulator()->getMockingboard().getPSG1().getRegister(reg);
  } else if (psg == 1) {
    return g_host.emulator()->getMockingboard().getPSG2().getRegister(reg);
  }
  return 0;
}

// Get all 16 PSG registers as a packed structure for efficiency
// Returns pointer to static buffer with 16 bytes
static uint8_t g_psgRegisters[16];

EMSCRIPTEN_KEEPALIVE
const uint8_t* getMockingboardPSGRegisters(int psg) {
  REQUIRE_MOCKINGBOARD_OR(nullptr);
  const auto& psgChip = (psg == 0)
    ? g_host.emulator()->getMockingboard().getPSG1()
    : g_host.emulator()->getMockingboard().getPSG2();
  for (int i = 0; i < 16; i++) {
    g_psgRegisters[i] = psgChip.getRegister(i);
  }
  return g_psgRegisters;
}

EMSCRIPTEN_KEEPALIVE
bool getMockingboardVIAIRQ(int via) {
  REQUIRE_MOCKINGBOARD_OR(false);
  if (via == 0) {
    return g_host.emulator()->getMockingboard().getVIA1().isIRQActive();
  } else if (via == 1) {
    return g_host.emulator()->getMockingboard().getVIA2().isIRQActive();
  }
  return false;
}

// Get VIA port registers for debugging
// reg: 0=ORA, 1=ORB, 2=DDRA, 3=DDRB
EMSCRIPTEN_KEEPALIVE
uint8_t getMockingboardVIAPort(int via, int reg) {
  REQUIRE_MOCKINGBOARD_OR(0);
  const auto& viaChip = (via == 0)
      ? g_host.emulator()->getMockingboard().getVIA1()
      : g_host.emulator()->getMockingboard().getVIA2();
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
  REQUIRE_MOCKINGBOARD_OR(0);
  const auto& psgChip = (psg == 0)
      ? g_host.emulator()->getMockingboard().getPSG1()
      : g_host.emulator()->getMockingboard().getPSG2();
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
  REQUIRE_MOCKINGBOARD_OR(0);
  const auto& viaChip = (via == 0)
      ? g_host.emulator()->getMockingboard().getVIA1()
      : g_host.emulator()->getMockingboard().getVIA2();
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
  REQUIRE_MOCKINGBOARD();
  g_host.emulator()->getMockingboard().setDebugLogging(enabled);
}

// Mute/unmute a specific channel on a PSG
// psg: 0 or 1 (PSG1 or PSG2)
// channel: 0, 1, or 2 (A, B, C)
// muted: true to mute, false to unmute
EMSCRIPTEN_KEEPALIVE
void setMockingboardChannelMute(int psg, int channel, bool muted) {
  REQUIRE_MOCKINGBOARD();
  auto& psgChip = (psg == 0)
      ? g_host.emulator()->getMockingboard().getPSG1()
      : g_host.emulator()->getMockingboard().getPSG2();
  psgChip.setChannelMute(channel, muted);
}

// Play the left chip on both sides while the two hold the same registers, so
// a song mirrored to both chips cannot cancel itself on speakers close
// together. A host preference for every Mockingboard, any machine.
EMSCRIPTEN_KEEPALIVE
void setMockingboardPhaseLock(bool on) {
  a2e::MockingboardCard::setPhaseLock(on);
}

// Mix the two chips and play the mix on both sides, for every Mockingboard.
EMSCRIPTEN_KEEPALIVE
void setMockingboardMono(bool on) {
  a2e::MockingboardCard::setMono(on);
}

// Check if a channel is muted
EMSCRIPTEN_KEEPALIVE
bool getMockingboardChannelMute(int psg, int channel) {
  REQUIRE_MOCKINGBOARD_OR(false);
  const auto& psgChip = (psg == 0)
      ? g_host.emulator()->getMockingboard().getPSG1()
      : g_host.emulator()->getMockingboard().getPSG2();
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
  REQUIRE_MOCKINGBOARD_OR(0);
  if (!buffer || count <= 0 || count > 1024) return 0;

  const int SAMPLE_RATE = 48000;
  auto& psgChip = (psg == 0)
      ? g_host.emulator()->getMockingboard().getPSG1()
      : g_host.emulator()->getMockingboard().getPSG2();

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
  g_host.mouseMove(dx, dy);
}

EMSCRIPTEN_KEEPALIVE
void mouseButton(bool pressed) {
  g_host.mouseButton(pressed);
}

// ============================================================================
// Mouse Card Debug
// ============================================================================

// Returns whether a mouse card is currently installed
// Whether there is a mouse for the host to capture. A //e has one when a card
// is fitted; a IIgs always has one, because its mouse is the ADB controller
// and not a card — so the name is the host's question ("can I take the
// pointer?") rather than a claim about a slot.
EMSCRIPTEN_KEEPALIVE
bool isMouseCardInstalled() {
  if (g_host.iigs()) return true;
  REQUIRE_EMULATOR_OR(false);
  return g_host.emulator()->getMouseCard() != nullptr;
}

// Get mouse card state field
// field: 0=slotNum, 1=mouseX, 2=mouseY, 3=button, 4=moved, 5=buttonChanged,
//        6=clampMinX, 7=clampMaxX, 8=clampMinY, 9=clampMaxY,
//        10=irqActive, 11=vblPending, 12=movePending, 13=buttonPending,
//        14=wasInVBL, 15=mode, 16=lastCommand, 17=responseState
EMSCRIPTEN_KEEPALIVE
int32_t getMouseCardState(int field) {
  REQUIRE_EMULATOR_OR(0);
  auto* mouse = g_host.emulator()->getMouseCard();
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
  auto* mouse = g_host.emulator()->getMouseCard();
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
// SmartPort Hard Drive
// ============================================================================

// The SmartPort of whichever machine is running. On a //e it is a card the
// user fits; on a IIgs it is part of the machine, in slot 5 where a IIgs keeps
// its SmartPort, and there is nothing to fit. Either way the host is asking
// about block devices, and the class that holds them is the same class.
static a2e::SmartPortCard* smartPortCard() {
  return g_host.smartPort();
}

EMSCRIPTEN_KEEPALIVE
bool insertSmartPortImage(int device, uint8_t* data, int size, const char* filename) {
  return g_host.insertBlockImage(device, data, static_cast<size_t>(size), filename);
}

// An image is in, but the ROM that boots from it waits for the next reset: a
// IIgs's SmartPort replaces the machine's own slot 5 firmware only then.
EMSCRIPTEN_KEEPALIVE
bool isSmartPortROMPending() {
  return g_host.isSmartPortROMPending();
}

EMSCRIPTEN_KEEPALIVE
void ejectSmartPortImage(int device) {
  if (auto* card = smartPortCard()) card->ejectImage(device);
}

EMSCRIPTEN_KEEPALIVE
bool isSmartPortImageInserted(int device) {
  return g_host.isBlockImageInserted(device);
}

// ============================================================================
// 3.5" drives (a IIgs's IWM port)
// ============================================================================

EMSCRIPTEN_KEEPALIVE
bool has35Drives() {
  return g_host.has35Drives();
}

EMSCRIPTEN_KEEPALIVE
bool insert35Disk(int drive, uint8_t *data, int size, const char *filename) {
  return g_host.insert35Disk(drive, data, static_cast<size_t>(size), filename);
}

EMSCRIPTEN_KEEPALIVE
void eject35Disk(int drive) {
  g_host.eject35Disk(drive);
}

EMSCRIPTEN_KEEPALIVE
bool is35DiskInserted(int drive) {
  return g_host.is35DiskInserted(drive);
}

EMSCRIPTEN_KEEPALIVE
bool is35DiskModified(int drive) {
  return g_host.is35DiskModified(drive);
}

EMSCRIPTEN_KEEPALIVE
const char *get35DiskFilename(int drive) {
  static std::string name;
  name = g_host.disk35Filename(drive);
  return name.empty() ? nullptr : name.c_str();
}

EMSCRIPTEN_KEEPALIVE
const uint8_t *export35Disk(int drive, size_t *size) {
  return g_host.export35Disk(drive, size);
}

EMSCRIPTEN_KEEPALIVE
bool is35MotorOn(int drive) {
  return g_host.is35MotorOn(drive);
}

EMSCRIPTEN_KEEPALIVE
int get35DiskTrack(int drive) {
  return g_host.disk35Track(drive);
}

EMSCRIPTEN_KEEPALIVE
int get35DiskSide(int drive) {
  return g_host.disk35Side(drive);
}

EMSCRIPTEN_KEEPALIVE
bool has35Ejected(int drive) {
  return g_host.has35Ejected(drive);
}

EMSCRIPTEN_KEEPALIVE
const uint8_t *export35Ejected(int drive, size_t *size) {
  return g_host.export35Ejected(drive, size);
}

EMSCRIPTEN_KEEPALIVE
void clear35Ejected(int drive) {
  g_host.clear35Ejected(drive);
}

EMSCRIPTEN_KEEPALIVE
const char* getSmartPortImageFilename(int device) {
  auto* card = smartPortCard();
  if (!card) return nullptr;
  const auto& name = card->getImageFilename(device);
  return name.empty() ? nullptr : name.c_str();
}

EMSCRIPTEN_KEEPALIVE
bool isSmartPortImageModified(int device) {
  return g_host.isBlockImageModified(device);
}

EMSCRIPTEN_KEEPALIVE
uint8_t* getSmartPortImageData(int device, size_t* size) {
  auto* card = smartPortCard();
  if (!card) { if (size) *size = 0; return nullptr; }
  return const_cast<uint8_t*>(card->exportImageData(device, size));
}

EMSCRIPTEN_KEEPALIVE
const uint8_t* getSmartPortBlockData(int device, size_t* size) {
  auto* card = smartPortCard();
  if (!card) { if (size) *size = 0; return nullptr; }
  return card->getBlockData(device, size);
}

// Whether this machine can take a SmartPort image at all. A //e answers for
// the card in its slots; a IIgs always can, because its SmartPort is not
// something the user fits.
EMSCRIPTEN_KEEPALIVE
bool isSmartPortCardInstalled() {
  return smartPortCard() != nullptr;
}

EMSCRIPTEN_KEEPALIVE
bool getSmartPortActivity(int device) {
  (void)device; // Activity is card-wide
  auto* card = smartPortCard();
  return card && card->hasActivity();
}

EMSCRIPTEN_KEEPALIVE
bool getSmartPortActivityWrite(int device) {
  (void)device; // Activity is card-wide
  auto* card = smartPortCard();
  return card && card->isActivityWrite();
}

EMSCRIPTEN_KEEPALIVE
void clearSmartPortActivity() {
  if (auto* card = smartPortCard()) card->clearActivity();
}

// ============================================================================
// Super Serial Card
// ============================================================================

EMSCRIPTEN_KEEPALIVE
void serialReceive(uint8_t byte) {
  // A serial line is a serial line whatever provides it: a //e's SSC, a //c's
  // built-in port, or a IIgs's SCC. The byte arrives at the modem port on
  // every machine that has two, because a printer does not talk back.
  if (g_host.iigs()) {
    g_host.iigs()->serialReceive(byte);
    return;
  }
  REQUIRE_EMULATOR();
  g_host.emulator()->serialReceive(byte);
}

EMSCRIPTEN_KEEPALIVE
bool isSSCInstalled() {
  REQUIRE_EMULATOR_OR(false);
  return g_host.emulator()->isSSCInstalled();
}

/**
 * Hand a transmitted byte to whichever host shim is attached to the port.
 *
 * Runs inside the Worker: the global is `self`, not `window`. `port` is 0 on a
 * machine whose serial ports are indistinguishable from here — a //e's single
 * SSC, or a //c, where both ports share one callback — and 1 or 2 on a IIgs,
 * whose SCC says which socket a byte left by. A printer is what is on the
 * printer port and a modem or a telnet link is what is on the modem port, so
 * a machine that knows the port asks the right shim first rather than
 * whichever happens to be attached.
 */
EM_JS(void, deliverSerialByte, (int port, uint8_t byte), {
  const emulator = self.emulator;
  if (!emulator) return;
  const printer = () => {
    if (!emulator.printer) return false;
    emulator.printer.receiveByte(byte);
    return true;
  };
  const line = () => {
    if (emulator.modem) { emulator.modem.processTxByte(byte); return true; }
    if (emulator.serialManager) { emulator.serialManager.sendByte(byte); return true; }
    return false;
  };
  if (port === 1) { if (!printer()) line(); return; }
  if (!line()) printer();
});

EMSCRIPTEN_KEEPALIVE
void setSerialTxCallback() {
  if (g_host.iigs()) {
    g_host.iigs()->setSerialTxCallback([](int port, uint8_t byte) {
      deliverSerialByte(port, byte);
    });
    return;
  }
  REQUIRE_EMULATOR();
  g_host.emulator()->setSerialTxCallback([](uint8_t byte) {
    // One callback for every port this machine has, so there is no port to
    // name: a line device is asked first and the printer second, which is the
    // order this has always used.
    deliverSerialByte(0, byte);
  });
}

EMSCRIPTEN_KEEPALIVE
bool isParallelCardInstalled() {
  REQUIRE_EMULATOR_OR(false);
  return g_host.emulator()->isParallelCardInstalled();
}

EMSCRIPTEN_KEEPALIVE
void setParallelTxCallback() {
  REQUIRE_EMULATOR();
  g_host.emulator()->setParallelTxCallback([](uint8_t byte) {
    EM_ASM({
      if (self.emulator && self.emulator.printer) {
        self.emulator.printer.receiveByte($0);
      }
    }, byte);
  });
}

// ============================================================================
// Expansion Slot Management
// ============================================================================

EMSCRIPTEN_KEEPALIVE
const char* getSlotCard(int slot) {
  if (g_host.emulator()) {
    return g_host.emulator()->getSlotCardName(static_cast<uint8_t>(slot));
  }
  if (g_host.iigs()) {
    // Held in a static because the caller reads the string after this returns
    // and IIgsMachine hands back a value.
    static std::string name;
    name = g_host.iigs()->getSlotCardName(static_cast<uint8_t>(slot));
    return name.c_str();
  }
  return "invalid";
}

EMSCRIPTEN_KEEPALIVE
bool setSlotCard(int slot, const char* cardId) {
  return g_host.setSlotCard(slot, cardId ? cardId : "empty");
}

EMSCRIPTEN_KEEPALIVE
bool isSlotEmpty(int slot) {
  if (g_host.emulator()) {
    return g_host.emulator()->isSlotEmpty(static_cast<uint8_t>(slot));
  }
  if (g_host.iigs()) {
    return g_host.iigs()->getSlotCardName(static_cast<uint8_t>(slot)) == "empty";
  }
  return true;
}

// ============================================================================
// The IIgs's Control Panel slot settings ($C02D)
//
// A IIgs's seven slots each have a built-in device as well as a socket, and
// only one of the two answers at a time. On a real machine the user picks in
// the firmware's Control Panel; that is not reachable here, so these two are
// how the emulator offers the same switch. Slot 3 is not in the register.
// ============================================================================

EMSCRIPTEN_KEEPALIVE
bool isSlotInternal(int slot) {
  return g_host.isSlotInternal(slot);
}

EMSCRIPTEN_KEEPALIVE
void setSlotInternal(int slot, bool internal) {
  g_host.setSlotInternal(slot, internal);
}

// ============================================================================
// Watchpoints
// ============================================================================

EMSCRIPTEN_KEEPALIVE
void addWatchpoint(uint32_t startAddr, uint32_t endAddr, uint8_t type) {
  // The //e routes this through the Emulator, which also has to tell its MMU
  // to start checking; a IIgs checks on the processor's own bus and needs no
  // such switch.
  if (g_host.emulator()) {
    g_host.emulator()->addWatchpoint(
        static_cast<uint16_t>(startAddr), static_cast<uint16_t>(endAddr),
        static_cast<a2e::Emulator::WatchpointType>(type));
    return;
  }
  REQUIRE_DEBUG();
  machineDebug()->addWatchpoint(
      startAddr, endAddr, static_cast<a2e::MachineDebug::WatchpointType>(type));
}

EMSCRIPTEN_KEEPALIVE
void removeWatchpoint(uint32_t startAddr) {
  if (g_host.emulator()) {
    g_host.emulator()->removeWatchpoint(static_cast<uint16_t>(startAddr));
    return;
  }
  REQUIRE_DEBUG();
  machineDebug()->removeWatchpoint(startAddr);
}

EMSCRIPTEN_KEEPALIVE
void clearWatchpoints() {
  if (g_host.emulator()) {
    g_host.emulator()->clearWatchpoints();
    return;
  }
  REQUIRE_DEBUG();
  machineDebug()->clearWatchpoints();
}

EMSCRIPTEN_KEEPALIVE
bool isWatchpointHit() {
  REQUIRE_DEBUG_OR(false);
  return machineDebug()->isWatchpointHit();
}

EMSCRIPTEN_KEEPALIVE
uint32_t getWatchpointAddress() {
  REQUIRE_DEBUG_OR(0);
  return machineDebug()->watchpointAddress();
}

EMSCRIPTEN_KEEPALIVE
uint8_t getWatchpointValue() {
  REQUIRE_DEBUG_OR(0);
  return machineDebug()->watchpointValue();
}

EMSCRIPTEN_KEEPALIVE
bool isWatchpointWrite() {
  REQUIRE_DEBUG_OR(false);
  return machineDebug()->isWatchpointWrite();
}

// ============================================================================
// Instruction Trace
// ============================================================================

EMSCRIPTEN_KEEPALIVE
void setTraceEnabled(bool enabled) {
  REQUIRE_DEBUG();
  machineDebug()->setTraceEnabled(enabled);
}

EMSCRIPTEN_KEEPALIVE
void clearTrace() {
  REQUIRE_DEBUG();
  machineDebug()->clearTrace();
}

EMSCRIPTEN_KEEPALIVE
uint32_t getTraceCount() {
  REQUIRE_DEBUG_OR(0);
  return static_cast<uint32_t>(machineDebug()->traceCount());
}

EMSCRIPTEN_KEEPALIVE
uint32_t getTraceHead() {
  REQUIRE_DEBUG_OR(0);
  return static_cast<uint32_t>(machineDebug()->traceHead());
}

EMSCRIPTEN_KEEPALIVE
const void* getTraceBuffer() {
  REQUIRE_DEBUG_OR(nullptr);
  return machineDebug()->traceBuffer();
}

EMSCRIPTEN_KEEPALIVE
uint32_t getTraceCapacity() {
  REQUIRE_DEBUG_OR(0);
  return static_cast<uint32_t>(machineDebug()->traceCapacity());
}

// The visible rows of the trace, formatted here rather than in the host.
//
// The host used to read one entry per row out of the heap and format it in
// JavaScript, which meant a copy of the opcode table, the addressing modes and
// the operand syntax living there — a second formatter to be wrong, and one
// that knew only the 65C02. It is one round trip and one formatter now.
//
// Each line is tab-separated: cycle, address, bytes, instruction text, A, X,
// Y, SP, P, widths. The registers are hex at the machine's own width, so a
// 65816's sixteen-bit A is four digits and a 6502's is two.
EMSCRIPTEN_KEEPALIVE
const char *formatTraceRange(uint32_t startIndex, uint32_t count) {
  static std::string buffer;
  buffer.clear();
  const bool wide = g_host.iigs() != nullptr;
  const int registerDigits = wide ? 4 : 2;

  auto hex = [](uint32_t value, int digits) {
    char text[10];
    snprintf(text, sizeof text, "%0*X", digits, value);
    return std::string(text);
  };

  const std::vector<a2e::host::TraceLine> lines = g_host.traceLines(startIndex, count);
  for (size_t i = 0; i < lines.size(); i++) {
    const a2e::host::TraceLine &line = lines[i];
    const a2e::host::Instruction &in = line.instruction;
    if (i > 0) buffer.push_back('\n');
    buffer += std::to_string(line.cycle);
    buffer.push_back('\t');
    buffer += wide ? hex((in.address >> 16) & 0xFF, 2) + "/" + hex(in.address & 0xFFFF, 4)
                   : hex(in.address & 0xFFFF, 4);
    buffer.push_back('\t');
    for (int b = 0; b < in.length && b < 4; b++) {
      if (b > 0) buffer.push_back(' ');
      buffer += hex(in.bytes[b], 2);
    }
    buffer.push_back('\t');
    buffer += instructionText(in);
    buffer.push_back('\t');
    buffer += hex(line.a, registerDigits);
    buffer.push_back('\t');
    buffer += hex(line.x, registerDigits);
    buffer.push_back('\t');
    buffer += hex(line.y, registerDigits);
    buffer.push_back('\t');
    buffer += hex(line.sp, registerDigits);
    buffer.push_back('\t');
    buffer += hex(line.p, 2);
    buffer.push_back('\t');
    buffer += hex(line.widths, 2);
  }
  return buffer.c_str();
}

// How many bytes one entry is. The host asks rather than assuming, because the
// entry grew when it had to hold a 65816's registers and a reader that had the
// old size baked in would have walked the ring in the wrong steps — and shown
// plausible nonsense rather than failing.
EMSCRIPTEN_KEEPALIVE
uint32_t getTraceEntrySize() {
  return static_cast<uint32_t>(sizeof(a2e::MachineDebug::TraceEntry));
}

// ============================================================================
// Cycle Profiling
// ============================================================================

EMSCRIPTEN_KEEPALIVE
void setProfileEnabled(bool enabled) {
  REQUIRE_EMULATOR();
  g_host.emulator()->setProfileEnabled(enabled);
}

EMSCRIPTEN_KEEPALIVE
void clearProfile() {
  REQUIRE_EMULATOR();
  g_host.emulator()->clearProfile();
}

EMSCRIPTEN_KEEPALIVE
const uint32_t* getProfileCycles() {
  REQUIRE_EMULATOR_OR(nullptr);
  return g_host.emulator()->getProfileCycles();
}

// ============================================================================
// Beam Breakpoints
// ============================================================================

EMSCRIPTEN_KEEPALIVE
int32_t addBeamBreakpoint(int16_t scanline, int16_t hPos) {
  REQUIRE_DEBUG_OR(-1);
  return machineDebug()->addBeamBreakpoint(scanline, hPos);
}

EMSCRIPTEN_KEEPALIVE
void removeBeamBreakpoint(int32_t id) {
  REQUIRE_DEBUG();
  machineDebug()->removeBeamBreakpoint(id);
}

EMSCRIPTEN_KEEPALIVE
void enableBeamBreakpoint(int32_t id, bool enabled) {
  REQUIRE_DEBUG();
  machineDebug()->enableBeamBreakpoint(id, enabled);
}

EMSCRIPTEN_KEEPALIVE
void clearAllBeamBreakpoints() {
  REQUIRE_DEBUG();
  machineDebug()->clearBeamBreakpoints();
}

EMSCRIPTEN_KEEPALIVE
bool isBeamBreakpointHit() {
  REQUIRE_DEBUG_OR(false);
  return machineDebug()->isBeamBreakpointHit();
}

EMSCRIPTEN_KEEPALIVE
int32_t getBeamBreakpointHitId() {
  REQUIRE_DEBUG_OR(-1);
  return machineDebug()->beamBreakpointHitId();
}

EMSCRIPTEN_KEEPALIVE
int16_t getBeamBreakScanline() {
  REQUIRE_DEBUG_OR(-1);
  return machineDebug()->beamBreakScanline();
}

EMSCRIPTEN_KEEPALIVE
int16_t getBeamBreakHPos() {
  REQUIRE_DEBUG_OR(-1);
  return machineDebug()->beamBreakHPos();
}

// ============================================================================
// Condition Evaluator
// ============================================================================

EMSCRIPTEN_KEEPALIVE
bool evaluateCondition(const char* expr) {
  if (!expr) return false;
  const a2e::MachineView view = machineView();
  if (!view.peek) return false;
  return a2e::ConditionEvaluator::evaluate(expr, view);
}

EMSCRIPTEN_KEEPALIVE
int32_t evaluateExpression(const char* expr) {
  if (!expr) return 0;
  const a2e::MachineView view = machineView();
  if (!view.peek) return 0;
  return a2e::ConditionEvaluator::evaluateNumeric(expr, view);
}

EMSCRIPTEN_KEEPALIVE
const char* getConditionError() {
  return a2e::ConditionEvaluator::getLastError();
}

// ============================================================================
// Opcode Mnemonic Lookup
// ============================================================================

EMSCRIPTEN_KEEPALIVE
const char* getOpcodeMnemonic(uint8_t opcode) {
  return a2e::getMnemonic(opcode);
}

EMSCRIPTEN_KEEPALIVE
uint8_t getOpcodeAddressingMode(uint8_t opcode) {
  return static_cast<uint8_t>(a2e::getAddressingMode(opcode));
}

// ============================================================================
// Call Stack Analysis
// ============================================================================

struct CallStackEntry {
  uint16_t returnAddr;
  uint16_t jsrTarget;
};

static CallStackEntry g_callStack[64];
static int g_callStackCount = 0;

EMSCRIPTEN_KEEPALIVE
int getCallStack() {
  REQUIRE_EMULATOR_OR(0);
  g_callStackCount = 0;

  uint8_t sp = g_host.emulator()->getSP();
  int i = sp + 1;

  while (i < 0xFF && g_callStackCount < 64) {
    uint8_t low = g_host.emulator()->peekMemory(0x100 + i);
    uint8_t high = g_host.emulator()->peekMemory(0x100 + i + 1);
    uint16_t retAddr = ((high << 8) | low) + 1;

    // Validate: check if instruction before retAddr was a JSR
    if (retAddr >= 3 && retAddr <= 0xFFFF) {
      uint8_t possibleJSR = g_host.emulator()->peekMemory(retAddr - 3);
      if (possibleJSR == 0x20) {
        // JSR target
        uint8_t jsrLo = g_host.emulator()->peekMemory(retAddr - 2);
        uint8_t jsrHi = g_host.emulator()->peekMemory(retAddr - 1);
        g_callStack[g_callStackCount].returnAddr = retAddr;
        g_callStack[g_callStackCount].jsrTarget = (jsrHi << 8) | jsrLo;
        g_callStackCount++;
        i += 2;
        continue;
      }
    }
    i++;
  }

  return g_callStackCount;
}

EMSCRIPTEN_KEEPALIVE
const void* getCallStackBuffer() {
  return g_callStack;
}

EMSCRIPTEN_KEEPALIVE
bool isLikelyReturnAddress(uint32_t addr) {
  // Somewhere that could plausibly hold code. On a //e that is the RAM above
  // the screen pages and the ROM; on a IIgs a program's code can be in any
  // bank at almost any offset, so the only thing ruled out is the zero page
  // and the stack it would have been pushed from.
  if (g_host.iigs()) return (addr & 0xFFFF) >= 0x0200;
  const uint16_t at = static_cast<uint16_t>(addr & 0xFFFF);
  return (at >= 0x0800 && at < 0xC000) ||  // Main RAM (program code)
         (at >= 0xD000 && at <= 0xFFFF);    // ROM
}

// ============================================================================
// DOS 3.3 Filesystem
// ============================================================================

static a2e::DOS33CatalogEntry g_dos33Catalog[128];
static int g_dos33CatalogCount = 0;
static uint8_t g_dos33FileBuffer[256 * 256]; // 64KB max file

EMSCRIPTEN_KEEPALIVE
bool isDOS33Format(const uint8_t* data, int size) {
  return a2e::DOS33::isDOS33(data, static_cast<size_t>(size));
}

EMSCRIPTEN_KEEPALIVE
int getDOS33Catalog(const uint8_t* data, int size) {
  g_dos33CatalogCount = a2e::DOS33::readCatalog(data, static_cast<size_t>(size),
                                                  g_dos33Catalog, 128);
  return g_dos33CatalogCount;
}

EMSCRIPTEN_KEEPALIVE
const void* getDOS33CatalogBuffer() {
  return g_dos33Catalog;
}

EMSCRIPTEN_KEEPALIVE
int getDOS33CatalogEntrySize() {
  return static_cast<int>(sizeof(a2e::DOS33CatalogEntry));
}

EMSCRIPTEN_KEEPALIVE
const char* getDOS33EntryFilename(int index) {
  if (index < 0 || index >= g_dos33CatalogCount) return "";
  return g_dos33Catalog[index].filename;
}

EMSCRIPTEN_KEEPALIVE
uint8_t getDOS33EntryFileType(int index) {
  if (index < 0 || index >= g_dos33CatalogCount) return 0;
  return g_dos33Catalog[index].fileType;
}

EMSCRIPTEN_KEEPALIVE
const char* getDOS33EntryFileTypeName(int index) {
  if (index < 0 || index >= g_dos33CatalogCount) return "?";
  return g_dos33Catalog[index].fileTypeName;
}

EMSCRIPTEN_KEEPALIVE
bool getDOS33EntryIsLocked(int index) {
  if (index < 0 || index >= g_dos33CatalogCount) return false;
  return g_dos33Catalog[index].isLocked;
}

EMSCRIPTEN_KEEPALIVE
int getDOS33EntrySectorCount(int index) {
  if (index < 0 || index >= g_dos33CatalogCount) return 0;
  return g_dos33Catalog[index].sectorCount;
}

EMSCRIPTEN_KEEPALIVE
int readDOS33File(const uint8_t* data, int size, int index) {
  if (index < 0 || index >= g_dos33CatalogCount) return 0;
  const auto& entry = g_dos33Catalog[index];
  return a2e::DOS33::readFile(data, static_cast<size_t>(size),
                               entry.firstTrack, entry.firstSector,
                               g_dos33FileBuffer, sizeof(g_dos33FileBuffer));
}

EMSCRIPTEN_KEEPALIVE
const uint8_t* getDOS33FileBuffer() {
  return g_dos33FileBuffer;
}

// ============================================================================
// ProDOS Filesystem
// ============================================================================

static a2e::ProDOSCatalogEntry g_prodosCatalog[2048];
static int g_prodosCatalogCount = 0;
static a2e::ProDOSVolumeInfo g_prodosVolumeInfo;
static uint8_t g_prodosFileBuffer[128 * 1024]; // 128KB max file

EMSCRIPTEN_KEEPALIVE
bool isProDOSFormat(const uint8_t* data, int size) {
  return a2e::ProDOS::isProDOS(data, static_cast<size_t>(size));
}

EMSCRIPTEN_KEEPALIVE
bool getProDOSVolumeInfo(const uint8_t* data, int size) {
  return a2e::ProDOS::parseVolumeInfo(data, static_cast<size_t>(size), &g_prodosVolumeInfo);
}

EMSCRIPTEN_KEEPALIVE
const char* getProDOSVolumeName() {
  return g_prodosVolumeInfo.volumeName;
}

EMSCRIPTEN_KEEPALIVE
int getProDOSTotalBlocks() {
  return g_prodosVolumeInfo.totalBlocks;
}

EMSCRIPTEN_KEEPALIVE
int getProDOSCatalog(const uint8_t* data, int size) {
  g_prodosCatalogCount = a2e::ProDOS::readCatalog(data, static_cast<size_t>(size),
                                                    g_prodosCatalog, 2048);
  return g_prodosCatalogCount;
}

EMSCRIPTEN_KEEPALIVE
int getProDOSDirectory(const uint8_t* data, int size, int startBlock,
                       const char* pathPrefix) {
  g_prodosCatalogCount = a2e::ProDOS::readDirectory(
      data, static_cast<size_t>(size), startBlock,
      pathPrefix ? pathPrefix : "", g_prodosCatalog, 2048);
  return g_prodosCatalogCount;
}

EMSCRIPTEN_KEEPALIVE
const char* getProDOSEntryFilename(int index) {
  if (index < 0 || index >= g_prodosCatalogCount) return "";
  return g_prodosCatalog[index].filename;
}

EMSCRIPTEN_KEEPALIVE
const char* getProDOSEntryPath(int index) {
  if (index < 0 || index >= g_prodosCatalogCount) return "";
  return g_prodosCatalog[index].path;
}

EMSCRIPTEN_KEEPALIVE
uint8_t getProDOSEntryFileType(int index) {
  if (index < 0 || index >= g_prodosCatalogCount) return 0;
  return g_prodosCatalog[index].fileType;
}

EMSCRIPTEN_KEEPALIVE
const char* getProDOSEntryFileTypeName(int index) {
  if (index < 0 || index >= g_prodosCatalogCount) return "???";
  return g_prodosCatalog[index].fileTypeName;
}

EMSCRIPTEN_KEEPALIVE
uint8_t getProDOSEntryStorageType(int index) {
  if (index < 0 || index >= g_prodosCatalogCount) return 0;
  return g_prodosCatalog[index].storageType;
}

EMSCRIPTEN_KEEPALIVE
uint32_t getProDOSEntryEOF(int index) {
  if (index < 0 || index >= g_prodosCatalogCount) return 0;
  return g_prodosCatalog[index].eof;
}

EMSCRIPTEN_KEEPALIVE
uint16_t getProDOSEntryAuxType(int index) {
  if (index < 0 || index >= g_prodosCatalogCount) return 0;
  return g_prodosCatalog[index].auxType;
}

EMSCRIPTEN_KEEPALIVE
bool getProDOSEntryIsLocked(int index) {
  if (index < 0 || index >= g_prodosCatalogCount) return false;
  return g_prodosCatalog[index].isLocked;
}

EMSCRIPTEN_KEEPALIVE
uint16_t getProDOSEntryBlocksUsed(int index) {
  if (index < 0 || index >= g_prodosCatalogCount) return 0;
  return g_prodosCatalog[index].blocksUsed;
}

EMSCRIPTEN_KEEPALIVE
bool getProDOSEntryIsDirectory(int index) {
  if (index < 0 || index >= g_prodosCatalogCount) return false;
  return g_prodosCatalog[index].isDirectory;
}

EMSCRIPTEN_KEEPALIVE
uint16_t getProDOSEntryKeyPointer(int index) {
  if (index < 0 || index >= g_prodosCatalogCount) return 0;
  return g_prodosCatalog[index].keyPointer;
}

EMSCRIPTEN_KEEPALIVE
int readProDOSFile(const uint8_t* data, int size, int index) {
  if (index < 0 || index >= g_prodosCatalogCount) return 0;
  return a2e::ProDOS::readFile(data, static_cast<size_t>(size),
                                &g_prodosCatalog[index],
                                g_prodosFileBuffer, sizeof(g_prodosFileBuffer));
}

EMSCRIPTEN_KEEPALIVE
const uint8_t* getProDOSFileBuffer() {
  return g_prodosFileBuffer;
}

EMSCRIPTEN_KEEPALIVE
int mapProDOSFileType(uint8_t prodosType) {
  return a2e::ProDOS::mapFileTypeForViewer(prodosType);
}

// ============================================================================
// Pascal Filesystem
// ============================================================================

static a2e::PascalCatalogEntry g_pascalCatalog[77];
static int g_pascalCatalogCount = 0;
static a2e::PascalVolumeInfo g_pascalVolumeInfo;
static uint8_t g_pascalFileBuffer[128 * 1024]; // 128KB max file

EMSCRIPTEN_KEEPALIVE
bool isPascalFormat(const uint8_t* data, int size) {
  return a2e::Pascal::isPascal(data, static_cast<size_t>(size));
}

EMSCRIPTEN_KEEPALIVE
bool getPascalVolumeInfo(const uint8_t* data, int size) {
  return a2e::Pascal::parseVolumeInfo(data, static_cast<size_t>(size), &g_pascalVolumeInfo);
}

EMSCRIPTEN_KEEPALIVE
const char* getPascalVolumeName() {
  return g_pascalVolumeInfo.volumeName;
}

EMSCRIPTEN_KEEPALIVE
int getPascalTotalBlocks() {
  return g_pascalVolumeInfo.totalBlocks;
}

EMSCRIPTEN_KEEPALIVE
int getPascalCatalog(const uint8_t* data, int size) {
  g_pascalCatalogCount = a2e::Pascal::readCatalog(data, static_cast<size_t>(size),
                                                    g_pascalCatalog, 77);
  return g_pascalCatalogCount;
}

EMSCRIPTEN_KEEPALIVE
const char* getPascalEntryFilename(int index) {
  if (index < 0 || index >= g_pascalCatalogCount) return "";
  return g_pascalCatalog[index].filename;
}

EMSCRIPTEN_KEEPALIVE
uint8_t getPascalEntryFileType(int index) {
  if (index < 0 || index >= g_pascalCatalogCount) return 0;
  return g_pascalCatalog[index].fileType;
}

EMSCRIPTEN_KEEPALIVE
const char* getPascalEntryFileTypeName(int index) {
  if (index < 0 || index >= g_pascalCatalogCount) return "???";
  return g_pascalCatalog[index].fileTypeName;
}

EMSCRIPTEN_KEEPALIVE
uint32_t getPascalEntryFileSize(int index) {
  if (index < 0 || index >= g_pascalCatalogCount) return 0;
  return g_pascalCatalog[index].fileSize;
}

EMSCRIPTEN_KEEPALIVE
uint16_t getPascalEntryBlocksUsed(int index) {
  if (index < 0 || index >= g_pascalCatalogCount) return 0;
  return g_pascalCatalog[index].nextBlock - g_pascalCatalog[index].startBlock;
}

EMSCRIPTEN_KEEPALIVE
int readPascalFile(const uint8_t* data, int size, int index) {
  if (index < 0 || index >= g_pascalCatalogCount) return 0;
  return a2e::Pascal::readFile(data, static_cast<size_t>(size),
                                &g_pascalCatalog[index],
                                g_pascalFileBuffer, sizeof(g_pascalFileBuffer));
}

EMSCRIPTEN_KEEPALIVE
const uint8_t* getPascalFileBuffer() {
  return g_pascalFileBuffer;
}

EMSCRIPTEN_KEEPALIVE
int mapPascalFileType(uint8_t pascalType) {
  return a2e::Pascal::mapFileTypeForViewer(pascalType);
}

// ============================================================================
// BASIC Detokenization
// ============================================================================

EMSCRIPTEN_KEEPALIVE
const char* detokenizeApplesoft(const uint8_t* data, int size, bool hasLengthHeader) {
  return a2e::BasicDetokenizer::detokenizeApplesoft(data, size, hasLengthHeader);
}

EMSCRIPTEN_KEEPALIVE
const char* detokenizeIntegerBasic(const uint8_t* data, int size, bool hasLengthHeader) {
  return a2e::BasicDetokenizer::detokenizeIntegerBasic(data, size, hasLengthHeader);
}

// ============================================================================
// Assembler
// ============================================================================

static a2e::Assembler g_assembler;
static a2e::AsmResult g_asmResult;
static bool g_asmIncludesWired = false;

// ---- PUT / USE: read included source off the disk in a drive --------------
//
// Merlin read its PUT and USE files from the disk it was assembling on, so
// that is where they are looked for here: drive 1 first, then drive 2, on
// whichever filesystem the disk carries. Merlin's own convention of naming
// source files T.SOMETHING is honoured, because a source that says PUT MACROS
// means the file the assembler saved as T.MACROS.

static bool asmNameMatches(const char* candidate, const std::string& wanted) {
  auto upper = [](const std::string& s) {
    std::string r = s;
    for (auto& c : r) c = static_cast<char>(toupper(static_cast<unsigned char>(c)));
    return r;
  };
  std::string have = upper(candidate);
  std::string want = upper(wanted);
  if (have == want) return true;
  if (have == "T." + want) return true;
  if (want.rfind("T.", 0) == 0 && have == want.substr(2)) return true;
  return false;
}

// Apple text files hold high-bit ASCII with carriage-return line endings and
// stop at the first null.
static void asmTextToSource(const uint8_t* data, int length, std::string& out) {
  out.clear();
  out.reserve(static_cast<size_t>(length));
  for (int i = 0; i < length; i++) {
    uint8_t ch = data[i] & 0x7F;
    if (ch == 0x00) break;
    out += (ch == '\r') ? '\n' : static_cast<char>(ch);
  }
}

static bool asmReadIncludeFromDisk(const std::string& name, std::string& out) {
  if (!g_host.emulator()) return false;

  static std::vector<uint8_t> fileBuffer(128 * 1024);

  for (int drive = 0; drive < 2; drive++) {
    size_t size = 0;
    const uint8_t* data = g_host.emulator()->getDiskSectorsDOSOrder(drive, &size);
    if (!data || size == 0) continue;

    if (a2e::DOS33::isDOS33(data, size)) {
      static a2e::DOS33CatalogEntry entries[512];
      int count = a2e::DOS33::readCatalog(data, size, entries, 512);
      for (int i = 0; i < count; i++) {
        if (!asmNameMatches(entries[i].filename, name)) continue;
        int length = a2e::DOS33::readFile(data, size, entries[i].firstTrack,
                                          entries[i].firstSector,
                                          fileBuffer.data(), fileBuffer.size());
        if (length <= 0) return false;
        asmTextToSource(fileBuffer.data(), length, out);
        return true;
      }
      continue;
    }

    if (a2e::ProDOS::isProDOS(data, size)) {
      static a2e::ProDOSCatalogEntry entries[2048];
      int count = a2e::ProDOS::readCatalog(data, size, entries, 2048);
      for (int i = 0; i < count; i++) {
        if (entries[i].isDirectory) continue;
        if (!asmNameMatches(entries[i].filename, name) &&
            !asmNameMatches(entries[i].path, name)) {
          continue;
        }
        int length = a2e::ProDOS::readFile(data, size, &entries[i],
                                           fileBuffer.data(), fileBuffer.size());
        if (length <= 0) return false;
        asmTextToSource(fileBuffer.data(), length, out);
        return true;
      }
    }
  }

  return false;
}

EMSCRIPTEN_KEEPALIVE
bool assembleSource(const char* source) {
  if (!g_asmIncludesWired) {
    g_assembler.setIncludeProvider(asmReadIncludeFromDisk);
    g_asmIncludesWired = true;
  }
  g_asmResult = g_assembler.assemble(source);
  return g_asmResult.success;
}

EMSCRIPTEN_KEEPALIVE
int getAsmOutputSize() {
  return static_cast<int>(g_asmResult.output.size());
}

EMSCRIPTEN_KEEPALIVE
const uint8_t* getAsmOutputBuffer() {
  if (g_asmResult.output.empty()) return nullptr;
  return g_asmResult.output.data();
}

EMSCRIPTEN_KEEPALIVE
uint16_t getAsmOrigin() {
  return g_asmResult.origin;
}

EMSCRIPTEN_KEEPALIVE
int getAsmErrorCount() {
  return static_cast<int>(g_asmResult.errors.size());
}

EMSCRIPTEN_KEEPALIVE
int getAsmErrorLine(int index) {
  if (index < 0 || index >= static_cast<int>(g_asmResult.errors.size())) return 0;
  return g_asmResult.errors[index].lineNumber;
}

EMSCRIPTEN_KEEPALIVE
const char* getAsmErrorMessage(int index) {
  if (index < 0 || index >= static_cast<int>(g_asmResult.errors.size())) return "";
  return g_asmResult.errors[index].message;
}

// A warning is something Merlin would have done that this assembler cannot —
// it names the gap without failing the assembly.
EMSCRIPTEN_KEEPALIVE
bool getAsmErrorIsWarning(int index) {
  if (index < 0 || index >= static_cast<int>(g_asmResult.errors.size())) return false;
  return g_asmResult.errors[index].warning;
}

// ---- Segments: one contiguous run of object code per ORG ------------------

EMSCRIPTEN_KEEPALIVE
int getAsmSegmentCount() {
  return static_cast<int>(g_asmResult.segments.size());
}

EMSCRIPTEN_KEEPALIVE
int getAsmSegmentAddress(int index) {
  if (index < 0 || index >= static_cast<int>(g_asmResult.segments.size())) return 0;
  return g_asmResult.segments[index].address;
}

EMSCRIPTEN_KEEPALIVE
int getAsmSegmentOffset(int index) {
  if (index < 0 || index >= static_cast<int>(g_asmResult.segments.size())) return 0;
  return static_cast<int>(g_asmResult.segments[index].offset);
}

EMSCRIPTEN_KEEPALIVE
int getAsmSegmentLength(int index) {
  if (index < 0 || index >= static_cast<int>(g_asmResult.segments.size())) return 0;
  return static_cast<int>(g_asmResult.segments[index].length);
}

// ---- Per-line records ------------------------------------------------------
//
// One AsmLineInfo per line of the main source that produced anything. The
// whole array is handed over as a block: a gutter needs every line at once,
// and one RPC beats one per line.

EMSCRIPTEN_KEEPALIVE
int getAsmLineCount() {
  return static_cast<int>(g_asmResult.lines.size());
}

EMSCRIPTEN_KEEPALIVE
int getAsmLineRecordSize() {
  return static_cast<int>(sizeof(a2e::AsmLineInfo));
}

EMSCRIPTEN_KEEPALIVE
const uint8_t* getAsmLineBuffer() {
  if (g_asmResult.lines.empty()) return nullptr;
  return reinterpret_cast<const uint8_t*>(g_asmResult.lines.data());
}

EMSCRIPTEN_KEEPALIVE
const char* getAsmListing() {
  return g_asmResult.listing.c_str();
}

EMSCRIPTEN_KEEPALIVE
int getAsmObjectType() {
  return g_asmResult.objectType;
}

EMSCRIPTEN_KEEPALIVE
int getAsmSymbolCount() {
  return static_cast<int>(g_asmResult.symbols.size());
}

EMSCRIPTEN_KEEPALIVE
const char* getAsmSymbolName(int index) {
  if (index < 0 || index >= static_cast<int>(g_asmResult.symbols.size())) return "";
  return g_asmResult.symbols[index].name;
}

EMSCRIPTEN_KEEPALIVE
int32_t getAsmSymbolValue(int index) {
  if (index < 0 || index >= static_cast<int>(g_asmResult.symbols.size())) return 0;
  return g_asmResult.symbols[index].value;
}

// ---- DSK directive: write the assembled object to a disk ------------------

EMSCRIPTEN_KEEPALIVE
bool hasAsmObjectFile() {
  return g_asmResult.hasObjectFile;
}

EMSCRIPTEN_KEEPALIVE
const char* getAsmObjectFilename() {
  return g_asmResult.objectFilename;
}

EMSCRIPTEN_KEEPALIVE
int getAsmObjectDrive() {
  return g_asmResult.objectDrive;
}

// Returns an a2e::FsWriteStatus, or -1 when the last assembly asked for no
// object file (or failed, in which case there is nothing worth writing).
EMSCRIPTEN_KEEPALIVE
int writeAsmObjectToDisk() {
  REQUIRE_EMULATOR_OR(-1);
  if (!g_asmResult.hasObjectFile || !g_asmResult.success) return -1;

  a2e::FsWriteStatus status = g_host.emulator()->writeBinaryFileToDisk(
      g_asmResult.objectDrive - 1, g_asmResult.objectFilename,
      g_asmResult.origin, g_asmResult.output.data(), g_asmResult.output.size());
  return static_cast<int>(status);
}

EMSCRIPTEN_KEEPALIVE
const char* getAsmObjectStatusMessage(int status) {
  if (status < 0) return "Nothing to write";
  return a2e::fsWriteStatusMessage(static_cast<a2e::FsWriteStatus>(status));
}

EMSCRIPTEN_KEEPALIVE
void loadAsmIntoMemory() {
  if (!g_host.emulator() || g_asmResult.output.empty()) return;
  // Each ORG starts a segment, so a source that assembles two pieces of code
  // to two addresses lands both where it asked for rather than one after the
  // other from the first origin.
  for (const auto& segment : g_asmResult.segments) {
    for (uint32_t i = 0; i < segment.length; i++) {
      g_host.emulator()->writeMemory(static_cast<uint16_t>(segment.address + i),
                              g_asmResult.output[segment.offset + i]);
    }
  }
}

// ============================================================================
// BASIC Tokenizer
// ============================================================================

EMSCRIPTEN_KEEPALIVE
int loadBasicProgram(const char* source) {
  REQUIRE_EMULATOR_OR(-1);
  auto read = [](uint16_t addr) -> uint8_t { return g_host.emulator()->readMemory(addr); };
  auto write = [](uint16_t addr, uint8_t val) { g_host.emulator()->writeMemory(addr, val); };
  return a2e::loadBasicProgram(source, read, write);
}

// ============================================================================
// No-Slot Clock (DS1215)
// ============================================================================

EMSCRIPTEN_KEEPALIVE
void enableNoSlotClock(bool enable) {
  g_host.setNoSlotClock(enable);
}

EMSCRIPTEN_KEEPALIVE
bool isNoSlotClockEnabled() {
  return g_host.noSlotClock();
}


// ============================================================================
// Applesoft variable inspection
//
// The debugger used to walk VARTAB/ARYTAB from JavaScript with one _peekMemory
// per byte — a 1000-element real array cost 5000 round trips through the
// Worker. The walk now happens here and the results are cached until the next
// refresh call, so the UI pays one call for the metadata and one bulk heapRead
// for each array's values.
// ============================================================================

static std::vector<a2e::BasicVariableInfo> g_basicVars;
static std::vector<a2e::BasicArrayInfo> g_basicArrays;
// Array strings are handed over as one NUL-separated blob per array; these keep
// the blobs alive for as long as the pointers handed to JS are valid.
static std::vector<std::string> g_basicArrayStringBlobs;

static a2e::VarMemReadFn emulatorReader() {
  return [](uint16_t addr) -> uint8_t { return g_host.emulator()->peekMemory(addr); };
}

EMSCRIPTEN_KEEPALIVE
int refreshBasicVariables() {
  REQUIRE_EMULATOR_OR(0);
  g_basicVars = a2e::ApplesoftVarReader::readVariables(emulatorReader());
  return static_cast<int>(g_basicVars.size());
}

EMSCRIPTEN_KEEPALIVE
const char* getBasicVariableName(int index) {
  if (index < 0 || index >= (int)g_basicVars.size()) return "";
  return g_basicVars[index].name.c_str();
}

EMSCRIPTEN_KEEPALIVE
int getBasicVariableType(int index) {
  if (index < 0 || index >= (int)g_basicVars.size()) return 0;
  return static_cast<int>(g_basicVars[index].type);
}

EMSCRIPTEN_KEEPALIVE
int getBasicVariableAddress(int index) {
  if (index < 0 || index >= (int)g_basicVars.size()) return 0;
  return g_basicVars[index].address;
}

EMSCRIPTEN_KEEPALIVE
double getBasicVariableReal(int index) {
  if (index < 0 || index >= (int)g_basicVars.size()) return 0.0;
  return g_basicVars[index].realValue;
}

EMSCRIPTEN_KEEPALIVE
int getBasicVariableInt(int index) {
  if (index < 0 || index >= (int)g_basicVars.size()) return 0;
  return g_basicVars[index].intValue;
}

EMSCRIPTEN_KEEPALIVE
const char* getBasicVariableString(int index) {
  if (index < 0 || index >= (int)g_basicVars.size()) return "";
  return g_basicVars[index].stringValue.c_str();
}

EMSCRIPTEN_KEEPALIVE
int refreshBasicArrays() {
  REQUIRE_EMULATOR_OR(0);
  g_basicArrays = a2e::ApplesoftVarReader::readArrays(emulatorReader());

  // Flatten each array's strings into one NUL-separated blob so JS can fetch
  // them with a single heapRead instead of a call per element.
  g_basicArrayStringBlobs.clear();
  g_basicArrayStringBlobs.reserve(g_basicArrays.size());
  for (const auto& arr : g_basicArrays) {
    std::string blob;
    for (const auto& s : arr.stringValues) {
      blob.append(s);
      blob.push_back('\0');
    }
    g_basicArrayStringBlobs.push_back(std::move(blob));
  }

  return static_cast<int>(g_basicArrays.size());
}

EMSCRIPTEN_KEEPALIVE
const char* getBasicArrayName(int index) {
  if (index < 0 || index >= (int)g_basicArrays.size()) return "";
  return g_basicArrays[index].name.c_str();
}

EMSCRIPTEN_KEEPALIVE
int getBasicArrayType(int index) {
  if (index < 0 || index >= (int)g_basicArrays.size()) return 0;
  return static_cast<int>(g_basicArrays[index].type);
}

EMSCRIPTEN_KEEPALIVE
int getBasicArrayAddress(int index) {
  if (index < 0 || index >= (int)g_basicArrays.size()) return 0;
  return g_basicArrays[index].address;
}

EMSCRIPTEN_KEEPALIVE
int getBasicArrayNumDims(int index) {
  if (index < 0 || index >= (int)g_basicArrays.size()) return 0;
  return g_basicArrays[index].numDims;
}

EMSCRIPTEN_KEEPALIVE
int getBasicArrayDim(int index, int dim) {
  if (index < 0 || index >= (int)g_basicArrays.size()) return 0;
  const auto& dims = g_basicArrays[index].dimensions;
  if (dim < 0 || dim >= (int)dims.size()) return 0;
  return dims[dim];
}

EMSCRIPTEN_KEEPALIVE
int getBasicArrayElementCount(int index) {
  if (index < 0 || index >= (int)g_basicArrays.size()) return 0;
  return static_cast<int>(g_basicArrays[index].elementCount);
}

// Bulk value access: JS reads elementCount doubles / int32s straight out of the
// heap. Null when the array is of another type or the index is out of range.
EMSCRIPTEN_KEEPALIVE
const double* getBasicArrayReals(int index) {
  if (index < 0 || index >= (int)g_basicArrays.size()) return nullptr;
  const auto& values = g_basicArrays[index].realValues;
  return values.empty() ? nullptr : values.data();
}

EMSCRIPTEN_KEEPALIVE
const int32_t* getBasicArrayInts(int index) {
  if (index < 0 || index >= (int)g_basicArrays.size()) return nullptr;
  const auto& values = g_basicArrays[index].intValues;
  return values.empty() ? nullptr : values.data();
}

// NUL-separated string blob plus its byte length, so JS can split it after one
// heapRead. Element count still comes from getBasicArrayElementCount.
EMSCRIPTEN_KEEPALIVE
const char* getBasicArrayStrings(int index) {
  if (index < 0 || index >= (int)g_basicArrayStringBlobs.size()) return nullptr;
  return g_basicArrayStringBlobs[index].data();
}

EMSCRIPTEN_KEEPALIVE
int getBasicArrayStringsSize(int index) {
  if (index < 0 || index >= (int)g_basicArrayStringBlobs.size()) return 0;
  return static_cast<int>(g_basicArrayStringBlobs[index].size());
}


// Encode a double into Applesoft's 5-byte float and write it at `addr`. The
// debugger's variable editor used to carry its own encoder; this keeps the one
// in ApplesoftVars as the only implementation.
EMSCRIPTEN_KEEPALIVE
void writeApplesoftFloat(int addr, double value) {
  REQUIRE_EMULATOR();
  uint8_t bytes[a2e::APPLESOFT_FLOAT_SIZE];
  a2e::ApplesoftVars::encodeFloat(value, bytes);
  for (int i = 0; i < a2e::APPLESOFT_FLOAT_SIZE; i++) {
    g_host.emulator()->writeMemory(static_cast<uint16_t>(addr + i), bytes[i]);
  }
}


// Statement geometry for a given line, used by the BASIC debugger window. The
// JS parser used to walk the tokens itself; sharing the core's scan means the
// highlighted statement and the statement a breakpoint fires on cannot
// disagree.
EMSCRIPTEN_KEEPALIVE
int getBasicStatementCountForLine(int lineNumber) {
  REQUIRE_EMULATOR_OR(1);
  return g_host.emulator()->getBasicStatementCountForLine(static_cast<uint16_t>(lineNumber));
}

EMSCRIPTEN_KEEPALIVE
int getBasicStatementIndexForLine(int lineNumber, int txtptr) {
  REQUIRE_EMULATOR_OR(0);
  return g_host.emulator()->getBasicStatementIndexForLine(static_cast<uint16_t>(lineNumber),
                                                   static_cast<uint16_t>(txtptr));
}


// Release every held modifier. The host calls this when it loses keyboard
// focus: a key held across an app switch never delivers its key-up, which
// would otherwise leave an Apple button latched until it was pressed again.
EMSCRIPTEN_KEEPALIVE
void releaseModifiers() {
  REQUIRE_EMULATOR();
  g_host.emulator()->releaseModifiers();
}

} // extern "C"
