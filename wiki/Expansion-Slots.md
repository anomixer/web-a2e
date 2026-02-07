# Expansion Slots

The Apple IIe has seven expansion slots (1-7), each providing I/O space and ROM space for peripheral cards. The emulator supports a configurable set of expansion cards that can be installed in their compatible slots.

## Table of Contents

- [Slot Map](#slot-map)
- [Configuring Slots](#configuring-slots)
- [Available Cards](#available-cards)
- [Memory Map](#memory-map)
- [Card Interface](#card-interface)

## Slot Map

The default slot configuration matches a typical Apple IIe setup:

| Slot | Default Card | Description |
|------|-------------|-------------|
| 1 | Empty | Printer / Serial |
| 2 | Empty | Serial / Modem |
| 3 | 80-Column (Built-in) | Fixed -- cannot be changed |
| 4 | Mockingboard | Sound cards / Mouse |
| 5 | Empty | Clock / Hard drive |
| 6 | Disk II Controller | Disk drives |
| 7 | Thunderclock Plus | RAM disk / Clock |

## Configuring Slots

Open the **Expansion Slots** window from the **System** menu to change which cards are installed in each slot.

### How It Works

Each configurable slot has a dropdown menu listing the cards that are compatible with that slot. Select a card from the dropdown, and a warning will appear indicating that changes require a reset. Click **Apply & Reset** to apply all pending changes and restart the emulator.

### Slot Restrictions

- **Slot 3** is fixed and always contains the built-in 80-column firmware. It cannot be changed.
- Each card type can only be installed in one slot at a time. If a card is already in use in another slot, its option will be grayed out in the dropdown.
- Not all cards are available in all slots. Each slot has a specific list of compatible cards based on Apple II conventions.

### Compatible Cards per Slot

| Slot | Available Cards |
|------|----------------|
| 1 | Empty |
| 2 | Empty |
| 3 | 80-Column (fixed) |
| 4 | Empty, Mockingboard, Apple Mouse Card |
| 5 | Empty, Thunderclock Plus |
| 6 | Empty, Disk II Controller |
| 7 | Empty, Thunderclock Plus |

### Persistence

Slot configuration is saved to localStorage and automatically restored when the emulator is loaded. If no saved configuration exists, the default card assignments shown in the Slot Map above are used.

## Available Cards

### Disk II Controller

The Disk II controller card provides access to two 5.25-inch floppy disk drives. It uses 16 soft switches in the I/O space for drive control including phase stepping, motor control, drive selection, and read/write operations.

- **Default slot:** 6
- **I/O space:** `$C0E0`-`$C0EF` (16 soft switches)
- **ROM space:** `$C600`-`$C6FF` (256-byte bootstrap ROM, P5A 341-0027)
- **Supported formats:** DSK, DO, PO, NIB, WOZ

Soft switch layout:

| Offset | Even (Off) | Odd (On) |
|--------|-----------|----------|
| $00-$01 | Phase 0 off | Phase 0 on |
| $02-$03 | Phase 1 off | Phase 1 on |
| $04-$05 | Phase 2 off | Phase 2 on |
| $06-$07 | Phase 3 off | Phase 3 on |
| $08-$09 | Motor off | Motor on |
| $0A-$0B | Drive 1 select | Drive 2 select |
| $0C-$0D | Q6L (read) | Q6H (write protect / write load) |
| $0E-$0F | Q7L (read mode) | Q7H (write mode) |

See [[Disk-Drives]] for more details on disk operation.

### Mockingboard

The Mockingboard sound card provides stereo audio through two AY-3-8910 Programmable Sound Generator (PSG) chips, each controlled by a MOS 6522 Versatile Interface Adapter (VIA). It was the most popular sound card for the Apple II.

- **Default slot:** 4
- **ROM space:** `$C400`-`$C4FF` (VIA registers -- unusual; most cards use I/O space)
- **VIA 1:** `$C400`-`$C47F` (bit 7 = 0) -- controls left channel PSG
- **VIA 2:** `$C480`-`$C4FF` (bit 7 = 1) -- controls right channel PSG

The Mockingboard is unusual among Apple II cards in that it uses the slot ROM address space for its VIA registers instead of the I/O space, because it needs more than the 16 bytes available in the I/O range.

Each PSG provides 3 tone channels and 1 noise channel, for a total of 6 tone channels and 2 noise channels in stereo.

See [[Audio-System]] for more details on Mockingboard audio.

### Thunderclock Plus

The Thunderclock Plus is a ProDOS-compatible real-time clock card. It provides automatic date and time stamping for ProDOS applications, eliminating manual date entry prompts and enabling proper file timestamps.

- **Compatible slots:** 5, 7
- **Default slot:** 7
- **I/O space:** Control register at `$C0n0`
- **ROM space:** `$Cn00`-`$CnFF` (256-byte ProDOS clock driver)
- **Expansion ROM:** `$C800`-`$CFFF` (utility routines)

The Thunderclock uses the host system's real date and time, so ProDOS file timestamps will reflect the actual current time.

**ProDOS detection:** ProDOS scans expansion slot ROM looking for specific signature bytes (`$08`, `$28`, `$58`, `$70` at offsets 0, 2, 4, 6). When found, ProDOS patches its clock driver to use the Thunderclock for all date/time operations.

**Hardware interface:** The card uses a serial interface based on the NEC uPD1990C clock chip. Time data is transmitted as 40 bits (10 BCD nibbles) encoding seconds, minutes, hours, day, day-of-week, and month.

### Apple Mouse Card

The Apple Mouse Interface Card provides mouse input for Apple II software. It emulates the MC6821 PIA-based command protocol used by the original card's firmware.

- **Compatible slots:** 4 (shares with Mockingboard)
- **I/O space:** `$C0n0`-`$C0n3` (MC6821 PIA registers)
- **ROM space:** `$Cn00`-`$CnFF` (firmware)
- **Expansion ROM:** Full 2 KB ROM with page selection via Port B bits 1-3

The mouse card firmware runs as native 6502 code on the CPU. The emulator provides the hardware-side emulation of the MC6821 PIA, receiving commands from the firmware and providing mouse position and button data.

**VBL interrupt support:** When the mouse mode has bit 3 set, an IRQ is generated at the start of each vertical blanking period, allowing software to poll the mouse at a consistent 60 Hz rate.

## Memory Map

Each expansion slot is assigned dedicated address ranges in the Apple IIe memory map:

### I/O Space ($C080-$C0FF)

Each slot gets 16 bytes of I/O space. Software reads and writes to these addresses to communicate with the card's hardware.

| Slot | I/O Range |
|------|-----------|
| 1 | `$C090`-`$C09F` |
| 2 | `$C0A0`-`$C0AF` |
| 3 | `$C0B0`-`$C0BF` |
| 4 | `$C0C0`-`$C0CF` |
| 5 | `$C0D0`-`$C0DF` |
| 6 | `$C0E0`-`$C0EF` |
| 7 | `$C0F0`-`$C0FF` |

### Slot ROM Space ($C100-$C7FF)

Each slot gets 256 bytes of ROM space. When the CPU reads from this range, the card in that slot provides the data. This is typically used for identification bytes, bootstrap code, or (in the Mockingboard's case) hardware register access.

| Slot | ROM Range |
|------|-----------|
| 1 | `$C100`-`$C1FF` |
| 2 | `$C200`-`$C2FF` |
| 3 | `$C300`-`$C3FF` |
| 4 | `$C400`-`$C4FF` |
| 5 | `$C500`-`$C5FF` |
| 6 | `$C600`-`$C6FF` |
| 7 | `$C700`-`$C7FF` |

### Expansion ROM Space ($C800-$CFFF)

A shared 2 KB region that can be mapped to any card's expansion ROM. When the CPU accesses a card's slot ROM, that card's expansion ROM (if it has one) becomes active in this shared range. Cards like the Thunderclock and Mouse Card use this for additional firmware.

### ROM Switching Soft Switches

Two soft switches control how the slot ROM area is accessed:

- **INTCXROM** (`$C006`/`$C007`) -- When set, the internal ROM is used for the entire `$C100`-`$CFFF` range instead of slot ROMs.
- **SLOTC3ROM** (`$C00A`/`$C00B`) -- When set, slot 3 uses the card's ROM instead of the built-in 80-column firmware.

## Card Interface

All expansion cards implement the `ExpansionCard` interface, which provides the following methods:

| Method | Description |
|--------|-------------|
| `readIO(offset)` | Read from the card's I/O space (offset 0-15) |
| `writeIO(offset, value)` | Write to the card's I/O space |
| `readROM(offset)` | Read from the card's ROM space (offset 0-255) |
| `writeROM(offset, value)` | Write to the card's ROM space (unusual, used by Mockingboard) |
| `readExpansionROM(offset)` | Read from expansion ROM (offset 0-2047) |
| `reset()` | Reset the card to power-on state |
| `update(cycles)` | Update card state each CPU cycle |
| `serialize() / deserialize()` | Save and restore card state |

Cards can also generate IRQ interrupts via a callback mechanism, used by the Mockingboard's VIA timers and the Mouse Card's VBL interrupt.

See also: [[Architecture-Overview]], [[Audio-System]], [[Disk-Drives]]
