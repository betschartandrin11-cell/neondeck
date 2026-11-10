// Game 24 – Bomb Bots: Bomberman-Mechanik auf eigenem Grid. Bots nutzen A*-
// Pfadsuche zu Power-ups/Spielern UND Fluchtlogik vor Bombenfeldern (kein Zufall).
import type { GameContext, GameInstance } from '../shared/types';
import { GameLoop, fitCanvas, Input, randInt } from '../shared/engine';
import { sfx } from '../shared/audio';
import { astar } from '../bot/core';

const COLS = 15, ROWS = 13;
// 0 frei, 1 unzerstörbar, 2 weich (sprengbar)
function genMap(): number[][] {
  const m = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (r === 0 || c === 0 || r === ROWS - 1 || c === COLS - 1) m[r][c] = 1;
    else if (r % 2 === 0 && c % 2 === 0) m[r][c] = 1;
    else if (Math.random() < 0.28) m[r][c] = 2;
  }
  // Spawn frei halten
  for (const [r, c] of [[1, 1], [1, 2], [2, 1], [ROWS - 2, COLS - 2], [ROWS - 2, COLS - 3], [ROWS - 3, COLS - 2]]) m[r][c] = 0;
  return m;
}

interface Bomb { r: number; c: number; t: number; range: number; owner: number; }
interface Pu { r: number; c: number; kind: 'range' | 'count'; }
interface Actor { r: number; c: number; x: number; y: number; alive: boolean; isBot: boolean; color: string; bombs: number; range: number; moveT: number; path: Array<[number, number]>; }

export function create(ctx: GameContext): GameInstance {
  const canvas = document.createElement('canvas');
  ctx.container.appendChild(canvas);
  const g = canvas.getContext('2d')!;
  const unfit = fitCanvas(canvas, ctx.container);
  const input = new Input(ctx.container);

  let map = genMap();
  let bombs: Bomb[] = [];
  let pus: Pu[] = [];
  let me: Actor, bots: Actor[] = [];
  let paused = false, over = false;
  let anim = 0;

  function reset() {
    map = genMap(); bombs = []; pus = [];
    me = { r: 1, c: 1, x: 1, y: 1, alive: true, isBot: false, color: '#00e5ff', bombs: 1, range: 2, moveT: 0, path: [] };
    bots = [1, 2].map(i => ({
      r: ROWS - 2, c: COLS - 2 - i, x: COLS - 2 - i, y: ROWS - 2, alive: true,
      isBot: true, color: i === 1 ? '#ff3d81' : '#ffb454', bombs: 1, range: 2, moveT: 0, path: [],
    }));
    over = false;
  }

  function blocked(r: number, c: number, forBot: Actor | null): boolean {
    if (map[r]?.[c] === 1 || map[r]?.[c] === 2) return true;
    if (bombs.some(b => b.r === r && b.c === c && !(forBot && forBot.r === r && forBot.c === c))) return true;
    return false;
  }

  function dangerAt(r: number, c: number): boolean {
    for (const b of bombs) {
      if (b.r === r && b.c === c) return true;
      for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as const) {
        for (let i = 1; i <= b.range; i++) {
          const rr = b.r + dr * i, cc = b.c + dc * i;
          if (map[rr]?.[cc] === 1) break;
          if (rr === r && cc === c) return true;
          if (map[rr]?.[cc] === 2) break;
        }
      }
    }
    return false;
  }

  function explode(b: Bomb) {
    sfx.hit();
    const cells: Array<[number, number]> = [[b.r, b.c]];
    for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as const) {
      for (let i = 1; i <= b.range; i++) {
        const rr = b.r + dr * i, cc = b.c + dc * i;
        if (map[rr]?.[cc] === 1) break;
        cells.push([rr, cc]);
        if (map[rr]?.[cc] === 2) {
          map[rr][cc] = 0;
          if (Math.random() < 0.35) pus.push({ r: rr, c: cc, kind: Math.random() < 0.5 ? 'range' : 'count' });
          break;
        }
      }
    }
    for (const a of [me, ...bots]) {
      if (a.alive && cells.some(([rr, cc]) => a.r === rr && a.c === cc)) {
        a.alive = false;
      }
    }
  }

  function botAct(b: Actor, dt: number) {
    if (!b.alive) return;
    b.moveT -= dt;
    if (b.moveT > 0) return;
    // 1. Gefahr? → fliehen (sicherste erreichbare Zelle via A*)
    if (dangerAt(b.r, b.c)) {
      let best: Array<[number, number]> | null = null;
      for (let r = 1; r < ROWS - 1; r++) for (let c = 1; c < COLS - 1; c++) {
        if (!dangerAt(r, c) && !blocked(r, c, b)) {
          const p = astar({ w: COLS, h: ROWS, blocked: (x, y) => blocked(y, x, b) }, b.c, b.r, c, r);
          if (p && (!best || p.length < best.length)) best = p;
        }
      }
      b.path = best ?? [];
    } else if (b.path.length === 0) {
      // 2. Power-up suchen oder Spieler jagen
      const targets: Array<[number, number]> = [];
      for (const p of pus) targets.push([p.c, p.r]);
      if (me.alive) targets.push([me.c, me.r]);
      if (targets.length) {
        const t = targets[randInt(targets.length)];
        b.path = astar({ w: COLS, h: ROWS, blocked: (x, y) => blocked(y, x, b) }, b.c, b.r, t[0], t[1]) ?? [];
      }
      // 3. Nah am Spieler + Bombe parat → legen
      if (me.alive && Math.abs(me.c - b.c) + Math.abs(me.r - b.r) <= 3 && b.bombs > 0 && !b.path.some(p => dangerAt(p[1], p[0]))) {
        bombs.push({ r: b.r, c: b.c, t: 2.2, range: b.range, owner: 1 });
        b.bombs--;
      }
    }
    if (b.path.length) {
      const [nc, nr] = b.path.shift()!;
      if (!blocked(nr, nc, b)) { b.c = nc; b.r = nr; }
      b.moveT = 0.22;
    }
  }

  const loop = new GameLoop(dt => {
    if (paused || over) { draw(); return; }
    anim += dt;
    // Spieler-Bewegung
    if (me.alive) {
      let dr = 0, dc = 0;
      if (input.up) dr = -1; else if (input.downKey) dr = 1;
      if (input.left) dc = -1; else if (input.right) dc = 1;
      if ((dr || dc) && !blocked(me.r + dr, me.c + dc, me)) { me.r += dr; me.c += dc; }
      if (input.consumeAction()) {
        if (me.bombs > 0 && !bombs.some(b => b.r === me.r && b.c === me.c)) {
          bombs.push({ r: me.r, c: me.c, t: 2.2, range: me.range, owner: 0 });
          me.bombs--; sfx.click();
        }
      }
    }
    for (const b of bots) botAct(b, dt);
    // Bomben ticken
    for (const b of bombs) b.t -= dt;
    const boom = bombs.filter(b => b.t <= 0);
    bombs = bombs.filter(b => b.t > 0);
    for (const b of boom) explode(b);
    for (const a of [me, ...bots]) if (a.alive && !a.isBot) a.bombs = Math.min(5, a.bombs + 0); // Aufladung unten
    // Bomben-Reload alle 3s
    if (me.alive) me.bombs = Math.min(3, me.bombs + (anim % 3 < dt ? 1 : 0));
    for (const b of bots) if (b.alive) b.bombs = Math.min(2, b.bombs + (anim % 4 < dt ? 1 : 0));
    // Power-ups
    for (const a of [me, ...bots]) {
      if (!a.alive) continue;
      const i = pus.findIndex(p => p.r === a.r && p.c === a.c);
      if (i >= 0) {
        const p = pus[i]; pus.splice(i, 1);
        if (p.kind === 'range') a.range++; else a.bombs++;
        if (!a.isBot) sfx.pickup();
      }
    }
    // Ende?
    if (!me.alive && !over) end(false);
    else if (bots.every(b => !b.alive) && !over) end(true);
    draw();
  });

  function end(won: boolean) {
    over = true;
    const wins = (ctx.storage.get<number>('wins') ?? 0) + (won ? 1 : 0);
    ctx.storage.set('wins', wins);
    if (won) sfx.win(); else sfx.lose();
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = `<h2>${won ? '🏆 Alle Bots ausgeschaltet!' : '💥 Erwischt'}</h2>
      <p>Siege insgesamt: <b>${wins}</b></p>
      <div class="row"><button class="btn primary" id="bb-re">Nochmal</button><button class="btn" id="bb-lib">Bibliothek</button></div>`;
    ctx.container.appendChild(ov);
    document.getElementById('bb-re')!.onclick = () => { ov.remove(); reset(); };
    document.getElementById('bb-lib')!.onclick = () => { location.hash = '#/'; };
  }

  function draw() {
    const w = canvas.width, h = canvas.height;
    g.fillStyle = '#0b0e1a'; g.fillRect(0, 0, w, h);
    const s = Math.min(w / COLS, h / ROWS);
    const ox = (w - COLS * s) / 2, oy = (h - ROWS * s) / 2;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const px = ox + c * s, py = oy + r * s;
      const t = map[r][c];
      g.fillStyle = t === 1 ? '#2a3554' : t === 2 ? '#3d4a75' : '#111731';
      g.fillRect(px, py, s, s);
      if (t === 1) { g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(px + s * 0.15, py + s * 0.15, s * 0.7, s * 0.7); }
    }
    // Power-ups
    for (const p of pus) {
      g.fillStyle = p.kind === 'range' ? '#ffb454' : '#3ddc84';
      g.fillRect(ox + p.c * s + s * 0.25, oy + p.r * s + s * 0.25, s * 0.5, s * 0.5);
    }
    // Bomben
    for (const b of bombs) {
      g.fillStyle = '#111'; g.beginPath();
      g.arc(ox + (b.c + 0.5) * s, oy + (b.r + 0.5) * s, s * 0.3 * (1 + 0.1 * Math.sin(anim * 8)), 0, Math.PI * 2); g.fill();
    }
    // Akteure
    for (const a of [me, ...bots]) {
      if (!a.alive) continue;
      g.fillStyle = a.color;
      g.beginPath();
      g.arc(ox + (a.c + 0.5) * s, oy + (a.r + 0.5) * s, s * 0.32, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = '#e8ecf7'; g.font = '14px sans-serif';
    g.fillText(`Bomben: ${me.bombs} · Reichweite: ${me.range} · Leertaste: Bombe legen`, 14, 22);
  }

  reset();
  return {
    start() { loop.start(); },
    pause() { paused = true; },
    resume() { paused = false; },
    destroy() { loop.stop(); input.destroy(); unfit(); },
    getResult() { return { score: bots.filter(b => !b.alive).length * 100, won: over && me.alive, detail: me.alive ? 'Sieg' : 'Niederlage' }; },
  };
}
