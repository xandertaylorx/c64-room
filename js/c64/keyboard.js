// C64 keyboard: matrix positions, PETSCII decode tables (normal/shift/C=/CTRL), PC key mapping.

// key name -> matrix code (row*8+col as used by location 197)
export const MATRIX = {
  DEL: 0, RETURN: 1, CRSRRT: 2, F7: 3, F1: 4, F3: 5, F5: 6, CRSRDN: 7,
  3: 8, W: 9, A: 10, 4: 11, Z: 12, S: 13, E: 14, LSHIFT: 15,
  5: 16, R: 17, D: 18, 6: 19, C: 20, F: 21, T: 22, X: 23,
  7: 24, Y: 25, G: 26, 8: 27, B: 28, H: 29, U: 30, V: 31,
  9: 32, I: 33, J: 34, 0: 35, M: 36, K: 37, O: 38, N: 39,
  PLUS: 40, P: 41, L: 42, MINUS: 43, PERIOD: 44, COLON: 45, AT: 46, COMMA: 47,
  POUND: 48, STAR: 49, SEMICOLON: 50, HOME: 51, RSHIFT: 52, EQUALS: 53, UPARROW: 54, SLASH: 55,
  1: 56, LARROW: 57, CTRL: 58, 2: 59, SPACE: 60, CBM: 61, Q: 62, STOP: 63,
  SHIFTLOCK: 15, RESTORE: -1,
};

export const MODIFIERS = new Set(['LSHIFT', 'RSHIFT', 'CBM', 'CTRL', 'SHIFTLOCK']);

const N = {
  LARROW: 95, PLUS: 43, MINUS: 45, POUND: 92, HOME: 19, DEL: 20, AT: 64, STAR: 42, UPARROW: 94,
  COLON: 58, SEMICOLON: 59, EQUALS: 61, RETURN: 13, COMMA: 44, PERIOD: 46, SLASH: 47,
  CRSRDN: 17, CRSRRT: 29, F1: 133, F3: 134, F5: 135, F7: 136, SPACE: 32, STOP: 3,
};
const S = {
  LARROW: 95, 1: 33, 2: 34, 3: 35, 4: 36, 5: 37, 6: 38, 7: 39, 8: 40, 9: 41, 0: 48,
  PLUS: 219, MINUS: 221, POUND: 169, HOME: 147, DEL: 148, AT: 186, STAR: 192, UPARROW: 255,
  COLON: 91, SEMICOLON: 93, EQUALS: 61, RETURN: 141, COMMA: 60, PERIOD: 62, SLASH: 63,
  CRSRDN: 145, CRSRRT: 157, F1: 137, F3: 138, F5: 139, F7: 140, SPACE: 160, STOP: 131,
};
const CBM_LETTERS = { A: 176, B: 191, C: 188, D: 172, E: 177, F: 187, G: 165, H: 180, I: 162, J: 181, K: 161, L: 182, M: 167, N: 170, O: 185, P: 175, Q: 171, R: 178, S: 174, T: 163, U: 184, V: 190, W: 179, X: 189, Y: 183, Z: 173 };
const CBM = { ...CBM_LETTERS, 1: 129, 2: 149, 3: 150, 4: 151, 5: 152, 6: 153, 7: 154, 8: 155, PLUS: 166, MINUS: 220, POUND: 168, AT: 164, STAR: 223, UPARROW: 222, COLON: 91, SEMICOLON: 93 };
const CTRL = { 1: 144, 2: 5, 3: 28, 4: 159, 5: 156, 6: 30, 7: 31, 8: 158, 9: 18, 0: 146, COLON: 27, SEMICOLON: 29, EQUALS: 31 };

// decode a C64 key + modifier state into a PETSCII code (or null)
export function decode(name, shift, cbm, ctrl) {
  const isLetter = name.length === 1 && name >= 'A' && name <= 'Z';
  const isDigit = name.length === 1 && name >= '0' && name <= '9';
  if (ctrl) {
    if (CTRL[name] !== undefined) return CTRL[name];
    if (isLetter) return name.charCodeAt(0) & 31;
  }
  if (cbm && !shift) {
    if (CBM[name] !== undefined) return CBM[name];
  }
  if (shift) {
    if (isLetter) return name.charCodeAt(0) + 0x80;
    if (S[name] !== undefined) return S[name];
  }
  if (isLetter || isDigit) return name.charCodeAt(0);
  if (N[name] !== undefined) return N[name];
  return null;
}

// reverse lookup: PETSCII -> [keyName, needsShift] for animating the 3D keys while typing on a PC
export const REVERSE = new Map();
for (const name of Object.keys(MATRIX)) {
  for (const [sh, cb, ct] of [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]]) {
    const p = decode(name, sh, cb, ct);
    if (p !== null && !REVERSE.has(p)) REVERSE.set(p, { name, shift: !!sh, cbm: !!cb, ctrl: !!ct });
  }
}

// PC KeyboardEvent -> {petscii, keys:[c64 key names]} using a symbolic mapping
const CODE_TO_KEY = {
  Enter: 'RETURN', Backspace: 'DEL', Delete: 'DEL', Insert: 'DEL', Home: 'HOME', End: 'HOME',
  ArrowDown: 'CRSRDN', ArrowUp: 'CRSRDN', ArrowRight: 'CRSRRT', ArrowLeft: 'CRSRRT',
  Space: 'SPACE', Escape: 'STOP', F1: 'F1', F2: 'F1', F3: 'F3', F4: 'F3', F5: 'F5', F6: 'F5', F7: 'F7', F8: 'F7',
  Backquote: 'LARROW', Minus: 'MINUS', Equal: 'EQUALS', BracketLeft: 'AT', BracketRight: 'STAR',
  Backslash: 'POUND', Semicolon: 'COLON', Quote: 'SEMICOLON', Comma: 'COMMA', Period: 'PERIOD', Slash: 'SLASH',
  ShiftLeft: 'LSHIFT', ShiftRight: 'RSHIFT', ControlLeft: 'CTRL', ControlRight: 'CTRL', AltLeft: 'CBM', AltRight: 'CBM',
  Tab: 'CTRL', PageUp: 'RESTORE',
};
export function pcToKey(e) {
  if (/^Key[A-Z]$/.test(e.code)) return e.code[3];
  if (/^Digit[0-9]$/.test(e.code)) return e.code[5];
  if (/^Numpad[0-9]$/.test(e.code)) return e.code[6];
  return CODE_TO_KEY[e.code] || null;
}

const SYMBOLS = {
  '!': 33, '"': 34, '#': 35, '$': 36, '%': 37, '&': 38, "'": 39, '(': 40, ')': 41, '*': 42, '+': 43, ',': 44,
  '-': 45, '.': 46, '/': 47, ':': 58, ';': 59, '<': 60, '=': 61, '>': 62, '?': 63, '@': 64, '[': 91, ']': 93,
  '^': 94, '_': 95, '`': 95, '\\': 92, '~': 255, '|': 221, '{': 179, '}': 171,
};

export function pcToPetscii(e) {
  const k = e.key, shift = e.shiftKey, ctrl = e.ctrlKey, cbm = e.altKey;
  const key = pcToKey(e);
  if (ctrl || cbm) {
    if (key && key !== 'CTRL' && key !== 'CBM') { const p = decode(key, shift, cbm, ctrl); if (p !== null) return p; }
    return null;
  }
  switch (e.code) {
    case 'Enter': case 'NumpadEnter': return shift ? 141 : 13;
    case 'Backspace': return shift ? 148 : 20;
    case 'Delete': return 20;
    case 'Insert': return 148;
    case 'Home': return shift ? 147 : 19;
    case 'End': return 147;
    case 'ArrowUp': return 145;
    case 'ArrowDown': return 17;
    case 'ArrowLeft': return 157;
    case 'ArrowRight': return 29;
    case 'Escape': return shift ? 131 : 3;
    case 'Space': return shift ? 160 : 32;
  }
  const fk = /^F([1-8])$/.exec(k);
  if (fk) return 132 + [0, 1, 5, 2, 6, 3, 7, 4, 8][+fk[1]];
  if (k.length === 1) {
    const c = k.charCodeAt(0);
    // letters follow the Shift key, not the case of the character: Caps Lock must not
    // turn everything into PETSCII graphics
    if ((c >= 97 && c <= 122) || (c >= 65 && c <= 90)) { const u = k.toUpperCase().charCodeAt(0); return shift ? u + 0x80 : u; }
    if (c >= 48 && c <= 57) return c;
    if (SYMBOLS[k] !== undefined) return SYMBOLS[k];
    if (k === '£') return 92;
  }
  return null;
}
