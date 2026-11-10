// Game 5 – Laser Maze: Reflexions-Puzzle. Eigene Mechanik: Laser strahlt in eine
// Richtung, Diagonal-Spiegelfelder drehen ihn um 90°. Ziel-Feld muss getroffen
// werden. 4 handgebaute Level, Reset-Button, kein Zeitdruck (Denkaufgabe).
import type { GameContext, GameInstance } from '../shared/types';
import { fitCanvas } from '../shared/engine';
import { sfx } from '../shared/audio';

// Spiegel: '/' und '\\' lenken den Laser um. > = Emitter, O = Ziel, # = Wand
const LEVELS: string[][] = [
  [
    '..........',
    '.>../....O.',
    '..........',
    '.#........',
    '..........',
  ],
  [
    '..........',
    '.>........',
    '....#.....',
    './..\\..O..',
    '..........',
  ],
  [
    '..........',
    '.>.../....',
    '....#.....',
    '.\\.../....',
    '.....O....',
  ],
  [
    '..........',
    '.>../#....',
    '...../....',
    './.\\./....',
    '....O.....',
  ],
];

export function create(ctx: GameContext): GameInstance {
  const canvas = document.createElement('canvas');
  ctx.container.appendChild(canvas);
  const g = canvas.getContext('2d')!;
  const unfit = fitCanvas(canvas, ctx.container);

  let li = 0;
  let mirrors: string[][] = []; // veränderbare Spiegel-Zellen (Drehung '/' <-> '\\')

  function load(i: number) {
    li = i;
    mirrors = LEVELS[i].map(r => r.split(''));
  }

  function laserPath(): Array<{ x: number; y: number }> {
    // Simuliere Strahl bis Ziel/Wand/Exit; Spiegel drehen um 90°
    const L = mirrors;
    let x = -1, y = -1, dir = [1, 0];
    for (let r = 0; r < L.length; r++) for (let c = 0; c < L[r].length; c++) if (L[r][c] === '>') { x = c; y = r; }
    const path = [{ x, y }];
    let steps = 0;
    while (steps++ < 200) {
      const nx = x + dir[0], ny = y + dir[1];
      if (nx < 0 || ny < 0 || ny >= L.length || nx >= L[0].length) break;
      const t = L[ny][nx];
      path.push({ x: nx, y: ny });
      if (t === '#') break;
      if (t === 'O') break; // Ziel getroffen
      if (t === '/') { dir = [-dir[1], -dir[0]]; x = nx; y = ny; continue; }
      if (t === '\\') { dir = [dir[1], dir[0]]; x = nx; y = ny; continue; }
      x = nx; y = ny;
    }
    return path;
  }

  function targetHit(): boolean {
    const p = laserPath();
    const last = p[p.length - 1];
    return last && mirrors[last.y][last.x] === 'O';
  }

  function click(cel: { x: number; y: number }) {
    const t = mirrors[cel.y]?.[cel.x];
    if (t === '/') { mirrors[cel.y][cel.x] = '\\'; sfx.click(); }
    else if (t === '\\') { mirrors[cel.y][cel.x] = '/'; sfx.click(); }
    if (targetHit()) {
      sfx.win();
      const done = li + 1 >= LEVELS.length;
      const best = ctx.storage.get<number>('solved') ?? 0;
      if (li + 1 > best) ctx.storage.set('solved', li + 1);
      const ov = document.createElement('div');
      ov.className = 'overlay';
      ov.innerHTML = done
        ? `<h2>🏆 Alle Level gelöst!</h2><p>Stark — alle ${LEVELS.length} Laser-Mazes geschafft.</p>
           <div class="row"><button class="btn primary" id="lm-re">Von vorn</button><button class="btn" id="lm-lib">Bibliothek</button></div>`
        : `<h2>✓ Level ${li + 1} gelöst!</h2><div class="row"><button class="btn primary" id="lm-next">Weiter</button></div>`;
      ctx.container.appendChild(ov);
      const go = (fn: () => void) => { ov.remove(); fn(); draw(); };
      if (done) {
        document.getElementById('lm-re')!.onclick = () => go(() => load(0));
        document.getElementById('lm-lib')!.onclick = () => { location.hash = '#/'; };
      } else document.getElementById('lm-next')!.onclick = () => go(() => load(li + 1));
    } else draw();
  }

  function draw() {
    const w = canvas.width, h = canvas.height;
    g.fillStyle = '#0b0e1a'; g.fillRect(0, 0, w, h);
    const L = mirrors;
    const cols = L[0].length, rows = L.length;
    const s = Math.min(w / (cols + 1), h / (rows + 1));
    const ox = (w - cols * s) / 2, oy = (h - rows * s) / 2;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const t = L[r][c], px = ox + c * s, py = oy + r * s;
      g.strokeStyle = '#1f2947';
      g.strokeRect(px, py, s, s);
      if (t === '#') { g.fillStyle = '#3a4769'; g.fillRect(px + 2, py + 2, s - 4, s - 4); }
      if (t === '>') { g.fillStyle = '#ffb454'; g.beginPath(); g.arc(px + s / 2, py + s / 2, s * 0.3, 0, Math.PI * 2); g.fill(); }
      if (t === 'O') { g.strokeStyle = '#3ddc84'; g.lineWidth = 3; g.beginPath(); g.arc(px + s / 2, py + s / 2, s * 0.3, 0, Math.PI * 2); g.stroke(); g.lineWidth = 1; }
      if (t === '/' || t === '\\') {
        g.strokeStyle = '#00e5ff'; g.lineWidth = 3; g.beginPath();
        if (t === '/') { g.moveTo(px + s * 0.2, py + s * 0.8); g.lineTo(px + s * 0.8, py + s * 0.2); }
        else { g.moveTo(px + s * 0.2, py + s * 0.2); g.lineTo(px + s * 0.8, py + s * 0.8); }
        g.stroke(); g.lineWidth = 1;
      }
    }
    // Laser-Strahl
    const p = laserPath();
    g.strokeStyle = targetHit() ? '#3ddc84' : '#ff3d81';
    g.lineWidth = 3; g.beginPath();
    p.forEach((pt, i) => {
      const px = ox + (pt.x + 0.5) * s, py = oy + (pt.y + 0.5) * s;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    });
    g.stroke(); g.lineWidth = 1;
  }

  const onClick = (e: MouseEvent) => {
    const r = canvas.getBoundingClientRect();
    const cols = mirrors[0].length, rows = mirrors.length;
    const s = Math.min(r.width / (cols + 1), r.height / (rows + 1));
    const ox = (r.width - cols * s) / 2, oy = (r.height - rows * s) / 2;
    const c = Math.floor((e.clientX - r.left - ox) / s), y = Math.floor((e.clientY - r.top - oy) / s);
    if (c >= 0 && y >= 0 && y < rows && c < cols) click({ x: c, y });
  };
  canvas.addEventListener('click', onClick);

  load(0);
  draw();
  return {
    start() { draw(); },
    pause() { /* Denkaufgabe: keine laufende Simulation */ },
    resume() { draw(); },
    destroy() { canvas.removeEventListener('click', onClick); unfit(); },
    getResult() { return { score: li + 1, won: li + 1 >= LEVELS.length, detail: `Level ${li + 1}/${LEVELS.length}` }; },
  };
}
