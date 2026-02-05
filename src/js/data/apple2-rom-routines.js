/*
 * apple2-rom-routines.js - Apple IIe ROM routine reference data
 *
 * Common Monitor, Applesoft, and DOS ROM entry points with documentation
 */

export const ROM_ROUTINES = [
  // ============================================================================
  // Character I/O
  // ============================================================================
  {
    name: "COUT",
    address: 0xFDED,
    category: "Character I/O",
    description: "Output character to current output device (screen by default)",
    inputs: [
      { register: "A", description: "Character to output (high bit set for normal)" }
    ],
    outputs: [],
    preserves: ["X", "Y"],
    clobbers: ["A"],
    example: `         LDA  #$C1        ;'A' with high bit
         JSR  COUT`
  },
  {
    name: "COUT1",
    address: 0xFDF0,
    category: "Character I/O",
    description: "Output character, setting high bit automatically",
    inputs: [
      { register: "A", description: "Character to output (high bit will be set)" }
    ],
    outputs: [],
    preserves: ["X", "Y"],
    clobbers: ["A"],
    example: `         LDA  #'A'        ;No need to set high bit
         JSR  COUT1`
  },
  {
    name: "CROUT",
    address: 0xFD8E,
    category: "Character I/O",
    description: "Output carriage return (move cursor to start of next line)",
    inputs: [],
    outputs: [],
    preserves: ["X", "Y"],
    clobbers: ["A"],
    example: `         JSR  CROUT       ;New line`
  },
  {
    name: "RDKEY",
    address: 0xFD0C,
    category: "Character I/O",
    description: "Read character from keyboard, waiting for keypress",
    inputs: [],
    outputs: [
      { register: "A", description: "Character read (high bit set)" }
    ],
    preserves: ["X", "Y"],
    clobbers: ["A"],
    example: `         JSR  RDKEY       ;Wait for key
         CMP  #$8D        ;Return pressed?`
  },
  {
    name: "GETLN",
    address: 0xFD6A,
    category: "Character I/O",
    description: "Get line of input from keyboard into input buffer at $200",
    inputs: [],
    outputs: [
      { register: "X", description: "Length of input string" }
    ],
    preserves: ["Y"],
    clobbers: ["A", "X"],
    notes: "Input stored at $200-$2FF, terminated by $8D",
    example: `         JSR  GETLN       ;Get input
         STX  LENGTH      ;Save length`
  },

  // ============================================================================
  // Screen Control
  // ============================================================================
  {
    name: "HOME",
    address: 0xFC58,
    category: "Screen",
    description: "Clear screen and move cursor to top-left corner",
    inputs: [],
    outputs: [],
    preserves: [],
    clobbers: ["A", "X", "Y"],
    example: `         JSR  HOME        ;Clear screen`
  },
  {
    name: "VTAB",
    address: 0xFC22,
    category: "Screen",
    description: "Move cursor to row specified in A",
    inputs: [
      { register: "A", description: "Row number (1-24)" }
    ],
    outputs: [],
    preserves: ["X", "Y"],
    clobbers: ["A"],
    example: `         LDA  #12         ;Row 12
         JSR  VTAB`
  },
  {
    name: "CLREOL",
    address: 0xFC9C,
    category: "Screen",
    description: "Clear from cursor to end of line",
    inputs: [],
    outputs: [],
    preserves: ["X", "Y"],
    clobbers: ["A"],
    example: `         JSR  CLREOL      ;Clear to EOL`
  },
  {
    name: "CLREOP",
    address: 0xFC42,
    category: "Screen",
    description: "Clear from cursor to end of page (bottom of screen)",
    inputs: [],
    outputs: [],
    preserves: [],
    clobbers: ["A", "X", "Y"],
    example: `         JSR  CLREOP      ;Clear to bottom`
  },

  // ============================================================================
  // Numeric Output
  // ============================================================================
  {
    name: "PRBYTE",
    address: 0xFDDA,
    category: "Numeric",
    description: "Print accumulator as two hex digits",
    inputs: [
      { register: "A", description: "Byte value to print" }
    ],
    outputs: [],
    preserves: ["X", "Y"],
    clobbers: ["A"],
    example: `         LDA  VALUE
         JSR  PRBYTE      ;Print as hex`
  },
  {
    name: "PRNTAX",
    address: 0xF941,
    category: "Numeric",
    description: "Print A and X registers as four hex digits (A high, X low)",
    inputs: [
      { register: "A", description: "High byte" },
      { register: "X", description: "Low byte" }
    ],
    outputs: [],
    preserves: ["Y"],
    clobbers: ["A", "X"],
    example: `         LDA  #>ADDR      ;High byte
         LDX  #<ADDR      ;Low byte
         JSR  PRNTAX      ;Print address`
  },
  {
    name: "PRBLNK",
    address: 0xF948,
    category: "Numeric",
    description: "Print a space character",
    inputs: [],
    outputs: [],
    preserves: ["X", "Y"],
    clobbers: ["A"],
    example: `         JSR  PRBLNK      ;Print space`
  },

  // ============================================================================
  // Sound
  // ============================================================================
  {
    name: "BELL",
    address: 0xFBE4,
    category: "Sound",
    description: "Sound the bell (beep)",
    inputs: [],
    outputs: [],
    preserves: ["X", "Y"],
    clobbers: ["A"],
    example: `         JSR  BELL        ;Beep!`
  },
  {
    name: "WAIT",
    address: 0xFCA8,
    category: "Utility",
    description: "Delay for (26 + 27*A + 5*A*A) / 2 microseconds",
    inputs: [
      { register: "A", description: "Delay count (larger = longer delay)" }
    ],
    outputs: [],
    preserves: ["X", "Y"],
    clobbers: ["A"],
    notes: "A=1 ~14µs, A=$FF ~66ms",
    example: `         LDA  #$FF        ;Maximum delay
         JSR  WAIT`
  },

  // ============================================================================
  // Paddle / Joystick
  // ============================================================================
  {
    name: "PREAD",
    address: 0xFB1E,
    category: "Input",
    description: "Read paddle/joystick position",
    inputs: [
      { register: "X", description: "Paddle number (0-3)" }
    ],
    outputs: [
      { register: "Y", description: "Paddle position (0-255)" }
    ],
    preserves: [],
    clobbers: ["A", "X", "Y"],
    example: `         LDX  #0          ;Paddle 0
         JSR  PREAD
         STY  POSITION`
  },
  {
    name: "PREAD4",
    address: 0xFB21,
    category: "Input",
    description: "Read paddle without resetting - use after PREAD for paddle 1-3",
    inputs: [
      { register: "X", description: "Paddle number (1-3)" }
    ],
    outputs: [
      { register: "Y", description: "Paddle position (0-255)" }
    ],
    preserves: [],
    clobbers: ["A", "X", "Y"],
    example: `         LDX  #0
         JSR  PREAD       ;Read paddle 0
         LDX  #1
         JSR  PREAD4      ;Read paddle 1`
  },

  // ============================================================================
  // Device Control
  // ============================================================================
  {
    name: "SETKBD",
    address: 0xFE89,
    category: "Device",
    description: "Set keyboard as current input device",
    inputs: [],
    outputs: [],
    preserves: ["X", "Y"],
    clobbers: ["A"],
    example: `         JSR  SETKBD      ;Input from keyboard`
  },
  {
    name: "SETVID",
    address: 0xFE93,
    category: "Device",
    description: "Set 40-column screen as current output device",
    inputs: [],
    outputs: [],
    preserves: ["X", "Y"],
    clobbers: ["A"],
    example: `         JSR  SETVID      ;Output to screen`
  },
  {
    name: "SETINV",
    address: 0xFE80,
    category: "Screen",
    description: "Set inverse text mode",
    inputs: [],
    outputs: [],
    preserves: ["X", "Y"],
    clobbers: ["A"],
    example: `         JSR  SETINV      ;Inverse on
         JSR  COUT
         JSR  SETNORM     ;Normal`
  },
  {
    name: "SETNORM",
    address: 0xFE84,
    category: "Screen",
    description: "Set normal text mode",
    inputs: [],
    outputs: [],
    preserves: ["X", "Y"],
    clobbers: ["A"],
    example: `         JSR  SETNORM     ;Normal text`
  },

  // ============================================================================
  // Graphics
  // ============================================================================
  {
    name: "HLINE",
    address: 0xF819,
    category: "Lo-Res Graphics",
    description: "Draw horizontal line in lo-res graphics",
    inputs: [
      { register: "Y", description: "Starting X coordinate" },
      { register: "A", description: "Y coordinate" },
      { register: "$2C", description: "Ending X coordinate (H2)" }
    ],
    outputs: [],
    preserves: [],
    clobbers: ["A", "X", "Y"],
    notes: "Color set by $30 (COLOR)",
    example: `         LDA  #10         ;Y=10
         LDY  #5          ;X1=5
         STA  $2C         ;X2=35
         LDA  #35
         JSR  HLINE`
  },
  {
    name: "VLINE",
    address: 0xF828,
    category: "Lo-Res Graphics",
    description: "Draw vertical line in lo-res graphics",
    inputs: [
      { register: "Y", description: "X coordinate" },
      { register: "A", description: "Starting Y coordinate" },
      { register: "$2D", description: "Ending Y coordinate (V2)" }
    ],
    outputs: [],
    preserves: [],
    clobbers: ["A", "X", "Y"],
    notes: "Color set by $30 (COLOR)",
    example: `         LDY  #20         ;X=20
         LDA  #0          ;Y1=0
         STA  $2D
         LDA  #39         ;Y2=39
         JSR  VLINE`
  },
  {
    name: "PLOT",
    address: 0xF800,
    category: "Lo-Res Graphics",
    description: "Plot single point in lo-res graphics",
    inputs: [
      { register: "Y", description: "X coordinate (0-39)" },
      { register: "A", description: "Y coordinate (0-47)" }
    ],
    outputs: [],
    preserves: ["X"],
    clobbers: ["A", "Y"],
    notes: "Color set by $30 (COLOR)",
    example: `         LDA  #$0F        ;Color = white
         STA  $30
         LDY  #20         ;X=20
         LDA  #24         ;Y=24
         JSR  PLOT`
  },
  {
    name: "SETCOL",
    address: 0xF864,
    category: "Lo-Res Graphics",
    description: "Set lo-res color",
    inputs: [
      { register: "A", description: "Color (0-15)" }
    ],
    outputs: [],
    preserves: ["X", "Y"],
    clobbers: ["A"],
    notes: "Colors: 0=black,1=magenta,2=dk blue,3=purple,4=dk green,5=grey1,6=med blue,7=lt blue,8=brown,9=orange,10=grey2,11=pink,12=green,13=yellow,14=aqua,15=white",
    example: `         LDA  #1          ;Magenta
         JSR  SETCOL`
  },

  // ============================================================================
  // Hi-Res Graphics
  // ============================================================================
  {
    name: "HCLR",
    address: 0xF3F2,
    category: "Hi-Res Graphics",
    description: "Clear current hi-res page to black",
    inputs: [],
    outputs: [],
    preserves: [],
    clobbers: ["A", "X", "Y"],
    notes: "Clears page set by $E6 (HGR page: $20=page1, $40=page2)",
    example: `         JSR  HCLR        ;Clear hi-res`
  },
  {
    name: "HPOSN",
    address: 0xF411,
    category: "Hi-Res Graphics",
    description: "Position hi-res cursor without plotting",
    inputs: [
      { register: "Y", description: "X coordinate low byte" },
      { register: "X", description: "X coordinate high byte (0-1)" },
      { register: "A", description: "Y coordinate (0-191)" }
    ],
    outputs: [],
    preserves: [],
    clobbers: ["A", "X", "Y"],
    example: `         LDY  #<140       ;X=140
         LDX  #>140
         LDA  #96         ;Y=96
         JSR  HPOSN`
  },
  {
    name: "HPLOT",
    address: 0xF457,
    category: "Hi-Res Graphics",
    description: "Plot point at current hi-res cursor position",
    inputs: [],
    outputs: [],
    preserves: [],
    clobbers: ["A", "X", "Y"],
    notes: "Call HPOSN first to set position. Color set by HCOLOR ($1C)",
    example: `         JSR  HPOSN       ;Set position
         JSR  HPLOT       ;Plot point`
  },
  {
    name: "HLIN",
    address: 0xF53A,
    category: "Hi-Res Graphics",
    description: "Draw line from current position to new position",
    inputs: [
      { register: "Y", description: "End X coordinate low byte" },
      { register: "X", description: "End X coordinate high byte" },
      { register: "A", description: "End Y coordinate" }
    ],
    outputs: [],
    preserves: [],
    clobbers: ["A", "X", "Y"],
    notes: "Call HPOSN first for start position",
    example: `         JSR  HPOSN       ;Start position
         LDY  #<200       ;End X
         LDX  #>200
         LDA  #150        ;End Y
         JSR  HLIN        ;Draw line`
  },

  // ============================================================================
  // Memory / Utility
  // ============================================================================
  {
    name: "MOVE",
    address: 0xFE2C,
    category: "Memory",
    description: "Move memory block from source to destination",
    inputs: [
      { register: "$3C-$3D", description: "Source start address (A1L/A1H)" },
      { register: "$3E-$3F", description: "Source end address (A2L/A2H)" },
      { register: "$42-$43", description: "Destination address (A4L/A4H)" }
    ],
    outputs: [],
    preserves: [],
    clobbers: ["A", "X", "Y"],
    notes: "Moves bytes from A1 to A2, storing at A4",
    example: `         LDA  #<SRC
         STA  $3C
         LDA  #>SRC
         STA  $3D         ;Source start
         LDA  #<SRCEND
         STA  $3E
         LDA  #>SRCEND
         STA  $3F         ;Source end
         LDA  #<DEST
         STA  $42
         LDA  #>DEST
         STA  $43         ;Destination
         LDY  #0
         JSR  MOVE`
  },

  // ============================================================================
  // String Output (Applesoft)
  // ============================================================================
  {
    name: "STROUT",
    address: 0xDB3A,
    category: "Applesoft",
    description: "Print null-terminated string",
    inputs: [
      { register: "A", description: "String address low byte" },
      { register: "Y", description: "String address high byte" }
    ],
    outputs: [],
    preserves: [],
    clobbers: ["A", "X", "Y"],
    notes: "String must be null-terminated ($00). High bit handled automatically.",
    example: `         LDA  #<MSG
         LDY  #>MSG
         JSR  STROUT
MSG      ASC  "HELLO"
         DFB  $00`
  },

  // ============================================================================
  // Keyboard
  // ============================================================================
  {
    name: "KEYIN",
    address: 0xFD1B,
    category: "Character I/O",
    description: "Check if key is pressed (non-blocking)",
    inputs: [],
    outputs: [
      { register: "A", description: "Key code if pressed, or no change" },
      { register: "C flag", description: "Set if key pressed" }
    ],
    preserves: ["X", "Y"],
    clobbers: ["A"],
    notes: "Use BCS to branch if key pressed",
    example: `CHKKEY   JSR  KEYIN
         BCC  NOKEY       ;No key pressed
         ; Key in A`
  },

  // ============================================================================
  // Monitor Entry Points
  // ============================================================================
  {
    name: "MONZ",
    address: 0xFF69,
    category: "Monitor",
    description: "Enter monitor (warm start)",
    inputs: [],
    outputs: [],
    preserves: [],
    clobbers: ["A", "X", "Y"],
    notes: "Returns to monitor prompt",
    example: `         JSR  MONZ        ;Enter monitor`
  },
  {
    name: "RESET",
    address: 0xFA62,
    category: "Monitor",
    description: "Perform cold reset",
    inputs: [],
    outputs: [],
    preserves: [],
    clobbers: ["A", "X", "Y"],
    notes: "WARNING: This resets the machine!",
    example: `         JMP  RESET       ;Cold reset`
  }
];

// Categories for filtering
export const ROM_CATEGORIES = [
  "All",
  "Character I/O",
  "Screen",
  "Numeric",
  "Sound",
  "Input",
  "Device",
  "Lo-Res Graphics",
  "Hi-Res Graphics",
  "Memory",
  "Utility",
  "Applesoft",
  "Monitor"
];

// Get routines by category
export function getRoutinesByCategory(category) {
  if (category === "All") return ROM_ROUTINES;
  return ROM_ROUTINES.filter(r => r.category === category);
}

// Search routines by name or description
export function searchRoutines(query) {
  const q = query.toLowerCase();
  return ROM_ROUTINES.filter(r =>
    r.name.toLowerCase().includes(q) ||
    r.description.toLowerCase().includes(q) ||
    r.category.toLowerCase().includes(q)
  );
}
