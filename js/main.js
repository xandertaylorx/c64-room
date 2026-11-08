import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { C64 } from './c64/system.js';
import { CRT } from './crt.js';
import { decode, pcToKey, pcToPetscii, REVERSE, MODIFIERS } from './c64/keyboard.js';
import { parseD64, asciiToPet, petToAscii } from './c64/disk.js';

const $ = (id) => document.getElementById(id);
const c64 = new C64();
const crt = new CRT(c64.m);
window.c64 = c64; // handy for tinkering in the console

// ---------------------------------------------------------------- renderer / scene
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0f0c0a);
scene.fog = new THREE.Fog(0x0f0c0a, 18, 40);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.35;

const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 100);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.minDistance = 1.6; controls.maxDistance = 18;
controls.maxPolarAngle = Math.PI * 0.47;
controls.screenSpacePanning = true;

// lights: warm desk lamp, cool fill, and the CRT's own glow
const lamp = new THREE.DirectionalLight(0xffe2c0, 2.4);
lamp.position.set(6, 10, 7); lamp.castShadow = true;
lamp.shadow.mapSize.set(2048, 2048);
Object.assign(lamp.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 30 });
lamp.shadow.bias = -0.0004; lamp.shadow.normalBias = 0.02;
scene.add(lamp);
scene.add(new THREE.HemisphereLight(0x8fa6c8, 0x2a1c12, 0.45));
const rim = new THREE.DirectionalLight(0x9db8ff, 0.6); rim.position.set(-8, 6, -6); scene.add(rim);
const screenLight = new THREE.PointLight(0x6c7cff, 0, 9, 1.6);
screenLight.position.set(0, 0.95, 1.6); scene.add(screenLight);

// desk
function woodTexture() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 1024;
  const g = c.getContext('2d');
  g.fillStyle = '#3b2717'; g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 260; i++) {
    const y = Math.random() * 1024, a = Math.random() * 0.08;
    g.strokeStyle = `rgba(${20 + Math.random() * 40},${10 + Math.random() * 20},5,${a + 0.04})`;
    g.lineWidth = 1 + Math.random() * 3;
    g.beginPath(); g.moveTo(0, y);
    for (let x = 0; x <= 1024; x += 64) g.lineTo(x, y + Math.sin(x / 140 + i) * 6 + Math.random() * 2);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 2); t.anisotropy = 8;
  return t;
}
const desk = new THREE.Mesh(new THREE.PlaneGeometry(40, 26), new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.62, metalness: 0.0 }));
desk.rotation.x = -Math.PI / 2; desk.receiveShadow = true; scene.add(desk);

// screen texture
const screenTex = new THREE.CanvasTexture(crt.canvas);
screenTex.colorSpace = THREE.SRGBColorSpace; screenTex.flipY = false; screenTex.anisotropy = 8;

// ---------------------------------------------------------------- views
const VIEWS = {
  desk: { pos: [1.2, 5.6, 10.6], target: [-0.2, 1.6, 0.6] },
  keys: { pos: [-0.2, 7.2, 7.6], target: [-0.2, 1.3, 1.35] },
  screen: { pos: [0, 2.32, 3.1], target: [0, 2.28, -0.4] },
  close: { pos: [0.15, 5.4, 7.7], target: [-0.1, 1.7, 2.1] },
};
let tween = null;
function setView(name, instant = false) {
  const v = VIEWS[name]; if (!v) return;
  document.querySelectorAll('.view').forEach(b => b.classList.toggle('on', b.dataset.view === name));
  const to = { pos: new THREE.Vector3(...v.pos), target: new THREE.Vector3(...v.target) };
  if (instant) { camera.position.copy(to.pos); controls.target.copy(to.target); controls.update(); return; }
  tween = { t: 0, from: { pos: camera.position.clone(), target: controls.target.clone() }, to };
}
window.setView = setView; window.VIEWS = VIEWS;
setView('desk', true);
camera.position.add(new THREE.Vector3(3, 3, 6)); // start a little further out for the intro
setTimeout(() => setView('desk'), 50);

// ---------------------------------------------------------------- model
const keys = new Map();      // name -> {mesh, base, depth, cur}
const pickables = [];
let joystick = null, joyBase = null, drive = null, brick = null, c64body = null, monitor = null, screenMesh = null;
const leds = {};

const draco = new DRACOLoader().setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/draco/gltf/');
const loader = new GLTFLoader().setDRACOLoader(draco);
loader.load('assets/c64.glb', (gltf) => {
  const root = gltf.scene;
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    if (o.material) o.material.envMapIntensity = 1;
    const n = o.name;
    if (n.startsWith('key_')) {
      o.material = o.material.clone();
      o.material.emissive = new THREE.Color(0xffd27a); o.material.emissiveIntensity = 0;
      keys.set(n.slice(4), { mesh: o, base: o.position.clone(), cur: 0, target: 0 });
      o.userData.kind = 'key'; o.userData.key = n.slice(4);
      pickables.push(o);
    } else if (n === 'screen') {
      screenMesh = o;
      o.material = new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false });
      o.castShadow = false;
      o.userData.kind = 'screen'; pickables.push(o);
      // a glass layer for reflections
      // unlit, environment-only reflection: no hot spots from the scene lights
      const glass = new THREE.Mesh(o.geometry, new THREE.MeshBasicMaterial({
        color: 0x000000, envMap: scene.environment, combine: THREE.AddOperation, reflectivity: 0.22,
        transparent: true, opacity: 0.5, depthWrite: false,
      }));
      glass.position.copy(o.position); glass.quaternion.copy(o.quaternion); glass.scale.copy(o.scale);
      glass.position.z += 0.004; glass.renderOrder = 2;
      o.parent.add(glass);
    } else if (n === '1541') { drive = o; o.userData.kind = 'drive'; pickables.push(o); }
    else if (n === 'joystick c1311') { joystick = o; o.userData.kind = 'joystick'; pickables.push(o); }
    else if (n === 'power adapter') { brick = o; o.userData.kind = 'power'; pickables.push(o); }
    else if (n === 'commodore 64') { c64body = o; o.userData.kind = 'body'; pickables.push(o); }
    else if (n === 'video monitor 1702' || n === 'monitor cap') { monitor = o; o.userData.kind = 'monitor'; pickables.push(o); }
  });
  scene.add(root);
  root.updateMatrixWorld(true);
  if (joystick) joyBase = joystick.rotation.clone();
  addLeds();
  ready();
}, (e) => {
  if (e.total) $('loadBar').style.width = Math.round(e.loaded / e.total * 100) + '%';
}, (err) => {
  console.error(err);
  $('loadText').textContent = 'The 3D model could not load, using the flat screen instead.';
  setFlat(true); ready();
});

// screen position of a key / the joystick (used by automated demos and tests)
window.screenPosOf = (name) => {
  const o = name === 'joystick' ? joystick : (keys.get(name) || {}).mesh;
  if (!o) return null;
  const v = new THREE.Vector3(); o.getWorldPosition(v); v.project(camera);
  const r = canvas.getBoundingClientRect();
  return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
};

function addLeds() {
  const ray = new THREE.Raycaster();
  const place = (obj, origin, dir, color, name, size = 0.03) => {
    if (!obj) return;
    ray.set(origin, dir);
    const hit = ray.intersectObject(obj, false)[0];
    if (!hit) return;
    const mat = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: new THREE.Color(color), emissiveIntensity: 0, roughness: 0.3 });
    const m = new THREE.Mesh(new THREE.SphereGeometry(size, 16, 10), mat);
    m.scale.set(1, 0.5, 1);
    const nrm = hit.face.normal.clone().transformDirection(obj.matrixWorld);
    m.position.copy(hit.point).addScaledVector(nrm, size * 0.15);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), nrm);
    scene.add(m);
    const light = new THREE.PointLight(color, 0, 0.6, 2); light.position.copy(m.position).addScaledVector(nrm, 0.05); scene.add(light);
    leds[name] = { mat, light };
  };
  // C64 power LED sits top-right, above the function keys
  place(c64body, new THREE.Vector3(1.55, 5, 2.55), new THREE.Vector3(0, -1, 0), 0xff2a1a, 'power', 0.035);
  // 1541: power (green) and drive (red) LEDs on the front panel
  place(drive, new THREE.Vector3(-3.8, 0.28, 5), new THREE.Vector3(0, 0, -1), 0x30ff50, 'drivePower', 0.03);
  place(drive, new THREE.Vector3(-3.95, 0.28, 5), new THREE.Vector3(0, 0, -1), 0xff2a1a, 'driveBusy', 0.03);
}

// ---------------------------------------------------------------- start / power
let started = false;
function ready() {
  $('loadBar').style.width = '100%';
  if (!$('loadText').textContent.includes('could not')) $('loadText').textContent = 'Ready. Your C64 is on the desk.';
  $('startBtn').disabled = false;
}
$('startBtn').onclick = async () => {
  $('start').classList.add('hidden');
  started = true;
  await c64.sid.start();
  setTimeout(() => { powerOn(); setTimeout(() => toast('Click the 1541 to run a game · Program = paste code · ? = help'), 1800); }, 350);
  canvas.focus();
};
function powerOn() { c64.powerOn(); crt.setPower(true); c64.foley.click(0.12); }
function powerOff() { c64.powerOff(); crt.setPower(false); c64.foley.click(0.12); }
function togglePower() { if (c64.powered) powerOff(); else { c64.sid.start(); powerOn(); } }
c64.on('power', (on) => { $('btnPower').classList.toggle('lit', on); if (leds.power) leds.power.mat.emissiveIntensity = on ? 3 : 0; });
c64.on('drive', (s) => { c64.foley.driveSeek(Math.min(s, 3)); });
c64.onError = () => { };

// ---------------------------------------------------------------- keyboard state & typing
const latched = new Set();   // modifiers latched by clicking on the 3D keys
let shiftLock = false;
function modsState() {
  const held = c64.heldKeys;
  const shift = shiftLock || latched.has('LSHIFT') || latched.has('RSHIFT') || held.has('LSHIFT') || held.has('RSHIFT');
  const cbm = latched.has('CBM') || held.has('CBM');
  const ctrl = latched.has('CTRL') || held.has('CTRL');
  c64.shift = shift; c64.cbm = cbm; c64.ctrl = ctrl;
  return { shift, cbm, ctrl };
}
function renderMods() {
  const list = [...latched].map(k => ({ LSHIFT: 'SHIFT', RSHIFT: 'SHIFT', CBM: 'C=', CTRL: 'CTRL' }[k] || k));
  if (shiftLock) list.push('SHIFT LOCK');
  $('mods').innerHTML = [...new Set(list)].map(t => `<span>${t}</span>`).join('');
}
function pressVisual(name, down) {
  const k = keys.get(name); if (!k) return;
  k.target = down ? 1 : 0;
  if (down) c64.foley.click(0.035);
}
function emit(p) { if (p !== null && p !== undefined) c64.typePetscii(p); }

// click on a 3D key
function clickKeyDown(name) {
  if (!started) return;
  if (name === 'RESTORE') { pressVisual(name, true); c64.warmReset(); return; }
  if (name === 'SHIFTLOCK') { shiftLock = !shiftLock; pressVisual(name, shiftLock); renderMods(); return; }
  if (MODIFIERS.has(name)) {
    if (latched.has(name)) { latched.delete(name); pressVisual(name, false); }
    else { latched.add(name); pressVisual(name, true); }
    const m = modsState();
    if (m.shift && m.cbm) { c64.toggleCase(); for (const l of [...latched]) { latched.delete(l); pressVisual(l, false); } }
    renderMods();
    return;
  }
  pressVisual(name, true);
  c64.keyDown(name);
  const m = modsState();
  emit(decode(name, m.shift, m.cbm, m.ctrl));
}
function clickKeyUp(name) {
  if (MODIFIERS.has(name) || !keys.has(name)) return;
  if (name === 'RESTORE') { pressVisual(name, false); return; }
  pressVisual(name, false);
  c64.keyUp(name);
  if (latched.size) { for (const l of [...latched]) { latched.delete(l); pressVisual(l, false); } modsState(); renderMods(); }
}

// physical keyboard
// ---- toasts, copy and paste ----------------------------------------------------
let toastT = 0;
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2400);
}
function screenText() {
  const base = c64.k.screenBase, rows = [];
  for (let y = 0; y < 25; y++) {
    let l = '';
    for (let x = 0; x < 40; x++) {
      const sc = c64.m.ram[base + y * 40 + x] & 0x7f;
      let ch = ' ';
      if (sc === 0) ch = '@'; else if (sc < 27) ch = String.fromCharCode(64 + sc);
      else if (sc < 32) ch = '[£]↑←'[sc - 27];
      else if (sc < 64) ch = String.fromCharCode(sc);
      else ch = '#';
      l += ch;
    }
    rows.push(l.replace(/\s+$/, ''));
  }
  while (rows.length && !rows[rows.length - 1]) rows.pop();
  return rows.join('\n');
}
async function copyText(text, what) {
  try { await navigator.clipboard.writeText(text); toast(what + ' copied'); return true; }
  catch {
    const ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta);
    ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch { /* ignore */ }
    ta.remove(); toast(ok ? what + ' copied' : 'Copy was blocked by the browser'); return ok;
  }
}
let pasteSeen = 0;
function pasteFallback() {
  const t = Date.now();
  setTimeout(() => {
    if (pasteSeen >= t) return; // the normal paste event handled it
    if (!navigator.clipboard || !navigator.clipboard.readText) { toast('Paste blocked: use the Program panel'); return; }
    navigator.clipboard.readText().then(txt => { if (txt) pasteText(txt); }).catch(() => toast('Paste blocked by the browser: use the Program panel'));
  }, 250);
}

// pasting: text is fed through the 10-key buffer as if typed, so whole programs can be pasted
const pasteQueue = [];
const PASTE_SYMBOLS = { '£': 92, '^': 94, '_': 95, '`': 95, '\\': 92, '~': 255, '[': 91, ']': 93, '{': 91, '}': 93, '|': 221 };
function pasteText(text) {
  if (!c64.powered) return;
  for (const ch of text.replace(/\r\n?/g, '\n')) {
    const c = ch.charCodeAt(0);
    let p = null;
    if (ch === '\n') p = 13;
    else if (c >= 97 && c <= 122) p = c - 32;           // letters type as normal (unshifted) C64 letters
    else if (c >= 32 && c <= 90) p = c;
    else if (PASTE_SYMBOLS[ch] !== undefined) p = PASTE_SYMBOLS[ch];
    else if (ch === '\t') p = 32;
    else if (ch === '“' || ch === '”') p = 34;
    else if (ch === '‘' || ch === '’') p = 39;
    if (p === null) continue;
    pasteQueue.push(p);
  }
}
function feedPaste() {
  // only top up the buffer while the editor (or a running program) can take keys
  while (pasteQueue.length && c64.m.ram[198] < 10) {
    if (c64.basic.state === 'device' || c64.basic.state === 'list') break;
    const p = pasteQueue.shift();
    c64.typePetscii(p);
    if (p === 13) break; // let the line be processed before typing the next one
  }
}
window.addEventListener('paste', (e) => {
  if (!started || isTypingInUI(e)) return;
  pasteSeen = Date.now();
  const text = e.clipboardData && e.clipboardData.getData('text');
  if (!text) return;
  e.preventDefault();
  pasteText(text);
});

let joyMode = false;
const pcDown = new Map(); // code -> list of c64 key names animated
function isTypingInUI(e) { const t = e.target; return t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA'); }
window.addEventListener('keydown', (e) => {
  if (!started || isTypingInUI(e)) return;
  if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && (e.code === 'KeyV' || e.code === 'KeyC')) {
    if (e.code === 'KeyV') pasteFallback();
    else { const sel = String(getSelection()); copyText(sel || screenText(), sel ? 'Selection' : 'Screen text'); e.preventDefault(); }
    return;
  }
  if (e.metaKey) return; // leave browser shortcuts alone
  if (e.ctrlKey && e.code === 'KeyV' && !e.altKey) return; // let the browser paste (handled below)
  if (e.code === 'F9') { e.preventDefault(); setFlat(!flat); return; }
  if (e.code === 'F11' || e.code === 'F12') return;
  e.preventDefault();
  if (joyMode && handleJoy(e.code, true)) return;
  if (e.code === 'PageUp') { c64.warmReset(); return; }
  const name = pcToKey(e);
  // C= + SHIFT toggles the character set
  if ((e.code.startsWith('Alt') && e.shiftKey) || (e.code.startsWith('Shift') && e.altKey)) c64.toggleCase();
  if (!e.repeat) {
    const anim = [];
    if (name) anim.push(name);
    const p0 = pcToPetscii(e);
    const rev = p0 !== null ? REVERSE.get(p0) : null;
    if (rev && rev.name !== name) { anim.length = 0; anim.push(rev.name); }
    if (rev && rev.shift && !e.shiftKey) anim.push('LSHIFT');
    for (const n of anim) { pressVisual(n, true); c64.keyDown(n); }
    pcDown.set(e.code, anim);
  }
  modsState();
  if (!c64.powered) return;
  const p = pcToPetscii(e);
  if (p === null) return;
  if (e.repeat) {
    const rep = c64.m.ram[650];
    const repeatable = [17, 145, 29, 157, 20, 148, 32, 160].includes(p);
    if (!(rep & 0x80) && !(repeatable && !(rep & 0x40))) return;
  }
  emit(p);
});
window.addEventListener('keyup', (e) => {
  if (!started || isTypingInUI(e)) return;
  if (!e.metaKey) e.preventDefault();
  if (joyMode && handleJoy(e.code, false)) return;
  const anim = pcDown.get(e.code) || [];
  for (const n of anim) { pressVisual(n, false); c64.keyUp(n); }
  pcDown.delete(e.code);
  modsState();
});
window.addEventListener('blur', () => {
  for (const anim of pcDown.values()) for (const n of anim) { pressVisual(n, false); c64.keyUp(n); }
  pcDown.clear(); c64.m.joy2 = 0; modsState();
});

// joystick in port 2
const JOY = { ArrowUp: 1, ArrowDown: 2, ArrowLeft: 4, ArrowRight: 8, Space: 16, ControlRight: 16, Numpad8: 1, Numpad2: 2, Numpad4: 4, Numpad6: 8, Numpad0: 16 };
let joyKeys = 0, padBits = 0;
function handleJoy(code, down) {
  const b = JOY[code]; if (!b) return false;
  joyKeys = down ? joyKeys | b : joyKeys & ~b;
  c64.m.joy2 = joyKeys | padBits;
  return true;
}
function pollGamepad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  let bits = 0;
  for (const g of pads) {
    if (!g) continue;
    const ax = g.axes[0] || 0, ay = g.axes[1] || 0, bt = (i) => g.buttons[i] && g.buttons[i].pressed;
    if (ay < -0.5 || bt(12)) bits |= 1; if (ay > 0.5 || bt(13)) bits |= 2;
    if (ax < -0.5 || bt(14)) bits |= 4; if (ax > 0.5 || bt(15)) bits |= 8;
    if (bt(0) || bt(1) || bt(2) || bt(3)) bits |= 16;
  }
  if (bits && !joyMode) setJoy(true);
  padBits = bits; c64.m.joy2 = joyKeys | padBits;
}
function setJoy(on) {
  joyMode = on; $('btnJoy').classList.toggle('on', on);
  $('btnJoy').textContent = on ? 'Joystick: port 2' : 'Joystick';
  if (!on) { joyKeys = 0; c64.m.joy2 = padBits; }
}

// ---------------------------------------------------------------- pointer interaction
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let hover = null, pressedKey = null, downAt = null;
const LABELS = {
  LARROW: '←', PLUS: '+', MINUS: '−', POUND: '£', HOME: 'CLR/HOME', DEL: 'INST/DEL', CTRL: 'CTRL', AT: '@', STAR: '*', UPARROW: '↑ / π',
  RESTORE: 'RESTORE', STOP: 'RUN/STOP', SHIFTLOCK: 'SHIFT LOCK', COLON: ': [', SEMICOLON: '; ]', EQUALS: '=', RETURN: 'RETURN',
  CBM: 'C= (Commodore)', LSHIFT: 'SHIFT', RSHIFT: 'SHIFT', COMMA: ', <', PERIOD: '. >', SLASH: '/ ?', CRSRDN: 'CRSR ↑↓', CRSRRT: 'CRSR ←→',
  F1: 'f1 / f2', F3: 'f3 / f4', F5: 'f5 / f6', F7: 'f7 / f8', SPACE: 'SPACE',
};
function pick(e) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(pickables, false)[0];
  return hit ? hit.object : null;
}
function describe(o) {
  if (!o) return null;
  const k = o.userData.kind;
  if (k === 'key') { const n = o.userData.key; return (LABELS[n] || n) + '<small>key</small>'; }
  if (k === 'screen') return 'Monitor screen<small>click to zoom in</small>';
  if (k === 'drive') return '1541 disk drive<small>click to manage disks</small>';
  if (k === 'joystick') return 'Joystick<small>' + (joyMode ? 'unplug from port 2' : 'plug into port 2') + '</small>';
  if (k === 'power') return 'Power supply<small>switch ' + (c64.powered ? 'off' : 'on') + '</small>';
  if (k === 'body') return 'Commodore 64<small>click keys to type</small>';
  if (k === 'monitor') return '1702 monitor<small>click to zoom in</small>';
  return null;
}
// ---- mouse on the emulated screen (for Desk64) -------------------------------------------------
const screenRay = new THREE.Raycaster(), screenNdc = new THREE.Vector2();
function screenPx(e, viaFlat) {
  let cx, cy;
  if (viaFlat) { const r = $('flatCanvas').getBoundingClientRect(); cx = (e.clientX - r.left) / r.width * 1024; cy = (e.clientY - r.top) / r.height * 768; }
  else {
    if (!screenMesh) return null;
    const r = canvas.getBoundingClientRect();
    screenNdc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    screenRay.setFromCamera(screenNdc, camera);
    const hit = screenRay.intersectObject(screenMesh, false)[0];
    if (!hit || !hit.uv) return null;
    cx = hit.uv.x * 1024; cy = hit.uv.y * 768;
  }
  // canvas -> VIC frame (the picture is inset by 70/62 px and scaled 884x644 -> 384x272), then to the 320x200 window
  return { x: (cx - 70) / 884 * 384 - 32, y: (cy - 62) / 644 * 272 - 36 };
}
let appPressed = false;
function appPointer(e, kind, viaFlat) {
  const p = screenPx(e, viaFlat);
  if (!p) { if (kind === 'up' && appPressed) { c64.mouse('up', 160, 100); appPressed = false; controls.enabled = true; } return false; }
  if (kind === 'down') { appPressed = true; controls.enabled = false; }
  if (kind === 'up') { appPressed = false; controls.enabled = true; }
  if (kind === 'move' && !appPressed && (p.x < -4 || p.y < -4 || p.x > 324 || p.y > 204)) return false;
  c64.mouse(kind, p.x, p.y);
  return true;
}
const flatEl = $('flatCanvas');
flatEl.addEventListener('pointermove', (e) => { if (c64.app) appPointer(e, 'move', true); });
flatEl.addEventListener('pointerdown', (e) => { if (c64.app) { flatEl.setPointerCapture(e.pointerId); appPointer(e, 'down', true); } });
flatEl.addEventListener('pointerup', (e) => { if (c64.app) appPointer(e, 'up', true); });
$('btnDesk').onclick = () => {
  if (!started) return;
  if (!c64.powered) powerOn();
  if (c64.app) { toast('Desk64 is already open'); return; }
  if (c64.basic.state !== 'direct') { toast('Press RUN/STOP (Esc) first, then try again'); return; }
  c64.startApp(false);
};
c64.on('app', (on) => { $('btnDesk').classList.toggle('on', on); if (on) { setView('screen'); toast('Desk64: double-click icons · Esc cancels dialogs · Quit from the Desk64 menu'); } else canvas.style.cursor = 'grab'; });

canvas.addEventListener('pointermove', (e) => {
  if (c64.app) { const over = appPointer(e, 'move', false); canvas.style.cursor = over ? 'none' : 'grab'; $('tooltip').classList.add('hidden'); if (over || appPressed) return; }
  if (pressedKey) return;
  const o = pick(e);
  if (hover !== o) {
    if (hover && hover.userData.kind === 'key') hover.material.emissiveIntensity = 0;
    hover = o;
    if (o && o.userData.kind === 'key') o.material.emissiveIntensity = 0.12;
  }
  const d = describe(o), tip = $('tooltip');
  canvas.style.cursor = o && o.userData.kind !== 'body' ? 'pointer' : 'grab';
  if (d) { tip.innerHTML = d; tip.style.left = e.clientX + 'px'; tip.style.top = e.clientY + 'px'; tip.classList.remove('hidden'); }
  else tip.classList.add('hidden');
});
canvas.addEventListener('pointerleave', () => $('tooltip').classList.add('hidden'));
window.addEventListener('pointerdown', (e) => {
  if (e.target !== canvas) return;
  if (c64.app && appPointer(e, 'down', false)) { canvas.setPointerCapture(e.pointerId); e.stopPropagation(); return; }
  downAt = { x: e.clientX, y: e.clientY };
  const o = pick(e);
  if (o && o.userData.kind === 'key') {
    controls.enabled = false;
    pressedKey = o.userData.key;
    canvas.setPointerCapture(e.pointerId);
    clickKeyDown(pressedKey);
    e.stopPropagation();
  }
}, { capture: true });
canvas.addEventListener('pointerup', (e) => {
  if (c64.app || appPressed) { appPointer(e, 'up', false); return; }
  if (pressedKey) { clickKeyUp(pressedKey); pressedKey = null; controls.enabled = true; return; }
  if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 5) return; // it was a drag
  const o = pick(e); if (!o || !started) return;
  const k = o.userData.kind;
  if (k === 'screen' || k === 'monitor') setView('screen');
  else if (k === 'drive') togglePanel('diskPanel', true);
  else if (k === 'joystick') setJoy(!joyMode);
  else if (k === 'power') togglePower();
});
canvas.addEventListener('dblclick', (e) => { const o = pick(e); if (!o || o.userData.kind === 'key') return; if (o.userData.kind === 'screen') setView('desk'); });

// ---------------------------------------------------------------- dock & panels
// buttons shouldn't keep focus, or Space/Enter typed for the C64 would press them
document.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setTimeout(() => b.blur(), 0); });
$('btnPower').onclick = () => started && togglePower();
$('btnReset').onclick = () => c64.warmReset();
document.querySelectorAll('.view').forEach(b => b.onclick = () => { setFlat(false); setView(b.dataset.view); });
$('speed').onchange = (e) => { c64.speed = +e.target.value; c64.turbo = c64.speed >= 4; };
$('btnSound').classList.add('on');
$('btnSound').onclick = () => { const m = !c64.sid.muted; c64.sid.setMuted(m); $('btnSound').classList.toggle('on', !m); };
$('btnFx').onclick = () => { crt.effects = !crt.effects; $('btnFx').classList.toggle('on', crt.effects); };
$('btnJoy').onclick = () => setJoy(!joyMode);
$('btnHelp').onclick = () => togglePanel('helpPanel');
$('btnDisk').onclick = () => togglePanel('diskPanel');
$('btnPrinter').onclick = () => togglePanel('printerPanel');
$('btnFlat').onclick = () => setFlat(!flat);
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => togglePanel(b.dataset.close, false));
function togglePanel(id, force) {
  const el = $(id); const show = force ?? el.classList.contains('hidden');
  if (show) ['diskPanel', 'printerPanel', 'helpPanel', 'progPanel'].forEach(p => p !== id && $(p).classList.add('hidden'));
  el.classList.toggle('hidden', !show);
  if (show && id === 'diskPanel') renderDisk();
}
let flat = false;
const flatCtx = $('flatCanvas').getContext('2d');
function setFlat(on) { flat = on; $('flat').classList.toggle('hidden', !on); $('btnFlat').classList.toggle('on', on); }

// program editor ---------------------------------------------------------------
// the program in memory is also kept in this browser, so closing the tab doesn't lose work
let autosaved = '';
try { autosaved = localStorage.getItem('c64.autosave') || ''; } catch { /* storage blocked */ }
setInterval(() => {
  if (!c64.powered || document.hidden) return;
  const t = c64.listing();
  if (t && t !== autosaved) { autosaved = t; try { localStorage.setItem('c64.autosave', t); } catch { /* ignore */ } }
}, 3000);
$('btnProg').onclick = () => {
  togglePanel('progPanel');
  if ($('progPanel').classList.contains('hidden') || $('progText').value) return;
  if (c64.basic.lines().length) $('progGet').click();
  else if (autosaved) { $('progText').value = autosaved; progMsg('Recovered the last program from your previous session. Press Send to C64 to bring it back.'); }
};
const progMsg = (t) => { $('progMsg').textContent = t; };
$('progGet').onclick = () => { const t = c64.listing(); $('progText').value = t; progMsg(t ? t.split('\n').length + ' lines read from the C64.' : 'There is no program in memory.'); };
$('progSend').onclick = () => {
  if (!c64.powered) powerOn();
  if (c64.basic.state !== 'direct') { c64.typePetscii(3); }
  setTimeout(() => {
    const r = c64.loadListing($('progText').value);
    progMsg(r.count + ' lines sent to the C64' + (r.skipped ? ' (' + r.skipped + ' lines without a line number were skipped)' : '') + '. Type RUN to start it.');
    c64.basic.state = 'direct'; c64.basic.ready();
    toast(r.count + ' lines loaded. Type RUN');
  }, 150);
};
$('progCopy').onclick = () => copyText($('progText').value || c64.listing(), 'Listing');
$('progDown').onclick = () => {
  const t = $('progText').value || c64.listing(); if (!t) return;
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([t + '\n'], { type: 'text/plain' })); a.download = 'program.bas'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$('progFile').onchange = async (e) => {
  const f = e.target.files[0]; if (!f) return;
  if (/\.prg$/i.test(f.name)) {
    const buf = new Uint8Array(await f.arrayBuffer());
    if (buf[0] === 1 && buf[1] === 8) {
      // load a tokenised program straight into memory, then show its listing
      c64.m.ram.set(buf.subarray(2), 0x801); const end = 0x801 + buf.length - 2;
      c64.basic.wr16(45, end); c64.basic.relink(); $('progText').value = c64.listing(); progMsg('PRG loaded into memory. Type RUN.');
    } else progMsg('That PRG is machine code, not BASIC. Put it on a disk with the 1541 panel instead.');
  } else { $('progText').value = await f.text(); progMsg('File opened. Press Send to C64.'); }
  e.target.value = '';
};
$('saveHere').onclick = () => {
  const name = asciiToPet($('saveName').value.trim().toUpperCase().slice(0, 16));
  if (!name) { toast('Give the program a name first'); return; }
  if (!c64.basic.lines().length) { toast('There is no program in memory to save'); return; }
  if (!c64.drive.disk) { toast('No disk in the drive'); return; }
  const f = c64.drive.disk.files.find(x => x.name === name);
  if (f && !confirm('"' + petToAscii(name) + '" already exists on this disk. Replace it?')) return;
  if (!c64.drive.saveFile('@0:' + name, c64.programPrg())) { toast('Could not save: ' + c64.drive.statusString()); return; }
  renderDisk(); toast('Saved ' + petToAscii(name).toUpperCase());
};

// printer
c64.printer.onChange = (lines) => {
  $('btnPrinter').classList.remove('hidden');
  $('paper').textContent = lines.join('\n');
  $('paper').scrollTop = 1e9;
};
$('paperClear').onclick = () => c64.printer.clear();

// disks
function renderDisk() {
  const sel = $('diskSelect');
  const ids = c64.store.listDisks().filter(i => !i.startsWith('~'));
  sel.innerHTML = ids.map(id => { const d = c64.store.load(id); return `<option value="${id}">${escapeHtml(petToAscii(d.name).toUpperCase())}</option>`; }).join('');
  sel.value = c64.drive.disk ? c64.drive.disk.id : '';
  const d = c64.drive.disk;
  $('diskLabel').textContent = d ? petToAscii(d.name).toUpperCase() + ' · ' + d.diskId : 'no disk';
  const ul = $('fileList');
  if (!d || !d.files.length) { ul.innerHTML = '<li class="empty">This disk is empty. SAVE"NAME",8 to write to it.</li>'; return; }
  ul.innerHTML = d.files.map((f, i) => `
    <li><span class="blk">${c64.drive.blocksOf(f)}</span><span class="nm">${escapeHtml(petToAscii(f.name).toUpperCase())}</span><span class="ty">${f.type}</span>
    ${f.type === 'PRG' ? `<button data-run="${i}">RUN</button>` : ''}<button class="ghost" data-dl="${i}">↓</button><button class="ghost" data-del="${i}" aria-label="Delete">✕</button></li>`).join('') +
    `<li class="empty">${c64.drive.freeBlocks()} blocks free</li>`;
  ul.querySelectorAll('[data-run]').forEach(b => b.onclick = () => runFile(d.files[+b.dataset.run]));
  ul.querySelectorAll('[data-dl]').forEach(b => b.onclick = () => downloadFile(d.files[+b.dataset.dl]));
  ul.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
    const f = d.files[+b.dataset.del];
    if (!confirm(`Scratch "${petToAscii(f.name).toUpperCase()}" from this disk? This can't be undone.`)) return;
    d.files.splice(+b.dataset.del, 1); c64.drive.persist(); renderDisk();
  });
}
function escapeHtml(s) { return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
$('diskSelect').onchange = (e) => { c64.drive.insert(c64.store.load(e.target.value)); c64.foley.click(0.1); renderDisk(); };
$('diskNew').onclick = () => {
  const name = (prompt('Name for the new disk (max 16 characters):', 'MY DISK') || '').trim().slice(0, 16);
  if (!name) return;
  const id = 'd' + Date.now().toString(36);
  c64.store.save({ id, name: asciiToPet(name), diskId: String(Math.floor(Math.random() * 90 + 10)), files: [] });
  c64.drive.insert(c64.store.load(id)); renderDisk();
};
function runFile(f) {
  if (!c64.powered) powerOn();
  togglePanel('diskPanel', false);
  const name = f.name.replace(/"/g, '');
  const isBasic = f.data[0] === 0x01 && f.data[1] === 0x08;
  const cmd = `LOAD"${name}",8${isBasic ? '' : ',1'}`;
  typeLine(cmd + '\r', () => { if (isBasic) waitReady(() => typeLine('RUN\r')); });
}
function typeLine(s, done) {
  // feed the keyboard buffer as if typed (respecting the 10 key buffer)
  const chars = [...s].map(ch => ch.charCodeAt(0));
  const tick = () => {
    while (chars.length && c64.m.ram[198] < 10) c64.typePetscii(chars.shift());
    if (chars.length) setTimeout(tick, 30); else done && done();
  };
  if (c64.basic.state !== 'direct') { c64.typePetscii(3); setTimeout(() => typeLine(s, done), 120); return; }
  tick();
}
function waitReady(fn) {
  const t = setInterval(() => { if (c64.basic.state === 'direct' && c64.k.inputActive) { clearInterval(t); fn(); } }, 100);
}
function downloadFile(f) {
  const blob = new Blob([f.data], { type: 'application/octet-stream' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = petToAscii(f.name).replace(/[^a-z0-9_ .-]/gi, '_') + (f.type === 'PRG' ? '.prg' : '.seq');
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
async function importFiles(list) {
  for (const file of list) {
    const buf = new Uint8Array(await file.arrayBuffer());
    const ext = file.name.split('.').pop().toLowerCase();
    const base = asciiToPet(file.name.replace(/\.[^.]+$/, '').slice(0, 16));
    if (ext === 'd64') {
      const id = 'd' + Date.now().toString(36);
      const disk = parseD64(buf, id); c64.store.save(disk); c64.drive.insert(c64.store.load(id));
    } else {
      if (!c64.drive.disk) continue;
      let data = buf, type = ext === 'seq' ? 'SEQ' : 'PRG';
      if (ext === 'bas' || ext === 'txt') data = c64.tokenizeSource(new TextDecoder().decode(buf));
      const ex = c64.drive.disk.files.findIndex(f => f.name === base);
      const entry = { name: base, type, data };
      if (ex >= 0) c64.drive.disk.files[ex] = entry; else c64.drive.disk.files.push(entry);
      c64.drive.persist();
    }
  }
  renderDisk();
  c64.foley.driveSeek(1);
}
$('fileInput').onchange = (e) => { importFiles([...e.target.files]); e.target.value = ''; };
const dz = $('dropZone');
['dragenter', 'dragover'].forEach(ev => window.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => window.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('over'); }));
window.addEventListener('drop', (e) => {
  if (!e.dataTransfer || !e.dataTransfer.files.length) return;
  togglePanel('diskPanel', true); importFiles([...e.dataTransfer.files]);
});

// ---------------------------------------------------------------- main loop
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h;
  camera.fov = w / h < 1 ? 55 : 38;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize); resize();

let last = performance.now();
let ledDrive = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (started) { pollGamepad(); feedPaste(); c64.frame(dt); }
  crt.draw(dt);
  screenTex.needsUpdate = true;
  if (flat) flatCtx.drawImage(crt.canvas, 0, 0);

  // CRT glow onto the desk and keyboard
  const [r, g, b] = crt.avg; const p = crt.power;
  screenLight.color.setRGB(0.4 + r, 0.4 + g, 0.5 + b);
  screenLight.intensity = p * (2.5 + (r + g + b) * 3);

  // key travel
  for (const k of keys.values()) {
    k.cur += (k.target - k.cur) * Math.min(1, dt * 30);
    k.mesh.position.y = k.base.y - k.cur * 0.045;
  }
  // joystick tilt
  if (joystick && joyBase) {
    const j = c64.m.joy2;
    const tx = (j & 1 ? -0.12 : 0) + (j & 2 ? 0.12 : 0), tz = (j & 4 ? 0.12 : 0) + (j & 8 ? -0.12 : 0);
    joystick.rotation.x += (joyBase.x + tx - joystick.rotation.x) * Math.min(1, dt * 18);
    joystick.rotation.z += (joyBase.z + tz - joystick.rotation.z) * Math.min(1, dt * 18);
  }
  // LEDs
  const busy = c64.drive.activity > 0;
  ledDrive += ((busy ? 1 : 0) - ledDrive) * Math.min(1, dt * 20);
  if (leds.driveBusy) { leds.driveBusy.mat.emissiveIntensity = ledDrive * 4; leds.driveBusy.light.intensity = ledDrive * 0.4; }
  if (leds.drivePower) { leds.drivePower.mat.emissiveIntensity = 2.5; leds.drivePower.light.intensity = 0.15; }
  if (leds.power) { leds.power.light.intensity = c64.powered ? 0.35 : 0; }
  document.querySelector('.led.drive').classList.toggle('lit', busy);

  if (tween) {
    tween.t = Math.min(1, tween.t + dt * 1.6);
    const e = 1 - Math.pow(1 - tween.t, 3);
    camera.position.lerpVectors(tween.from.pos, tween.to.pos, e);
    controls.target.lerpVectors(tween.from.target, tween.to.target, e);
    if (tween.t >= 1) tween = null;
  }
  controls.update();
  if (!flat) renderer.render(scene, camera);
}
requestAnimationFrame(loop);
