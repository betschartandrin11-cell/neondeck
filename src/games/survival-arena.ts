// Game 10 – Survival Arena: Twin-Stick-Survival. Wellen von Gegnern, nach jeder
// Welle 1 von 3 Upgrades (Feuerrate, Schaden, Tempo, HP). Maus zielt, Klick schießt.
import type { GameContext, GameInstance } from '../shared/types';
import { GameLoop, fitCanvas, Input, clamp, dist, randInt } from '../shared/engine';
import { sfx } from '../shared/audio';

interface Enemy { x: number; y: number; hp: number; speed: number; r: number; }
interface Bullet { x: number; y: number; vx: number; vy: number; life: number; }

export function create(ctx: GameContext): GameInstance {
  const canvas = document.createElement('canvas');
  ctx.container.appendChild(canvas);
  const g = canvas.getContext('2d')!;
  const unfit = fitCanvas(canvas, ctx.container);
  const input = new Input(ctx.container);

  let px = 200, py = 200, hp = 100, maxHp = 100;
  let wave = 0, kills = 0;
  let fireRate = 3, damage = 25, moveSpeed = 200;
  let fireCd = 0;
  let enemies: Enemy[] = [];
  let bullets: Bullet[] = [];
  let spawnQueue = 0, spawnT = 0;
  let paused = false, over = false, choosing = false;
  const mouse = { x: 0, y: 0, down: false };

  function onMouse(e: MouseEvent) {
    const r = canvas.getBoundingClientRect();
    mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top;
  }
  canvas.addEventListener('mousemove', onMouse);
  canvas.addEventListener('mousedown', () => { mouse.down = true; });
  window.addEventListener('mouseup', () => { mouse.down = false; });

  function startWave() {
    wave++;
    spawnQueue = 4 + wave * 2;
    spawnT = 0;
    choosing = false;
  }

  function spawnEnemy() {
    const edge = randInt(4);
    const w = canvas.width, h = canvas.height;
    const x = edge === 0 ? -20 : edge === 1 ? w + 20 : Math.random() * w;
    const y = edge === 2 ? -20 : edge === 3 ? h + 20 : Math.random() * h;
    const speed = 60 + wave * 8 + Math.random() * 30;
    enemies.push({ x, y, hp: 40 + wave * 12, speed, r: 14 });
  }

  const UPGRADES = [
    { name: '⚡ Feuerrate +40%', fn: () => { fireRate *= 1.4; } },
    { name: '💥 Schaden +50%', fn: () => { damage = Math.round(damage * 1.5); } },
    { name: '👟 Tempo +25%', fn: () => { moveSpeed = Math.round(moveSpeed * 1.25); } },
    { name: '❤️ +40 max HP & Heilung', fn: () => { maxHp += 40; hp = maxHp; } },
  ];

  function showUpgradeChoice() {
    choosing = true;
    const opts = [...UPGRADES].sort(() => Math.random() - 0.5).slice(0, 3);
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = `<h2>Welle ${wave} geschafft!</h2><p>Wähle ein Upgrade:</p>
      <div class="row">${opts.map((u, i) => `<button class="btn primary" data-up="${i}">${u.name}</button>`).join('')}</div>`;
    ctx.container.appendChild(ov);
    ov.querySelectorAll('[data-up]').forEach(b => b.addEventListener('click', () => {
      opts[Number((b as HTMLElement).dataset.up)].fn();
      ov.remove();
      startWave();
    }));
  }

  const loop = new GameLoop(dt => {
    if (paused || over || choosing) { draw(); return; }

    // Spielerbewegung
    let dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let dy = (input.downKey ? 1 : 0) - (input.up ? 1 : 0);
    const len = Math.hypot(dx, dy) || 1;
    px = clamp(px + dx / len * moveSpeed * dt, 10, canvas.width - 10);
    py = clamp(py + dy / len * moveSpeed * dt, 10, canvas.height - 10);

    // Feuern
    fireCd -= dt;
    if ((mouse.down || input.action) && fireCd <= 0) {
      fireCd = 1 / fireRate;
      const a = Math.atan2(mouse.y - py, mouse.x - px);
      bullets.push({ x: px, y: py, vx: Math.cos(a) * 500, vy: Math.sin(a) * 500, life: 2 });
      sfx.click();
    }

    // Spawns
    if (spawnQueue > 0) {
      spawnT -= dt;
      if (spawnT <= 0) { spawnEnemy(); spawnQueue--; spawnT = 0.6; }
    }

    // Bullets
    for (const b of bullets) { b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; }
    bullets = bullets.filter(b => b.life > 0 && b.x > -20 && b.y > -20 && b.x < canvas.width + 20 && b.y < canvas.height + 20);

    // Gegner bewegen + Kollision
    for (const e of enemies) {
      const a = Math.atan2(py - e.y, px - e.x);
      e.x += Math.cos(a) * e.speed * dt;
      e.y += Math.sin(a) * e.speed * dt;
      if (dist(e.x, e.y, px, py) < e.r + 12) {
        hp -= 20 * dt;
        e.x -= Math.cos(a) * 4; e.y -= Math.sin(a) * 4;
        if (hp <= 0) {
          over = true; sfx.lose();
          const best = ctx.storage.get<number>('bestWave') ?? 0;
          if (wave > best) ctx.storage.set('bestWave', wave);
          const ov = document.createElement('div');
          ov.className = 'overlay';
          ov.innerHTML = `<h2>💀 Überrollt</h2><p>Welle ${wave} · ${kills} Abschüsse · Bestwelle: ${Math.max(best, wave)}</p>
            <div class="row"><button class="btn primary" id="sa-re">Nochmal</button><button class="btn" id="sa-lib">Bibliothek</button></div>`;
          ctx.container.appendChild(ov);
          document.getElementById('sa-re')!.onclick = () => {
            ov.remove(); hp = maxHp = 100; wave = 0; kills = 0; enemies = []; bullets = [];
            fireRate = 3; damage = 25; moveSpeed = 200; over = false; startWave();
          };
          document.getElementById('sa-lib')!.onclick = () => { location.hash = '#/'; };
        }
      }
    }
    // Treffer
    for (const b of bullets) {
      for (const e of enemies) {
        if (dist(b.x, b.y, e.x, e.y) < e.r) {
          e.hp -= damage; b.life = 0;
          if (e.hp <= 0) { kills++; sfx.pickup(); }
        }
      }
    }
    enemies = enemies.filter(e => e.hp > 0);
    bullets = bullets.filter(b => b.life > 0);

    if (spawnQueue === 0 && enemies.length === 0 && !choosing) { sfx.win(); showUpgradeChoice(); }
    draw();
  });

  function draw() {
    const w = canvas.width, h = canvas.height;
    g.fillStyle = '#0d1020'; g.fillRect(0, 0, w, h);
    // Grid
    g.strokeStyle = 'rgba(38,50,83,0.5)';
    for (let x = 0; x < w; x += 60) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let y = 0; y < h; y += 60) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    // Gegner
    g.fillStyle = '#ff3d81';
    for (const e of enemies) { g.beginPath(); g.arc(e.x, e.y, e.r, 0, Math.PI * 2); g.fill(); }
    // Bullets
    g.fillStyle = '#ffe066';
    for (const b of bullets) { g.beginPath(); g.arc(b.x, b.y, 4, 0, Math.PI * 2); g.fill(); }
    // Spieler
    g.fillStyle = '#00e5ff';
    g.beginPath(); g.arc(px, py, 12, 0, Math.PI * 2); g.fill();
    // Ziel-Fadenkreuz
    g.strokeStyle = 'rgba(255,255,255,0.4)';
    g.beginPath(); g.moveTo(mouse.x - 8, mouse.y); g.lineTo(mouse.x + 8, mouse.y);
    g.moveTo(mouse.x, mouse.y - 8); g.lineTo(mouse.x, mouse.y + 8); g.stroke();
    // HUD
    g.fillStyle = '#e8ecf7'; g.font = '15px sans-serif';
    g.fillText(`Welle ${wave} · HP ${Math.max(0, Math.ceil(hp))}/${maxHp} · Kills ${kills}`, 14, 26);
    g.fillStyle = '#3ddc84';
    g.fillRect(14, 34, 140 * Math.max(0, hp / maxHp), 5);
  }

  startWave();
  return {
    start() { loop.start(); },
    pause() { paused = true; },
    resume() { paused = false; },
    destroy() { loop.stop(); input.destroy(); unfit(); canvas.removeEventListener('mousemove', onMouse); },
    getResult() { return { score: wave * 100 + kills, won: false, detail: `Welle ${wave}` }; },
  };
}
