# C64 Room

A Commodore 64 you can actually use, sitting on a desk in 3D. Type on your own keyboard or click the
keys of the 3D model, watch the result on the 1702 monitor, and save your programs to the 1541 drive.

Everything runs in the browser with no build step and no Commodore ROMs: the system software is a
from-scratch JavaScript re-implementation.

## What's emulated

| Part | What works |
| --- | --- |
| **BASIC V2** | Every V2 statement and function, tokenised into RAM at `$0801` like the real thing: keyword abbreviations, `FOR/NEXT`, `GOSUB`, `ON…GOTO`, `DEF FN`, `DATA/READ`, arrays, `INPUT` with `?REDO FROM START`, `GET`, `WAIT`, `TI`/`TI$`/`ST`, `CONT`, real error messages, C64 number formatting |
| **Screen editor** | Full-screen editing (move the cursor anywhere and press RETURN), 80-column logical lines, quote and insert mode, colour and reverse control codes, upper/lower case sets, key buffer at 631/198 |
| **VIC-II** | Text, multicolour text, extended background, hi-res and multicolour bitmap modes, custom character sets, smooth scroll, 38/24 modes, 8 hardware sprites (expand, multicolour, priority, collisions), raster register |
| **6510 CPU** | All documented opcodes incl. decimal mode; `SYS` runs machine code, KERNAL calls (`$FFD2`, `$FFE4`, `$FFF0`, `$AB1E`…) are trapped, user IRQ handlers at `$0314` are called every jiffy |
| **SID** | 3 voices (triangle/saw/pulse/noise, sync, ring mod), ADSR, resonant multimode filter, in an AudioWorklet |
| **CIA** | Keyboard matrix scanning, joystick ports, `PEEK(197)`/`PEEK(653)` |
| **1541 drive** | `LOAD`/`SAVE`/`VERIFY`, `LOAD"$",8` directory, `,8,1` absolute loads, wildcards, sequential files with `OPEN/PRINT#/INPUT#/GET#/CLOSE`, command channel 15 (`S:`, `R:`, `N:`, `C:`, error status). Import `.prg`, `.d64` and BASIC text; export `.prg`. Disks persist in localStorage |
| **Peripherals** | Datasette (device 1), printer (device 4, `OPEN 4,4:CMD 4`), joystick in port 2 (arrows + space or a gamepad) |

## Using it

- **Esc** = RUN/STOP, **PageUp** = RUN/STOP + RESTORE, **Alt/⌥** = C=, **Ctrl/Tab** = CTRL
- **Shift + Alt** switches character sets, **Ctrl/Alt + 1–8** set colours, **F9** toggles the flat 2D screen
- Click the 1541 to manage disks, the joystick to plug it in, the power brick to switch on/off
- The demo disk has `HELLO`, `MAZE`, `SPRITE`, `ODE TO JOY`, `SOUND FX`, `SNAKE`, `GUESS`, `CHARSET`, `ML DEMO`, `RAINBOW`

## Running locally

It's a static site. Serve the folder with anything, for example:

```bash
python3 -m http.server 8064
```

then open http://localhost:8064.

## Layout

```
index.html, css/style.css   page and UI
js/main.js                  three.js scene, camera views, 3D keyboard, panels
js/crt.js                   CRT compositing (glow, scanlines, power on/off)
js/c64/machine.js           memory map, VIC-II renderer, CIA
js/c64/cpu6502.js           6510 core
js/c64/sid.js               SID AudioWorklet + drive/key foley
js/c64/kernal.js            screen editor and KERNAL I/O
js/c64/basic.js             BASIC V2 tokeniser and interpreter
js/c64/disk.js              1541 drive, D64 import
js/c64/system.js            wires everything together
js/c64/font.js              original 8x8 character set
js/c64/demos.js             demo disk programs
assets/c64.glb              the 3D desk setup (keys split into separate meshes)
```

## Notes

- The character set and all demo programs were drawn/written for this project; no Commodore ROM data is included.
- The 3D model comes from the "Commodore 64 computer full pack" Blender scene. It was converted to a
  Draco-compressed GLB with each key separated and the CRT screen UV-mapped so the emulator can draw on it.

## License

Code, character set and demo programs: [MIT](LICENSE). The 3D model in `assets/` keeps its original
creator's license and isn't covered by the MIT license. "Commodore" and "Commodore 64" are trademarks
of their respective owners; this project isn't affiliated with them.
