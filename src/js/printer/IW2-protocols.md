# ImageWriter II Protocol & Emulation Spec

Authoritative reference for the virtual ImageWriter II. Every command, dimension,
timing, and behaviour needed to emulate the printer faithfully. Sourced from the
*ImageWriter II Technical Reference Manual* (Appendices A, C, D, E; Chapters 4–8).

> Manual PDF: `~/Documents/Apple_II/Apple II Books/ImageWriter II Technical Reference Manual.pdf`
> (extract with `pdftotext -layout`). All hex/decimal codes below are verbatim from Appendix A.

Implementation lives in `imagewriter-ii.js` (parser/state), `printer-head.js`
(carriage model), `printer-window.js` (renderer), `imagewriter-rom-*.js` (glyph ROMs).

---

## 1. Physical Specifications (Appendix D)

| Property | Value |
|---|---|
| Print method | Dot matrix, logic seek (bidirectional, line by line) |
| Print head | Vertical array of **9 wires**, spaced **1/72 inch** apart |
| Graphics | Top **8 wires** only (8-dot columns) |
| Vertical dot spacing | 1/72 inch (72 dpi); 144 dpi via two-pass |
| Printed line length | **8 inches** max |
| Max dots/line | 1280 (8 in × 160 dpi) |
| Line spacing | 1/144 to 99/144 inch, in 1/144 increments |
| Line feed speed | max 24 ips @ 6 lpi |
| Paper width | 3.5–9.5 in pin-to-pin, 10 in max |
| Input buffer | 2KB (32KB with memory option) |
| Dimensions | 431.8 × 304.8 × 127.0 mm (17×12×5 in) |

### Print speed by font (drives carriage timing)

| Font | Speed |
|---|---|
| Draft | **250 cps** |
| Correspondence | **180 cps** |
| NLQ | **45 cps** |

Boldface and color overprint run at **half speed** (extra hammer pass).

### Character cell formats (Appendix D)

| Font | Cell (W × H dots) | Notes |
|---|---|---|
| Draft | **12 × 7** | uses every-other dot horizontally (½-dot method) |
| Correspondence fixed | **7 × 7** | (cell stored 8-wide, rightmost column blank) |
| Correspondence proportional | up to **16 × 7** | variable width per glyph |
| NLQ | **16 × 14** | two-pass vertical (144 dpi) |
| NLQ proportional | up to **16 × 14** | variable width |
| Custom (downloaded) | up to **16 × 8** | user RAM glyphs |

Character set: 96 ASCII + 28 European language chars + 32 MouseText.

---

## 2. Serial Interface (Appendix E)

- 8-bit serial, **1 start / 8 data / 1 stop**, no parity, asynchronous.
- Baud: 300 / 1200 / 2400 / 9600 (DIP SW2-1/2-2). Apple II software uses 9600 via SSC.
- Handshake: hardware OR XON/XOFF (DIP SW2-3).
- 8th-bit handling defaults to **ignore** (7-bit) — see `ESC D/Z … SPACE`.

Emulation: bytes arrive from the SSC TX mirror (or parallel card latch). Parser is
byte-stream; no baud modelling needed beyond pacing the carriage by cps.

---

## 3. Horizontal Pitch & Graphics Density

Each pitch sets both the text advance **and** the graphics horizontal density.

| Cmd | Hex | Pitch | cpi | Chars/line | Graphics dpi | Max nnnn |
|---|---|---|---|---|---|---|
| `ESC n` | 1B 6E | Extended | 9 | 72 | 72 | 0576 |
| `ESC N` | 1B 4E | Pica | 10 | 80 | 80 | 0640 |
| `ESC E` | 1B 45 | Elite | 12 | 96 | 96 | 0768 |
| `ESC e` | 1B 65 | Semicondensed | 13.4 | 107 | 107 | 0856 |
| `ESC q` | 1B 71 | Condensed | 15 | 120 | 120 | 0960 |
| `ESC Q` | 1B 51 | Ultracondensed | 17 | 136 | 136 | 1088 |
| `ESC p` | 1B 70 | Proportional-pica | var | — | 144 | 1152 |
| `ESC P` | 1B 50 | Proportional-elite | var | — | 160 | 1280 |

Default pitch = DIP SW1-6/1-7 (power-on). Pica is the common default.

> **Graphics density follows the active pitch** (Table 8-2). `_gfxDotW = DPI / density`.
> All eight modelled: extended 72 / pica 80 / elite 96 / semicondensed 107 /
> condensed 120 / ultra 136 / prop-pica 144 / prop-elite 160. `ESC F` dot-column
> placement counts in these same per-pitch units. Proportional pitches (`ESC p/P`)
> use the correct 144/160 graphics density but fall back to fixed-width text advance
> (10/12 cpi) until the proportional ROM is plumbed.

---

## 4. Print Quality / Font (Table A-6)

| Cmd | Hex | Function |
|---|---|---|
| `ESC a 0` | 1B 61 30 | Correspondence |
| `ESC a 1` | 1B 61 31 | Draft (default) |
| `ESC a 2` | 1B 61 32 | NLQ |
| `ESC m` | 1B 6D | = `ESC a 0` (correspondence) |
| `ESC M` | 1B 4D | = `ESC a 2` (NLQ) |

### Draft-incompatibility rule (Tables 4-1/4-10/4-11)

Bold, double-width, half-height, sub/superscript, proportional are **unavailable in
draft**. Selecting any while in draft auto-switches to **correspondence**; deselecting
returns to draft. Sub/superscript force correspondence from draft **or** NLQ.

> Implemented: `_draftIncompatibleActive()` / `_effectiveQuality()`. `getCharsPerSecond()`
> keys off effective font; `VirtualHead.setCps()` retunes carriage on every change.

---

## 5. Character Attributes (Table A-12)

| Cmd | Hex | Function |
|---|---|---|
| `ESC X` | 1B 58 | Start underline |
| `ESC Y` | 1B 59 | **Stop** underline (default) |
| `ESC !` | 1B 21 | Start boldface |
| `ESC "` | 1B 22 | Stop boldface (default) |
| `CTRL-N` | 0E | Start double-width |
| `CTRL-O` | 0F | Stop double-width (default) |
| `ESC w` | 1B 77 | Start half-height |
| `ESC W` | 1B 57 | Stop half-height (default) |
| `ESC x` | 1B 78 | Start superscript |
| `ESC y` | 1B 79 | Start subscript |
| `ESC z` | 1B 7A | Stop super/subscript (default) |
| `ESC D CTRL-@ CTRL-A` | 1B 44 00 01 | Zeros slashed |
| `ESC Z CTRL-@ CTRL-A` | 1B 5A 00 01 | Zeros unslashed (default) |

Render geometry:
- **Bold** = reprint each dot with a small horizontal shift (×2 paint, half speed).
- **Double-width** = two identical dot columns per source column; advance ×2.
- **Half-height** = vertical scale ×0.5, bottom-aligned.
- **Superscript** = top half of cell; **Subscript** = bottom half.
- **Underline** = solid rule along row 8 spanning the char advance.

> **Strikethrough does NOT exist** on the IW-II. Software achieved it via overstrike
> (backspace + `-`). Do not invent a strikethrough opcode.

> `ESC Y` is **stop-underline** — it must NOT be reused for bit-image graphics
> (an Epson-ism that collides). Graphics use `ESC G/S/g` only (§7).

---

## 6. Proportional Spacing (Table A-11)

| Cmd | Hex | Function |
|---|---|---|
| `ESC s n` | 1B 73 *n* | Set inter-char dot spacing, n = `0`–`9` |
| `ESC <space n>` | 1B *n* | Insert n dot spaces, n = 1–6 (cumulative) |

Each proportional glyph includes one trailing blank column, so spacing 0 = 1 dot gap.
Glyph widths come from the proportional ROM tables (Appendix C; editor modes
`corrProp` ~×9, `nlqProp` ~×18). **Not yet plumbed** — `ESC p/P` currently set the
flag + force correspondence but render fixed-width.

---

## 7. Graphics / Bit Image (Tables 8-1 … 8-5)

### Line prefixes

| Cmd | Hex | Count meaning |
|---|---|---|
| `ESC G nnnn` | 1B 47 | nnnn = 4 ASCII digits = number of data bytes |
| `ESC S nnnn` | 1B 53 | identical to `ESC G` |
| `ESC g nnn` | 1B 67 | nnn = 3 ASCII digits = number of **8-byte groups** (×8) |
| `ESC V nnnn c` | 1B 56 | repeat single column byte `c`, nnnn times |
| `ESC F nnnn` | 1B 46 | move head nnnn dot columns from left margin |

- Count digits are ASCII `0`–`9` (`$30`–`$39`); **leading zeros may be spaces** (`$20` → 0).
- `nnnn` always 4 digits, `nnn` always 3. After count, exactly that many data bytes follow,
  then printer auto-returns to text mode.
- `ESC g` is faster than `ESC G`; equivalent when byte count divisible by 8
  (`ESC G0080` ≡ `ESC g010`).
- Max byte count per line depends on pitch (§3, Table 8-2).

### Data byte → dot column

Each byte = one vertical column of 8 dots.
**Bit 7 = bottom dot, Bit 0 = top dot.** (A dot prints where the bit = 1.)

> Note the inversion: MSB is the *bottom* wire. Renderer/ROM must map accordingly.

### Double-width / boldface with graphics
- Double-width: each byte prints **two** identical columns → max bytes halved.
- Boldface: each dot printed twice with small shift → half speed.
- Must send the width/bold command **before** the graphics prefix, else it's eaten as data.

### Double vertical density (144 dpi)
Min line feed = 1/144 in. To double density: split column into 16 dots, print even
bits, `CR` + 1/144 LF, print odd bits. `ESC n` + `ESC T16` gives a uniform 72×72 matrix.

---

## 8. Color Printing (Table A-18 / 8-6)

Four-band ribbon: **black, yellow, red, blue** (the real ImageWriter II cartridge).
Orange/green/purple are made by **overprinting** (CR with no LF, reprint in a second
band).

| Cmd | Hex | Color |
|---|---|---|
| `ESC K 0` | 1B 4B 30 | Black (default) |
| `ESC K 1` | 1B 4B 31 | Yellow |
| `ESC K 2` | 1B 4B 32 | Red |
| `ESC K 3` | 1B 4B 33 | Blue |
| `ESC K 4` | 1B 4B 34 | Orange (Yellow + Red) |
| `ESC K 5` | 1B 4B 35 | Green (Yellow + Blue) |
| `ESC K 6` | 1B 4B 36 | Purple (Red + Blue) |

Print yellow **first** when combining to avoid band contamination. Color option auto-on
when a color ribbon is "installed". Colour overprint runs at **half speed** (extra pass).

> Emulation (implemented): `COLORS[0-6]` resolves all seven indices; the renderer
> paints with `globalCompositeOperation = 'multiply'`, so K4-6 print directly AND a
> genuine CR-without-LF overprint of two bands subtracts toward the secondary. Colour
> only reaches the paper when the colour ribbon cartridge is installed (`VirtualRibbon`).
> `getCharsPerSecond()` halves while a non-black colour (or bold) is active. Default
> ribbon = black.

---

## 9. Page / Paper Motion

### Print head motion (Table A-14)

| Cmd | Hex | Function |
|---|---|---|
| `CTRL-M` | 0D | Carriage return (commits line) |
| `ESC >` | 1B 3E | Unidirectional printing |
| `ESC <` | 1B 3C | **Bidirectional** printing (default) |
| `CTRL-H` | 08 | Backspace |
| `ESC ( ...` | 1B 28 | Set horizontal tabs (`aaa,bbb,…nnn.`) |
| `ESC u nnn` | 1B 75 | Add one tab stop at column nnn |
| `CTRL-I` | 09 | Move to next tab |
| `ESC ) ...` | 1B 29 | Clear tabs at listed positions |
| `ESC 0` | 1B 30 | Clear all tabs |
| `ESC F nnnn` | 1B 46 | Head to nnnn dot columns from left margin |

> Default motion is **bidirectional** — lines buffer until CR/LF and emit reordered by
> travel direction. Headless tests must send CR to flush; emission order may reverse.

### Paper motion (Table A-15)

| Cmd | Hex | Function |
|---|---|---|
| `ESC v` | 1B 76 | Set top-of-form to current position |
| `CTRL-L` | 0C | Form feed (to next TOF) |
| `CTRL-J` | 0A | Line feed |
| `CTRL-_ n` | 1F *n* | Feed 1–15 blank lines (n = `1`–`9`,`:;<=>?`) |
| `ESC A` | 1B 41 | 6 lines/inch (default) |
| `ESC B` | 1B 42 | 8 lines/inch |
| `ESC T nn` | 1B 54 | Line distance = nn/144 inch (nn = 01–99) |
| `ESC f` | 1B 66 | Forward line feeding (default) |
| `ESC r` | 1B 72 | Reverse line feeding |
| `ESC D CTRL-@ CTRL-D` | 1B 44 00 04 | Perforation skip disabled |
| `ESC Z CTRL-@ CTRL-D` | 1B 5A 00 04 | Perforation skip enabled |
| `ESC O` | 1B 4F | Paper-out sensor off |
| `ESC o` | 1B 6F | Paper-out sensor on (default) |

### Page formatting (Table A-13)

| Cmd | Hex | Function |
|---|---|---|
| `ESC L nnn` | 1B 4C | Set left margin at column nnn (default 000) |
| `ESC H nnnn` | 1B 48 | Page length = nnnn/144 inch (0001–9999) |

### Auto CR / LF (Table A-16)

| Cmd | Hex | Function |
|---|---|---|
| `ESC l 1` | 1B 6C 31 | No CR insertion before LF/FF |
| `ESC l 0` | 1B 6C 30 | Insert CR before LF/FF (default) |
| `ESC D @ CTRL-@` | 1B 44 80 00 | Add auto LF after CR |
| `ESC Z @ CTRL-@` | 1B 5A 80 00 | No LF after CR |
| `ESC D <space> CTRL-@` | 1B 44 20 00 | Add LF when line full |
| `ESC Z <space> CTRL-@` | 1B 5A 20 00 | No LF when line full (default) |

(`@` here = high-ASCII CTRL-@ = $80.)

---

## 10. Custom / Downloaded Characters (Table A-9)

| Cmd | Hex | Function |
|---|---|---|
| `ESC -` | 1B 2D | Max custom width 8 dots (default) |
| `ESC +` | 1B 2B | Max custom width 16 dots |
| `ESC I` | 1B 49 | Start loading new character(s) |
| `CTRL-D` | 04 | End loading |
| `ESC '` | 1B 27 | Switch to custom font (low ASCII) |
| `ESC *` | 1B 2A | Switch to custom font (high ASCII) |
| `ESC $` | 1B 24 | Switch back to normal font |

Custom glyph data uses the same byte→column mapping as graphics (bit 7 = bottom).
Per-glyph width is intrinsic to its byte-array length (see ROM editor data model).

---

## 11. MouseText & Language (Tables A-7/A-8)

| Cmd | Hex | Function |
|---|---|---|
| `ESC &` | 1B 26 | Map MouseText to low ASCII ($40–$5F) |
| `ESC $` | 1B 24 | Standard ASCII (default) |
| `ESC D CTRL-@ SPACE` | 1B 44 00 20 | Ignore 8th data bit (default) |
| `ESC Z CTRL-@ SPACE` | 1B 5A 00 20 | Include 8th data bit |

Language sets selected via `ESC Z`/`ESC D` switch pairs (American, Italian, Danish,
British, German, Swedish, French, Spanish) — per-locale glyph tables in the ROM editor.

---

## 12. Software Switches (Tables A-4/A-5)

| Cmd | Hex | Function |
|---|---|---|
| `ESC Z a b` | 1B 5A *ha hb* | Set switches in bit pattern a,b to **open** (off) |
| `ESC D a b` | 1B 44 *ha hb* | Set switches in bit pattern a,b to **closed** (on) |

Group A: language, soft-select, LF-when-full, print-commands, auto-LF.
Group B: slash-zero, perf-skip, data-byte length (7/8 bit).

---

## 13. Miscellaneous (Table A-19)

| Cmd | Hex | Function |
|---|---|---|
| `ESC R nnn c` | 1B 52 | Repeat char `c` nnn times (001–999) |
| `CTRL-X` | 18 | Erase current line from print buffer |
| `ESC c` | 1B 63 | **Soft reset** (defaults; keeps TOF & custom chars) |
| `CTRL-Q` | 11 | Select printer (default) |
| `CTRL-S` | 13 | Deselect printer |
| `ESC D CTRL-P CTRL-@` | 1B 44 10 00 | Software select disabled (default) |
| `ESC Z CTRL-P CTRL-@` | 1B 5A 10 00 | Software select enabled |
| `ESC ?` | 1B 3F | Send ID string |
| `ESC Z @ CTRL-@` | 1B 5A 40 00 | Only CR causes printing |
| `ESC D @ CTRL-@` | 1B 44 40 00 | CR, LF, FF cause printing (default) |

Commands that trigger printing of the buffer: **CR, LF, FF** (default).

---

## 14. Reset Defaults (Tables A-1/A-2)

Power-on (hard reset) and `ESC c` (soft reset) defaults:

| Function | Default |
|---|---|
| Font | **Draft** |
| Character pitch | per DIP SW1-6/1-7 |
| Proportional spacing | 0 |
| Zeros | unslashed |
| MouseText | standard ASCII |
| Underline / Bold / Double-width | Off |
| Half-height / Sub / Superscript | Off |
| Left margin | 0 |
| Page length | per DIP SW1-4 (11 or 12 in) |
| Paper-out sensor | On |
| Line spacing | 6 lpi |
| Line feed direction | Forward |
| CR insertion before LF/FF | On |
| Print head motion | **Bidirectional** |
| Horizontal tabs | cleared |
| Graphics | Off |
| Ribbon color | Black |
| Commands causing printing | CR, LF, FF |
| 8th bit | Ignore (7-bit) |
| Custom characters | hard=cleared, soft=saved |
| Top of form | hard=current head pos, soft=unchanged |

---

## 15. Internal Geometry (emulator constants)

Renderer/parser work in an internal dot grid:

| Constant | Value | Meaning |
|---|---|---|
| `DPI` | 480 | internal horizontal resolution |
| `DOT_W` | DPI/120 = 4 | draft half-dot width unit |
| `DOT_V` | DPI/72 ≈ 6.667 | vertical wire spacing |
| `_gfxDotW` | DPI / pitch-density | graphics column width |
| Renderer `DOT_PX` | 1 | screen px per internal dot |
| `VSTRETCH` | 120/72 ≈ 1.667 | vertical stretch to square the cell |
| `DOT_H_PX` | 2 | dot height in px |
| rows | 9 | print-head wires |

`CPI` advance: `Math.round(DPI / cpi[pitch])`, ×2 when double-width.
Carriage `velocity = pitchDots × cps`; `cps` retuned by `VirtualHead.setCps()` on
every effective-quality change so faster fonts genuinely print quicker.

---

## 16. Emulation Status / TODO

- ✅ Font select + draft-incompatibility rule + per-quality cps carriage timing.
- ✅ Underline / bold / half-height / super / subscript / double-width render.
- ✅ Native `ESC G/S/g/V` graphics with ASCII-decimal counts; bit 7 = bottom dot
  (Fig 8-1). All eight pitch densities (`ESC n/N/E/e/q/Q/p/P`, 72–160 dpi) +
  `ESC F` dot-column head placement counted in the active pitch's density.
- ✅ `ESC Y` freed for stop-underline (no graphics collision).
- ✅ Colour `ESC K 0-6` incl. secondaries + multiply overprint; bold/colour half-speed.
- ✅ Custom downloaded chars: `ESC I` load + `ESC '`/`ESC *` select + `ESC $` off, rendered.
- ✅ Line spacing fixed to IW-II: `ESC A` 6 lpi / `ESC B` 8 lpi / `ESC T nn` n/144".
- ✅ Page length `ESC H`, left margin `ESC L`, head place `ESC F`, repeats `ESC R`/`ESC V`.
- ✅ Selectable **form length** (11" / 12" / 14" / A4) via window + `ESC H`. Width is
  fixed at 8" printable — the IW-II has no paper-size concept, only form length.
- ✅ Removed Epson-isms (`ESC C` form-length, `ESC A n` n/144 spacing) — IW-II opcodes only.
- ⬜ Proportional ROM not plumbed — `ESC p/P` flag-only, renders fixed-width.
- ⬜ NLQ font ROM not transcribed — falls back to correspondence shapes.
- ⬜ Horizontal tabs (`ESC ( / ) / u`, CTRL-I) and reverse feed (`ESC r`) not modelled.
- ⬜ `ESC D/Z` software-switch family (slash-zero, 8th-bit, language sets) not modelled.
- ⬜ 144-dpi two-pass vertical graphics not modelled.
- ✅ All eight pitches incl. extended/semicondensed (`ESC n` / `ESC e`) — text
  advance + graphics density. (Proportional ROM widths still pending, above.)
