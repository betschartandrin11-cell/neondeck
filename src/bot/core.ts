// NEONDECK – Gemeinsame Bot-Grundarchitektur (Phase 3).
// Kein Zufalls-Spam: Bots nutzen FSFMs, Utility-Scores oder Minimax je nach Spiel.
// Grundregel: Bots sehen nur, was ein Mensch an ihrer Position sehen könnte
// (kein Wand-Blick, keine versteckten Infos), und ihre Reaktionszeit ist
// bewusst begrenzt (reactionDelay in Sekunden).
import type { Difficulty } from '../shared/types';

export interface BotProfile {
  name: string;
  style: 'defensiv' | 'aggressiv' | 'vorsichtig' | 'taktisch' | 'chaotisch';
}

export const BOT_PROFILES: BotProfile[] = [
  { name: 'BR-7 "Schild"', style: 'defensiv' },
  { name: 'RDX "Hammer"', style: 'aggressiv' },
  { name: 'K-9 "Schatten"', style: 'vorsichtig' },
  { name: 'OR-1 "Schach"', style: 'taktisch' },
  { name: 'GLiTCH', style: 'chaotisch' },
];

/** Tuning-Parameter je Schwierigkeit. Wird von jedem Spiel interpretiert. */
export interface BotTuning {
  reactionDelay: number; // Sekunden
  mistakeRate: number;   // 0..1 Wahrscheinlichkeit für bewussten Fehler
  lookahead: number;     // Planungstiefe (Schritte / Suchtiefe)
  speedScale: number;    // Geschwindigkeitsfaktor (max 1.0, nie schneller als Mensch)
}
export function tuningFor(d: Difficulty): BotTuning {
  switch (d) {
    case 'easy': return { reactionDelay: 0.45, mistakeRate: 0.25, lookahead: 1, speedScale: 0.8 };
    case 'normal': return { reactionDelay: 0.25, mistakeRate: 0.12, lookahead: 2, speedScale: 0.92 };
    case 'hard': return { reactionDelay: 0.12, mistakeRate: 0.05, lookahead: 4, speedScale: 1.0 };
    case 'expert': return { reactionDelay: 0.07, mistakeRate: 0.02, lookahead: 6, speedScale: 1.0 };
  }
}
/** Einfache FSM: Zustandsmaschine mit zeitbasiertem Übergang. */
export class FSM<S extends string> {
  private t = 0;
  constructor(public state: S, private dur = new Map<S, number>()) {}
  update(dt: number): S {
    this.t += dt;
    const limit = this.dur.get(this.state);
    if (limit !== undefined && this.t >= limit) { this.t = 0; return this.state; } // bleibt, Spiel steuert Übergang
    return this.state;
  }
  to(next: S) { this.state = next; this.t = 0; }
  get timeInState() { return this.t; }
}

/** Utility-Auswahl: wähle die Aktion mit dem höchsten Score (+ Rauschen). */
export function pickUtility<T extends string>(scores: Record<T, number>, noise = 0.1): T {
  let best = Object.keys(scores)[0] as T;
  let bestVal = -Infinity;
  for (const k of Object.keys(scores) as T[]) {
    const v = scores[k] + (Math.random() * 2 - 1) * noise;
    if (v > bestVal) { bestVal = v; best = k; }
  }
  return best;
}

// ---------- A*-Pfadsuche auf Rastern (Kostengewichte: 0 = blockiert) ----------
export interface GridWorld { w: number; h: number; blocked(x: number, y: number): boolean; }
interface Node { x: number; y: number; g: number; f: number; parent?: Node; }

export function astar(world: GridWorld, sx: number, sy: number, tx: number, ty: number): Array<[number, number]> | null {
  if (sx === tx && sy === ty) return [];
  const open: Node[] = [{ x: sx, y: sy, g: 0, f: Math.abs(tx - sx) + Math.abs(ty - sy) }];
  const seen = new Map<string, number>([[`${sx},${sy}`, 0]]);
  while (open.length) {
    open.sort((a, b) => a.f - b.f);
    const cur = open.shift()!;
    if (cur.x === tx && cur.y === ty) {
      const path: Array<[number, number]> = [];
      let n: Node | undefined = cur;
      while (n && n.parent) { path.unshift([n.x, n.y]); n = n.parent; }
      return path;
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (nx < 0 || ny < 0 || nx >= world.w || ny >= world.h || world.blocked(nx, ny)) continue;
      const g = cur.g + 1;
      const k = `${nx},${ny}`;
      if (g < (seen.get(k) ?? Infinity)) {
        seen.set(k, g);
        open.push({ x: nx, y: ny, g, f: g + Math.abs(tx - nx) + Math.abs(ty - ny), parent: cur });
      }
    }
  }
  return null;
}

/** Minimax mit Alpha-Beta auf beliebigen Zug-Spielen (z.B. Hexa Conquest). */
export interface GameState<GMove> {
  moves(): GMove[];
  apply(m: GMove): void;
  undo(m: GMove): void;
  /** Bewertung aus Sicht des ziehenden Spielers. */
  evaluate(): number;
  isTerminal(): boolean;
}
export function minimax<GMove>(s: GameState<GMove>, depth: number, alpha = -Infinity, beta = Infinity, maxing = true): number {
  if (depth === 0 || s.isTerminal()) return s.evaluate();
  const moves = s.moves();
  if (maxing) {
    let v = -Infinity;
    for (const m of moves) {
      s.apply(m); v = Math.max(v, minimax(s, depth - 1, alpha, beta, false)); s.undo(m);
      alpha = Math.max(alpha, v);
      if (beta <= alpha) break;
    }
    return v;
  }
  let v = Infinity;
  for (const m of moves) {
    s.apply(m); v = Math.min(v, minimax(s, depth - 1, alpha, beta, true)); s.undo(m);
    beta = Math.min(beta, v);
    if (beta <= alpha) break;
  }
  return v;
}
export function bestMove<GMove>(s: GameState<GMove>, depth: number): GMove | null {
  let best: GMove | null = null;
  let bestVal = -Infinity;
  for (const m of s.moves()) {
    s.apply(m);
    const v = minimax(s, depth - 1, -Infinity, Infinity, false);
    s.undo(m);
    if (v > bestVal) { bestVal = v; best = m; }
  }
  return best;
}
