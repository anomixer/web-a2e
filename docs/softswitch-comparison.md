# Softswitch Implementation Comparison: web-a2e vs AppleWin

This document compares the softswitch handling between web-a2e and AppleWin (the reference Apple II emulator).

## Architecture Overview

| Aspect | web-a2e | AppleWin |
|--------|---------|----------|
| **Structure** | Single `SoftSwitches` struct with ~30 boolean flags in `types.hpp`, centralized handling in `MMU::readSoftSwitch()` / `writeSoftSwitch()` | Bitmask `g_memmode` with flags (`MF_80STORE`, `MF_AUXREAD`, etc.), distributed across IO handler functions |
| **Dispatch** | Single large `switch` statement on `(address & 0xFF)` | Function pointer array (`IORead[8]`, `IOWrite[8]`) dispatching to `IORead_C0xx()` / `IOWrite_C0xx()` handlers |
| **Memory Model** | Direct boolean flags accessed via `switches_.xxx` | Bitfield operations: `SetMemMode(g_memmode | MF_FLAG)` |

## I/O Dispatch Mechanism

### AppleWin Approach

AppleWin uses function pointer arrays split by $10 address ranges:

```cpp
static iofunction IORead_C0xx[8] = {
    IORead_C00x,  // Keyboard
    IORead_C01x,  // Memory/Video status
    IORead_C02x,  // Cassette
    IORead_C03x,  // Speaker
    IORead_C04x,  // Unused
    IORead_C05x,  // Video mode switches
    IORead_C06x,  // Joystick
    IORead_C07x,  // Joystick/Video
};
```

Each handler function processes 16 addresses:

```cpp
static BYTE __stdcall IORead_C01x(WORD pc, WORD addr, BYTE bWrite, BYTE d, ULONG nExecutedCycles)
{
    bool res = false;
    switch (addr & 0xf)
    {
    case 0x0: return KeybReadFlag();
    case 0x1: res = SW_BANK2 ? true : false; break;
    case 0x2: res = SW_HIGHRAM ? true : false; break;
    // ...
    }
    return KeybGetKeycode() | (res ? 0x80 : 0);
}
```

### web-a2e Approach

web-a2e uses a monolithic switch in `mmu.cpp`:

```cpp
uint8_t MMU::readSoftSwitch(uint16_t address) {
    uint8_t reg = address & 0xFF;
    switch (reg) {
    case 0x00: return keyboardLatch_;
    case 0x10: keyboardLatch_ &= 0x7F; return keyboardLatch_;
    case 0x11: return (switches_.lcram2 ? 0x80 : 0x00) | (getFloatingBusValue() & 0x7F);
    // ... all 256 cases
    }
}
```

**Trade-offs:**
- AppleWin: Better code organization, easier to maintain per-device handlers
- web-a2e: Simpler dispatch, all logic visible in one place

## Status Read Return Values ($C01x)

Both implementations return the switch state in bit 7 with data bus noise in bits 0-6.

### AppleWin

Returns the last keyboard keycode OR'd with the status bit:

```cpp
return KeybGetKeycode() | (res ? 0x80 : 0);
```

### web-a2e

Returns floating bus value OR'd with the status bit:

```cpp
return (switches_.lcram2 ? 0x80 : 0x00) | (getFloatingBusValue() & 0x7F);
```

Both approaches are correct per "Understanding the Apple IIe" (UTAIIe) - the lower 7 bits represent data bus noise from the previous cycle.

## Memory Paging Updates

### AppleWin

AppleWin maintains shadow memory arrays for fast access:

```cpp
LPBYTE memshadow[256];  // Read pointers per 256-byte page
LPBYTE memwrite[256];   // Write pointers per 256-byte page
BYTE memdirty[256];     // Dirty flags for copy-back
```

When a paging mode changes, `UpdatePaging()` copies memory between shadow regions:

```cpp
if ((lastmemmode != g_memmode) || modechanging)
{
    for (UINT page = 0; page < 256; page++)
    {
        if (oldshadow[page] != memshadow[page])
        {
            if (*(memdirty+page) & 1)
                memcpy(oldshadow[page], mem+(page << 8), 256);
            memcpy(mem+(page << 8), memshadow[page], 256);
        }
    }
}
```

### web-a2e

web-a2e evaluates switches at memory access time without shadow caching:

```cpp
// In read() method
if (switches_.store80 && switches_.page2) {
    return auxMemory_[address];
}
if (switches_.ramrd) {
    return auxMemory_[address];
}
return mainMemory_[address];
```

**Trade-offs:**
- AppleWin: Faster memory access after mode change (direct pointer dereference)
- web-a2e: Simpler implementation, no synchronization overhead, but more conditionals per access

## Language Card Handling ($C080-$C08F)

### AppleWin

Delegates to a separate `LanguageCard` class that manages:
- Bank selection (bank 1 vs bank 2)
- Read source (RAM vs ROM)
- Write enable state with pre-write tracking

### web-a2e

Handles inline in `handleLanguageCardSwitch()`:

```cpp
uint8_t MMU::handleLanguageCardSwitch(uint8_t reg) {
    bool bank2 = !(reg & 0x08);
    uint8_t op = reg & 0x03;
    bool readRAM = (op == 0 || op == 3);

    switch (op) {
    case 0: // $C080, $C088: Read RAM, write disabled
        switches_.lcwrite = false;
        switches_.lcprewrite = false;
        break;
    case 1: // $C081, $C089: Read ROM, write enable on second read
        if (switches_.lcprewrite) {
            switches_.lcwrite = true;
        }
        switches_.lcprewrite = true;
        break;
    // ...
    }
    switches_.lcram = readRAM;
    switches_.lcram2 = bank2;
    return getFloatingBusValue();
}
```

Both implementations correctly handle the double-read requirement for write enable.

## Annunciators ($C058-$C05F)

### AppleWin

Has special handling for DHIRES that checks machine type and IOUDIS state:

```cpp
static BYTE __stdcall IOReadWrite_ANx(WORD pc, WORD addr, BYTE bWrite, BYTE d, ULONG nExecutedCycles)
{
    if (IsAppleIIeOrAbove(GetApple2Type()))
    {
        if (!IsAppleIIc(GetApple2Type()) || SW_IOUDIS)
            GetVideo().VideoSetMode(pc, addr, bWrite, d, nExecutedCycles);
    }
    if (IsAppleIIc(GetApple2Type()))
        return 0;  // No ANx lines for //c
    return IO_Annunciator(pc, addr, bWrite, d, nExecutedCycles);
}
```

### web-a2e

Directly sets annunciator flags without DHIRES coupling:

```cpp
case 0x5E:
    switches_.an3 = false;
    return getFloatingBusValue();  // AN3 OFF = DHIRES enabled
case 0x5F:
    switches_.an3 = true;
    return getFloatingBusValue();  // AN3 ON = DHIRES disabled
```

The DHIRES state is derived from AN3 when needed rather than tracked separately.

## Potential Issues in web-a2e

### 1. $C000-$C00B Read Behavior

web-a2e treats $C000 as the only keyboard read address. AppleWin's `IORead_C00x` returns keyboard data for the entire `$C000-$C00F` range, which matches hardware behavior where the keyboard decoder responds to all 16 addresses.

**Current web-a2e code:**
```cpp
case 0x00: return keyboardLatch_;
case 0x01: case 0x02: ... case 0x0F: return getFloatingBusValue();
```

**Should be:**
```cpp
case 0x00: case 0x01: case 0x02: ... case 0x0F:
    return keyboardLatch_;
```

### 2. Write-Only Switch Reads ($C000-$C00B)

AppleWin returns keyboard data when reading write-only memory switches. web-a2e returns floating bus, which may cause compatibility issues with software that reads these addresses expecting keyboard data.

### 3. PAGE2/HIRES and Memory Remapping

AppleWin routes $C054-$C057 through `MemSetPaging()` which triggers `UpdatePaging()` to remap memory pointers. web-a2e sets switches but relies on runtime evaluation. This is functionally equivalent but should be verified for timing-sensitive software.

### 4. 80STORE/PAGE2 Interaction

AppleWin explicitly updates memory mappings when PAGE2 changes and 80STORE is set:

```cpp
if (SW_80STORE)
{
    for (loop = 0x04; loop < 0x08; loop++)
    {
        memshadow[loop] = SW_PAGE2 ? memaux+(loop << 8) : memmain+(loop << 8);
        memwrite[loop] = mem+(loop << 8);
    }
}
```

web-a2e checks `store80 && page2` at read/write time, which is functionally equivalent but potentially slower for tight loops.

## Summary

| Feature | web-a2e | AppleWin |
|---------|---------|----------|
| Code clarity | Better - all logic in one switch | Distributed across handlers |
| Performance | Slower - runtime switch evaluation | Faster - pointer tables |
| Machine support | IIe focused | II, II+, IIe, IIc, IIgs |
| Memory model | Direct evaluation | Shadow page tables |
| Maintainability | Easier - single file | Harder - multiple classes |

web-a2e's implementation is cleaner and more readable with the struct-based approach, while AppleWin is more optimized for performance with its paged shadow memory and function pointer dispatch. Both correctly implement the core Apple IIe softswitch semantics.

## References

- AppleWin source: https://github.com/AppleWin/AppleWin/blob/master/source/Memory.cpp
- "Understanding the Apple IIe" by James Sather (UTAIIe)
- Apple IIe Technical Reference Manual
