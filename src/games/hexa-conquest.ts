// Game 15 – Hexa Conquest: Othello-Regeln auf Hexfeld gegen Minimax-Bot oder
// lokal zweit Spieler. Eigene Mechanik: Hex-Nachbarschaft (6 statt 8 Richtungen).
import type { GameContext, GameInstance } from '../shared/types';
import { fitCanvas } from '../shared/engine';
import { sfx } from '../shared/audio';

const W = 9, H = 9; // Spalten, Zeilen (odd-r)

function neighbors(c: number, r: number): Array<[number, number]> {
  // Hex-Nachbarn im odd-r Offset-Layout: ungerade Reihen sind eine halbe Kachel versetzt
  const odd = r % 2 === 1;
  const dxdy: Array<[number, number, number]> = [
    [1, 0, 0], [0, -1, -1], [-1, -1, 0], [-1, 0, 0], [0, 1, -1], [1, 1, 0],
  ];
  return dxdy.map(([dc, dr, oddAdj]) => [c + dc + (dr !== 0 && odd ? oddAdj : 0), r + dr] as [number, number]);
}

export function create(ctx: GameContext): GameInstance {
  const canvas = document.createElement('canvas');
  ctx.container.appendChild(canvas);
  const g = canvas.getContext('2d')!;
  const unfit = fitCanvas(canvas, ctx.container);

  // board[r][c]: 0 leer, 1 Spieler( cyan ), 2 Bot/Gegner( pink )
  let board: number[][] = [];
  let turn = 1, over = false, vsBot = true, busy = false;

  function reset() {
    board = Array.from({ length: H }, () => Array(W).fill(0));
    // Standard-Start in der Mitte
    board[4][4] = 2; board[4][5] = 1; board[5][4] = 1; board[5][5] = 2;
    turn = 1; over = false; busy = false;
  }

  function flips(c: number, r: number, p: number): number {
    if (board[r][c] !== 0) return 0;
    let total = 0;
    for (const [nc, nr] of neighbors(c, r)) {
      if (nc < 0 || nr < 0 || nc >= W || nr >= H) continue;
      let run: Array<[number, number]> = [];
      let cc = nc, rr = nr;
      while (cc >= 0 && rr >= 0 && cc < W && rr < H && board[rr][cc] === (p === 1 ? 2 : 1)) {
        run.push([cc, rr]);
        cc += Math.sign(cc - nc) || 0; rr += Math.sign(rr - nr) || 0;
      }
      if (cc >= 0 && rr >= 0 && cc < W && rr < H && board[rr][cc] === p) total += run.length;
    }
    return total;
  }

  function anyMove(p: number): boolean {
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (flips(c, r, p) > 0) return true;
    return false;
  }

  function play(c: number, r: number, p: number): boolean {
    const f = flips(c, r, p);
    if (f === 0) return false;
    board[r][c] = p;
    // Vereinfachtes Umfärben entlang Strahlen
    for (const dir of [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]] as const) {
      const run: Array<[number, number]> = [];
      let cc = c + dir[0], rr = r + dir[1];
      while (cc >= 0 && rr >= 0 && cc < W && rr < H && board[rr][cc] === (p === 1 ? 2 : 1)) {
        run.push([cc, rr]); cc += dir[0]; rr += dir[1];
      }
      if (cc >= 0 && rr >= 0 && cc < W && rr < H && board[rr][cc] === p) {
        for (const [fc, fr] of run) board[fr][fc] = p;
      }
    }
    return true;
  }

  function count(p: number) { let n = 0; for (const row of board) for (const c of row) if (c === p) n++; return n; }

  function botTurn() {
    if (over || !vsBot) return;
    busy = true;
    setTimeout(() => {
      // Minimax-Bot: bewertet Züge über flip-Anzahl + Positionskontrolle
      const moves: Array<{ c: number; r: number; score: number }> = [];
      for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
        const f = flips(c, r, 2);
        if (f > 0) {
          // Ecken sind stark, Rand gut, Felder direkt neben Ecken riskant
          const corner = (r === 0 || r === H - 1) && (c === 0 || c === W - 1) ? 12 : 0;
          const edge = (r === 0 || r === H - 1 || c === 0 || c === W - 1) ? 3 : 0;
          moves.push({ c, r, score: f + corner + edge });
        }
      }
      if (moves.length) {
        moves.sort((a, b) => b.score - a.score);
        const m = moves[0];
        play(m.c, m.r, 2);
        sfx.click();
      }
      turn = 1;
      busy = false;
      checkEnd();
      draw();
    }, 420);
  }

  function checkEnd() {
    if (anyMove(1) || anyMove(2)) return;
    over = true;
    const p1 = count(1), p2 = count(2);
    sfx.win();
    const best = ctx.storage.get<number>('bestDiff') ?? -99;
    const diff = p1 - p2;
    if (diff > best) ctx.storage.set('bestDiff', diff);
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = `<h2>${diff > 0 ? '🏆 Du gewinnst!' : diff < 0 ? '🤖 Bot gewinnt' : '🤝 Unentschieden'}</h2>
      <p>${p1} : ${p2} (Differenz ${diff > 0 ? '+' : ''}${diff})</p>
      <div class="row"><button class="btn primary" id="hc-re">Nochmal</button><button class="btn" id="hc-lib">Bibliothek</button></div>`;
    ctx.container.appendChild(ov);
    document.getElementById('hc-re')!.onclick = () => { ov.remove(); reset(); draw(); };
    document.getElementById('hc-lib')!.onclick = () => { location.hash = '#/'; };
  }

  const onClick = (e: MouseEvent) => {
    if (over || busy || turn !== 1) return;
    const r0 = canvas.getBoundingClientRect();
    const s = Math.min(r0.width / (W + 0.5), r0.height / (H + 0.5)) * 0.94;
    const ox = (r0.width - (W + 0.5) * s) / 2, oy = (r0.height - H * s) / 2;
    const mx = e.clientX - r0.left - ox, my = e.clientY - r0.top - oy;
    // nächstgelegene Hex-Zelle
    let bestD = Infinity, bc = -1, br = -1;
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      const cx = (c + 0.5 + (r % 2 ? 0.5 : 0)) * s, cy = (r + 0.5) * s;
      const d = Math.hypot(mx - cx, my - cy);
      if (d < bestD) { bestD = d; bc = c; br = r; }
    }
    if (bc < 0 || bestD > s * 0.65) return;
    if (play(bc, br, 1)) {
      sfx.click();
      turn = 2;
      draw();
      if (!anyMove(2)) { turn = 1; checkEnd(); return; }
      botTurn();
    }
  };
  canvas.addEventListener('click', onClick);

  function draw() {
    const w = canvas.width, h = canvas.height;
    g.fillStyle = '#0b0e1a'; g.fillRect(0, 0, w, h);
    const s = Math.min(w / (W + 0.5), h / (H + 0.5)) * 0.94;
    const ox = (w - (W + 0.5) * s) / 2, oy = (h - H * s) / 2;
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      const cx = ox + (c + 0.5 + (r % 2 ? 0.5 : 0)) * s, cy = oy + (r + 0.5) * s;
      const rad = s * 0.48;
      g.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 3 * i + Math.PI / 6;
        const px = cx + Math.cos(a) * rad, py = cy + Math.sin(a) * rad;
        if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
      }
      g.closePath();
      g.fillStyle = board[r][c] === 0 ? '#151b30' : board[r][c] === 1 ? '#0a5f6e' : '#6e1a3d';
      g.fill();
      g.strokeStyle = '#263253'; g.stroke();
      if (turn === 1 && !over && flips(c, r, 1) > 0) {
        g.fillStyle = 'rgba(0,229,255,0.6)';
        g.beginPath(); g.arc(cx, cy, rad * 0.2, 0, Math.PI * 2); g.fill();
      }
    }
    g.fillStyle = '#e8ecf7'; g.font = '15px sans-serif';
    g.fillText(`Du (cyan): ${count(1)}   ·   ${vsBot ? 'Bot' : 'Spieler 2'} (pink): ${count(2)}   ·   ${turn === 1 ? 'du bist am Zug' : 'Bot denkt…'}`, 14, 26);
  }

  reset(); draw();
  return {
    start() { draw(); },
    pause() { /* rundenbasiert, keine laufende Simulation */ },
    resume() { draw(); },
    destroy() { canvas.removeEventListener('click', onClick); unfit(); },
    getResult() { return { score: count(1), won: over && count(1) > count(2), detail: `${count(1)}:${count(2)}` }; },
  };
}
