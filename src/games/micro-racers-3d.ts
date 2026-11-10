// Game 31 – Micro Racers 3D: echtes 3D-Rennspiel mit Three.js (Kamera, Licht,
// Geometrie, räumliche Bewegung). Enthält WebGL-Fallback mit verständlicher
// Fehlermeldung statt weißer Seite und Qualitätsstufen (niedrig/mittel/hoch).
import type { GameContext, GameInstance } from '../shared/types';
import { GameLoop, clamp } from '../shared/engine';
import { sfx } from '../shared/audio';
import * as THREE from 'three';

const TRACKS: Array<{ pts: Array<[number, number]>; laps: number }> = [
  { pts: [[0, -60], [60, -60], [60, 40], [0, 40]], laps: 3 },          // Oval
  { pts: [[-60, -60], [60, -60], [60, 0], [0, 0], [0, 60], [-60, 60]], laps: 3 }, // S-Kurs
];
// Straßensegmente zwischen Wegpunkten (Breite 12 Einheiten)

interface Kart {
  mesh: THREE.Group; x: number; z: number; heading: number; speed: number;
  wp: number; lap: number; isBot: boolean; finished: boolean; time: number;
}

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

export function create(ctx: GameContext): GameInstance {
  // ---- WebGL-Fallback (Pflicht, §5) ----
  if (!webglAvailable()) {
    ctx.container.innerHTML = `<div class="overlay">
      <h2>⚠️ WebGL nicht verfügbar</h2>
      <p>Dieses 3D-Spiel braucht WebGL. Dein Browser oder deine Grafikeinstellung blockiert es.
      2D-Spiele funktionieren weiterhin – bitte nutze einen aktuellen Chrome/Firefox/Edge mit aktivierter Hardwarebeschleunigung.</p>
    </div>`;
    return { start() {}, pause() {}, resume() {}, destroy() {} };
  }

  const quality = (ctx.storage.get<string>('quality') ?? 'mittel') as 'niedrig' | 'mittel' | 'hoch';

  const renderer = new THREE.WebGLRenderer({ antialias: quality !== 'niedrig' });
  renderer.setPixelRatio(quality === 'hoch' ? Math.min(2, devicePixelRatio) : quality === 'mittel' ? 1 : 0.7);
  renderer.shadowMap.enabled = quality === 'hoch';
  ctx.container.appendChild(renderer.domElement);
  renderer.domElement.classList.add('three-canvas');

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0e1a);
  scene.fog = new THREE.Fog(0x0b0e1a, 80, 260);

  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 500);

  // Licht
  scene.add(new THREE.HemisphereLight(0x8faaff, 0x202840, 0.9));
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(40, 80, 30);
  if (quality === 'hoch') { sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); }
  scene.add(sun);

  // Boden
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.MeshLambertMaterial({ color: 0x16203a })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // Straße: für jedes Track-Segment ein flacher Box-Strip + Start/Ziel-Bogen
  function buildRoad(pts: Array<[number, number]>) {
    const roadMat = new THREE.MeshLambertMaterial({ color: 0x2a3554 });
    const group = new THREE.Group();
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const seg = new THREE.Mesh(new THREE.BoxGeometry(12, 0.2, len), roadMat);
      seg.position.set((a[0] + b[0]) / 2, 0.1, (a[1] + b[1]) / 2);
      seg.rotation.y = Math.atan2(b[0] - a[0], b[1] - a[1]);
      group.add(seg);
    }
    return group;
  }

  function buildKart(color: number): THREE.Group {
    const grp = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.8, 3.4), new THREE.MeshLambertMaterial({ color }));
    body.position.y = 0.7;
    grp.add(body);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.6, 1.4), new THREE.MeshLambertMaterial({ color: 0x10131f }));
    cab.position.set(0, 1.3, -0.2);
    grp.add(cab);
    for (const [wx, wz] of [[-1, 1.2], [1, 1.2], [-1, -1.2], [1, -1.2]] as const) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.4, 12), new THREE.MeshLambertMaterial({ color: 0x0a0a0a }));
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wx, 0.45, wz);
      grp.add(wheel);
    }
    return grp;
  }

  let trackIdx = 0, track = TRACKS[0];
  let road: THREE.Group;
  let me: Kart, bots: Kart[] = [];
  let keys: Record<string, boolean> = {};
  let t = 0, paused = false, over = false, results: Kart[] = [];
  let rafResize: () => void = () => {};
  let onKey = (e: KeyboardEvent, d: boolean) => { keys[e.key.toLowerCase()] = d; };

  function reset(ti: number) {
    trackIdx = ti; track = TRACKS[ti];
    if (road) scene.remove(road);
    road = buildRoad(track.pts);
    scene.add(road);
    me = { mesh: buildKart(0x00e5ff), x: track.pts[0][0] - 4, z: track.pts[0][1], heading: 0, speed: 0, wp: 1 % track.pts.length, lap: 0, isBot: false, finished: false, time: 0 };
    scene.add(me.mesh);
    bots = [0xff3d81, 0xffb454, 0x3ddc84].map((col, i) => {
      const k: Kart = { mesh: buildKart(col), x: track.pts[0][0] + 4, z: track.pts[0][1] + i * 6 - 6, heading: 0, speed: 0, wp: 1 % track.pts.length, lap: 0, isBot: true, finished: false, time: 0 };
      scene.add(k.mesh);
      return k;
    });
    t = 0; over = false; results = [];
  }

  function stepKart(k: Kart, dt: number, throttle: number, steer: number) {
    k.speed += throttle * 30 * dt;
    k.speed *= 1 - 0.4 * dt;
    k.speed = clamp(k.speed, -12, 38);
    k.heading += steer * 1.8 * dt * Math.sign(k.speed || 1);
    k.x += Math.sin(k.heading) * k.speed * dt;
    k.z += Math.cos(k.heading) * k.speed * dt;
    k.time += dt;
    k.mesh.position.set(k.x, 0, k.z);
    k.mesh.rotation.y = k.heading;

    const wp = track.pts[k.wp];
    if (Math.hypot(k.x - wp[0], k.z - wp[1]) < 10) {
      k.wp = (k.wp + 1) % track.pts.length;
      if (k.wp === 1) {
        k.lap++;
        if (k.lap >= track.laps && !k.finished) { k.finished = true; results.push(k); if (!k.isBot) sfx.win(); }
      }
    }
  }

  function aiSteer(k: Kart): number {
    const tgt = track.pts[(k.wp + 1) % track.pts.length];
    const desired = Math.atan2(tgt[0] - k.x, tgt[1] - k.z);
    let d = desired - k.heading;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return clamp(d * 2.2, -1, 1);
  }

  const loop = new GameLoop(dt => {
    if (paused || over) { renderer.render(scene, camera); return; }
    t += dt;
    if (!me.finished) {
      const throttle = (keys['arrowup'] || keys['w'] ? 1 : 0) - (keys['arrowdown'] || keys['s'] ? 1 : 0);
      const steer = (keys['arrowright'] || keys['d'] ? 1 : 0) - (keys['arrowleft'] || keys['a'] ? 1 : 0);
      stepKart(me, dt, throttle, steer);
    }
    for (const b of bots) if (!b.finished) stepKart(b, dt, 1, aiSteer(b));

    // Verfolgerkamera
    const camTarget = new THREE.Vector3(me.x - Math.sin(me.heading) * 12, 7, me.z - Math.cos(me.heading) * 12);
    camera.position.lerp(camTarget, 0.12);
    camera.lookAt(me.x, 1, me.z);

    if (results.length >= 4) finish();
    renderer.render(scene, camera);
  });

  function finish() {
    over = true;
    const myTime = results.find(k => !k.isBot)?.time ?? 99;
    const best = ctx.storage.get<number>('best');
    if (!best || myTime < best) ctx.storage.set('best', myTime);
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = `<h2>🏁 Ziel!</h2>
      <p>${results.map((k, i) => `${i + 1}. ${k.isBot ? 'Bot' : 'Du'} – ${k.time.toFixed(1)} s`).join('<br/>')}</p>
      <div class="row"><button class="btn primary" id="m3-re">Nochmal</button>
      <button class="btn" id="m3-tr">Andere Strecke</button>
      <button class="btn" id="m3-q">Qualität: ${quality}</button>
      <button class="btn" id="m3-lib">Bibliothek</button></div>`;
    ctx.container.appendChild(ov);
    document.getElementById('m3-re')!.onclick = () => { ov.remove(); reset(trackIdx); };
    document.getElementById('m3-tr')!.onclick = () => { ov.remove(); reset((trackIdx + 1) % TRACKS.length); };
    document.getElementById('m3-q')!.onclick = () => {
      const order = ['niedrig', 'mittel', 'hoch'];
      ctx.storage.set('quality', order[(order.indexOf(quality) + 1) % 3]);
      location.reload(); // Qualität braucht Renderer-Neuaufbau → ehrlicher Reload
    };
    document.getElementById('m3-lib')!.onclick = () => { location.hash = '#/'; };
  }

  // Resize sauber behandeln
  const ro = new ResizeObserver(() => {
    const w = ctx.container.clientWidth, h = ctx.container.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  });
  ro.observe(ctx.container);
  window.addEventListener('keydown', e => onKey(e, true));
  window.addEventListener('keyup', e => onKey(e, false));
  rafResize = () => ro.disconnect();

  reset(0);
  return {
    start() { loop.start(); },
    pause() { paused = true; },
    resume() { paused = false; },
    destroy() { loop.stop(); rafResize(); window.removeEventListener('keydown', onKey as never); window.removeEventListener('keyup', onKey as never); renderer.dispose(); },
    getResult() { return { score: Math.round(1000 - t * 5), won: results.some(r => !r.isBot), detail: `${t.toFixed(1)} s` }; },
  };
}
