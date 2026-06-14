# Apple ImageWriter I — Operating Cheatsheet

Source: *Imagewriter I User's Manual — Part I (Reference)*, Apple Computer.
Local PDF: `~/Documents/Apple_II/Apple II Books/Imagewriter I User's Manual - Part I.pdf`
(French Part II: `.../ImageWriter I User's Manual - Part II (French).pdf`)

The IW1 (1983) is the monochrome predecessor of the IW2 (1985). Its ESC command
**letters are identical** to the IW2's — the IW2 is a backward-compatible
superset that *added* colour, half-height, super/subscript, NLQ, MouseText.
For emulation, **IW1 = IW2 minus those additions, at a slower single speed.**

## Defining differences vs ImageWriter II

| Trait              | ImageWriter I            | ImageWriter II           |
| ------------------ | ------------------------ | ------------------------ |
| Colour ribbon      | **None — black only**    | 4-band (K/Y/M/C) + overlay secondaries |
| `ESC K` colour     | **not a command**        | colour select 0–6        |
| Print speed        | **120 cps @ 10 cpi**     | 250 (draft) / 180 (corr) / 45 (NLQ) cps |
| Print qualities    | **single font**          | draft / correspondence / NLQ (`ESC a`,`ESC m/M`) |
| Half-height `ESC w/W` | **no**                | yes (Table 4-10)         |
| Super/subscript `ESC x/y/z` | **no**          | yes (Table 4-11)         |
| MouseText `ESC &`  | **no** (pre-MouseText)   | yes (maps $40–$5F)       |
| Default pitch      | **Elite (12 cpi)**       | Pica (10 cpi)            |

Everything else (pitches, graphics, custom chars, line spacing, tabs,
bidirectional, auto-LF) is shared.

## Physical / timing specs (Appendix E)

- **Print method:** dot matrix, logic seek (line by line), bidirectional default.
- **Head:** single vertical column of **9 wires** (dot-strikers).
- **Char matrix:** standard up to **7 wide × 8 high**; custom (downloaded) up to
  **16 wide × 8 high**.
- **Vertical dot spacing:** **1/72 inch** (72 dpi vertical).
- **Speed:** **120 cps** at 10 cpi; **72 lines/minute**. One speed — no quality tiers.
- **Line length:** **8 inches** max printable.
- **Paper width:** 3 to 10 inches; up to 4-part multipart forms.
- **Line spacing:** **1/144" to 99/144"**, in 1/144" steps (`ESC T nn`, nn=01–99).
- **Paper feed:** forward AND reverse (`ESC f` / `ESC r`). Stepper motor,
  max 10 line-feeds/sec at 6 lpi.
- **Character set:** 96 ASCII + 25 European-language characters.

## Power-on defaults (Appendix B, "Printer Standard Instructions")

| Function          | Default                       |
| ----------------- | ----------------------------- |
| Character pitch   | **Elite (12 cpi)** (DIP 1-6 closed, 1-7 open) |
| Proportional spacing | 1 dot width                |
| Underlining       | off                           |
| Boldface          | off                           |
| Headline (2× wide)| off                           |
| Head motion       | **Bidirectional**             |
| Line feed pitch   | **6 lines per inch**          |
| Optional line feed| disabled                      |
| Line feed direction | forward                     |
| Left margin       | character position 0          |
| Horizontal tabs   | cleared                       |
| Vertical tabs     | every 6 lines                 |

## Horizontal pitch ↔ graphics density (Appendix E table)

Each character pitch sets BOTH text advance and the **graphics dot density**
used by every `ESC G/S/g/V/F` command. Fixed pitches:

| Pitch          | ESC code | cpi  | chars/line | graphics dpi |
| -------------- | -------- | ---- | ---------- | ------------ |
| Extended       | `ESC n`  | 9    | 72         | **72**       |
| Pica           | `ESC N`  | 10   | 80         | **80**       |
| Elite *(dflt)* | `ESC E`  | 12   | 96         | **96**       |
| Semicondensed  | `ESC e`  | 13.4 | 107        | **107**      |
| Condensed      | `ESC q`  | 15   | 120        | **120**      |
| Ultracondensed | `ESC Q`  | 17   | 136        | **136**      |
| Pica proportional   | `ESC p` | var | var      | **144**      |
| Elite proportional  | `ESC P` | var | var      | **160**      |

Max graphics resolution = **160 dpi** (elite proportional) → 23,040 dots/in².
(72 dpi extended = 5,184 dots/in².) Internal emulator canvas is 480 dpi
(LCM of 80/120/160) so every density lands on integer dot widths.

## Command set (Appendix B)

### Character pitch
- `ESC n` extended 9 cpi · `ESC N` pica 10 · `ESC E` elite 12 ·
  `ESC e` semicond 13.4 · `ESC q` condensed 15 · `ESC Q` ultracond 17
- `ESC p` pica proportional · `ESC P` elite proportional
- `ESC s n` set inter-char spacing in proportional mode, n=0–9 dots
- `ESC _ n` set dots between proportional chars, n=1–6

### Style
- `ESC !` boldface on · `ESC "` boldface off
- `ESC X` underline on · `ESC Y` underline off (underline does NOT slow printing)
- `CTRL-N` headline (double-width) on · `CTRL-O` off
- `ESC R nnn c` print char c nnn times · `CTRL-H c` backspace then print c

### Fonts (custom / downloaded)
- `ESC -` max custom width 8 dots · `ESC +` max width 16 dots
- `ESC I` … `CTRL-D` load custom char(s); width code `A..P` = 1..16 cols (top 8
  wires), `a..p` = 1..16 cols (bottom 8 wires)
- `ESC '` use custom font (low ASCII) · `ESC *` custom font (high ASCII) ·
  `ESC $` back to normal font

### Direction / line feed
- `ESC >` left-to-right only (unidirectional) · `ESC <` bidirectional
- `ESC A` 6 lpi · `ESC B` 8 lpi · `ESC T nn` line distance nn/144" (nn=01–99)
- `ESC f` forward line feed · `ESC r` reverse line feed
- `ESC l 1` enable optional LF · `ESC l 0` disable
- `CTRL-_ n` feed n blank lines (n = '1'..'9',':',';','<','=','>','?' → 1–15)
- `CTRL-L` (FF) feed to next top-of-form

### Page / margins / tabs
- `ESC L nnn` set left margin to column nnn
- `ESC v` set top-of-form to current position · `GS 0` (29 48) reset vtabs + TOF
- `ESC O` paper-error detector off · `ESC o` on
- `ESC (` set htab line · `ESC u` add one htab · `ESC )` clear selected htabs ·
  `ESC 0` clear all tabs · `CTRL-I` (HT) go to next tab
- `CTRL-]` form/vtab control (`A@` set TOF, `C@` set BOF, `A@ CTRL-^` set next-form TOF)

### Mode / 8th bit / EOL / reset
- `ESC Z @CTRL-@` end-of-line at CR only · `ESC D @CTRL-@` EOL at CR/VT/FF/HT/CTRL-_
- `ESC Z CTRL-@ 2` recognise 8th data bit · `ESC D CTRL-@ 2` ignore 8th bit
- `ESC Z _CTRL-@` no LF at buffer overflow · `ESC D _CTRL-@` LF at overflow
- `CTRL-X` cancel all unprinted text
- `ESC c` software reset (restore standard instructions; custom chars survive)

### Graphics (column-oriented bit image)
- `ESC G nnnn` print nnnn data bytes, each = one 8-dot column (bit 0 top, bit 7
  bottom). nnnn = 4 ASCII digits, leading zeros required.
- `ESC S nnnn` identical to `ESC G`
- `ESC g nnn` print nnn groups of 8 bytes (nnn × 8 columns)
- `ESC V nnnn c` print column byte c repeated nnnn times
- `ESC F nnnn` move head nnnn dot positions from the left margin (counts in the
  current pitch's graphics density, same as graphics columns)

DIP defaults: SW1-4 page length 66/72 lines; SW1-5 8th-bit; SW1-8 auto-LF-after-CR;
SW2 = serial baud / XON-XOFF vs DTR. (`ESC` codes override DIP.)
