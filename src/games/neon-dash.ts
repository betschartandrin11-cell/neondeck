// Game 1 – Neon Dash: 2D-Endlosrunner. Eigenständige Mechanik: Sprung + Doppel-
// sprung mit kurzer Schwebe, Hindernis-Cluster in Boden-/Lufthöhe, Stern-Sammlung,
// stetig steigendes Tempo. Bestwert lokal gespeichert.
import type { GameContext, GameInstance } from '../shared/types';
import { GameLoop, fitCanvas, Input, clamp } from '../shared/engine';
import { sfx } from '../shared/audio';

export function create(ctx: GameContext): GameInstance {
  const canvas = document.createElement('canvas');
  ctx.container.appendChild(canvas);
  const g = canvas.getContext('2d')!;
  const unfit = fitCanvas(canvas, ctx.container);
  const input = new Input(ctx.container);

  interface Obs { x: number; y: number; w: number; h: number; }
  interface Star { x: number; y: number; taken: boolean; }
  let dist = 0, stars = 0, speed = 320, dead = false, paused = false;
  let py = 0, vy = 0, jumps = 0;   // py: Höhe über Boden (px, nach oben positiv)
  const H = 200;                    // Spielfeldhöhe in logischen Einheiten
  let obstacles: Obs[] = [];
  let starList: Star[] = [];
  let spawnT = 0;

  function reset() {
    dist = 0; stars = 0; speed = 320; dead = false;
    py = 0; vy = 0; jumps = 0; obstacles = []; starList = []; spawnT = 0;
  }

  function spawn() {
    const ground = Math.random() < 0.7;
    const w = 26 + Math.random() * 40;
    if (ground) obstacles.push({ x: 900, y: 0, w, h: 26 + Math.random() * 30 });
    else obstacles.push({ x: 900, y: 70 + Math.random() * 40, w, h: 24 }); // Luft-Hindernis
    if (Math.random() < 0.6) starList.push({ x: 960 + Math.random() * 120, y: 40 + Math.random() * 80, taken: false });
  }

  const loop = new GameLoop(dt => {
    if (dead || paused) return;
    speed += dt * 7;                                   // Progression
    dist += speed * dt;
    spawnT -= dt;
    if (spawnT <= 0) { spawn(); spawnT = clamp(1.4 - speed / 2000, 0.55, 1.4); }

    // Sprung-Physik (Doppelsprung erlaubt)
    if (input.consumeAction() && jumps < 2) { vy = jumps === 0 ? 560 : 480; jumps++; sfx.jump(); }
    vy -= 1600 * dt;
    py += vy * dt;
    if (py <= 0) { py = 0; vy = 0; jumps = 0; }

    const px = 120;
    for (const o of obstacles) {
      o.x -= speed * dt;
      // Kollision (Spieler ~ 26×36)
      if (o.x < px + 24 && o.x + o.w > px && py < o.y + o.h && py + 36 > o.y) {
        dead = true; sfx.lose(); end();
      }
    }
    obstacles = obstacles.filter(o => o.x > -80);
    for (const s of starList) {
      s.x -= speed * dt;
      if (!s.taken && Math.abs(s.x - px) < 30 && Math.abs(s.y - (py + 18)) < 34) { s.taken = true; stars++; sfx.pickup(); }
    }
    starList = starList.filter(s => s.x > -40 && !s.taken || s.x > -40);

    draw();
  });

  function draw() {
    const w = canvas.width, h = canvas.height;
    const s = h / H; // Skalierung auf logische Einheiten
    g.fillStyle = '#0b0e1a';
    g.fillRect(0, 0, w, h);
    // Neon-Boden
    g.fillStyle = '#00e5ff';
    g.fillRect(0, h - 30 * s - 4, w, 3);
    // Parallax-Streifen
    g.fillStyle = 'rgba(0,229,255,0.08)';
    for (let i = 0; i < 6; i++) g.fillRect(((i * 260 - dist * 0.3) % (w + 260) + w + 260) % (w + 260) - 130, h * 0.25, 80, 3);
    // Spieler
    g.fillStyle = '#ff3d81';
    g.fillRect(120 * (w / 900), h - 30 * s - (py + 36) * s, 24 * s, 36 * s);
    // Hindernisse + Sterne
    g.fillStyle = '#ffb454';
    for (const o of obstacles) g.fillRect(o.x * (w / 900), h - 30 * s - (o.y + o.h) * s, o.w * s, o.h * s);
    g.fillStyle = '#ffe066';
    for (const st of starList) { g.beginPath(); g.arc(st.x * (w / 900), h - 30 * s - st.y * s, 7 * s, 0, Math.PI * 2); g.fill(); }
    // HUD
    g.fillStyle = '#e8ecf7';
    g.font = `${16 * s}px sans-serif`;
    g.fillText(`${Math.floor(dist)} m  ·  ⭐ ${stars}`, 16, 28 * s);
  }

  function end() {
    const best = ctx.storage.get<number>('best') ?? 0;
    const total = Math.floor(dist) + stars * 10;
    if (total > best) ctx.storage.set('best', total);
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = `<h2>💥 Game Over</h2>
      <p>Distanz: <b>${Math.floor(dist)} m</b> · Sterne: <b>${stars}</b> · Punkte: <b>${total}</b> (Rekord: ${Math.max(best, total)})</p>
      <div class="row"><button class="btn primary" id="nd-restart">Nochmal</button>
      <button class="btn" id="nd-lib">Zur Bibliothek</button></div>`;
    ctx.container.appendChild(ov);
    document.getElementById('nd-restart')!.onclick = () => { ov.remove(); reset(); loop.start(); };
    document.getElementById('nd-lib')!.onclick = () => { location.hash = '#/'; };
  }

  return {
    start() { loop.start(); },
    pause() { paused = true; },
    resume() { paused = false; },
    destroy() { loop.stop(); input.destroy(); unfit(); },
    getResult() { return { score: Math.floor(dist) + stars * 10, won: false, detail: `${Math.floor(dist)} m` }; },
  };
}
