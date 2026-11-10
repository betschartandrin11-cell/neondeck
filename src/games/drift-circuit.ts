// Game 7 – Drift Circuit: Top-down-Rennen mit echter Drift-Physik (Geschwindigkeit
// + Heading entkoppelt, Handbremse erhöht drift). 3 Strecken, 2 Bot-Autos, die
// Wegpunkte abfahren (kein Wandblick, gleiche Physik wie der Spieler).
import type { GameContext, GameInstance } from '../shared/types';
import { GameLoop, fitCanvas, Input, clamp } from '../shared/engine';
import { sfx } from '../shared/audio';

// Strecke = geschlossene Wegpunkte-Schleife auf 1000x600 Logikfläche
const TRACKS: Array<{ pts: Array<[number, number]>; laps: number }> = [
  { pts: [[150, 120], [850, 120], [850, 480], [150, 480]], laps: 3 },
  { pts: [[150, 100], [850, 100], [850, 300], [500, 300], [500, 500], [150, 500]], laps: 3 },
  { pts: [[500, 80], [900, 300], [500, 520], [100, 300]], laps: 4 },
];

interface Car {
  x: number; y: number; vx: number; vy: number; heading: number;
  wp: number; lap: number; isBot: boolean; color: string; finished: boolean; time: number;
  lookahead: number;
}

export function create(ctx: GameContext): GameInstance {
  const canvas = document.createElement('canvas');
  ctx.container.appendChild(canvas);
  const g = canvas.getContext('2d')!;
  const unfit = fitCanvas(canvas, ctx.container);
  const input = new Input(ctx.container);

  let track = TRACKS[0];
  let cars: Car[] = [];
  let t = 0, paused = false, done = false;
  let results: Car[] = [];

  function reset(ti = Math.floor(Math.random() * TRACKS.length)) {
    track = TRACKS[ti];
    cars = [];
    const start = track.pts[0];
    const mk = (dx: number, dy: number, isBot: boolean, color: string, look: number): Car => ({
      x: start[0] + dx, y: start[1] + dy, vx: 0, vy: 0, heading: 0,
      wp: 1 % track.pts.length, lap: 0, isBot, color, finished: false, time: 0, lookahead: look,
    });
    cars.push(mk(-30, 0, false, '#00e5ff', 0));
    cars.push(mk(30, -22, true, '#ff3d81', 2));
    cars.push(mk(30, 22, true, '#ffb454', 1));
    t = 0; paused = false; done = false; results = [];
  }

  function stepCar(c: Car, dt: number, throttle: number, steer: number, handbrake: boolean) {
    const accel = 340 * (throttle > 0 ? 1 : throttle < 0 ? -0.7 : 0);
    const turn = 2.6 * steer * dt * (handbrake ? 1.6 : 1);
    c.heading += turn;
    // Beschleunigung entlang Heading
    c.vx += Math.cos(c.heading) * accel * dt;
    c.vy += Math.sin(c.heading) * accel * dt;
    // Grip: ohne Handbremse wird die Geschwindigkeit Richtung Heading gezogen (Drift-Faktor)
    const speed = Math.hypot(c.vx, c.vy);
    if (speed > 0) {
      const fwd = { x: Math.cos(c.heading), y: Math.sin(c.heading) };
      const dot = (c.vx * fwd.x + c.vy * fwd.y) / speed; // Anteil in Fahrtrichtung
      const grip = handbrake ? 1.2 : 4.5; // niedriger = mehr Drift
      const f = 1 - Math.min(1, grip * dt);
      c.vx = fwd.x * dot + (c.vx - fwd.x * dot) * f;
      c.vy = fwd.y * dot + (c.vy - fwd.y * dot) * f;
      // Reibung + Speedlimit
      c.vx *= 1 - 0.6 * dt; c.vy *= 1 - 0.6 * dt;
      const sp2 = Math.hypot(c.vx, c.vy);
      const max = 300;
      if (sp2 > max) { c.vx *= max / sp2; c.vy *= max / sp2; }
    }
    c.x = clamp(c.x + c.vx * dt, 20, 980);
    c.y = clamp(c.y + c.vy * dt, 20, 580);
    c.time += dt;

    // Wegpunkt-Logik
    const wp = track.pts[c.wp];
    if (Math.hypot(c.x - wp[0], c.y - wp[1]) < 50) {
      c.wp = (c.wp + 1) % track.pts.length;
      if (c.wp === 1) { c.lap++; if (c.lap >= track.laps) { c.finished = true; results.push(c); if (!c.isBot) sfx.win(); else sfx.hit(); } }
    }
  }

  const loop = new GameLoop(dt => {
    if (paused || done) { draw(); return; }
    t += dt;
    for (const c of cars) {
      if (c.finished) continue;
      if (!c.isBot) {
        const throttle = input.up ? 1 : input.downKey ? -1 : 0;
        const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
        stepCar(c, dt, throttle, steer, input.down('shift'));
      } else {
        // Bot: fährt Richtung (vor plusieurs) Wegpunkte, lenkt proportional
        const tgt = track.pts[(c.wp + 1) % track.pts.length];
        const desired = Math.atan2(tgt[1] - c.y, tgt[0] - c.x);
        let d = desired - c.heading;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        stepCar(c, dt, 1, clamp(d * 2, -1, 1), Math.abs(d) > 0.9); // Handbremse in engen Kurven
      }
    }
    if (results.length === cars.length) finish();
    draw();
  });

  function finish() {
    done = true;
    const myTime = results.find(c => !c.isBot)?.time ?? 99;
    const best = ctx.storage.get<number>('best');
    if (!best || myTime < best) ctx.storage.set('best', myTime);
    const ov = document.createElement('div');
    ov.className = 'overlay';
    const order = results.map((c, i) => `${i + 1}. ${c.isBot ? 'Bot' : 'Du'} (${c.time.toFixed(1)} s)`).join('<br/>');
    ov.innerHTML = `<h2>🏁 Rennen beendet</h2><p>${order}</p>
      <p>Bestzeit: <b>${Math.min(best ?? myTime, myTime).toFixed(1)} s</b></p>
      <div class="row"><button class="btn primary" id="dc-re">Nochmal</button>
      <button class="btn" id="dc-track">Andere Strecke</button>
      <button class="btn" id="dc-lib">Bibliothek</button></div>`;
    ctx.container.appendChild(ov);
    document.getElementById('dc-re')!.onclick = () => { ov.remove(); reset(TRACKS.indexOf(track)); };
    document.getElementById('dc-track')!.onclick = () => { ov.remove(); reset((TRACKS.indexOf(track) + 1) % TRACKS.length); };
    document.getElementById('dc-lib')!.onclick = () => { location.hash = '#/'; };
  }

  function draw() {
    const w = canvas.width, h = canvas.height;
    g.fillStyle = '#101426'; g.fillRect(0, 0, w, h);
    const s = Math.min(w / 1000, h / 600);
    const ox = (w - 1000 * s) / 2, oy = (h - 600 * s) / 2;
    // Streckenfläche (Polygon um Wegpunkte)
    g.strokeStyle = '#3a4769'; g.lineWidth = 60 * s; g.lineJoin = 'round';
    g.beginPath();
    track.pts.forEach((p, i) => { const px = ox + p[0] * s, py = oy + p[1] * s; if (i === 0) g.moveTo(px, py); else g.lineTo(px, py); });
    g.closePath(); g.stroke();
    g.strokeStyle = '#00e5ff'; g.lineWidth = 2; g.setLineDash([8, 8]); g.stroke(); g.setLineDash([]);
    // Wegpunkte als Zielmarker
    g.fillStyle = 'rgba(255,180,84,0.5)';
    const wp0 = track.pts[cars[0]?.wp ?? 1];
    g.beginPath(); g.arc(ox + wp0[0] * s, oy + wp0[1] * s, 14 * s, 0, Math.PI * 2); g.fill();
    // Autos
    for (const c of cars) {
      const px = ox + c.x * s, py = oy + c.y * s;
      g.save(); g.translate(px, py); g.rotate(c.heading);
      g.fillStyle = c.color;
      g.fillRect(-16 * s, -9 * s, 32 * s, 18 * s);
      g.restore();
    }
    g.fillStyle = '#e8ecf7'; g.font = `${15 * s}px sans-serif`;
    g.fillText(`Runde ${Math.min(cars[0]?.lap ?? 0, track.laps) + 1}/${track.laps} · Zeit ${t.toFixed(1)} s · Handbremse: Shift (driftet)`, 14, 26);
  }

  reset(0);
  return {
    start() { loop.start(); },
    pause() { paused = true; },
    resume() { paused = false; },
    destroy() { loop.stop(); input.destroy(); unfit(); },
    getResult() { return { score: Math.round(1000 - t * 10), won: results.some(r => !r.isBot), detail: `${t.toFixed(1)} s` }; },
  };
}
