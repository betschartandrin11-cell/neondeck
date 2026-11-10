// Game 2 – Gravity Flip: Platformer mit kippbarer Schwerkraft. Eigene Mechanik:
// Spieler läuft auf Boden ODER Decke; W/S kippt die Gravitation (nur wenn frei).
// 3 handgebaute Level mit Spikes und Portal.
import type { GameContext, GameInstance } from '../shared/types';
import { GameLoop, fitCanvas, Input } from '../shared/engine';
import { sfx } from '../shared/audio';

interface Level { tiles: string[]; } // X=Block ^=Spike(unten) v=Spike(oben) P=Portal S=Start
const LEVELS: Level[] = [
  { tiles: [
    'XXXXXXXXXXXXXXXXXXXXXXXXXX',
    'X........................X',
    'X....v..........^^.......X',
    'X........................X',
    'X..............XXXX......X',
    'X...XXXX.................X',
    'X..........P....v....^...X',
    'XS.......................X',
    'XXXXXXXXXXXXXXXXXXXXXXXXXX',
  ]},
  { tiles: [
    'XXXXXXXXXXXXXXXXXXXXXXXXXX',
    'X.....v..................X',
    'X..............v.....XXXXX',
    'X...XXXXX................X',
    'X........................X',
    'X....^^....XXXXX....^....X',
    'X........................X',
    'XS.........P.............X',
    'XXXXXXXXXXXXXXXXXXXXXXXXXX',
  ]},
  { tiles: [
    'XXXXXXXXXXXXXXXXXXXXXXXXXX',
    'X.v..................v...X',
    'X....XXXX....XXXX........X',
    'X....................XXXXX',
    'X...v........^^.....v....X',
    'X.....XXXXX..............X',
    'X..................P.....X',
    'XS..........^^...........X',
    'XXXXXXXXXXXXXXXXXXXXXXXXXX',
  ]},
];

export function create(ctx: GameContext): GameInstance {
  const canvas = document.createElement('canvas');
  ctx.container.appendChild(canvas);
  const g = canvas.getContext('2d')!;
  const unfit = fitCanvas(canvas, ctx.container);
  const input = new Input(ctx.container);

  let li = 0, x = 0, y = 0, vx = 0, vy = 0, grav = 1, dead = false, won = false, paused = false, t = 0;
  const TS = 48, W = 26, Hl = 9;

  function load(i: number) {
    li = i; dead = false; won = false; vy = 0; vx = 0; grav = 1; t = 0;
    const L = LEVELS[i].tiles;
    for (let r = 0; r < Hl; r++) for (let c = 0; c < W; c++) if (L[r][c] === 'S') { x = c * TS; y = r * TS; }
  }

  function tileAt(c: number, r: number): string {
    if (r < 0 || r >= Hl || c < 0 || c >= W) return 'X';
    return LEVELS[li].tiles[r][c];
  }
  function solid(c: number, r: number) { return tileAt(c, r) === 'X'; }
  function spike(c: number, r: number) { const t = tileAt(c, r); return t === '^' || t === 'v'; }

  function collides(px: number, py: number): boolean {
    for (let c = Math.floor(px / TS); c <= Math.floor((px + TS - 1) / TS); c++)
      for (let r = Math.floor(py / TS); r <= Math.floor((py + TS - 1) / TS); r++)
        if (solid(c, r)) return true;
    return false;
  }
  function onSpike(px: number, py: number): boolean {
    for (let c = Math.floor(px / TS); c <= Math.floor((px + TS - 1) / TS); c++)
      for (let r = Math.floor(py / TS); r <= Math.floor((py + TS - 1) / TS); r++)
        if (spike(c, r)) return true;
    return false;
  }

  const loop = new GameLoop(dt => {
    if (paused || dead || won) return;
    t += dt;
    const speed = 220;
    vx = (input.right ? speed : 0) - (input.left ? speed : 0);
    if (input.up && grav === 1 && canFlip()) { grav = -1; sfx.jump(); }
    if (input.downKey && grav === -1 && canFlip()) { grav = 1; sfx.jump(); }

    // Horizontal
    let nx = x + vx * dt;
    if (!collides(nx, y)) x = nx;
    // Vertikal mit Gravitationsrichtung
    vy += 1300 * grav * dt;
    let ny = y + vy * dt;
    if (!collides(x, ny)) y = ny;
    else {
      // auf Oberfläche landen
      vy = 0;
      ny = y;
      while (!collides(x, ny + grav)) ny += grav;
      y = ny;
    }
    if (onSpike(x, y)) { dead = true; sfx.lose(); showEnd('💥 Erwischt', 'Die Spikes waren schneller. Nochmal?'); return; }

    // Portal
    const L = LEVELS[li].tiles;
    for (let r = 0; r < Hl; r++) for (let c = 0; c < W; c++) {
      if (L[r][c] === 'P' && Math.abs(c * TS - x) < TS && Math.abs(r * TS - y) < TS) {
        if (li + 1 < LEVELS.length) { load(li + 1); sfx.win(); }
        else { won = true; sfx.win(); showEnd('🏆 Geschafft!', `Alle Level in ${t.toFixed(1)} s`); }
      }
    }
    draw();
  });

  function canFlip(): boolean {
    // Kippen nur, wenn der Platz in der neuen Gravitationsrichtung frei ist
    return grav === 1 ? !collides(x, y - TS) : !collides(x, y + TS);
  }

  function showEnd(title: string, sub: string) {
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = `<h2>${title}</h2><p>${sub}</p>
      <div class="row"><button class="btn primary" id="gf-re">Nochmal</button>
      <button class="btn" id="gf-lib">Bibliothek</button></div>`;
    ctx.container.appendChild(ov);
    const best = ctx.storage.get<number>('bestTime');
    if (won && (!best || t < best)) ctx.storage.set('bestTime', t);
    document.getElementById('gf-re')!.onclick = () => { ov.remove(); load(li); loop.start(); };
    document.getElementById('gf-lib')!.onclick = () => { location.hash = '#/'; };
  }

  function draw() {
    const w = canvas.width, h = canvas.height;
    g.fillStyle = '#0b0e1a'; g.fillRect(0, 0, w, h);
    const s = Math.min(w / (W * TS), h / (Hl * TS));
    const ox = (w - W * TS * s) / 2, oy = (h - Hl * TS * s) / 2;
    const L = LEVELS[li].tiles;
    for (let r = 0; r < Hl; r++) for (let c = 0; c < W; c++) {
      const t = L[r][c];
      const px = ox + c * TS * s, py = oy + r * TS * s;
      if (t === 'X') { g.fillStyle = '#263253'; g.fillRect(px, py, TS * s, TS * s); }
      else if (t === '^' || t === 'v') {
        g.fillStyle = '#ff3d81'; g.beginPath();
        const up = t === '^';
        g.moveTo(px, py + (up ? TS * s : 0)); g.lineTo(px + TS * s, py + (up ? TS * s : 0));
        g.lineTo(px + TS * s / 2, py + (up ? 0 : TS * s)); g.fill();
      } else if (t === 'P') {
        g.fillStyle = '#3ddc84'; g.beginPath(); g.arc(px + TS * s / 2, py + TS * s / 2, TS * s * 0.35, 0, Math.PI * 2); g.fill();
      }
    }
    g.fillStyle = '#00e5ff';
    g.fillRect(ox + x * s, oy + y * s, TS * s, TS * s);
    g.fillStyle = '#8b96b5'; g.font = `${14 * s}px sans-serif`;
    g.fillText(`Level ${li + 1}/${LEVELS.length}  ·  W/S: Gravitation kippen  ·  ←/→: laufen`, 10, 20 * s);
  }

  load(0);
  return {
    start() { loop.start(); },
    pause() { paused = true; },
    resume() { paused = false; },
    destroy() { loop.stop(); input.destroy(); unfit(); },
    getResult() { return { score: li + 1, won, detail: `Level ${li + 1}` }; },
  };
}
