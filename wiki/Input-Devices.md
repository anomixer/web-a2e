# Input Devices

The emulator supports keyboard, joystick/paddle, and mouse input, matching the input capabilities of a real Apple IIe. It also provides text selection and clipboard paste features that bridge the gap between the host system and the emulated machine.

## Table of Contents

- [Keyboard](#keyboard)
- [Text Paste](#text-paste)
- [Text Selection and Copy](#text-selection-and-copy)
- [Joystick and Paddles](#joystick-and-paddles)
- [Mouse](#mouse)
- [Mobile Input](#mobile-input)

## Keyboard

### Key Mapping

The emulator translates browser keycodes to Apple II ASCII codes in real time. All key translation is handled by the C++ core, supporting the full US keyboard layout.

**Modifier keys:**

| Host Key | Apple II Function |
|----------|-------------------|
| Alt (Option) | Open Apple button |
| Meta (Cmd/Win) | Closed Apple button |
| Shift | Shift (uppercase, shifted symbols) |
| Ctrl | Control (generates control characters Ctrl+A through Ctrl+Z) |
| Caps Lock | Uppercase letters (matches Apple II behavior) |

**Special keys:**

| Host Key | Apple II Key |
|----------|-------------|
| Enter | Return ($0D) |
| Backspace | Delete / Left arrow ($08) |
| Escape | Escape ($1B) |
| Tab | Tab ($09) |
| Space | Space ($20) |
| Left Arrow | Left arrow ($08) |
| Right Arrow | Right arrow ($15) |
| Up Arrow | Up arrow ($0B) |
| Down Arrow | Down arrow ($0A) |

**Letters and numbers:**

- Letters A-Z are translated to lowercase by default and converted to uppercase when Shift or Caps Lock is active
- Number keys 0-9 map directly to their ASCII equivalents
- All standard US punctuation keys are supported, including their shifted variants

### Focus

The emulator captures keyboard input when the screen canvas has focus. Click on the emulator screen to give it focus. When focus is on other UI elements (debug windows, menus, etc.), keyboard input goes to those elements instead of the emulator.

### Browser Shortcut Passthrough

The emulator prevents default browser behavior for keys that would interfere with the emulation (Backspace, Tab, Space, arrow keys) when the canvas has focus. Standard browser shortcuts like Ctrl+R (refresh) are allowed through.

## Text Paste

You can paste text from the clipboard into the emulator using **Ctrl+V** (or **Cmd+V** on macOS). The pasted text is converted character by character to Apple II key codes and fed into the emulator at an accelerated rate.

### How Paste Works

1. The clipboard text is read and each character is converted to an Apple II key code
2. The emulation speed is temporarily increased to 8x normal to process the paste quickly
3. Characters are fed to the emulator one at a time, waiting for the keyboard ready flag between each keypress
4. When the paste completes, the emulation speed returns to normal

### Programmatic Text Input

The paste system is also used internally by features like the BASIC Program Viewer to load programs. The `queueTextInput()` API accepts text with configurable speed multiplier and completion callbacks.

### Canceling a Paste

If a paste operation is in progress, it can be cancelled programmatically. The paste queue is cleared and the emulation speed is restored immediately.

## Text Selection and Copy

The emulator supports selecting and copying text directly from the Apple II screen when it is in text mode (40-column or 80-column).

### Selecting Text

1. Click and drag on the emulator screen to select a range of characters
2. The selection is highlighted with a semi-transparent overlay
3. Selection works correctly with CRT shader effects (curvature, overscan, margins) -- the mouse position is mapped through the same transforms as the display

### Copying Text

- Press **Ctrl+C** (or **Cmd+C** on macOS) to copy the selected text to the clipboard
- A brief green flash confirms the copy
- Right-click on a selection to open a context menu with **Copy** and **Select All** options

### Select All

Use the right-click context menu's **Select All** option to select the entire 24-line screen. This works in both 40-column and 80-column modes.

### Clearing a Selection

- Press **Escape** to clear the current selection
- Click without dragging to clear the selection
- Selections are only available in text mode -- switching to a graphics mode clears any active selection

### How Text is Read

The C++ core handles reading screen memory and converting Apple II character codes to Unicode text. The selection coordinates (row/column) are passed to the WASM function `_readScreenText()`, which reads the appropriate page of screen memory (main or aux for 80-column mode) and decodes the characters.

## Joystick and Paddles

The Apple IIe supports two analog paddles (or one joystick with two axes) and up to three buttons. The emulator provides a virtual joystick window for mouse-based control.

### Virtual Joystick Window

Open the **Joystick** window from the **Input** menu. The window contains:

- **Joystick area** -- A square pad with a draggable knob. Drag the knob to set the X and Y axis values (0-255 range, with 128 at center).
- **X/Y values** -- Numeric readout of the current paddle values
- **Button 0 and Button 1** -- Click and hold to press the corresponding Apple II button
- **Center button** -- Resets the knob to the center position (128, 128)

### Knob Behavior

- Click and drag the knob to move it
- Click anywhere in the joystick area to jump the knob to that position
- When you release the mouse button, the knob snaps back to center
- Paddle values update in real time as you drag

### Paddle Values

The joystick knob position maps to Apple II paddle values:

| Position | Paddle Value |
|----------|-------------|
| Top-left | X=0, Y=0 |
| Center | X=128, Y=128 |
| Bottom-right | X=255, Y=255 |

The paddle values are sent to the emulator via the `_setPaddleValue()` WASM function and are read by Apple II software through the standard paddle I/O addresses (`$C064`-`$C067`).

## Mouse

The emulator supports the Apple Mouse Interface Card, providing mouse input to compatible software. The mouse uses the browser's Pointer Lock API for relative movement tracking.

### Enabling the Mouse

The Apple Mouse Card must be installed in an expansion slot (typically slot 4). See [[Expansion-Slots]] for configuration.

### Engaging Mouse Capture

To start using the mouse with the emulator:

1. Hold **Alt** (Option) and **click** on the emulator screen
2. The browser enters pointer lock mode and mouse movement is captured
3. Mouse movement deltas are sent to the emulated mouse card
4. Left mouse button clicks are forwarded as Apple mouse button presses

### Releasing Mouse Capture

Press **Escape** to exit pointer lock mode. This is standard browser behavior for the Pointer Lock API.

### Mouse Movement

While pointer lock is active, the browser sends relative movement deltas (not absolute positions). These deltas are forwarded to the WASM emulator via `_mouseMove(dx, dy)`, and the mouse card firmware translates them into Apple II mouse coordinates through the standard screen-hole protocol.

## Mobile Input

On mobile and touch devices, the emulator provides a modified input experience:

### Mobile Keyboard

When a mobile device is detected (touch capability + mobile user agent or small screen), the emulator creates a hidden text input field. Tapping the emulator screen focuses this hidden input, which triggers the on-screen keyboard.

- Regular character input is captured from the hidden input field and forwarded to the emulator
- Special keys (Backspace, Enter, Escape, Tab) are handled through keydown events
- Autocomplete, autocapitalize, autocorrect, and spellcheck are all disabled to prevent interference

### Mobile Detection

The emulator detects mobile devices using a combination of:
- Touch capability (`ontouchstart` or `maxTouchPoints`)
- Mobile user agent string matching
- Small screen width (800px or less)

See also: [[Keyboard-Shortcuts]], [[Expansion-Slots]]
