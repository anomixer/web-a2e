# Thunderclock Debug Notes

## Current Status

- ProDOS **detects** the clock card (MACHID bit 0 is set)
- But new files show `<NO DATE>` - time data isn't being read correctly
- The serial protocol implementation likely needs adjustment

## Verification Commands (ProDOS BASIC)

### Check if clock was detected
```
PRINT PEEK(49048)
```
- Odd number = clock detected (bit 0 set)
- Result was **179** - clock IS detected

### Check clock driver hook
```
PRINT PEEK(49926)
```
- 76 ($4C) = JMP, clock driver installed
- 96 ($60) = RTS, no clock driver
- Result was **144** ($90) - unexpected value

### Test I/O register (slot 5)
```
PRINT PEEK(49360)
```
- Reads $C0D0 (Thunderclock I/O for slot 5)
- Result was **0** - card is responding

## Manual Serial Protocol Test

Run these in order to test if the Thunderclock responds to the serial protocol:

### Step 1 - Trigger time read (STROBE + CMD_TIMED)
```
POKE 49360, 164
```
($A4 = CMD_TIMED $A0 | STROBE $04)

### Step 2 - Clock out first data bit
```
POKE 49360, 162
```
($A2 = CMD_TIMED $A0 | CLOCK $02)

### Step 3 - Read the result
```
PRINT PEEK(49360)
```
- If bit 7 is set: value >= 128
- If bit 7 is clear: value < 128
- This tells us if data bits are being shifted out

### Step 4 - Clock out more bits and check pattern
Repeat steps 2-3 multiple times to see if different bits come out:
```
POKE 49360, 160: POKE 49360, 162: PRINT PEEK(49360)
POKE 49360, 160: POKE 49360, 162: PRINT PEEK(49360)
POKE 49360, 160: POKE 49360, 162: PRINT PEEK(49360)
```
(Each line: clear clock, set clock, read bit)

## Expected Time Format

The Thunderclock outputs 40 bits in this order (MSB first):
1. Month (4 bits) - 0-11
2. Day of week (4 bits) - 0-6, Sunday=0
3. Day of month (8 bits BCD)
4. Hour (8 bits BCD, 24-hour)
5. Minute (8 bits BCD)
6. Second (8 bits BCD)

## Memory Addresses Reference

| Address | Decimal | Purpose |
|---------|---------|---------|
| $C0D0 | 49360 | Slot 5 I/O register |
| $C500 | 50432 | Slot 5 ROM start |
| $BF98 | 49048 | ProDOS MACHID |
| $BF06 | 49926 | ProDOS clock hook |

## Files

- `src/core/cards/thunderclock_card.cpp` - Serial protocol implementation
- `src/core/cards/thunderclock_card.hpp` - Card class definition
- `roms/Thunderclock Plus ROM.bin` - Real Thunderclock ROM (2KB)
