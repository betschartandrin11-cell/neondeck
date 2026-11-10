// Game 19 – Word Forge: Buchstaben-Rätsel mit deutschem Wörterbuch-Auszug.
// Eigene Mechanik: gefundene Wörter "schmelzen" Eis-Kacheln; Kette aus Buchstaben
// bauen (klicken), Mindestlänge 3. Deutsche Wörter, lokal geprüft.
import type { GameContext, GameInstance } from '../shared/types';
import { fitCanvas, randInt } from '../shared/engine';
import { sfx } from '../shared/audio';

// Kurzes, kuratiertes Wörterbuch (3–6 Buchstaben, häufige deutsche Wörter)
const WORDS = new Set(`baum haus tier berg mond stern wald meer wind feuer erde wasser\neis hack jagd kult leben liebe licht luft magen mais mein nebel oasis obst\npalme pfad quel rasen rauch reis sand sau seil silk tau tief tor tow Turm\nweg wolf wurm zeit zinns zug bast blick boot bogen brie bruch buche\n decke dienst drach duft ebeni ecke faden fahne feld fern fisch flee fluss\nform frage frost gabel garten glocke gras grieb gros karte katze kel kette\n kindr klang knabe kranz kries krone kugel kuppe later laub laune lehm\nleiste lob mahl maler mehl meinung messer miene miete muehle mue muenze\nnacht nagel nase nicker nuance nuess opal orden pfeil pflock piste plan\nplatte platz pohl post raeder rahm rand ratte raub reet reh rend riemen\nrinde rost ruelle sache sattel schnee seele seite senf sofa sohle sole\nspalt spinne spiel spiegel stab stahl stern stiel stoff strand stuhl\nsuede tafel tasse teich teller thee timber ton torf truhe ufer vine\nwaage wagen wand ware wiese wille winter wolf wurzel zange zarge zepter\nzinn zone zopf`.split(/\s+/).filter(w => w.length >= 3));

// Eis-Feld: Buchstaben-Raster; unter manchen Kacheln ist "Eis", das schmilzt,
// wenn ein Wort aus einer Kette gelegt wird, die diese Kachel enthält.
const SIZE = 5;
const POOL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function create(ctx: GameContext): GameInstance {
  const canvas = document.createElement('canvas');
  ctx.container.appendChild(canvas);
  const g = canvas.getContext('2d')!;
  const unfit = fitCanvas(canvas, ctx.container);

  let letters: string[][] = [];
  let ice: boolean[][] = [];   // true = Eis-Kachel (muss geschmolzen werden)
  let selected: Array<{ r: number; c: number }> = [];
  let found = 0, level = 1, wonLevel = false;
  let msg = '';

  function genLevel() {
    letters = []; ice = [];
    for (let r = 0; r < SIZE; r++) {
      letters.push(Array.from({ length: SIZE }, () => POOL[randInt(26)]));
      ice.push(Array.from({ length: SIZE }, () => Math.random() < 0.45));
    }
    // Sicherstellen, dass mindestens ein Vokal drin ist (Spielbarkeit)
    letters[2][2] = 'E';
    ice[2][2] = true;
    selected = []; found = 0; wonLevel = false; msg = 'Baue Wörter mit 3+ Buchstaben (Klick auf angrenzende Kacheln).';
  }

  function chainWord(): string { return selected.map(s => letters[s.r][s.c]).join('').toLowerCase(); }
  function adjacent(a: { r: number; c: number }, b: { r: number; c: number }) {
    return Math.abs(a.r - b.r) <= 1 && Math.abs(a.c - b.c) <= 1 && !(a.r === b.r && a.c === b.c);
  }
  function alreadySel(r: number, c: number) { return selected.some(s => s.r === r && s.c === c); }

  function submit() {
    const w = chainWord();
    if (w.length < 3) { msg = 'Mindestens 3 Buchstaben.'; return; }
    if (!WORDS.has(w)) { msg = `„${w.toUpperCase()}“ ist kein gültiges Wort.`; selected = []; sfx.hit(); return; }
    sfx.pickup();
    found++;
    // Eis schmelzen auf markierten Kacheln
    for (const s of selected) ice[s.r][s.c] = false;
    selected = [];
    msg = `✓ ${w.toUpperCase()} – Eis geschmolzen!`;
    const remaining = ice.flat().filter(Boolean).length;
    if (remaining === 0) {
      wonLevel = true; sfx.win();
      const best = ctx.storage.get<number>('level') ?? 0;
      if (level > best) ctx.storage.set('level', level);
      const ov = document.createElement('div');
      ov.className = 'overlay';
      ov.innerHTML = `<h2>❄️→💧 Level ${level} gelöst!</h2><p>${found} Wörter gebraucht.</p>
        <div class="row"><button class="btn primary" id="wf-next">Nächstes Level</button><button class="btn" id="wf-lib">Bibliothek</button></div>`;
      ctx.container.appendChild(ov);
      document.getElementById('wf-next')!.onclick = () => { ov.remove(); level++; genLevel(); draw(); };
      document.getElementById('wf-lib')!.onclick = () => { location.hash = '#/'; };
    }
  }

  const onClick = (e: MouseEvent) => {
    if (wonLevel) return;
    const r0 = canvas.getBoundingClientRect();
    const s = Math.min(r0.width, r0.height) / (SIZE + 0.6);
    const ox = (r0.width - SIZE * s) / 2, oy = (r0.height - SIZE * s) / 2;
    const c = Math.floor((e.clientX - r0.left - ox) / s), r = Math.floor((e.clientY - r0.top - oy) / s);
    if (r < 0 || c < 0 || r >= SIZE || c >= SIZE) return;
    const last = selected[selected.length - 1];
    if (last && !adjacent(last, { r, c })) { msg = 'Kacheln müssen angrenzen.'; return; }
    if (alreadySel(r, c)) {
      // Rückgängig: letzte Kachel entfernen wenn es die letzte ist
      if (last && last.r === r && last.c === c) { selected.pop(); sfx.click(); }
      return;
    }
    selected.push({ r, c }); sfx.click();
    draw();
  };

  const onDbl = () => { submit(); draw(); };
  canvas.addEventListener('click', onClick);
  canvas.addEventListener('dblclick', onDbl);

  function draw() {
    const w = canvas.width, h = canvas.height;
    g.fillStyle = '#0b0e1a'; g.fillRect(0, 0, w, h);
    const s = Math.min(w, h) / (SIZE + 0.6);
    const ox = (w - SIZE * s) / 2, oy = (h - SIZE * s) / 2;
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
      const px = ox + c * s, py = oy + r * s;
      const sel = alreadySel(r, c);
      g.fillStyle = sel ? '#0a5f6e' : ice[r][c] ? '#1c3a55' : '#151b30';
      g.fillRect(px + 2, py + 2, s - 4, s - 4);
      if (ice[r][c] && !sel) { g.strokeStyle = 'rgba(120,200,255,0.6)'; g.strokeRect(px + 4, py + 4, s - 8, s - 8); }
      g.fillStyle = '#e8ecf7';
      g.font = `bold ${s * 0.4}px sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(letters[r][c], px + s / 2, py + s / 2);
    }
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.fillStyle = '#00e5ff'; g.font = `bold ${Math.max(16, s * 0.35)}px sans-serif`;
    g.fillText(chainWord().toUpperCase(), 16, h - 24);
    g.fillStyle = '#8b96b5'; g.font = '13px sans-serif';
    g.fillText(`${msg}  ·  Doppelklick: Wort prüfen  ·  Level ${level}, geschmolzene Wörter: ${found}`, 16, h - 6);
  }

  genLevel();
  return {
    start() { draw(); },
    pause() { /* Denkspiel: keine laufende Simulation */ },
    resume() { draw(); },
    destroy() { canvas.removeEventListener('click', onClick); canvas.removeEventListener('dblclick', onDbl); unfit(); },
    getResult() { return { score: found * 50 + level * 100, won: wonLevel, detail: `Level ${level}` }; },
  };
}
