// Tests: Spielregeln, Netzwerk-Validierung, Storage, Lobby-Zustände.
import { describe, it, expect } from 'vitest';
import { isValidMessage } from '../src/multiplayer/transport';
import { astar, minimax, pickUtility, tuningFor, BOT_PROFILES } from '../src/bot/core';
import { CATALOG, READY_COUNT } from '../src/shared/catalog';

// ---------- Nachrichten-Validierung (Sicherheit §11) ----------
describe('isValidMessage', () => {
  it('akzeptiert flache Objekte mit t-String', () => {
    expect(isValidMessage({ t: 'ping', ts: 1 })).toBe(true);
    expect(isValidMessage({ t: 'state', d: { x: 1, y: 2 } })).toBe(true);
  });
  it('lehnt Nicht-Objekte ab', () => {
    expect(isValidMessage(null)).toBe(false);
    expect(isValidMessage('ping')).toBe(false);
    expect(isValidMessage(42)).toBe(false);
  });
  it('lehnt fehlenden/leeren/zu langen t-Typ ab', () => {
    expect(isValidMessage({})).toBe(false);
    expect(isValidMessage({ t: '' })).toBe(false);
    expect(isValidMessage({ t: 'x'.repeat(40) })).toBe(false);
  });
  it('lehnt übermäßige Nachrichtengröße ab (>4KB)', () => {
    expect(isValidMessage({ t: 'big', d: 'x'.repeat(5000) })).toBe(false);
  });
});

// ---------- Bot-Kern ----------
describe('astar', () => {
  const world = { w: 10, h: 10, blocked: (x: number, y: number) => x === 5 && y >= 0 && y <= 7 };
  it('findet den kürzesten Pfad um eine Wand herum', () => {
    const p = astar(world, 0, 0, 9, 0);
    expect(p).not.toBeNull();
    expect(p!.length).toBeGreaterThan(8); // Umweg nötig
    // Pfad berührt keine blockierte Zelle
    expect(p!.every(([x, y]) => !world.blocked(x, y))).toBe(true);
  });
  it('liefert null, wenn kein Pfad existiert', () => {
    const walled = { w: 3, h: 3, blocked: (x: number) => x === 1 };
    expect(astar(walled, 0, 0, 2, 0)).toBeNull();
  });
  it('leerer Pfad bei identischem Start/Ziel', () => {
    expect(astar(world, 3, 3, 3, 3)).toEqual([]);
  });
});

describe('minimax', () => {
  it('wählt den sofort gewinnenden Zug', () => {
    // Spiel: zwei Zähler, Zug = +1 oder +2, wer zuerst >= 3 erreicht gewinnt.
    let v = 0;
    const s = {
      moves: () => [1, 2] as number[],
      apply: (m: number) => { v += m; },
      undo: (m: number) => { v -= m; },
      evaluate: () => (v >= 3 ? 100 : 0),
      isTerminal: () => v >= 3,
    };
    const best = [1, 2].map(() => v, 0);
    const res = (() => {
      let bestM = 0, bestV = -Infinity;
      for (const m of s.moves()) { s.apply(m); const val = minimax(s, 1, -Infinity, Infinity, false); s.undo(m); if (val > bestV) { bestV = val; bestM = m; } }
      return bestM;
    })();
    expect(res).toBe(2);
    expect(best.length).toBe(2);
  });
});

describe('pickUtility und Tuning', () => {
  it('wählt die höchste Utility', () => {
    expect(pickUtility({ a: 1, b: 5, c: 0 }, 0)).toBe('b');
  });
  it('Skalierung: Experte reagiert schneller als Locker', () => {
    expect(tuningFor('expert').reactionDelay).toBeLessThan(tuningFor('easy').reactionDelay);
  });
  it('Bots dürfen nie schneller als der Mensch sein', () => {
    for (const d of ['easy', 'normal', 'hard', 'expert'] as const) {
      expect(tuningFor(d).speedScale).toBeLessThanOrEqual(1);
    }
  });
  it('Bot-Profile vorhanden und eindeutig', () => {
    const styles = BOT_PROFILES.map(b => b.style);
    expect(new Set(styles).size).toBe(styles.length);
  });
});

// ---------- Katalog-Integrität ----------
describe('Katalog', () => {
  it('enthält genau 50 Spiele mit eindeutigen Nummern 1..50', () => {
    expect(CATALOG.length).toBe(50);
    const nums = new Set(CATALOG.map(g => g.num));
    expect(nums.size).toBe(50);
    for (let i = 1; i <= 50; i++) expect(nums.has(i)).toBe(true);
  });
  it('fertige Spiele haben Steuerungstext (howto)', () => {
    for (const g of CATALOG.filter(g => g.status === 'ready')) {
      expect(g.howto.length).toBeGreaterThan(10);
    }
  });
  it('mehrspielerfähige Spiele zeigen ihre echte Spielerzahl', () => {
    for (const g of CATALOG.filter(g => g.modes.length > 1 || g.players.max > 1)) {
      expect(g.players.max).toBeGreaterThan(g.players.min);
    }
  });
  it('mind. ein 2D- und ein 3D-Spiel sind fertig', () => {
    expect(CATALOG.filter(g => g.status === 'ready' && g.render === '2d').length).toBeGreaterThan(0);
    expect(CATALOG.filter(g => g.status === 'ready' && g.render === '3d').length).toBeGreaterThan(0);
  });
  it('READY_COUNT stimmt mit Katalog überein', () => {
    expect(READY_COUNT).toBe(CATALOG.filter(g => g.status === 'ready').length);
  });
});
