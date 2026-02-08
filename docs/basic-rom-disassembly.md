(back to project page)

Applesoft Disassembly
**************************************\*\*\*\***************************************
_ Disassembly of Applesoft II BASIC, as found in the Apple ][+. _ \* \*
_ This project is a conversion of Bob Sander-Cederlof's "S-C DocuMentor: _
_ Applesoft", with minor edits. See http://www.txbobsc.com/scsc/scdocumentor/ _
_ for the original disassembly listing. _ \* \*
_ Changes from the original include conversion of comments to mixed-case, _
_ correction of typographical errors, and general reformatting to fit _
_ SourceGen's constraints. Some text has been changed to fit personal _
_ preference (e.g. PTR vs. PNTR for "pointer"). In cases where an operand _
_ expression is too complex, the original can be found in the comment field _
_ (look for occurrences of "should be"). It is likely some errors have been _
_ introduced; please consult the original material when in doubt. _ \* \*
_ Applesoft is copyright by Microsoft and Apple Computer. _
_ Apple ][+ ROM image obtained from AppleWin (Apple2_Plus.rom). _
**************************************\*\*\*\***************************************
_ Project created by Andy McFadden. Requires 6502bench SourceGen v1.10. _
_ Created 2019/10/27 _
_ Last updated 2025/08/03 _
**************************************\*\*\*\***************************************
ERR_NOFOR .eq $00 {const}
TKN_CNTR .eq $0f {const}
ERR_SYNTAX .eq $10 {const}
ERR_NOGOSUB .eq $16 {const}
ERR_NODATA .eq $2a {const}
ERR_ILLQTY .eq $35 {const}
ERR_OVERFLOW .eq $45 {const}
P_OR .eq $46 {const}
ERR_MEMFULL .eq $4d {const}
P_AND .eq $50 {const}
ERR_UNDEFSTAT .eq $5a {const}
P_REL .eq $64 {const}
ERR_BADSUBS .eq $6b {const}
ERR_REDIMD .eq $78 {const}
P_ADD .eq $79 {const}
P_MUL .eq $7b {const}
P_PWR .eq $7d {const}
P_NEQ .eq $7f {const}
TOK_FOR .eq $81 {const}
TOK_DATA .eq $83 {const}
ERR_ZERODIV .eq $85 {const}
ERR_ILLDIR .eq $95 {const}
ERR_BADTYPE .eq $a3 {const}
TOK_GOTO .eq $ab {const}
ERR_STRLONG .eq $b0 {const}
TOK_GOSUB .eq $b0 {const}
TOK_REM .eq $b2 {const}
TOK_PRINT .eq $ba {const}
ERR_FRMCPX .eq $bf {const}
TOK_TAB .eq $c0 {const}
TOK_TO .eq $c1 {const}
TOK_FN .eq $c2 {const}
TOK_SPC .eq $c3 {const}
TOK_THEN .eq $c4 {const}
TOK_AT .eq $c5 {const}
TOK_NOT .eq $c6 {const}
TOK_STEP .eq $c7 {const}
TOK_PLUS .eq $c8 {const}
TOK_MINUS .eq $c9 {const}
TOK_GREATER .eq $cf {const}
TOK_EQUAL .eq $d0 {const}
ERR_CANTCONT .eq $d2 {const}
TOK_SGN .eq $d2 {const}
TOK_SCRN .eq $d7 {const}
ERR_UNDEFFUNC .eq $e0 {const}
GOWARM .eq $00 {addr/3} ;gets "JMP RESTART" (3b)
GOSTROUT .eq $03 {addr/3} ;gets "JMP STROUT" (3b)
USRVEC .eq $0a {addr/3} ;USR() command vector (initially $E199) (3b)
CHARAC .eq $0d ;used by string utility
ENDCHR .eq $0e ;used by string utility
EOL_PNTR .eq $0f
DIMFLG .eq $10
VALTYP .eq $11 {addr/2} ;flag for last FAC operation ($00=num, $FF=str) (2b)
DATAFLG .eq $13
SUBFLG .eq $14
INPUTFLG .eq $15
CPRMASK .eq $16
HGR_SHAPE .eq $1a {addr/2} ;(2b)
HGR_BITS .eq $1c ;hi-res color mask
HGR_COUNT .eq $1d ;hi-res high-order byte of step for line
MON_CH .eq $24 ;cursor horizontal displacement
HBASL .eq $26 ;base address for hi-res drawing (low)
HBASH .eq $27 ;base address for hi-res drawing (high)
MON_H2 .eq $2c ;right end of horizontal line drawn by HLINE
MON_V2 .eq $2d ;bottom of vertical line drawn by VLINE
HMASK .eq $30 ;hi-res graphics on-the-fly bit mask
MON_INVFLAG .eq $32 ;text mask (255=normal, 127=flash, 63=inv)
MON_PROMPT .eq $33 ;prompt character, used by GETLN
MON_A1L .eq $3c ;general purpose
MON_A1H .eq $3d ;general purpose
MON_A2L .eq $3e ;general purpose
MON_A2H .eq $3f ;general purpose
LINNUM .eq $50 {addr/2} ;line number (2b)
TEMPPT .eq $52 {addr/2} ;temporary point (2b)
TEMPST .eq $55
INDEX .eq $5e {addr/2} ;temp (stack) pointer for moving strings (2b)
DEST .eq $60 {addr/2} ;pointer (2b)
RESULT .eq $62 {addr/5} ;(5b)
TXTTAB .eq $67 {addr/2} ;pointer to start of Applesoft program (2b)
VARTAB .eq $69 {addr/2} ;pointer to start of Applesoft variables (2b)
ARYTAB .eq $6b {addr/2} ;pointer to start of Applesoft array space (2b)
STREND .eq $6d {addr/2} ;pointer to end of numeric storage (2b)
FRETOP .eq $6f {addr/2} ;pointer to end of string storage (2b)
FRESPC .eq $71 {addr/2} ;temporary pointer for string-storage routines (2b)
MEMSIZE .eq $73 {addr/2} ;HIMEM (2b)
CURLIN .eq $75 {addr/2} ;current line number (2b)
OLDIN .eq $77 {addr/2} ;last line executed (2b)
OLDTEXT .eq $79 {addr/2} ;old text pointer (2b)
DATLIN .eq $7b {addr/2} ;current lin # from which data is being read (2b)
DATPTR .eq $7d {addr/2} ;points to mem from which data is being read (2b)
INPTR .eq $7f {addr/2} ;(2b)
VARNAM .eq $81 {addr/2} ;holds last-used variable's name (2b)
VARPNT .eq $83 {addr/2} ;pointer to last-used variable's value (2b)
FORPNT .eq $85 {addr/2} ;general pointer (2b)
TXPSV .eq $87 {addr/2} ;pointer (2b)
CPRTYP .eq $89
FNCNAM .eq $8a {addr/2}
TEMP3 .eq $8a ;fp math register (5b)
DSCPTR .eq $8c {addr/2} ;pointer (2b)
DSCLEN .eq $8f
JMPADRS .eq $90 {addr/3} ;jump address; $90 is set to $4C (3b)
LENGTH .eq $91
TEMP1 .eq $93 ;fp math register
HIGHDS .eq $94 {addr/2} ;block copy pointer (2b)
HIGHTR .eq $96 {addr/2} ;block copy pointer (2b)
TEMP2 .eq $98 ;fp math register
TMPEXP .eq $99
EXPON .eq $9a
LOWTR .eq $9b {addr/2} ;general pointer (2b)
FAC .eq $9d {addr/6} ;floating point accumulator (6b)
FAC_SIGN .eq $a2 ;single byte sign of FAC
SERLEN .eq $a3
SHIFT_SIGN_EXT .eq $a4
ARG .eq $a5 {addr/6} ;secondary floating point accumulator (6b)
ARG_SIGN .eq $aa
STRNG1 .eq $ab {addr/2} ;pointer to a string (2b)
STRNG2 .eq $ad {addr/2} ;pointer to a string (2b)
PRGEND .eq $af {addr/2} ;pointer to end of program (2b)
CHRGET .eq $b1 ;get next character or Applesoft token
CHRGOT .eq $b7 ;get next, but don't advance TXTPTR
TXTPTR .eq $b8 {addr/2} ;points at next char or token (2b)
RNDSEED .eq $c9 {addr/5} ;floating point random number (5b)
HGR_DX .eq $d0 {addr/2} ;(2b)
HGR_DY .eq $d2
HGR_QUAD .eq $d3
HGR_E .eq $d4 {addr/2} ;(2b)
LOCK .eq $d6 ;set to $80 to auto-run
ERRFLG .eq $d8 ;$80 if onerr active
ERRLIN .eq $da {addr/2} ;(2b)
ERRPOS .eq $dc {addr/2} ;(2b)
ERRNUM .eq $de
ERRSTK .eq $df
HGR_X .eq $e0 {addr/2} ;(2b)
HGR_Y .eq $e2
HGR_COLOR .eq $e4
HGR_HORIZ .eq $e5 ;byte index from GBASH,L
HGR_PAGE .eq $e6 ;hi-res page to draw on ($20 or $40)
HGR_SCALE .eq $e7 ;hi-res graphics scale factor
HGR_SHAPE_PTR .eq $e8 {addr/2} ;hi-res shape table pointer (2b)
HGR_COLLISIONS .eq $ea ;collision counter
FIRST .eq $f0
SPEEDZ .eq $f1 ;controls text output speed
TRCFLG .eq $f2
FLASH_BIT .eq $f3 ;=$40 for flash, else =$00
TXTPSV .eq $f4 {addr/2} ;(2b)
CURLSV .eq $f6 {addr/2} ;(2b)
REMSTK .eq $f8 ;stack ptr before each STT
HGR_ROTATION .eq $f9
STACK .eq $0100 {addr/256}
INPUT_BUFFER .eq $0200 {addr/256}
AMPERV .eq $03f5 {addr/3} ;JMP to function that handles Applesoft '&' cmds (3b)
KBD .eq $c000 ;R last key pressed + 128
TXTCLR .eq $c050 ;RW display graphics
MIXCLR .eq $c052 ;RW display full screen
MIXSET .eq $c053 ;RW display split screen
TXTPAGE1 .eq $c054 ;RW display page 1
TXTPAGE2 .eq $c055 ;RW display page 2 (or read/write aux mem)
LORES .eq $c056 ;RW display lo-res graphics
HIRES .eq $c057 ;RW display hi-res graphics
MON_PLOT .eq $f800 ;lo-res plot at X=Y-reg, Y=Acc
MON_HLINE .eq $f819 ;lo-res horiz line at Y=Acc with X from $2c
MON_VLINE .eq $f828 ;lo-res vert line at X=Y-reg and Y from Acc to $2b
MON_SETCOL .eq $f864 ;set lo-res color to Acc
MON_SCRN .eq $f871 ;load Acc with lo-res value at Y=Acc, X=X-reg
MON_PREAD .eq $fb1e ;read paddle specifed by X-reg, return in Y-reg
MON_SETTXT .eq $fb39 ;set screen to text mode
MON_SETGR .eq $fb40 ;set screen to graphics mode
MON_TABV .eq $fb5b ;place cursor at line (A-reg) and column (CH)
MON_HOME .eq $fc58 ;clear screen and reset text output to top-left
MON_WAIT .eq $fca8 ;delay for (26 + 27*Acc + 5*(Acc\*Acc))/2 cycles
MON_RD2BIT .eq $fcfa ;cassette read
MON_RDKEY .eq $fd0c ;read key from input device via $38-39
MON_GETLN .eq $fd6a ;get a line of input
MON_COUT .eq $fded ;print Acc to output device via $36-37
MON_INPORT .eq $fe8b ;set char input handler to slot in A-reg
MON_OUTPORT .eq $fe95 ;set char output handler to slot in A-reg
MON_WRITE .eq $fecd ;write data to cassette
MON_READ .eq $fefd ;read data from cassette
MON_READ2 .eq $ff02 ;read data from cassette

                   * Branch table for tokens.  Entries are (address-1).
                                   .addrs  $d000

d000: 6f d8 TOKEN_ADDR_TABLE .dd2 END-1 ;token $80
d002: 65 d7                        .dd2    FOR-1
d004: f8 dc                        .dd2    NEXT-1
d006: 94 d9                        .dd2    DATA-1
d008: b1 db                        .dd2    INPUT-1
d00a: 30 f3                        .dd2    DEL-1
d00c: d8 df                        .dd2    DIM-1
d00e: e1 db                        .dd2    READ-1
d010: 8f f3                        .dd2    GR-1
d012: 98 f3                        .dd2    TEXT-1
d014: e4 f1                        .dd2    PR_NUMBER-1
d016: dd f1                        .dd2    IN_NUMBER-1
d018: d4 f1                        .dd2    CALL-1
d01a: 24 f2                        .dd2    PLOT-1
d01c: 31 f2                        .dd2    HLIN-1
d01e: 40 f2                        .dd2    VLIN-1
d020: d7 f3                        .dd2    HGR2-1            ;$90
d022: e1 f3                        .dd2    HGR-1
d024: e8 f6                        .dd2    HCOLOR-1
d026: fd f6                        .dd2    HPLOT-1
d028: 68 f7                        .dd2    DRAW-1
d02a: 6e f7                        .dd2    XDRAW-1
d02c: e6 f7                        .dd2    HTAB-1
d02e: 57 fc                        .dd2    MON_HOME-1        ;HOME command goes directly to monitor routine
d030: 20 f7                        .dd2    ROT-1
d032: 26 f7                        .dd2    SCALE-1
d034: 74 f7                        .dd2    SHLOAD-1
d036: 6c f2                        .dd2    TRACE-1
d038: 6e f2                        .dd2    NOTRACE-1
d03a: 72 f2                        .dd2    NORMAL-1
d03c: 76 f2                        .dd2    INVERSE-1
d03e: 7f f2                        .dd2    FLASH-1
d040: 4e f2                        .dd2    COLOR-1           ;$a0
d042: 6a d9 .dd2 POP-1
d044: 55 f2 .dd2 VTAB-1
d046: 85 f2 .dd2 HIMEM-1
d048: a5 f2 .dd2 LOMEM-1
d04a: ca f2 .dd2 ONERR-1
d04c: 17 f3 .dd2 RESUME-1
d04e: bb f3 .dd2 RECALL-1
d050: 9e f3 .dd2 STORE-1
d052: 61 f2 .dd2 SPEED-1
d054: 45 da .dd2 LET-1
d056: 3d d9 .dd2 GOTO-1
d058: 11 d9 .dd2 RUN-1
d05a: c8 d9 .dd2 IF-1
d05c: 48 d8 .dd2 RESTORE-1
d05e: f4 03 .dd2 AMPERV-1 ;jumps directly to the page 3 vector
d060: 20 d9 .dd2 GOSUB-1 ;$b0
d062: 6a d9                        .dd2    POP-1             ;RETURN and POP go to same handler
d064: db d9                        .dd2    REM-1
d066: 6d d8                        .dd2    STOP-1
d068: eb d9                        .dd2    ONGOTO-1
d06a: 83 e7                        .dd2    WAIT-1
d06c: c8 d8                        .dd2    LOAD-1
d06e: af d8                        .dd2    SAVE-1
d070: 12 e3                        .dd2    DEF-1
d072: 7a e7                        .dd2    POKE-1
d074: d4 da                        .dd2    PRINT-1
d076: 95 d8                        .dd2    CONT-1
d078: a4 d6                        .dd2    LIST-1
d07a: 69 d6                        .dd2    CLEAR-1
d07c: 9f db                        .dd2    GET-1
d07e: 48 d6                        .dd2    NEW-1             ;$bf
_ No direct pointer for $C0-C7: TAB(, TO, FN, SPC(, THEN, AT, NOT, STEP. Math
_ operation addresses are below, in MATHTBL. \*
_ Additional functions follow. Addresses are the actual entry points,
_ unadjusted.
d080: 90 eb .dd2 SGN ;$d2
d082: 23 ec                        .dd2    INT
d084: af eb                        .dd2    ABS
d086: 0a 00                        .dd2    USRVEC            ;jumps directly to zero-page vector
d088: de e2                        .dd2    FRE
d08a: 12 d4                        .dd2    ERROR             ;SCRN(
d08c: cd df                        .dd2    PDL
d08e: ff e2                        .dd2    POS
d090: 8d ee                        .dd2    SQR
d092: ae ef                        .dd2    RND
d094: 41 e9                        .dd2    LOG
d096: 09 ef                        .dd2    EXP
d098: ea ef                        .dd2    COS
d09a: f1 ef                        .dd2    SIN
d09c: 3a f0                        .dd2    TAN               ;$e0
d09e: 9e f0 .dd2 ATN
d0a0: 64 e7 .dd2 PEEK
d0a2: d6 e6 .dd2 LEN
d0a4: c5 e3 .dd2 STR
d0a6: 07 e7 .dd2 VAL
d0a8: e5 e6 .dd2 ASC
d0aa: 46 e6 .dd2 CHRSTR
d0ac: 5a e6 .dd2 LEFTSTR
d0ae: 86 e6 .dd2 RIGHTSTR
d0b0: 91 e6 .dd2 MIDSTR ;$ea
                   * Math operator branch table
                   *
                   * One-byte precedence code, followed by two-byte address - 1
                   *
                   * P_OR   $46  "or" is lowest precedence
                   * P_AND  $50
                   * P_REL  $64  relational operators
                   * P_ADD  $79  binary + and -
                   * P_MUL  $7B  * and /
                   * P_PWR  $7D  exponentiation
                   * P_NEQ  $7F  unary - and comparison =
d0b2: 79           MATHTBL         .dd1    P_ADD
d0b3: c0 e7                        .dd2    FADDT-1           ;$C8 +
d0b5: 79 .dd1 P_ADD
d0b6: a9 e7 .dd2 FSUBT-1 ;$C9 -
d0b8: 7b                           .dd1    P_MUL
d0b9: 81 e9                        .dd2    FMULTT-1          ;$CA _
d0bb: 7b .dd1 P_MUL
d0bc: 68 ea .dd2 FDIVT-1 ;$CB /
d0be: 7d                           .dd1    P_PWR
d0bf: 96 ee                        .dd2    FPWRT-1           ;$CC ^
d0c1: 50 .dd1 P_AND
d0c2: 54 df .dd2 AND-1 ;$CD AND
d0c4: 46                           .dd1    P_OR
d0c5: 4e df                        .dd2    OR-1              ;$CE OR
d0c7: 7f M_NEG .dd1 P_NEQ
d0c8: cf ee .dd2 NEGOP-1 ;$CF >
d0ca: 7f           M_EQU           .dd1    P_NEQ
d0cb: 97 de                        .dd2    EQUOP-1           ;$D0 =
d0cd: 64 M_REL .dd1 P_REL
d0ce: 64 df .dd2 RELOPS-1 ;$D1 <
**************************************\*\*\*\***************************************
_ Token name table _
**************************************\*\*\*\***************************************
d0d0: 45 4e c4 TOKEN_NAME_TABLE .dstr “END” ;$80
d0d3: 46 4f d2                     .dstr   “FOR”             ;$81
d0d6: 4e 45 58 d4                  .dstr   “NEXT”            ;$82
d0da: 44 41 54 c1                  .dstr   “DATA”            ;$83
d0de: 49 4e 50 55+                 .dstr   “INPUT”           ;$84
d0e3: 44 45 cc                     .dstr   “DEL”             ;$85
d0e6: 44 49 cd                     .dstr   “DIM”             ;$86
d0e9: 52 45 41 c4                  .dstr   “READ”            ;$87
d0ed: 47 d2                        .dstr   “GR”              ;$88
d0ef: 54 45 58 d4                  .dstr   “TEXT”            ;$89
d0f3: 50 52 a3                     .dstr   “PR#”             ;$8a
d0f6: 49 4e a3                     .dstr   “IN#”             ;$8b
d0f9: 43 41 4c cc                  .dstr   “CALL”            ;$8c
d0fd: 50 4c 4f d4                  .dstr   “PLOT”            ;$8d
d101: 48 4c 49 ce                  .dstr   “HLIN”            ;$8e
d105: 56 4c 49 ce                  .dstr   “VLIN”            ;$8f
d109: 48 47 52 b2                  .dstr   “HGR2”            ;$90
d10d: 48 47 d2                     .dstr   “HGR”             ;$91
d110: 48 43 4f 4c+                 .dstr   “HCOLOR=”         ;$92
d117: 48 50 4c 4f+                 .dstr   “HPLOT”           ;$93
d11c: 44 52 41 d7                  .dstr   “DRAW”            ;$94
d120: 58 44 52 41+                 .dstr   “XDRAW”           ;$95
d125: 48 54 41 c2                  .dstr   “HTAB”            ;$96
d129: 48 4f 4d c5                  .dstr   “HOME”            ;$97
d12d: 52 4f 54 bd                  .dstr   “ROT=”            ;$98
d131: 53 43 41 4c+                 .dstr   “SCALE=”          ;$99
d137: 53 48 4c 4f+                 .dstr   “SHLOAD”          ;$9a
d13d: 54 52 41 43+                 .dstr   “TRACE”           ;$9b
d142: 4e 4f 54 52+                 .dstr   “NOTRACE”         ;$9c
d149: 4e 4f 52 4d+                 .dstr   “NORMAL”          ;$9d
d14f: 49 4e 56 45+                 .dstr   “INVERSE”         ;$9e
d156: 46 4c 41 53+                 .dstr   “FLASH”           ;$9f
d15b: 43 4f 4c 4f+                 .dstr   “COLOR=”          ;$a0
d161: 50 4f d0 .dstr “POP” ;$a1
d164: 56 54 41 c2                  .dstr   “VTAB”            ;$a2
d168: 48 49 4d 45+ .dstr “HIMEM:” ;$a3
d16e: 4c 4f 4d 45+                 .dstr   “LOMEM:”          ;$a4
d174: 4f 4e 45 52+ .dstr “ONERR” ;$a5
d179: 52 45 53 55+                 .dstr   “RESUME”          ;$a6
d17f: 52 45 43 41+ .dstr “RECALL” ;$a7
d185: 53 54 4f 52+                 .dstr   “STORE”           ;$a8
d18a: 53 50 45 45+ .dstr “SPEED=” ;$a9
d190: 4c 45 d4                     .dstr   “LET”             ;$aa
d193: 47 4f 54 cf .dstr “GOTO” ;$ab
d197: 52 55 ce                     .dstr   “RUN”             ;$ac
d19a: 49 c6 .dstr “IF” ;$ad
d19c: 52 45 53 54+                 .dstr   “RESTORE”         ;$ae
d1a3: a6 .dd1 ‘&’ | $80         ;$af
d1a4: 47 4f 53 55+ .dstr “GOSUB” ;$b0
d1a9: 52 45 54 55+                 .dstr   “RETURN”          ;$b1
d1af: 52 45 cd .dstr “REM” ;$b2
d1b2: 53 54 4f d0                  .dstr   “STOP”            ;$b3
d1b6: 4f ce .dstr “ON” ;$b4
d1b8: 57 41 49 d4                  .dstr   “WAIT”            ;$b5
d1bc: 4c 4f 41 c4 .dstr “LOAD” ;$b6
d1c0: 53 41 56 c5                  .dstr   “SAVE”            ;$b7
d1c4: 44 45 c6 .dstr “DEF” ;$b8
d1c7: 50 4f 4b c5                  .dstr   “POKE”            ;$b9
d1cb: 50 52 49 4e+ .dstr “PRINT” ;$ba
d1d0: 43 4f 4e d4                  .dstr   “CONT”            ;$bb
d1d4: 4c 49 53 d4 .dstr “LIST” ;$bc
d1d8: 43 4c 45 41+                 .dstr   “CLEAR”           ;$bd
d1dd: 47 45 d4 .dstr “GET” ;$be
d1e0: 4e 45 d7                     .dstr   “NEW”             ;$bf
d1e3: 54 41 42 a8 .dstr “TAB(” ;$c0
d1e7: 54 cf                        .dstr   “TO”              ;$c1
d1e9: 46 ce .dstr “FN” ;$c2
d1eb: 53 50 43 a8                  .dstr   “SPC(”            ;$c3
d1ef: 54 48 45 ce .dstr “THEN” ;$c4
d1f3: 41 d4                        .dstr   “AT”              ;$c5
d1f5: 4e 4f d4 .dstr “NOT” ;$c6
d1f8: 53 54 45 d0                  .dstr   “STEP”            ;$c7
d1fc: ab .dd1 ‘+’ | $80         ;$c8
d1fd: ad .dd1 ‘-’ | $80         ;$c9
d1fe: aa .dd1 ‘_’ | $80         ;$ca
d1ff: af .dd1 ‘/’ | $80         ;$cb
d200: de .dd1 ‘^’ | $80         ;$cc
d201: 41 4e c4 .dstr “AND” ;$cd
d204: 4f d2                        .dstr   “OR”              ;$ce
d206: be .dd1 ‘>’ | $80         ;$cf
d207: bd .dd1 ‘=’ | $80         ;$d0
d208: bc .dd1 ‘<’ | $80         ;$d1
d209: 53 47 ce .dstr “SGN” ;$d2
d20c: 49 4e d4                     .dstr   “INT”             ;$d3
d20f: 41 42 d3 .dstr “ABS” ;$d4
d212: 55 53 d2                     .dstr   “USR”             ;$d5
d215: 46 52 c5 .dstr “FRE” ;$d6
d218: 53 43 52 4e+                 .dstr   “SCRN(”           ;$d7
d21d: 50 44 cc .dstr “PDL” ;$d8
d220: 50 4f d3                     .dstr   “POS”             ;$d9
d223: 53 51 d2 .dstr “SQR” ;$da
d226: 52 4e c4                     .dstr   “RND”             ;$db
d229: 4c 4f c7 .dstr “LOG” ;$dc
d22c: 45 58 d0                     .dstr   “EXP”             ;$dd
d22f: 43 4f d3 .dstr “COS” ;$de
d232: 53 49 ce                     .dstr   “SIN”             ;$df
d235: 54 41 ce .dstr “TAN” ;$e0
d238: 41 54 ce                     .dstr   “ATN”             ;$e1
d23b: 50 45 45 cb .dstr “PEEK” ;$e2
d23f: 4c 45 ce                     .dstr   “LEN”             ;$e3
d242: 53 54 52 a4 .dstr “STR$”            ;$e4
d246: 56 41 cc .dstr “VAL” ;$e5
d249: 41 53 c3                     .dstr   “ASC”             ;$e6
d24c: 43 48 52 a4 .dstr “CHR$”            ;$e7
d250: 4c 45 46 54+ .dstr “LEFT$”           ;$e8
d255: 52 49 47 48+ .dstr “RIGHT$”          ;$e9
d25b: 4d 49 44 a4 .dstr “MID$”            ;$ea
d25f: 00 .dd1 $00 ;end of token name table
**************************************\*\*\*\***************************************
_ Error messages _ \* \*
_ (The code uses error message constants that are defined by subtracting the _
_ start of the table from the address of the error. Currently no way to do _
_ that in SourceGen, so the constants are project symbols instead.) _
**************************************\*\*\*\***************************************
d260: 4e 45 58 54+ ERROR_MSGS .dstr “NEXT WITHOUT FOR”
d270: 53 59 4e 54+ .dstr “SYNTAX”
d276: 52 45 54 55+ .dstr “RETURN WITHOUT GOSUB”
d28a: 4f 55 54 20+ .dstr “OUT OF DATA”
d295: 49 4c 4c 45+ .dstr “ILLEGAL QUANTITY”
d2a5: 4f 56 45 52+ .dstr “OVERFLOW”
d2ad: 4f 55 54 20+ .dstr “OUT OF MEMORY”
d2ba: 55 4e 44 45+ .dstr “UNDEF'D STATEMENT”
d2cb: 42 41 44 20+ .dstr “BAD SUBSCRIPT”
d2d8: 52 45 44 49+ .dstr “REDIM'D ARRAY”
d2e5: 44 49 56 49+ .dstr “DIVISION BY ZERO”
d2f5: 49 4c 4c 45+ .dstr “ILLEGAL DIRECT”
d303: 54 59 50 45+ .dstr “TYPE MISMATCH”
d310: 53 54 52 49+ .dstr “STRING TOO LONG”
d31f: 46 4f 52 4d+ .dstr “FORMULA TOO COMPLEX”
d332: 43 41 4e 27+ .dstr “CAN'T CONTINUE”
d340: 55 4e 44 45+ .dstr “UNDEF'D FUNCTION”
d350: 20 45 52 52+ QT_ERROR .zstr “ ERROR”,$07
d358: 20 49 4e 20+ QT_IN .zstr “ IN ”
d35d: 0d 42 52 45+ QT_BREAK .zstr $0d,“BREAK”,$07

                   * Called by NEXT and FOR to scan through the stack for a frame with the same
                   * variable.
                   *
                   *   FORPNT = address of variable if FOR or NEXT
                   *          = $xxFF if called from RETURN
                   *            <<< BUG: should be $FFxx >>>
                   *
                   *   returns .NE. if variable not found,
                   *           X = stack ptr after skipping all frames
                   *
                   *           .EQ. if variable found
                   *           X = stack ptr of frame found

d365: ba GTFORPNT tsx
d366: e8 inx
d367: e8 inx
d368: e8 inx
d369: e8 inx
d36a: bd 01 01 LD36A lda STACK+1,x ;FOR frame here?
d36d: c9 81 cmp #TOK_FOR
d36f: d0 21 bne LD392 ;no
d371: a5 86 lda FORPNT+1 ;yes; NEXT with no variable?
d373: d0 0a bne LD37F ;no, variable specified
d375: bd 02 01 lda STACK+2,x ;yes, so use this frame
d378: 85 85 sta FORPNT
d37a: bd 03 01 lda STACK+3,x
d37d: 85 86 sta FORPNT+1
d37f: dd 03 01 LD37F cmp STACK+3,x ;is variable in this frame?
d382: d0 07 bne LD38B ;no
d384: a5 85 lda FORPNT ;look at 2nd byte too
d386: dd 02 01 cmp STACK+2,x ;same variable?
d389: f0 07 beq LD392 ;yes
d38b: 8a LD38B txa ;no, so try next frame (if any)
d38c: 18 clc ;18 bytes per frame
d38d: 69 12 adc #18
d38f: aa tax
d390: d0 d8 bne LD36A ;...always?
d392: 60 LD392 rts

                   * Move block of memory up
                   *
                   *   On entry:
                   *     (Y,A) = HIGHDS = destination end + 1
                   *     LOWTR = lowest address of source
                   *     HIGHTR = highest source address + 1

d393: 20 e3 d3 BLTU jsr REASON ;be sure (Y,A) < FRETOP
d396: 85 6d sta STREND ;new top of array storage
d398: 84 6e sty STREND+1
d39a: 38 BLTU2 sec
d39b: a5 96 lda HIGHTR ;compute # of bytes to be moved
d39d: e5 9b sbc LOWTR ; (from LOWTR through HIGHTR-1)
d39f: 85 5e sta INDEX ;partial page amount
d3a1: a8 tay
d3a2: a5 97 lda HIGHTR+1
d3a4: e5 9c sbc LOWTR+1
d3a6: aa tax ;# of whole pages in X-reg
d3a7: e8 inx
d3a8: 98 tya ;# bytes in partial page
d3a9: f0 23 beq LD3CE ;no partial page
d3ab: a5 96 lda HIGHTR ;back up HIGHTR # bytes in partial page
d3ad: 38 sec
d3ae: e5 5e sbc INDEX
d3b0: 85 96 sta HIGHTR
d3b2: b0 03 bcs LD3B7
d3b4: c6 97 dec HIGHTR+1
d3b6: 38 sec
d3b7: a5 94 LD3B7 lda HIGHDS ;back up highds # bytes in partial page
d3b9: e5 5e sbc INDEX
d3bb: 85 94 sta HIGHDS
d3bd: b0 08 bcs LD3C7
d3bf: c6 95 dec HIGHDS+1
d3c1: 90 04 bcc LD3C7 ;...always

d3c3: b1 96 LD3C3 lda (HIGHTR),y ;move the bytes
d3c5: 91 94 sta (HIGHDS),y
d3c7: 88 LD3C7 dey
d3c8: d0 f9 bne LD3C3 ;loop to end of this 256 bytes
d3ca: b1 96 lda (HIGHTR),y ;move one more byte
d3cc: 91 94 sta (HIGHDS),y
d3ce: c6 97 LD3CE dec HIGHTR+1 ;down to next block of 256
d3d0: c6 95 dec HIGHDS+1
d3d2: ca dex ;another block of 256 to move?
d3d3: d0 f2 bne LD3C7 ;yes
d3d5: 60 rts ;no, finished

                   * Check if enough room left on stack for FOR, GOSUB, or expression evaluation.

d3d6: 0a CHKMEM asl A
d3d7: 69 36 adc #54
d3d9: b0 35 bcs MEMERR ;...mem full err
d3db: 85 5e sta INDEX
d3dd: ba tsx
d3de: e4 5e cpx INDEX
d3e0: 90 2e bcc MEMERR ;...mem full err
d3e2: 60 rts

                   * Check if enough room between arrays and strings.
                   *
                   *   (Y,A) = addr arrays need to grow to

d3e3: c4 70 REASON cpy FRETOP+1 ;high byte
d3e5: 90 28 bcc LD40F ;plenty of room
d3e7: d0 04 bne LD3ED ;not enough, try garbage collection
d3e9: c5 6f cmp FRETOP ;low byte
d3eb: 90 22 bcc LD40F ;enough room \*
d3ed: 48 LD3ED pha ;save (Y,A), TEMP1, and TEMP2
d3ee: a2 09 ldx #9 ;(should be #FAC-TEMP1-1)
d3f0: 98 tya
d3f1: 48 LD3F1 pha
d3f2: b5 93 lda TEMP1,x
d3f4: ca dex
d3f5: 10 fa bpl LD3F1
d3f7: 20 84 e4 jsr GARBAG ;make as much room as possible
d3fa: a2 f7 ldx #$f7 ;(should be #TEMP1-FAC+1) restore TEMP1 and TEMP2
d3fc: 68 LD3FC pla ; and (Y,A)
d3fd: 95 9d sta FAC,x
d3ff: e8 inx
d400: 30 fa bmi LD3FC
d402: 68 pla
d403: a8 tay
d404: 68 pla ;did we find enough room?
d405: c4 70 cpy FRETOP+1 ;high byte
d407: 90 06 bcc LD40F ;yes, at least a page
d409: d0 05 bne MEMERR ;no, mem full err
d40b: c5 6f cmp FRETOP ;low byte
d40d: b0 01 bcs MEMERR ;no, mem full err
d40f: 60 LD40F rts ;yes, return

d410: a2 4d MEMERR ldx #ERR_MEMFULL
**************************************\*\*\*\***************************************
_ Handle an error _ \* \*
_ X = offset in error message table _
_ ERRFLG > 128 if "on err" turned on _
_ CURLIN+1 = $ff if in direct mode _ \* \*
_ Entry for SCRN( statement in func table points here. _
**************************************\*\*\*\***************************************
d412: 24 d8 ERROR bit ERRFLG ;ON ERR turned on?
d414: 10 03 bpl LD419 ;no
d416: 4c e9 f2 jmp HANDLERR ;yes

d419: 20 fb da LD419 jsr CRDO ;print <return>
d41c: 20 5a db jsr OUTQUES ;print "?"
d41f: bd 60 d2 LD41F lda ERROR*MSGS,x
d422: 48 pha ;print message
d423: 20 5c db jsr OUTDO
d426: e8 inx
d427: 68 pla
d428: 10 f5 bpl LD41F
d42a: 20 83 d6 jsr STKINI ;fix stack, et. al.
d42d: a9 50 lda #<QT_ERROR ;print " ERROR" and bell
d42f: a0 d3 ldy #>QT_ERROR
* Print string at (Y,A)
* Print current line # unless in direct mode
* Fall into warm restart
d431: 20 3a db PRINT_ERROR_LINNUM jsr STROUT ;print string at (Y,A)
d434: a4 76 ldy CURLIN+1 ;running, or direct?
d436: c8 iny
d437: f0 03 beq RESTART ;was $ff, so direct mode
d439: 20 19 ed jsr INPRT ;running, so print line number
**************************************\*\*\*\***************************************
* Warm restart entry \* \* \*
* Come here from monitor by Ctrl+C, 0G, 3D0G, or E003G. *
**************************************\*\*\*\***************************************
d43c: 20 fb da RESTART jsr CRDO ;print <return>
d43f: a2 dd ldx #‘]’ | $80        ;prompt character
d441: 20 2e d5                     jsr     INLIN2            ;read a line
d444: 86 b8                        stx     TXTPTR            ;set up CHRGET to scan the line
d446: 84 b9                        sty     TXTPTR+1
d448: 46 d8                        lsr     ERRFLG            ;clear flag
d44a: 20 b1 00                     jsr     CHRGET
d44d: aa                           tax
d44e: f0 ec                        beq     RESTART           ;empty line
d450: a2 ff                        ldx     #$ff ;$ff in hi-byte of CURLIN means
d452: 86 76 stx CURLIN+1 ; we are in direct mode
d454: 90 06 bcc NUMBERED_LINE ;CHRGET saw digit, numbered line
d456: 20 59 d5 jsr PARSE_INPUT_LINE ;no number, so parse it
d459: 4c 05 d8 jmp TRACE* ;and try executing it

                   * Handle numbered line.

d45c: a6 af NUMBERED_LINE ldx PRGEND ;squash variable table
d45e: 86 69 stx VARTAB
d460: a6 b0 ldx PRGEND+1
d462: 86 6a stx VARTAB+1
d464: 20 0c da jsr LINGET ;get line #
d467: 20 59 d5 jsr PARSE_INPUT_LINE ;and parse the input line
d46a: 84 0f sty EOL_PNTR ;save index to input buffer
d46c: 20 1a d6 jsr FNDLIN ;is this line # already in program?
d46f: 90 44 bcc PUT_NEW_LINE ;no
d471: a0 01 ldy #$01              ;yes, so delete it
d473: b1 9b                        lda     (LOWTR),y         ;LOWPTR points at line
d475: 85 5f                        sta     INDEX+1           ;get high byte of forward ptr
d477: a5 69                        lda     VARTAB
d479: 85 5e                        sta     INDEX
d47b: a5 9c                        lda     LOWTR+1
d47d: 85 61                        sta     DEST+1
d47f: a5 9b                        lda     LOWTR
d481: 88                           dey
d482: f1 9b                        sbc     (LOWTR),y
d484: 18                           clc
d485: 65 69                        adc     VARTAB
d487: 85 69                        sta     VARTAB
d489: 85 60                        sta     DEST
d48b: a5 6a                        lda     VARTAB+1
d48d: 69 ff                        adc     #$ff
d48f: 85 6a sta VARTAB+1
d491: e5 9c sbc LOWTR+1
d493: aa tax
d494: 38 sec
d495: a5 9b lda LOWTR
d497: e5 69 sbc VARTAB
d499: a8 tay
d49a: b0 03 bcs LD49F
d49c: e8 inx
d49d: c6 61 dec DEST+1
d49f: 18 LD49F clc
d4a0: 65 5e adc INDEX
d4a2: 90 03 bcc LD4A7
d4a4: c6 5f dec INDEX+1
d4a6: 18 clc
_
d4a7: b1 5e LD4A7 lda (INDEX),y ;move higher lines of program
d4a9: 91 60 sta (DEST),y ;down over the deleted line
d4ab: c8 iny
d4ac: d0 f9 bne LD4A7
d4ae: e6 5f inc INDEX+1
d4b0: e6 61 inc DEST+1
d4b2: ca dex
d4b3: d0 f2 bne LD4A7
_
d4b5: ad 00 02 PUT_NEW_LINE lda INPUT_BUFFER ;any characters after line #?
d4b8: f0 38 beq FIX_LINKS ;no, so nothing to insert
d4ba: a5 73 lda MEMSIZE ;yes, so make room and insert line
d4bc: a4 74 ldy MEMSIZE+1 ;wipe string area clean
d4be: 85 6f sta FRETOP
d4c0: 84 70 sty FRETOP+1
d4c2: a5 69 lda VARTAB ;set up BLTU subroutine
d4c4: 85 96 sta HIGHTR ;insert new line
d4c6: 65 0f adc EOL_PNTR
d4c8: 85 94 sta HIGHDS
d4ca: a4 6a ldy VARTAB+1
d4cc: 84 97 sty HIGHTR+1
d4ce: 90 01 bcc LD4D1
d4d0: c8 iny
d4d1: 84 95 LD4D1 sty HIGHDS+1
d4d3: 20 93 d3 jsr BLTU ;make room for the line
d4d6: a5 50 lda LINNUM ;put line number in line image
d4d8: a4 51 ldy LINNUM+1
d4da: 8d fe 01 sta INPUT_BUFFER-2
d4dd: 8c ff 01 sty INPUT_BUFFER-1
d4e0: a5 6d lda STREND
d4e2: a4 6e ldy STREND+1
d4e4: 85 69 sta VARTAB
d4e6: 84 6a sty VARTAB+1
d4e8: a4 0f ldy EOL_PNTR
_ Copy line into program.
d4ea: b9 fb 01 LD4EA lda INPUT_BUFFER-5,y
d4ed: 88 dey
d4ee: 91 9b sta (LOWTR),y
d4f0: d0 f8 bne LD4EA
_ Clear all variables. Re-establish all forward links.
d4f2: 20 65 d6 FIX_LINKS jsr SETPTRS ;clear all variables
d4f5: a5 67 lda TXTTAB ;point index at start of program
d4f7: a4 68 ldy TXTTAB+1
d4f9: 85 5e sta INDEX
d4fb: 84 5f sty INDEX+1
d4fd: 18 clc
d4fe: a0 01 LD4FE ldy #$01 ;hi-byte of next forward ptr
d500: b1 5e lda (INDEX),y ;end of program yet?
d502: d0 0b bne LD50F ;no, keep going
d504: a5 69 lda VARTAB ;yes
d506: 85 af sta PRGEND
d508: a5 6a lda VARTAB+1
d50a: 85 b0 sta PRGEND+1
d50c: 4c 3c d4 jmp RESTART

d50f: a0 04 LD50F ldy #$04 ;find end of this line
d511: c8 LD511 iny ;(note maximum length < 256)
d512: b1 5e lda (INDEX),y
d514: d0 fb bne LD511
d516: c8 iny ;compute address of next line
d517: 98 tya
d518: 65 5e adc INDEX
d51a: aa tax
d51b: a0 00 ldy #$00 ;store forward ptr in this line
d51d: 91 5e sta (INDEX),y
d51f: a5 5f lda INDEX+1
d521: 69 00 adc #$00 ;A-reg != $ff, so this always clears carry
d523: c8 iny
d524: 91 5e sta (INDEX),y
d526: 86 5e stx INDEX
d528: 85 5f sta INDEX+1
d52a: 90 d2 bcc LD4FE ;...always

                   * Read a line, and strip off sign bits.

d52c: a2 80 INLIN ldx #$80 ;null prompt
d52e: 86 33 INLIN2 stx MON_PROMPT
d530: 20 6a fd jsr MON_GETLN
d533: e0 ef cpx #239 ;maximum line length
d535: 90 02 bcc LD539
d537: a2 ef ldx #239 ;truncate at 239 chars
d539: a9 00 LD539 lda #$00 ;mark end of line with $00 byte
d53b: 9d 00 02 sta INPUT_BUFFER,x
d53e: 8a txa
d53f: f0 0b beq LD54C ;null input line
d541: bd ff 01 LD541 lda INPUT_BUFFER-1,x ;drop sign bits
d544: 29 7f and #$7f
d546: 9d ff 01 sta INPUT_BUFFER-1,x
d549: ca dex
d54a: d0 f5 bne LD541
d54c: a9 00 LD54C lda #$00 ;(Y,X) points at buffer - 1
d54e: a2 ff ldx #<INPUT_BUFFER+255
d550: a0 01 ldy #(>INPUT_BUFFER)-1
d552: 60 rts

d553: 20 0c fd INCHR jsr MON_RDKEY ;**_ ought to be BIT $C010 _**
d556: 29 7f and #$7f
d558: 60 rts

                   * Tokenize the input line.

d559: a6 b8 PARSE_INPUT_LINE ldx TXTPTR ;index into unparsed line
d55b: ca dex ;prepare for INX at PARSE
d55c: a0 04 ldy #$04 ;index to parsed output line
d55e: 84 13 sty DATAFLG ;clear sign-bit of DATAFLG
d560: 24 d6 bit LOCK ;is this program locked?
d562: 10 08 bpl PARSE ;no, go ahead and parse the line
d564: 68 pla ;yes, ignore input and RUN
d565: 68 pla ; the program
d566: 20 65 d6 jsr SETPTRS ;clear all variables
d569: 4c d2 d7 jmp NEWSTT ;start running

d56c: e8 PARSE inx ;next input character
d56d: bd 00 02 LD56D lda INPUT_BUFFER,x
d570: 24 13 bit DATAFLG ;in a DATA statement?
d572: 70 04 bvs LD578 ;yes (DATAFLG = $49)
d574: c9 20 cmp #‘ ’ ;ignore blanks
d576: f0 f4 beq PARSE
d578: 85 0e LD578 sta ENDCHR
d57a: c9 22 cmp #‘"’ ;start of quotation?
d57c: f0 74 beq LD5F2
d57e: 70 4d bvs LD5CD ;branch if in DATA statement
d580: c9 3f cmp #‘?’ ;shorthand for PRINT?
d582: d0 04 bne LD588 ;no
d584: a9 ba lda #TOK_PRINT ;yes, replace with PRINT token
d586: d0 45 bne LD5CD ;...always

d588: c9 30 LD588 cmp #‘0’ ;is it a digit, colon, or semi-colon?
d58a: 90 04 bcc LD590 ;no, punctuation !"#$%&'()_+,-./
d58c: c9 3c cmp #‘<’ ;(should be #';'+1 )
d58e: 90 3d bcc LD5CD ;yes, not a token
_ Search token name table for match, starting with current char from input line.
d590: 84 ad LD590 sty STRNG2 ;save index to output line
d592: a9 d0 lda #<TOKEN_NAME_TABLE
d594: 85 9d sta FAC ;make ptr for search
d596: a9 cf lda #(>TOKEN_NAME_TABLE)-1
d598: 85 9e sta FAC+1
d59a: a0 00 ldy #$00 ;use Y-reg with FAC to address table
d59c: 84 0f sty TKN_CNTR ;holds current token - $80
d59e: 88 dey ;prepare for INY a few lines down
d59f: 86 b8 stx TXTPTR ;save position in input line
d5a1: ca dex ;prepare for INX a few lines down
d5a2: c8 LD5A2 iny ;advance pointer to token table
d5a3: d0 02 bne LD5A7 ;Y=Y+1 is enough
d5a5: e6 9e inc FAC+1 ;also need to bump the page
d5a7: e8 LD5A7 inx ;advance pointer to input line
d5a8: bd 00 02 LD5A8 lda INPUT_BUFFER,x ;next char from input line
d5ab: c9 20 cmp #‘ ’ ;this char a blank?
d5ad: f0 f8 beq LD5A7 ;yes, ignore all blanks
d5af: 38 sec ;no, compare to char in table
d5b0: f1 9d sbc (FAC),y ;same as next char of token name?
d5b2: f0 ee beq LD5A2 ;yes, continue matching
d5b4: c9 80 cmp #$80 ;maybe; was it same except for bit 7?
d5b6: d0 41 bne LD5F9 ;no, skip to next token
d5b8: 05 0f ora TKN_CNTR ;yes, end of token; get token #
d5ba: c9 c5 cmp #TOK_AT ;did we match AT?
d5bc: d0 0d bne LD5CB ;no, so no ambiguity
d5be: bd 01 02 lda INPUT_BUFFER+1,x ;AT could be ATN or "A TO"
d5c1: c9 4e cmp #‘N’ ;ATN has precedence over AT
d5c3: f0 34 beq LD5F9 ;it is ATN, find it the hard way
d5c5: c9 4f cmp #‘O’ ;TO has precedence over AT
d5c7: f0 30 beq LD5F9 ;it is "A TO", find it the hard way
d5c9: a9 c5 lda #TOK_AT ;not ATN or "A TO", so use AT
_ Store character or token in output line.
d5cb: a4 ad LD5CB ldy STRNG2 ;get index to output line in Y-reg
d5cd: e8 LD5CD inx ;advance input index
d5ce: c8 iny ;advance output index
d5cf: 99 fb 01 sta INPUT_BUFFER-5,y ;store char or token
d5d2: b9 fb 01 lda INPUT_BUFFER-5,y ;test for EOL or EOS
d5d5: f0 39 beq LD610 ;end of line
d5d7: 38 sec
d5d8: e9 3a sbc #‘:’ ;end of statement?
d5da: f0 04 beq LD5E0 ;yes, clear DATAFLG
d5dc: c9 49 cmp #TOK_DATA-58 ;(TOK_DATA - ':') DATA token?
d5de: d0 02 bne LD5E2 ;no, leave DATAFLG alone
d5e0: 85 13 LD5E0 sta DATAFLG ;DATAFLG = 0 or $83-$3a = $49
d5e2: 38 LD5E2 sec ;is it a REM token?
d5e3: e9 78 sbc #TOK_REM-58 ;(TOK_REM - ':')
d5e5: d0 86 bne LD56D ;no, continue parsing line
d5e7: 85 0e sta ENDCHR ;yes, clear literal flag
_ Handle literal (between quotes) or remark, by copying chars up to ENDCHR.
d5e9: bd 00 02 LD5E9 lda INPUT_BUFFER,x
d5ec: f0 df beq LD5CD ;end of line
d5ee: c5 0e cmp ENDCHR
d5f0: f0 db beq LD5CD ;found ENDCHR
d5f2: c8 LD5F2 iny ;next output char
d5f3: 99 fb 01 sta INPUT_BUFFER-5,y
d5f6: e8 inx ;next input char
d5f7: d0 f0 bne LD5E9 ;...always
_ Advance pointer to next token name.
d5f9: a6 b8 LD5F9 ldx TXTPTR ;get pointer to input line in X-reg
d5fb: e6 0f inc TKN_CNTR ;bump (token # - $80)
d5fd: b1 9d LD5FD lda (FAC),y ;scan through table for BIT7 = 1
d5ff: c8 iny ;next token one beyond that
d600: d0 02 bne LD604 ;...usually enough to bump Y-reg
d602: e6 9e inc FAC+1 ;next set of 256 token chars
d604: 0a LD604 asl A ;see if sign bit set on char
d605: 90 f6 bcc LD5FD ;no, more in this name
d607: b1 9d lda (FAC),y ;yes, at next name; end of table?
d609: d0 9d bne LD5A8 ;no, not end of table
d60b: bd 00 02 lda INPUT_BUFFER,x ;yes, so not a keyword
d60e: 10 bb bpl LD5CB ;...always, copy char as is
_ end of line
d610: 99 fd 01 LD610 sta INPUT_BUFFER-3,y ;store another 00 on end
d613: c6 b9 dec TXTPTR+1 ;set TXTPTR = INPUT_BUFFER - 1
d615: a9 ff lda #<INPUT_BUFFER+255
d617: 85 b8 sta TXTPTR
d619: 60 rts

                   * Search for line
                   *
                   *   LINNUM = line # to find
                   *   if not found: carry = 0
                   *                 LOWTR points at next line
                   *   if found:     carry = 1
                   *                 LOWTR points at line

d61a: a5 67 FNDLIN lda TXTTAB ;search from beginning of program
d61c: a6 68 ldx TXTTAB+1
d61e: a0 01 FL1 ldy #$01 ;search from (X,A)
d620: 85 9b sta LOWTR
d622: 86 9c stx LOWTR+1
d624: b1 9b lda (LOWTR),y
d626: f0 1f beq LD647 ;end of program, and not found
d628: c8 iny
d629: c8 iny
d62a: a5 51 lda LINNUM+1
d62c: d1 9b cmp (LOWTR),y
d62e: 90 18 bcc RTS_1 ;if not found
d630: f0 03 beq LD635
d632: 88 dey
d633: d0 09 bne LD63E
d635: a5 50 LD635 lda LINNUM
d637: 88 dey
d638: d1 9b cmp (LOWTR),y
d63a: 90 0c bcc RTS_1 ;past line, not found
d63c: f0 0a beq RTS_1 ;if found
d63e: 88 LD63E dey
d63f: b1 9b lda (LOWTR),y
d641: aa tax
d642: 88 dey
d643: b1 9b lda (LOWTR),y
d645: b0 d7 bcs FL1 ;always

d647: 18 LD647 clc ;return carry=0
d648: 60 RTS_1 rts

                   ********************************************************************************
                   * NEW statement                                                                *
                   ********************************************************************************

d649: d0 fd NEW bne RTS_1 ;ignore if more to the statement
d64b: a9 00 SCRTCH lda #$00
d64d: 85 d6                        sta     LOCK
d64f: a8                           tay
d650: 91 67                        sta     (TXTTAB),y
d652: c8                           iny
d653: 91 67                        sta     (TXTTAB),y
d655: a5 67                        lda     TXTTAB
d657: 69 02                        adc     #$02              ;carry wasn't cleared, so NEW usually
d659: 85 69                        sta     VARTAB            ;  adds 3, whereas FP adds 2
d65b: 85 af                        sta     PRGEND
d65d: a5 68                        lda     TXTTAB+1
d65f: 69 00                        adc     #$00
d661: 85 6a                        sta     VARTAB+1
d663: 85 b0                        sta     PRGEND+1
                   *
d665: 20 97 d6     SETPTRS         jsr     STXTPT            ;set TXTPTR to TXTTAB - 1
d668: a9 00                        lda     #$00              ;(this could have been .dd1 $2C)
                   ********************************************************************************
                   * CLEAR statement                                                              *
                   ********************************************************************************
d66a: d0 2a        CLEAR           bne     RTS_2             ;ignore if not at end of statement
d66c: a5 73        CLEARC          lda     MEMSIZE           ;clear string area
d66e: a4 74                        ldy     MEMSIZE+1
d670: 85 6f                        sta     FRETOP
d672: 84 70                        sty     FRETOP+1
d674: a5 69                        lda     VARTAB            ;clear array area
d676: a4 6a                        ldy     VARTAB+1
d678: 85 6b                        sta     ARYTAB
d67a: 84 6c                        sty     ARYTAB+1
d67c: 85 6d                        sta     STREND            ;low end of free space
d67e: 84 6e                        sty     STREND+1
d680: 20 49 d8                     jsr     RESTORE           ;set DATA pointer to beginning
                   *
d683: a2 55        STKINI          ldx     #TEMPST
d685: 86 52                        stx     TEMPPT
d687: 68                           pla                       ;save return address
d688: a8                           tay
d689: 68                           pla
d68a: a2 f8                        ldx     #$f8 ;start stack at $f8
d68c: 9a txs ; leaving room for parsing lines
d68d: 48 pha ;restore return address
d68e: 98 tya
d68f: 48 pha
d690: a9 00 lda #$00
d692: 85 7a sta OLDTEXT+1
d694: 85 14 sta SUBFLG
d696: 60 RTS_2 rts

                   * Set TXTPTR to beginning of program.

d697: 18 STXTPT clc ;TXTPTR = TXTTAB - 1
d698: a5 67 lda TXTTAB
d69a: 69 ff adc #$ff
d69c: 85 b8                        sta     TXTPTR
d69e: a5 68                        lda     TXTTAB+1
d6a0: 69 ff                        adc     #$ff
d6a2: 85 b9 sta TXTPTR+1
d6a4: 60 rts

                   ********************************************************************************
                   * LIST statement                                                               *
                   ********************************************************************************

d6a5: 90 0a LIST bcc LD6B1 ;no line # specified
d6a7: f0 08 beq LD6B1 ;---ditto---
d6a9: c9 c9 cmp #TOK_MINUS ;if dash or comma, start at line 0
d6ab: f0 04 beq LD6B1 ;it is a dash
d6ad: c9 2c cmp #‘,’ ;comma?
d6af: d0 e5 bne RTS_2 ;no, error
d6b1: 20 0c da LD6B1 jsr LINGET ;convert line number if any
d6b4: 20 1a d6 jsr FNDLIN ;point LOWTR to 1st line
d6b7: 20 b7 00 jsr CHRGOT ;range specified?
d6ba: f0 10 beq LD6CC ;no
d6bc: c9 c9 cmp #TOK_MINUS
d6be: f0 04 beq LD6C4
d6c0: c9 2c cmp #‘,’
d6c2: d0 84 bne RTS_1
d6c4: 20 b1 00 LD6C4 jsr CHRGET ;get next char
d6c7: 20 0c da jsr LINGET ;convert second line #
d6ca: d0 ca bne RTS_2 ;branch if syntax err
d6cc: 68 LD6CC pla ;pop return address
d6cd: 68 pla ;(get back by JMP NEWSTT
d6ce: a5 50 lda LINNUM ;if no second number, use $FFFF
d6d0: 05 51                        ora     LINNUM+1
d6d2: d0 06                        bne     LIST_0            ;there was a second number
d6d4: a9 ff                        lda     #$ff ;max end range
d6d6: 85 50 sta LINNUM
d6d8: 85 51 sta LINNUM+1
d6da: a0 01 LIST_0 ldy #$01
d6dc: b1 9b lda (LOWTR),y ;high byte of link
d6de: f0 44 beq LIST_3 ;end of program
d6e0: 20 58 d8 jsr ISCNTC ;check if Ctrl+C has been typed
d6e3: 20 fb da jsr CRDO ;no, print <return>
d6e6: c8 iny
d6e7: b1 9b lda (LOWTR),y ;get line #, compare with end range
d6e9: aa tax
d6ea: c8 iny
d6eb: b1 9b lda (LOWTR),y
d6ed: c5 51 cmp LINNUM+1
d6ef: d0 04 bne LD6F5
d6f1: e4 50 cpx LINNUM
d6f3: f0 02 beq LD6F7 ;on last line of range
d6f5: b0 2d LD6F5 bcs LIST_3 ;fnished the range
d6f7: 84 85 LD6F7 sty FORPNT
d6f9: 20 24 ed jsr LINPRT ;print line # from (X,A)
d6fc: a9 20 lda #‘ ’ ;print space after line #
d6fe: a4 85 LIST_1 ldy FORPNT
d700: 29 7f and #$7f
d702: 20 5c db LIST_2 jsr OUTDO
d705: a5 24 lda MON_CH ;if past column 33, start a new line
d707: c9 21 cmp #33
d709: 90 07 bcc LD712 ;< 33
d70b: 20 fb da jsr CRDO ;print <return>
d70e: a9 05 lda #5 ;and tab over 5
d710: 85 24 sta MON_CH
d712: c8 LD712 iny
d713: b1 9b lda (LOWTR),y
d715: d0 1d bne LIST_4 ;not end of line yet
d717: a8 tay ;end of line
d718: b1 9b lda (LOWTR),y ;get link to next line
d71a: aa tax
d71b: c8 iny
d71c: b1 9b lda (LOWTR),y
d71e: 86 9b stx LOWTR ;point to next line
d720: 85 9c sta LOWTR+1
d722: d0 b6 bne LIST_0 ;branch if not end of program
d724: a9 0d LIST_3 lda #$0d ;print <return>
d726: 20 5c db jsr OUTDO
d729: 4c d2 d7 jmp NEWSTT ;to next statement

d72c: c8 GETCHR iny ;pick up char from table
d72d: d0 02 bne LD731
d72f: e6 9e inc FAC+1
d731: b1 9d LD731 lda (FAC),y
d733: 60 rts

d734: 10 cc LIST_4 bpl LIST_2 ;branch if not a token
d736: 38 sec
d737: e9 7f sbc #$7f              ;convert token to index
d739: aa                           tax
d73a: 84 85                        sty     FORPNT            ;save line pointer
d73c: a0 d0                        ldy     #<TOKEN_NAME_TABLE
d73e: 84 9d                        sty     FAC               ;point FAC to table
d740: a0 cf                        ldy     #(>TOKEN_NAME_TABLE)-1
d742: 84 9e                        sty     FAC+1
d744: a0 ff                        ldy     #$ff
d746: ca LD746 dex ;skip keywords until reach this one
d747: f0 07 beq LD750
d749: 20 2c d7 LD749 jsr GETCHR ;bump Y, get char from table
d74c: 10 fb bpl LD749 ;not at end of keyword yet
d74e: 30 f6 bmi LD746 ;end of keyword, always branches

d750: a9 20 LD750 lda #‘ ’ ;found the right keyword
d752: 20 5c db jsr OUTDO ;print leading space
d755: 20 2c d7 LD755 jsr GETCHR ;print the keyword
d758: 30 05 bmi LD75F ;last char of keyword
d75a: 20 5c db jsr OUTDO
d75d: d0 f6 bne LD755 ;...always

d75f: 20 5c db LD75F jsr OUTDO ;print last char of keyword
d762: a9 20 lda #‘ ’ ;print trailing space
d764: d0 98 bne LIST_1 ;...always, back to actual line

                   ********************************************************************************
                   * FOR statement                                                                *
                   *                                                                              *
                   * FOR pushes 18 bytes on the stack:                                            *
                   *   2 - TXTPTR                                                                 *
                   *   2 - line number                                                            *
                   *   5 - initial (current) FOR variable value                                   *
                   *   1 - step sign                                                              *
                   *   5 - step value                                                             *
                   *   2 - address of FOR variable in VARTAB                                      *
                   *   1 - FOR token ($81)                                                        *
                   ********************************************************************************

d766: a9 80 FOR lda #$80
d768: 85 14 sta SUBFLG ;subscripts not allowed
d76a: 20 46 da jsr LET ;do <var> = <exp>, store addr in FORPNT
d76d: 20 65 d3 jsr GTFORPNT ;is this FOR variable active?
d770: d0 05 bne LD777 ;no
d772: 8a txa ;yes, cancel it and enclosed loops
d773: 69 0f adc #$0f ;carry=1, this adds 16
d775: aa tax ;X was already S+2
d776: 9a txs
d777: 68 LD777 pla ;pop return address too
d778: 68 pla
d779: a9 09 lda #$09 ;be certain enough room in stack
d77b: 20 d6 d3 jsr CHKMEM
d77e: 20 a3 d9 jsr DATAN ;scan ahead to next statement
d781: 18 clc ;push statement address on stack
d782: 98 tya
d783: 65 b8 adc TXTPTR
d785: 48 pha
d786: a5 b9 lda TXTPTR+1
d788: 69 00 adc #$00
d78a: 48 pha
d78b: a5 76 lda CURLIN+1 ;push line number on stack
d78d: 48 pha
d78e: a5 75 lda CURLIN
d790: 48 pha
d791: a9 c1 lda #TOK_TO
d793: 20 c0 de jsr SYNCHR ;require TO
d796: 20 6a dd jsr CHKNUM ;<var> = <exp> must be numeric
d799: 20 67 dd jsr FRMNUM ;get final value, must be numeric
d79c: a5 a2 lda FAC_SIGN ;put sign into value in FAC
d79e: 09 7f ora #$7f
d7a0: 25 9e and FAC+1
d7a2: 85 9e sta FAC+1
d7a4: a9 af lda #<STEP ;set up for return
d7a6: a0 d7 ldy #>STEP ; to step
d7a8: 85 5e sta INDEX
d7aa: 84 5f sty INDEX+1
d7ac: 4c 20 de jmp FRM_STACK_3 ;returns by "JMP (INDEX)"

                   * STEP phrase of FOR statement.

d7af: a9 13 STEP lda #<CON*ONE ;STEP default=1
d7b1: a0 e9 ldy #>CON_ONE
d7b3: 20 f9 ea jsr LOAD_FAC_FROM_YA
d7b6: 20 b7 00 jsr CHRGOT
d7b9: c9 c7 cmp #TOK_STEP
d7bb: d0 06 bne LD7C3 ;use default value of 1.0
d7bd: 20 b1 00 jsr CHRGET ;step specified, get it
d7c0: 20 67 dd jsr FRMNUM
d7c3: 20 82 eb LD7C3 jsr SIGN
d7c6: 20 15 de jsr FRM_STACK_2
d7c9: a5 86 lda FORPNT+1
d7cb: 48 pha
d7cc: a5 85 lda FORPNT
d7ce: 48 pha
d7cf: a9 81 lda #TOK_FOR
d7d1: 48 pha \* Perform NEXT statement.
d7d2: ba NEWSTT tsx ;remember the stack position
d7d3: 86 f8 stx REMSTK
d7d5: 20 58 d8 jsr ISCNTC ;see if Ctrl+C has been typed
d7d8: a5 b8 lda TXTPTR ;no, keep executing
d7da: a4 b9 ldy TXTPTR+1
d7dc: a6 76 ldx CURLIN+1 ;=$FF if in direct mode
d7de: e8 inx ; $FF turns into $00
d7df: f0 04 beq LD7E5 ; in direct mode
d7e1: 85 79 sta OLDTEXT ;in running mode
d7e3: 84 7a sty OLDTEXT+1
d7e5: a0 00 LD7E5 ldy #$00
d7e7: b1 b8 lda (TXTPTR),y ;end of line yet?
d7e9: d0 57 bne COLON ;no
d7eb: a0 02 ldy #$02 ;yes, see if end of program
d7ed: b1 b8 lda (TXTPTR),y
d7ef: 18 clc
d7f0: f0 34 beq GOEND ;yes, end of program
d7f2: c8 iny
d7f3: b1 b8 lda (TXTPTR),y ;get line # of next line
d7f5: 85 75 sta CURLIN
d7f7: c8 iny
d7f8: b1 b8 lda (TXTPTR),y
d7fa: 85 76 sta CURLIN+1
d7fc: 98 tya ;adjust TXTPTR to start
d7fd: 65 b8 adc TXTPTR ;of new line
d7ff: 85 b8 sta TXTPTR
d801: 90 02 bcc TRACE*
d803: e6 b9 inc TXTPTR+1 \*
d805: 24 f2 TRACE\_ bit TRCFLG ;is trace on?
d807: 10 14 bpl LD81D ;no
d809: a6 76 ldx CURLIN+1 ;yes, are we running?
d80b: e8 inx
d80c: f0 0f beq LD81D ;not running, so don't trace
d80e: a9 23 lda #‘#’ ;print '#'
d810: 20 5c db jsr OUTDO
d813: a6 75 ldx CURLIN
d815: a5 76 lda CURLIN+1
d817: 20 24 ed jsr LINPRT ;print line number
d81a: 20 57 db jsr OUTSP ;print trailing space
d81d: 20 b1 00 LD81D jsr CHRGET ;get first chr of statement
d820: 20 28 d8 jsr EXECUTE_STATEMENT ;and start processing
d823: 4c d2 d7 jmp NEWSTT ;back for more

d826: f0 62 GOEND beq END4

                   * Execute a statement
                   *
                   *   A-reg is first char of statement
                   *   Carry is set

d828: f0 2d EXECUTE_STATEMENT beq RTS_3 ;end of line, null statement
d82a: e9 80 EXECUTE_STATEMENT_1 sbc #$80 ;first char a token?
d82c: 90 11 bcc LD83F ;not token, must be LET
d82e: c9 40 cmp #$40 ;statement-type token?
d830: b0 14 bcs SYNERR_1 ;no, syntax error
d832: 0a asl A ;double to get index
d833: a8 tay ;into address table
d834: b9 01 d0 lda TOKEN_ADDR_TABLE+1,y
d837: 48 pha ;put address on stack
d838: b9 00 d0 lda TOKEN_ADDR_TABLE,y
d83b: 48 pha
d83c: 4c b1 00 jmp CHRGET ;get next chr & rts to routine

d83f: 4c 46 da LD83F jmp LET ;must be <var> = <exp>

d842: c9 3a COLON cmp #‘:’
d844: f0 bf beq TRACE\_
d846: 4c c9 de SYNERR_1 jmp SYNERR

                   ********************************************************************************
                   * RESTORE statement                                                            *
                   ********************************************************************************

d849: 38 RESTORE sec ;set DATPTR to beginning of program
d84a: a5 67 lda TXTTAB
d84c: e9 01 sbc #$01
d84e: a4 68 ldy TXTTAB+1
d850: b0 01 bcs SETDA
d852: 88 dey \* Set DATPTR to (Y,A)
d853: 85 7d SETDA sta DATPTR
d855: 84 7e sty DATPTR+1
d857: 60 RTS_3 rts

                   * See if Ctrl+C typed

d858: ad 00 c0 ISCNTC lda KBD
d85b: c9 83 cmp #$83
d85d: f0 01 beq LD860
d85f: 60 rts

d860: 20 53 d5 LD860 jsr INCHR ;<<< should be BIT $C010 >>>
d863: a2 ff        CTRL_C_TYPED    ldx     #$ff ;Ctrl+C attempted
d865: 24 d8 bit ERRFLG ;ON ERR enabled?
d867: 10 03 bpl LD86C ;no
d869: 4c e9 f2 jmp HANDLERR ;yes, return err code = 255

d86c: c9 03 LD86C cmp #$03 ;since it is Ctrl+C, set Z and C bits
**************************************\*\*\*\***************************************
_ STOP statement _
**************************************\*\*\*\***************************************
d86e: b0 01 STOP bcs END2 ;carry=1 to force printing "BREAK AT.."
**************************************\*\*\*\***************************************
_ END statement _
**************************************\*\*\*\***************************************
d870: 18 END clc ;carry=0 to avoid printing message
d871: d0 3c END2 bne RTS_4 ;if not end of statement, do nothing
d873: a5 b8 lda TXTPTR
d875: a4 b9 ldy TXTPTR+1
d877: a6 76 ldx CURLIN+1
d879: e8 inx ;running?
d87a: f0 0c beq LD888 ;no, direct mode
d87c: 85 79 sta OLDTEXT
d87e: 84 7a sty OLDTEXT+1
d880: a5 75 lda CURLIN
d882: a4 76 ldy CURLIN+1
d884: 85 77 sta OLDIN
d886: 84 78 sty OLDIN+1
d888: 68 LD888 pla
d889: 68 pla
d88a: a9 5d END4 lda #<QT_BREAK ;" BREAK" and bell
d88c: a0 d3 ldy #>QT_BREAK
d88e: 90 03 bcc LD893
d890: 4c 31 d4 jmp PRINT_ERROR_LINNUM

d893: 4c 3c d4 LD893 jmp RESTART

                   ********************************************************************************
                   * CONT statement                                                               *
                   ********************************************************************************

d896: d0 17 CONT bne RTS_4 ;if not end of statement, do nothing
d898: a2 d2 ldx #ERR_CANTCONT
d89a: a4 7a ldy OLDTEXT+1 ;meaningful re-entry?
d89c: d0 03 bne LD8A1 ;yes
d89e: 4c 12 d4 jmp ERROR ;no

d8a1: a5 79 LD8A1 lda OLDTEXT ;restore TXTPTR
d8a3: 85 b8 sta TXTPTR
d8a5: 84 b9 sty TXTPTR+1
d8a7: a5 77 lda OLDIN ;restore line number
d8a9: a4 78 ldy OLDIN+1
d8ab: 85 75 sta CURLIN
d8ad: 84 76 sty CURLIN+1
d8af: 60 RTS_4 rts

                   ********************************************************************************
                   * SAVE statement                                                               *
                   *                                                                              *
                   * Writes program on cassette tape.                                             *
                   ********************************************************************************

d8b0: 38 SAVE sec
d8b1: a5 af lda PRGEND ;compute program length
d8b3: e5 67 sbc TXTTAB
d8b5: 85 50 sta LINNUM
d8b7: a5 b0 lda PRGEND+1
d8b9: e5 68 sbc TXTTAB+1
d8bb: 85 51 sta LINNUM+1
d8bd: 20 f0 d8 jsr VARTIO ;set up to write 3-byte header
d8c0: 20 cd fe jsr MON_WRITE ;write 'em
d8c3: 20 01 d9 jsr PROGIO ;set up to write the program
d8c6: 4c cd fe jmp MON_WRITE ;write it

                   ********************************************************************************
                   * LOAD statement                                                               *
                   *                                                                              *
                   * Reads a program from cassette tape.                                          *
                   ********************************************************************************

d8c9: 20 f0 d8 LOAD jsr VARTIO ;set up to read 3-byte header
d8cc: 20 fd fe jsr MON_READ ;read length, lock byte
d8cf: 18 clc
d8d0: a5 67 lda TXTTAB ;compute end address
d8d2: 65 50 adc LINNUM
d8d4: 85 69 sta VARTAB
d8d6: a5 68 lda TXTTAB+1
d8d8: 65 51 adc LINNUM+1
d8da: 85 6a sta VARTAB+1
d8dc: a5 52 lda TEMPPT ;lock byte
d8de: 85 d6 sta LOCK
d8e0: 20 01 d9 jsr PROGIO ;set up to read program
d8e3: 20 fd fe jsr MON_READ ;read it
d8e6: 24 d6 bit LOCK ;if locked, start running now
d8e8: 10 03 bpl LD8ED ;not locked
d8ea: 4c 65 d6 jmp SETPTRS ;locked, start running

d8ed: 4c f2 d4 LD8ED jmp FIX_LINKS ;just fix forward pointers

d8f0: a9 50 VARTIO lda #LINNUM ;set up to read/write 3-byte header
d8f2: a0 00 ldy #$00
d8f4: 85 3c sta MON_A1L
d8f6: 84 3d sty MON_A1H
d8f8: a9 52 lda #TEMPPT
d8fa: 85 3e sta MON_A2L
d8fc: 84 3f sty MON_A2H
d8fe: 84 d6 sty LOCK
d900: 60 rts

d901: a5 67 PROGIO lda TXTTAB ;set up to read/write program
d903: a4 68 ldy TXTTAB+1
d905: 85 3c sta MON_A1L
d907: 84 3d sty MON_A1H
d909: a5 69 lda VARTAB
d90b: a4 6a ldy VARTAB+1
d90d: 85 3e sta MON_A2L
d90f: 84 3f sty MON_A2H
d911: 60 rts

                   ********************************************************************************
                   * RUN statement                                                                *
                   ********************************************************************************

d912: 08 RUN php ;save status while subtracting
d913: c6 76 dec CURLIN+1 ;if was $FF (meaning direct mode), make it run mode
d915: 28 plp ;get status again (from CHRGET)
d916: d0 03 bne LD91B ;probably a line number
d918: 4c 65 d6 jmp SETPTRS ;start at beginning of program

d91b: 20 6c d6 LD91B jsr CLEARC ;clear variables
d91e: 4c 35 d9 jmp GO_TO_LINE ;join GOSUB statement

                   ********************************************************************************
                   * GOSUB statement                                                              *
                   *                                                                              *
                   * Leaves 7 bytes on stack:                                                     *
                   *   2 - return address (NEWSTT)                                                *
                   *   2 - TXTPTR                                                                 *
                   *   2 - line #                                                                 *
                   *   1 - GOSUB token ($B0)                                                      *
                   ********************************************************************************

d921: a9 03 GOSUB lda #$03 ;be sure enough room on stack
d923: 20 d6 d3 jsr CHKMEM
d926: a5 b9 lda TXTPTR+1
d928: 48 pha
d929: a5 b8 lda TXTPTR
d92b: 48 pha
d92c: a5 76 lda CURLIN+1
d92e: 48 pha
d92f: a5 75 lda CURLIN
d931: 48 pha
d932: a9 b0 lda #TOK_GOSUB
d934: 48 pha
d935: 20 b7 00 GO_TO_LINE jsr CHRGOT
d938: 20 3e d9 jsr GOTO
d93b: 4c d2 d7 jmp NEWSTT

                   ********************************************************************************
                   * GOTO statement                                                               *
                   *                                                                              *
                   * Also used by RUN and GOSUB                                                   *
                   ********************************************************************************

d93e: 20 0c da GOTO jsr LINGET ;get GOTO line
d941: 20 a6 d9 jsr REMN ;point Y to EOL
d944: a5 76 lda CURLIN+1 ;is current page < GOTO page?
d946: c5 51 cmp LINNUM+1
d948: b0 0b bcs LD955 ;search from prog start if not
d94a: 98 tya ;otherwise search from next line
d94b: 38 sec
d94c: 65 b8 adc TXTPTR
d94e: a6 b9 ldx TXTPTR+1
d950: 90 07 bcc LD959
d952: e8 inx
d953: b0 04 bcs LD959

d955: a5 67 LD955 lda TXTTAB ;get program beginning
d957: a6 68 ldx TXTTAB+1
d959: 20 1e d6 LD959 jsr FL1 ;search for GOTO line
d95c: 90 1e bcc UNDERR ;error if not there
d95e: a5 9b lda LOWTR ;TXTPTR = start of the destination line
d960: e9 01 sbc #$01
d962: 85 b8 sta TXTPTR
d964: a5 9c lda LOWTR+1
d966: e9 00 sbc #$00
d968: 85 b9 sta TXTPTR+1
d96a: 60 RTS_5 rts ;return to NEWSTT or GOSUB

                   ********************************************************************************
                   * POP and RETURN statements                                                    *
                   ********************************************************************************

d96b: d0 fd POP bne RTS_5
d96d: a9 ff lda #$ff
d96f: 85 85 sta FORPNT ;<<< BUG: should be FORPNT+1 >>> \* <<< see "All About Applesoft", pages 100,101 >>>
d971: 20 65 d3 jsr GTFORPNT ;to cancel FOR/NEXT in sub
d974: 9a txs
d975: c9 b0 cmp #TOK_GOSUB ;last GOSUB found?
d977: f0 0b beq RETURN
d979: a2 16 ldx #ERR_NOGOSUB
d97b: 2c bit ▼ $5aa2 ;fake: BIT xxxx skips ahead to JMP ERROR
d97c: a2 5a UNDERR ldx #ERR_UNDEFSTAT
d97e: 4c 12 d4 jmp ERROR

d981: 4c c9 de SYNERR_2 jmp SYNERR

d984: 68 RETURN pla ;discard GOSUB token
d985: 68 pla
d986: c0 42 cpy #$42 ;(should be #TOK_POP*2 = $142)
d988: f0 3b beq PULL3 ;branch if a POP
d98a: 85 75 sta CURLIN ;pull line #
d98c: 68 pla
d98d: 85 76 sta CURLIN+1
d98f: 68 pla
d990: 85 b8 sta TXTPTR ;pull TXTPTR
d992: 68 pla
d993: 85 b9 sta TXTPTR+1
**************************************\*\*\*\***************************************
* DATA statement \* \* \*
_ Executed by skipping to next colon or EOL _
**************************************\*\*\*\***************************************
d995: 20 a3 d9 DATA jsr DATAN ;move to next statement \* add Y-reg to TXTPTR
d998: 98 ADDON tya
d999: 18 clc
d99a: 65 b8 adc TXTPTR
d99c: 85 b8 sta TXTPTR
d99e: 90 02 bcc RTS_6
d9a0: e6 b9 inc TXTPTR+1
d9a2: 60 RTS_6 rts

                   * Scan ahead to next ':' or EOL

d9a3: a2 3a DATAN ldx #‘:’ ;get offset in Y to EOL or ':'
d9a5: 2c bit ▼ a:$00a2 ;fake
d9a6: a2 00 REMN ldx #$00 ;to EOL only
d9a8: 86 0d stx CHARAC
d9aa: a0 00 ldy #$00
d9ac: 84 0e sty ENDCHR
d9ae: a5 0e LD9AE lda ENDCHR ;trick to count quote parity
d9b0: a6 0d ldx CHARAC
d9b2: 85 0d sta CHARAC
d9b4: 86 0e stx ENDCHR
d9b6: b1 b8 LD9B6 lda (TXTPTR),y
d9b8: f0 e8 beq RTS_6 ;end of line
d9ba: c5 0e cmp ENDCHR
d9bc: f0 e4 beq RTS_6 ;colon if looking for colons
d9be: c8 iny
d9bf: c9 22 cmp #‘"’
d9c1: d0 f3 bne LD9B6
d9c3: f0 e9 beq LD9AE ;...always

d9c5: 68 PULL3 pla
d9c6: 68 pla
d9c7: 68 pla
d9c8: 60 rts

                   ********************************************************************************
                   * IF statement                                                                 *
                   ********************************************************************************

d9c9: 20 7b dd IF jsr FRMEVL
d9cc: 20 b7 00 jsr CHRGOT
d9cf: c9 ab cmp #TOK_GOTO
d9d1: f0 05 beq LD9D8
d9d3: a9 c4 lda #TOK_THEN
d9d5: 20 c0 de jsr SYNCHR
d9d8: a5 9d LD9D8 lda FAC ;condition true or false?
d9da: d0 05 bne IF_TRUE ;branch if true
**************************************\*\*\*\***************************************
_ REM statement _ \* \*
_ Or false IF statement _
**************************************\*\*\*\***************************************
d9dc: 20 a6 d9 REM jsr REMN ;skip read of line
d9df: f0 b7 beq ADDON ;...always

d9e1: 20 b7 00 IF_TRUE jsr CHRGOT ;command or number?
d9e4: b0 03 bcs LD9E9 ;command
d9e6: 4c 3e d9 jmp GOTO ;number

d9e9: 4c 28 d8 LD9E9 jmp EXECUTE_STATEMENT

                   ********************************************************************************
                   * ON statement                                                                 *
                   *                                                                              *
                   *   ON <exp> GOTO <list>                                                       *
                   *   ON <exp> GOSUB <list>                                                      *
                   ********************************************************************************

d9ec: 20 f8 e6 ONGOTO jsr GETBYT ;evaluate <exp>, as byte in FAC+4
d9ef: 48 pha ;save next char on stack
d9f0: c9 b0 cmp #TOK_GOSUB
d9f2: f0 04 beq ON_2
d9f4: c9 ab ON_1 cmp #TOK_GOTO
d9f6: d0 89 bne SYNERR_2
d9f8: c6 a1 ON_2 dec FAC+4 ;counted to right one yet?
d9fa: d0 04 bne LDA00 ;no, keep looking
d9fc: 68 pla ;yes, retrieve cmd
d9fd: 4c 2a d8 jmp EXECUTE_STATEMENT_1 ;and go

da00: 20 b1 00 LDA00 jsr CHRGET ;prime convert subroutine
da03: 20 0c da jsr LINGET ;convert line #
da06: c9 2c cmp #‘,’ ;terminate with comma?
da08: f0 ee beq ON_2 ;yes
da0a: 68 pla ;no, end of list, so ignore
da0b: 60 RTS_7 rts

                   * Convert line number

da0c: a2 00 LINGET ldx #$00              ;asc # to hex address
da0e: 86 50                        stx     LINNUM            ;in LINNUM
da10: 86 51                        stx     LINNUM+1
da12: b0 f7        LDA12           bcs     RTS_7             ;not a digit
da14: e9 2f                        sbc     #‘/’              ;(should be #'0'-1) convert digit to binary
da16: 85 0d                        sta     CHARAC            ;save the digit
da18: a5 51                        lda     LINNUM+1          ;check range
da1a: 85 5e                        sta     INDEX
da1c: c9 19                        cmp     #$19              ;(should be #>6400) line # too large?
da1e: b0 d4                        bcs     ON_1              ;yes, > 63999, go indirectly to "SYNTAX ERROR"
                   * <<< DANGEROUS CODE >>>
                   *
                   * Note that if A-reg = $AB on the line above, ON_1 will compare = and cause a
                   * catastrophic jump to $22D9 (for GOTO), or other locations for other calls to
                   * LINGET.
                   *
                   * You can see this if you first put BRK in $22D9, then type "GO TO 437761".
                   *
                   * Any value from 437760 through 440319 will cause the problem.  ($AB00-ABFF) \* \* <<< DANGEROUS CODE >>>
da20: a5 50 lda LINNUM ;multiply by ten
da22: 0a asl A
da23: 26 5e rol INDEX
da25: 0a asl A
da26: 26 5e rol INDEX
da28: 65 50 adc LINNUM
da2a: 85 50 sta LINNUM
da2c: a5 5e lda INDEX
da2e: 65 51 adc LINNUM+1
da30: 85 51 sta LINNUM+1
da32: 06 50 asl LINNUM
da34: 26 51 rol LINNUM+1
da36: a5 50 lda LINNUM
da38: 65 0d adc CHARAC ;add digit
da3a: 85 50 sta LINNUM
da3c: 90 02 bcc LDA40
da3e: e6 51 inc LINNUM+1
da40: 20 b1 00 LDA40 jsr CHRGET ;get next char
da43: 4c 12 da jmp LDA12 ;more converting

                   ********************************************************************************
                   * LET statement                                                                *
                   *                                                                              *
                   * LET <var> = <exp>                                                            *
                   * <var> = <exp>                                                                *
                   ********************************************************************************

da46: 20 e3 df LET jsr PTRGET ;get <var>
da49: 85 85 sta FORPNT
da4b: 84 86 sty FORPNT+1
da4d: a9 d0 lda #TOK_EQUAL
da4f: 20 c0 de jsr SYNCHR
da52: a5 12 lda VALTYP+1 ;save variable type
da54: 48 pha
da55: a5 11 lda VALTYP
da57: 48 pha
da58: 20 7b dd jsr FRMEVL ;evalute <exp>
da5b: 68 pla
da5c: 2a rol A
da5d: 20 6d dd jsr CHKVAL
da60: d0 18 bne LET_STRING
da62: 68 pla \*
da63: 10 12 LET2 bpl LDA77 ;real variable
da65: 20 72 eb jsr ROUND_FAC ;integer var: round to 32 bits
da68: 20 0c e1 jsr AYINT ;truncate to 16 bits
da6b: a0 00 ldy #$00
da6d: a5 a0 lda FAC+3
da6f: 91 85 sta (FORPNT),y
da71: c8 iny
da72: a5 a1 lda FAC+4
da74: 91 85 sta (FORPNT),y
da76: 60 rts

                   * Real variable = expression

da77: 4c 27 eb LDA77 jmp SETFOR

da7a: 68 LET_STRING pla \* Install string, descriptor address is at FAC+3,4
da7b: a0 02 PUTSTR ldy #$02 ;string data already in string area?
da7d: b1 a0 lda (FAC+3),y ;(string area is between FRETOP HIMEM)
da7f: c5 70 cmp FRETOP+1
da81: 90 17 bcc LDA9A ;yes, data already up there
da83: d0 07 bne LDA8C ;no
da85: 88 dey ;maybe, test low byte of pointer
da86: b1 a0 lda (FAC+3),y
da88: c5 6f cmp FRETOP
da8a: 90 0e bcc LDA9A ;yes, already there
da8c: a4 a1 LDA8C ldy FAC+4 ;no; descriptor already among variables?
da8e: c4 6a cpy VARTAB+1
da90: 90 08 bcc LDA9A ;no
da92: d0 0d bne LDAA1 ;yes
da94: a5 a0 lda FAC+3 ;maybe, compare low byte
da96: c5 69 cmp VARTAB
da98: b0 07 bcs LDAA1 ;yes, descriptor is among variables
da9a: a5 a0 LDA9A lda FAC+3 ;either string already on top, or
da9c: a4 a1 ldy FAC+4 ;descriptor is not a variable
da9e: 4c b7 da jmp LDAB7 ;so just store the descriptor

                   * string not yet in string area, and descriptor is a variable

daa1: a0 00 LDAA1 ldy #$00 ;point at length in descriptor
daa3: b1 a0 lda (FAC+3),y ;get length
daa5: 20 d5 e3 jsr STRINI ;make a string that long up above
daa8: a5 8c lda DSCPTR ;set up source ptr for MOVINS
daaa: a4 8d ldy DSCPTR+1
daac: 85 ab sta STRNG1
daae: 84 ac sty STRNG1+1
dab0: 20 d4 e5 jsr MOVINS ;move string data to new area
dab3: a9 9d lda #FAC ;address of descriptor is in FAC
dab5: a0 00 ldy #>FAC
dab7: 85 8c LDAB7 sta DSCPTR
dab9: 84 8d sty DSCPTR+1
dabb: 20 35 e6 jsr FRETMS ;discard descriptor if 'twas temporary
dabe: a0 00 ldy #$00 ;copy string descriptor
dac0: b1 8c lda (DSCPTR),y
dac2: 91 85 sta (FORPNT),y
dac4: c8 iny
dac5: b1 8c lda (DSCPTR),y
dac7: 91 85 sta (FORPNT),y
dac9: c8 iny
daca: b1 8c lda (DSCPTR),y
dacc: 91 85 sta (FORPNT),y
dace: 60 rts

dacf: 20 3d db PR_STRING jsr STRPRT
dad2: 20 b7 00 jsr CHRGOT
**************************************\*\*\*\***************************************
_ PRINT statement _
**************************************\*\*\*\***************************************
dad5: f0 24 PRINT beq CRDO ;no more list, print <return>
dad7: f0 29 PRINT2 beq RTS_8 ;no more list, don't print <return>
dad9: c9 c0 cmp #TOK_TAB
dadb: f0 39 beq PR_TAB_OR_SPC ;C=1 for TAB(
dadd: c9 c3 cmp #TOK_SPC
dadf: 18 clc
dae0: f0 34 beq PR_TAB_OR_SPC ;C=0 for SPC(
dae2: c9 2c cmp #‘,’
dae4: 18 clc ;<<< no purpose to this >>>
dae5: f0 1c beq PR_COMMA
dae7: c9 3b cmp #‘;’
dae9: f0 44 beq PR_NEXT_CHAR
daeb: 20 7b dd jsr FRMEVL ;evaluate expression
daee: 24 11 bit VALTYP ;string or FP value?
daf0: 30 dd bmi PR_STRING ;string
daf2: 20 34 ed jsr FOUT ;FP: convert into buffer
daf5: 20 e7 e3 jsr STRLIT ;make buffer into string
daf8: 4c cf da jmp PR_STRING ;print the string

dafb: a9 0d CRDO lda #$0d              ;print <return>
dafd: 20 5c db                     jsr     OUTDO
db00: 49 ff        NEGATE          eor     #$ff ;<<< why??? >>>
db02: 60 RTS_8 rts

                   * Tab to next comma column
                   * <<< note bug if width of window less than 33 >>>

db03: a5 24 PR_COMMA lda MON_CH
db05: c9 18 cmp #24 ;<<< bug: it should be 32 >>>
db07: 90 05 bcc LDB0E ;next column, same line
db09: 20 fb da jsr CRDO ;first column, next line
db0c: d0 21 bne PR_NEXT_CHAR ;...always

db0e: 69 10 LDB0E adc #16
db10: 29 f0 and #$f0 ;round to 16 or 32
db12: 85 24 sta MON_CH
db14: 90 19 bcc PR_NEXT_CHAR ;...always \*
db16: 08 PR_TAB_OR_SPC php ;C=0 for SPC(, C=1 for TAB(
db17: 20 f5 e6 jsr GTBYTC ;get value
db1a: c9 29 cmp #‘)’ ;trailing parenthesis
db1c: f0 03 beq LDB21 ;good
db1e: 4c c9 de jmp SYNERR ;no, syntax error

db21: 28 LDB21 plp ;TAB( or SPC(
db22: 90 07 bcc LDB2B ;SPC(
db24: ca dex ;TAB(
db25: 8a txa ;calculate spaces needed for TAB(
db26: e5 24 sbc MON_CH
db28: 90 05 bcc PR_NEXT_CHAR ;already past that column
db2a: aa tax ;now do a SPC( to the specified column
db2b: e8 LDB2B inx
db2c: ca NXSPC dex
db2d: d0 06 bne DOSPC ;more spaces to print \*
db2f: 20 b1 00 PR_NEXT_CHAR jsr CHRGET
db32: 4c d7 da jmp PRINT2 ;continue parsing print list

db35: 20 57 db DOSPC jsr OUTSP
db38: d0 f2 bne NXSPC ;...always

                   * Print string at (Y,A)

db3a: 20 e7 e3 STROUT jsr STRLIT ;make (Y,A) printable
_ Print string at (FACMO,FACLO)
db3d: 20 00 e6 STRPRT jsr FREFAC ;get address into INDEX, A-reg = length
db40: aa tax ;use X-reg for counter
db41: a0 00 ldy #$00 ;use Y-reg for scanner
db43: e8 inx
db44: ca LDB44 dex
db45: f0 bb beq RTS_8 ;finished
db47: b1 5e lda (INDEX),y ;next char from string
db49: 20 5c db jsr OUTDO ;print the char
db4c: c8 iny
_ <<< next three lines are useless >>>
db4d: c9 0d cmp #$0d              ;was it <return>?
db4f: d0 f3                        bne     LDB44             ;no
db51: 20 00 db                     jsr     NEGATE            ;EOR #$FF would do it, but why?
db54: 4c 44 db jmp LDB44

db57: a9 20 OUTSP lda #‘ ’ ;print a space
db59: 2c bit ▼ $3fa9             ;skip over next line
db5a: a9 3f        OUTQUES         lda     #‘?’              ;print question mark
                   * Print char from A-reg
                   *
                   * Note: POKE 243,32 ($20 in $F3) will convert output to lower case.  This can be
                   * cancelled by NORMAL, INVERSE, or FLASH or POKE 243,0.
db5c: 09 80        OUTDO           ora     #$80              ;print A-reg
db5e: c9 a0                        cmp     #$a0 ;control chr?
db60: 90 02 bcc LDB64 ;skip if so
db62: 05 f3 ora FLASH_BIT ;=$40 for FLASH, else $00
db64: 20 ed fd LDB64 jsr MON_COUT ;ANDs with $3F (INVERSE), $7F (FLASH)
db67: 29 7f and #$7f
db69: 48 pha
db6a: a5 f1 lda SPEEDZ ;complement of speed #
db6c: 20 a8 fc jsr MON_WAIT ;so SPEED=255 becomes A=1
db6f: 68 pla
db70: 60 rts

                   * Input conversion error: illegal character in numeric field.  Must distinguish
                   * between INPUT, READ, and GET

db71: a5 15 INPUTERR lda INPUTFLG
db73: f0 12 beq RESPERR ;taken if INPUT
db75: 30 04 bmi READERR ;taken if READ
db77: a0 ff ldy #$ff ;from a GET
db79: d0 04 bne ERLIN ;...always

db7b: a5 7b READERR lda DATLIN ;tell where the DATA is, rather
db7d: a4 7c ldy DATLIN+1 ; than the READ
db7f: 85 75 ERLIN sta CURLIN
db81: 84 76 sty CURLIN+1
db83: 4c c9 de jmp SYNERR

db86: 68 INPERR pla \*
db87: 24 d8 RESPERR bit ERRFLG ;ON ERR turned on?
db89: 10 05 bpl LDB90 ;no, give reentry a try
db8b: a2 fe ldx #254 ;error code = 254
db8d: 4c e9 f2 jmp HANDLERR

db90: a9 ef LDB90 lda #<ERR_REENTRY ;"?REENTER"
db92: a0 dc ldy #>ERR_REENTRY
db94: 20 3a db jsr STROUT
db97: a5 79 lda OLDTEXT ;re-execute the whole INPUT statement
db99: a4 7a ldy OLDTEXT+1
db9b: 85 b8 sta TXTPTR
db9d: 84 b9 sty TXTPTR+1
db9f: 60 rts

                   ********************************************************************************
                   * GET statement                                                                *
                   ********************************************************************************

dba0: 20 06 e3 GET jsr ERRDIR ;illegal if in direct mode
dba3: a2 01 ldx #<INPUT_BUFFER+1 ;simulate input
dba5: a0 02 ldy #>INPUT_BUFFER
dba7: a9 00 lda #$00
dba9: 8d 01 02 sta INPUT_BUFFER+1
dbac: a9 40 lda #$40 ;set up inputflg
dbae: 20 eb db jsr PROCESS_INPUT_LIST ;<<< can save 1 byte here >>>
dbb1: 60 rts ;<<< by JMP PROCESS_INPUT_LIST >>>

                   ********************************************************************************
                   * INPUT statement                                                              *
                   ********************************************************************************

dbb2: c9 22 INPUT cmp #‘"’ ;check for optional prompt string
dbb4: d0 0e bne LDBC4 ;no, print "?" prompt
dbb6: 20 81 de jsr STRTXT ;make a printable string out of it
dbb9: a9 3b lda #‘;’ ;must have ';' now
dbbb: 20 c0 de jsr SYNCHR
dbbe: 20 3d db jsr STRPRT ;print the string
dbc1: 4c c7 db jmp LDBC7

dbc4: 20 5a db LDBC4 jsr OUTQUES ;no string, print "?"
dbc7: 20 06 e3 LDBC7 jsr ERRDIR ;illegal if in direct mode
dbca: a9 2c lda #‘,’ ;prime the buffer
dbcc: 8d ff 01 sta INPUT_BUFFER-1
dbcf: 20 2c d5 jsr INLIN
dbd2: ad 00 02 lda INPUT_BUFFER
dbd5: c9 03 cmp #$03 ;Ctrl+C?
dbd7: d0 10 bne INPUT_FLAG_ZERO ;no
dbd9: 4c 63 d8 jmp CTRL_C_TYPED

dbdc: 20 5a db NXIN jsr OUTQUES ;print "?"
dbdf: 4c 2c d5 jmp INLIN

                   ********************************************************************************
                   * READ statement                                                               *
                   ********************************************************************************

dbe2: a6 7d READ ldx DATPTR ;(Y,X) points at next DATA statement
dbe4: a4 7e ldy DATPTR+1
dbe6: a9 98 lda #$98 ;set INPUTFLG=$98
dbe8: 2c bit ▼ a:$00a9 ;trick to PROCESS_INPUT_LIST
dbe9: a9 00 INPUT_FLAG_ZERO lda #$00 ;set INPUTFLG = $00
_ Process input list
_
_ (Y,X) is address of input data string
_ A-reg = value for INPUTFLG: $00 for INPUT
_ $40 for GET
_ $98 for READ
dbeb: 85 15 PROCESS_INPUT_LIST sta INPUTFLG
dbed: 86 7f stx INPTR ;address of input string
dbef: 84 80 sty INPTR+1
dbf1: 20 e3 df PROCESS_INPUT_ITEM jsr PTRGET ;get address of variable
dbf4: 85 85 sta FORPNT
dbf6: 84 86 sty FORPNT+1
dbf8: a5 b8 lda TXTPTR
dbfa: a4 b9 ldy TXTPTR+1 ;save current TXTPTR
dbfc: 85 87 sta TXPSV ;which points into program
dbfe: 84 88 sty TXPSV+1
dc00: a6 7f ldx INPTR ;set TXTPTR to point at input buffer
dc02: a4 80 ldy INPTR+1 ;or DATA line
dc04: 86 b8 stx TXTPTR
dc06: 84 b9 sty TXTPTR+1
dc08: 20 b7 00 jsr CHRGOT ;get char at ptr
dc0b: d0 1e bne INSTART ;not end of line or colon
dc0d: 24 15 bit INPUTFLG ;doing a GET?
dc0f: 50 0e bvc LDC1F ;no
dc11: 20 0c fd jsr MON_RDKEY ;yes, get char
dc14: 29 7f and #$7f
dc16: 8d 00 02 sta INPUT_BUFFER
dc19: a2 ff ldx #<INPUT_BUFFER+255
dc1b: a0 01 ldy #(>INPUT_BUFFER)-1
dc1d: d0 08 bne LDC27 ;...always

dc1f: 30 7f LDC1F bmi FINDATA ;doing a READ
dc21: 20 5a db jsr OUTQUES ;doing an INPUT, print "?"
dc24: 20 dc db jsr NXIN ;print another "?", and input a line
dc27: 86 b8 LDC27 stx TXTPTR
dc29: 84 b9 sty TXTPTR+1
dc2b: 20 b1 00 INSTART jsr CHRGET ;get next input char
dc2e: 24 11 bit VALTYP ;string or numeric?
dc30: 10 31 bpl LDC63 ;numeric
dc32: 24 15 bit INPUTFLG ;string -- now what input type?
dc34: 50 09 bvc LDC3F ;not a GET
dc36: e8 inx ;GET
dc37: 86 b8 stx TXTPTR
dc39: a9 00 lda #$00
dc3b: 85 0d sta CHARAC ;no other terminators than $00
dc3d: f0 0c beq LDC4B ;...always

dc3f: 85 0d LDC3F sta CHARAC
dc41: c9 22 cmp #‘"’ ;terminate on $00 or quote
dc43: f0 07 beq LDC4C
dc45: a9 3a lda #‘:’ ;terminate on $00, colon, or comma
dc47: 85 0d sta CHARAC
dc49: a9 2c lda #‘,’
dc4b: 18 LDC4B clc
dc4c: 85 0e LDC4C sta ENDCHR
dc4e: a5 b8 lda TXTPTR
dc50: a4 b9 ldy TXTPTR+1
dc52: 69 00 adc #$00 ;skip over quotation mark, if
dc54: 90 01 bcc LDC57 ;there was one
dc56: c8 iny
dc57: 20 ed e3 LDC57 jsr STRLT2 ;build string starting at (Y,A), term by $00, CHARAC, or ENDCHR
dc5a: 20 3d e7 jsr POINT ;set TXTPTR to point at string
dc5d: 20 7b da jsr PUTSTR ;store string in variable
dc60: 4c 72 dc jmp INPUT_MORE

dc63: 48 LDC63 pha
dc64: ad 00 02 lda INPUT_BUFFER ;anything in buffer?
dc67: f0 30 beq INPFIN ;no, see if READ or INPUT
dc69: 68 INPUT_DATA pla ;READ
dc6a: 20 4a ec jsr FIN ;get fp number at TXTPTR
dc6d: a5 12 lda VALTYP+1
dc6f: 20 63 da jsr LET2 ;store result in variable
dc72: 20 b7 00 INPUT_MORE jsr CHRGOT
dc75: f0 07 beq LDC7E ;end of line or colon
dc77: c9 2c cmp #‘,’ ;comma in input?
dc79: f0 03 beq LDC7E ;yes
dc7b: 4c 71 db jmp INPUTERR ;nothing else will do

dc7e: a5 b8 LDC7E lda TXTPTR ;save position in input buffer
dc80: a4 b9 ldy TXTPTR+1
dc82: 85 7f sta INPTR
dc84: 84 80 sty INPTR+1
dc86: a5 87 lda TXPSV ;restore program pointer
dc88: a4 88 ldy TXPSV+1
dc8a: 85 b8 sta TXTPTR
dc8c: 84 b9 sty TXTPTR+1
dc8e: 20 b7 00 jsr CHRGOT ;next char from program
dc91: f0 33 beq INPDONE ;end of statement
dc93: 20 be de jsr CHKCOM ;better be a comma then
dc96: 4c f1 db jmp PROCESS_INPUT_ITEM

dc99: a5 15 INPFIN lda INPUTFLG ;INPUT or READ
dc9b: d0 cc bne INPUT_DATA ;READ
dc9d: 4c 86 db jmp INPERR

dca0: 20 a3 d9 FINDATA jsr DATAN ;get offset to next colon or EOL
dca3: c8 iny ;to first char of next line
dca4: aa tax ;which: EOL or colon?
dca5: d0 12 bne LDCB9 ;colon
dca7: a2 2a ldx #ERR_NODATA ;EOL: might be out of data
dca9: c8 iny ;check hi-byte of forward ptr
dcaa: b1 b8 lda (TXTPTR),y ;end of program?
dcac: f0 5f beq GERR ;yes, we are out of data
dcae: c8 iny ;pick up the line #
dcaf: b1 b8 lda (TXTPTR),y
dcb1: 85 7b sta DATLIN
dcb3: c8 iny
dcb4: b1 b8 lda (TXTPTR),y
dcb6: c8 iny ;point at first text char in line
dcb7: 85 7c sta DATLIN+1
dcb9: b1 b8 LDCB9 lda (TXTPTR),y ;get 1st token of statement
dcbb: aa tax ;save token in X-reg
dcbc: 20 98 d9 jsr ADDON ;add Y-reg to TXTPTR
dcbf: e0 83 cpx #TOK_DATA ;did we find a DATA statement?
dcc1: d0 dd bne FINDATA ;not yet
dcc3: 4c 2b dc jmp INSTART ;yes, read it

dcc6: a5 7f INPDONE lda INPTR ;get pointer in case it was READ
dcc8: a4 80 ldy INPTR+1
dcca: a6 15 ldx INPUTFLG ;READ or INPUT?
dccc: 10 03 bpl LDCD1 ;INPUT
dcce: 4c 53 d8 jmp SETDA ;DATA, so store (Y,X) at DATPTR

dcd1: a0 00 LDCD1 ldy #$00 ;INPUT: any more chars on line?
dcd3: b1 7f lda (INPTR),y
dcd5: f0 07 beq LDCDE ;no, all is well
dcd7: a9 df lda #<ERR_EXTRA ;yes, error
dcd9: a0 dc ldy #>ERR_EXTRA ;"EXTRA IGNORED"
dcdb: 4c 3a db jmp STROUT

dcde: 60 LDCDE rts

dcdf: 3f 45 58 54+ ERR_EXTRA .zstr “?EXTRA IGNORED”,$0d
dcef: 3f 52 45 45+ ERR_REENTRY .zstr “?REENTER”,$0d

                   ********************************************************************************
                   * NEXT statement                                                               *
                   ********************************************************************************

dcf9: d0 04 NEXT bne NEXT_1 ;variable after NEXT
dcfb: a0 00 ldy #$00 ;flag by setting FORPNT+1 = 0
dcfd: f0 03 beq NEXT_2 ;...always

dcff: 20 e3 df NEXT_1 jsr PTRGET ;get ptr to variable in (Y,A)
dd02: 85 85 NEXT_2 sta FORPNT
dd04: 84 86 sty FORPNT+1
dd06: 20 65 d3 jsr GTFORPNT ;find FOR-frame for this variable
dd09: f0 04 beq NEXT_3 ;found it
dd0b: a2 00 ldx #ERR_NOFOR ;not there, abort
dd0d: f0 69 GERR beq JERROR ;...always

dd0f: 9a NEXT_3 txs
dd10: e8 inx ;set stack ptr to point to this frame,
dd11: e8 inx ; which trims off any inner loops
dd12: e8 inx
dd13: e8 inx
dd14: 8a txa ;low byte of adrs of step value
dd15: e8 inx
dd16: e8 inx
dd17: e8 inx
dd18: e8 inx
dd19: e8 inx
dd1a: e8 inx
dd1b: 86 60 stx DEST ;low byte adrs of FOR var value
dd1d: a0 01 ldy #>STACK ;(Y,A) is address of step value
dd1f: 20 f9 ea jsr LOAD_FAC_FROM_YA ;step to FAC
dd22: ba tsx
dd23: bd 09 01 lda STACK+9,x
dd26: 85 a2 sta FAC_SIGN
dd28: a5 85 lda FORPNT
dd2a: a4 86 ldy FORPNT+1
dd2c: 20 be e7 jsr FADD ;add to FOR value
dd2f: 20 27 eb jsr SETFOR ;put new value back
dd32: a0 01 ldy #>STACK ;(Y,A) is address of end value
dd34: 20 b4 eb jsr FCOMP2 ;compare to end value
dd37: ba tsx
dd38: 38 sec
dd39: fd 09 01 sbc STACK+9,x ;sign of step
dd3c: f0 17 beq LDD55 ;branch if FOR complete
dd3e: bd 0f 01 lda STACK+15,x ;otherwise set up
dd41: 85 75 sta CURLIN ;FOR line #
dd43: bd 10 01 lda STACK+16,x
dd46: 85 76 sta CURLIN+1
dd48: bd 12 01 lda STACK+18,x ;and set TXTPTR to just
dd4b: 85 b8 sta TXTPTR ; after FOR statement
dd4d: bd 11 01 lda STACK+17,x
dd50: 85 b9 sta TXTPTR+1
dd52: 4c d2 d7 LDD52 jmp NEWSTT

dd55: 8a LDD55 txa ;pop off FOR-frame, loop is done
dd56: 69 11 adc #17 ;carry is set, so adds 18
dd58: aa tax
dd59: 9a txs
dd5a: 20 b7 00 jsr CHRGOT ;char after variable
dd5d: c9 2c cmp #‘,’ ;another variable in NEXT?
dd5f: d0 f1 bne LDD52 ;no, go to next statement
dd61: 20 b1 00 jsr CHRGET ;yes, prime for next variable
dd64: 20 ff dc jsr NEXT_1 ;(does not return)
_ Evaluate expression, make sure it is numeric
dd67: 20 7b dd FRMNUM jsr FRMEVL
_ Make sure FAC is numeric
dd6a: 18 CHKNUM clc
dd6b: 24 bit ▼ $38 ;dummy for skip
_ Make sure FAC is string
dd6c: 38 CHKSTR sec
_ Make sure FAC is correct type. \*
_ if C=0, type must be numeric
_ if C=1, type must be string
dd6d: 24 11 CHKVAL bit VALTYP ;$00 if numeric, $FF if string
dd6f: 30 03 bmi LDD74 ;type is string
dd71: b0 03 bcs LDD76 ;not string, but we need string
dd73: 60 LDD73 rts ;type is correct

dd74: b0 fd LDD74 bcs LDD73 ;is string and we wanted string
dd76: a2 a3 LDD76 ldx #ERR_BADTYPE ;type mismatch
dd78: 4c 12 d4 JERROR jmp ERROR

                   * Evaluate the expression at TXTPTR, leaving the result in FAC.  Works for both
                   * string and numeric expressions.

dd7b: a6 b8 FRMEVL ldx TXTPTR ;decrement TXTPTR
dd7d: d0 02 bne LDD81
dd7f: c6 b9 dec TXTPTR+1
dd81: c6 b8 LDD81 dec TXTPTR
dd83: a2 00 ldx #$00 ;start with precedence = 0
dd85: 24 bit ▼ $48 ;track to skip following PHA
_
dd86: 48 FRMEVL_1 pha ;push relops flags
dd87: 8a txa
dd88: 48 pha ;save last precedence
dd89: a9 01 lda #$01
dd8b: 20 d6 d3 jsr CHKMEM ;check if enough room on stack
dd8e: 20 60 de jsr FRM_ELEMENT ;get an element
dd91: a9 00 lda #$00
dd93: 85 89 sta CPRTYP ;clear comparison operator flags
_
dd95: 20 b7 00 FRMEVL_2 jsr CHRGOT ;check for relational operators
dd98: 38 LDD98 sec ;> is $CF, = is $D0, < is $D1
dd99: e9 cf sbc #TOK_GREATER ;> is 0, = is 1, < is 2
dd9b: 90 17 bcc LDDB4 ;not relational operator
dd9d: c9 03 cmp #3
dd9f: b0 13 bcs LDDB4 ;not relational operator
dda1: c9 01 cmp #1 ;set carry if "=" or "<"
dda3: 2a rol A ;now > is 0, = is 3, < is 5
dda4: 49 01 eor #$01 ;now > is 1, = is 2, < is 4
dda6: 45 89 eor CPRTYP ;set bits of CPRTYP: 00000<=>
dda8: c5 89 cmp CPRTYP ;check for illegal combinations
ddaa: 90 61 bcc SNTXERR ;if less than, a relop was repeated
ddac: 85 89 sta CPRTYP
ddae: 20 b1 00 jsr CHRGET ;another operator?
ddb1: 4c 98 dd jmp LDD98 ;check for <,=,> again

ddb4: a6 89 LDDB4 ldx CPRTYP ;did we find a relational operator?
ddb6: d0 2c bne FRM_RELATIONAL ;yes
ddb8: b0 7b bcs NOTMATH ;no, and next token is > $D1
ddba: 69 07                        adc     #TOK_PLUS-193     ;(should be #$CF-TOK_PLUS) no, and next token < $CF
ddbc: 90 77 bcc NOTMATH ;if next token < "+"
ddbe: 65 11 adc VALTYP ;+ and last result a string?
ddc0: d0 03 bne LDDC5 ;branch if not
ddc2: 4c 97 e5 jmp CAT ;concatenate if so

ddc5: 69 ff LDDC5 adc #$ff ;+-_/ is 0123
ddc7: 85 5e sta INDEX
ddc9: 0a asl A ;multiply by 3
ddca: 65 5e adc INDEX ;+-_/ is 0,3,6,9
ddcc: a8 tay \*
• Clear variables
LASTOP .var $87 {addr/1} ;Overlaps with TXPSV
SGNCPR .var $ab {addr/1} ;Overlaps with STRNG1

ddcd: 68 FRM_PRECEDENCE_TEST pla ;get last precedence
ddce: d9 b2 d0 cmp MATHTBL,y
ddd1: b0 67 bcs FRM_PERFORM_1 ;do now if higher precedence
ddd3: 20 6a dd jsr CHKNUM ;was last result a #?
ddd6: 48 NXOP pha ;yes, save precedence on stack
ddd7: 20 fd dd SAVOP jsr FRM_RECURSE ;save rest, call FRMEVL recursively
ddda: 68 pla
dddb: a4 87 ldy LASTOP
dddd: 10 17 bpl PREFNC
dddf: aa tax
dde0: f0 56 beq GOEX ;exit if no math in expression
dde2: d0 5f bne FRM_PERFORM_2 ;...always

                   * Found one or more relational operators <,=,>

dde4: 46 11 FRM_RELATIONAL lsr VALTYP ;VALTYP = 0 (numeric), = $FF (string)
dde6: 8a txa ;set CPRTYP to 0000<=>C
dde7: 2a rol A ;where C=0 if #, C=1 if string
dde8: a6 b8 ldx TXTPTR ;back up TXTPTR
ddea: d0 02 bne LDDEE
ddec: c6 b9 dec TXTPTR+1
ddee: c6 b8 LDDEE dec TXTPTR
ddf0: a0 1b ldy #<M_REL-178 ;(should be M_REL - MATHTBL) point at relops entry
ddf2: 85 89 sta CPRTYP
ddf4: d0 d7 bne FRM_PRECEDENCE_TEST ;...always

ddf6: d9 b2 d0 PREFNC cmp MATHTBL,y
ddf9: b0 48 bcs FRM_PERFORM_2 ;do now if higher precedence
ddfb: 90 d9 bcc NXOP ;...always

                   * Stack this operation and call FRMEVL for another one

ddfd: b9 b4 d0 FRM_RECURSE lda MATHTBL+2,y
de00: 48 pha ;push address of operation performer
de01: b9 b3 d0 lda MATHTBL+1,y
de04: 48 pha
de05: 20 10 de jsr FRM_STACK_1 ;stack FAC_SIGN and FAC
de08: a5 89 lda CPRTYP ;A=relop flags, X=precedence byte
de0a: 4c 86 dd jmp FRMEVL_1 ;recursively call FRMEVL

de0d: 4c c9 de SNTXERR jmp SYNERR

                   * Stack (FAC)
                   *
                   * Three entry points:
                   *   _1, from FRMEVL
                   *   _2, from STEP
                   *   _3, from FOR

de10: a5 a2 FRM_STACK_1 lda FAC_SIGN ;get FAC_SIGN and push it
de12: be b2 d0 ldx MATHTBL,y ;precedence byte from MATHTBL
_ Enter here from STEP, to push step sign and value
de15: a8 FRM_STACK_2 tay ;FAC_SIGN or SGN(step value)
de16: 68 pla ;pull return address and add 1
de17: 85 5e sta INDEX ;<<< assumes not on page boundary! >>>
de19: e6 5e inc INDEX ;place bumped return address in
de1b: 68 pla ; INDEX,INDEX+1
de1c: 85 5f sta INDEX+1
de1e: 98 tya ;FAC_SIGN or SGN(step value)
de1f: 48 pha ;push FAC_SIGN or SGN(step value)
_ Enter here from FOR, with INDEX = step, to push initial value of FOR variable
de20: 20 72 eb FRM_STACK_3 jsr ROUND_FAC ;round to 32 bits
de23: a5 a1 lda FAC+4 ;push FAC
de25: 48 pha
de26: a5 a0 lda FAC+3
de28: 48 pha
de29: a5 9f lda FAC+2
de2b: 48 pha
de2c: a5 9e lda FAC+1
de2e: 48 pha
de2f: a5 9d lda FAC
de31: 48 pha
de32: 6c 5e 00 jmp (INDEX) ;do RTS funny way

de35: a0 ff NOTMATH ldy #$ff ;set up to exit routine
de37: 68 pla
de38: f0 23 GOEX beq EXIT ;exit if no math to do
_ Perform stacked operation.
_
_ A-reg = precedence byte
_ Stack: 1 - CPRMASK
_ 5 - ARG
_ 2 - addr of performer
de3a: c9 64 FRM_PERFORM_1 cmp #P_REL ;was it relational operator?
de3c: f0 03 beq LDE41 ;yes, allow string compare
de3e: 20 6a dd jsr CHKNUM ;must be numeric value
de41: 84 87 LDE41 sty LASTOP \*
de43: 68 FRM_PERFORM_2 pla ;get 0000<=>C from stack
de44: 4a lsr A ;shift to 00000<=> form
de45: 85 16 sta CPRMASK ;00000<=>
de47: 68 pla
de48: 85 a5 sta ARG ;get floating point value off stack,
de4a: 68 pla ; and put it in ARG
de4b: 85 a6 sta ARG+1
de4d: 68 pla
de4e: 85 a7 sta ARG+2
de50: 68 pla
de51: 85 a8 sta ARG+3
de53: 68 pla
de54: 85 a9 sta ARG+4
de56: 68 pla
de57: 85 aa sta ARG+5
de59: 45 a2 eor FAC_SIGN ;save EOR of signs of the operands,
de5b: 85 ab sta SGNCPR ; in case of multiply or divide
de5d: a5 9d EXIT lda FAC ;FAC exponent in A-reg
de5f: 60 rts ;status .EQ. if FAC=0; RTS goes to perform operation

                   * Get element in expression
                   *
                   * Get value of variable or number at TXTPNT, or point to string descriptor if a
                   * string, and put in FAC.

de60: a9 00 FRM_ELEMENT lda #$00 ;assume numeric
de62: 85 11 sta VALTYP
de64: 20 b1 00 LDE64 jsr CHRGET
de67: b0 03 bcs LDE6C ;not a digit
de69: 4c 4a ec LDE69 jmp FIN ;numeric constant

de6c: 20 7d e0 LDE6C jsr ISLETC ;variable name?
de6f: b0 64 bcs FRM*VARIABLE ;yes
de71: c9 2e cmp #‘.’ ;decimal point
de73: f0 f4 beq LDE69 ;yes, numeric constant
de75: c9 c9 cmp #TOK_MINUS ;unary minus?
de77: f0 55 beq MIN ;yes
de79: c9 c8 cmp #TOK_PLUS ;unary plus
de7b: f0 e7 beq LDE64 ;yes
de7d: c9 22 cmp #‘"’ ;string constant?
de7f: d0 0f bne NOT* ;no
_ String constant element
_ \* Set (Y,A) = TXTPTR + carry
de81: a5 b8 STRTXT lda TXTPTR ;add carry to get address of 1st char
de83: a4 b9 ldy TXTPTR+1
de85: 69 00 adc #$00
de87: 90 01 bcc LDE8A
de89: c8 iny
de8a: 20 e7 e3 LDE8A jsr STRLIT ;build descriptor to string; get address of descriptor in FAC
de8d: 4c 3d e7 jmp POINT ;point TXTPTR after trailing quote

                   * NOT function
                   *
                   *   if FAC=0, return FAC=1
                   *   if FAC<>0, return FAC=0

de90: c9 c6 NOT* cmp #TOK_NOT
de92: d0 10 bne FN* ;not NOT, try FN
de94: a0 18 ldy #<M_EQU-178 ;(should be M_EQU - MATHTBL) point at = comparison
de96: d0 38 bne EQUL ;...always

                   * Comparison for equality (= operator).  Also used to evaluate NOT function.

de98: a5 9d EQUOP lda FAC ;set TRUE if FAC = zero
de9a: d0 03 bne LDE9F ;false
de9c: a0 01 ldy #$01 ;true
de9e: 2c bit ▼ a:$00a0 ;trick to skip next 2 bytes
de9f: a0 00 LDE9F ldy #$00 ;false
dea1: 4c 01 e3 jmp SNGFLT

dea4: c9 c2 FN* cmp #TOK_FN
dea6: d0 03 bne SGN*
dea8: 4c 54 e3 jmp FUNCT

deab: c9 d2 SGN\_ cmp #TOK_SGN
dead: 90 03 bcc PARCHK
deaf: 4c 0c df jmp UNARY

                   * Evaluate "(expression)"

deb2: 20 bb de PARCHK jsr CHKOPN ;is there a '(' at TXTPTR?
deb5: 20 7b dd jsr FRMEVL ;yes, evaluate expression
deb8: a9 29 CHKCLS lda #‘)’ ;check for ')'
deba: 2c bit ▼ $28a9 ;trick
debb: a9 28 CHKOPN lda #‘(’
debd: 2c bit ▼ $2ca9 ;trick
debe: a9 2c CHKCOM lda #‘,’ ;comma at TXTPTR? \* Unless char at TXTPTR = A-reg, syntax error
dec0: a0 00 SYNCHR ldy #$00
dec2: d1 b8 cmp (TXTPTR),y
dec4: d0 03 bne SYNERR
dec6: 4c b1 00 jmp CHRGET ;match, get next char & return

dec9: a2 10 SYNERR ldx #ERR_SYNTAX
decb: 4c 12 d4 jmp ERROR

dece: a0 15 MIN ldy #<M_NEG-178 ;(should be M_NEG - MATHTBL) point at unary minus
ded0: 68 EQUL pla
ded1: 68 pla
ded2: 4c d7 dd jmp SAVOP

                   VPNT            .var    $a0    {addr/2}   ;Overlaps with FAC+3

ded5: 20 e3 df FRM_VARIABLE jsr PTRGET ;so PTRGET can tell we called
ded8: 85 a0 sta VPNT ;address of variable
deda: 84 a1 sty VPNT+1
dedc: a6 11 ldx VALTYP ;numeric or string?
dede: f0 05 beq LDEE5 ;numeric
dee0: a2 00 ldx #$00 ;string
dee2: 86 ac stx STRNG1+1
dee4: 60 rts

dee5: a6 12 LDEE5 ldx VALTYP+1 ;numeric, which type?
dee7: 10 0d bpl LDEF6 ;floating point
dee9: a0 00 ldy #$00 ;integer
deeb: b1 a0 lda (VPNT),y
deed: aa tax ;get value in (A,Y)
deee: c8 iny
deef: b1 a0 lda (VPNT),y
def1: a8 tay
def2: 8a txa
def3: 4c f2 e2 jmp GIVAYF ;convert (A,Y) to floating point

def6: 4c f9 ea LDEF6 jmp LOAD_FAC_FROM_YA

def9: 20 b1 00 SCREEN jsr CHRGET
defc: 20 ec f1 jsr PLOTFNS ;get column and row
deff: 8a txa ;row
df00: a4 f0 ldy FIRST ;column
df02: 20 71 f8 jsr MON_SCRN ;get 4-bit color there
df05: a8 tay
df06: 20 01 e3 jsr SNGFLT ;convert Y-reg to real in FAC
df09: 4c b8 de jmp CHKCLS ;require ")"

df0c: c9 d7 UNARY cmp #TOK_SCRN ;not unary, do special
df0e: f0 e9 beq SCREEN
df10: 0a asl A ;double token to get index
df11: 48 pha
df12: aa tax
df13: 20 b1 00 jsr CHRGET
df16: e0 cf cpx #$cf              ;(should be TOK_LEFT*2-1)  LEFT$, RIGHT$, and MID$
df18: 90 20 bcc LDF3A ;not one of the string functions
df1a: 20 bb de jsr CHKOPN ;string function, need "("
df1d: 20 7b dd jsr FRMEVL ;evaluate expression for string
df20: 20 be de jsr CHKCOM ;require a comma
df23: 20 6c dd jsr CHKSTR ;make sure expression is a string
df26: 68 pla
df27: aa tax ;retrieve routine pointer
df28: a5 a1 lda VPNT+1 ;stack address of string
df2a: 48 pha
df2b: a5 a0 lda VPNT
df2d: 48 pha
df2e: 8a txa
df2f: 48 pha ;stack doubled token
df30: 20 f8 e6 jsr GETBYT ;convert next expression to byte in X-reg
df33: 68 pla ;get doubled token off stack
df34: a8 tay ;use as index to branch
df35: 8a txa ;value of second parameter
df36: 48 pha ;push 2nd param
df37: 4c 3f df jmp LDF3F ;join unary functions

df3a: 20 b2 de LDF3A jsr PARCHK ;require "(expression)"
df3d: 68 pla
df3e: a8 tay ;index into function address table
df3f: b9 dc cf LDF3F lda $cfdc,y           ;(should be UNFNC - TOK_SGN - TOK_SGN + $100)
df42: 85 91                        sta     JMPADRS+1
df44: b9 dd cf                     lda     $cfdd,y           ;(should be UNFNC - TOK_SGN - TOK_SGN + $101)
df47: 85 92                        sta     JMPADRS+2
df49: 20 90 00                     jsr     JMPADRS           ;does not return for CHR$, LEFT$, RIGHT$, or MID$
df4c: 4c 6a dd jmp CHKNUM ;require numeric result

df4f: a5 a5 OR lda ARG ;OR operator
df51: 05 9d ora FAC ;if result nonzero, it is true
df53: d0 0b bne TRUE
df55: a5 a5 AND lda ARG ;AND operator
df57: f0 04 beq FALSE ;if either is zero, result is false
df59: a5 9d lda FAC
df5b: d0 03 bne TRUE
df5d: a0 00 FALSE ldy #$00 ;return FAC=0
df5f: 2c bit ▼ $01a0 ;trick
df60: a0 01 TRUE ldy #$01 ;return FAC=1
df62: 4c 01 e3 jmp SNGFLT

                   * Perform relational operations

df65: 20 6d dd RELOPS jsr CHKVAL ;make sure FAC is correct type
df68: b0 13 bcs STRCMP ;type matches, branch if strings
df6a: a5 aa lda ARG_SIGN ;numeric comparison
df6c: 09 7f ora #$7f ;re-pack value in ARG for FCOMP
df6e: 25 a6 and ARG+1
df70: 85 a6 sta ARG+1
df72: a9 a5 lda #ARG
df74: a0 00 ldy #>ARG
df76: 20 b2 eb jsr FCOMP ;return A-reg = -1,0,1
df79: aa tax ; as ARG <,=,> FAC
df7a: 4c b0 df jmp NUMCMP

                   * String comparison

df7d: a9 00 STRCMP lda #$00              ;set result type to numeric
df7f: 85 11                        sta     VALTYP
df81: c6 89                        dec     CPRTYP            ;make CPRTYP 0000<=>0
df83: 20 00 e6                     jsr     FREFAC
df86: 85 9d                        sta     FAC               ;string length
df88: 86 9e                        stx     FAC+1
df8a: 84 9f                        sty     FAC+2
df8c: a5 a8                        lda     ARG+3
df8e: a4 a9                        ldy     ARG+4
df90: 20 04 e6                     jsr     FRETMP
df93: 86 a8                        stx     ARG+3
df95: 84 a9                        sty     ARG+4
df97: aa                           tax                       ;len ARG string
df98: 38                           sec
df99: e5 9d                        sbc     FAC               ;set X-reg to smaller len
df9b: f0 08                        beq     LDFA5
df9d: a9 01                        lda     #$01
df9f: 90 04                        bcc     LDFA5
dfa1: a6 9d                        ldx     FAC
dfa3: a9 ff                        lda     #$ff
dfa5: 85 a2 LDFA5 sta FAC_SIGN ;flag which shorter
dfa7: a0 ff ldy #$ff
dfa9: e8 inx
dfaa: c8 STRCMP_1 iny
dfab: ca dex
dfac: d0 07 bne STRCMP_2 ;more chars in both strings
dfae: a6 a2 ldx FAC_SIGN ;if = so far, decide by length \*
dfb0: 30 0f NUMCMP bmi CMPDONE
dfb2: 18 clc
dfb3: 90 0c bcc CMPDONE ;...always

dfb5: b1 a8 STRCMP_2 lda (ARG+3),y
dfb7: d1 9e cmp (FAC+1),y
dfb9: f0 ef beq STRCMP_1 ;same, keep comparing
dfbb: a2 ff ldx #$ff ;in case ARG greater
dfbd: b0 02 bcs CMPDONE ;it is
dfbf: a2 01 ldx #$01 ;FAC greater \*
dfc1: e8 CMPDONE inx ;convert FF,0,1 to 0,1,2
dfc2: 8a txa
dfc3: 2a rol A ;and to 0,2,4 if C=0, else 1,2,5
dfc4: 25 16 and CPRMASK ;00000<=>
dfc6: f0 02 beq LDFCA ;if no match: false
dfc8: a9 01 lda #$01 ;at least one match: true
dfca: 4c 93 eb LDFCA jmp FLOAT

                   ********************************************************************************
                   * PDL statement                                                                *
                   *                                                                              *
                   * <<< note: arg < 4 is not checked >>                                          *
                   ********************************************************************************

dfcd: 20 fb e6 PDL jsr CONINT ;get # in X-reg
dfd0: 20 1e fb jsr MON_PREAD ;read paddle
dfd3: 4c 01 e3 jmp SNGFLT ;float result

                   ********************************************************************************
                   * DIM statement                                                                *
                   ********************************************************************************

dfd6: 20 be de NXDIM jsr CHKCOM ;separated by commas
dfd9: aa DIM tax ;non-zero, flags PTRGET DIM called
dfda: 20 e8 df jsr PTRGET2 ;allocate the array
dfdd: 20 b7 00 jsr CHRGOT ;next char
dfe0: d0 f4 bne NXDIM ;not end of statement
dfe2: 60 rts

                   * PTRGET - general variable scan
                   *
                   * Scans variable name at TXTPTR, and searches the VARTAB and ARYTAB for the
                   * name.  If not found, create variable of appropriate type.  Return with address
                   * in VARPNT and (Y,A).
                   *
                   * Actual activity controlled somewhat by two flags:
                   *
                   *   DIMFLG - nonzero if called from DIM
                   *            else = 0
                   *   SUBFLG - = $00
                   *            = $40 if called from GETARYPT
                   *            = $80 if called from DEF FN
                   *            = $C1-DA if called from FN

dfe3: a2 00 PTRGET ldx #$00
dfe5: 20 b7 00 jsr CHRGOT ;get first char of variable name
dfe8: 86 10 PTRGET2 stx DIMFLG ;x is nonzero if from DIM
dfea: 85 81 PTRGET3 sta VARNAM
dfec: 20 b7 00 jsr CHRGOT
dfef: 20 7d e0 jsr ISLETC ;is it a letter?
dff2: b0 03 bcs NAMOK ;yes, okay so far
dff4: 4c c9 de BADNAM jmp SYNERR ;no, syntax error

dff7: a2 00 NAMOK ldx #$00
dff9: 86 11 stx VALTYP
dffb: 86 12 stx VALTYP+1
dffd: 4c 07 e0 jmp PTRGET4 ;to branch across $e000 vectors

                   ********************************************************************************
                   * DOS and monitor call BASIC at $E000 and $E003                                *
                   ********************************************************************************

e000: 4c 28 f1 jmp COLD_START

e003: 4c 3c d4 jmp RESTART

e006: 00 .dd1 $00 ;wasted byte

e007: 20 b1 00 PTRGET4 jsr CHRGET ;second char of variable name
e00a: 90 05 bcc LE011 ;numeric
e00c: 20 7d e0 jsr ISLETC ;letter?
e00f: 90 0b bcc LE01C ;no, end of name
e011: aa LE011 tax ;save second char of name in X-reg
e012: 20 b1 00 LE012 jsr CHRGET ;scan to end of variable name
e015: 90 fb bcc LE012 ;numeric
e017: 20 7d e0 jsr ISLETC
e01a: b0 f6 bcs LE012 ;alpha
e01c: c9 24 LE01C cmp #‘$’              ;string?
e01e: d0 06                        bne     LE026             ;no
e020: a9 ff                        lda     #$ff
e022: 85 11 sta VALTYP
e024: d0 10 bne LE036 ;...always

e026: c9 25 LE026 cmp #‘%’ ;integer?
e028: d0 13 bne LE03D ;no
e02a: a5 14 lda SUBFLG ;yes; integer variable allowed?
e02c: 30 c6 bmi BADNAM ;no, syntax error
e02e: a9 80 lda #$80 ;yes
e030: 85 12 sta VALTYP+1 ;flag integer mode
e032: 05 81 ora VARNAM
e034: 85 81 sta VARNAM ;set sign bit on varname
e036: 8a LE036 txa ;second char of name
e037: 09 80 ora #$80 ;set sign
e039: aa tax
e03a: 20 b1 00 jsr CHRGET ;get terminating char
e03d: 86 82 LE03D stx VARNAM+1 ;store second char of name
e03f: 38 sec
e040: 05 14 ora SUBFLG ;$00 or $40 if subscripts ok, else $80
e042: e9 28 sbc #‘(’ ;if subflg=$00 and char='('...
e044: d0 03 bne LE049 ;nope
e046: 4c 1e e1 LE046 jmp ARRAY ;yes

e049: 24 14 LE049 bit SUBFLG ;check top two bits of SUBFLG
e04b: 30 02 bmi LE04F ;$80
e04d: 70 f7 bvs LE046 ;$40, called from GETARYPT
e04f: a9 00 LE04F lda #$00 ;clear SUBFLG
e051: 85 14 sta SUBFLG
e053: a5 69 lda VARTAB ;start LOWTR at simple variable table
e055: a6 6a ldx VARTAB+1
e057: a0 00 ldy #$00
e059: 86 9c LE059 stx LOWTR+1
e05b: 85 9b LE05B sta LOWTR
e05d: e4 6c cpx ARYTAB+1 ;end of simple variables?
e05f: d0 04 bne LE065 ;no, go on
e061: c5 6b cmp ARYTAB ;yes; end of arrays?
e063: f0 22 beq NAME_NOT_FOUND ;yes, make one
e065: a5 81 LE065 lda VARNAM ;same first letter?
e067: d1 9b cmp (LOWTR),y
e069: d0 08 bne LE073 ;not same first letter
e06b: a5 82 lda VARNAM+1 ;same second letter?
e06d: c8 iny
e06e: d1 9b cmp (LOWTR),y
e070: f0 6c beq SET_VARPNT_AND_YA ;yes, same variable name
e072: 88 dey ;no, bump to next name
e073: 18 LE073 clc
e074: a5 9b lda LOWTR
e076: 69 07 adc #$07
e078: 90 e1 bcc LE05B
e07a: e8 inx
e07b: d0 dc bne LE059 ;...always

                   * Check if A-reg is ASCII letter A-Z
                   *
                   * Return carry = 1 if A-Z
                   *              = 0 if not
                   *
                   * <<< NOTE: faster and shorter code: >>>
                   *    cmp #'Z'+1  ;compare hi end
                   *    bcs .1      ;above A-Z
                   *    cmp #'A'    ;compare lo end
                   *    rts         ;C=0 if lo, C=1 if A-Z
                   * .1 clc        ;C=0 if hi
                   *    rts

e07d: c9 41 ISLETC cmp #‘A’ ;compare lo end
e07f: 90 05 bcc LE086 ;C=0 if low
e081: e9 5b sbc #‘[’ ;(should be #'Z'+1) prepare hi end test
e083: 38 sec ;test hi end, restoring A-reg
e084: e9 a5 sbc #$a5 ;(should be #-1-'Z') C=0 if lo, C=1 if A-Z
e086: 60 LE086 rts

                   * Variable not found, so make one

e087: 68 NAME_NOT_FOUND pla ;look at return address on stack to
e088: 48 pha ; see if called from FRM_VARIABLE
e089: c9 d7 cmp #<FRM_VARIABLE+2
e08b: d0 0f bne MAKE_NEW_VARIABLE ;no
e08d: ba tsx
e08e: bd 02 01 lda STACK+2,x
e091: c9 de cmp #>FRM_VARIABLE
e093: d0 07 bne MAKE_NEW_VARIABLE ;no
e095: a9 9a lda #<C_ZERO ;yes, called from FRM_VARIABLE
e097: a0 e0 ldy #>C_ZERO ;point to a constant zero
e099: 60 rts ;new variable used in expression = 0

e09a: 00 00 C_ZERO .dd2 $0000 ;integer or real zero, or null string

                   * Make a new simple variable
                   *
                   * Move arrays up 7 bytes to make room for new variable.  Enter 7-byte variable
                   * data in the hole.
                   • Clear variables
                   NUMDIM          .var    $0f    {addr/1}
                   ARYPNT          .var    $94    {addr/2}
                   INDX            .var    $99    {addr/1}

e09c: a5 6b MAKE_NEW_VARIABLE lda ARYTAB ;set up call to BLTU to
e09e: a4 6c ldy ARYTAB+1 ; move from ARYTAB through STREND-1
e0a0: 85 9b sta LOWTR ; 7 bytes higher
e0a2: 84 9c sty LOWTR+1
e0a4: a5 6d lda STREND
e0a6: a4 6e ldy STREND+1
e0a8: 85 96 sta HIGHTR
e0aa: 84 97 sty HIGHTR+1
e0ac: 18 clc
e0ad: 69 07 adc #7
e0af: 90 01 bcc LE0B2
e0b1: c8 iny
e0b2: 85 94 LE0B2 sta ARYPNT
e0b4: 84 95 sty ARYPNT+1
e0b6: 20 93 d3 jsr BLTU ;move array block up
e0b9: a5 94 lda ARYPNT ;store new start of arrays
e0bb: a4 95 ldy ARYPNT+1
e0bd: c8 iny
e0be: 85 6b sta ARYTAB
e0c0: 84 6c sty ARYTAB+1
e0c2: a0 00 ldy #$00
e0c4: a5 81 lda VARNAM ;first char of name
e0c6: 91 9b sta (LOWTR),y
e0c8: c8 iny
e0c9: a5 82 lda VARNAM+1 ;second char of name
e0cb: 91 9b sta (LOWTR),y
e0cd: a9 00 lda #$00 ;set five-byte value to 0
e0cf: c8 iny
e0d0: 91 9b sta (LOWTR),y
e0d2: c8 iny
e0d3: 91 9b sta (LOWTR),y
e0d5: c8 iny
e0d6: 91 9b sta (LOWTR),y
e0d8: c8 iny
e0d9: 91 9b sta (LOWTR),y
e0db: c8 iny
e0dc: 91 9b sta (LOWTR),y \* Put address of value of variable in VARPNT and (Y,A)
e0de: a5 9b SET_VARPNT_AND_YA lda LOWTR ;LOWTR points at name of variable
e0e0: 18 clc ;so add 2 to get to value
e0e1: 69 02 adc #$02
e0e3: a4 9c ldy LOWTR+1
e0e5: 90 01 bcc LE0E8
e0e7: c8 iny
e0e8: 85 83 LE0E8 sta VARPNT ;address in VARPNT and (Y,A)
e0ea: 84 84 sty VARPNT+1
e0ec: 60 rts

                   * Compute address of first value in array
                   *
                   * ARYPNT = LOWTR + #dims*2 + 5

e0ed: a5 0f GETARY lda NUMDIM ;get # of dimensions
e0ef: 0a GETARY2 asl A ;#dims\*2 (size of each dim in 2 bytes)
e0f0: 69 05 adc #5 ;+ 5 (2 for name, 2 for offset to next array, 1 for #dims)
e0f2: 65 9b adc LOWTR ;address of this array in ARYTAB
e0f4: a4 9c ldy LOWTR+1
e0f6: 90 01 bcc LE0F9
e0f8: c8 iny
e0f9: 85 94 LE0F9 sta ARYPNT ;address of first value in array
e0fb: 84 95 sty ARYPNT+1
e0fd: 60 rts

                   * <<< meant to be -32768, which would be 9080000000 >>>
                   * <<< 1 byte short, so picks up $20 from next instruction >>>

e0fe: 90 80 00 00 NEG32768 .bulk $90,$80,$00,$00 ;-32768.00049 in floating point

                   * Evaluate numeric formula at TXTPTR, converting result to integer 0 <= X <=
                   * 32767 in FAC+3,4

e102: 20 b1 00 MAKINT jsr CHRGET
e105: 20 67 dd jsr FRMNUM
_ Convert FAC to integer. Must be positive and less than 32768.
e108: a5 a2 MKINT lda FAC_SIGN ;error if -
e10a: 30 0d bmi MI1
_ Convert FAC to integer. Must be -32767 <= FAC <= 32767.
e10c: a5 9d AYINT lda FAC ;exponent of value in FAC
e10e: c9 90 cmp #$90 ;abs(value) < 32768?
e110: 90 09 bcc MI2 ;yes, okay for integer
e112: a9 fe lda #<NEG32768 ;no; next few lines are supposed
e114: a0 e0 ldy #>NEG32768 ;to allow -32768 ($8000), but do not!
e116: 20 b2 eb jsr FCOMP ;because compared to -32768.00049
_ <<< BUG: A=-32768.00049:A%=A is accepted, but PRINT A,A% shows that A=-
_ 32768.0005 (ok), A%=32767 (wrong!) >>>
e119: d0 7e MI1 bne IQERR ;illegal quantity
e11b: 4c f2 eb MI2 jmp QINT ;convert to integer

                   * Locate array element or create an array

e11e: a5 14 ARRAY lda SUBFLG ;subscripts given?
e120: d0 47 bne LE169 ;no
_ Parse the subscript list
e122: a5 10 lda DIMFLG ;yes
e124: 05 12 ora VALTYP+1 ;set high bit if %
e126: 48 pha ;save VALTYP and DIMFLG on stack
e127: a5 11 lda VALTYP
e129: 48 pha
e12a: a0 00 ldy #$00 ;count # dimensions in Y-reg
e12c: 98 LE12C tya ;save #dims on stack
e12d: 48 pha
e12e: a5 82 lda VARNAM+1 ;save variable name on stack
e130: 48 pha
e131: a5 81 lda VARNAM
e133: 48 pha
e134: 20 02 e1 jsr MAKINT ;evaluate subscript as integer
e137: 68 pla ;restore variable name
e138: 85 81 sta VARNAM
e13a: 68 pla
e13b: 85 82 sta VARNAM+1
e13d: 68 pla ;restore # dims to Y-reg
e13e: a8 tay
e13f: ba tsx ;copy VALTYP and DIMFLG on stack
e140: bd 02 01 lda STACK+2,x ;to leave room for the subscript
e143: 48 pha
e144: bd 01 01 lda STACK+1,x
e147: 48 pha
e148: a5 a0 lda FAC+3 ;get subscript value and place in the
e14a: 9d 02 01 sta STACK+2,x ; stack where valtyp & DIMFLG were
e14d: a5 a1 lda FAC+4
e14f: 9d 01 01 sta STACK+1,x
e152: c8 iny ;count the subscript
e153: 20 b7 00 jsr CHRGOT ;next char
e156: c9 2c cmp #‘,’
e158: f0 d2 beq LE12C ;comma, parse another subscript
e15a: 84 0f sty NUMDIM ;no more subscripts, save #
e15c: 20 b8 de jsr CHKCLS ;now need ")"
e15f: 68 pla ;restore VALTYPE and DIMFLG
e160: 85 11 sta VALTYP
e162: 68 pla
e163: 85 12 sta VALTYP+1
e165: 29 7f and #$7f ;isolate DIMFLG
e167: 85 10 sta DIMFLG
_ Search array table for this array name
e169: a6 6b LE169 ldx ARYTAB ;(A,X) = start of array table
e16b: a5 6c lda ARYTAB+1
e16d: 86 9b LE16D stx LOWTR ;use LOWTR for running pointer
e16f: 85 9c sta LOWTR+1
e171: c5 6e cmp STREND+1 ;did we reach the end of arrays yet?
e173: d0 04 bne LE179 ;no, keep searching
e175: e4 6d cpx STREND
e177: f0 3f beq MAKE_NEW_ARRAY ;yes, this is a new array name
e179: a0 00 LE179 ldy #$00 ;point at 1st char of array name
e17b: b1 9b lda (LOWTR),y ;get 1st char of name
e17d: c8 iny ;point at 2nd char
e17e: c5 81 cmp VARNAM ;1st char same?
e180: d0 06 bne LE188 ;no, move to next array
e182: a5 82 lda VARNAM+1 ;yes, try 2nd char
e184: d1 9b cmp (LOWTR),y ;same?
e186: f0 16 beq USE_OLD_ARRAY ;yes, array found
e188: c8 LE188 iny ;point at offset to next array
e189: b1 9b lda (LOWTR),y ;add offset to running pointer
e18b: 18 clc
e18c: 65 9b adc LOWTR
e18e: aa tax
e18f: c8 iny
e190: b1 9b lda (LOWTR),y
e192: 65 9c adc LOWTR+1
e194: 90 d7 bcc LE16D ;...always

                   * ERROR: bad subscripts

e196: a2 6b SUBERR ldx #ERR_BADSUBS
e198: 2c bit ▼ $35a2 ;trick to skip next line \* ERROR: illegal quantity
e199: a2 35 IQERR ldx #ERR_ILLQTY
e19b: 4c 12 d4 JER jmp ERROR

                   * Found the array

e19e: a2 78 USE_OLD_ARRAY ldx #ERR_REDIMD ;set up for redim'd array error
e1a0: a5 10 lda DIMFLG ;called from DIM statement?
e1a2: d0 f7 bne JER ;yes, error
e1a4: a5 14 lda SUBFLG ;no, check if any subscripts
e1a6: f0 02 beq LE1AA ;yes, need to check the number
e1a8: 38 sec ;no, signal array found
e1a9: 60 rts

e1aa: 20 ed e0 LE1AA jsr GETARY ;set ARYPNT = addr of first element
e1ad: a5 0f lda NUMDIM ;compare number of dimensions
e1af: a0 04 ldy #4
e1b1: d1 9b cmp (LOWTR),y
e1b3: d0 e1 bne SUBERR ;not same, subscript error
e1b5: 4c 4b e2 jmp FIND_ARRAY_ELEMENT

                   * Create a new array, unless called from GETARYPT.

e1b8: a5 14 MAKE_NEW_ARRAY lda SUBFLG ;called from GETARYPT?
e1ba: f0 05 beq LE1C1 ;no
e1bc: a2 2a ldx #ERR_NODATA ;yes, give "out of data" error
e1be: 4c 12 d4 jmp ERROR

e1c1: 20 ed e0 LE1C1 jsr GETARY ;put addr of 1st element in ARYPNT
e1c4: 20 e3 d3 jsr REASON ;make sure enough memory left
_ <<< next 3 lines could be written: >>>
_ LDY #0
* STY STRING2+1
e1c7: a9 00 lda #$00 ;point Y-reg at variable name slot
e1c9: a8 tay
e1ca: 85 ae sta STRNG2+1 ;start size computation
e1cc: a2 05 ldx #$05 ;assume 5-bytes per element
e1ce: a5 81 lda VARNAM ;stuff variable name in array
e1d0: 91 9b sta (LOWTR),y
e1d2: 10 01 bpl LE1D5 ;not integer array
e1d4: ca dex ;integer array, decr. size to 4 bytes
e1d5: c8 LE1D5 iny ;point Y-reg at next char of name
e1d6: a5 82 lda VARNAM+1 ;rest of array name
e1d8: 91 9b sta (LOWTR),y
e1da: 10 02 bpl LE1DE ;real array, stick with size = 5 bytes
e1dc: ca dex ;integer or string array, adjust size
e1dd: ca dex ;to integer=2, string=3 bytes
e1de: 86 ad LE1DE stx STRNG2 ;store low byte of array element size
e1e0: a5 0f lda NUMDIM ;store number of dimensions
e1e2: c8 iny ; in 5th byte of array
e1e3: c8 iny
e1e4: c8 iny
e1e5: 91 9b sta (LOWTR),y
e1e7: a2 0b LE1E7 ldx #11 ;default dimension = 11 elements
e1e9: a9 00 lda #0 ;for hi byte of dimension if default
e1eb: 24 10 bit DIMFLG ;dimensioned array?
e1ed: 50 08 bvc LE1F7 ;no, use default value
e1ef: 68 pla ;get specified dim in (A,X)
e1f0: 18 clc ;# elements is 1 larger than
e1f1: 69 01 adc #$01 ; dimension value
e1f3: aa tax
e1f4: 68 pla
e1f5: 69 00 adc #$00
e1f7: c8 LE1F7 iny ;add this dimension to array descriptor
e1f8: 91 9b sta (LOWTR),y
e1fa: c8 iny
e1fb: 8a txa
e1fc: 91 9b sta (LOWTR),y
e1fe: 20 ad e2 jsr MULTIPLY_SUBSCRIPT ;multiply this dimension by running size (LOWTR*STRNG2->(A,X))
e201: 86 ad stx STRNG2 ;store running size in STRNG2
e203: 85 ae sta STRNG2+1
e205: a4 5e ldy INDEX ;retrieve Y saved by MULTIPLY_SUBSCRIPT
e207: c6 0f dec NUMDIM ;count down # dims
e209: d0 dc bne LE1E7 ;loop till done
_ Now (A,X) has total # bytes of array elements
e20b: 65 95 adc ARYPNT+1 ;compute address of end of this array
e20d: b0 5d bcs GME ;...too large, error
e20f: 85 95 sta ARYPNT+1
e211: a8 tay
e212: 8a txa
e213: 65 94 adc ARYPNT
e215: 90 03 bcc LE21A
e217: c8 iny
e218: f0 52 beq GME ;...too large, error
e21a: 20 e3 d3 LE21A jsr REASON ;make sure there is room up to (Y,A)
e21d: 85 6d sta STREND ;there is room so save new end of table
e21f: 84 6e sty STREND+1 ; and zero the array
e221: a9 00 lda #$00
e223: e6 ae inc STRNG2+1 ;prepare for fast zeroing loop
e225: a4 ad ldy STRNG2 ;# bytes mod 256
e227: f0 05 beq LE22E ;full page
e229: 88 LE229 dey ;clear page full
e22a: 91 94 sta (ARYPNT),y
e22c: d0 fb bne LE229
e22e: c6 95 LE22E dec ARYPNT+1 ;point to next page
e230: c6 ae dec STRNG2+1 ;count the pages
e232: d0 f5 bne LE229 ;still more to clear
e234: e6 95 inc ARYPNT+1 ;recover last DEC, point at 1st element
e236: 38 sec
e237: a5 6d lda STREND ;compute offset to end of arrays
e239: e5 9b sbc LOWTR ;and store in array descriptor
e23b: a0 02 ldy #2
e23d: 91 9b sta (LOWTR),y
e23f: a5 6e lda STREND+1
e241: c8 iny
e242: e5 9c sbc LOWTR+1
e244: 91 9b sta (LOWTR),y
e246: a5 10 lda DIMFLG ;was this called from DIM statement?
e248: d0 62 bne RTS_9 ;yes, we are finished
e24a: c8 iny ;no, now need to find the element
_ Find specified array element \*
_ LOWTR,y points at # of dims in array descriptor. The subscripts are all on
_ the stack as integers.
e24b: b1 9b FIND_ARRAY_ELEMENT lda (LOWTR),y ;get # of dimensions
e24d: 85 0f sta NUMDIM
e24f: a9 00 lda #$00 ;zero subscript accumulator
e251: 85 ad sta STRNG2
e253: 85 ae FAE_1 sta STRNG2+1
e255: c8 iny
e256: 68 pla ;pull next subscript from stack
e257: aa tax ;save in FAC+3,4
e258: 85 a0 sta FAC+3 ;and compare with dimensioned size
e25a: 68 pla
e25b: 85 a1 sta FAC+4
e25d: d1 9b cmp (LOWTR),y
e25f: 90 0e bcc FAE_2 ;subscript not too large
e261: d0 06 bne GSE ;subscript is too large
e263: c8 iny ;check low byte of subscript
e264: 8a txa
e265: d1 9b cmp (LOWTR),y
e267: 90 07 bcc FAE_3 ;not too large \*
e269: 4c 96 e1 GSE jmp SUBERR ;bad subscripts error

e26c: 4c 10 d4 GME jmp MEMERR ;mem full error

e26f: c8 FAE_2 iny ;bump pointer into descriptor
e270: a5 ae FAE_3 lda STRNG2+1 ;bypass multiplication if value so
e272: 05 ad ora STRNG2 ; far = 0
e274: 18 clc
e275: f0 0a beq LE281 ;it is zero so far
e277: 20 ad e2 jsr MULTIPLY_SUBSCRIPT ;not zero, so multiply
e27a: 8a txa ;add current subscript
e27b: 65 a0 adc FAC+3
e27d: aa tax
e27e: 98 tya
e27f: a4 5e ldy INDEX ;retrieve Y-reg saved by MULTIPLY_SUBSCRIPT
e281: 65 a1 LE281 adc FAC+4 ;finish adding current subscript
e283: 86 ad stx STRNG2 ;store accumulated offset
e285: c6 0f dec NUMDIM ;last subscript yet?
e287: d0 ca bne FAE_1 ;no, loop till done
e289: 85 ae sta STRNG2+1 ;yes, now multiply by element size
e28b: a2 05 ldx #5 ;start with size = 5
e28d: a5 81 lda VARNAM ;determine variable type
e28f: 10 01 bpl LE292 ;not integer
e291: ca dex ;integer, back down size to 4 bytes
e292: a5 82 LE292 lda VARNAM+1 ;discriminate between real and str
e294: 10 02 bpl LE298 ;it is real
e296: ca dex ;size = 3 if string, = 2 if integer
e297: ca dex
e298: 86 64 LE298 stx RESULT+2 ;set up multiplier
e29a: a9 00 lda #$00 ;hi byte of multiplier
e29c: 20 b6 e2 jsr MULTIPLY_SUBS_1 ;STRNG2 by element size
e29f: 8a txa ;add accumulated offset
e2a0: 65 94 adc ARYPNT ;to address of 1st element
e2a2: 85 83 sta VARPNT ;to get address of specified element
e2a4: 98 tya
e2a5: 65 95 adc ARYPNT+1
e2a7: 85 84 sta VARPNT+1
e2a9: a8 tay ;return with addr in VARPNT
e2aa: a5 83 lda VARPNT ; and in (Y,A)
e2ac: 60 RTS_9 rts

                   * Multiply STRNG2 by (LOWTR,Y) leaving product in (A,X).  Hi-byte also in Y.
                   * Used only by array subscript routines.

e2ad: 84 5e MULTIPLY_SUBSCRIPT sty INDEX ;save Y-reg
e2af: b1 9b lda (LOWTR),y ;get multiplier
e2b1: 85 64 sta RESULT+2 ;save in result+2,3
e2b3: 88 dey
e2b4: b1 9b lda (LOWTR),y
e2b6: 85 65 MULTIPLY_SUBS_1 sta RESULT+3 ;low byte of multiplier
e2b8: a9 10 lda #16 ;multiply 16 bits
e2ba: 85 99 sta INDX
e2bc: a2 00 ldx #$00 ;product = 0 initially
e2be: a0 00 ldy #$00
e2c0: 8a LE2C0 txa ;double product
e2c1: 0a asl A ;low byte
e2c2: aa tax
e2c3: 98 tya ;high byte
e2c4: 2a rol A ;if too large, set carry
e2c5: a8 tay
e2c6: b0 a4 bcs GME ;too large, "mem full error"
e2c8: 06 ad asl STRNG2 ;next bit of multiplicand
e2ca: 26 ae rol STRNG2+1 ; into carry
e2cc: 90 0b bcc LE2D9 ;bit=0, don't need to add
e2ce: 18 clc ;bit=1, add into partial product
e2cf: 8a txa
e2d0: 65 64 adc RESULT+2
e2d2: aa tax
e2d3: 98 tya
e2d4: 65 65 adc RESULT+3
e2d6: a8 tay
e2d7: b0 93 bcs GME ;too large, "mem full error"
e2d9: c6 99 LE2D9 dec INDX ;16 bits yet?
e2db: d0 e3 bne LE2C0 ;no, keep shuffling
e2dd: 60 rts ;yes, product in (Y,X) and (A,X)

                   ********************************************************************************
                   * FRE statement                                                                *
                   *                                                                              *
                   * Collects garbage and returns # bytes of memory left.                         *
                   ********************************************************************************

e2de: a5 11 FRE lda VALTYP ;look at value of argument
e2e0: f0 03 beq LE2E5 ;=0 means real, =$FF means string
e2e2: 20 00 e6 jsr FREFAC ;string, so set it free if temp
e2e5: 20 84 e4 LE2E5 jsr GARBAG ;collect all the garbage in sight
e2e8: 38 sec ;compute space between arrays and
e2e9: a5 6f lda FRETOP ; string temp area
e2eb: e5 6d sbc STREND
e2ed: a8 tay
e2ee: a5 70 lda FRETOP+1
e2f0: e5 6e sbc STREND+1 ;free space in (Y,A)
_ Fall into GIVAYF to float the value. Note that values over 32767 will return
_ as negative. \* \* Float the signed integer in (A,Y).
e2f2: a2 00 GIVAYF ldx #$00 ;mark FAC value type real
e2f4: 86 11 stx VALTYP
e2f6: 85 9e sta FAC+1 ;save value from A,Y in mantissa
e2f8: 84 9f sty FAC+2
e2fa: a2 90 ldx #$90 ;set exponent to 2^16
e2fc: 4c 9b eb jmp FLOAT_1 ;convert to signed fp

                   ********************************************************************************
                   * POS statement                                                                *
                   *                                                                              *
                   * Returns current line position from MON_CH.                                   *
                   ********************************************************************************

e2ff: a4 24 POS ldy MON_CH ;Get (A,Y) = MON_CH, go to GIVAYF \* Float Y-reg into FAC, giving value 0-255
e301: a9 00 SNGFLT lda #$00 ;MSB = 0
e303: 38 sec ;<<< no purpose whatsoever >>>
e304: f0 ec beq GIVAYF ;...always

                   * Check for direct or running mode, giving error if direct mode.

e306: a6 76 ERRDIR ldx CURLIN+1 ;=$FF if direct mode
e308: e8 inx ;makes $FF into zero
e309: d0 a1 bne RTS_9 ;return if running mode
e30b: a2 95 ldx #ERR_ILLDIR ;direct mode, give error
e30d: 2c bit ▼ $e0a2 ;trick to skip next 2 bytes
e30e: a2 e0 UNDFNC ldx #ERR_UNDEFFUNC ;undefined function error
e310: 4c 12 d4 jmp ERROR

                   ********************************************************************************
                   * DEF statement                                                                *
                   ********************************************************************************

e313: 20 41 e3 DEF jsr FNC\_ ;parse FN, function name
e316: 20 06 e3 jsr ERRDIR ;error if in direct mode
e319: 20 bb de jsr CHKOPN ;need "("
e31c: a9 80 lda #$80 ;flag PRTGET that called from DEF FN
e31e: 85 14 sta SUBFLG ;allow only simple fp variable for arg
e320: 20 e3 df jsr PTRGET ;get ptr to argument
e323: 20 6a dd jsr CHKNUM ;must be numeric
e326: 20 b8 de jsr CHKCLS ;must have ")" now
e329: a9 d0 lda #TOK_EQUAL ;now need "="
e32b: 20 c0 de jsr SYNCHR ;or else syntax error
e32e: 48 pha ;save char after "="
e32f: a5 84 lda VARPNT+1 ;save ptr to argument
e331: 48 pha
e332: a5 83 lda VARPNT
e334: 48 pha
e335: a5 b9 lda TXTPTR+1 ;save TXTPTR
e337: 48 pha
e338: a5 b8 lda TXTPTR
e33a: 48 pha
e33b: 20 95 d9 jsr DATA ;scan to next statement
e33e: 4c af e3 jmp FNCDATA ;store above 5 bytes in "value"

                   * Common routine for DEF FN and FN, to parse FN and the function name

e341: a9 c2 FNC\_ lda #TOK_FN ;must now see FN token
e343: 20 c0 de jsr SYNCHR ;or else syntax error
e346: 09 80 ora #$80 ;set sign bit on 1st char of name,
e348: 85 14 sta SUBFLG ; making $C0 < SUBFLG < $DB
e34a: 20 ea df jsr PTRGET3 ; which tells PTRGET who called
e34d: 85 8a sta TEMP3 ;found valid function name, so
e34f: 84 8b sty FNCNAM+1 ; save address
e351: 4c 6a dd jmp CHKNUM ;must be numeric

                   ********************************************************************************
                   * FN statement                                                                 *
                   ********************************************************************************

e354: 20 41 e3 FUNCT jsr FNC\_ ;parse FN, function name
e357: a5 8b lda FNCNAM+1 ;stack function address
e359: 48 pha ;in case of a nested FN call
e35a: a5 8a lda TEMP3
e35c: 48 pha
e35d: 20 b2 de jsr PARCHK ;must now have "(expression)"
e360: 20 6a dd jsr CHKNUM ;must be numeric expression
e363: 68 pla ;get function address back
e364: 85 8a sta TEMP3
e366: 68 pla
e367: 85 8b sta FNCNAM+1
e369: a0 02 ldy #$02 ;point at add of argument variable
e36b: b1 8a lda (TEMP3),y
e36d: 85 83 sta VARPNT
e36f: aa tax
e370: c8 iny
e371: b1 8a lda (TEMP3),y
e373: f0 99 beq UNDFNC ;undefined function
e375: 85 84 sta VARPNT+1
e377: c8 iny ;Y=4 now
e378: b1 83 LE378 lda (VARPNT),y ;save old value of argument variable
e37a: 48 pha ; on stack, in case also used as
e37b: 88 dey ; a normal variable
e37c: 10 fa bpl LE378
e37e: a4 84 ldy VARPNT+1 ;(Y,X) = address, store FAC in variable
e380: 20 2b eb jsr STORE_FAC_AT_YX_ROUNDED
e383: a5 b9 lda TXTPTR+1 ;remember TXTPTR after FN call
e385: 48 pha
e386: a5 b8 lda TXTPTR
e388: 48 pha
e389: b1 8a lda (TEMP3),y ;Y=0 from MOVMF
e38b: 85 b8 sta TXTPTR ;point to function def'n
e38d: c8 iny
e38e: b1 8a lda (TEMP3),y
e390: 85 b9 sta TXTPTR+1
e392: a5 84 lda VARPNT+1 ;save address of argument variable
e394: 48 pha
e395: a5 83 lda VARPNT
e397: 48 pha
e398: 20 67 dd jsr FRMNUM ;evaluate the function expression
e39b: 68 pla ;get address of argument variable
e39c: 85 8a sta TEMP3 ; and save it
e39e: 68 pla
e39f: 85 8b sta FNCNAM+1
e3a1: 20 b7 00 jsr CHRGOT ;must be at ":" or EOL
e3a4: f0 03 beq LE3A9 ;we are
e3a6: 4c c9 de jmp SYNERR ;we are not, syntax error

e3a9: 68 LE3A9 pla ;retrieve TXTPTR after FN call
e3aa: 85 b8 sta TXTPTR
e3ac: 68 pla
e3ad: 85 b9 sta TXTPTR+1
_ Stack now has 5-byte value of the argument variable, and FNCNAM points at the
_ variable. \* \* Store five bytes from stack at FNCNAM.
e3af: a0 00 FNCDATA ldy #$00
e3b1: 68 pla
e3b2: 91 8a sta (TEMP3),y
e3b4: 68 pla
e3b5: c8 iny
e3b6: 91 8a sta (TEMP3),y
e3b8: 68 pla
e3b9: c8 iny
e3ba: 91 8a sta (TEMP3),y
e3bc: 68 pla
e3bd: c8 iny
e3be: 91 8a sta (TEMP3),y
e3c0: 68 pla
e3c1: c8 iny
e3c2: 91 8a sta (TEMP3),y
e3c4: 60 rts

                   ********************************************************************************
                   * STR$ statement                                                               *
                   ********************************************************************************

e3c5: 20 6a dd STR jsr CHKNUM ;expresson must be numeric
e3c8: a0 00 ldy #$00 ;start string at STACK-1 ($00FF)
e3ca: 20 36 ed jsr FOUT_1 ;convert FAC to string
e3cd: 68 pla ;pop return off stack
e3ce: 68 pla
e3cf: a9 ff lda #<STACK+255 ;point to STACK-1
e3d1: a0 00 ldy #(>STACK)-1 ;which=0
e3d3: f0 12 beq STRLIT ;...always, create desc & move string

                   * Get space and make descriptor for string whose address is in FAC+3,4 and whose
                   * length is in A-reg

e3d5: a6 a0 STRINI ldx FAC+3 ;Y,X = string address
e3d7: a4 a1 ldy FAC+4
e3d9: 86 8c stx DSCPTR
e3db: 84 8d sty DSCPTR+1
_ Get space and make descriptor for string whose address is in (Y,X) and whose
_ length is in A-reg.
e3dd: 20 52 e4 STRSPA jsr GETSPA ;A-reg holds length
e3e0: 86 9e stx FAC+1 ;save descriptor in FAC
e3e2: 84 9f sty FAC+2 ;---FAC--- --FAC+1-- --FAC+2--
e3e4: 85 9d sta FAC ;<length> <addr-lo> <addr-hi>
e3e6: 60 rts

                   * Build a descriptor for string starting at (Y,A) and terminated by $00 or
                   * quotation mark.  Return with descriptor in a temporary and address of
                   * descriptor in FAC+3,4.

e3e7: a2 22 STRLIT ldx #‘"’ ;set up literal scan to stop on
e3e9: 86 0d stx CHARAC ;quotation mark or $00
e3eb: 86 0e                        stx     ENDCHR
                   * Build a descriptor for string starting at (Y,A) and terminated by $00, CHARAC,
                   * or ENDCHR.
                   *
                   * Return with descriptor in a temporary and address of descriptor in FAC+3,4.
e3ed: 85 ab        STRLT2          sta     STRNG1            ;save address of string
e3ef: 84 ac                        sty     STRNG1+1
e3f1: 85 9e                        sta     FAC+1             ;...again
e3f3: 84 9f                        sty     FAC+2
e3f5: a0 ff                        ldy     #$ff
e3f7: c8 LE3F7 iny ;find end of string
e3f8: b1 ab lda (STRNG1),y ;next string char
e3fa: f0 0c beq LE408 ;end of string
e3fc: c5 0d cmp CHARAC ;alternate terminator #1?
e3fe: f0 04 beq LE404 ;yes
e400: c5 0e cmp ENDCHR ;alternate terminator #2?
e402: d0 f3 bne LE3F7 ;no, keep scanning
e404: c9 22 LE404 cmp #‘"’ ;is string ended with quote mark?
e406: f0 01 beq LE409 ;yes, C=1 to include " in string
e408: 18 LE408 clc
e409: 84 9d LE409 sty FAC ;save length
e40b: 98 tya
e40c: 65 ab adc STRNG1 ;compute address of end of string
e40e: 85 ad sta STRNG2 ;(of 00 byte, or just after ")
e410: a6 ac ldx STRNG1+1
e412: 90 01 bcc LE415
e414: e8 inx
e415: 86 ae LE415 stx STRNG2+1
e417: a5 ac lda STRNG1+1 ;where does the string start?
e419: f0 04 beq LE41F ;page 0, must be from STR$ function
e41b: c9 02 cmp #2 ;page 2?
e41d: d0 0b bne PUTNEW ;no, not page 0 or 2
e41f: 98 LE41F tya ;length of string
e420: 20 d5 e3 jsr STRINI ;make space for string
e423: a6 ab ldx STRNG1
e425: a4 ac ldy STRNG1+1
e427: 20 e2 e5 jsr MOVSTR ;move it in
_ Store descriptor in temporary descriptor stack.
_
_ The descriptor is now in FAC, FAC+1, FAC+2. Put address of temp descriptor in
_ FAC+3,4.
e42a: a6 52 PUTNEW ldx TEMPPT ;pointer to next temp string slot
e42c: e0 5e cpx #TEMPST+9 ;max of 3 temp strings
e42e: d0 05 bne PUTEMP ;room for another one
e430: a2 bf ldx #ERR_FRMCPX ;too many, formula too complex
e432: 4c 12 d4 JERR jmp ERROR

                   • Clear variables
                   GARFLG          .var    $13    {addr/1}   ;overlaps DATAFLG
                   LASTPT          .var    $53    {addr/1}   ;overlaps TEMPPT+1
                   ARYPNT          .var    $94    {addr/2}   ;Overlaps HIGHDS

e435: a5 9d PUTEMP lda FAC ;copy temp descriptor into temp stack
e437: 95 00 sta 0,x
e439: a5 9e lda FAC+1
e43b: 95 01 sta 1,x
e43d: a5 9f lda FAC+2
e43f: 95 02 sta 2,x
e441: a0 00 ldy #$00
e443: 86 a0                        stx     FAC+3             ;address of temp descriptor
e445: 84 a1                        sty     FAC+4             ;in (Y,X) and FAC+3,4
e447: 88                           dey                       ;Y=$FF
e448: 84 11 sty VALTYP ;flag FAC as string
e44a: 86 53 stx LASTPT ;index of last pointer
e44c: e8 inx ;update for next temp entry
e44d: e8 inx
e44e: e8 inx
e44f: 86 52 stx TEMPPT
e451: 60 rts

                   * Make space for string at bottom of string space.
                   *
                   *   A-reg = # bytes space to make
                   *
                   * Return with A-reg same, and (Y,X) = address of space allocated

e452: 46 13 GETSPA lsr GARFLG ;clear signbit of flag
e454: 48 LE454 pha ;A-reg holds length
e455: 49 ff eor #$ff ;get -length
e457: 38 sec
e458: 65 6f adc FRETOP ;compute starting address of space
e45a: a4 70 ldy FRETOP+1 ;for the string
e45c: b0 01 bcs LE45F
e45e: 88 dey
e45f: c4 6e LE45F cpy STREND+1 ;see if fits in remaining memory
e461: 90 11 bcc LE474 ;no, try garbage
e463: d0 04 bne LE469 ;yes, it fits
e465: c5 6d cmp STREND ;have to check lower bytes
e467: 90 0b bcc LE474 ;not enuf room yet
e469: 85 6f LE469 sta FRETOP ;there is room so save new FRETOP
e46b: 84 70 sty FRETOP+1
e46d: 85 71 sta FRESPC
e46f: 84 72 sty FRESPC+1
e471: aa tax ;addr in (Y,X)
e472: 68 pla ;length in A-reg
e473: 60 rts

e474: a2 4d LE474 ldx #ERR_MEMFULL
e476: a5 13 lda GARFLG ;garbage done yet?
e478: 30 b8 bmi JERR ;yes, memory is really full
e47a: 20 84 e4 jsr GARBAG ;no, try collecting now
e47d: a9 80 lda #$80 ;flag that collected garbage already
e47f: 85 13 sta GARFLG
e481: 68 pla ;get string length again
e482: d0 d0 bne LE454 ;...always

                   * Shove all referenced strings as high as possible in memory (against HIMEM),
                   * freeing up space below string area down to STREND.

e484: a6 73 GARBAG ldx MEMSIZE ;collect from top down
e486: a5 74 lda MEMSIZE+1
e488: 86 6f FIND_HIGHEST_STRING stx FRETOP ;one pass through all vars
e48a: 85 70 sta FRETOP+1 ;for each active string!
e48c: a0 00 ldy #$00
e48e: 84 8b sty FNCNAM+1 ;flag in case no strings to collect
e490: a5 6d lda STREND
e492: a6 6e ldx STREND+1
e494: 85 9b sta LOWTR
e496: 86 9c stx LOWTR+1 \* Start by collecting temporaries.
e498: a9 55 lda #TEMPST
e49a: a2 00 ldx #>TEMPST
e49c: 85 5e sta INDEX
e49e: 86 5f stx INDEX+1
e4a0: c5 52 LE4A0 cmp TEMPPT ;finished with temps yet?
e4a2: f0 05 beq LE4A9 ;yes, now do simple variables
e4a4: 20 23 e5 jsr CHECK_VARIABLE ;do a temp
e4a7: f0 f7 beq LE4A0 ;...always

                   * Now collect simple variables.

e4a9: a9 07 LE4A9 lda #7 ;length of each variable is 7 bytes
e4ab: 85 8f sta DSCLEN
e4ad: a5 69 lda VARTAB ;start at beginning of vartab
e4af: a6 6a ldx VARTAB+1
e4b1: 85 5e sta INDEX
e4b3: 86 5f stx INDEX+1
e4b5: e4 6c LE4B5 cpx ARYTAB+1 ;finished with simple variables?
e4b7: d0 04 bne LE4BD ;no
e4b9: c5 6b cmp ARYTAB ;maybe, check low byte
e4bb: f0 05 beq LE4C2 ;yes, now do arrays
e4bd: 20 19 e5 LE4BD jsr CHECK_SIMPLE_VARIABLE
e4c0: f0 f3 beq LE4B5 ;...always

                   * Now collect array variables.

e4c2: 85 94 LE4C2 sta ARYPNT
e4c4: 86 95 stx ARYPNT+1
e4c6: a9 03 lda #3 ;descriptors in arrays are 3 bytes each
e4c8: 85 8f sta DSCLEN
e4ca: a5 94 LE4CA lda ARYPNT ;compare to end of arrays
e4cc: a6 95 ldx ARYPNT+1
e4ce: e4 6e LE4CE cpx STREND+1 ;finished with arrays yet?
e4d0: d0 07 bne LE4D9 ;not yet
e4d2: c5 6d cmp STREND ;maybe, check low byte
e4d4: d0 03 bne LE4D9 ;not finished yet
e4d6: 4c 62 e5 jmp MOVE_HIGHEST_STRING_TO_TOP ;finished

e4d9: 85 5e LE4D9 sta INDEX ;set up ptr to start of array
e4db: 86 5f stx INDEX+1
e4dd: a0 00 ldy #$00 ;point at name of array
e4df: b1 5e lda (INDEX),y
e4e1: aa tax ;1st letter of name in X-reg
e4e2: c8 iny
e4e3: b1 5e lda (INDEX),y
e4e5: 08 php ;status from second letter of name
e4e6: c8 iny
e4e7: b1 5e lda (INDEX),y ;offset to next array
e4e9: 65 94 adc ARYPNT ;(carry always clear)
e4eb: 85 94 sta ARYPNT ;calculate start of next array
e4ed: c8 iny
e4ee: b1 5e lda (INDEX),y ;hi byte of offset
e4f0: 65 95 adc ARYPNT+1
e4f2: 85 95 sta ARYPNT+1
e4f4: 28 plp ;get status from 2nd char of name
e4f5: 10 d3 bpl LE4CA ;not a string array
e4f7: 8a txa ;set status with 1st char of name
e4f8: 30 d0 bmi LE4CA ;not a string array
e4fa: c8 iny
e4fb: b1 5e lda (INDEX),y ;# of dimensions for this array
e4fd: a0 00 ldy #$00
e4ff: 0a asl A ;preamble size = 2\*#dims + 5
e500: 69 05 adc #5
e502: 65 5e adc INDEX ;make index point at first element
e504: 85 5e sta INDEX ; in the array
e506: 90 02 bcc LE50A
e508: e6 5f inc INDEX+1
e50a: a6 5f LE50A ldx INDEX+1 ;step thru each string in this array
e50c: e4 95 LE50C cpx ARYPNT+1 ;array done?
e50e: d0 04 bne LE514 ;no, process next element
e510: c5 94 cmp ARYPNT ;maybe, check low byte
e512: f0 ba beq LE4CE ;yes, move to next array
e514: 20 23 e5 LE514 jsr CHECK_VARIABLE ;process the array
e517: f0 f3 beq LE50C ;...always

                   * Process a simple variable.

e519: b1 5e CHECK_SIMPLE_VARIABLE lda (INDEX),y ;look at 1st char of name
e51b: 30 35 bmi CHECK_BUMP ;not a string variable
e51d: c8 iny
e51e: b1 5e lda (INDEX),y ;look at 2nd char of name
e520: 10 30 bpl CHECK_BUMP ;not a string variable
e522: c8 iny
_ If string is not empty, check if it is highest.
e523: b1 5e CHECK_VARIABLE lda (INDEX),y ;get length of string
e525: f0 2b beq CHECK_BUMP ;ignore string if length is zero
e527: c8 iny
e528: b1 5e lda (INDEX),y ;get address of string
e52a: aa tax
e52b: c8 iny
e52c: b1 5e lda (INDEX),y
e52e: c5 70 cmp FRETOP+1 ;check if already collected
e530: 90 06 bcc LE538 ;no, below FRETOP
e532: d0 1e bne CHECK_BUMP ;yes, above FRETOP
e534: e4 6f cpx FRETOP ;maybe, check low byte
e536: b0 1a bcs CHECK_BUMP ;yes, above FRETOP
e538: c5 9c LE538 cmp LOWTR+1 ;above highest string found?
e53a: 90 16 bcc CHECK_BUMP ;no, ignore for now
e53c: d0 04 bne LE542 ;yes, this is the new highest
e53e: e4 9b cpx LOWTR ;maybe, try low byte
e540: 90 10 bcc CHECK_BUMP ;no, ignore for now
e542: 86 9b LE542 stx LOWTR ;make this the highest string
e544: 85 9c sta LOWTR+1
e546: a5 5e lda INDEX ;save address of descriptor too
e548: a6 5f ldx INDEX+1
e54a: 85 8a sta TEMP3
e54c: 86 8b stx FNCNAM+1
e54e: a5 8f lda DSCLEN
e550: 85 91 sta LENGTH
_ Add DSCLEN to ptr in INDEX. Return with Y=0, ptr also in (X,A).
e552: a5 8f CHECK_BUMP lda DSCLEN ;bump to next variable
e554: 18 clc
e555: 65 5e adc INDEX
e557: 85 5e sta INDEX
e559: 90 02 bcc CHECK_EXIT
e55b: e6 5f inc INDEX+1
e55d: a6 5f CHECK_EXIT ldx INDEX+1
e55f: a0 00 ldy #$00
e561: 60 rts

                   * Found highest non-empty string, so move it to top and go back for another.
                   • Clear variables
                   LASTPT          .var    $53    {addr/2}   ;Overlaps TEMPPT+1

e562: a6 8b MOVE_HIGHEST_STRING_TO_TOP ldx FNCNAM+1 ;any string found?
e564: f0 f7 beq CHECK_EXIT ;no, return
e566: a5 91 lda LENGTH ;get length of variable element
e568: 29 04 and #$04 ;was 7 or 3, make 4 or 0
e56a: 4a lsr A ;2 or 0; in simple variables,
e56b: a8 tay ; name precedes descriptor
e56c: 85 91 sta LENGTH ;2 or 0
e56e: b1 8a lda (TEMP3),y ;get length from descriptor
e570: 65 9b adc LOWTR ;carry already cleared by LSR
e572: 85 96 sta HIGHTR ;string is btwn LOWTR and HIGHTR
e574: a5 9c lda LOWTR+1
e576: 69 00 adc #$00
e578: 85 97 sta HIGHTR+1
e57a: a5 6f lda FRETOP ;high end destination
e57c: a6 70 ldx FRETOP+1
e57e: 85 94 sta HIGHDS
e580: 86 95 stx HIGHDS+1
e582: 20 9a d3 jsr BLTU2 ;move string up
e585: a4 91 ldy LENGTH ;fix its descriptor
e587: c8 iny ;point at address in descriptor
e588: a5 94 lda HIGHDS ;store new address
e58a: 91 8a sta (TEMP3),y
e58c: aa tax
e58d: e6 95 inc HIGHDS+1 ;correct BTLU's overshoot
e58f: a5 95 lda HIGHDS+1
e591: c8 iny
e592: 91 8a sta (TEMP3),y
e594: 4c 88 e4 jmp FIND_HIGHEST_STRING

                   * Concatenate two strings.

e597: a5 a1 CAT lda FAC+4 ;save address of first descriptor
e599: 48 pha
e59a: a5 a0 lda FAC+3
e59c: 48 pha
e59d: 20 60 de jsr FRM_ELEMENT ;get second string element
e5a0: 20 6c dd jsr CHKSTR ;must be a string
e5a3: 68 pla ;recover address of 1st descriptor
e5a4: 85 ab sta STRNG1
e5a6: 68 pla
e5a7: 85 ac sta STRNG1+1
e5a9: a0 00 ldy #$00
e5ab: b1 ab lda (STRNG1),y ;add lenghts, get concatenated size
e5ad: 18 clc
e5ae: 71 a0 adc (FAC+3),y
e5b0: 90 05 bcc LE5B7 ;ok if < $100
e5b2: a2 b0 ldx #ERR_STRLONG
e5b4: 4c 12 d4 jmp ERROR

e5b7: 20 d5 e3 LE5B7 jsr STRINI ;get space for concatenated strings
e5ba: 20 d4 e5 jsr MOVINS ;move 1st string
e5bd: a5 8c lda DSCPTR
e5bf: a4 8d ldy DSCPTR+1
e5c1: 20 04 e6 jsr FRETMP
e5c4: 20 e6 e5 jsr MOVSTR_1 ;move 2nd string
e5c7: a5 ab lda STRNG1
e5c9: a4 ac ldy STRNG1+1
e5cb: 20 04 e6 jsr FRETMP
e5ce: 20 2a e4 jsr PUTNEW ;set up descriptor
e5d1: 4c 95 dd jmp FRMEVL_2 ;finish expression

                   * Get string descriptor pointed at by STRNG1 and move described string to
                   * FRESPC.

e5d4: a0 00 MOVINS ldy #$00
e5d6: b1 ab lda (STRNG1),y
e5d8: 48 pha ;length
e5d9: c8 iny
e5da: b1 ab lda (STRNG1),y
e5dc: aa tax ;put string pointer in (X,Y)
e5dd: c8 iny
e5de: b1 ab lda (STRNG1),y
e5e0: a8 tay
e5e1: 68 pla ;retrieve length
_ Move string at (Y,X) with length in A-reg to destination whose address is in
_ FRESPC,FRESPC+1.
e5e2: 86 5e MOVSTR stx INDEX ;put pointer in INDEX
e5e4: 84 5f sty INDEX+1
e5e6: a8 MOVSTR_1 tay ;length to Y-reg
e5e7: f0 0a beq LE5F3 ;if length is zero, finished
e5e9: 48 pha ;save length on stack
e5ea: 88 LE5EA dey ;move bytes from INDEX to FRESPC
e5eb: b1 5e lda (INDEX),y
e5ed: 91 71 sta (FRESPC),y
e5ef: 98 tya ;test if any left to move
e5f0: d0 f8 bne LE5EA ;yes, keep moving
e5f2: 68 pla ;no, finished; get length
e5f3: 18 LE5F3 clc ; and add to FRESPC, so
e5f4: 65 71 adc FRESPC ; FRESPC points to next higher
e5f6: 85 71 sta FRESPC ; byte (used by concatenation)
e5f8: 90 02 bcc LE5FC
e5fa: e6 72 inc FRESPC+1
e5fc: 60 LE5FC rts

                   * If FAC is a temporary string, release descriptor.

e5fd: 20 6c dd FRESTR jsr CHKSTR ;last result a string?
_ If string descriptor pointed to be FAC+3,4 is a temporary string, release it.
e600: a5 a0 FREFAC lda FAC+3 ;get descriptor pointer
e602: a4 a1 ldy FAC+4
_ If string descriptor whose address is in (Y,A) is a temporary string, release \* it.
e604: 85 5e FRETMP sta INDEX ;save the address of the descriptor
e606: 84 5f sty INDEX+1
e608: 20 35 e6 jsr FRETMS ;free descriptor if it is temporary
e60b: 08 php ;remember if temp
e60c: a0 00 ldy #$00 ;point at length of string
e60e: b1 5e lda (INDEX),y
e610: 48 pha ;save length on stack
e611: c8 iny
e612: b1 5e lda (INDEX),y
e614: aa tax ;get address of string in (Y,X)
e615: c8 iny
e616: b1 5e lda (INDEX),y
e618: a8 tay
e619: 68 pla ;length in A-reg
e61a: 28 plp ;retrieve status, Z=1 if temp
e61b: d0 13 bne LE630 ;not a temporary string
e61d: c4 70 cpy FRETOP+1 ;is it the lowest string?
e61f: d0 0f bne LE630 ;no
e621: e4 6f cpx FRETOP
e623: d0 0b bne LE630 ;no
e625: 48 pha ;yes, push length again
e626: 18 clc ;recover the space used by
e627: 65 6f adc FRETOP ; the string
e629: 85 6f sta FRETOP
e62b: 90 02 bcc LE62F
e62d: e6 70 inc FRETOP+1
e62f: 68 LE62F pla ;retrieve length again
e630: 86 5e LE630 stx INDEX ;address of string in (Y,X)
e632: 84 5f sty INDEX+1 ;length of string in A-reg
e634: 60 rts

                   * Release temporary descriptor if (Y,A) = LASTPT.

e635: c4 54 FRETMS cpy LASTPT+1 ;compare (Y,A) to latest temp
e637: d0 0c bne LE645 ;not same one, cannot release
e639: c5 53 cmp LASTPT
e63b: d0 08 bne LE645 ;not same one, cannot release
e63d: 85 52 sta TEMPPT ;update TEMPPT for next temp
e63f: e9 03 sbc #3 ;back off LASTPT
e641: 85 53 sta LASTPT
e643: a0 00 ldy #$00 ;now (Y,A) points to top temp
e645: 60 LE645 rts ;Z=0 if not temp, Z=1 if temp

                   ********************************************************************************
                   * CHR$ statement                                                               *
                   ********************************************************************************

e646: 20 fb e6 CHRSTR jsr CONINT ;convert argument to byte in X-reg
e649: 8a txa
e64a: 48 pha ;save it
e64b: a9 01 lda #$01 ;get space for string of length 1
e64d: 20 dd e3 jsr STRSPA
e650: 68 pla ;recall the character
e651: a0 00 ldy #$00 ;put in string
e653: 91 9e sta (FAC+1),y
e655: 68 pla ;pop return address
e656: 68 pla
e657: 4c 2a e4 jmp PUTNEW ;make it a temporary string

                   ********************************************************************************
                   * LEFT$ statement                                                              *
                   ********************************************************************************

e65a: 20 b9 e6 LEFTSTR jsr SUBSTRING_SETUP
e65d: d1 8c cmp (DSCPTR),y ;compare 1st parameter to length
e65f: 98 tya ;Y=A=0
e660: 90 04 SUBSTRING_1 bcc LE666 ;1st parameter smaller, use it
e662: b1 8c lda (DSCPTR),y ;1st is longer, use string length
e664: aa tax ;in X-reg
e665: 98 tya ;Y=A=0 again
e666: 48 LE666 pha ;push left end of substring
e667: 8a SUBSTRING_2 txa
e668: 48 SUBSTRING_3 pha ;push length of substring
e669: 20 dd e3 jsr STRSPA ;make room for string of A-reg bytes
e66c: a5 8c lda DSCPTR ;release parameter string if temp
e66e: a4 8d ldy DSCPTR+1
e670: 20 04 e6 jsr FRETMP
e673: 68 pla ;get length of substring
e674: a8 tay ;in Y-reg
e675: 68 pla ;get left end of substring
e676: 18 clc ;add to pointer to string
e677: 65 5e adc INDEX
e679: 85 5e sta INDEX
e67b: 90 02 bcc LE67F
e67d: e6 5f inc INDEX+1
e67f: 98 LE67F tya ;length
e680: 20 e6 e5 jsr MOVSTR_1 ;copy string into space
e683: 4c 2a e4 jmp PUTNEW ;add to temps

                   ********************************************************************************
                   * RIGHT$ statement                                                             *
                   ********************************************************************************

e686: 20 b9 e6 RIGHTSTR jsr SUBSTRING_SETUP
e689: 18 clc ;compute length-width of substring
e68a: f1 8c sbc (DSCPTR),y ;to get starting point in string
e68c: 49 ff eor #$ff
e68e: 4c 60 e6                     jmp     SUBSTRING_1       ;join LEFT$

                   ********************************************************************************
                   * MID$ statement                                                               *
                   ********************************************************************************

e691: a9 ff MIDSTR lda #$ff              ;flag whether 2nd parameter
e693: 85 a1                        sta     FAC+4
e695: 20 b7 00                     jsr     CHRGOT            ;see if ")" yet
e698: c9 29                        cmp     #‘)’
e69a: f0 06                        beq     LE6A2             ;yes, no 2nd parameter
e69c: 20 be de                     jsr     CHKCOM            ;no, must have comma
e69f: 20 f8 e6                     jsr     GETBYT            ;get 2nd param in X-reg
e6a2: 20 b9 e6     LE6A2           jsr     SUBSTRING_SETUP
e6a5: ca                           dex                       ;1st parameter - 1
e6a6: 8a                           txa
e6a7: 48                           pha
e6a8: 18                           clc
e6a9: a2 00                        ldx     #$00
e6ab: f1 8c                        sbc     (DSCPTR),y
e6ad: b0 b8                        bcs     SUBSTRING_2
e6af: 49 ff                        eor     #$ff
e6b1: c5 a1 cmp FAC+4 ;use smaller of two
e6b3: 90 b3 bcc SUBSTRING_3
e6b5: a5 a1 lda FAC+4
e6b7: b0 af bcs SUBSTRING_3 ;...always

                   * Common setup routine for LEFT$, RIGHT$, MID$: require ")"; pop return adrs,
                   * get descriptor address, get 1st parameter of command

e6b9: 20 b8 de SUBSTRING_SETUP jsr CHKCLS ;require ")"
e6bc: 68 pla ;save return address
e6bd: a8 tay ; in Y-reg and LENGTH
e6be: 68 pla
e6bf: 85 91 sta LENGTH
e6c1: 68 pla ;pop previous return address
e6c2: 68 pla ; (from GOROUT)
e6c3: 68 pla ;retrieve 1st parameter
e6c4: aa tax
e6c5: 68 pla ;get address of string descriptor
e6c6: 85 8c sta DSCPTR
e6c8: 68 pla
e6c9: 85 8d sta DSCPTR+1
e6cb: a5 91 lda LENGTH ;restore return address
e6cd: 48 pha
e6ce: 98 tya
e6cf: 48 pha
e6d0: a0 00 ldy #$00
e6d2: 8a txa ;get 1st parameter in A-reg
e6d3: f0 1d beq GOIQ ;error if 0
e6d5: 60 rts

                   ********************************************************************************
                   * LEN statement                                                                *
                   ********************************************************************************

e6d6: 20 dc e6 LEN jsr GETSTR ;get length in Y-reg, make FAC numeric
e6d9: 4c 01 e3 jmp SNGFLT ;float Y-reg into FAC

                   * If last result is a temporary string, free it.  Make VALTYP numeric, return
                   * length in Y-reg.

e6dc: 20 fd e5 GETSTR jsr FRESTR ;if last result is a string, free it
e6df: a2 00 ldx #$00 ;make VALTYP numeric
e6e1: 86 11 stx VALTYP
e6e3: a8 tay ;length of string to Y-reg
e6e4: 60 rts

                   ********************************************************************************
                   * ASC statement                                                                *
                   ********************************************************************************

e6e5: 20 dc e6 ASC jsr GETSTR ;get string, get length in Y-reg
e6e8: f0 08 beq GOIQ ;error if length 0
e6ea: a0 00 ldy #$00
e6ec: b1 5e lda (INDEX),y ;get 1st char of string
e6ee: a8 tay
e6ef: 4c 01 e3 jmp SNGFLT ;float Y-reg into FAC

e6f2: 4c 99 e1 GOIQ jmp IQERR ;illegal quantity error

                   * Scan to next character and convert expression to single byte in X-reg.

e6f5: 20 b1 00 GTBYTC jsr CHRGET
_ Evaluate expression at TXTPTR, and convert it to single byte in X-reg.
e6f8: 20 67 dd GETBYT jsr FRMNUM
_ Convert FAC to single-byte integer in X-reg.
e6fb: 20 08 e1 CONINT jsr MKINT ;convert if in range -32767 to +32767
e6fe: a6 a0 ldx FAC+3 ;high byte must be zero
e700: d0 f0 bne GOIQ ;value > 255, error
e702: a6 a1 ldx FAC+4 ;value in X-reg
e704: 4c b7 00 jmp CHRGOT ;get next char in A-reg

                   ********************************************************************************
                   * VAL statement                                                                *
                   ********************************************************************************

e707: 20 dc e6 VAL jsr GETSTR ;get pointer to string in index
e70a: d0 03 bne LE70F ;length non-zero
e70c: 4c 4e e8 jmp ZERO_FAC ;return 0 if length=0

e70f: a6 b8 LE70F ldx TXTPTR ;save current TXTPTR
e711: a4 b9 ldy TXTPTR+1
e713: 86 ad stx STRNG2
e715: 84 ae sty STRNG2+1
e717: a6 5e ldx INDEX
e719: 86 b8 stx TXTPTR ;point TXTPTR to start of string
e71b: 18 clc
e71c: 65 5e adc INDEX ;add length
e71e: 85 60 sta DEST ;point DEST to end of string + 1
e720: a6 5f ldx INDEX+1
e722: 86 b9 stx TXTPTR+1
e724: 90 01 bcc LE727
e726: e8 inx
e727: 86 61 LE727 stx DEST+1
e729: a0 00 ldy #$00              ;save byte that follows string
e72b: b1 60                        lda     (DEST),y          ; on stack
e72d: 48                           pha
e72e: a9 00                        lda     #$00              ;and store $00 in its place
e730: 91 60                        sta     (DEST),y
                   * <<< That causes a bug if HIMEM=$BFFF, because storing $00 at $C000 is no use;
_ $C000 will always be last char typed, so FIN won't terminate until it sees a
_ zero at $C010! >>>
e732: 20 b7 00 jsr CHRGOT ;prime the pump
e735: 20 4a ec jsr FIN ;evalute string
e738: 68 pla ;get byte that should follow string
e739: a0 00 ldy #$00 ;and put it back
e73b: 91 60 sta (DEST),y \* Copy STRNG2 into TXTPTR.
e73d: a6 ad POINT ldx STRNG2
e73f: a4 ae ldy STRNG2+1
e741: 86 b8 stx TXTPTR
e743: 84 b9 sty TXTPTR+1
e745: 60 rts

                   * Evalute "EXP1,EXP2"
                   *
                   *   Convert EXP1 to 16-bit number in LINNUM
                   *   Convert EXP2 to 8-bit number in X-reg

e746: 20 67 dd GTNUM jsr FRMNUM
e749: 20 52 e7 jsr GETADR
_ Evaluate ",expression"
_ \* Convert expression to single byte in X-reg
e74c: 20 be de COMBYTE jsr CHKCOM ;must have comma first
e74f: 4c f8 e6 jmp GETBYT ;convert expression to byte in X-reg

                   * Convert FAC to a 16-bit value in LINNUM.

e752: a5 9d GETADR lda FAC ;FAC < 2^16?
e754: c9 91 cmp #$91
e756: b0 9a bcs GOIQ ;no, illegal quantity
e758: 20 f2 eb jsr QINT ;convert to integer
e75b: a5 a0 lda FAC+3 ;copy it into LINNUM
e75d: a4 a1 ldy FAC+4
e75f: 84 50 sty LINNUM ;to LINNUM
e761: 85 51 sta LINNUM+1
e763: 60 rts

                   ********************************************************************************
                   * PEEK statement                                                               *
                   ********************************************************************************

e764: a5 50 PEEK lda LINNUM ;save LINNUM on stack during peek
e766: 48 pha
e767: a5 51 lda LINNUM+1
e769: 48 pha
e76a: 20 52 e7 jsr GETADR ;get address peeking at
e76d: a0 00 ldy #$00
e76f: b1 50 lda (LINNUM),y ;take a quick look
e771: a8 tay ;value in Y-reg
e772: 68 pla ;restore LINNUM from stack
e773: 85 51 sta LINNUM+1
e775: 68 pla
e776: 85 50 sta LINNUM
e778: 4c 01 e3 jmp SNGFLT ;float Y-reg into FAC

                   ********************************************************************************
                   * POKE statement                                                               *
                   ********************************************************************************

e77b: 20 46 e7 POKE jsr GTNUM ;get the address and value
e77e: 8a txa ;value in A,
e77f: a0 00 ldy #$00
e781: 91 50 sta (LINNUM),y ;store it away,
e783: 60 rts ;and that's all for today.

                   ********************************************************************************
                   * WAIT statement                                                               *
                   ********************************************************************************

e784: 20 46 e7 WAIT jsr GTNUM ;get address in LINNUM, mask in X-reg
e787: 86 85 stx FORPNT ;save mask
e789: a2 00 ldx #$00
e78b: 20 b7 00 jsr CHRGOT ;another parameter?
e78e: f0 03 beq LE793 ;no, use $00 for exclusive-or
e790: 20 4c e7 jsr COMBYTE ;get xor-mask
e793: 86 86 LE793 stx FORPNT+1 ;save xor-mask here
e795: a0 00 ldy #$00
e797: b1 50 LE797 lda (LINNUM),y ;get byte at address
e799: 45 86 eor FORPNT+1 ;invert specified bits
e79b: 25 85 and FORPNT ;select specified bits
e79d: f0 f8 beq LE797 ;loop till not 0
e79f: 60 RTS_10 rts

                   * Add 0.5 to FAC
                   • Clear variables
                   ARG_EXTENSION   .var    $92    {addr/1}   ;Overlaps LENGTH+1
                   SGNCPR          .var    $ab    {addr/1}   ;flags opp sign in fp routines
                   FAC_EXTENSION   .var    $ac    {addr/1}   ;Overlaps STRNG1+1

e7a0: a9 64 FADDH lda #<CON_HALF ;FAC + 1/2 -> FAC
e7a2: a0 ee ldy #>CON_HALF
e7a4: 4c be e7 jmp FADD

                   * FAC = (Y,A) - FAC

e7a7: 20 e3 e9 FSUB jsr LOAD_ARG_FROM_YA \* FAC = ARG - FAC
e7aa: a5 a2 FSUBT lda FAC_SIGN ;complement FAC and add
e7ac: 49 ff eor #$ff
e7ae: 85 a2 sta FAC_SIGN
e7b0: 45 aa eor ARG_SIGN ;fix SGNCPR too
e7b2: 85 ab sta SGNCPR
e7b4: a5 9d lda FAC ;make status show FAC exponent
e7b6: 4c c1 e7 jmp FADDT ;join FADD

                   * Shift smaller argument more than 7 bits.

e7b9: 20 f0 e8 FADD_1 jsr SHIFT_RIGHT ;align radix by shifting
e7bc: 90 3c bcc FADD_3 ;...always

                   * FAC = (Y,A) + FAC

e7be: 20 e3 e9 FADD jsr LOAD_ARG_FROM_YA \* FAC = ARG + FAC
e7c1: d0 03 FADDT bne LE7C6 ;FAC is non-zero
e7c3: 4c 53 eb jmp COPY_ARG_TO_FAC ;FAC = 0 + ARG

e7c6: a6 ac LE7C6 ldx FAC_EXTENSION
e7c8: 86 92 stx ARG_EXTENSION
e7ca: a2 a5 ldx #ARG ;set up to shift ARG
e7cc: a5 a5 lda ARG ;exponent \*
e7ce: a8 FADD_2 tay
e7cf: f0 ce beq RTS_10 ;if ARG=0, we are finished
e7d1: 38 sec
e7d2: e5 9d sbc FAC ;get difference of exp
e7d4: f0 24 beq FADD_3 ;go add if same exp
e7d6: 90 12 bcc LE7EA ;arg has smaller exponent
e7d8: 84 9d sty FAC ;exp has smaller exponent
e7da: a4 aa ldy ARG_SIGN
e7dc: 84 a2 sty FAC_SIGN
e7de: 49 ff eor #$ff ;complement shift count
e7e0: 69 00 adc #$00 ;carry was set
e7e2: a0 00 ldy #$00
e7e4: 84 92 sty ARG_EXTENSION
e7e6: a2 9d ldx #FAC ;set up to shift FAC
e7e8: d0 04 bne LE7EE ;...always

e7ea: a0 00 LE7EA ldy #$00
e7ec: 84 ac                        sty     FAC_EXTENSION
e7ee: c9 f9        LE7EE           cmp     #$f9 ;shift more than 7 bits?
e7f0: 30 c7 bmi FADD_1 ;yes
e7f2: a8 tay ;index to # of shifts
e7f3: a5 ac lda FAC_EXTENSION
e7f5: 56 01 lsr 1,x ;start shifting...
e7f7: 20 07 e9 jsr SHIFT_RIGHT_4 ;...complete shifting
e7fa: 24 ab FADD_3 bit SGNCPR ;do FAC and ARG have same signs?
e7fc: 10 57 bpl FADD_4 ;yes, add the mantissas
e7fe: a0 9d ldy #FAC ;no, subtract smaller from larger
e800: e0 a5 cpx #ARG ;which was adjusted?
e802: f0 02 beq LE806 ;if ARG, do FAC - ARG
e804: a0 a5 ldy #ARG ;if FAC, do ARG - FAC
e806: 38 LE806 sec ;subtract smaller from larger (we hope)
e807: 49 ff eor #$ff ;(if exponents were equal, we might be
e809: 65 92 adc ARG_EXTENSION ; subtracting larger from smaller)
e80b: 85 ac sta FAC_EXTENSION
e80d: b9 04 00 lda 4,y
e810: f5 04 sbc 4,x
e812: 85 a1 sta FAC+4
e814: b9 03 00 lda 3,y
e817: f5 03 sbc 3,x
e819: 85 a0 sta FAC+3
e81b: b9 02 00 lda 2,y
e81e: f5 02 sbc 2,x
e820: 85 9f sta FAC+2
e822: b9 01 00 lda 1,y
e825: f5 01 sbc 1,x
e827: 85 9e sta FAC+1
_ Normalize value in FAC.
e829: b0 03 NORMALIZE_FAC_1 bcs NORMALIZE_FAC_2
e82b: 20 9e e8 jsr COMPLEMENT_FAC
e82e: a0 00 NORMALIZE_FAC_2 ldy #$00 ;shift up signif digit
e830: 98 tya ;start A=0, count shifts in A-reg
e831: 18 clc
e832: a6 9e LE832 ldx FAC+1 ;look at most significant byte
e834: d0 4a bne NORMALIZE_FAC_4 ;some 1-bits here
e836: a6 9f ldx FAC+2 ;high byte of mantissa still zero,
e838: 86 9e stx FAC+1 ; so do a fast 8-bit shuffle
e83a: a6 a0 ldx FAC+3
e83c: 86 9f stx FAC+2
e83e: a6 a1 ldx FAC+4
e840: 86 a0 stx FAC+3
e842: a6 ac ldx FAC_EXTENSION
e844: 86 a1 stx FAC+4
e846: 84 ac sty FAC_EXTENSION ;zero extension byte
e848: 69 08 adc #8 ;bump shift count
e84a: c9 20 cmp #32 ;done 4 times yet?
e84c: d0 e4 bne LE832 ;no, still might be some 1's
_ Set FAC = 0 (only necessary to zero exponent and sign cells)
e84e: a9 00 ZERO_FAC lda #$00
e850: 85 9d STA_IN_FAC_SIGN_AND_EXP sta FAC
e852: 85 a2 STA_IN_FAC_SIGN sta FAC_SIGN
e854: 60 rts

                   * Add mantissas of FAC and ARG into FAC.

e855: 65 92 FADD_4 adc ARG_EXTENSION
e857: 85 ac sta FAC_EXTENSION
e859: a5 a1 lda FAC+4
e85b: 65 a9 adc ARG+4
e85d: 85 a1 sta FAC+4
e85f: a5 a0 lda FAC+3
e861: 65 a8 adc ARG+3
e863: 85 a0 sta FAC+3
e865: a5 9f lda FAC+2
e867: 65 a7 adc ARG+2
e869: 85 9f sta FAC+2
e86b: a5 9e lda FAC+1
e86d: 65 a6 adc ARG+1
e86f: 85 9e sta FAC+1
e871: 4c 8d e8 jmp NORMALIZE_FAC_5

                   * Finish normalizing FAC.

e874: 69 01 NORMALIZE_FAC_3 adc #1 ;count bits shifted
e876: 06 ac asl FAC_EXTENSION
e878: 26 a1 rol FAC+4
e87a: 26 a0 rol FAC+3
e87c: 26 9f rol FAC+2
e87e: 26 9e rol FAC+1 \*
e880: 10 f2 NORMALIZE_FAC_4 bpl NORMALIZE_FAC_3 ;until top bit = 1
e882: 38 sec
e883: e5 9d sbc FAC ;adjust exponent by bits shifted
e885: b0 c7 bcs ZERO_FAC ;underflow, return zero
e887: 49 ff eor #$ff
e889: 69 01 adc #$01 ;2's complement
e88b: 85 9d sta FAC ;carry=0 now
e88d: 90 0e NORMALIZE_FAC_5 bcc RTS_11 ;unless mantissa carried
e88f: e6 9d NORMALIZE_FAC_6 inc FAC ;mantissa carried, so shift right
e891: f0 42 beq OVERFLOW ;overflow if exponent too big
e893: 66 9e ror FAC+1
e895: 66 9f ror FAC+2
e897: 66 a0 ror FAC+3
e899: 66 a1 ror FAC+4
e89b: 66 ac ror FAC_EXTENSION
e89d: 60 RTS_11 rts

                   * 2's complement of FAC

e89e: a5 a2 COMPLEMENT_FAC lda FAC_SIGN
e8a0: 49 ff eor #$ff
e8a2: 85 a2                        sta     FAC_SIGN
                   * 2's complement of FAC mantissa only
e8a4: a5 9e        COMPLEMENT_FAC_MANTISSA lda FAC+1
e8a6: 49 ff                        eor     #$ff
e8a8: 85 9e sta FAC+1
e8aa: a5 9f lda FAC+2
e8ac: 49 ff eor #$ff
e8ae: 85 9f                        sta     FAC+2
e8b0: a5 a0                        lda     FAC+3
e8b2: 49 ff                        eor     #$ff
e8b4: 85 a0 sta FAC+3
e8b6: a5 a1 lda FAC+4
e8b8: 49 ff eor #$ff
e8ba: 85 a1                        sta     FAC+4
e8bc: a5 ac                        lda     FAC_EXTENSION
e8be: 49 ff                        eor     #$ff
e8c0: 85 ac sta FAC_EXTENSION
e8c2: e6 ac inc FAC_EXTENSION ;start incrementing mantissa
e8c4: d0 0e bne RTS_12 \* Increment FAC mantissa.
e8c6: e6 a1 INCREMENT_FAC_MANTISSA inc FAC+4 ;add carry from extra
e8c8: d0 0a bne RTS_12
e8ca: e6 a0 inc FAC+3
e8cc: d0 06 bne RTS_12
e8ce: e6 9f inc FAC+2
e8d0: d0 02 bne RTS_12
e8d2: e6 9e inc FAC+1
e8d4: 60 RTS_12 rts

e8d5: a2 45 OVERFLOW ldx #ERR_OVERFLOW
e8d7: 4c 12 d4 jmp ERROR

                   * Shift 1,X through 5,X right
                   *   A-reg = negative of shift count
                   *   X-reg = pointer to bytes to be shifted
                   *
                   *   Return with Y-reg=0, carry=0, extension bits in A-reg

e8da: a2 61 SHIFT_RIGHT_1 ldx #RESULT-1 ;shift result right
e8dc: b4 04 SHIFT_RIGHT_2 ldy 4,x ;shift 8 bits right
e8de: 84 ac sty FAC_EXTENSION
e8e0: b4 03 ldy 3,x
e8e2: 94 04 sty 4,x
e8e4: b4 02 ldy 2,x
e8e6: 94 03 sty 3,x
e8e8: b4 01 ldy 1,x
e8ea: 94 02 sty 2,x
e8ec: a4 a4 ldy SHIFT_SIGN_EXT ;$00 if +, $FF if -
e8ee: 94 01 sty 1,x
_ Main entry to right shift subroutine.
e8f0: 69 08 SHIFT_RIGHT adc #8
e8f2: 30 e8 bmi SHIFT_RIGHT_2 ;still more than 8 bits to go
e8f4: f0 e6 beq SHIFT_RIGHT_2 ;exactly 8 more bits to go
e8f6: e9 08 sbc #8 ;undo ADC above
e8f8: a8 tay ;remaining shift count
e8f9: a5 ac lda FAC_EXTENSION
e8fb: b0 14 bcs SHIFT_RIGHT_5 ;finished shifiting
e8fd: 16 01 SHIFT_RIGHT_3 asl 1,x ;sign -> carry (sign extension)
e8ff: 90 02 bcc LE903 ;sign +
e901: f6 01 inc 1,x ;put sign in LSB
e903: 76 01 LE903 ror 1,x ;restore value, sign still in carry
e905: 76 01 ror 1,x ;start right shift, inserting sign
_ Enter here for short shifts with no sign extension.
e907: 76 02 SHIFT_RIGHT_4 ror 2,x
e909: 76 03 ror 3,x
e90b: 76 04 ror 4,x
e90d: 6a ror A ;extension
e90e: c8 iny ;count the shift
e90f: d0 ec bne SHIFT_RIGHT_3
e911: 18 SHIFT_RIGHT_5 clc ;return with carry clear
e912: 60 rts

e913: 81 00 00 00+ CON_ONE .bulk $81,$00,$00,$00,$00
e918: 03           POLY_LOG        .dd1    3                 ;# of coefficients - 1
e919: 7f 5e 56 cb+                 .bulk   $7f,$5e,$56,$cb,$79 ;* X^7 +
e91e: 80 13 9b 0b+                 .bulk   $80,$13,$9b,$0b,$64 ;* X^5 +
e923: 80 76 38 93+                 .bulk   $80,$76,$38,$93,$16 ;* X^3 +
e928: 82 38 aa 3b+                 .bulk   $82,$38,$aa,$3b,$20 ;* X
                   *
e92d: 80 35 04 f3+ CON_SQR_HALF    .bulk   $80,$35,$04,$f3,$34
e932: 81 35 04 f3+ CON_SQR_TWO     .bulk   $81,$35,$04,$f3,$34
e937: 80 80 00 00+ CON_NEG_HALF    .bulk   $80,$80,$00,$00,$00
e93c: 80 31 72 17+ CON_LOG_TWO     .bulk   $80,$31,$72,$17,$f8

                   ********************************************************************************
                   * LOG statement                                                                *
                   ********************************************************************************

e941: 20 82 eb LOG jsr SIGN ;get -1,0,+1 in A-reg for FAC
e944: f0 02 beq GIQ ;LOG(0) is illegal
e946: 10 03 bpl LOG_2 ;>0 is ok
e948: 4c 99 e1 GIQ jmp IQERR ;<= 0 is no good

e94b: a5 9d LOG_2 lda FAC ;first get log base 2
e94d: e9 7f sbc #$7f ;save unbiased exponent
e94f: 48 pha
e950: a9 80 lda #$80 ;normalize between .5 and 1
e952: 85 9d sta FAC
e954: a9 2d lda #<CON_SQR_HALF
e956: a0 e9 ldy #>CON_SQR_HALF
e958: 20 be e7 jsr FADD ;compute via series of odd
e95b: a9 32 lda #<CON_SQR_TWO ; powers of
e95d: a0 e9 ldy #>CON_SQR_TWO ; (SQR(2)X-1)/(SQR(2)X+1)
e95f: 20 66 ea jsr FDIV
e962: a9 13 lda #<CON_ONE
e964: a0 e9 ldy #>CON_ONE
e966: 20 a7 e7 jsr FSUB
e969: a9 18 lda #<POLY_LOG
e96b: a0 e9 ldy #>POLY_LOG
e96d: 20 5c ef jsr POLYNOMIAL_ODD
e970: a9 37 lda #<CON_NEG_HALF
e972: a0 e9 ldy #>CON_NEG_HALF
e974: 20 be e7 jsr FADD
e977: 68 pla
e978: 20 d5 ec jsr ADDACC ;add original exponent
e97b: a9 3c lda #<CON_LOG_TWO ;multiply by log(2) to form
e97d: a0 e9 ldy #>CON_LOG_TWO ; natural log of X
_ FAC = (Y,A) _ FAC
e97f: 20 e3 e9 FMULT jsr LOAD_ARG_FROM_YA
_ FAC = ARG _ FAC
e982: d0 03 FMULTT bne LE987 ;FAC .ne. zero
e984: 4c e2 e9 jmp RTS_13 ;FAC = 0 \* ARG = 0

                   * <<< why is line above just "RTS"? >>>

e987: 20 0e ea LE987 jsr ADD_EXPONENTS
e98a: a9 00 lda #$00
e98c: 85 62 sta RESULT ;init product = 0
e98e: 85 63 sta RESULT+1
e990: 85 64 sta RESULT+2
e992: 85 65 sta RESULT+3
e994: a5 ac lda FAC_EXTENSION
e996: 20 b0 e9 jsr MULTIPLY_1
e999: a5 a1 lda FAC+4
e99b: 20 b0 e9 jsr MULTIPLY_1
e99e: a5 a0 lda FAC+3
e9a0: 20 b0 e9 jsr MULTIPLY_1
e9a3: a5 9f lda FAC+2
e9a5: 20 b0 e9 jsr MULTIPLY_1
e9a8: a5 9e lda FAC+1
e9aa: 20 b5 e9 jsr MULTIPLY_2
e9ad: 4c e6 ea jmp COPY_RESULT_INTO_FAC

                   * Multiply ARG by A-reg into RESULT

e9b0: d0 03 MULTIPLY_1 bne MULTIPLY_2 ;this byte non-zero
e9b2: 4c da e8 jmp SHIFT_RIGHT_1 ;A-reg=0, just shift ARG right 8

e9b5: 4a MULTIPLY_2 lsr A ;shift bit into carry
e9b6: 09 80 ora #$80 ;supply sentinel bit
e9b8: a8 LE9B8 tay ;remaining multiplier to Y-reg
e9b9: 90 19 bcc LE9D4 ;this multiplier bit = 0
e9bb: 18 clc ;= 1, so add ARG to RESULT
e9bc: a5 65 lda RESULT+3
e9be: 65 a9 adc ARG+4
e9c0: 85 65 sta RESULT+3
e9c2: a5 64 lda RESULT+2
e9c4: 65 a8 adc ARG+3
e9c6: 85 64 sta RESULT+2
e9c8: a5 63 lda RESULT+1
e9ca: 65 a7 adc ARG+2
e9cc: 85 63 sta RESULT+1
e9ce: a5 62 lda RESULT
e9d0: 65 a6 adc ARG+1
e9d2: 85 62 sta RESULT ;shift RESULT right 1
e9d4: 66 62 LE9D4 ror RESULT
e9d6: 66 63 ror RESULT+1
e9d8: 66 64 ror RESULT+2
e9da: 66 65 ror RESULT+3
e9dc: 66 ac ror FAC_EXTENSION
e9de: 98 tya ;remaining multiplier
e9df: 4a lsr A ;LSB into carry
e9e0: d0 d6 bne LE9B8 ;if sentinel still here, multiply
e9e2: 60 RTS_13 rts ;8 x 32 completed

                   * Unpack number at (Y,A) into ARG

e9e3: 85 5e LOAD_ARG_FROM_YA sta INDEX ;use INDEX for ptr
e9e5: 84 5f sty INDEX+1
e9e7: a0 04 ldy #4 ;five bytes to move
e9e9: b1 5e lda (INDEX),y
e9eb: 85 a9 sta ARG+4
e9ed: 88 dey
e9ee: b1 5e lda (INDEX),y
e9f0: 85 a8 sta ARG+3
e9f2: 88 dey
e9f3: b1 5e lda (INDEX),y
e9f5: 85 a7 sta ARG+2
e9f7: 88 dey
e9f8: b1 5e lda (INDEX),y
e9fa: 85 aa sta ARG_SIGN
e9fc: 45 a2 eor FAC_SIGN ;set combined sign for multi/div
e9fe: 85 ab sta SGNCPR
ea00: a5 aa lda ARG_SIGN ;turn on normalized invisible bit
ea02: 09 80 ora #$80 ; to complete mantissa
ea04: 85 a6 sta ARG+1
ea06: 88 dey
ea07: b1 5e lda (INDEX),y
ea09: 85 a5 sta ARG ;exponent
ea0b: a5 9d lda FAC ;set status bits on FAC exponent
ea0d: 60 rts

                   * Add exponents of ARG and FAC (called by FMULT and FDIV).
                   *
                   * Also check for overflow, and set result sign.

ea0e: a5 a5 ADD_EXPONENTS lda ARG
ea10: f0 1f ADD_EXPONENTS_1 beq ZERO ;if ARG=0, result is zero
ea12: 18 clc
ea13: 65 9d adc FAC
ea15: 90 04 bcc LEA1B ;in range
ea17: 30 1d bmi JOV ;overflow
ea19: 18 clc
ea1a: 2c bit ▼ $1410 ;trick to skip
ea1b: 10 14 LEA1B bpl ZERO ;overflow
ea1d: 69 80 adc #$80 ;re-bias
ea1f: 85 9d sta FAC ;result
ea21: d0 03 bne LEA26
ea23: 4c 52 e8 jmp STA_IN_FAC_SIGN ;result is zero

                   * <<< Crazy to jump way back there!  Same identical code is below!  Instead of
                   * BNE .2, JMP STA_IN_FAC_SIGN, only needed BEQ .3 >>>

ea26: a5 ab LEA26 lda SGNCPR ;set sign of result
ea28: 85 a2 sta FAC_SIGN
ea2a: 60 rts

                   * If FAC is positive, give "overflow" error.
                   * If FAC is negative, set FAC=0, pop one return, and RTS.
                   * Called from EXP function.

ea2b: a5 a2 OUTOFRNG lda FAC_SIGN
ea2d: 49 ff eor #$ff
ea2f: 30 05 bmi JOV ;error if positive # \* Pop return address and set FAC=0.
ea31: 68 ZERO pla
ea32: 68 pla
ea33: 4c 4e e8 jmp ZERO_FAC

ea36: 4c d5 e8 JOV jmp OVERFLOW

                   * Multiply FAC by 10.

ea39: 20 63 eb MUL10 jsr COPY_FAC_TO_ARG_ROUNDED
ea3c: aa tax ;test FAC exponent
ea3d: f0 10 beq LEA4F ;finished if FAC=0
ea3f: 18 clc
ea40: 69 02 adc #2 ;add 2 to exponent gives FAC*4
ea42: b0 f2 bcs JOV ;overflow
ea44: a2 00 ldx #$00
ea46: 86 ab stx SGNCPR
ea48: 20 ce e7 jsr FADD_2 ;makes FAC*5
ea4b: e6 9d inc FAC ;*2, makes FAC*10
ea4d: f0 e7 beq JOV ;overflow
ea4f: 60 LEA4F rts

ea50: 84 20 00 00+ CON_TEN .bulk $84,$20,$00,$00,$00

                   * Divide FAC by 10.

ea55: 20 63 eb DIV10 jsr COPY_FAC_TO_ARG_ROUNDED
ea58: a9 50 lda #<CON_TEN ;set up to put
ea5a: a0 ea ldy #>CON_TEN ; 10 in FAC
ea5c: a2 00 ldx #$00 \* FAC = ARG / (Y,A)
ea5e: 86 ab DIV stx SGNCPR
ea60: 20 f9 ea LEA60 jsr LOAD_FAC_FROM_YA
ea63: 4c 69 ea jmp FDIVT ;divide ARG by FAC

                   * FAC = (Y,A) / FAC

ea66: 20 e3 e9 FDIV jsr LOAD_ARG_FROM_YA \* FAC = ARG / FAC
ea69: f0 76 FDIVT beq LEAE1 ;FAC = 0, divide by zero error
ea6b: 20 72 eb jsr ROUND_FAC
ea6e: a9 00 lda #$00 ;negate FAC exponent, so
ea70: 38 sec ; ADD_EXPONENTS forms difference
ea71: e5 9d sbc FAC
ea73: 85 9d sta FAC
ea75: 20 0e ea jsr ADD_EXPONENTS
ea78: e6 9d inc FAC
ea7a: f0 ba beq JOV ;overflow
ea7c: a2 fc ldx #252 ;(should be -4) index for result
ea7e: a9 01 lda #$01 ;sentinel
ea80: a4 a6 LEA80 ldy ARG+1 ;see if FAC can be subtracted
ea82: c4 9e cpy FAC+1
ea84: d0 10 bne LEA96
ea86: a4 a7 ldy ARG+2
ea88: c4 9f cpy FAC+2
ea8a: d0 0a bne LEA96
ea8c: a4 a8 ldy ARG+3
ea8e: c4 a0 cpy FAC+3
ea90: d0 04 bne LEA96
ea92: a4 a9 ldy ARG+4
ea94: c4 a1 cpy FAC+4
ea96: 08 LEA96 php ;save the answer, and also roll the
ea97: 2a rol A ; bit into the quotient, sentinel out
ea98: 90 09 bcc LEAA3 ;no sentinel, still not 8 trips
ea9a: e8 inx ;8 trips, store byte of quotient
ea9b: 95 65 sta RESULT+3,x
ea9d: f0 32 beq LEAD1 ;32 bits completed
ea9f: 10 34 bpl LEAD5 ;final exit when X-reg=1
eaa1: a9 01 lda #$01 ;re-start sentinel
eaa3: 28 LEAA3 plp ;get answer, can FAC be subtracted?
eaa4: b0 0e bcs LEAB4 ;yes, do it
eaa6: 06 a9 LEAA6 asl ARG+4 ;no, shift ARG left
eaa8: 26 a8 rol ARG+3
eaaa: 26 a7 rol ARG+2
eaac: 26 a6 rol ARG+1
eaae: b0 e6 bcs LEA96 ;another trip
eab0: 30 ce bmi LEA80 ;have to compare first
eab2: 10 e2 bpl LEA96 ;...always

eab4: a8 LEAB4 tay ;save quotient/sentinel byte
eab5: a5 a9 lda ARG+4 ;subtract FAC from ARG once
eab7: e5 a1 sbc FAC+4
eab9: 85 a9 sta ARG+4
eabb: a5 a8 lda ARG+3
eabd: e5 a0 sbc FAC+3
eabf: 85 a8 sta ARG+3
eac1: a5 a7 lda ARG+2
eac3: e5 9f sbc FAC+2
eac5: 85 a7 sta ARG+2
eac7: a5 a6 lda ARG+1
eac9: e5 9e sbc FAC+1
eacb: 85 a6 sta ARG+1
eacd: 98 tya ;restore quotient/sentinel byte
eace: 4c a6 ea jmp LEAA6 ;go to shift arg and continue

ead1: a9 40 LEAD1 lda #$40 ;do a few extension bits
ead3: d0 ce bne LEAA3 ;...always

ead5: 0a LEAD5 asl A ;left justify the extension bits we did
ead6: 0a asl A
ead7: 0a asl A
ead8: 0a asl A
ead9: 0a asl A
eada: 0a asl A
eadb: 85 ac sta FAC_EXTENSION
eadd: 28 plp
eade: 4c e6 ea jmp COPY_RESULT_INTO_FAC

eae1: a2 85 LEAE1 ldx #ERR_ZERODIV
eae3: 4c 12 d4 jmp ERROR

                   * Copy RESULT into FAC mantissa, and normalize.

eae6: a5 62 COPY_RESULT_INTO_FAC lda RESULT
eae8: 85 9e sta FAC+1
eaea: a5 63 lda RESULT+1
eaec: 85 9f sta FAC+2
eaee: a5 64 lda RESULT+2
eaf0: 85 a0 sta FAC+3
eaf2: a5 65 lda RESULT+3
eaf4: 85 a1 sta FAC+4
eaf6: 4c 2e e8 jmp NORMALIZE_FAC_2

                   * Unpack (Y,A) into FAC.

eaf9: 85 5e LOAD_FAC_FROM_YA sta INDEX ;use INDEX for ptr
eafb: 84 5f sty INDEX+1
eafd: a0 04 ldy #4 ;pick up 5 bytes
eaff: b1 5e lda (INDEX),y
eb01: 85 a1 sta FAC+4
eb03: 88 dey
eb04: b1 5e lda (INDEX),y
eb06: 85 a0 sta FAC+3
eb08: 88 dey
eb09: b1 5e lda (INDEX),y
eb0b: 85 9f sta FAC+2
eb0d: 88 dey
eb0e: b1 5e lda (INDEX),y
eb10: 85 a2 sta FAC_SIGN ;first bit is sign
eb12: 09 80 ora #$80 ;set normalized invisible bit
eb14: 85 9e sta FAC+1
eb16: 88 dey
eb17: b1 5e lda (INDEX),y
eb19: 85 9d sta FAC ;exponent
eb1b: 84 ac sty FAC_EXTENSION ;Y-reg = 0
eb1d: 60 rts

                   * Round FAC, store in TEMP2.

eb1e: a2 98 STORE_FAC_IN_TEMP2_ROUNDED ldx #TEMP2 ;pack FAC into TEMP2
eb20: 2c bit ▼ $93a2 ;trick to branch \* Round FAC, store in TEMP1.
eb21: a2 93 STORE_FAC_IN_TEMP1_ROUNDED ldx #TEMP1 ;pack FAC into TEMP1
eb23: a0 00 ldy #>TEMP1 ;hi-byte of TEMP1 same as TEMP2
eb25: f0 04 beq STORE_FAC_AT_YX_ROUNDED ;...always

                   * Round FAC, and store where FORPNT points.

eb27: a6 85 SETFOR ldx FORPNT
eb29: a4 86 ldy FORPNT+1 \* Round FAC, and store at (Y,X).
eb2b: 20 72 eb STORE_FAC_AT_YX_ROUNDED jsr ROUND_FAC ;round value in FAC using extension
eb2e: 86 5e stx INDEX ;use INDEX for ptr
eb30: 84 5f sty INDEX+1
eb32: a0 04 ldy #4 ;storing 5 packed bytes
eb34: a5 a1 lda FAC+4
eb36: 91 5e sta (INDEX),y
eb38: 88 dey
eb39: a5 a0 lda FAC+3
eb3b: 91 5e sta (INDEX),y
eb3d: 88 dey
eb3e: a5 9f lda FAC+2
eb40: 91 5e sta (INDEX),y
eb42: 88 dey
eb43: a5 a2 lda FAC_SIGN ;pack sign in top bit of mantissa
eb45: 09 7f ora #$7f
eb47: 25 9e and FAC+1
eb49: 91 5e sta (INDEX),y
eb4b: 88 dey
eb4c: a5 9d lda FAC ;exponent
eb4e: 91 5e sta (INDEX),y
eb50: 84 ac sty FAC_EXTENSION ;zero the extension
eb52: 60 rts

                   * Copy ARG into FAC.

eb53: a5 aa COPY_ARG_TO_FAC lda ARG_SIGN ;copy sign
eb55: 85 a2 MFA sta FAC_SIGN
eb57: a2 05 ldx #5 ;move 5 bytes
eb59: b5 a4 LEB59 lda ARG-1,x
eb5b: 95 9c sta FAC-1,x
eb5d: ca dex
eb5e: d0 f9 bne LEB59
eb60: 86 ac stx FAC_EXTENSION ;zero extension
eb62: 60 rts

                   * Round FAC and copy to ARG.

eb63: 20 72 eb COPY_FAC_TO_ARG_ROUNDED jsr ROUND_FAC ;round FAC using extension
eb66: a2 06 MAF ldx #6 ;copy 6 bytes, includes sign
eb68: b5 9c LEB68 lda FAC-1,x
eb6a: 95 a4 sta ARG-1,x
eb6c: ca dex
eb6d: d0 f9 bne LEB68
eb6f: 86 ac stx FAC_EXTENSION ;zero FAC extension
eb71: 60 RTS_14 rts

                   * Round FAC using extension byte.

eb72: a5 9d ROUND_FAC lda FAC
eb74: f0 fb beq RTS_14 ;FAC = 0, return
eb76: 06 ac asl FAC_EXTENSION ;is FAC_EXTENSION >= 128?
eb78: 90 f7 bcc RTS_14 ;no, finished \* Increment mantissa and re-normalize if carry.
eb7a: 20 c6 e8 INCREMENT_MANTISSA jsr INCREMENT_FAC_MANTISSA ;yes, increment FAC
eb7d: d0 f2 bne RTS_14 ;high byte has bits, finished
eb7f: 4c 8f e8 jmp NORMALIZE_FAC_6 ;hi byte = 0, so shift left

                   * Test FAC for zero and sign.
                   *
                   *   FAC > 0, return +1
                   *   FAC = 0, return  0
                   *   FAC < 0, return -1

eb82: a5 9d SIGN lda FAC ;check sign of FAC and
eb84: f0 09 beq RTS_15 ; return -1,0,1 in A-reg
eb86: a5 a2 SIGN1 lda FAC_SIGN
eb88: 2a SIGN2 rol A ;msbit to carry
eb89: a9 ff lda #$ff ;-1
eb8b: b0 02 bcs RTS_15 ;msbit = 1
eb8d: a9 01 lda #$01 ;+1
eb8f: 60 RTS_15 rts

                   ********************************************************************************
                   * SGN statement                                                                *
                   ********************************************************************************

eb90: 20 82 eb SGN jsr SIGN ;convert FAC to -1,0,1
_ Convert A-reg into FAC, as signed value -128 to +127.
eb93: 85 9e FLOAT sta FAC+1 ;put in high byte of mantissa
eb95: a9 00 lda #$00 ;clear 2nd byte of mantissa
eb97: 85 9f sta FAC+2
eb99: a2 88 ldx #$88 ;use exponent 2^9
_ Float unsigned value in FAC+1,2. \*
_ X-reg = exponent
eb9b: a5 9e FLOAT_1 lda FAC+1 ;msbit=0, set carry; =1, clear carry
eb9d: 49 ff eor #$ff
eb9f: 2a rol A
_ Float unsigned value in FAC+1,2 \*
_ X-reg = exponent
_ C=0 to make value negative \* C=1 to make value positive
eba0: a9 00 FLOAT_2 lda #$00 ;clear lower 16 bits of mantissa
eba2: 85 a1 sta FAC+4
eba4: 85 a0 sta FAC+3
eba6: 86 9d stx FAC ;store exponent
eba8: 85 ac sta FAC_EXTENSION ;clear extension
ebaa: 85 a2 sta FAC_SIGN ;make sign positive
ebac: 4c 29 e8 jmp NORMALIZE_FAC_1 ;if C=0, will negate FAC

                   ********************************************************************************
                   * ABS statement                                                                *
                   ********************************************************************************

ebaf: 46 a2 ABS lsr FAC_SIGN ;change sign to +
ebb1: 60 rts

                   * Compare FAC with packed # at (Y,A).
                   * Return A=1,0,-1 as (Y,A) is <,=,> FAC.

ebb2: 85 60 FCOMP sta DEST ;use DEST for ptr
_ Special entry from NEXT processor. DEST already set up.
ebb4: 84 61 FCOMP2 sty DEST+1
ebb6: a0 00 ldy #$00              ;get exponent of comparand
ebb8: b1 60                        lda     (DEST),y
ebba: c8                           iny                       ;point at next byte
ebbb: aa                           tax                       ;exponent to X-reg
ebbc: f0 c4                        beq     SIGN              ;if comparand=0, SIGN compares FAC
ebbe: b1 60                        lda     (DEST),y          ;get hi byte of mantissa
ebc0: 45 a2                        eor     FAC_SIGN          ;compare with FAC sign
ebc2: 30 c2                        bmi     SIGN1             ;different signs, SIGN gives answer
ebc4: e4 9d                        cpx     FAC               ;same sign, so compare exponents
ebc6: d0 21                        bne     LEBE9             ;different, so sufficient test
ebc8: b1 60                        lda     (DEST),y          ;same exponent, compare mantissa
ebca: 09 80                        ora     #$80              ;set invisible normalized bit
ebcc: c5 9e                        cmp     FAC+1
ebce: d0 19                        bne     LEBE9             ;not same, so sufficient
ebd0: c8                           iny                       ;same, compare more mantissa
ebd1: b1 60                        lda     (DEST),y
ebd3: c5 9f                        cmp     FAC+2
ebd5: d0 12                        bne     LEBE9             ;not same, so sufficient
ebd7: c8                           iny                       ;same, compare more mantissa
ebd8: b1 60                        lda     (DEST),y
ebda: c5 a0                        cmp     FAC+3
ebdc: d0 0b                        bne     LEBE9             ;not same, so sufficient
ebde: c8                           iny                       ;same, compare more mantissa
ebdf: a9 7f                        lda     #$7f              ;artificial extension byte for comparand
ebe1: c5 ac                        cmp     FAC_EXTENSION
ebe3: b1 60                        lda     (DEST),y
ebe5: e5 a1                        sbc     FAC+4
ebe7: f0 28                        beq     RTS_16            ;numbers are equal, return A-reg=0
ebe9: a5 a2        LEBE9           lda     FAC_SIGN          ;numbers are different
ebeb: 90 02                        bcc     LEBEF             ;FAC is larger magnitude
ebed: 49 ff                        eor     #$ff ;FAC is smaller magnitude
_ <<< Note that above three lines can be shortened:
_ .1 ROR ;put carry into sign bit
_ EOR FAC_SIGN ;toggle with sign of FAC \* >>>
ebef: 4c 88 eb LEBEF jmp SIGN2 ;convert +1 or -1

                   * Quick integer function.
                   *
                   * Converts fp value in FAC to integer value in FAC+1 ... FAC+4, by shifting
                   * right with sign extension until fractional bits are out.
                   *
                   * This subroutine assumes the exponent < 32.

ebf2: a5 9d QINT lda FAC ;look at FAC exponent
ebf4: f0 4a beq QINT_3 ;FAC=0, so finished
ebf6: 38 sec ;get -(number of fractional bits)
ebf7: e9 a0 sbc #$a0              ; in A-reg for shift count
ebf9: 24 a2                        bit     FAC_SIGN          ;check sign of FAC
ebfb: 10 09                        bpl     LEC06             ;positive, continue
ebfd: aa                           tax                       ;negative, so complement mantissa
ebfe: a9 ff                        lda     #$ff ;and set sign extension for shift
ec00: 85 a4 sta SHIFT_SIGN_EXT
ec02: 20 a4 e8 jsr COMPLEMENT_FAC_MANTISSA
ec05: 8a txa ;restore bit count to A-reg
ec06: a2 9d LEC06 ldx #FAC ;point shift subroutine at FAC
ec08: c9 f9 cmp #$f9 ;more than 7 bits to shift?
ec0a: 10 06 bpl QINT_2 ;no, short shift
ec0c: 20 f0 e8 jsr SHIFT_RIGHT ;yes, use general routine
ec0f: 84 a4 sty SHIFT_SIGN_EXT ;Y=0, clear sign extension
ec11: 60 RTS_16 rts

ec12: a8 QINT_2 tay ;save shift count
ec13: a5 a2 lda FAC_SIGN ;get sign bit
ec15: 29 80 and #$80
ec17: 46 9e lsr FAC+1 ;start right shift
ec19: 05 9e ora FAC+1 ;and merge with sign
ec1b: 85 9e sta FAC+1
ec1d: 20 07 e9 jsr SHIFT_RIGHT_4 ;jump into middle of shifter
ec20: 84 a4 sty SHIFT_SIGN_EXT ;Y=0, clear sign extension
ec22: 60 rts

                   ********************************************************************************
                   * INT statement                                                                *
                   *                                                                              *
                   * Uses QINT to convert FAC to integer form, and then refloats the integer.     *
                   * <<< A faster approach would simply clear the fractional bits by zeroing      *
                   * them. >>>                                                                    *
                   ********************************************************************************

ec23: a5 9d INT lda FAC ;check if exponent < 32
ec25: c9 a0 cmp #$a0              ;because if > 31 there is no fraction
ec27: b0 20                        bcs     RTS_17            ;no fraction, we are finished
ec29: 20 f2 eb                     jsr     QINT              ;use general integer conversion
ec2c: 84 ac                        sty     FAC_EXTENSION     ;Y=0, clear extension
ec2e: a5 a2                        lda     FAC_SIGN          ;get sign of value
ec30: 84 a2                        sty     FAC_SIGN          ;Y=0, clear sign
ec32: 49 80                        eor     #$80              ;toggle actual sign
ec34: 2a                           rol     A                 ;and save in carry
ec35: a9 a0                        lda     #$a0 ;set exponent to 32
ec37: 85 9d sta FAC ; because 4-byte integer now
ec39: a5 a1 lda FAC+4 ;save low 8 bits of integer form
ec3b: 85 0d sta CHARAC ; for exp and power
ec3d: 4c 29 e8 jmp NORMALIZE_FAC_1 ;normalize to finish conversion

ec40: 85 9e QINT_3 sta FAC+1 ;FAC=0, so clear all 4 bytes for
ec42: 85 9f sta FAC+2 ; integer version
ec44: 85 a0 sta FAC+3
ec46: 85 a1 sta FAC+4
ec48: a8 tay ;Y=0 too
ec49: 60 RTS_17 rts

                   * Convert string to FP value in FAC.
                   *
                   *   String pointed to by TXTPTR
                   *   First char already scanned by CHRGET
                   *   A-reg=first char, C=0 if digit
                   • Clear variables
                   LASTPT          .var    $53    {addr/2}   ;Overlaps TEMPPT+1
                   ARG_EXTENSION   .var    $92    {addr/1}   ;Overlaps LENGTH+1
                   DPFLG           .var    $9b    {addr/1}   ;Overlaps LOWTR
                   EXPSGN          .var    $9c    {addr/1}   ;Overlaps LOWTR+1
                   SGNCPR          .var    $ab    {addr/1}   ;Overlaps STRING1
                   FAC_EXTENSION   .var    $ac    {addr/1}   ;Overlaps STRING1+1

ec4a: a0 00 FIN ldy #$00 ;clear working area ($99..A3)
ec4c: a2 0a ldx #10 ;TMPEXP, EXPON, DPFLG, EXPSGN, FAC, SERLEN
ec4e: 94 99 LEC4E sty TMPEXP,x
ec50: ca dex
ec51: 10 fb bpl LEC4E
ec53: 90 0f bcc FIN_2 ;first char is a digit
ec55: c9 2d cmp #‘-’ ;check for leading sign
ec57: d0 04 bne LEC5D ;not minus
ec59: 86 a3 stx SERLEN ;minus, set SERLEN = $FF for flag
ec5b: f0 04 beq FIN_1 ;...always

ec5d: c9 2b LEC5D cmp #‘+’ ;might be plus
ec5f: d0 05 bne FIN_3 ;not plus either, check decimal point
ec61: 20 b1 00 FIN_1 jsr CHRGET ;get next char of string
ec64: 90 5b FIN_2 bcc FIN_9 ;insert this digit
ec66: c9 2e FIN_3 cmp #‘.’ ;check for decimal point
ec68: f0 2e beq FIN_10 ;yes
ec6a: c9 45 cmp #‘E’ ;check for exponent part
ec6c: d0 30 bne FIN_7 ;no, end of number
ec6e: 20 b1 00 jsr CHRGET ;yes, start converting exponent
ec71: 90 17 bcc FIN_5 ;exponent digit
ec73: c9 c9 cmp #TOK_MINUS ;negative exponent?
ec75: f0 0e beq LEC85 ;yes
ec77: c9 2d cmp #‘-’ ;might not be tokenized yet
ec79: f0 0a beq LEC85 ;yes, it is negative
ec7b: c9 c8 cmp #TOK_PLUS ;optional "+"
ec7d: f0 08 beq FIN_4 ;yes
ec7f: c9 2b cmp #‘+’ ;might not be tokenized yet
ec81: f0 04 beq FIN_4 ;yes, found "+"
ec83: d0 07 bne FIN_6 ;...always, number completed

ec85: 66 9c LEC85 ror EXPSGN ;C=1, set flag negative \*
ec87: 20 b1 00 FIN_4 jsr CHRGET ;get next digit of exponent
ec8a: 90 5c FIN_5 bcc GETEXP ;char is a digit of exponent
ec8c: 24 9c FIN_6 bit EXPSGN ;end of number, check exp sign
ec8e: 10 0e bpl FIN_7 ;positive exponent
ec90: a9 00 lda #$00 ;negative exponent
ec92: 38 sec ;make 2's complete of exponent
ec93: e5 9a sbc EXPON
ec95: 4c a0 ec jmp FIN_8

                   * Found a decimal point.

ec98: 66 9b FIN_10 ror DPFLG ;C=1, set DPFLG for decimal point
ec9a: 24 9b bit DPFLG ;check if previous dec. pt.
ec9c: 50 c3 bvc FIN_1 ;no previous decimal point
_ A second decimal point is taken as a terminator to the numeric string.
_ "A=11..22" will give a syntax error, because it is two numbers with no
_ operator between.
_ "PRINT 11..22" gives no error, because it is just the concatenation of two
_ numbers.
_ \* Number terminated, adjust exponent now.
ec9e: a5 9a FIN_7 lda EXPON ;E-value
eca0: 38 FIN_8 sec ;modify with count of digits
eca1: e5 99 sbc TMPEXP ; after the decimal point
eca3: 85 9a sta EXPON ;complete current exponent
eca5: f0 12 beq LECB9 ;no adjust needed if exp=0
eca7: 10 09 bpl LECB2 ;exp>0, multiply by ten
eca9: 20 55 ea LECA9 jsr DIV10 ;exp<0, divide by ten
ecac: e6 9a inc EXPON ;until exp=0
ecae: d0 f9 bne LECA9
ecb0: f0 07 beq LECB9 ;...always, we are finished

ecb2: 20 39 ea LECB2 jsr MUL10 ;exp>0, multiply by ten
ecb5: c6 9a dec EXPON ;until exp=0
ecb7: d0 f9 bne LECB2
ecb9: a5 a3 LECB9 lda SERLEN ;is whole number negative?
ecbb: 30 01 bmi LECBE ;yes
ecbd: 60 rts ;no, return, whole job done!

ecbe: 4c d0 ee LECBE jmp NEGOP ;negative number, so negate FAC

                   * Accumulate a digit into FAC.

ecc1: 48 FIN_9 pha ;save digit
ecc2: 24 9b bit DPFLG ;seen a decimal point yet?
ecc4: 10 02 bpl LECC8 ;no, still in integer part
ecc6: e6 99 inc TMPEXP ;yes, count the fractional digit
ecc8: 20 39 ea LECC8 jsr MUL10 ;FAC = FAC \* 10
eccb: 68 pla ;current digit
eccc: 38 sec ;<<< shorter here to just "AND #$0F"
eccd: e9 30 sbc #‘0’ ; to convert ASCII to binary form >>>
eccf: 20 d5 ec jsr ADDACC ;add the digit
ecd2: 4c 61 ec jmp FIN_1 ;go back for more

                   * Add A-reg to FAC.

ecd5: 48 ADDACC pha ;save addend
ecd6: 20 63 eb jsr COPY_FAC_TO_ARG_ROUNDED
ecd9: 68 pla ;get addend again
ecda: 20 93 eb jsr FLOAT ;convert to fp value in FAC
ecdd: a5 aa lda ARG_SIGN
ecdf: 45 a2 eor FAC_SIGN
ece1: 85 ab sta SGNCPR
ece3: a6 9d ldx FAC ;to signal if FAC=0
ece5: 4c c1 e7 jmp FADDT ;perform the addition

                   * Accumulate digit of exponent.

ece8: a5 9a GETEXP lda EXPON ;check current value
ecea: c9 0a cmp #10 ;for more than 2 digits
ecec: 90 09 bcc LECF7 ;no, this is 1st or 2nd digit
ecee: a9 64 lda #100 ;exponent too big
ecf0: 24 9c bit EXPSGN ;unless it is negative
ecf2: 30 11 bmi LED05 ;large negative exponent makes FAC=0
ecf4: 4c d5 e8 jmp OVERFLOW ;large positive exponent is error

ecf7: 0a LECF7 asl A ;exponent times 10
ecf8: 0a asl A
ecf9: 18 clc
ecfa: 65 9a adc EXPON
ecfc: 0a asl A
ecfd: 18 clc ;<<< ASL already did this! >>>
ecfe: a0 00 ldy #$00 ;add the new digit
ed00: 71 b8 adc (TXTPTR),y ;but this is in ASCII
ed02: 38 sec ; so adjust back to binary
ed03: e9 30 sbc #‘0’
ed05: 85 9a LED05 sta EXPON ;new value
ed07: 4c 87 ec jmp FIN_4 ;back for more

ed0a: 9b 3e bc 1f+ CON_99999999_9 .bulk $9b,$3e,$bc,$1f,$fd ;99,999,999.9
ed0f: 9e 6e 6b 27+ CON_999999999 .bulk $9e,$6e,$6b,$27,$fd ;999,999,999
ed14: 9e 6e 6b 28+ CON_BILLION .bulk $9e,$6e,$6b,$28,$00 ;1,000,000,000

                   * Print "IN <LINE #>".

ed19: a9 58 INPRT lda #<QT_IN ;print " IN "
ed1b: a0 d3 ldy #>QT_IN
ed1d: 20 31 ed jsr GO_STROUT
ed20: a5 76 lda CURLIN+1
ed22: a6 75 ldx CURLIN
_ Print (A,X) as decimal integer.
ed24: 85 9e LINPRT sta FAC+1 ;print A,X in decimal
ed26: 86 9f stx FAC+2
ed28: a2 90 ldx #$90 ;exponent = 2 ^ 16
ed2a: 38 sec ;convert unsigned
ed2b: 20 a0 eb jsr FLOAT_2 ;convert line # to fp
_ Convert FAC to string, and print it.
ed2e: 20 34 ed PRINT_FAC jsr FOUT ;convert FAC to string at stack \* Print string starting at (Y,A).
ed31: 4c 3a db GO_STROUT jmp STROUT ;print string at (Y,A)

                   * Convert FAC to string starting at stack.
                   * Return with (Y,A) pointing at string.
                   • Clear variables

ed34: a0 01 FOUT ldy #$01              ;normal entry puts string at stack...
                   * STR$ function enters here, with Y-reg=0 so that result string starts at stack- \* 1 (this is used as a flag).
ed36: a9 2d FOUT_1 lda #‘-’ ;in case value negative
ed38: 88 dey ;back up ptr
ed39: 24 a2 bit FAC_SIGN
ed3b: 10 04 bpl LED41 ;value is +
ed3d: c8 iny ;value is -
ed3e: 99 ff 00 sta STACK-1,y ;emit "-"
ed41: 85 a2 LED41 sta FAC_SIGN ;make FAC_SIGN positive ($2D)
ed43: 84 ad sty STRNG2 ;save string ptr
ed45: c8 iny
ed46: a9 30 lda #‘0’ ;in case FAC=0
ed48: a6 9d ldx FAC ;number=0?
ed4a: d0 03 bne LED4F ;no, FAC not zero
ed4c: 4c 57 ee jmp FOUT_4 ;yes, finished

ed4f: a9 00 LED4F lda #$00              ;starting value for TMPEXP
ed51: e0 80                        cpx     #$80              ;any integer part?
ed53: f0 02                        beq     LED57             ;no, btwn .5 and .999999999
ed55: b0 09                        bcs     LED60             ;yes
ed57: a9 14        LED57           lda     #<CON_BILLION     ;multiply by 1e9
ed59: a0 ed                        ldy     #>CON_BILLION     ;to give adjustment a head start
ed5b: 20 7f e9                     jsr     FMULT
ed5e: a9 f7                        lda     #$f7 ;(should be -9) exponent adjustment
ed60: 85 99 LED60 sta TMPEXP ;0 or -9 \* Adjust until 1e8 <= FAC < 1e9.
ed62: a9 0f LED62 lda #<CON_999999999
ed64: a0 ed ldy #>CON_999999999
ed66: 20 b2 eb jsr FCOMP ;compare to 1e9-1
ed69: f0 1e beq LED89 ;FAC = 1e9-1
ed6b: 10 12 bpl LED7F ;too large, divide by ten
ed6d: a9 0a LED6D lda #<CON_99999999_9 ;compare to 1e8-.1
ed6f: a0 ed ldy #>CON_99999999_9
ed71: 20 b2 eb jsr FCOMP ;compare to 1e8-.1
ed74: f0 02 beq LED78 ;FAC = 1e8-.1
ed76: 10 0e bpl LED86 ;in range, adjustment finished
ed78: 20 39 ea LED78 jsr MUL10 ;too small, multiply by ten
ed7b: c6 99 dec TMPEXP ;keep track of multiplies
ed7d: d0 ee bne LED6D ;...always

ed7f: 20 55 ea LED7F jsr DIV10 ;too large, divide by ten
ed82: e6 99 inc TMPEXP ;keep track of divisions
ed84: d0 dc bne LED62 ;...always

ed86: 20 a0 e7 LED86 jsr FADDH ;round adjusted result
ed89: 20 f2 eb LED89 jsr QINT ;convert adjusted value to 32-bit integer
_ FAC+1 ... FAC+4 is now in integer form with power of ten adjustment in TMPEXP.
_
_ If -10 < TMPEXP > 1, print in decimal form. Otherwise, print in exponential
_ form.
ed8c: a2 01 FOUT_2 ldx #$01              ;assume 1 digit before "."
ed8e: a5 99                        lda     TMPEXP            ;check range
ed90: 18                           clc
ed91: 69 0a                        adc     #10
ed93: 30 09                        bmi     LED9E             ;< .01, use exponential form
ed95: c9 0b                        cmp     #11
ed97: b0 06                        bcs     LED9F             ;>= 1e10, use exponential form
ed99: 69 ff                        adc     #$ff ;less 1 gives index for "."
ed9b: aa tax
ed9c: a9 02 lda #$02 ;set remaining exponent = 0
ed9e: 38 LED9E sec ;compute remaining exponent
ed9f: e9 02 LED9F sbc #$02
eda1: 85 9a sta EXPON ;value for "E+xx" or "E-xx"
eda3: 86 99 stx TMPEXP ;index for decimal point
eda5: 8a txa ;see if "." comes first
eda6: f0 02 beq LEDAA ;yes
eda8: 10 13 bpl LEDBD ;no, later
edaa: a4 ad LEDAA ldy STRNG2 ;get index into string being built
edac: a9 2e lda #‘.’ ;store a decimal point
edae: c8 iny
edaf: 99 ff 00 sta STACK-1,y
edb2: 8a txa ;see if need ".0"
edb3: f0 06 beq LEDBB ;no
edb5: a9 30 lda #‘0’ ;yes, store "0"
edb7: c8 iny
edb8: 99 ff 00 sta STACK-1,y
edbb: 84 ad LEDBB sty STRNG2 ;save output index again \* Now divide by powers of ten to get successive digits.
edbd: a0 00 LEDBD ldy #$00 ;index to table of powers of ten
edbf: a2 80 ldx #$80 ;starting value for digit with direction
edc1: a5 a1 LEDC1 lda FAC+4 ;start by adding -100000000 until
edc3: 18 clc ; overshoot. Then add +10000000,
edc4: 79 6c ee adc DECTBL+3,y ; then add -1000000, then add
edc7: 85 a1 sta FAC+4 ; +100000, and so on.
edc9: a5 a0 lda FAC+3 ;the # of times each power is added
edcb: 79 6b ee adc DECTBL+2,y ; is 1 more than corresponding digit
edce: 85 a0 sta FAC+3
edd0: a5 9f lda FAC+2
edd2: 79 6a ee adc DECTBL+1,y
edd5: 85 9f sta FAC+2
edd7: a5 9e lda FAC+1
edd9: 79 69 ee adc DECTBL,y
eddc: 85 9e sta FAC+1
edde: e8 inx ;count the add
eddf: b0 04 bcs LEDE5 ;if C=1 and X negative, keep adding
ede1: 10 de bpl LEDC1 ;if C=0 and X positive, keep adding
ede3: 30 02 bmi LEDE7 ;if C=0 and X negative, we overshot

ede5: 30 da LEDE5 bmi LEDC1 ;if C=1 and X positive, we overshot
ede7: 8a LEDE7 txa ;overshot, so make X into a digit
ede8: 90 04 bcc LEDEE ;how depends on direction we were going
edea: 49 ff eor #$ff              ;digit = 9-x
edec: 69 0a                        adc     #10
edee: 69 2f        LEDEE           adc     #‘/’              ;(should be #'0' - 1)  make digit into ASCII
edf0: c8                           iny                       ;advance to next smaller power of ten
edf1: c8                           iny
edf2: c8                           iny
edf3: c8                           iny
edf4: 84 83                        sty     VARPNT            ;save ptr to powers
edf6: a4 ad                        ldy     STRNG2            ;get output ptr
edf8: c8                           iny                       ;store the digit
edf9: aa                           tax                       ;save digit, hi bit is direction
edfa: 29 7f                        and     #$7f              ;make sure $30..39 for string
edfc: 99 ff 00                     sta     STACK-1,y
edff: c6 99                        dec     TMPEXP            ;count the digit
ee01: d0 06                        bne     LEE09             ;not time for "." yet
ee03: a9 2e                        lda     #‘.’              ;time, so store the decimal point
ee05: c8                           iny
ee06: 99 ff 00                     sta     STACK-1,y
ee09: 84 ad        LEE09           sty     STRNG2            ;save output ptr again
ee0b: a4 83                        ldy     VARPNT            ;get ptr to powers
ee0d: 8a                           txa                       ;get digit with hi bit = direction
ee0e: 49 ff                        eor     #$ff ;change direction
ee10: 29 80 and #$80 ;$00 if adding, $80 if subtracting
ee12: aa tax
ee13: c0 24 cpy #<DECTBL-69 ;(should be DECTBL_END - DECTBL)
ee15: d0 aa bne LEDC1 ;not finished yet
_ Nine digits have been stored in string. Now look back and lop off trailing
_ zeroes and a trailing decimal point.
ee17: a4 ad FOUT_3 ldy STRNG2 ;points at last stored char
ee19: b9 ff 00 LEE19 lda STACK-1,y ;see if loppable
ee1c: 88 dey
ee1d: c9 30 cmp #‘0’ ;suppress trailing zeroes
ee1f: f0 f8 beq LEE19 ;yes, keep looping
ee21: c9 2e cmp #‘.’ ;suppress trailing decimal point
ee23: f0 01 beq LEE26 ;".", so write over it
ee25: c8 iny ;not ".", so include in string again
ee26: a9 2b LEE26 lda #‘+’ ;prepare for positive exponent "E+xx"
ee28: a6 9a ldx EXPON ;see if any E-value
ee2a: f0 2e beq FOUT_5 ;no, just mark end of string
ee2c: 10 08 bpl LEE36 ;yes, and it is positive
ee2e: a9 00 lda #$00 ;yes, and it is negative
ee30: 38 sec ;complement the value
ee31: e5 9a sbc EXPON
ee33: aa tax ;get magnitude in X-reg
ee34: a9 2d lda #‘-’ ;E sign
ee36: 99 01 01 LEE36 sta STACK+1,y ;store sign in string
ee39: a9 45 lda #‘E’ ;store "E" in string before sign
ee3b: 99 00 01 sta STACK,y
ee3e: 8a txa ;exponent magnitude in A-reg
ee3f: a2 2f ldx #‘/’ ;(should be #'0'-1) seed for exponent digit
ee41: 38 sec ;convert to decimal
ee42: e8 LEE42 inx ;count the subtraction
ee43: e9 0a sbc #10 ;ten's digit
ee45: b0 fb bcs LEE42 ;more tens to subtract
ee47: 69 3a adc #‘:’ ;(should be #'0'+10) convert remainder to one's digit
ee49: 99 03 01 sta STACK+3,y ;store one's digit
ee4c: 8a txa
ee4d: 99 02 01 sta STACK+2,y ;store ten's digit
ee50: a9 00 lda #$00 ;mark end of string with $00
ee52: 99 04 01 sta STACK+4,y
ee55: f0 08 beq FOUT_6 ;...always

ee57: 99 ff 00 FOUT_4 sta STACK-1,y ;store "0" in ASCII
ee5a: a9 00 FOUT_5 lda #$00              ;store $00 on end of string
ee5c: 99 00 01                     sta     STACK,y
ee5f: a9 00        FOUT_6          lda     #<STACK           ;point (Y,A) at beginning of string
ee61: a0 01                        ldy     #>STACK           ;(STR$ started string at STACK-1, but
ee63: 60 rts ; STR$ doesn't use (Y,A) anyway.)

ee64: 80 00 00 00+ CON_HALF .bulk $80,$00,$00,$00,$00 ;fp constant 0.5
                   * Powers of 10 from 1e8 down to 1, as 32-bit integers, with alternating signs.
ee69: fa 0a 1f 00  DECTBL          .bulk   $fa,$0a,$1f,$00   ;-100000000
ee6d: 00 98 96 80                  .bulk   $00,$98,$96,$80   ;10000000
ee71: ff f0 bd c0                  .bulk   $ff,$f0,$bd,$c0 ;-1000000
ee75: 00 01 86 a0 .bulk $00,$01,$86,$a0 ;100000
ee79: ff ff d8 f0 .bulk $ff,$ff,$d8,$f0 ;-10000
ee7d: 00 00 03 e8 .bulk $00,$00,$03,$e8 ;1000
ee81: ff ff ff 9c .bulk $ff,$ff,$ff,$9c   ;-100
ee85: 00 00 00 0a                  .bulk   $00,$00,$00,$0a   ;10
ee89: ff ff ff ff                  .bulk   $ff,$ff,$ff,$ff ;-1

                   ********************************************************************************
                   * SQR statement                                                                *
                   *                                                                              *
                   * <<< Unfortunately, rather than a Newton-Raphson iteration, Applesoft uses    *
                   * exponentiation SQR(x) = x^.5 >>>                                             *
                   ********************************************************************************

ee8d: 20 63 eb SQR jsr COPY_FAC_TO_ARG_ROUNDED
ee90: a9 64 lda #<CON_HALF ;set up power of 0.5
ee92: a0 ee ldy #>CON_HALF
ee94: 20 f9 ea jsr LOAD_FAC_FROM_YA
_ Exponentiation operation
_
_ ARG ^ FAC = EXP( LOG(ARG) _ FAC )
ee97: f0 70 FPWRT beq EXP ;if FAC=0, ARG^FAC=EXP(0)
ee99: a5 a5 lda ARG ;if ARG=0, ARG^FAC=0
ee9b: d0 03 bne LEEA0 ;neither is zero
ee9d: 4c 50 e8 jmp STA_IN_FAC_SIGN_AND_EXP ;set FAC = 0

eea0: a2 8a LEEA0 ldx #TEMP3 ;save FAC in TEMP3
eea2: a0 00 ldy #>TEMP3
eea4: 20 2b eb jsr STORE_FAC_AT_YX_ROUNDED
eea7: a5 aa lda ARG_SIGN ;normally, ARG must be positive
eea9: 10 0f bpl LEEBA ;it is positive, so all is well
eeab: 20 23 ec jsr INT ;negative, but ok if integral power
eeae: a9 8a lda #TEMP3 ;see if INT(FAC)=FAC
eeb0: a0 00 ldy #>TEMP3
eeb2: 20 b2 eb jsr FCOMP ;is it an integer power?
eeb5: d0 03 bne LEEBA ;not integral, will cause error later
eeb7: 98 tya ;mark ARG sign + as it is moved to FAC
eeb8: a4 0d ldy CHARAC ;integral, so allow negative ARG
eeba: 20 55 eb LEEBA jsr MFA ;move argument to FAC
eebd: 98 tya ;save flag for negative ARG (0=+)
eebe: 48 pha
eebf: 20 41 e9 jsr LOG ;get log(ARG)
eec2: a9 8a lda #TEMP3 ;multiply by power
eec4: a0 00 ldy #>TEMP3
eec6: 20 7f e9 jsr FMULT
eec9: 20 09 ef jsr EXP ;E ^ log(FAC)
eecc: 68 pla ;get flag for negative ARG
eecd: 4a lsr A ;<<< LSR,BCC could be merely BPL >>>
eece: 90 0a bcc RTS_18 ;not negative, finished \* Negate value in FAC.
eed0: a5 9d NEGOP lda FAC ;if FAC=0, no need to complement
eed2: f0 06 beq RTS_18 ;yes, FAC=0
eed4: a5 a2 lda FAC_SIGN ;no, so toggle sign
eed6: 49 ff eor #$ff
eed8: 85 a2 sta FAC_SIGN
eeda: 60 RTS_18 rts

eedb: 81 38 aa 3b+ CON_LOG_E .bulk $81,$38,$aa,$3b,$29 ;log(e) to base 2
eee0: 07           POLY_EXP        .dd1    7                 ;(# of terms in polynomial) - 1
eee1: 71 34 58 3e+                 .bulk   $71,$34,$58,$3e,$56 ;(LOG(2)^7)/8!
eee6: 74 16 7e b3+                 .bulk   $74,$16,$7e,$b3,$1b ;(LOG(2)^6)/7!
eeeb: 77 2f ee e3+                 .bulk   $77,$2f,$ee,$e3,$85 ;(LOG(2)^5)/6!
eef0: 7a 1d 84 1c+                 .bulk   $7a,$1d,$84,$1c,$2a ;(LOG(2)^4)/5!
eef5: 7c 63 59 58+                 .bulk   $7c,$63,$59,$58,$0a ;(LOG(2)^3)/4!
eefa: 7e 75 fd e7+                 .bulk   $7e,$75,$fd,$e7,$c6 ;(LOG(2)^2)/3!
eeff: 80 31 72 18+ .bulk $80,$31,$72,$18,$10 ;LOG(2)/2!
ef04: 81 00 00 00+ .bulk $81,$00,$00,$00,$00 ;1

                   ********************************************************************************
                   * EXP statement                                                                *
                   *                                                                              *
                   * FAC = E ^ FAC                                                                *
                   ********************************************************************************
                   SIGNFLG         .var    $16    {addr/1}   ;Overlaps CPRMASK
                   ARG_EXTENSION   .var    $92    {addr/1}   ;Overlaps LENGTH+1
                   SGNCPR          .var    $ab    {addr/1}   ;Overlaps STRNG1
                   FAC_EXTENSION   .var    $ac    {addr/1}   ;Overlaps STRNG1+1
                   SERPNT          .var    $ad    {addr/2}   ;Overlaps STRNG2

ef09: a9 db EXP lda #<CON_LOG_E ;convert to power of two problem
ef0b: a0 ee ldy #>CON_LOG_E ;E^x = 2^(log2(e)_x)
ef0d: 20 7f e9 jsr FMULT
ef10: a5 ac lda FAC_EXTENSION ;non-standard rounding here
ef12: 69 50 adc #$50 ;round up if extension > $AF
ef14: 90 03 bcc LEF19 ;no, don't round up
ef16: 20 7a eb jsr INCREMENT_MANTISSA
ef19: 85 92 LEF19 sta ARG_EXTENSION ;strange value
ef1b: 20 66 eb jsr MAF ;copy FAC into ARG
ef1e: a5 9d lda FAC ;maximum exponent is < 128
ef20: c9 88 cmp #$88 ;within range?
ef22: 90 03 bcc LEF27 ;yes
ef24: 20 2b ea LEF24 jsr OUTOFRNG ;overflow if +, return 0.0 if -
ef27: 20 23 ec LEF27 jsr INT ;get INT(FAC)
ef2a: a5 0d lda CHARAC ;this is the integral part of the power
ef2c: 18 clc ;add to exponent bias + 1
ef2d: 69 81 adc #$81
ef2f: f0 f3 beq LEF24 ;overflow
ef31: 38 sec ;back to normal bias
ef32: e9 01 sbc #$01
ef34: 48 pha ;save exponent
_
ef35: a2 05 ldx #5 ;swap ARG and FAC
ef37: b5 a5 LEF37 lda ARG,x ;<<< why swap? it is doing >>>
ef39: b4 9d ldy FAC,x ;<<< -(A-B) when (B-A) is the >>>
ef3b: 95 9d sta FAC,x ;<<< same thing! >>>
ef3d: 94 a5 sty ARG,x
ef3f: ca dex
ef40: 10 f5 bpl LEF37
ef42: a5 92 lda ARG_EXTENSION
ef44: 85 ac sta FAC_EXTENSION
ef46: 20 aa e7 jsr FSUBT ;power-INT(power) --> fractional part
ef49: 20 d0 ee jsr NEGOP
ef4c: a9 e0 lda #<POLY_EXP
ef4e: a0 ee ldy #>POLY_EXP
ef50: 20 72 ef jsr POLYNOMIAL ;compute F(x) on fractional part
ef53: a9 00 lda #$00
ef55: 85 ab sta SGNCPR
ef57: 68 pla ;get exponent
ef58: 20 10 ea jsr ADD_EXPONENTS_1
ef5b: 60 rts ;<<< wasted byte here, could have just JMP ADD_EXPONENTS_1 >>>

                   * Odd polynomial subroutine
                   *
                   *   F(x) = x * P(x^2)
                   *
                   *   where: x is value in FAC
                   *          (Y,A) points at coefficient table
                   *          first byte of coeff. table is N
                   *          coefficients follow, highest power first
                   *
                   *   P(x^2) computed using normal polynomial subroutine

ef5c: 85 ad POLYNOMIAL_ODD sta SERPNT ;save address of coefficient table
ef5e: 84 ae sty SERPNT+1
ef60: 20 21 eb jsr STORE_FAC_IN_TEMP1_ROUNDED
ef63: a9 93 lda #TEMP1 ;Y=0 already, so (Y,A) points at TEMP1
ef65: 20 7f e9 jsr FMULT ;form x^2
ef68: 20 76 ef jsr SERMAIN ;do series in x^2
ef6b: a9 93 lda #TEMP1 ;get x again
ef6d: a0 00 ldy #>TEMP1
ef6f: 4c 7f e9 jmp FMULT ;multiply x by P(x^2) and exit

                   * Normal polynomial subroutine
                   *
                   *   P(x) = C(0)*x^n + C(1)*x^(n-1) + ... + C(n)
                   *
                   *   where: x is value in FAC
                   *          (Y,A) points at coefficient table
                   *          first byte of coeff. table is N
                   *          coefficients follow, highest power first

ef72: 85 ad POLYNOMIAL sta SERPNT ;pointer to coefficient table
ef74: 84 ae sty SERPNT+1
ef76: 20 1e eb SERMAIN jsr STORE_FAC_IN_TEMP2_ROUNDED
ef79: b1 ad lda (SERPNT),y ;get N
ef7b: 85 a3 sta SERLEN ;save N
ef7d: a4 ad ldy SERPNT ;bump ptr to highest coefficient
ef7f: c8 iny ; and get ptr into (Y,A)
ef80: 98 tya
ef81: d0 02 bne LEF85
ef83: e6 ae inc SERPNT+1
ef85: 85 ad LEF85 sta SERPNT
ef87: a4 ae ldy SERPNT+1
ef89: 20 7f e9 LEF89 jsr FMULT ;accumulate series terms
ef8c: a5 ad lda SERPNT ;bump ptr to next coefficient
ef8e: a4 ae ldy SERPNT+1
ef90: 18 clc
ef91: 69 05 adc #5
ef93: 90 01 bcc LEF96
ef95: c8 iny
ef96: 85 ad LEF96 sta SERPNT
ef98: 84 ae sty SERPNT+1
ef9a: 20 be e7 jsr FADD ;add next coefficient
ef9d: a9 98 lda #TEMP2 ;point at x again
ef9f: a0 00 ldy #>TEMP2
efa1: c6 a3 dec SERLEN ;if series not finished,
efa3: d0 e4 bne LEF89 ; then add another term
efa5: 60 RTS_19 rts ;finished

efa6: 98 35 44 7a CON_RND_1 .bulk $98,$35,$44,$7a   ;<<< these are missing one byte >>>
efaa: 68 28 b1 46  CON_RND_2       .bulk   $68,$28,$b1,$46 ;<<< for fp values >>>

                   ********************************************************************************
                   * RND statement                                                                *
                   ********************************************************************************

efae: 20 82 eb RND jsr SIGN ;reduce argument to -1, 0, or +1
efb1: aa tax ;save argument
efb2: 30 18 bmi LEFCC ;= -1, use current argument for seed
efb4: a9 c9 lda #RNDSEED ;use current seed
efb6: a0 00 ldy #>RNDSEED
efb8: 20 f9 ea jsr LOAD_FAC_FROM_YA
efbb: 8a txa ;recall sign of argument
efbc: f0 e7 beq RTS_19 ;=0, return seed unchanged
efbe: a9 a6 lda #<CON_RND_1 ;very poor RND algorithm
efc0: a0 ef ldy #>CON_RND_1
efc2: 20 7f e9 jsr FMULT
efc5: a9 aa lda #<CON_RND_2 ;also, constants are truncated
efc7: a0 ef ldy #>CON_RND_2 ;<<< this does nothing, due to small exponent >>>
efc9: 20 be e7 jsr FADD
efcc: a6 a1 LEFCC ldx FAC+4 ;shuffle hi and lo bytes
efce: a5 9e lda FAC+1 ;to supposedly make it more random
efd0: 85 a1 sta FAC+4
efd2: 86 9e stx FAC+1
efd4: a9 00 lda #$00 ;make it positive
efd6: 85 a2 sta FAC_SIGN
efd8: a5 9d lda FAC ;a somewhat random extension
efda: 85 ac sta FAC_EXTENSION
efdc: a9 80 lda #$80 ;exponent to make value < 1.0
efde: 85 9d sta FAC
efe0: 20 2e e8 jsr NORMALIZE_FAC_2
efe3: a2 c9 ldx #RNDSEED ;move FAC to RNDSEED
efe5: a0 00 ldy #>RNDSEED
efe7: 4c 2b eb GO_MOVMF jmp STORE_FAC_AT_YX_ROUNDED

                   ********************************************************************************
                   * COS statement                                                                *
                   ********************************************************************************

efea: a9 66 COS lda #<CON_PI_HALF ;cos(x)=sin(x + PI/2)
efec: a0 f0 ldy #>CON_PI_HALF
efee: 20 be e7 jsr FADD
**************************************\*\*\*\***************************************
_ SIN statement _
**************************************\*\*\*\***************************************
eff1: 20 63 eb SIN jsr COPY_FAC_TO_ARG_ROUNDED
eff4: a9 6b lda #<CON_PI_DOUB ;remove multiples of 2*PI
eff6: a0 f0 ldy #>CON_PI_DOUB ; by dividing and saving
eff8: a6 aa ldx ARG_SIGN ; the fractional part
effa: 20 5e ea jsr DIV ;use sign of argument
effd: 20 63 eb jsr COPY_FAC_TO_ARG_ROUNDED
f000: 20 23 ec jsr INT ;take integer part
f003: a9 00 lda #$00 ;<<< wasted lines, because FSUBT >>>
f005: 85 ab sta SGNCPR ;<<< changes SGNCPR again >>>
f007: 20 aa e7 jsr FSUBT ;subtract to get fractional part
* FAC = angle as a fraction of a full circle \*
_ Now fold the range into a quarter circle.
_
_ <<< there are much simpler ways to do this >>>
f00a: a9 70 lda #<QUARTER ;1/4 - fraction makes
f00c: a0 f0 ldy #>QUARTER ;-3/4 <= fraction < 1/4
f00e: 20 a7 e7 jsr FSUB
f011: a5 a2 lda FAC_SIGN ;test sign of result
f013: 48 pha ;save sign for later unfolding
f014: 10 0d bpl SIN_1 ;already 0...1/4
f016: 20 a0 e7 jsr FADDH ;add 1/2 to shift to -1/4...1/2
f019: a5 a2 lda FAC_SIGN ;test sign
f01b: 30 09 bmi SIN_2 ;-1/4...0
f01d: a5 16 lda SIGNFLG ;0...1/2 ; SIGNFLG initialized = 0 in TAN
f01f: 49 ff eor #$ff ; function
f021: 85 16 sta SIGNFLG ;TAN is only user of SIGNFLG too
_ if fall thru, range is 0...1/2
_ if branch here, range is 0...1/4
f023: 20 d0 ee SIN_1 jsr NEGOP
_ if fall thru, range is -1/2...0 \* if branch here, range is -1/4...0
f026: a9 70 SIN_2 lda #<QUARTER ;add 1/4 to shift range
f028: a0 f0 ldy #>QUARTER ; to -1/4...1/4
f02a: 20 be e7 jsr FADD
f02d: 68 pla ;get saved sign from above
f02e: 10 03 bpl LF033
f030: 20 d0 ee jsr NEGOP ;make range 0...1/4
f033: a9 75 LF033 lda #<POLY_SIN ;do standard SIN series
f035: a0 f0 ldy #>POLY_SIN
f037: 4c 5c ef jmp POLYNOMIAL_ODD

                   ********************************************************************************
                   * TAN statement                                                                *
                   *                                                                              *
                   * Compute TAN(x) = SIN(x) / COS(x)                                             *
                   ********************************************************************************

f03a: 20 21 eb TAN jsr STORE_FAC_IN_TEMP1_ROUNDED
f03d: a9 00 lda #$00 ;SIGNFLG will be toggled of 2nd or 3rd
f03f: 85 16 sta SIGNFLG ; quadrant
f041: 20 f1 ef jsr SIN ;get SIN(x)
f044: a2 8a ldx #TEMP3 ;save SIN(x) in TEMP3
f046: a0 00 ldy #>TEMP3
f048: 20 e7 ef jsr GO_MOVMF ;<<< funny way to call MOVMV! >>>
f04b: a9 93 lda #TEMP1 ;retrieve x
f04d: a0 00 ldy #>TEMP1
f04f: 20 f9 ea jsr LOAD_FAC_FROM_YA
f052: a9 00 lda #$00 ;and compute COS(x)
f054: 85 a2 sta FAC_SIGN
f056: a5 16 lda SIGNFLG
f058: 20 62 f0 jsr TAN_1 ;weird & dangerous way to get into SIN
f05b: a9 8a lda #TEMP3 ;now form SIN/COS
f05d: a0 00 ldy #>TEMP3
f05f: 4c 66 ea jmp FDIV

f062: 48 TAN_1 pha ;shame, shame!
f063: 4c 23 f0 jmp SIN_1

f066: 81 49 0f da+ CON_PI_HALF .bulk $81,$49,$0f,$da,$a2
f06b: 83 49 0f da+ CON_PI_DOUB     .bulk   $83,$49,$0f,$da,$a2
f070: 7f 00 00 00+ QUARTER         .bulk   $7f,$00,$00,$00,$00
f075: 05           POLY_SIN        .dd1    5                 ;power of polynomial
f076: 84 e6 1a 2d+                 .bulk   $84,$e6,$1a,$2d,$1b ;(2PI)^11/11!
f07b: 86 28 07 fb+                 .bulk   $86,$28,$07,$fb,$f8 ;(2PI)^9/9!
f080: 87 99 68 89+                 .bulk   $87,$99,$68,$89,$01 ;(2PI)^7/7!
f085: 87 23 35 df+                 .bulk   $87,$23,$35,$df,$e1 ;(2PI)^5/5!
f08a: 86 a5 5d e7+                 .bulk   $86,$a5,$5d,$e7,$28 ;(2PI)^3/3!
f08f: 83 49 0f da+                 .bulk   $83,$49,$0f,$da,$a2 ;2PI \* <<< next 10 bytes are never referenced >>>
f094: a6 d3 c1 c8+ .rstr ↑“JNDUHTHAS&” ;xor with $87 to get "MICROSOFT!"

                   ********************************************************************************
                   * ATN statement                                                                *
                   ********************************************************************************

f09e: a5 a2 ATN lda FAC_SIGN ;fold the argument range first
f0a0: 48 pha ;save sign for later unfolding
f0a1: 10 03 bpl LF0A6 ;.ge. 0
f0a3: 20 d0 ee jsr NEGOP ;.lt. 0, so complement
f0a6: a5 9d LF0A6 lda FAC ;if .ge. 1, form reciprocal
f0a8: 48 pha ;save for later unfolding
f0a9: c9 81 cmp #$81 ;exponent for .ge. 1
f0ab: 90 07 bcc LF0B4 ;x < 1
f0ad: a9 13 lda #<CON_ONE ;form 1/x
f0af: a0 e9 ldy #>CON_ONE
f0b1: 20 66 ea jsr FDIV
_ 0 <= x <= 1
_ 0 <= ATN(x) <= PI/8
f0b4: a9 ce LF0B4 lda #<POLY_ATN ;compute polynomial approximation
f0b6: a0 f0 ldy #>POLY_ATN
f0b8: 20 5c ef jsr POLYNOMIAL_ODD
f0bb: 68 pla ;start to unfold
f0bc: c9 81 cmp #$81 ;was it .ge. 1?
f0be: 90 07 bcc LF0C7 ;no
f0c0: a9 66 lda #<CON_PI_HALF ;yes, subtract from PI/2
f0c2: a0 f0 ldy #>CON_PI_HALF
f0c4: 20 a7 e7 jsr FSUB
f0c7: 68 LF0C7 pla ;was it negative?
f0c8: 10 03 bpl RTS_20 ;no
f0ca: 4c d0 ee jmp NEGOP ;yes, complement

f0cd: 60 RTS_20 rts

f0ce: 0b POLY_ATN .dd1 11 ;power of polynomial
f0cf: 76 b3 83 bd+ .bulk $76,$b3,$83,$bd,$d3
f0d4: 79 1e f4 a6+                 .bulk   $79,$1e,$f4,$a6,$f5
f0d9: 7b 83 fc b0+ .bulk $7b,$83,$fc,$b0,$10
f0de: 7c 0c 1f 67+                 .bulk   $7c,$0c,$1f,$67,$ca
f0e3: 7c de 53 cb+ .bulk $7c,$de,$53,$cb,$c1
f0e8: 7d 14 64 70+                 .bulk   $7d,$14,$64,$70,$4c
f0ed: 7d b7 ea 51+                 .bulk   $7d,$b7,$ea,$51,$7a
f0f2: 7d 63 30 88+                 .bulk   $7d,$63,$30,$88,$7e
f0f7: 7e 92 44 99+                 .bulk   $7e,$92,$44,$99,$3a
f0fc: 7e 4c cc 91+                 .bulk   $7e,$4c,$cc,$91,$c7
f101: 7f aa aa aa+ .bulk $7f,$aa,$aa,$aa,$13
f106: 81 00 00 00+ .bulk $81,$00,$00,$00,$00

                   * Generic copy of CHRGET subroutine, which is copied into $00B1...00C8 during
                   * initialization.
                   *
                   * Cornelis Bongers described several improvements to CHRGET in Micro magazine or
                   * Call-A.P.P.L.E. (I don't remember which or exactly when).

f10b: e6 b8 GENERIC_CHRGET inc TXTPTR
f10d: d0 02 bne GENERIC_TXTPTR
f10f: e6 b9 inc TXTPTR+1
f111: ad 60 ea GENERIC_TXTPTR lda LEA60 ;<<< actual address filled in later >>>
f114: c9 3a cmp #‘:’ ;EOS, also top of numeric range
f116: b0 0a bcs LF122 ;not number, might be EOS
f118: c9 20 cmp #‘ ’ ;ignore blanks
f11a: f0 ef beq GENERIC_CHRGET
f11c: 38 sec ;test for numeric range in way that
f11d: e9 30 sbc #‘0’ ; clears carry if char is digit
f11f: 38 sec ; and leaves char in A-reg
f120: e9 d0 sbc #$d0 ;(should be #-'0')
f122: 60 LF122 rts

                   * Initial value for random number, also copied in along with CHRGET, but
                   * erroneously:
                   * <<< the last byte is not copied >>>

f123: 80 4f c7 52+ .bulk $80,$4f,$c7,$52,$58 ;approx. = .811635157

                   • Clear variables
                   LASTPT          .var    $53    {addr/2}   ;Overlaps TEMPPT+1

f128: a2 ff COLD_START ldx #$ff              ;set direct mode flag
f12a: 86 76                        stx     CURLIN+1
f12c: a2 fb                        ldx     #$fb ;set stack pointer, leaving room for
f12e: 9a txs ; line buffer during parsing
f12f: a9 28 lda #<COLD_START ;set RESTART to COLD_START
f131: a0 f1 ldy #>COLD_START ; until cold start is completed
f133: 85 01 sta GOWARM+1
f135: 84 02 sty GOWARM+2
f137: 85 04 sta GOSTROUT+1 ;also second user vector...
f139: 84 05 sty GOSTROUT+2 ;...we simply must finish COLD_START!
f13b: 20 73 f2 jsr NORMAL ;set normal display mode
f13e: a9 4c lda #$4c              ;JMP opcode for 4 vectors
f140: 85 00                        sta     GOWARM            ;warm start
f142: 85 03                        sta     GOSTROUT          ;anyone ever use this one?
f144: 85 90                        sta     JMPADRS           ;used by functions (JMP JMPADRS)
f146: 85 0a                        sta     USRVEC            ;USR function vector
f148: a9 99                        lda     #<IQERR           ;point USR to illegal quantity
f14a: a0 e1                        ldy     #>IQERR           ; error, until user sets it up
f14c: 85 0b                        sta     USRVEC+1
f14e: 84 0c                        sty     USRVEC+2
                   * Move generic CHRGET and random seed into place
                   *
                   * <<< Note that loop value is wrong!  The last byte of the random seed is not
                   * copied into page zero! >>>
f150: a2 1c                        ldx     #$1c              ;(should be #GENERIC_END-GENERIC_CHRGET-1)
f152: bd 0a f1     LF152           lda     GENERIC_CHRGET-1,x
f155: 95 b0                        sta     CHRGET-1,x
f157: 86 f1                        stx     SPEEDZ            ;on last pass stores $01
f159: ca                           dex
f15a: d0 f6                        bne     LF152
                   *
f15c: 86 f2                        stx     TRCFLG            ;X-reg=0, turn off tracing
f15e: 8a                           txa                       ;A-reg=0
f15f: 85 a4                        sta     SHIFT_SIGN_EXT
f161: 85 54                        sta     LASTPT+1
f163: 48                           pha                       ;put $00 on stack (what for?)
f164: a9 03                        lda     #3                ;set length of temp. string descriptors
f166: 85 8f                        sta     DSCLEN            ;for garbage collection subroutine
f168: 20 fb da                     jsr     CRDO              ;print <return>
f16b: a9 01                        lda     #$01              ;set up fake forward link
f16d: 8d fd 01                     sta     INPUT_BUFFER-3
f170: 8d fc 01                     sta     INPUT_BUFFER-4
f173: a2 55                        ldx     #TEMPST           ;init index to temp string descriptors
f175: 86 52                        stx     TEMPPT
                   * Find high end of RAM
f177: a9 00                        lda     #$00              ;set up pointer to low end of RAM
f179: a0 08                        ldy     #$08
f17b: 85 50                        sta     LINNUM
f17d: 84 51                        sty     LINNUM+1
f17f: a0 00                        ldy     #$00
f181: e6 51        LF181           inc     LINNUM+1          ;test first byte of each page
f183: b1 50                        lda     (LINNUM),y        ;by complementing it and watching
f185: 49 ff                        eor     #$ff ; it change the same way
f187: 91 50 sta (LINNUM),y
f189: d1 50 cmp (LINNUM),y ;ROM or empty sockets won't track
f18b: d0 08 bne LF195 ;not RAM here
f18d: 49 ff eor #$ff              ;restore original value
f18f: 91 50                        sta     (LINNUM),y
f191: d1 50                        cmp     (LINNUM),y        ;did it track again?
f193: f0 ec                        beq     LF181             ;yes, still in RAM
f195: a4 50        LF195           ldy     LINNUM            ;no, end of RAM
f197: a5 51                        lda     LINNUM+1
f199: 29 f0                        and     #$f0 ;force a multiple of 4096 bytes
f19b: 84 73 sty MEMSIZE ;(bad RAM may have yielded a non-multiple)
f19d: 85 74 sta MEMSIZE+1
f19f: 84 6f sty FRETOP ;set HIMEM and bottom of strings
f1a1: 85 70 sta FRETOP+1
f1a3: a2 00 ldx #$00 ;set program pointer to $0800
f1a5: a0 08 ldy #$08
f1a7: 86 67 stx TXTTAB
f1a9: 84 68 sty TXTTAB+1
f1ab: a0 00 ldy #$00 ;turn off semi-secret LOCK flag
f1ad: 84 d6 sty LOCK
f1af: 98 tya ;A-reg=0 too
f1b0: 91 67 sta (TXTTAB),y ;first byte in program space = 0
f1b2: e6 67 inc TXTTAB ;advance past the $00
f1b4: d0 02 bne LF1B8
f1b6: e6 68 inc TXTTAB+1
f1b8: a5 67 LF1B8 lda TXTTAB
f1ba: a4 68 ldy TXTTAB+1
f1bc: 20 e3 d3 jsr REASON ;set rest of pointers up
f1bf: 20 4b d6 jsr SCRTCH ;more pointers
f1c2: a9 3a lda #<STROUT ;put correct addresses in two
f1c4: a0 db ldy #>STROUT ; user vectors
f1c6: 85 04 sta GOSTROUT+1
f1c8: 84 05 sty GOSTROUT+2
f1ca: a9 3c lda #<RESTART
f1cc: a0 d4 ldy #>RESTART
f1ce: 85 01 sta GOWARM+1
f1d0: 84 02 sty GOWARM+2
f1d2: 6c 01 00 jmp (GOWARM+1) ;silly, why not just "JMP RESTART"

                   ********************************************************************************
                   * CALL statement                                                               *
                   *                                                                              *
                   * Effectively performs a JSR to the specified address, with the following      *
                   * register contents:                                                           *
                   *                                                                              *
                   *   (A,Y) = call address                                                       *
                   *   X-reg = $9D                                                                *
                   *                                                                              *
                   * The called routine can return with RTS, and Applesoft will continue with the *
                   * next statement.                                                              *
                   ********************************************************************************

f1d5: 20 67 dd CALL jsr FRMNUM ;evalute expression for CALL address
f1d8: 20 52 e7 jsr GETADR ;convert expression to 16-bit integer
f1db: 6c 50 00 jmp (LINNUM) ; in LINNUM, and jump there

                   ********************************************************************************
                   * IN# statement                                                                *
                   *                                                                              *
                   * Note: no check for valid slot #, as long as value is < 256 it is accepted.   *
                   * Monitor masks value to 4 bits (0-15).                                        *
                   ********************************************************************************

f1de: 20 f8 e6 IN_NUMBER jsr GETBYT ;get slot number in X-reg
f1e1: 8a txa ;monitor will install in vector
f1e2: 4c 8b fe jmp MON_INPORT ;at $38,39

                   ********************************************************************************
                   * PR# statement                                                                *
                   *                                                                              *
                   * Note: no check for valid slot #, as long as value is < 256 it is accepted.   *
                   * Monitor masks value to 4 bits (0-15).                                        *
                   ********************************************************************************

f1e5: 20 f8 e6 PR_NUMBER jsr GETBYT ;get slot number in X-reg
f1e8: 8a txa ;monitor will install in vector
f1e9: 4c 95 fe jmp MON_OUTPORT ;at $36,37

                   * Get two values < 48, with comma separator
                   *
                   * Called for PLOT X,Y
                   *        and HLIN A,B at Y
                   *        and VLIN A,B at X

f1ec: 20 f8 e6 PLOTFNS jsr GETBYT ;get first value in X-reg
f1ef: e0 30 cpx #48 ;must be < 48
f1f1: b0 13 bcs GOERR ;too large
f1f3: 86 f0 stx FIRST ;save first value
f1f5: a9 2c lda #‘,’ ;must have a comma
f1f7: 20 c0 de jsr SYNCHR
f1fa: 20 f8 e6 jsr GETBYT ;get second value in X-reg
f1fd: e0 30 cpx #48 ;must be < 48
f1ff: b0 05 bcs GOERR ;too large
f201: 86 2c stx MON_H2 ;save second value
f203: 86 2d stx MON_V2
f205: 60 rts ;second value still in X-reg

f206: 4c 99 e1 GOERR jmp IQERR ;illegal quantity error

                   * Get "A,B at C" values for HLIN and VLIN
                   *
                   * Put smaller of (A,B) in FIRST, and larger of (A,B) in H2 and V2.  Return with
                   * X-reg = C-value.

f209: 20 ec f1 LINCOOR jsr PLOTFNS ;get A,B values
f20c: e4 f0 cpx FIRST ;is A < B?
f20e: b0 08 bcs LF218 ;yes, in right order
f210: a5 f0 lda FIRST ;no, interchange them
f212: 85 2c sta MON_H2
f214: 85 2d sta MON_V2
f216: 86 f0 stx FIRST
f218: a9 c5 LF218 lda #TOK_AT ;must have AT next
f21a: 20 c0 de jsr SYNCHR
f21d: 20 f8 e6 jsr GETBYT ;get C-value in X-reg
f220: e0 30 cpx #48 ;must be < 48
f222: b0 e2 bcs GOERR ;too large
f224: 60 rts ;C-value in X-reg

                   ********************************************************************************
                   * PLOT statement                                                               *
                   ********************************************************************************

f225: 20 ec f1 PLOT jsr PLOTFNS ;get X,Y values
f228: 8a txa ;Y-coord to A-reg for monitor
f229: a4 f0 ldy FIRST ;X-coord to Y-reg for monitor
f22b: c0 28 cpy #40 ;X-coord must be < 40
f22d: b0 d7 bcs GOERR ;X-coord is too large
f22f: 4c 00 f8 jmp MON_PLOT ;plot!

                   ********************************************************************************
                   * HLIN statement                                                               *
                   ********************************************************************************

f232: 20 09 f2 HLIN jsr LINCOOR ;get "A,B at C"
f235: 8a txa ;Y-coord in A-reg
f236: a4 2c ldy MON_H2 ;right end of line
f238: c0 28 cpy #40 ;must be < 40
f23a: b0 ca bcs GOERR ;too large
f23c: a4 f0 ldy FIRST ;left end of line in Y-reg
f23e: 4c 19 f8 jmp MON_HLINE ;let monitor draw line

                   ********************************************************************************
                   * VLIN statement                                                               *
                   ********************************************************************************

f241: 20 09 f2 VLIN jsr LINCOOR ;get "A,B at C"
f244: 8a txa ;X-coord in Y-reg
f245: a8 tay
f246: c0 28 cpy #40 ;X-coord must be < 40
f248: b0 bc bcs GOERR ;too large
f24a: a5 f0 lda FIRST ;top end of line in A-reg
f24c: 4c 28 f8 jmp MON_VLINE ;let monitor draw line

                   ********************************************************************************
                   * COLOR= statement                                                             *
                   ********************************************************************************

f24f: 20 f8 e6 COLOR jsr GETBYT ;get color value in X-reg
f252: 8a txa
f253: 4c 64 f8 jmp MON_SETCOL ;let monitor store color

                   ********************************************************************************
                   * VTAB statement                                                               *
                   ********************************************************************************

f256: 20 f8 e6 VTAB jsr GETBYT ;get line # in X-reg
f259: ca dex ;convert to zero base
f25a: 8a txa
f25b: c9 18 cmp #24 ;must be 0-23
f25d: b0 a7 bcs GOERR ;too large, or was "VTAB 0"
f25f: 4c 5b fb jmp MON_TABV ;let monitor compute base

                   ********************************************************************************
                   * SPEED= statement                                                             *
                   ********************************************************************************

f262: 20 f8 e6 SPEED jsr GETBYT ;get speed setting in X-reg
f265: 8a txa ;SPEEDZ = $100 - speed
f266: 49 ff                        eor     #$ff ;so "SPEED=255" is fastest
f268: aa tax
f269: e8 inx
f26a: 86 f1 stx SPEEDZ
f26c: 60 rts

                   ********************************************************************************
                   * TRACE statement                                                              *
                   *                                                                              *
                   * Set sign bit in TRCFLG.                                                      *
                   ********************************************************************************

f26d: 38 TRACE sec
f26e: 90 bcc ▼ $f288 ;fake BCC to skip next opcode
**************************************\*\*\*\***************************************
_ NOTRACE statement _
**************************************\*\*\*\***************************************
f26f: 18 NOTRACE clc
f270: 66 f2 ror TRCFLG ;shift carry into TRCFLG
f272: 60 rts

                   ********************************************************************************
                   * NORMAL statement                                                             *
                   ********************************************************************************

f273: a9 ff NORMAL lda #$ff ;set INVFLG = $FF
f275: d0 02 bne N*I* ;and FLASH_BIT = $00

                   ********************************************************************************
                   * INVERSE statement                                                            *
                   ********************************************************************************

f277: a9 3f INVERSE lda #$3f ;set INVFLG = $3F
f279: a2 00 N*I* ldx #$00 ;and FLASH*BIT = $00
f27b: 85 32 N_I_F* sta MON_INVFLAG
f27d: 86 f3 stx FLASH_BIT
f27f: 60 rts

                   ********************************************************************************
                   * FLASH statement                                                              *
                   ********************************************************************************

f280: a9 7f FLASH lda #$7f ;set INVFLG = $7F
f282: a2 40 ldx #$40 ;and FLASH*BIT = $40
f284: d0 f5 bne N_I_F* ;...always

                   ********************************************************************************
                   * HIMEM: statement                                                             *
                   ********************************************************************************

f286: 20 67 dd HIMEM jsr FRMNUM ;get value specified for HIMEM
f289: 20 52 e7 jsr GETADR ; as 16-bit integer
f28c: a5 50 lda LINNUM ;must be above variables and arrays
f28e: c5 6d cmp STREND
f290: a5 51 lda LINNUM+1
f292: e5 6e sbc STREND+1
f294: b0 03 bcs SETHI ;it is above them
f296: 4c 10 d4 JMM jmp MEMERR ;not enough memory

f299: a5 50 SETHI lda LINNUM ;store new HIMEM: value
f29b: 85 73 sta MEMSIZE
f29d: 85 6f sta FRETOP ;<<<note that HIMEM: does not>>>
f29f: a5 51 lda LINNUM+1 ;<<<clear string variables.  >>>
f2a1: 85 74 sta MEMSIZE+1 ;<<<this could be disastrous.>>>
f2a3: 85 70 sta FRETOP+1
f2a5: 60 rts

                   ********************************************************************************
                   * LOMEM: statement                                                             *
                   ********************************************************************************

f2a6: 20 67 dd LOMEM jsr FRMNUM ;get value specified for LOMEM
f2a9: 20 52 e7 jsr GETADR ; as 16-bit integer in LINNUM
f2ac: a5 50 lda LINNUM ;must be below HIMEM
f2ae: c5 73 cmp MEMSIZE
f2b0: a5 51 lda LINNUM+1
f2b2: e5 74 sbc MEMSIZE+1
f2b4: b0 e0 bcs JMM ;above HIMEM, memory error
f2b6: a5 50 lda LINNUM ;must be above program
f2b8: c5 69 cmp VARTAB
f2ba: a5 51 lda LINNUM+1
f2bc: e5 6a sbc VARTAB+1
f2be: 90 d6 bcc JMM ;not above program, error
f2c0: a5 50 lda LINNUM ;store new LOMEM value
f2c2: 85 69 sta VARTAB
f2c4: a5 51 lda LINNUM+1
f2c6: 85 6a sta VARTAB+1
f2c8: 4c 6c d6 jmp CLEARC ;LOMEM clears variables and arrays

                   ********************************************************************************
                   * ONERR statement                                                              *
                   ********************************************************************************

f2cb: a9 ab ONERR lda #TOK_GOTO ;must be GOTO next
f2cd: 20 c0 de jsr SYNCHR
f2d0: a5 b8 lda TXTPTR ;save TXTPTR for HANDLERR
f2d2: 85 f4 sta TXTPSV
f2d4: a5 b9 lda TXTPTR+1
f2d6: 85 f5 sta TXTPSV+1
f2d8: 38 sec ;set sign bit of ERRFLG
f2d9: 66 d8 ror ERRFLG
f2db: a5 75 lda CURLIN ;save line # of current line
f2dd: 85 f6 sta CURLSV
f2df: a5 76 lda CURLIN+1
f2e1: 85 f7 sta CURLSV+1
f2e3: 20 a6 d9 jsr REMN ;ignore rest of line <<<why?>>>
f2e6: 4c 98 d9 jmp ADDON ;continue program

                   * Routine to handle errors if ONERR GOTO active.

f2e9: 86 de HANDLERR stx ERRNUM ;save error code number
f2eb: a6 f8 ldx REMSTK ;get stack ptr saved at NEWSTT
f2ed: 86 df stx ERRSTK ;remember it \* <<<could also have done TXS here; see ONERR correction in Applesoft manual.>>>
f2ef: a5 75 lda CURLIN ;get line # of offending statement
f2f1: 85 da sta ERRLIN ;so user can see it if desired
f2f3: a5 76 lda CURLIN+1
f2f5: 85 db sta ERRLIN+1
f2f7: a5 79 lda OLDTEXT ;also the position in the line
f2f9: 85 dc sta ERRPOS ;in case user wants to RESUME
f2fb: a5 7a lda OLDTEXT+1
f2fd: 85 dd sta ERRPOS+1
f2ff: a5 f4 lda TXTPSV ;set up TXTPTR to read target line #
f301: 85 b8 sta TXTPTR ;in "ON ERR GO TO xxxx"
f303: a5 f5 lda TXTPSV+1
f305: 85 b9 sta TXTPTR+1
f307: a5 f6 lda CURLSV ;line # of "ON ERR" statement
f309: 85 75 sta CURLIN
f30b: a5 f7 lda CURLSV+1
f30d: 85 76 sta CURLIN+1
f30f: 20 b7 00 jsr CHRGOT ;start conversion
f312: 20 3e d9 jsr GOTO ;goto specified ONERR line
f315: 4c d2 d7 jmp NEWSTT

                   ********************************************************************************
                   * RESUME statement                                                             *
                   ********************************************************************************

f318: a5 da RESUME lda ERRLIN ;restore line # and TXTPTR
f31a: 85 75 sta CURLIN ; to re-try offending line
f31c: a5 db lda ERRLIN+1
f31e: 85 76 sta CURLIN+1
f320: a5 dc lda ERRPOS
f322: 85 b8 sta TXTPTR
f324: a5 dd lda ERRPOS+1
f326: 85 b9 sta TXTPTR+1
_ <<< ONERR correction in manual is easily by CALL -3288, which is $F328 here.
_ >>>
f328: a6 df ldx ERRSTK ;retrieve stack ptr as it was
f32a: 9a txs ; before statement scanned
f32b: 4c d2 d7 jmp NEWSTT ;do statement again

f32e: 4c c9 de JSYN jmp SYNERR

                   ********************************************************************************
                   * DEL statement                                                                *
                   ********************************************************************************
                   • Clear variables

f331: b0 fb DEL bcs JSYN ;error if # not specified
f333: a6 af ldx PRGEND
f335: 86 69 stx VARTAB
f337: a6 b0 ldx PRGEND+1
f339: 86 6a stx VARTAB+1
f33b: 20 0c da jsr LINGET ;get beginning of range
f33e: 20 1a d6 jsr FNDLIN ;find this line or next
f341: a5 9b lda LOWTR ;upper portion of program will
f343: 85 60 sta DEST ;be moved down to here
f345: a5 9c lda LOWTR+1
f347: 85 61 sta DEST+1
f349: a9 2c lda #‘,’ ;must have a comma next
f34b: 20 c0 de jsr SYNCHR
f34e: 20 0c da jsr LINGET ;get end range (does nothing if end range is not specified)
f351: e6 50 inc LINNUM ;point one past it
f353: d0 02 bne LF357
f355: e6 51 inc LINNUM+1
f357: 20 1a d6 LF357 jsr FNDLIN ;find start line after specified line
f35a: a5 9b lda LOWTR ;which is beginning of portion
f35c: c5 60 cmp DEST ;to be moved down
f35e: a5 9c lda LOWTR+1 ;it must be above the target
f360: e5 61 sbc DEST+1
f362: b0 01 bcs LF365 ;it is okay
f364: 60 rts ;nothing to delete

f365: a0 00 LF365 ldy #$00 ;move upper portion down now
f367: b1 9b LF367 lda (LOWTR),y ;source...
f369: 91 60 sta (DEST),y ;...to destination
f36b: e6 9b inc LOWTR ;bump source ptr
f36d: d0 02 bne LF371
f36f: e6 9c inc LOWTR+1
f371: e6 60 LF371 inc DEST ;bump destination ptr
f373: d0 02 bne LF377
f375: e6 61 inc DEST+1
f377: a5 69 LF377 lda VARTAB ;reached end of program yet?
f379: c5 9b cmp LOWTR
f37b: a5 6a lda VARTAB+1
f37d: e5 9c sbc LOWTR+1
f37f: b0 e6 bcs LF367 ;no, keep moving
f381: a6 61 ldx DEST+1 ;store new end of program
f383: a4 60 ldy DEST ;must subtract 1 first
f385: d0 01 bne LF388
f387: ca dex
f388: 88 LF388 dey
f389: 86 6a stx VARTAB+1
f38b: 84 69 sty VARTAB
f38d: 4c f2 d4 jmp FIX_LINKS ;reset links after a delete

                   ********************************************************************************
                   * GR statement                                                                 *
                   ********************************************************************************

f390: ad 56 c0 GR lda LORES
f393: ad 53 c0 lda MIXSET
f396: 4c 40 fb jmp MON_SETGR

                   ********************************************************************************
                   * TEXT statement                                                               *
                   *                                                                              *
                   * <<< better code would be:                                                    *
                   *   LDA MIXSET                                                                 *
                   *   JMP $FB33                                                                  *
                   * >>>                                                                          *
                   ********************************************************************************

f399: ad 54 c0 TEXT lda TXTPAGE1 ;JMP $FB36 would have
f39c: 4c 39 fb jmp MON_SETTXT ; done both of these

                   ********************************************************************************
                   * STORE statement                                                              *
                   ********************************************************************************

f39f: 20 d9 f7 STORE jsr GETARYPT ;get address of array to be saved
f3a2: a0 03 ldy #$03 ;forward offset - 1 is size of
f3a4: b1 9b lda (LOWTR),y ; this array
f3a6: aa tax
f3a7: 88 dey
f3a8: b1 9b lda (LOWTR),y
f3aa: e9 01 sbc #$01
f3ac: b0 01 bcs LF3AF
f3ae: ca dex
f3af: 85 50 LF3AF sta LINNUM
f3b1: 86 51 stx LINNUM+1
f3b3: 20 cd fe jsr MON_WRITE
f3b6: 20 bc f7 jsr TAPEPNT
f3b9: 4c cd fe jmp MON_WRITE

                   ********************************************************************************
                   * RECALL statement                                                             *
                   ********************************************************************************

f3bc: 20 d9 f7 RECALL jsr GETARYPT ;find array in memory
f3bf: 20 fd fe jsr MON_READ ;read header
f3c2: a0 02 ldy #$02 ;make sure the new data fits
f3c4: b1 9b lda (LOWTR),y
f3c6: c5 50 cmp LINNUM
f3c8: c8 iny
f3c9: b1 9b lda (LOWTR),y
f3cb: e5 51 sbc LINNUM+1
f3cd: b0 03 bcs LF3D2 ;it fits
f3cf: 4c 10 d4 jmp MEMERR ;doesn't fit

f3d2: 20 bc f7 LF3D2 jsr TAPEPNT ;read the data
f3d5: 4c fd fe jmp MON_READ

                   ********************************************************************************
                   * HGR2 statement                                                               *
                   ********************************************************************************

f3d8: 2c 55 c0 HGR2 bit TXTPAGE2 ;select page 2 ($4000-5FFF)
f3db: 2c 52 c0 bit MIXCLR ;default to full screen
f3de: a9 40 lda #$40 ;set starting page for hi-res
f3e0: d0 08 bne SETHPG ;...always

                   ********************************************************************************
                   * HGR statement                                                                *
                   ********************************************************************************

f3e2: a9 20 HGR lda #$20 ;set starting page for hi-res
f3e4: 2c 54 c0 bit TXTPAGE1 ;select page 1 ($2000-3FFF)
f3e7: 2c 53 c0 bit MIXSET ;default to mixed screen
f3ea: 85 e6 SETHPG sta HGR_PAGE ;base page of hi-res buffer
f3ec: ad 57 c0 lda HIRES ;turn on hi-res
f3ef: ad 50 c0 lda TXTCLR ;turn on graphics
_ Clear screen.
f3f2: a9 00 lda #$00 ;set for black background
f3f4: 85 1c sta HGR_BITS
_ Fill screen with HGR_BITS.
f3f6: a5 e6 BKGND lda HGR_PAGE ;put buffer address in HGR_SHAPE
f3f8: 85 1b sta HGR_SHAPE+1
f3fa: a0 00 ldy #$00
f3fc: 84 1a sty HGR_SHAPE
f3fe: a5 1c LF3FE lda HGR_BITS ;color byte
f400: 91 1a sta (HGR_SHAPE),y ;clear hi-res to HGR_BITS
f402: 20 7e f4 jsr COLOR_SHIFT ;correct for color shift
f405: c8 iny ;(slows clear by factor of 2)
f406: d0 f6 bne LF3FE
f408: e6 1b inc HGR_SHAPE+1
f40a: a5 1b lda HGR_SHAPE+1
f40c: 29 1f and #$1f ;done? ($40 or $60)
f40e: d0 ee bne LF3FE ;no
f410: 60 rts ;yes, return

                   * Set the hi-res cursor position.
                   *
                   *   (Y,X) = horizontal coordinate (0-279)
                   *   A-reg = vertical coordinate   (0-191)

f411: 85 e2 HPOSN sta HGR_Y ;save Y- and X-positions
f413: 86 e0 stx HGR_X
f415: 84 e1 sty HGR_X+1
f417: 48 pha ;Y-pos also on stack
f418: 29 c0 and #$c0 ;calculate base address for Y-pos
f41a: 85 26 sta HBASL ;for Y=ABCDEFGH
f41c: 4a lsr A ;HBASL=ABAB0000
f41d: 4a lsr A
f41e: 05 26 ora HBASL
f420: 85 26 sta HBASL
f422: 68 pla ; A HBASH HBASL
f423: 85 27 sta HBASH ;?-ABCDEFGH ABCDEFGH ABAB0000
f425: 0a asl A ;A-BCDEFGH0 ABCDEFGH ABAB0000
f426: 0a asl A ;B-CDEFGH00 ABCDEFGH ABAB0000
f427: 0a asl A ;C-DEFGH000 ABCDEFGH ABAB0000
f428: 26 27 rol HBASH ;A-DEFGH000 BCDEFGHC ABAB0000
f42a: 0a asl A ;D-EFGH0000 BCDEFGHC ABAB0000
f42b: 26 27 rol HBASH ;B-EFGH0000 CDEFGHCD ABAB0000
f42d: 0a asl A ;E-FGH00000 CDEFGHCD ABAB0000
f42e: 66 26 ror HBASL ;0-FGH00000 CDEFGHCD EABAB000
f430: a5 27 lda HBASH ;0-CDEFGHCD CDEFGHCD EABAB000
f432: 29 1f and #$1f ;0-000FGHCD CDEFGHCD EABAB000
f434: 05 e6 ora HGR_PAGE ;0-PPPFGHCD CDEFGHCD EABAB000
f436: 85 27 sta HBASH ;0-PPPFGHCD PPPFGHCD EABAB000
f438: 8a txa ;divide X-pos by 7 for index from base
f439: c0 00 cpy #$00 ;is X-pos < 256?
f43b: f0 05 beq LF442 ;yes
_ no: 256/7 = 36 rem 4
_ carry=1, so ADC #4 is too large; however, ADC #4 clears carry which makes SBC \* #7 only -6, balancing it out.
f43d: a0 23 ldy #35
f43f: 69 04 adc #$04 ;following INY makes Y=36
f441: c8 LF441 iny
f442: e9 07 LF442 sbc #$07
f444: b0 fb bcs LF441
f446: 84 e5 sty HGR_HORIZ ;horizontal index
f448: aa tax ;use remainder-7 to look up the
f449: bd b9 f4 lda MSKTBL-249,x ; bit mask (should be MSKTBL-$100+7,X)
f44c: 85 30 sta HMASK
f44e: 98 tya ;quotient gives byte index
f44f: 4a lsr A ;odd or even column?
f450: a5 e4 lda HGR_COLOR ;if on odd byte (carry set)
f452: 85 1c sta HGR_BITS ; then rotate bits
f454: b0 28 bcs COLOR_SHIFT ;odd column
f456: 60 rts ;even column

                   * Plot a dot
                   *
                   *   (Y,X) = horizontal position
                   *   A-reg = vertical position

f457: 20 11 f4 HPLOT0 jsr HPOSN
f45a: a5 1c lda HGR_BITS ;calculate bit posn in GBAS,
f45c: 51 26 eor (HBASL),y ; HGR_HORIZ, and HMASK from
f45e: 25 30 and HMASK ; Y-coord in A-reg,
f460: 51 26 eor (HBASL),y ; X-coord in X,Y regs.
f462: 91 26 sta (HBASL),y ;for any 1-bits, substitute
f464: 60 rts ; corresponding bit of HGR_BITS

                   * Move left or right one pixel.
                   *
                   * If status is +, move right; if -, move left
                   * If already at left or right edge, wrap around
                   *
                   * Remember bits in hi-res byte are backwards order:
                   *   byte N  byte N+1
                   * S7654321  SEDCBA98

f465: 10 23 MOVE_LEFT_OR_RIGHT bpl MOVE_RIGHT ;+ move right, - move left
f467: a5 30 lda HMASK ;move left one pixel
f469: 4a lsr A ;shift mask right, moves dot left
f46a: b0 05 bcs LR_2 ;...dot moved to next byte
f46c: 49 c0 eor #$c0 ;move sign bit back where it was
f46e: 85 30 LR_1 sta HMASK ;new mask value
f470: 60 rts

f471: 88 LR_2 dey ;moved to next byte, so decr index
f472: 10 02 bpl LR_3 ;still not past edge
f474: a0 27 ldy #39 ;off left edge, so wrap around screen
f476: a9 c0 LR_3 lda #$c0              ;new HMASK, rightmost bit on screen
f478: 85 30        LR_4            sta     HMASK             ;new mask and index
f47a: 84 e5                        sty     HGR_HORIZ
f47c: a5 1c                        lda     HGR_BITS          ;also need to rotate color
                   *
f47e: 0a           COLOR_SHIFT     asl     A                 ;rotate low-order 7 bits
f47f: c9 c0                        cmp     #$c0 ; of HGR_BITS one bit posn
f481: 10 06 bpl LF489
f483: a5 1c lda HGR_BITS
f485: 49 7f eor #$7f
f487: 85 1c sta HGR_BITS
f489: 60 LF489 rts

                   * Move right one pixel.
                   *
                   * If already at right edge, wrap around.

f48a: a5 30 MOVE_RIGHT lda HMASK
f48c: 0a asl A ;shifting byte left moves pixel right
f48d: 49 80 eor #$80
_ Original: C0 A0 90 88 84 82 81
_ Shifted: 80 40 20 10 08 02 01 \* EOR #$80: 00 C0 A0 90 88 84 82
f48f: 30 dd bmi LR_1 ;finished
f491: a9 81 lda #$81 ;new mask value
f493: c8 iny ;move to next byte right
f494: c0 28 cpy #40 ;unless that is too far
f496: 90 e0 bcc LR_4 ;not too far
f498: a0 00 ldy #$00 ;too far, so wrap around
f49a: b0 dc bcs LR_4 ;...always

                   * "XDRAW" one bit

f49c: 18 LRUDX1 clc ;C=0 means no 90 degree rotation
f49d: a5 d1 LRUDX2 lda HGR_DX+1 ;C=1 means rotate 90 degrees
f49f: 29 04 and #$04 ;if bit2=0 then don't plot
f4a1: f0 25 beq LRUD4 ;yes, do not plot
f4a3: a9 7f lda #$7f ;no, look at what is already there
f4a5: 25 30 and HMASK
f4a7: 31 26 and (HBASL),y ;screen bit = 1?
f4a9: d0 19 bne LRUD3 ;yes, go clear it
f4ab: e6 ea inc HGR_COLLISIONS ;no, count the collision
f4ad: a9 7f lda #$7f ;and turn the bit on
f4af: 25 30 and HMASK
f4b1: 10 11 bpl LRUD3 ;...always

                   * "DRAW" one bit

f4b3: 18 LRUD1 clc ;C=0 means no 90 degree rotation
f4b4: a5 d1 LRUD2 lda HGR_DX+1 ;C=1 means rotate
f4b6: 29 04 and #$04 ;if bit2=0 then do not plot
f4b8: f0 0e beq LRUD4 ;do not plot
f4ba: b1 26 lda (HBASL),y
f4bc: 45 1c eor HGR_BITS ;1's where any bits not in color
f4be: 25 30 and HMASK ;look at just this bit position
f4c0: d0 02 bne LRUD3 ;the bit was zero, so plot it
f4c2: e6 ea inc HGR_COLLISIONS ;bit is already 1; count collsn
_ Toggle bit on screen with A-reg.
f4c4: 51 26 LRUD3 eor (HBASL),y
f4c6: 91 26 sta (HBASL),y
_ Determine where next point will be, and move there. \*
_ C=0 if no 90 degree rotation
_ C=1 rotates 90 degrees
f4c8: a5 d1 LRUD4 lda HGR_DX+1 ;calculate the direction to move
f4ca: 65 d3 adc HGR_QUAD
f4cc: 29 03 CON_03 and #$03 ;wrap around the circle
_ 00 - up
_ 01 - down
_ 10 - right
_ 11 - left
f4ce: c9 02 cmp #$02 ;C=0 if 0 or 1, C=1 if 2 or 3
f4d0: 6a ror A ;put C into sign, odd/even into C
f4d1: b0 92 bcs MOVE_LEFT_OR_RIGHT
_
f4d3: 30 30 MOVE_UP_OR_DOWN bmi MOVE_DOWN ;sign for up/down select
_ Move up one pixel \*
_ If already at top, go to bottom.
_
_ Remember: Y-coord HBASH HBASL
_ ABCDEFGH PPPFGHCD EABAB000
f4d5: 18 clc ;move up
f4d6: a5 27 lda HBASH ;calc base address of prev line
f4d8: 2c b9 f5 bit CON_1C ;look at bits 000FGH00 in HBASH
f4db: d0 22 bne LF4FF ;simple , just FGH=FGH-1; GBASH=PPP000CD, GBASL=EABAB000
f4dd: 06 26 asl HBASL ;what is "E"?
f4df: b0 1a bcs LF4FB ;E=1, then EFGH=EFGH-1
f4e1: 2c cd f4 bit CON_03+1 ;look at 000000CD in HBASH
f4e4: f0 05 beq LF4EB ;Y-pos is AB000000 form
f4e6: 69 1f adc #$1f ;CD <> 0, so CDEFGH=CDEFGH-1
f4e8: 38 sec
f4e9: b0 12 bcs LF4FD ;...always

f4eb: 69 23 LF4EB adc #$23              ;enough to make HBASH=PPP11111 later
f4ed: 48                           pha                       ;save for later
f4ee: a5 26                        lda     HBASL             ;HBASL is now ABAB0000 (AB=00,01,10)
                   *    0000+1011=1011 and carry clear
                   * or 0101+1011=0000 and carry set
                   * or 1010+1011=0101 and carry set
f4f0: 69 b0                        adc     #$b0
f4f2: b0 02 bcs LF4F6 ;no wrap-around needed
f4f4: 69 f0 adc #$f0 ;change 1011 to 1010 (wrap-around)
f4f6: 85 26 LF4F6 sta HBASL ;form is now still ABAB0000
f4f8: 68 pla ;partially modified HBASH
f4f9: b0 02 bcs LF4FD ;...always

f4fb: 69 1f LF4FB adc #$1f
f4fd: 66 26        LF4FD           ror     HBASL             ;shift in E, to get EABAB000 form
f4ff: 69 fc        LF4FF           adc     #$fc ;finish HBASH mods
f501: 85 27 UD_1 sta HBASH
f503: 60 rts

f504: 18 .dd1 $18 ;<<< never used >>>

                   * Move down one pixel
                   *
                   * If already at bottom, go to top.
                   *
                   * Remember:  Y-coord   HBASH     HBASL
                   *           ABCDEFGH  PPPFGHCD  EABAB000

f505: a5 27 MOVE_DOWN lda HBASH ;try it first, by FGH=FGH+1
f507: 69 04 CON_04 adc #$04              ;HBASH = PPPFGHCD
f509: 2c b9 f5                     bit     CON_1C            ;is FGH field now zero?
f50c: d0 f3                        bne     UD_1              ;no so we are finished
f50e: 06 26                        asl     HBASL             ;yes, ripple the carry as high as necessary; look at "E" bit
f510: 90 18                        bcc     LF52A             ;now zero; make it 1 and leave
f512: 69 e0                        adc     #$e0 ;carry = 1, so adds $E1
f514: 18                           clc                       ;is "CD" not zero?
f515: 2c 08 f5                     bit     CON_04+1          ;tests bit 2 for carry out of "CD"
f518: f0 12                        beq     LF52C             ;no carry, finished
                   * increment "AB" then
                   * 0000 --> 0101
                   * 0101 --> 1010
                   * 1010 --> wrap around to line 0
f51a: a5 26                        lda     HBASL             ;0000  0101  1010
f51c: 69 50                        adc     #$50              ;0101  1010  1111
f51e: 49 f0                        eor     #$f0 ;1010 0101 0000
f520: f0 02 beq LF524
f522: 49 f0 eor #$f0              ;0101  1010
f524: 85 26        LF524           sta     HBASL             ;new ABAB0000
f526: a5 e6                        lda     HGR_PAGE          ;wrap around to line zero of group
f528: 90 02                        bcc     LF52C             ;...always
f52a: 69 e0        LF52A           adc     #$e0
f52c: 66 26 LF52C ror HBASL
f52e: 90 d1 bcc UD_1 ;...always

                   * HLINRL
                   * (never called by Applesoft)
                   *
                   * Enter with: (A,X) = DX from current point
                   *             Y-reg = DY from current point

f530: 48 pha ;save A-reg
f531: a9 00 lda #$00              ;clear current point so HGLIN will
f533: 85 e0                        sta     HGR_X             ; act relatively
f535: 85 e1                        sta     HGR_X+1
f537: 85 e2                        sta     HGR_Y
f539: 68                           pla                       ;restore A-reg
                   * Draw line from last plotted point to (A,X),Y
                   *
                   * Enter with: (A,X) = X of target point
                   *             Y-reg = Y of target point
f53a: 48           HGLIN           pha                       ;compute DX = X - X0
f53b: 38                           sec
f53c: e5 e0                        sbc     HGR_X
f53e: 48                           pha
f53f: 8a                           txa
f540: e5 e1                        sbc     HGR_X+1
f542: 85 d3                        sta     HGR_QUAD          ;save DX sign (+ = right, - = left)
f544: b0 0a                        bcs     LF550             ;now find abs(DX)
f546: 68                           pla                       ;forms 2's complement
f547: 49 ff                        eor     #$ff
f549: 69 01 adc #$01
f54b: 48                           pha
f54c: a9 00                        lda     #$00
f54e: e5 d3                        sbc     HGR_QUAD
f550: 85 d1        LF550           sta     HGR_DX+1
f552: 85 d5                        sta     HGR_E+1           ;init HGR_E to abs(X-X0)
f554: 68                           pla
f555: 85 d0                        sta     HGR_DX
f557: 85 d4                        sta     HGR_E
f559: 68                           pla
f55a: 85 e0                        sta     HGR_X             ;target X point
f55c: 86 e1                        stx     HGR_X+1
f55e: 98                           tya                       ;target Y point
f55f: 18                           clc                       ;compute DY = Y - HGR_Y
f560: e5 e2                        sbc     HGR_Y             ; and save -abs(Y - HGR_Y) - 1 in HGR_DY
f562: 90 04                        bcc     LF568             ;(so + means up, - means down)
f564: 49 ff                        eor     #$ff ;2's complement of DY
f566: 69 fe adc #$fe
f568: 85 d2        LF568           sta     HGR_DY
f56a: 84 e2                        sty     HGR_Y             ;target Y point
f56c: 66 d3                        ror     HGR_QUAD          ;shift Y-direction into quadrant
f56e: 38                           sec                       ;count = DX - (-DY) = # of dots needed
f56f: e5 d0                        sbc     HGR_DX
f571: aa                           tax                       ;countl is in X-reg
f572: a9 ff                        lda     #$ff
f574: e5 d1 sbc HGR_DX+1
f576: 85 1d sta HGR_COUNT
f578: a4 e5 ldy HGR_HORIZ ;horizontal index
f57a: b0 05 bcs MOVEX2 ;...always

                   * Move left or right one pixel.  A-reg bit 6 has direction.

f57c: 0a MOVEX asl A ;put bit 6 into sign position
f57d: 20 65 f4 jsr MOVE_LEFT_OR_RIGHT
f580: 38 sec \* Draw line now.
f581: a5 d4 MOVEX2 lda HGR_E ;carry is set
f583: 65 d2 adc HGR_DY ;E = E - deltaY
f585: 85 d4 sta HGR_E ;note: DY is (-delta Y)-1
f587: a5 d5 lda HGR_E+1 ;carry clr if HGR_E goes negative
f589: e9 00 sbc #$00
f58b: 85 d5 LF58B sta HGR_E+1
f58d: b1 26 lda (HBASL),y
f58f: 45 1c eor HGR_BITS ;plot a dot
f591: 25 30 and HMASK
f593: 51 26 eor (HBASL),y
f595: 91 26 sta (HBASL),y
f597: e8 inx ;finished all the dots?
f598: d0 04 bne LF59E ;no
f59a: e6 1d inc HGR_COUNT ;test rest of count
f59c: f0 62 beq RTS_22 ;yes, finished
f59e: a5 d3 LF59E lda HGR_QUAD ;test direction
f5a0: b0 da bcs MOVEX ;next move is in the X direction
f5a2: 20 d3 f4 jsr MOVE_UP_OR_DOWN ;if clr, neg, move
f5a5: 18 clc ;E = E + DX
f5a6: a5 d4 lda HGR_E
f5a8: 65 d0 adc HGR_DX
f5aa: 85 d4 sta HGR_E
f5ac: a5 d5 lda HGR_E+1
f5ae: 65 d1 adc HGR_DX+1
f5b0: 50 d9 bvc LF58B ;...always

f5b2: 81 82 84 88+ MSKTBL .bulk $81,$82,$84,$88,$90,$a0,$c0
f5b9: 1c           CON_1C          .dd1    $1c               ;mask for "FGH" bits
                   * Table of COS(90*x/16 degrees)*$100 - 1, with one-byte precision, X=0 to 16
f5ba: ff fe fa f4+ COSINE_TABLE    .bulk   $ff,$fe,$fa,$f4,$ec,$e1,$d4,$c5,$b4,$a1,$8d,$78,$61,$49,$31,$18 + $ff

                   * HFIND - calculates current position of hi-res cursor
                   * (not called by any Applesoft routine)
                   *
                   * Calculate Y-coord from HBASH,L
                   *       and X-coord from HORIZ and HMASK

f5cb: a5 26 lda HBASL ;HBASL = EABAB000
f5cd: 0a asl A ;E into carry
f5ce: a5 27 lda HBASH ;HBASH = PPPFGHCD
f5d0: 29 03 and #$03 ;000000CD
f5d2: 2a rol A ;00000CDE
f5d3: 05 26 ora HBASL ;EABABCDE
f5d5: 0a asl A ;ABABCDE0
f5d6: 0a asl A ;BABCDE00
f5d7: 0a asl A ;ABCDE000
f5d8: 85 e2 sta HGR_Y ;all but FGH
f5da: a5 27 lda HBASH ;PPPFGHCD
f5dc: 4a lsr A ;0PPPFGHC
f5dd: 4a lsr A ;00PPPFGH
f5de: 29 07 and #$07 ;00000FGH
f5e0: 05 e2 ora HGR_Y ;ABCDEFGH
f5e2: 85 e2 sta HGR_Y ;that takes care of Y-coordinate
f5e4: a5 e5 lda HGR_HORIZ ;X = 7*HORIZ + bit pos in HMASK
f5e6: 0a asl A ;multiply by 7
f5e7: 65 e5 adc HGR_HORIZ ;3* so far
f5e9: 0a asl A ;6*
f5ea: aa tax ;since 7* might not fit in 1 byte,
f5eb: ca dex ; wait till later for last add
f5ec: a5 30 lda HMASK ;now find bit position in HMASK
f5ee: 29 7f and #$7f ;only look at low seven
f5f0: e8 LF5F0 inx ;count a shift
f5f1: 4a lsr A
f5f2: d0 fc bne LF5F0 ;still in there
f5f4: 85 e1 sta HGR_X+1 ;zero to hi byte
f5f6: 8a txa ;6*HORIZ + log2(HMASK)
f5f7: 18 clc ;add HORIZ one more time
f5f8: 65 e5 adc HGR_HORIZ ;7*HORIZ + log2(HMASK)
f5fa: 90 02 bcc LF5FE ;upper byte = 0
f5fc: e6 e1 inc HGR_X+1 ;upper byte = 1
f5fe: 85 e0 LF5FE sta HGR_X ;store lower byte
f600: 60 RTS_22 rts

                   * DRAW0
                   * (not called by Applesoft)

f601: 86 1a stx HGR_SHAPE ;save shape address
f603: 84 1b sty HGR_SHAPE+1
_ Draw a shape
_
_ (Y,X) = shape starting address
_ A-reg = rotation ($00-3F)
f605: aa DRAW1 tax ;save rotation ($00-3F)
f606: 4a lsr A ;divide rotation by 16 to get
f607: 4a lsr A ; quadrant (0=up, 1=rt, 2=dwn, 3=lft)
f608: 4a lsr A
f609: 4a lsr A
f60a: 85 d3 sta HGR_QUAD
f60c: 8a txa ;use low 4 bits of rotation to index
f60d: 29 0f and #$0f ; the trig table
f60f: aa tax
f610: bc ba f5 ldy COSINE_TABLE,x ;save cosine in HGR_DX
f613: 84 d0 sty HGR_DX
f615: 49 0f eor #$0f ;and sine in DY
f617: aa tax
f618: bc bb f5 ldy COSINE_TABLE+1,x
f61b: c8 iny
f61c: 84 d2 sty HGR_DY
f61e: a4 e5 ldy HGR_HORIZ ;index from HBASL,H to byte we're in
f620: a2 00 ldx #$00
f622: 86 ea stx HGR_COLLISIONS ;clear collision counter
f624: a1 1a lda (HGR_SHAPE,x) ;get first byte of shape defn
f626: 85 d1 LF626 sta HGR_DX+1 ;keep shape byte in HGR_DX+1
f628: a2 80 ldx #$80 ;initial values for fractional vectors
f62a: 86 d4 stx HGR_E ;.5 in cosine component
f62c: 86 d5 stx HGR_E+1 ;.5 in sine component
f62e: a6 e7 ldx HGR_SCALE ;scale factor
f630: a5 d4 LF630 lda HGR_E ;add cosine value to X-value
f632: 38 sec ;if >= 1, then draw
f633: 65 d0 adc HGR_DX
f635: 85 d4 sta HGR_E ;only save fractional part
f637: 90 04 bcc LF63D ;no integral part
f639: 20 b3 f4 jsr LRUD1 ;time to plot cosine component
f63c: 18 clc
f63d: a5 d5 LF63D lda HGR_E+1 ;add sine value to Y-value
f63f: 65 d2 adc HGR_DY ;if >= 1, then draw
f641: 85 d5 sta HGR_E+1 ;only save fractional part
f643: 90 03 bcc LF648 ;no integral part
f645: 20 b4 f4 jsr LRUD2 ;time to plot sine component
f648: ca LF648 dex ;loop on scale factor
f649: d0 e5 bne LF630 ;still on same shape item
f64b: a5 d1 lda HGR_DX+1 ;get next shape item
f64d: 4a lsr A ;next 3-bit vector
f64e: 4a lsr A
f64f: 4a lsr A
f650: d0 d4 bne LF626 ;more in this shape byte
f652: e6 1a inc HGR_SHAPE ;go to next shape byte
f654: d0 02 bne LF658
f656: e6 1b inc HGR_SHAPE+1
f658: a1 1a LF658 lda (HGR_SHAPE,x) ;next byte of shape definition
f65a: d0 ca bne LF626 ;process if not zero
f65c: 60 rts ;finished

                   * XDRAW0
                   * (not called by Applesoft)

f65d: 86 1a stx HGR_SHAPE ;save shape address
f65f: 84 1b sty HGR_SHAPE+1
_ XDRAW a shape (same as DRAW, except toggles screen)
_
_ (Y,X) = shape starting address
_ A-reg = rotation ($00-3F)
f661: aa XDRAW1 tax ;save rotation ($00-3F)
f662: 4a lsr A ;divide rotation by 16 to get
f663: 4a lsr A ; quadrant (0=up, 1=rt, 2=dwn, 3=lft)
f664: 4a lsr A
f665: 4a lsr A
f666: 85 d3 sta HGR_QUAD
f668: 8a txa ;use lwo 4 bits of rotation to index
f669: 29 0f and #$0f ; the trig table
f66b: aa tax
f66c: bc ba f5 ldy COSINE_TABLE,x ;save cosine in HGR_DX
f66f: 84 d0 sty HGR_DX
f671: 49 0f eor #$0f ;and sine in DY
f673: aa tax
f674: bc bb f5 ldy COSINE_TABLE+1,x
f677: c8 iny
f678: 84 d2 sty HGR_DY
f67a: a4 e5 ldy HGR_HORIZ ;index from HBASL,H to byte we're in
f67c: a2 00 ldx #$00
f67e: 86 ea stx HGR_COLLISIONS ;clear collision counter
f680: a1 1a lda (HGR_SHAPE,x) ;get first byte of shape defn
f682: 85 d1 LF682 sta HGR_DX+1 ;keep shape byte in HGR_DX+1
f684: a2 80 ldx #$80 ;initial values for fractional vectors
f686: 86 d4 stx HGR_E ;.5 in cosine component
f688: 86 d5 stx HGR_E+1 ;.5 in sine component
f68a: a6 e7 ldx HGR_SCALE ;scale factor
f68c: a5 d4 LF68C lda HGR_E ;add cosine value to X-value
f68e: 38 sec ;if >= 1, then draw
f68f: 65 d0 adc HGR_DX
f691: 85 d4 sta HGR_E ;only save fractional part
f693: 90 04 bcc LF699 ;no integral part
f695: 20 9c f4 jsr LRUDX1 ;time to plot cosine component
f698: 18 clc
f699: a5 d5 LF699 lda HGR_E+1 ;add sine value to Y-value
f69b: 65 d2 adc HGR_DY ;if >= 1, then draw
f69d: 85 d5 sta HGR_E+1 ;only save fractional part
f69f: 90 03 bcc LF6A4 ;no integral part
f6a1: 20 9d f4 jsr LRUDX2 ;time to plot sine component
f6a4: ca LF6A4 dex ;loop on scale factor
f6a5: d0 e5 bne LF68C ;still on same shape item
f6a7: a5 d1 lda HGR_DX+1 ;get next shape item
f6a9: 4a lsr A ;next 3-bit vector
f6aa: 4a lsr A
f6ab: 4a lsr A
f6ac: d0 d4 bne LF682 ;more in this shape byte
f6ae: e6 1a inc HGR_SHAPE ;go to next shape byte
f6b0: d0 02 bne LF6B4
f6b2: e6 1b inc HGR_SHAPE+1
f6b4: a1 1a LF6B4 lda (HGR_SHAPE,x) ;next byte of shape definition
f6b6: d0 ca bne LF682 ;process if not zero
f6b8: 60 rts ;finished

                   * Get hi-res plotting coordinates (0-279,0-191) from TXTPTR.  Leave registers
                   * set up for HPOSN:
                   *
                   *   (Y,X) = X-coord
                   *   A-reg = Y-coord

f6b9: 20 67 dd HFNS jsr FRMNUM ;evaluate expression, must be numeric
f6bc: 20 52 e7 jsr GETADR ;convert to 2-byte integer in LINNUM
f6bf: a4 51 ldy LINNUM+1 ;get horiz coord in X,Y
f6c1: a6 50 ldx LINNUM
f6c3: c0 01 cpy #$01 ;(should be #>280) make sure it is < 280
f6c5: 90 06 bcc LF6CD ;in range
f6c7: d0 1d bne GGERR
f6c9: e0 18 cpx #24 ;(should be #<280)
f6cb: b0 19 bcs GGERR
f6cd: 8a LF6CD txa ;save horiz coord on stack
f6ce: 48 pha
f6cf: 98 tya
f6d0: 48 pha
f6d1: a9 2c lda #‘,’ ;require a comma
f6d3: 20 c0 de jsr SYNCHR
f6d6: 20 f8 e6 jsr GETBYT ;eval exp to single byte in X-reg
f6d9: e0 c0 cpx #192 ;check for range
f6db: b0 09 bcs GGERR ;too big
f6dd: 86 9d stx FAC ;save Y-coord
f6df: 68 pla ;retrieve horizontal coordinate
f6e0: a8 tay
f6e1: 68 pla
f6e2: aa tax
f6e3: a5 9d lda FAC ;and vertical coordinate
f6e5: 60 rts

f6e6: 4c 06 f2 GGERR jmp GOERR ;illegal quantity error

                   ********************************************************************************
                   * HCOLOR= statement                                                            *
                   ********************************************************************************

f6e9: 20 f8 e6 HCOLOR jsr GETBYT ;eval exp to single byte in X
f6ec: e0 08 cpx #8 ;value must be 0-7
f6ee: b0 f6 bcs GGERR ;too big
f6f0: bd f6 f6 lda COLORTBL,x ;get color pattern
f6f3: 85 e4 sta HGR_COLOR
f6f5: 60 RTS_23 rts

f6f6: 00 2a 55 7f+ COLORTBL .bulk $00,$2a,$55,$7f,$80,$aa,$d5,$ff

                   ********************************************************************************
                   * HPLOT statement                                                              *
                   *                                                                              *
                   *   HPLOT X,Y                                                                  *
                   *   HPLOT TO X,Y                                                               *
                   *   HPLOT X1,Y1 to X2,Y2                                                       *
                   ********************************************************************************
                   • Clear variables
                   DSCTMP          .var    $9d    {addr/1}   ;Overlaps FAC

f6fe: c9 c1 HPLOT cmp #TOK_TO ;HPLOT TO form?
f700: f0 0d beq LF70F ;yes, start from current location
f702: 20 b9 f6 jsr HFNS ;no, get starting point of line
f705: 20 57 f4 jsr HPLOT0 ;plot the point, and set up for drawing a line from that point
f708: 20 b7 00 LF708 jsr CHRGOT ;character at end of expression
f70b: c9 c1 cmp #TOK_TO ;is a line specified?
f70d: d0 e6 bne RTS_23 ;no, exit
f70f: 20 c0 de LF70F jsr SYNCHR ;yes, adv. TXTPTR (why not CHRGET)
f712: 20 b9 f6 jsr HFNS ;get coordinates of line end
f715: 84 9d sty DSCTMP ;set up for line
f717: a8 tay
f718: 8a txa
f719: a6 9d ldx DSCTMP
f71b: 20 3a f5 jsr HGLIN ;plot line
f71e: 4c 08 f7 jmp LF708 ;loop till no more "TO" phrases

                   ********************************************************************************
                   * ROT= statement                                                               *
                   ********************************************************************************

f721: 20 f8 e6 ROT jsr GETBYT ;eval exp to a byte in X-reg
f724: 86 f9 stx HGR_ROTATION
f726: 60 rts

                   ********************************************************************************
                   * SCALE= statement                                                             *
                   ********************************************************************************

f727: 20 f8 e6 SCALE jsr GETBYT ;eval exp to a byte in X-reg
f72a: 86 e7 stx HGR_SCALE
f72c: 60 rts

                   * Set up for DRAW and XDRAW.

f72d: 20 f8 e6 DRWPNT jsr GETBYT ;get shape number in X-reg
f730: a5 e8 lda HGR_SHAPE_PTR ;search for that shape
f732: 85 1a sta HGR_SHAPE ;set up ptr to beginning of table
f734: a5 e9 lda HGR_SHAPE_PTR+1
f736: 85 1b sta HGR_SHAPE+1
f738: 8a txa
f739: a2 00 ldx #$00
f73b: c1 1a cmp (HGR_SHAPE,x) ;compare to # of shapes in table
f73d: f0 02 beq LF741 ;last shape in table
f73f: b0 a5 bcs GGERR ;shape # too large
f741: 0a LF741 asl A ;double shape# to make an index
f742: 90 03 bcc LF747 ;add 256 if shape # > 127
f744: e6 1b inc HGR_SHAPE+1
f746: 18 clc
f747: a8 LF747 tay ;use index to look up offset for shape
f748: b1 1a lda (HGR_SHAPE),y ; in offset table
f74a: 65 1a adc HGR_SHAPE
f74c: aa tax
f74d: c8 iny
f74e: b1 1a lda (HGR_SHAPE),y
f750: 65 e9 adc HGR_SHAPE_PTR+1
f752: 85 1b sta HGR_SHAPE+1 ;save address of shape
f754: 86 1a stx HGR_SHAPE
f756: 20 b7 00 jsr CHRGOT ;is there any "AT" phrase?
f759: c9 c5 cmp #TOK_AT
f75b: d0 09 bne LF766 ;no, draw right where we are
f75d: 20 c0 de jsr SYNCHR ;scan over "AT"
f760: 20 b9 f6 jsr HFNS ;get X- and Y-coords to start drawing it
f763: 20 11 f4 jsr HPOSN ;set up cursor there
f766: a5 f9 LF766 lda HGR_ROTATION ;rotation value
f768: 60 rts

                   ********************************************************************************
                   * DRAW statement                                                               *
                   ********************************************************************************

f769: 20 2d f7 DRAW jsr DRWPNT
f76c: 4c 05 f6 jmp DRAW1

                   ********************************************************************************
                   * XDRAW statement                                                              *
                   ********************************************************************************

f76f: 20 2d f7 XDRAW jsr DRWPNT
f772: 4c 61 f6 jmp XDRAW1

                   ********************************************************************************
                   * SHLOAD statement                                                             *
                   *                                                                              *
                   * Reads a shape table from cassette tape to a position just below HIMEM.       *
                   * HIMEM is then moved to just below the table.                                 *
                   ********************************************************************************

f775: a9 00 SHLOAD lda #>LINNUM ;set up to read two bytes
f777: 85 3d sta MON_A1H ; into LINNUM,LINNUM+1
f779: 85 3f sta MON_A2H
f77b: a0 50 ldy #LINNUM
f77d: 84 3c sty MON_A1L
f77f: c8 iny ;LINNUM+1
f780: 84 3e sty MON_A2L
f782: 20 fd fe jsr MON_READ ;read tape
f785: 18 clc ;setup to read LINNUM bytes
f786: a5 73 lda MEMSIZE ;ending at HIMEM-1
f788: aa tax
f789: ca dex ;forming HIMEM-1
f78a: 86 3e stx MON_A2L
f78c: e5 50 sbc LINNUM ;forming HIMEM-LINNUM
f78e: 48 pha
f78f: a5 74 lda MEMSIZE+1
f791: a8 tay
f792: e8 inx ;see if HIMEM low byte was zero
f793: d0 01 bne LF796 ;no
f795: 88 dey ;yes, have to decrement high byte
f796: 84 3f LF796 sty MON_A2H
f798: e5 51 sbc LINNUM+1
f79a: c5 6e cmp STREND+1 ;running into variables?
f79c: 90 02 bcc LF7A0 ;yes, out of memory
f79e: d0 03 bne LF7A3 ;no, still room
f7a0: 4c 10 d4 LF7A0 jmp MEMERR ;mem full err

f7a3: 85 74 LF7A3 sta MEMSIZE+1
f7a5: 85 70 sta FRETOP+1 ;clear string space
f7a7: 85 3d sta MON_A1H ;(but names are still in VARTBL!)
f7a9: 85 e9 sta HGR_SHAPE_PTR+1
f7ab: 68 pla
f7ac: 85 e8 sta HGR_SHAPE_PTR
f7ae: 85 73 sta MEMSIZE
f7b0: 85 6f sta FRETOP
f7b2: 85 3c sta MON_A1L
f7b4: 20 fa fc jsr MON_RD2BIT ;read to tape transitions
f7b7: a9 03 lda #$03 ;short delay for intermediate header
f7b9: 4c 02 ff jmp MON_READ2 ;read shapes

                   * Called from STORE and RECALL.

f7bc: 18 TAPEPNT clc
f7bd: a5 9b lda LOWTR
f7bf: 65 50 adc LINNUM
f7c1: 85 3e sta MON_A2L
f7c3: a5 9c lda LOWTR+1
f7c5: 65 51 adc LINNUM+1
f7c7: 85 3f sta MON_A2H
f7c9: a0 04 ldy #$04
f7cb: b1 9b lda (LOWTR),y
f7cd: 20 ef e0 jsr GETARY2
f7d0: a5 94 lda HIGHDS
f7d2: 85 3c sta MON_A1L
f7d4: a5 95 lda HIGHDS+1
f7d6: 85 3d sta MON_A1H
f7d8: 60 rts

                   * Called from STORE and RECALL.

f7d9: a9 40 GETARYPT lda #$40
f7db: 85 14 sta SUBFLG
f7dd: 20 e3 df jsr PTRGET
f7e0: a9 00 lda #$00
f7e2: 85 14 sta SUBFLG
f7e4: 4c f0 d8 jmp VARTIO

                   ********************************************************************************
                   * HTAB statement                                                               *
                   *                                                                              *
                   * Note that if WNDLEFT is not 0, HTAB can print outside the screen (e.g. in    *
                   * the program).                                                                *
                   ********************************************************************************

f7e7: 20 f8 e6 HTAB jsr GETBYT
f7ea: ca dex
f7eb: 8a txa
f7ec: c9 28 LF7EC cmp #40
f7ee: 90 0a bcc LF7FA
f7f0: e9 28 sbc #40
f7f2: 48 pha
f7f3: 20 fb da jsr CRDO
f7f6: 68 pla
f7f7: 4c ec f7 jmp LF7EC

f7fa: 85 24 LF7FA sta MON_CH
f7fc: 60 rts

f7fd: cb .dd1 ‘K’ | $80
f7fe: d2 d7                        .str    ↑“RW”             ;Richard Weiland?
                                   .adrend ↑ ~$d000
Symbol Table
Label Value
ABS $ebaf
AND $df55
ASC $e6e5
ATN $f09e
CALL $f1d5
CHRSTR $e646
CLEAR $d66a
COLD_START $f128
COLOR $f24f
CONT $d896
COS $efea
DATA $d995
DEF $e313
DEL $f331
DIM $dfd9
DRAW $f769
END $d870
EQUOP $de98
ERROR $d412
EXP $ef09
FADDT $e7c1
FDIVT $ea69
FLASH $f280
FMULTT $e982
FOR $d766
FPWRT $ee97
FRE $e2de
FSUBT $e7aa
GET $dba0
GOSUB $d921
GOTO $d93e
GR $f390
HCOLOR $f6e9
HGR $f3e2
HGR2 $f3d8
HIMEM $f286
HLIN $f232
HPLOT $f6fe
HTAB $f7e7
IF $d9c9
IN_NUMBER $f1de
INPUT $dbb2
INT $ec23
INVERSE $f277
LEFTSTR $e65a
LEN $e6d6
LET $da46
LIST $d6a5
LOAD $d8c9
LOG $e941
LOMEM $f2a6
MIDSTR $e691
NEGOP $eed0
NEW $d649
NEXT $dcf9
NORMAL $f273
NOTRACE $f26f
ONERR $f2cb
ONGOTO $d9ec
OR $df4f
PDL $dfcd
PEEK $e764
PLOT $f225
POKE $e77b
POP $d96b
POS $e2ff
PR_NUMBER $f1e5
PRINT $dad5
READ $dbe2
RECALL $f3bc
RELOPS $df65
REM $d9dc
RESTART $d43c
RESTORE $d849
RESUME $f318
RIGHTSTR $e686
RND $efae
ROT $f721
RUN $d912
SAVE $d8b0
SCALE $f727
SGN $eb90
SHLOAD $f775
SIN $eff1
SPEED $f262
SQR $ee8d
STOP $d86e
STORE $f39f
STR $e3c5
TAN $f03a
TEXT $f399
TRACE $f26d
VAL $e707
VLIN $f241
VTAB $f256
WAIT $e784
XDRAW $f76f
HTML generated by 6502bench SourceGen v1.10.0 on 2025/08/03

Expression style: Common
