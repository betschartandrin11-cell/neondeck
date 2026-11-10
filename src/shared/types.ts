// NEONDECK – zentrale Typen. Jedes Spiel implementiert GameInstance über die
// unten definierte Factory. Die Plattform kennt außer diesen Typen keine
// Spiel-Interna (saubere Grenze zwischen Plattform und Spielen).

export type Difficulty = 'easy' | 'normal' | 'hard' | 'expert';
export type Genre = 'arcade' | 'strategie' | 'multiplayer' | '3d' | 'raetsel';
export type RenderMode = '2d' | '3d';
export type PlayerMode = 'single' | 'local-mp' | 'p2p-mp';

export interface GameMeta {
  id: string;            // z.B. 'neon-dash'
  num: number;           // 1..50
  title: string;
  desc: string;          // 1 Satz für die Karten
  genre: Genre;
  render: RenderMode;
  players: { min: number; max: number };
  modes: PlayerMode[];   // unterstützte Spielmodi
  bots: boolean;         // unterstützt Bot-Gegner?
  howto: string;         // Steuerung/Regeln (Hilfe-Seite)
}

/** Lebenszyklus-Schnittstelle, die jedes Spiel erfüllen muss (siehe README §Schnittstelle). */
export interface GameInstance {
  start(): void;
  pause(): void;
  resume(): void;
  destroy(): void; // gibt Listener, Timer, Audio, WebGL-Kontexte frei
  /** Kann von der Plattform angefragt werden, z.B. für Statistik/Ergebnisanzeige. */
  getResult?(): { score?: number; won?: boolean; detail?: string } | null;
}

export interface GameContext {
  /** Container-Element im DOM, in dem das Spiel rendert. */
  container: HTMLElement;
  difficulty: Difficulty;
  /** Persistenz-Helfer (lokal, pro Spiel geprefixt). */
  storage: SimpleStore;
  sound: SoundPrefs;
  reducedMotion: boolean;
}

export interface SimpleStore {
  get<T>(key: string): T | null;
  set(key: string, value: unknown): void;
}

export interface SoundPrefs {
  sfx: number;  // 0..1
  music: number; // 0..1
}

export type GameFactory = (ctx: GameContext) => GameInstance;
