// NEONDECK – Plattform-Shell: Navigation, Bibliothek, Spielansicht, Profil, Einstellungen.
import { CATALOG, READY_COUNT } from './shared/catalog';
import type { GameInstance } from './shared/types';
import type { CatalogEntry } from './shared/catalog';
import { storage } from './shared/storage';
import { setVolumes, unlockAudio, sfx } from './shared/audio';

const app = document.getElementById('app')!;
type Route = { view: 'library' } | { view: 'game', id: string } | { view: 'profile' } | { view: 'lobby' } | { view: 'help' };

let current: GameInstance | null = null;
let currentStageCleanup: (() => void) | null = null;

// ---------- Globale Einstellungen (lokal, keine Tracker) ----------
interface Prefs { name: string; avatar: string; sfx: number; music: number; theme: 'dark' | 'light'; reducedMotion: boolean; }
function loadPrefs(): Prefs {
  return storage.get<Prefs>('prefs') ?? { name: 'Spieler', avatar: '🎮', sfx: 0.6, music: 0.25, theme: 'dark', reducedMotion: false };
}
let prefs = loadPrefs();
function savePrefs() { storage.set('prefs', prefs); setVolumes(prefs.sfx, prefs.music); }

// ---------- Profil / XP ----------
interface Profile { xp: number; plays: Record<string, number>; best: Record<string, number>; }
function loadProfile(): Profile { return storage.get<Profile>('profile') ?? { xp: 0, plays: {}, best: {} }; }
export function addXp(n: number) { const p = loadProfile(); p.xp += n; storage.set('profile', p); }
export function recordPlay(gameId: string, score?: number) {
  const p = loadProfile();
  p.plays[gameId] = (p.plays[gameId] ?? 0) + 1;
  if (score !== undefined && score > (p.best[gameId] ?? -Infinity)) p.best[gameId] = score;
  storage.set('profile', p);
}
function levelFromXp(xp: number) { return Math.floor(Math.sqrt(xp / 50)) + 1; }
function xpForLevel(l: number) { return 50 * (l - 1) ** 2; }

// ---------- Router ----------
function parseRoute(): Route {
  const h = location.hash.replace(/^#\/?/, '');
  if (h.startsWith('game/')) return { view: 'game', id: h.slice(5) };
  if (h === 'profil') return { view: 'profile' };
  if (h === 'lobby') return { view: 'lobby' };
  if (h === 'hilfe') return { view: 'help' };
  return { view: 'library' };
}
function nav(r: Route) {
  location.hash = r.view === 'game' ? `#/game/${r.id}` : `#/${r.view === 'library' ? '' : r.view}`;
}

window.addEventListener('hashchange', () => render());

// ---------- Bibliothek ----------
const TINTS: [string, string][] = [['#1b2a6b', '#0b0e1a'], ['#5b1b4a', '#0b0e1a'], ['#0b4a3f', '#0b0e1a'], ['#6b4a12', '#0b0e1a']];
function tintFor(e: CatalogEntry): [string, string] { return TINTS[e.num % TINTS.length]; }

function renderLibrary() {
  const favs = storage.get<string[]>('favs') ?? [];
  const recent = storage.get<string[]>('recent') ?? [];
  const q = (document.getElementById('lib-search') as HTMLInputElement | null)?.value ?? '';
  const activeGenre = (document.getElementById('lib-filter') as HTMLSelectElement | null)?.value ?? '';
  const list = CATALOG
    .filter(e => !activeGenre || e.genre === activeGenre)
    .filter(e => !q || (e.title + ' ' + e.desc).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.num - b.num);

  app.innerHTML = `
    <header class="topbar">
      <div class="logo">
        <svg width="26" height="26" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="var(--card)"/><path d="M9 24V8l14 16V8" stroke="var(--accent)" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
        NEON<span class="nd">DECK</span>
      </div>
      <div class="spacer"></div>
      <input id="lib-search" class="search" placeholder="Spiele suchen…" value="${q.replace(/"/g, '&quot;')}" />
      <select id="lib-filter" class="btn" aria-label="Genre-Filter">
        <option value="">Alle Genres</option>
        <option value="arcade" ${activeGenre === 'arcade' ? 'selected' : ''}>Arcade</option>
        <option value="strategie" ${activeGenre === 'strategie' ? 'selected' : ''}>Strategie</option>
        <option value="multiplayer" ${activeGenre === 'multiplayer' ? 'selected' : ''}>Multiplayer</option>
        <option value="3d" ${activeGenre === '3d' ? 'selected' : ''}>3D</option>
        <option value="raetsel" ${activeGenre === 'raetsel' ? 'selected' : ''}>Rätsel</option>
      </select>
      <button class="btn" id="nav-lobby">Lobby</button>
      <button class="btn" id="nav-profile">Profil</button>
      <button class="btn" id="nav-help">Hilfe</button>
      <button class="btn" id="nav-settings">⚙︎</button>
    </header>

    <section class="hero">
      <h1>Willkommen, ${prefs.name} ${prefs.avatar}</h1>
      <p>${READY_COUNT} von 50 Spielen sind fertig spielbar, die übrigen sind im Menü ehrlich als <em>in Arbeit</em> markiert. Einzelspieler läuft komplett offline; Multiplayer funktioniert serverlos per WebRTC (manueller Einladungscode, siehe Lobby).</p>
      <div class="row">
        <button class="btn primary" id="btn-random">🎲 Zufälliges Spiel</button>
        ${recent.length ? '<button class="btn" id="btn-recent">▶︎ Weiter spielen</button>' : ''}
        <button class="btn" id="btn-lobby2">🎮 Multiplayer-Lobby</button>
      </div>
    </section>

    ${recent.length ? `<h3 style="margin:4px 0 10px">Zuletzt gespielt</h3>
      <div class="grid">${recent.slice(0, 4).map(id => CATALOG.find(c => c.id === id)).filter(Boolean).map(e => card(e as CatalogEntry, favs)).join('')}</div>
      <div style="height:20px"></div>` : ''}

    <div class="chips">
      <span class="chip on" style="cursor:default">${list.length} Spiele</span>
      <span class="chip" style="cursor:default">${READY_COUNT} fertig · ${CATALOG.length - READY_COUNT} in Arbeit</span>
    </div>
    <div class="grid">${list.map(e => card(e, favs)).join('')}</div>

    <footer>
      NEONDECK – statische Browser-Arcade. Keine Tracker, keine Cookies, keine Kaufangebote.<br/>
      Multiplayer: direkte Peer-to-Peer-Verbindung per WebRTC (manueller Einladungscode). GitHub Pages hostet nur die Dateien.
    </footer>`;

  bind('#nav-profile', () => nav({ view: 'profile' }));
  bind('#nav-lobby', () => nav({ view: 'lobby' }));
  bind('#nav-lobby2', () => nav({ view: 'lobby' }));
  bind('#nav-help', () => nav({ view: 'help' }));
  bind('#nav-settings', showSettings);
  bind('#btn-random', () => { const ready = CATALOG.filter(c => c.status === 'ready'); nav({ view: 'game', id: ready[Math.floor(Math.random() * ready.length)].id }); });
  bind('#btn-recent', () => { const r = storage.get<string[]>('recent') ?? []; if (r[0]) nav({ view: 'game', id: r[0] }); });
  bind('#lib-search', () => renderLibrary(), 'input');
  bind('#lib-filter', () => renderLibrary(), 'change');
  document.querySelectorAll('[data-goto]').forEach(el => el.addEventListener('click', () => {
    sfx.click();
    const id = (el as HTMLElement).dataset.goto!;
    const favs = storage.get<string[]>('favs') ?? [];
    if ((el as HTMLElement).dataset.fav !== undefined) {
      const i = favs.indexOf(id); if (i >= 0) favs.splice(i, 1); else favs.push(id);
      storage.set('favs', favs); renderLibrary(); return;
    }
    nav({ view: 'game', id });
  }));
}

function card(e: CatalogEntry, favs: string[]): string {
  const [t1, t2] = tintFor(e);
  const fav = favs.includes(e.id);
  const modeLabel = e.modes.includes('p2p-mp') ? 'P2P-Multiplayer' : e.modes.includes('local-mp') ? 'Lokal-MP' : 'Einzelspieler';
  return `<button class="gcard" data-goto="${e.id}">
    ${fav ? '<span class="badge-fav">★</span>' : ''}
    <div class="thumb" style="--tint1:${t1};--tint2:${t2}">${e.num.toString().padStart(2, '0')}</div>
    <h3>${e.title}</h3>
    <p>${e.desc}</p>
    <div class="tags">
      <span class="tag">${e.render.toUpperCase()}</span>
      <span class="tag dim">${modeLabel}</span>
      ${e.players.max > 1 ? `<span class="tag dim">${e.players.min}–${e.players.max} Sp.</span>` : ''}
      ${e.bots ? '<span class="tag dim">Bots</span>' : ''}
      ${e.status === 'wip' ? '<span class="tag wip">in Arbeit</span>' : ''}
    </div>
  </button>`;
}

// ---------- Spielansicht ----------
const GAME_LOADERS: Record<string, () => Promise<{ create: (ctx: import('./shared/types').GameContext) => GameInstance }>> = {
  'neon-dash': () => import('./games/neon-dash'),
  'gravity-flip': () => import('./games/gravity-flip'),
  'laser-maze': () => import('./games/laser-maze'),
  'drift-circuit': () => import('./games/drift-circuit'),
  'survival-arena': () => import('./games/survival-arena'),
  'hexa-conquest': () => import('./games/hexa-conquest'),
  'bomb-bots': () => import('./games/bomb-bots'),
  'word-forge': () => import('./games/word-forge'),
  'paint-rush': () => import('./games/paint-rush'),
  'micro-racers-3d': () => import('./games/micro-racers-3d'),
};

function renderGame(id: string) {
  const entry = CATALOG.find(c => c.id === id);
  if (!entry) { nav({ view: 'library' }); return; }

  app.innerHTML = `
    <header class="topbar">
      <button class="btn" id="back">← Bibliothek</button>
      <div class="game-head" style="flex:1">
        <h2>${entry.title}</h2>
        <div class="tags">
          <span class="tag">${entry.render.toUpperCase()}</span>
          ${entry.status === 'wip' ? '<span class="tag wip">in Arbeit – noch nicht spielbar</span>' : ''}
        </div>
      </div>
      <button class="btn" id="fav-btn">${(storage.get<string[]>('favs') ?? []).includes(id) ? '★' : '☆'}</button>
      <button class="btn" id="help-btn">?</button>
      <button class="btn" id="pause-btn">⏸ Pause</button>
    </header>
    <div class="game-view">
      <div class="hud" id="hud"></div>
      <div class="stage" id="stage"></div>
    </div>`;

  bind('#back', () => { destroyCurrent(); nav({ view: 'library' }); });
  bind('#help-btn', () => showHelp(entry));
  bind('#fav-btn', () => {
    const favs = storage.get<string[]>('favs') ?? [];
    const i = favs.indexOf(id);
    if (i >= 0) favs.splice(i, 1); else favs.push(id);
    storage.set('favs', favs);
    (document.getElementById('fav-btn') as HTMLElement).textContent = i >= 0 ? '☆' : '★';
  });
  bind('#pause-btn', () => { if (current) { (document.getElementById('pause-btn') as HTMLElement).textContent = '▶︎ Weiter'; current.pause(); } });

  const stage = document.getElementById('stage') as HTMLElement;
  if (entry.status === 'wip') {
    stage.innerHTML = `<div class="overlay">
      <h2>🚧 In Arbeit</h2>
      <p>Dieses Spiel ist noch nicht implementiert. Es wird im Menü ehrlich als <em>in Arbeit</em> geführt und ist kein spielbares Debug-Objekt.<br/>
      Aktuell fertig: siehe Fortschrittsliste in der README.</p>
      <div class="row"><button class="btn primary" id="ov-back">Zurück zur Bibliothek</button></div>
    </div>`;
    document.getElementById('ov-back')!.onclick = () => nav({ view: 'library' });
    return;
  }

  // Kürzlich gespielt
  const recent = storage.get<string[]>('recent') ?? [];
  const ri = recent.indexOf(id); if (ri >= 0) recent.splice(ri, 1);
  recent.unshift(id); storage.set('recent', recent.slice(0, 8));

  showOverlay(stage, `<h2>${entry.title}</h2><p>${entry.howto}</p>
    <div class="row">
      <button class="btn primary" id="ov-start">▶︎ Start</button>
      <button class="btn" id="ov-help">Regeln &amp; Steuerung</button>
    </div>`);
  document.getElementById('ov-help')!.onclick = () => showHelp(entry);
  document.getElementById('ov-start')!.onclick = async () => {
    unlockAudio();
    const overlay = stage.querySelector('.overlay'); overlay?.remove();
    const loader = GAME_LOADERS[id];
    if (!loader) { showOverlay(stage, '<h2>Fehler</h2><p>Spielmodul nicht gefunden.</p>'); return; }
    try {
      const mod = await loader(); // Lazy Loading: nur dieses Spiel wird geladen
      const inst = mod.create({
        container: stage,
        difficulty: 'normal',
        storage: storage.scoped(id),
        sound: { sfx: prefs.sfx, music: prefs.music },
        reducedMotion: prefs.reducedMotion,
      });
      current = inst;
      inst.start();
      bind('#pause-btn', () => {
        const b = document.getElementById('pause-btn')!;
        if (b.textContent!.includes('Pause')) { inst.pause(); b.textContent = '▶︎ Weiter'; }
        else { inst.resume(); b.textContent = '⏸ Pause'; }
      });
    } catch (err) {
      console.error(err);
      showOverlay(stage, `<h2>Fehler beim Starten</h2><p>${String(err)}</p><div class="row"><button class="btn" onclick="location.reload()">Neu laden</button></div>`);
    }
  };
}

function showOverlay(stage: HTMLElement, html: string) {
  stage.querySelectorAll('.overlay').forEach(o => o.remove());
  const d = document.createElement('div');
  d.className = 'overlay';
  d.innerHTML = html;
  stage.appendChild(d);
}

function destroyCurrent() {
  current?.destroy(); current = null;
  currentStageCleanup?.(); currentStageCleanup = null;
}

// ---------- Hilfe ----------
function showHelp(entry: CatalogEntry) {
  openModal(`<h2>${entry.title} – Regeln</h2>
    <p style="line-height:1.6;color:var(--text-dim)">${entry.howto || 'Details folgen mit dem fertigen Spiel.'}</p>
    <p style="font-size:12px">Bestwerte werden lokal im Browser gespeichert. Keine Daten verlassen dein Gerät.</p>
    <div class="row"><button class="btn primary" data-close>Alles klar</button></div>`);
}

// ---------- Profil ----------
function renderProfile() {
  const p = loadProfile();
  const lvl = levelFromXp(p.xp);
  const pct = Math.min(100, Math.round(((p.xp - xpForLevel(lvl)) / Math.max(1, xpForLevel(lvl + 1) - xpForLevel(lvl))) * 100));
  const rows = CATALOG.filter(c => p.plays[c.id]).map(c => `
    <div class="stat-card"><div class="v">${p.plays[c.id]}</div><div class="k">${c.title} Runden</div></div>
    ${p.best[c.id] !== undefined ? `<div class="stat-card"><div class="v">${p.best[c.id]}</div><div class="k">${c.title} Rekord</div></div>` : ''}
  `).join('');

  app.innerHTML = `
    <header class="topbar">
      <button class="btn" id="back">← Bibliothek</button>
      <h2 style="flex:1;margin:0">Profil</h2>
      <button class="btn" id="nav-settings">⚙︎</button>
    </header>
    <div class="lobby-wrap">
      <div class="help-panel">
        <b>${prefs.name} ${prefs.avatar}</b> · Level ${lvl}<br/>
        <div class="xpbar" style="margin:10px 0"><div style="width:${pct}%"></div></div>
        <small>${p.xp} XP · ${xpForLevel(lvl + 1) - p.xp} XP bis Level ${lvl + 1} · XP wird durch gespielte Runden und Siege verdient.</small>
      </div>
      <h3>Statistiken</h3>
      <div class="stat-grid">
        <div class="stat-card"><div class="v">${Object.values(p.plays).reduce((a, b) => a + b, 0)}</div><div class="k">Runden gesamt</div></div>
        <div class="stat-card"><div class="v">${Object.keys(p.plays).length}</div><div class="k">Verschiedene Spiele</div></div>
        ${rows}
      </div>
      ${!rows ? '<p class="notice">Noch keine Runden gespielt – starte ein Spiel aus der Bibliothek.</p>' : ''}
      <p class="notice">Alle Daten liegen ausschließlich lokal in deinem Browser (LocalStorage). Es gibt keine Cloud-Anbindung und keine Registrierung.</p>
    </div>`;
  bind('#back', () => nav({ view: 'library' }));
  bind('#nav-settings', showSettings);
}

// ---------- Lobby (Phase 2: manueller WebRTC-Code) ----------
function renderLobby() {
  app.innerHTML = `
    <header class="topbar">
      <button class="btn" id="back">← Bibliothek</button>
      <h2 style="flex:1;margin:0">Multiplayer-Lobby (WebRTC, serverlos)</h2>
    </header>
    <div class="lobby-wrap" id="lobby-root"></div>`;
  bind('#back', () => nav({ view: 'library' }));
  import('./multiplayer/lobby-ui').then(m => m.mountLobby(document.getElementById('lobby-root')!, CATALOG));
}

// ---------- Einstellungen ----------
function showSettings() {
  openModal(`<h2>Einstellungen</h2>
    <div class="field"><span>Spielername</span><input type="text" id="set-name" value="${prefs.name.replace(/"/g, '&quot;')}" maxlength="20"/></div>
    <div class="field"><span>Avatar</span>
      <div class="swatches">${['🎮', '👾', '🚀', '🦊', '🐙', '⚡'].map(a => `<button class="swatch ${prefs.avatar === a ? 'on' : ''}" data-av="${a}">${a}</button>`).join('')}</div>
    </div>
    <div class="field"><span>Sound-Effekte</span><input type="range" id="set-sfx" min="0" max="1" step="0.05" value="${prefs.sfx}"/></div>
    <div class="field"><span>Musik</span><input type="range" id="set-music" min="0" max="1" step="0.05" value="${prefs.music}"/></div>
    <div class="field"><span>Design</span><select id="set-theme"><option value="dark" ${prefs.theme === 'dark' ? 'selected' : ''}>Dunkel</option><option value="light" ${prefs.theme === 'light' ? 'selected' : ''}>Hell</option></select></div>
    <div class="field"><span>Reduzierte Bewegung</span><input type="checkbox" id="set-motion" ${prefs.reducedMotion ? 'checked' : ''}/></div>
    <div class="row"><button class="btn" data-close>Abbrechen</button><button class="btn primary" id="set-save">Speichern</button></div>`);
  document.querySelectorAll('[data-av]').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('[data-av]').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
  }));
  document.getElementById('set-save')!.addEventListener('click', () => {
    prefs.name = (document.getElementById('set-name') as HTMLInputElement).value.trim() || 'Spieler';
    prefs.avatar = (document.querySelector('.swatch.on') as HTMLElement)?.dataset.av ?? '🎮';
    prefs.sfx = Number((document.getElementById('set-sfx') as HTMLInputElement).value);
    prefs.music = Number((document.getElementById('set-music') as HTMLInputElement).value);
    prefs.theme = (document.getElementById('set-theme') as HTMLSelectElement).value as 'dark' | 'light';
    prefs.reducedMotion = (document.getElementById('set-motion') as HTMLInputElement).checked;
    savePrefs();
    document.documentElement.dataset.theme = prefs.theme;
    closeModal();
    if (parseRoute().view === 'library') renderLibrary();
  });
}

// ---------- Modal-Helfer ----------
function openModal(html: string) {
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal">${html}</div>`;
  back.addEventListener('click', e => { if (e.target === back) closeModal(); });
  document.body.appendChild(back);
  back.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeModal));
}
function closeModal() { document.querySelectorAll('.modal-back').forEach(m => m.remove()); }

function bind(sel: string, fn: () => void, ev: 'click' | 'input' | 'change' = 'click') {
  const el = document.querySelector(sel);
  if (el) el.addEventListener(ev, fn);
}

// ---------- Hilfeseite ----------
function renderHelp() {
  app.innerHTML = `
    <header class="topbar"><button class="btn" id="back">← Bibliothek</button><h2 style="flex:1;margin:0">Hilfe</h2></header>
    <div class="lobby-wrap">
      <div class="help-panel"><h3>Wie funktioniert Multiplayer?</h3>
        <p>NEONDECK nutzt WebRTC: zwei Browser bauen eine <em>direkte</em> Verbindung auf – ohne Spielserver. Der Austausch der Verbindungsdaten läuft über einen manuellen Einladungscode (kopieren &amp; einfügen). GitHub Pages liefert nur die Website-Dateien aus; ein echter Multiplayer-Server wäre dafür nötig, den es hier absichtlich nicht gibt. Einladungscodes sind zeitkritisch: einige Minuten gültig.</p></div>
      <div class="help-panel"><h3>Steuerung</h3>
        <p>Die meisten Spiele: WASD oder Pfeiltasten, Leertaste für Aktion. Auf Touch-Geräten erscheinen virtuelle Zonen. Jede Spielkarte zeigt die genaue Steuerung unter „?“.</p></div>
      <div class="help-panel"><h3>Daten &amp; Datenschutz</h3>
        <p>Rekorde, XP und Einstellungen bleiben lokal in deinem Browser. Keine Tracker, keine Accounts, keine Käufe.</p></div>
      <div class="help-panel"><h3>Bekannte Einschränkungen</h3>
        <p>Spiele mit Status „in Arbeit“ sind nicht spielbar. WebRTC braucht zwei gleichzeitig offene Browserfenster/Geräte. Lokale Statistiken gehen beim Löschen der Browserdaten verloren.</p></div>
    </div>`;
  bind('#back', () => nav({ view: 'library' }));
}

// ---------- Boot ----------
function render() {
  destroyCurrent();
  document.documentElement.dataset.theme = prefs.theme;
  setVolumes(prefs.sfx, prefs.music);
  const r = parseRoute();
  if (r.view === 'game') renderGame(r.id);
  else if (r.view === 'profile') renderProfile();
  else if (r.view === 'lobby') renderLobby();
  else if (r.view === 'help') renderHelp();
  else renderLibrary();
}
render();
