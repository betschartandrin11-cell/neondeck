// Game 23 – Paint Rush: Gebiete-Färben gegen Bot (60 s). Eigene Mechanik:
// Kacheln wechseln die Farbe beim Überfahren; Bot nutzt Utility-Auswahl
// (Rand-Felder mit vielen gegnerischen Nachbarn priorisiert).
import type { GameContext, GameInstance } from '../shared/types';
import { GameLoop, fitCanvas, Input } from '../shared/engine';
import { sfx } from '../shared/audio';

const COLS = 24, ROWS = 14;
// grid: 0 neutral, 1 Spieler, 2 Bot
export function create(ctx: GameContext): GameInstance {
  const canvas = document.createElement('canvas');
  ctx.container.appendChild(canvas);
  const g = canvas.getContext('2d')!;
  const unfit = fitCanvas(canvas, ctx.container);
  const input = new Input(ctx.container);

  let grid: number[][];
  let px = 2, py = 2, bx = COLS - 3, by = ROWS - 3;
  let t = 60, paused = false, over = false;
  let botT = 0, botDir = [1, 0];

  function reset() {
    grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    px = 2; py = 2; bx = COLS - 3; by = ROWS - 3; t = 60; over = false;
  }

  function paint(x: number, y: number, who: number) {
    if (x >= 0 && y >= 0 && x < COLS && y < ROWS && grid[y][x] !== who) {
      grid[y][x] = who;
    }
  }

  function count(who: number) {
    let n = 0;
    for (const row of grid) for (const c of row) if (c === who) n++;
    return n;
  }

  function botStep() {
    // Utility-Bot: prüfe 4 Richtungen, bewerte neue gegnerische/ neutrale Kacheln + Kantenbonus
    const options: Array<{ d: [number, number]; score: number }> = [];
    for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = bx + d[0], ny = by + d[1];
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      let score = grid[ny][nx] === 1 ? 3 : grid[ny][nx] === 0 ? 2 : 0.5;
      score += Math.random() * 0.8; // etwas Chaos (Profil "chaotisch")
      options.push({ d: [d[0], d[1]], score });
    }
    options.sort((a, b) => b.score - a.score);
    botDir = options[0].d;
    bx += botDir[0]; by += botDir[1];
    paint(bx, by, 2);
  }

  const loop = new GameLoop(dt => {
    if (paused || over) { draw(); return; }
    t -= dt;
    // Spieler
    if (input.up) py--; else if (input.downKey) py++;
    if (input.left) px--; else if (input.right) px++;
    px = Math.max(0, Math.min(COLS - 1, px)); py = Math.max(0, Math.min(ROWS - 1, py));
    paint(px, py, 1);
    // Bot mit Tick-Rate (fairy same speed)
    botT += dt;
    if (botT > 0.12) { botT = 0; botStep(); }
    if (t <= 0) finish();
    draw();
  });

  function finish() {
    over = true;
    const p1 = count(1), p2 = count(2);
    const won = p1 > p2;
    if (won) sfx.win(); else sfx.lose();
    const best = ctx.storage.get<number>('bestPct') ?? 0;
    const pct = Math.round(p1 / (COLS * ROWS) * 100);
    if (pct > best) ctx.storage.set('bestPct', pct);
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = `<h2>${won ? '🏆 Mehr Fläche!' : '🤖 Bot hat mehr Fläche'}</h2>
      <p>Du: ${p1} Kacheln (${pct}%) · Bot: ${p2}</p>
      <div class="row"><button class="btn primary" id="pr-re">Nochmal</button><button class="btn" id="pr-lib">Bibliothek</button></div>`;
    ctx.container.appendChild(ov);
    document.getElementById('pr-re')!.onclick = () => { ov.remove(); reset(); };
    document.getElementById('pr-lib')!.onclick = () => { location.hash = '#/'; };
  }

  function draw() {
    const w = canvas.width, h = canvas.height;
    g.fillStyle = '#0b0e1a'; g.fillRect(0, 0, w, h);
    const s = Math.min(w / COLS, h / ROWS);
    const ox = (w - COLS * s) / 2, oy = (h - ROWS * s) / 2;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      g.fillStyle = grid[r][c] === 1 ? '#00e5ff' : grid[r][c] === 2 ? '#ff3d81' : '#151b30';
      g.fillRect(ox + c * s, oy + r * s, s, s);
    }
    // Akteure
    g.fillStyle = '#ffffff';
    g.beginPath(); g.arc(ox + (px + 0.5) * s, oy + (py + 0.5) * s, s * 0.4, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#2a0d18';
    g.beginPath(); g.arc(ox + (bx + 0.5) * s, oy + (by + 0.5) * s, s * 0.4, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#e8ecf7'; g.font = '14px sans-serif';
    g.fillText(`Zeit ${Math.max(0, t).toFixed(0)}s · Du ${count(1)} · Bot ${count(2)}`, 14, 22);
  }

  reset();
  return {
    start() { loop.start(); },
    pause() { paused = true; },
    resume() { paused = false; },
    destroy() { loop.stop(); input.destroy(); unfit(); },
    getResult() { return { score: count(1), won: over && count(1) > count(2), detail: `${count(1)} Kacheln` }; },
  };
}
